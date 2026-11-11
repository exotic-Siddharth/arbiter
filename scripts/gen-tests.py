#!/usr/bin/env python3
"""Generate the hidden tests and expected outputs of Arbiter seed problems.

Usage (from any directory):
    python scripts/gen-tests.py <slug> [<slug> ...]
    python scripts/gen-tests.py --all
    python scripts/gen-tests.py --check <slug> [<slug> ...] | --all

For each problem folder seed/problems/<slug>/ this script:
  1. deletes the stale generated tests (tests/NN.in and tests/NN.out for NN >= 03);
  2. runs `python gen.py <tests_dir>` from the problem folder; gen.py writes 03.in .. NN.in
     and must never touch the hand-written samples 01.in and 02.in;
  3. runs ref.py on every NN.in (samples included) and writes NN.out with LF line endings.

--check regenerates everything in a temporary directory and compares it with the committed
files byte for byte; it writes nothing and exits 1 if anything differs (use it in CI).

gen.py and ref.py run with this interpreter (sys.executable), PYTHONHASHSEED=0 and
PYTHONDONTWRITEBYTECODE=1, so a re-run reproduces byte-identical files. CRLF in ref.py's
stdout (text-mode stdout on Windows) is normalised to LF. Standard library only, Python 3.9+.
The folder protocol is documented in seed/problems/README.md.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ROOT = REPO_ROOT / "seed" / "problems"
SAMPLES = ("01", "02")
MAX_INPUT_BYTES = 1 << 20  # 1 MiB
TEST_FILE = re.compile(r"^(\d{2})\.(in|out)$")
GEN_TIMEOUT_S = 600
REF_TIMEOUT_S = 600


class ProblemError(Exception):
    """A problem folder is broken; the message says what to fix."""


def child_env() -> dict[str, str]:
    env = dict(os.environ)
    env["PYTHONHASHSEED"] = "0"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tail(data: bytes, limit: int = 1500) -> str:
    text = data.decode("utf-8", "replace").strip()
    return text if len(text) <= limit else "..." + text[-limit:]


def discover(root: Path) -> list[str]:
    if not root.is_dir():
        return []
    return sorted(p.name for p in root.iterdir() if p.is_dir() and (p / "gen.py").is_file())


def numbered(tests_dir: Path, ext: str) -> list[str]:
    """Sorted two-digit test numbers that have a file with the given extension."""
    found = []
    for path in tests_dir.iterdir():
        match = TEST_FILE.match(path.name)
        if match and match.group(2) == ext:
            found.append(match.group(1))
    return sorted(found)


def remove_generated(tests_dir: Path) -> None:
    for path in tests_dir.iterdir():
        match = TEST_FILE.match(path.name)
        if match and match.group(1) not in SAMPLES:
            path.unlink()


def run_generator(problem_dir: Path, tests_dir: Path) -> None:
    gen = problem_dir / "gen.py"
    before = {name: sha256(tests_dir / f"{name}.in") for name in SAMPLES}
    proc = subprocess.run(
        [sys.executable, str(gen), str(tests_dir)],
        cwd=str(problem_dir),
        env=child_env(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=GEN_TIMEOUT_S,
    )
    if proc.returncode != 0:
        raise ProblemError(f"gen.py exited with code {proc.returncode}:\n{tail(proc.stderr)}")
    for name in SAMPLES:
        path = tests_dir / f"{name}.in"
        if not path.is_file() or sha256(path) != before[name]:
            raise ProblemError(f"gen.py modified or deleted the sample {name}.in (it must write 03.in and up only)")


def check_inputs(tests_dir: Path) -> list[str]:
    names = numbered(tests_dir, "in")
    expected = [f"{i:02d}" for i in range(1, len(names) + 1)]
    if names != expected:
        raise ProblemError(f"test inputs must be numbered 01..NN without gaps, found: {', '.join(names)}")
    for name in names:
        data = (tests_dir / f"{name}.in").read_bytes()
        if b"\r" in data:
            raise ProblemError(f"{name}.in contains CR bytes: write inputs with newline='\\n' or as bytes")
        if len(data) > MAX_INPUT_BYTES:
            raise ProblemError(f"{name}.in is {len(data):,} bytes; the limit is {MAX_INPUT_BYTES:,} (1 MiB)")
    return names


def run_reference(problem_dir: Path, tests_dir: Path, names: list[str]) -> float:
    ref = problem_dir / "ref.py"
    slowest = 0.0
    for name in names:
        data = (tests_dir / f"{name}.in").read_bytes()
        started = time.perf_counter()
        proc = subprocess.run(
            [sys.executable, str(ref)],
            input=data,
            cwd=str(problem_dir),
            env=child_env(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=REF_TIMEOUT_S,
        )
        slowest = max(slowest, time.perf_counter() - started)
        if proc.returncode != 0:
            raise ProblemError(f"ref.py failed on {name}.in (exit code {proc.returncode}):\n{tail(proc.stderr)}")
        (tests_dir / f"{name}.out").write_bytes(proc.stdout.replace(b"\r\n", b"\n"))
    return slowest


def build(problem_dir: Path, tests_dir: Path) -> tuple[list[str], float]:
    """Generate into tests_dir, which already holds the two sample inputs."""
    for required in ("gen.py", "ref.py"):
        if not (problem_dir / required).is_file():
            raise ProblemError(f"missing {required}")
    for name in SAMPLES:
        if not (tests_dir / f"{name}.in").is_file():
            raise ProblemError(f"missing the hand-written sample tests/{name}.in")
    remove_generated(tests_dir)
    run_generator(problem_dir, tests_dir)
    names = check_inputs(tests_dir)
    return names, run_reference(problem_dir, tests_dir, names)


def describe(tests_dir: Path, names: list[str], slowest: float) -> str:
    sizes = {name: (tests_dir / f"{name}.in").stat().st_size for name in names}
    largest = max(names, key=lambda n: (sizes[n], n))
    return (
        f"{len(names)} tests ({len(names) - len(SAMPLES)} generated), largest input {largest}.in "
        f"{sizes[largest]:,} B, slowest ref.py run {slowest:.2f} s"
    )


def generate(problem_dir: Path) -> str:
    tests_dir = problem_dir / "tests"
    if not tests_dir.is_dir():
        raise ProblemError("missing tests/ (it must hold the samples 01.in and 02.in)")
    names, slowest = build(problem_dir, tests_dir)
    return describe(tests_dir, names, slowest)


def check(problem_dir: Path) -> str:
    tests_dir = problem_dir / "tests"
    if not tests_dir.is_dir():
        raise ProblemError("missing tests/")
    scratch = Path(tempfile.mkdtemp(prefix="arbiter-gen-check-"))
    try:
        fresh_dir = scratch / "tests"
        fresh_dir.mkdir()
        for name in SAMPLES:
            source = tests_dir / f"{name}.in"
            if source.is_file():
                shutil.copyfile(source, fresh_dir / f"{name}.in")
        names, slowest = build(problem_dir, fresh_dir)
        committed = sorted(p.name for p in tests_dir.iterdir() if TEST_FILE.match(p.name))
        fresh = sorted(p.name for p in fresh_dir.iterdir() if TEST_FILE.match(p.name))
        problems = []
        for name in sorted(set(committed) | set(fresh)):
            if name not in fresh:
                problems.append(f"{name} is committed but not generated")
            elif name not in committed:
                problems.append(f"{name} is generated but not committed")
            elif sha256(tests_dir / name) != sha256(fresh_dir / name):
                problems.append(f"{name} differs from a fresh generation")
        if problems:
            raise ProblemError("tests are stale (run gen-tests.py without --check):\n  " + "\n  ".join(problems))
        return "up to date: " + describe(fresh_dir, names, slowest)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate hidden tests and expected outputs for seed problems.")
    parser.add_argument("slugs", nargs="*", help="problem slugs (folder names under the problems root)")
    parser.add_argument("--all", action="store_true", help="process every problem folder")
    parser.add_argument("--check", action="store_true", help="regenerate in a temp dir and compare; write nothing")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="problems root (default: seed/problems)")
    args = parser.parse_args(argv)

    root = args.root.resolve()
    if args.all and args.slugs:
        parser.error("give slugs or --all, not both")
    slugs = discover(root) if args.all else args.slugs
    if not slugs:
        parser.error("no problems given (pass slugs or --all)")

    failures = 0
    for slug in slugs:
        problem_dir = root / slug
        started = time.perf_counter()
        try:
            if not problem_dir.is_dir():
                raise ProblemError(f"no folder {problem_dir}")
            summary = check(problem_dir) if args.check else generate(problem_dir)
            print(f"[ok]   {slug}: {summary} ({time.perf_counter() - started:.1f} s)", flush=True)
        except (ProblemError, subprocess.TimeoutExpired, OSError) as error:
            failures += 1
            print(f"[FAIL] {slug}: {error}", flush=True)
    if failures:
        print(f"{failures} of {len(slugs)} problem(s) failed", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
