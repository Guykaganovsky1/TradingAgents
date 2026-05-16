#!/usr/bin/env python3
"""Tiny shim: create a new session (os.setsid) then exec the given command.
The new session means the spawned process becomes its own process-group
leader. PGID == PID, so `kill -- -<PID>` reaps the whole tree."""
import os
import sys
if len(sys.argv) < 2:
    sys.exit("usage: _setsid_spawn.py <cmd> [args...]")
os.setsid()
os.execvp(sys.argv[1], sys.argv[1:])
