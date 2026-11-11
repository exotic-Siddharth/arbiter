"""Arbiter sandbox harness (spec sections 8.3 and 8.4). Python 3.11 standard library only.

Runs inside a throwaway container as root (with almost every capability dropped), as a child of
tini (PID 1, `docker run --init`). It reads JSON-lines commands on stdin and writes JSON-lines
events on stdout; nothing else ever reaches stdout. The compiler and the submitted program run as
the unprivileged user `runner` (uid/gid 10001) with cwd /work, in a fresh session per test.

Commands (worker -> harness):
  {"type":"init","sourceFile","source"(b64),"compile":[...]|null,"run":[...],"cpuLimitMs",
   "wallLimitMs","memoryLimitKb","outputLimitBytes","rlimitAsKb"?}
  {"type":"run","id","input"(b64)}
  {"type":"exit"}
Events (harness -> worker):
  {"type":"ready","version":1,"pid":N}
  {"type":"compiled","ok","output"(b64),"timeMs"}
  {"type":"result","id","status","exitCode","signal","cpuMs","wallMs","maxRssKb","stdout"(b64),
   "stderr"(b64),"outputLimitExceeded","wallKilled"}
  {"type":"error","message"}

Expected outputs never enter the container: the worker compares outputs itself.
"""

import base64
import json
import math
import os
import re
import resource
import signal
import subprocess
import sys
import threading
import time

PROTOCOL_VERSION = 1
RUNNER_UID = 10001
RUNNER_GID = 10001
WORK_DIR = "/work"

COMPILE_WALL_S = 15.0
COMPILE_OUTPUT_BYTES = 16 * 1024
STDERR_TAIL_BYTES = 2 * 1024
FSIZE_BYTES = 16 * 1024 * 1024
COMPILE_FSIZE_BYTES = 64 * 1024 * 1024
RUN_NOFILE = 128
COMPILE_NOFILE = 256
READ_CHUNK = 64 * 1024

MLE_STDERR = re.compile(
    rb"std::bad_alloc|MemoryError|OutOfMemoryError|JavaScript heap out of memory"
    rb"|Array buffer allocation failed"
)

CHILD_ENV = {
    "PATH": "/usr/local/bin:/usr/bin:/bin",
    "HOME": "/tmp",
    "LANG": "C.UTF-8",
    "LC_ALL": "C.UTF-8",
    "TMPDIR": "/tmp",
}

_out_lock = threading.Lock()


def emit(event):
    """Write one protocol event. The only writer of fd 1."""
    data = (json.dumps(event, separators=(",", ":")) + "\n").encode("utf-8")
    with _out_lock:
        view = memoryview(data)
        while view:
            written = os.write(1, view)
            view = view[written:]


def b64(data):
    return base64.b64encode(data).decode("ascii")


def container_memory_kb():
    """memory.max of this container's cgroup (v2), in KB; None when unlimited or unknown."""
    for path in ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"):
        try:
            with open(path, "r", encoding="ascii") as handle:
                value = handle.read().strip()
        except OSError:
            continue
        if value.isdigit():
            return int(value) // 1024
        return None
    return None


def signal_name(number):
    try:
        return signal.Signals(number).name
    except ValueError:
        return "SIG%d" % number


def make_preexec(cpu_seconds, fsize_bytes, nofile, as_bytes):
    """Runs in the forked child before exec. Must not start threads or take locks."""

    def preexec():
        # The cgroup OOM killer must pick user code, never the harness.
        with open("/proc/self/oom_score_adj", "w", encoding="ascii") as handle:
            handle.write("1000")
        os.setgroups([])
        os.setgid(RUNNER_GID)
        os.setuid(RUNNER_UID)
        if cpu_seconds is not None:
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        resource.setrlimit(resource.RLIMIT_FSIZE, (fsize_bytes, fsize_bytes))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        resource.setrlimit(resource.RLIMIT_NOFILE, (nofile, nofile))
        try:
            resource.setrlimit(
                resource.RLIMIT_STACK, (resource.RLIM_INFINITY, resource.RLIM_INFINITY)
            )
        except (ValueError, OSError):
            _, hard = resource.getrlimit(resource.RLIMIT_STACK)
            resource.setrlimit(resource.RLIMIT_STACK, (hard, hard))
        if as_bytes is not None:
            resource.setrlimit(resource.RLIMIT_AS, (as_bytes, as_bytes))

    return preexec


