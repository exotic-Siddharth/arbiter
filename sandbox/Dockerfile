# Arbiter sandbox image (spec section 8.2). One container per judge job:
#   docker run --rm -i --init --network none --read-only --tmpfs /work ... arbiter-sandbox:latest
# The harness (Python stdlib only) speaks JSON lines on stdin/stdout and runs the compiler and
# the program as the unprivileged user `runner` (uid/gid 10001) with cwd /work.
#
# Versions: the base image is pinned by digest (Debian 12.15 "bookworm"); the toolchain majors
# come from bookworm (g++ 12, Python 3.11, OpenJDK 17, Node.js 18) and the build fails if any
# of them drifts.
FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN mkdir -p /usr/share/man/man1 \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      g++ \
      python3 \
      openjdk-17-jdk-headless \
      nodejs \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/* /var/cache/apt/* /var/log/* /usr/share/doc /usr/share/man \
      /usr/share/info /usr/share/locale \
 && g++ --version | head -n 1 | grep -q ' 12\.' \
 && python3 --version | grep -q '^Python 3\.11\.' \
 && java -version 2>&1 | head -n 1 | grep -q '"17\.' \
 && node --version | grep -q '^v18\.' \
 && groupadd --gid 10001 runner \
 && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent \
      --shell /usr/sbin/nologin runner \
 && mkdir -p /judge /work \
 && chmod 1777 /work

COPY --chown=0:0 --chmod=0644 harness.py /judge/harness.py

WORKDIR /work
ENTRYPOINT ["python3", "-u", "/judge/harness.py"]
