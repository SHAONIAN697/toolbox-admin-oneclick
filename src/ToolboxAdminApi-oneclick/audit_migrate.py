#!/usr/bin/env python3
"""Offline, additive audit migration and non-destructive rollback snapshot."""
import argparse
import json
import sqlite3
from contextlib import closing
from pathlib import Path
import shutil

import audit_store


def migrate(data):
    import app
    app.USERS_PATH = data / "users.json"
    app.AUDIT_LOG_PATH = data / "security-audit.jsonl"
    return app.migrate_audit().verify()


def rollback(data, destination):
    destination.mkdir(parents=True, exist_ok=False)
    for name in ("users.json", "sessions.json", "security-audit.jsonl", "security-pending.jsonl"):
        source = data / name
        if source.is_file():
            shutil.copy2(source, destination / name)
    source = audit_store.Store(data / "security-audit.jsonl").path
    if source.is_file():
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as original:
            with closing(sqlite3.connect(str(destination / source.name))) as snapshot:
                original.backup(snapshot)
    return {"ok": True, "snapshot": str(destination), "liveDataModified": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("migrate", "verify", "rollback"))
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--snapshot", type=Path)
    args = parser.parse_args()
    data = args.data.resolve(strict=True)
    if args.operation == "rollback":
        if not args.snapshot:
            parser.error("rollback requires --snapshot")
        result = rollback(data, args.snapshot.resolve())
    elif args.operation == "verify":
        result = audit_store.Store(data / "security-audit.jsonl").verify()
    else:
        if not (data / "users.json").is_file():
            parser.error("users.json is missing")
        result = migrate(data)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