def runner_pids():
    """Live (non-zombie) processes owned by the runner uid."""
    pids = []
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        try:
            with open("/proc/%s/status" % entry, "r", encoding="ascii", errors="replace") as fh:
                status = fh.read()
        except OSError:
            continue
        uid_line = re.search(r"^Uid:\s+(\d+)", status, re.M)
        state = re.search(r"^State:\s+(\S)", status, re.M)
        if uid_line and int(uid_line.group(1)) == RUNNER_UID and not (
            state and state.group(1) in ("Z", "X")
        ):
            pids.append(int(entry))
    return pids


def kill_all_runner_processes():
    """Kill every runner process, including ones that escaped the test's session (setsid,
    double fork). kill(-1) issued *as runner* is atomic in the kernel and cannot reach root
    processes, so a short-lived forked helper does it; the harness never changes its own uid."""
    for _ in range(50):
        pids = runner_pids()
        if not pids:
            return
        for pid in pids:
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                pass
        try:
            helper = os.fork()
        except OSError:
            helper = -1
        if helper == 0:
            try:
                os.setgroups([])
                os.setgid(RUNNER_GID)
                os.setuid(RUNNER_UID)
                os.kill(-1, signal.SIGKILL)
            finally:
                os._exit(0)
        elif helper > 0:
            try:
                os.waitpid(helper, 0)
            except ChildProcessError:
                pass
        time.sleep(0.005)


def kill_group(pgid):
    try:
        os.killpg(pgid, signal.SIGKILL)
    except OSError:
        pass


class Capture:
    """Reads a pipe in a thread: keeps the head up to `limit` bytes (or the tail when
    `keep_tail`), and calls `on_overflow` once if more than `limit` bytes arrive."""

    def __init__(self, stream, limit, keep_tail=False, on_overflow=None):
        self.stream = stream
        self.limit = limit
        self.keep_tail = keep_tail
        self.on_overflow = on_overflow
        self.buffer = bytearray()
        self.total = 0
        self.overflowed = False
        self.thread = threading.Thread(target=self._read, daemon=True)

    def start(self):
        self.thread.start()
        return self

    def _read(self):
        fd = self.stream.fileno()
        try:
            while True:
                chunk = os.read(fd, READ_CHUNK)
                if not chunk:
                    break
                self.total += len(chunk)
                if self.keep_tail:
                    self.buffer += chunk
                    if len(self.buffer) > self.limit:
                        del self.buffer[: len(self.buffer) - self.limit]
                elif not self.overflowed:
                    room = self.limit - len(self.buffer)
                    self.buffer += chunk[:room]
                    if len(chunk) > room:
                        self.overflowed = True
                        if self.on_overflow is not None:
                            self.on_overflow()
        except OSError:
            pass
        finally:
            try:
                self.stream.close()
            except OSError:
                pass

    def join(self, timeout=None):
        self.thread.join(timeout)


def feed_stdin(stream, data):
    try:
        view = memoryview(data)
        fd = stream.fileno()
        while view:
            written = os.write(fd, view[: READ_CHUNK * 4])
            view = view[written:]
    except OSError:
        pass  # the program exited or closed stdin early: not an error
    finally:
        try:
            stream.close()
        except OSError:
            pass


