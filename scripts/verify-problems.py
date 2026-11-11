#!/usr/bin/env python3
"""Validate Arbiter seed problems, running every program inside Docker.

Usage (from any directory):
    python scripts/verify-problems.py <slug> [<slug> ...]
    python scripts/verify-problems.py --all
Options:
    --root DIR        problems root (default: seed/problems)
    --no-docker       static checks only (meta.json, problem.md, test files)
    --cpp-image IMG   image that compiles and runs ref.cpp
    --py-image IMG    image that runs ref.py, slow.py and wrong.py (must be Python 3.11)

Default images: arbiter-sandbox:latest for both when it exists (its entrypoint is
overridden), else gcc:14 for C++ and python:3.11-slim for Python.

For each problem folder seed/problems/<slug>/ it checks:
  static   meta.json schema, problem.md sections, required files, tests 01..NN (10-14 of
           them, each with .in and .out), inputs <= 1 MiB, LF only (no CR) in every text file;
  ref.cpp  compiled with g++ -std=gnu++17 -O2 -pipe (as the judge does); on every test the
           output passes the problem's checker and the CPU time is <= 0.5 x timeLimitMs;
  ref.py   Python 3.11; on every test the output equals NN.out byte for byte, CPU time is
           <= 1.5 x timeLimitMs and peak RSS <= (memoryLimitMb + 16) MiB;
  slow.py  (optional) correct on the tests it finishes within 6 x timeLimitMs of CPU (run
           smallest first), and exceeds 6 x timeLimitMs (twice the judge's 3x Python budget)
           on the largest test;
  wrong.py (optional) passes both samples and fails at least one hidden test.

Sources and tests are piped into one container per problem and language as a tar stream
over stdin (no bind mounts), so the container start is paid once. Times are CPU times
(user + sys of the child, from wait4), which stay stable on a busy machine.
Prints one table row per problem and exits 1 on any failure. Standard library only.
The folder protocol is documented in seed/problems/README.md.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ROOT = REPO_ROOT / "seed" / "problems"
MAX_INPUT_BYTES = 1 << 20
MIN_TESTS, MAX_TESTS = 10, 14
TEST_FILE = re.compile(r"^(\d{2})\.(in|out|md)$")
REQUIRED_FILES = ("problem.md", "meta.json", "gen.py", "ref.py", "ref.cpp")
OPTIONAL_PROGRAMS = ("slow.py", "wrong.py")
META_KEYS = {"slug", "title", "difficulty", "tags", "timeLimitMs", "memoryLimitMb", "checker", "floatTolerance", "samples"}
DIFFICULTIES = ("EASY", "MEDIUM", "HARD")
CHECKERS = ("TOKENS", "EXACT", "FLOAT")
TAGS = (
    "hashing", "stack", "prefix-sums", "binary-search", "two-pointers", "greedy", "sorting", "bfs",
    "graphs", "shortest-paths", "dp", "lis", "union-find", "heap", "data-structures", "fenwick-tree",
    "segment-tree", "strings", "string-matching", "topological-sort", "math", "geometry", "implementation",
)
SECTIONS = ("## Input", "## Output", "## Constraints")
OPTIONAL_SECTIONS = ("## Notes",)
PY_MEMORY_OVERHEAD_MB = 16  # spec section 8.5
REF_PY_FACTOR = 1.5  # ref.py CPU budget, x timeLimitMs
REF_CPP_FACTOR = 0.5  # ref.cpp CPU budget, x timeLimitMs
SLOW_FACTOR = 6.0  # slow.py must exceed this, x timeLimitMs (2 x the judge's 3x Python budget)
CONTAINER_TIMEOUT_S = 1800

# Runs inside the container (Python 3.11 or the gcc image's 3.13): stdlib only.
RUNNER = r'''
import json, math, os, re, resource, signal, subprocess, sys, tempfile, threading, time

WORK = os.path.dirname(os.path.abspath(__file__))
job = json.load(open(os.path.join(WORK, "job.json")))
TL = job["timeLimitMs"]
tests = job["tests"]  # [{"name": "01", "size": n, "sample": bool}]


NUMBER = re.compile(rb"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$")  # as in judge/checker.ts


def numeric(token):
    if not NUMBER.match(token):
        return None
    value = float(token)
    return value if math.isfinite(value) else None


def check(out, exp):
    checker = job["checker"]
    if checker == "EXACT":
        def norm(data):
            lines = [line.rstrip() for line in data.decode("utf-8", "replace").replace("\r\n", "\n").split("\n")]
            while lines and lines[-1] == "":
                lines.pop()
            return lines
        return norm(out) == norm(exp)
    a, b = out.split(), exp.split()
    if checker == "TOKENS":
        return a == b
    if len(a) != len(b):
        return False
    tol = job["floatTolerance"]
    for x, y in zip(a, b):
        fx, fy = numeric(x), numeric(y)
        if fx is None or fy is None:
            if x != y:
                return False
        elif not (abs(fx - fy) <= tol or abs(fx - fy) <= tol * abs(fy)):
            return False
    return True


def run(cmd, name, cpu_cap_ms):
    cap_s = max(1, math.ceil(cpu_cap_ms / 1000.0))

    def limits():
        resource.setrlimit(resource.RLIMIT_CPU, (cap_s, cap_s + 1))

    with open(os.path.join(WORK, "tests", name + ".in"), "rb") as fin, \
            tempfile.TemporaryFile() as fout, tempfile.TemporaryFile() as ferr:
        started = time.monotonic()
        proc = subprocess.Popen(cmd, stdin=fin, stdout=fout, stderr=ferr, cwd=WORK, preexec_fn=limits)
        killed = []

        def kill():
            killed.append(True)
            try:
                os.kill(proc.pid, signal.SIGKILL)
            except OSError:
                pass

        timer = threading.Timer(cap_s * 4 + 10, kill)
        timer.start()
        _, status, usage = os.wait4(proc.pid, 0)
        timer.cancel()
        proc.returncode = os.waitstatus_to_exitcode(status)
        wall_ms = (time.monotonic() - started) * 1000
        fout.seek(0)
        ferr.seek(0)
        out, err = fout.read(), ferr.read()
    cpu_ms = (usage.ru_utime + usage.ru_stime) * 1000
    code = proc.returncode
    if killed or code in (-signal.SIGXCPU, -signal.SIGKILL) or cpu_ms > cpu_cap_ms:
        verdict = "TLE"
    elif code != 0:
        verdict = "RE"
    else:
        expected = open(os.path.join(WORK, "tests", name + ".out"), "rb").read()
        verdict = "AC" if check(out, expected) else "WA"
        if verdict == "AC" and job["exactRef"] and out.replace(b"\r\n", b"\n") != expected:
            verdict = "DIFF"  # token-equal but not byte-equal to the committed .out
    return {
        "test": name, "verdict": verdict, "cpuMs": round(cpu_ms), "wallMs": round(wall_ms),
        "rssKb": usage.ru_maxrss, "exitCode": code, "stderr": err[-600:].decode("utf-8", "replace"),
    }


result = {"python": "%d.%d.%d" % sys.version_info[:3], "programs": {}}
for prog in job["programs"]:
    entry = {"runs": []}
    result["programs"][prog["name"]] = entry
    if prog.get("compile"):
        started = time.monotonic()
        comp = subprocess.run(prog["compile"], cwd=WORK, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        entry["compileMs"] = round((time.monotonic() - started) * 1000)
        if comp.returncode != 0:
            entry["compileError"] = comp.stdout[-2000:].decode("utf-8", "replace")
            continue
    order = list(tests)
    if prog["mode"] == "slow":
        order.sort(key=lambda t: (t["size"], t["name"]))
    largest = max(tests, key=lambda t: (t["size"], t["name"]))["name"]
    gave_up = False
    for t in order:
        if prog["mode"] == "slow" and gave_up and t["name"] != largest:
            entry["runs"].append({"test": t["name"], "verdict": "SKIPPED"})
            continue
        r = run(prog["run"], t["name"], prog["cpuCapMs"])
        entry["runs"].append(r)
        if prog["mode"] == "slow" and r["verdict"] == "TLE":
            gave_up = True
    entry["largest"] = largest
json.dump(result, sys.stdout)
'''

BOOTSTRAP = (
    "import io,sys,tarfile,tempfile,runpy;"
    "d=tempfile.mkdtemp(prefix='verify-');"
    "tarfile.open(fileobj=io.BytesIO(sys.stdin.buffer.read()),mode='r:').extractall(d);"
    "runpy.run_path(d+'/runner.py',run_name='__main__')"
)


class Report:
    def __init__(self, slug: str) -> None:
        self.slug = slug
        self.errors: list[str] = []
        self.cells: dict[str, str] = {"tests": "-", "static": "-", "ref.cpp": "-", "ref.py": "-", "slow.py": "-", "wrong.py": "-"}

    def fail(self, message: str) -> None:
        self.errors.append(message)


# ---------------------------------------------------------------- static checks

def check_meta(problem_dir: Path, report: Report) -> dict | None:
    try:
        meta = json.loads((problem_dir / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        report.fail(f"meta.json: {error}")
        return None
    if not isinstance(meta, dict):
        report.fail("meta.json must be an object")
        return None
    unknown = set(meta) - META_KEYS
    if unknown:
        report.fail(f"meta.json: unknown keys {sorted(unknown)}")
    missing = (META_KEYS - {"floatTolerance"}) - set(meta)
    if missing:
        report.fail(f"meta.json: missing keys {sorted(missing)}")
        return None
    if meta["slug"] != problem_dir.name:
        report.fail(f"meta.json: slug {meta['slug']!r} differs from the folder name {problem_dir.name!r}")
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", str(meta["slug"])):
        report.fail("meta.json: slug must be lower-case kebab-case")
    if not isinstance(meta["title"], str) or not meta["title"].strip() or len(meta["title"]) > 60:
        report.fail("meta.json: title must be a non-empty string of at most 60 characters")
    if meta["difficulty"] not in DIFFICULTIES:
        report.fail(f"meta.json: difficulty must be one of {DIFFICULTIES}")
    tags = meta["tags"]
    if not isinstance(tags, list) or not tags or len(set(tags)) != len(tags) or any(t not in TAGS for t in tags):
        report.fail(f"meta.json: tags must be a non-empty list of distinct tags from the vocabulary, got {tags!r}")
    for key, low, high in (("timeLimitMs", 100, 10000), ("memoryLimitMb", 16, 1024)):
        value = meta[key]
        if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
            report.fail(f"meta.json: {key} must be an integer in [{low}, {high}]")
    if meta["checker"] not in CHECKERS:
        report.fail(f"meta.json: checker must be one of {CHECKERS}")
    if meta["checker"] == "FLOAT":
        tol = meta.get("floatTolerance")
        if not isinstance(tol, (int, float)) or isinstance(tol, bool) or not 0 < tol < 1:
            report.fail("meta.json: a FLOAT problem needs floatTolerance in (0, 1)")
    elif "floatTolerance" in meta:
        report.fail("meta.json: floatTolerance is only allowed with the FLOAT checker")
    if meta["samples"] != [1, 2]:
        report.fail("meta.json: samples must be [1, 2]")
    return meta


def check_statement(problem_dir: Path, report: Report) -> None:
    text = (problem_dir / "problem.md").read_text(encoding="utf-8")
    headings = [line.strip() for line in text.split("\n") if line.startswith("#")]
    level2 = [h for h in headings if h.startswith("## ")]
    allowed = SECTIONS + OPTIONAL_SECTIONS
    for heading in level2:
        if heading not in allowed:
            report.fail(f"problem.md: unexpected section {heading!r} (samples live in tests/, resolution R9)")
    present = [h for h in level2 if h in SECTIONS]
    if present != list(SECTIONS):
        report.fail(f"problem.md: needs the sections {', '.join(SECTIONS)} once each, in this order")
    story = text.split("## Input", 1)[0]
    if len(re.sub(r"\s+", " ", story).strip()) < 80:
        report.fail("problem.md: the story before '## Input' is missing or too short")
    if "## Notes" in level2 and "## Constraints" in level2 and level2.index("## Notes") < level2.index("## Constraints"):
        report.fail("problem.md: '## Notes' must come after '## Constraints'")


def check_files(problem_dir: Path, report: Report) -> list[dict]:
    for name in REQUIRED_FILES:
        if not (problem_dir / name).is_file():
            report.fail(f"missing {name}")
    tests_dir = problem_dir / "tests"
    if not tests_dir.is_dir():
        report.fail("missing tests/")
        return []
    found: dict[str, set[str]] = {}
    for path in tests_dir.iterdir():
        match = TEST_FILE.match(path.name)
        if not match:
            report.fail(f"unexpected file tests/{path.name}")
            continue
        found.setdefault(match.group(1), set()).add(match.group(2))
    names = sorted(found)
    if names != [f"{i:02d}" for i in range(1, len(names) + 1)]:
        report.fail(f"tests must be numbered 01..NN without gaps, found {names}")
    if not MIN_TESTS <= len(names) <= MAX_TESTS:
        report.fail(f"{len(names)} tests; the protocol needs {MIN_TESTS}-{MAX_TESTS} including the 2 samples")
    tests = []
    for name in names:
        kinds = found[name]
        if not {"in", "out"} <= kinds:
            report.fail(f"test {name} needs both {name}.in and {name}.out")
            continue
        sample = name in ("01", "02")
        if sample and "md" not in kinds:
            report.fail(f"sample {name} needs the walkthrough tests/{name}.md")
        if not sample and "md" in kinds:
            report.fail(f"tests/{name}.md: only the samples 01 and 02 have walkthroughs")
        size = (tests_dir / f"{name}.in").stat().st_size
        if size > MAX_INPUT_BYTES:
            report.fail(f"{name}.in is {size:,} bytes (limit {MAX_INPUT_BYTES:,})")
        tests.append({"name": name, "size": size, "sample": sample})
    # LF only in every text file of the folder.
    for path in sorted(problem_dir.rglob("*")):
        if path.is_file() and path.suffix in (".md", ".json", ".py", ".cpp", ".in", ".out"):
            data = path.read_bytes()
            if b"\r" in data:
                report.fail(f"{path.relative_to(problem_dir).as_posix()} contains CR bytes (LF only)")
            if data.startswith(b"\xef\xbb\xbf"):
                report.fail(f"{path.relative_to(problem_dir).as_posix()} starts with a UTF-8 BOM")
    for name in ("01", "02"):
        md = tests_dir / f"{name}.md"
        if md.is_file() and len(md.read_text(encoding="utf-8").strip()) < 20:
            report.fail(f"tests/{name}.md is too short to explain the sample")
    return tests


# ---------------------------------------------------------------- docker

def docker_bin() -> str:
    found = shutil.which("docker")
    if found:
        return found
    for candidate in (r"C:\Program Files\Docker\Docker\resources\bin\docker.exe", "/usr/local/bin/docker", "/usr/bin/docker"):
        if os.path.isfile(candidate):
            return candidate
    raise SystemExit("docker not found on PATH")


def image_exists(docker: str, image: str) -> bool:
    proc = subprocess.run([docker, "image", "inspect", image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return proc.returncode == 0


def build_tar(problem_dir: Path, job: dict, sources: list[str]) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:", format=tarfile.USTAR_FORMAT) as tar:
        def add(name: str, data: bytes) -> None:
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(data))

        add("runner.py", RUNNER.encode("utf-8"))
        add("job.json", json.dumps(job).encode("utf-8"))
        for source in sources:
            add(source, (problem_dir / source).read_bytes())
        for test in job["tests"]:
            for ext in ("in", "out"):
                add(f"tests/{test['name']}.{ext}", (problem_dir / "tests" / f"{test['name']}.{ext}").read_bytes())
    return buffer.getvalue()


def run_container(docker: str, image: str, payload: bytes) -> dict:
    cmd = [
        docker, "run", "--rm", "-i", "--network", "none", "--memory", "2g", "--pids-limit", "256",
        "--entrypoint", "python3", image, "-c", BOOTSTRAP,
    ]
    env = dict(os.environ, MSYS_NO_PATHCONV="1")
    proc = subprocess.run(cmd, input=payload, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=CONTAINER_TIMEOUT_S, env=env)
    if proc.returncode != 0:
        raise RuntimeError(f"container {image} failed (exit {proc.returncode}): {proc.stderr.decode('utf-8', 'replace')[-1500:]}")
    return json.loads(proc.stdout.decode("utf-8"))


def first_bad(runs: list[dict], ok=("AC",)) -> dict | None:
    return next((r for r in runs if r["verdict"] not in ok), None)


def describe_run(r: dict) -> str:
    text = f"{r['verdict']} on {r['test']}.in (cpu {r.get('cpuMs', '?')} ms, exit {r.get('exitCode', '?')})"
    if r.get("stderr"):
        text += f": {r['stderr'].strip()[-300:]}"
    return text


def verify_cpp(docker: str, image: str, problem_dir: Path, meta: dict, tests: list[dict], report: Report) -> None:
    tl = meta["timeLimitMs"]
    job = {
        "timeLimitMs": tl, "checker": meta["checker"], "floatTolerance": meta.get("floatTolerance", 0),
        "tests": tests, "exactRef": False,
        "programs": [{
            "name": "ref.cpp", "mode": "ref", "cpuCapMs": tl * 3,
            "compile": ["g++", "-std=gnu++17", "-O2", "-pipe", "-o", "main", "ref.cpp"], "run": ["./main"],
        }],
    }
    result = run_container(docker, image, build_tar(problem_dir, job, ["ref.cpp"]))["programs"]["ref.cpp"]
    if "compileError" in result:
        report.fail(f"ref.cpp does not compile: {result['compileError']}")
        report.cells["ref.cpp"] = "CE"
        return
    bad = first_bad(result["runs"])
    slowest = max(r["cpuMs"] for r in result["runs"])
    budget = tl * REF_CPP_FACTOR
    report.cells["ref.cpp"] = f"{slowest} ms"
    if bad:
        report.fail("ref.cpp " + describe_run(bad))
        report.cells["ref.cpp"] = bad["verdict"]
    elif slowest > budget:
        report.fail(f"ref.cpp needs {slowest} ms CPU; the budget is {budget:.0f} ms (0.5 x timeLimitMs)")


def verify_python(docker: str, image: str, problem_dir: Path, meta: dict, tests: list[dict], report: Report) -> None:
    tl = meta["timeLimitMs"]
    programs = [{"name": "ref.py", "mode": "ref", "cpuCapMs": tl * 3, "run": ["python3", "-B", "ref.py"]}]
    sources = ["ref.py"]
    if (problem_dir / "slow.py").is_file():
        programs.append({"name": "slow.py", "mode": "slow", "cpuCapMs": tl * SLOW_FACTOR, "run": ["python3", "-B", "slow.py"]})
        sources.append("slow.py")
    if (problem_dir / "wrong.py").is_file():
        programs.append({"name": "wrong.py", "mode": "wrong", "cpuCapMs": tl * 3, "run": ["python3", "-B", "wrong.py"]})
        sources.append("wrong.py")
    job = {
        "timeLimitMs": tl, "checker": meta["checker"], "floatTolerance": meta.get("floatTolerance", 0),
        "tests": tests, "exactRef": True, "programs": programs,
    }
    output = run_container(docker, image, build_tar(problem_dir, job, sources))
    if not output["python"].startswith("3.11."):
        report.fail(f"the Python image runs {output['python']}, not 3.11 (resolution R17)")
    results = output["programs"]

    ref = results["ref.py"]["runs"]
    bad = first_bad(ref)
    slowest = max(r["cpuMs"] for r in ref)
    peak_mb = max(r["rssKb"] for r in ref) / 1024
    budget = tl * REF_PY_FACTOR
    report.cells["ref.py"] = f"{slowest} ms / {budget:.0f}, {peak_mb:.0f} MB"
    if bad:
        detail = "output is token-equal but not byte-equal to the .out (re-run gen-tests.py)" if bad["verdict"] == "DIFF" else describe_run(bad)
        report.fail(f"ref.py {detail}")
        report.cells["ref.py"] = bad["verdict"]
    elif slowest > budget:
        report.fail(f"ref.py needs {slowest} ms CPU; the budget is {budget:.0f} ms (1.5 x timeLimitMs)")
    if peak_mb > meta["memoryLimitMb"] + PY_MEMORY_OVERHEAD_MB:
        report.fail(f"ref.py peaks at {peak_mb:.0f} MB; the judge allows {meta['memoryLimitMb'] + PY_MEMORY_OVERHEAD_MB} MB")

    if "slow.py" in results:
        entry = results["slow.py"]
        runs = {r["test"]: r for r in entry["runs"]}
        big = runs[entry["largest"]]
        finished = [r for r in entry["runs"] if r["verdict"] not in ("TLE", "SKIPPED")]
        wrong = [r for r in finished if r["verdict"] != "AC"]
        checked = sum(1 for r in finished if r["verdict"] == "AC")
        if wrong:
            report.fail("slow.py must be correct where it finishes: " + describe_run(wrong[0]))
            report.cells["slow.py"] = f"{wrong[0]['verdict']} {wrong[0]['test']}"
        elif big["verdict"] != "TLE":
            report.fail(f"slow.py finished the largest test {big['test']}.in in {big['cpuMs']} ms; it must exceed {tl * SLOW_FACTOR:.0f} ms")
            report.cells["slow.py"] = f"fast {big['cpuMs']} ms"
        else:
            report.cells["slow.py"] = f"AC x{checked}, TLE {big['test']} >{big['cpuMs']} ms"

    if "wrong.py" in results:
        runs = results["wrong.py"]["runs"]
        samples = [r for r in runs if r["test"] in ("01", "02")]
        failing = [r for r in runs if r["test"] not in ("01", "02") and r["verdict"] != "AC"]
        bad_sample = first_bad(samples)
        if bad_sample:
            report.fail("wrong.py must pass both samples: " + describe_run(bad_sample))
            report.cells["wrong.py"] = f"{bad_sample['verdict']} sample {bad_sample['test']}"
        elif not failing:
            report.fail("wrong.py passes every hidden test; it must fail at least one")
            report.cells["wrong.py"] = "all AC"
        else:
            report.cells["wrong.py"] = f"{failing[0]['verdict']} {failing[0]['test']} ({len(failing)} failing)"


def verify(problem_dir: Path, docker: str | None, images: tuple[str, str]) -> Report:
    report = Report(problem_dir.name)
    if not problem_dir.is_dir():
        report.fail(f"no folder {problem_dir}")
        return report
    tests = check_files(problem_dir, report)
    meta = check_meta(problem_dir, report) if (problem_dir / "meta.json").is_file() else None
    if (problem_dir / "problem.md").is_file():
        check_statement(problem_dir, report)
    report.cells["tests"] = str(len(tests))
    report.cells["static"] = "ok" if not report.errors else "FAIL"
    if report.errors or docker is None or meta is None:
        return report
    try:
        verify_cpp(docker, images[0], problem_dir, meta, tests, report)
        verify_python(docker, images[1], problem_dir, meta, tests, report)
    except (RuntimeError, subprocess.TimeoutExpired, ValueError, KeyError) as error:
        report.fail(f"docker run failed: {error}")
    return report


def print_table(reports: list[Report]) -> None:
    columns = ["problem", "tests", "static", "ref.cpp", "ref.py", "slow.py", "wrong.py", "result"]
    rows = [[r.slug, *(r.cells[c] for c in columns[1:-1]), "PASS" if not r.errors else "FAIL"] for r in reports]
    widths = [max(len(columns[i]), *(len(row[i]) for row in rows)) for i in range(len(columns))]
    line = lambda cells: "| " + " | ".join(c.ljust(w) for c, w in zip(cells, widths)) + " |"  # noqa: E731
    print(line(columns))
    print("|" + "|".join("-" * (w + 2) for w in widths) + "|")
    for row in rows:
        print(line(row))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate seed problems, running ref/slow/wrong programs in Docker.")
    parser.add_argument("slugs", nargs="*", help="problem slugs (folder names under the problems root)")
    parser.add_argument("--all", action="store_true", help="verify every problem folder")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="problems root (default: seed/problems)")
    parser.add_argument("--no-docker", action="store_true", help="static checks only")
    parser.add_argument("--cpp-image", help="image for ref.cpp (default: arbiter-sandbox:latest, else gcc:14)")
    parser.add_argument("--py-image", help="image for the Python programs (default: arbiter-sandbox:latest, else python:3.11-slim)")
    args = parser.parse_args(argv)
    root = args.root.resolve()
    if args.all and args.slugs:
        parser.error("give slugs or --all, not both")
    slugs = sorted(p.name for p in root.iterdir() if p.is_dir()) if args.all and root.is_dir() else args.slugs
    if not slugs:
        parser.error("no problems given (pass slugs or --all)")

    docker = None if args.no_docker else docker_bin()
    images = ("", "")
    if docker:
        sandbox = image_exists(docker, "arbiter-sandbox:latest")
        images = (
            args.cpp_image or ("arbiter-sandbox:latest" if sandbox else "gcc:14"),
            args.py_image or ("arbiter-sandbox:latest" if sandbox else "python:3.11-slim"),
        )
        print(f"images: C++ {images[0]}, Python {images[1]}", flush=True)

    reports = []
    for slug in slugs:
        started = time.perf_counter()
        report = verify(root / slug, docker, images)
        reports.append(report)
        status = "ok" if not report.errors else "FAIL"
        print(f"[{status}] {slug} ({time.perf_counter() - started:.0f} s)", flush=True)
        for error in report.errors:
            print(f"    - {error}", flush=True)
    print()
    print_table(reports)
    failed = sum(1 for r in reports if r.errors)
    print(f"\n{len(reports) - failed} of {len(reports)} problem(s) passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
