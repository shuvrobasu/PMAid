"""Stop background PMAID and llama.cpp servers.

Run: python stop_server.py
Check only: python stop_server.py --dry-run
"""

import os
import signal
import subprocess
import sys
import time


SERVICES = [
    ("PMAID", 8000),
    ("llama.cpp", 8080),
]


def listener_pids(port):
    result = subprocess.run(
        ["netstat", "-ano", "-p", "tcp"],
        capture_output=True,
        text=True,
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("netstat failed")
    pids = []
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) < 5:
            continue
        if fields[0].upper() != "TCP":
            continue
        if fields[3].upper() != "LISTENING":
            continue
        local_address = fields[1]
        if ":" not in local_address:
            continue
        local_port = local_address.rsplit(":", 1)[1]
        if local_port != str(port):
            continue
        pid_text = fields[4]
        if pid_text.isdigit() is False:
            continue
        pid = int(pid_text)
        if pid not in pids:
            pids.append(pid)
    return pids


def wait_until_stopped(pid, port):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        pids = listener_pids(port)
        if pid not in pids:
            return True
        time.sleep(0.1)
    return False


def stop_service(name, port, dry_run):
    try:
        pids = listener_pids(port)
    except RuntimeError as error:
        print("Could not inspect %s port %s: %s" % (name, port, error))
        return False
    if len(pids) == 0:
        print("No %s server is listening on port %s." % (name, port))
        return True
    ok = True
    for pid in pids:
        if dry_run:
            print("Would stop %s PID %s on port %s." % (name, pid, port))
            continue
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError as error:
            print("Could not stop %s PID %s: %s" % (name, pid, error))
            ok = False
            continue
        stopped = wait_until_stopped(pid, port)
        if stopped:
            print("Stopped %s PID %s on port %s." % (name, pid, port))
        else:
            print("%s PID %s did not stop within five seconds." % (name, pid))
            ok = False
    return ok


def main():
    dry_run = False
    if "--dry-run" in sys.argv[1:]:
        dry_run = True
    failed = False
    for name, port in SERVICES:
        stopped = stop_service(name, port, dry_run)
        if stopped is False:
            failed = True
    print("If llama.cpp was started in a console window, close that console window too.")
    if failed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