def execute(argv, stdin_data, cpu_seconds, wall_s, fsize_bytes, nofile, as_bytes, out_limit,
            merge_stderr):
    """Run argv as runner in /work in a new session; returns a dict of raw facts."""
    started = time.monotonic()
    proc = subprocess.Popen(
        argv,
        cwd=WORK_DIR,
        env=CHILD_ENV,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT if merge_stderr else subprocess.PIPE,
        start_new_session=True,
        close_fds=True,
        preexec_fn=make_preexec(cpu_seconds, fsize_bytes, nofile, as_bytes),
    )
    pid = proc.pid
    flags = {"ole": False, "wall": False}

    def on_overflow():
        flags["ole"] = True
        kill_group(pid)

    # I/O threads start only after Popen returned (preexec_fn is not thread-safe).
    out = Capture(proc.stdout, out_limit, on_overflow=on_overflow).start()
    err = None
    if not merge_stderr:
        err = Capture(proc.stderr, STDERR_TAIL_BYTES, keep_tail=True).start()
    writer = threading.Thread(target=feed_stdin, args=(proc.stdin, stdin_data), daemon=True)
    writer.start()

    def on_wall():
        flags["wall"] = True
        kill_group(pid)

    timer = threading.Timer(wall_s, on_wall)
    timer.daemon = True
    timer.start()
    try:
        _, status, usage = os.wait4(pid, 0)
    finally:
        timer.cancel()
    wall_ms = int((time.monotonic() - started) * 1000)
    proc.returncode = status  # reaped here; keep Popen from waiting again

    # Leftover processes (background children, setsid escapes) die before the next test.
    kill_group(pid)
    kill_all_runner_processes()
    writer.join(5)
    out.join(5)
    if err is not None:
        err.join(5)
    timer.join(1)

    exit_code = None
    sig = None
    if os.WIFSIGNALED(status):
        sig = signal_name(os.WTERMSIG(status))
    elif os.WIFEXITED(status):
        exit_code = os.WEXITSTATUS(status)
    return {
        "exitCode": exit_code,
        "signal": sig,
        "cpuMs": int(round((usage.ru_utime + usage.ru_stime) * 1000)),
        "wallMs": wall_ms,
        "maxRssKb": int(usage.ru_maxrss),
        "stdout": bytes(out.buffer),
        "stderr": bytes(err.buffer) if err is not None else b"",
        "outputLimitExceeded": flags["ole"],
        "wallKilled": flags["wall"],
    }


def classify(facts, limits, is_java, container_kb):
    """Raw status, checked in order OLE > MLE > TLE > RE > OK (spec 8.3, resolution R17).
    The worker re-derives the same status from these facts (apps/api/src/judge/verdict.ts)."""
    if facts["outputLimitExceeded"]:
        return "OLE"
    sig = facts["signal"]
    code = facts["exitCode"]
    failed = sig is not None or (code is not None and code != 0)
    rss = facts["maxRssKb"]
    if rss > limits["memoryLimitKb"]:
        return "MLE"
    if sig == "SIGKILL" and container_kb and rss >= 0.9 * container_kb:
        return "MLE"
    if failed and MLE_STDERR.search(facts["stderr"]):
        return "MLE"
    if is_java and code == 3:
        return "MLE"
    if facts["cpuMs"] > limits["cpuLimitMs"] or facts["wallKilled"] or sig == "SIGXCPU":
        return "TLE"
    if failed:
        return "RE"
    return "OK"


class Harness:
    def __init__(self):
        self.config = None
        self.compiled = False
        self.container_kb = container_memory_kb()

    def handle(self, message):
        kind = message.get("type")
        if kind == "init":
            self.init(message)
        elif kind == "run":
            self.run(message)
        elif kind == "exit":
            kill_all_runner_processes()
            return False
        else:
            emit({"type": "error", "message": "unknown command type: %r" % (kind,)})
        return True

    def init(self, message):
        if self.config is not None:
            emit({"type": "error", "message": "init was already received"})
            return
        source_file = message["sourceFile"]
        if not re.fullmatch(r"[A-Za-z0-9_]+\.[a-z]+", source_file):
            emit({"type": "error", "message": "invalid sourceFile"})
            return
        self.config = {
            "run": [str(part) for part in message["run"]],
            "cpuLimitMs": int(message["cpuLimitMs"]),
            "wallLimitMs": int(message["wallLimitMs"]),
            "memoryLimitKb": int(message["memoryLimitKb"]),
            "outputLimitBytes": int(message["outputLimitBytes"]),
            "rlimitAsKb": message.get("rlimitAsKb"),
        }
        path = os.path.join(WORK_DIR, source_file)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o644)
        with os.fdopen(fd, "wb") as handle:
            handle.write(base64.b64decode(message["source"]))
        os.chmod(path, 0o644)

        compile_cmd = message.get("compile")
        if not compile_cmd:
            self.compiled = True
            emit({"type": "compiled", "ok": True, "output": "", "timeMs": 0})
            return
        facts = execute(
            [str(part) for part in compile_cmd],
            b"",
            cpu_seconds=int(COMPILE_WALL_S) + 5,
            wall_s=COMPILE_WALL_S,
            fsize_bytes=COMPILE_FSIZE_BYTES,
            nofile=COMPILE_NOFILE,
            as_bytes=None,
            out_limit=COMPILE_OUTPUT_BYTES,
            merge_stderr=True,
        )
        ok = facts["exitCode"] == 0 and not facts["wallKilled"]
        output = facts["stdout"]
        if facts["wallKilled"]:
            output += b"\nCompilation timed out after %d s." % int(COMPILE_WALL_S)
        elif facts["signal"] is not None:
            output += b"\nThe compiler was killed by %s." % facts["signal"].encode("ascii")
        self.compiled = ok
        emit({"type": "compiled", "ok": ok, "output": b64(output), "timeMs": facts["wallMs"]})

    def run(self, message):
        test_id = str(message.get("id"))
        if self.config is None or not self.compiled:
            emit({"type": "error", "message": "run before a successful init/compile"})
            return
        cfg = self.config
        stdin_data = base64.b64decode(message.get("input", ""))
        as_kb = cfg["rlimitAsKb"]
        facts = execute(
            cfg["run"],
            stdin_data,
            cpu_seconds=int(math.ceil(cfg["cpuLimitMs"] / 1000.0)) + 1,
            wall_s=cfg["wallLimitMs"] / 1000.0,
            fsize_bytes=FSIZE_BYTES,
            nofile=RUN_NOFILE,
            as_bytes=int(as_kb) * 1024 if as_kb else None,
            out_limit=cfg["outputLimitBytes"],
            merge_stderr=False,
        )
        is_java = os.path.basename(cfg["run"][0]) == "java"
        status = classify(facts, cfg, is_java, self.container_kb)
        emit(
            {
                "type": "result",
                "id": test_id,
                "status": status,
                "exitCode": facts["exitCode"],
                "signal": facts["signal"],
                "cpuMs": facts["cpuMs"],
                "wallMs": facts["wallMs"],
                "maxRssKb": facts["maxRssKb"],
                "stdout": b64(facts["stdout"]),
                "stderr": b64(facts["stderr"]),
                "outputLimitExceeded": facts["outputLimitExceeded"],
                "wallKilled": facts["wallKilled"],
            }
        )


def main():
    emit({"type": "ready", "version": PROTOCOL_VERSION, "pid": os.getpid()})
    harness = Harness()
    stdin = sys.stdin.buffer
    while True:
        line = stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
            if not isinstance(message, dict):
                raise ValueError("command must be a JSON object")
            if not harness.handle(message):
                break
        except Exception as error:  # report, never crash: the worker maps this to IE
            emit({"type": "error", "message": "%s: %s" % (type(error).__name__, error)})
    kill_all_runner_processes()


if __name__ == "__main__":
    main()
