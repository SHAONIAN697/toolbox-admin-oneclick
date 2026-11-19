"""SQLite projections of account identity and append-only audit events."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import closing, contextmanager
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS invite_history (
    invite_id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE,
    code_display TEXT NOT NULL, inviter_id TEXT NOT NULL,
    created_at TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS invite_inviter ON invite_history(inviter_id);
CREATE TABLE IF NOT EXISTS registrations (
    user_id TEXT PRIMARY KEY, invite_id TEXT REFERENCES invite_history(invite_id),
    username TEXT, display_name TEXT, email TEXT, phone TEXT, ip TEXT, device TEXT,
    registered_at TEXT, used_at TEXT, provenance TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS registrations_invite ON registrations(invite_id,user_id);
CREATE INDEX IF NOT EXISTS registrations_ip ON registrations(ip);
CREATE INDEX IF NOT EXISTS registrations_time ON registrations(registered_at);
CREATE TABLE IF NOT EXISTS identity_history (
    change_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, field TEXT NOT NULL,
    before_value TEXT, after_value TEXT, changed_at TEXT NOT NULL,
    actor_id TEXT, request_id TEXT
);
CREATE INDEX IF NOT EXISTS identity_user ON identity_history(user_id,changed_at);
CREATE TABLE IF NOT EXISTS audit_events (
    log_id INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL,
    actor_id TEXT NOT NULL, target_id TEXT NOT NULL, ip TEXT NOT NULL, risk TEXT NOT NULL,
    request_id TEXT NOT NULL, created_at TEXT NOT NULL, invite_hash TEXT NOT NULL,
    payload TEXT NOT NULL, previous_mac TEXT NOT NULL, mac TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_type ON audit_events(event_type,log_id);
CREATE INDEX IF NOT EXISTS events_actor ON audit_events(actor_id,log_id);
CREATE INDEX IF NOT EXISTS events_target ON audit_events(target_id,log_id);
CREATE INDEX IF NOT EXISTS events_ip ON audit_events(ip,log_id);
CREATE INDEX IF NOT EXISTS events_risk ON audit_events(risk,log_id);
CREATE INDEX IF NOT EXISTS events_request ON audit_events(request_id,log_id);
CREATE INDEX IF NOT EXISTS events_invite ON audit_events(invite_hash,log_id);
CREATE INDEX IF NOT EXISTS events_time ON audit_events(created_at,log_id);
CREATE INDEX IF NOT EXISTS events_toolbox ON audit_events(json_extract(payload,'$.details.variant'),log_id);
CREATE TABLE IF NOT EXISTS audit_hidden (
    log_id INTEGER PRIMARY KEY REFERENCES audit_events(log_id)
);
CREATE TABLE IF NOT EXISTS security_rates (
    kind TEXT NOT NULL, scope TEXT NOT NULL, expires INTEGER NOT NULL, count INTEGER NOT NULL,
    PRIMARY KEY(kind,scope)
);
CREATE INDEX IF NOT EXISTS rates_expiry ON security_rates(expires);
CREATE TABLE IF NOT EXISTS security_login_sources (
    ip TEXT NOT NULL, user_id TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(ip,user_id)
);
CREATE INDEX IF NOT EXISTS sources_expiry ON security_login_sources(expires);
CREATE TABLE IF NOT EXISTS audit_previews (
    proof_hash TEXT PRIMARY KEY, session_hash TEXT NOT NULL, filters TEXT NOT NULL,
    summary TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS preview_expiry ON audit_previews(expires);
CREATE TABLE IF NOT EXISTS audit_meta (name TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT,'Audit events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT,'Audit events are immutable'); END;
"""

FIELDS = ("username", "displayName", "email", "phone", "role", "active",
          "canViewJson", "parentAgentId", "agentLevelId")
SECRET_FIELD = re.compile(r"password|passphrase|token|secret|api.?key|credential|cookie|authorization|signature|private.?key|^code$|url|link", re.I)
SECRET_TEXT = re.compile(r"(?i)\b(?:https?://[^\s]+|bearer\s+[^\s]+|[a-f0-9]{32,})\b")


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def scrub(value, depth=0):
    if depth > 7:
        return "[省略]"
    if isinstance(value, dict):
        clean = {}
        sensitive_change = SECRET_FIELD.search(str(value.get("field") or value.get("key") or ""))
        for key, item in list(value.items())[:120]:
            if key in ("inviteCodeHash", "inviteId", "eventId", "requestId"):
                clean[key] = str(item or "")[:80]
            elif SECRET_FIELD.search(key) or key in ("inviteCode", "codes", "body", "headers"):
                clean[key] = "[已脱敏]"
            elif sensitive_change and key in ("before", "after", "from", "to", "value"):
                clean[key] = "[已脱敏]"
            else:
                clean[key] = scrub(item, depth + 1)
        return clean
    if isinstance(value, (tuple, list)):
        return [scrub(item, depth + 1) for item in value[:120]]
    if isinstance(value, str):
        return SECRET_TEXT.sub("[已脱敏]", value[:4000])
    return value


def invitation(code):
    code = str(code or "").strip()
    if not code:
        return "", ""
    return digest(code), (code[:2] + "••••" + code[-2:] if len(code) > 5 else "••••")


def invite_row(item, at):
    code_hash, display = invitation(item.get("code"))
    used, maximum = int(item.get("usedCount") or 0), int(item.get("maxUses") or 1)
    if maximum > 0 and used >= maximum:
        status = "used"
    elif item.get("active") is False:
        status = "revoked"
    elif item.get("expiresAt") and item["expiresAt"] <= at:
        status = "expired"
    else:
        status = "active"
    return [code_hash, code_hash, display, item.get("createdById") or item.get("ownerAgentId") or "",
            item.get("createdAt") or "", status, at]


def projection(before, after, context=None, registration=None):
    context = context or {}
    at = timestamp()
    users = {str(u["id"]): u for u in before.get("users", []) if u.get("id")}
    users_after = {str(u["id"]): u for u in after.get("users", []) if u.get("id")}
    invites = {i["code"]: i for i in before.get("inviteCodes", []) if i.get("code")}
    invites_after = {i["code"]: i for i in after.get("inviteCodes", []) if i.get("code")}
    relations = {}
    rows = []
    for code, item in {**invites, **invites_after}.items():
        if before.get("_auditProjectionVersion") and invites.get(code) == invites_after.get(code):
            continue
        row = invite_row(item, at)
        if code not in invites_after:
            row[-2] = "deleted" if code in context.get("deletedInviteCodes", ()) else "expired"
        rows.append(row)
        for used in item.get("usedBy") or []:
            uid = str(used.get("userId") or "")
            if uid:
                relations[uid] = [uid, row[0], used.get("username"), used.get("displayName"),
                                  used.get("email"), used.get("phone"), used.get("ip"), used.get("device"),
                                  used.get("usedAt"), used.get("usedAt"), "legacy_invite"]
    for uid, user in {**users_after, **users}.items():
        if uid not in relations and (not before.get("_auditProjectionVersion") or uid not in users):
            relations[uid] = [uid, None, user.get("username"), user.get("displayName"), user.get("email"),
                              user.get("phone"), None, None, user.get("createdAt") or None, None, "baseline"]
    if registration:
        relations[registration[0]] = registration
    change_id = secrets.token_hex(16)
    changes = []
    for uid, old in users.items():
        newer = users_after.get(uid, old)
        for field in FIELDS:
            if old.get(field) != newer.get(field):
                changes.append([change_id + ":" + str(len(changes)), uid, field,
                                encode(old.get(field)), encode(newer.get(field)), at,
                                context.get("actorId"), context.get("requestId")])
    return {"invites": rows, "registrations": list(relations.values()), "changes": changes,
            "events": []}


class Store:
    def __init__(self, legacy_file):
        self.legacy = Path(legacy_file)
        self.path = self.legacy.with_name("security.sqlite3")
        self.spool = self.legacy.with_name("security-pending.jsonl")

    @contextmanager
    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(str(self.path), timeout=15)) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA foreign_keys = ON")
            if db.execute("PRAGMA user_version").fetchone()[0] < 4:
                db.executescript("BEGIN IMMEDIATE;\n" + SCHEMA + "\nPRAGMA user_version=4;\nCOMMIT;")
            with db:
                yield db

    def apply(self, job):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.executemany("""INSERT INTO invite_history VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(invite_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at
                WHERE invite_history.status<>excluded.status AND invite_history.status<>'deleted'""", job["invites"])
            db.executemany("""INSERT INTO registrations VALUES (?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET invite_id=excluded.invite_id,username=excluded.username,
                display_name=excluded.display_name,email=excluded.email,phone=excluded.phone,ip=excluded.ip,
                device=excluded.device,registered_at=excluded.registered_at,used_at=excluded.used_at,
                provenance=excluded.provenance WHERE registrations.provenance='baseline'
                AND excluded.provenance<>'baseline'""", job["registrations"])
            db.executemany("INSERT OR IGNORE INTO identity_history VALUES (?,?,?,?,?,?,?,?)", job["changes"])
            for entry in job.get("events", []):
                self.append(db, entry)

    @staticmethod
    def signing_key(db):
        supplied = os.environ.get("TOOLBOX_AUDIT_SIGNING_KEY", "")
        if supplied:
            return supplied.encode("utf-8")
        row = db.execute("SELECT value FROM audit_meta WHERE name='local_key'").fetchone()
        if row:
            return bytes.fromhex(row[0])
        key = secrets.token_bytes(32)
        db.execute("INSERT INTO audit_meta VALUES ('local_key',?)", (key.hex(),))
        return key

    def append(self, db, entry):
        if db.execute("SELECT 1 FROM audit_events WHERE event_id=?", (entry["eventId"],)).fetchone():
            return
        last = db.execute("SELECT mac FROM audit_events ORDER BY log_id DESC LIMIT 1").fetchone()
        previous = last[0] if last else ""
        payload = encode(entry)
        mac = hmac.new(self.signing_key(db), (previous + payload).encode("utf-8"), hashlib.sha256).hexdigest()
        db.execute("""INSERT INTO audit_events(event_id,event_type,actor_id,target_id,ip,risk,request_id,
            created_at,invite_hash,payload,previous_mac,mac) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                   (entry["eventId"], entry["eventType"], entry.get("actorId") or "",
                    entry.get("targetId") or "", entry.get("ip") or "", entry["riskLevel"],
                    entry.get("requestId") or "", entry["time"], entry.get("inviteCodeHash") or "",
                    payload, previous, mac))

    def initialize(self, legacy_events):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT 1 FROM audit_meta WHERE name='legacy_imported'").fetchone():
                for row in legacy_events():
                    self.append(db, row)
                db.execute("INSERT INTO audit_meta VALUES ('legacy_imported','1')")
            if self.spool.exists():
                with self.spool.open(encoding="utf-8") as stream:
                    for line in stream:
                        self.append(db, json.loads(line))
        if self.spool.exists():
            self.spool.unlink()

    def write_event(self, entry):
        try:
            with self.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                self.append(db, entry)
        except (sqlite3.Error, OSError):
            with self.spool.open("a", encoding="utf-8") as stream:
                stream.write(encode(entry) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
            raise

    def verify(self):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            key = self.signing_key(db)
            previous = ""
            count = 0
            for row in db.execute("SELECT * FROM audit_events ORDER BY log_id"):
                entry = json.loads(row["payload"])
                mac = hmac.new(key, (previous + row["payload"]).encode("utf-8"), hashlib.sha256).hexdigest()
                expected = (entry["eventId"], entry["eventType"], entry.get("actorId") or "",
                            entry.get("targetId") or "", entry.get("ip") or "", entry["riskLevel"],
                            entry.get("requestId") or "", entry["time"], entry.get("inviteCodeHash") or "")
                indexed = tuple(row[k] for k in ("event_id", "event_type", "actor_id", "target_id",
                                                 "ip", "risk", "request_id", "created_at", "invite_hash"))
                if indexed != expected or row["previous_mac"] != previous or not hmac.compare_digest(mac, row["mac"]):
                    return {"ok": False, "logId": row["log_id"]}
                previous, count = row["mac"], count + 1
            return {"ok": True, "count": count, "head": previous}

    def reserve(self, kind, limits, window):
        now = int(time.time())
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM security_rates WHERE expires<=?", (now,))
            for scope, maximum in limits:
                row = db.execute("SELECT count FROM security_rates WHERE kind=? AND scope=?", (kind, scope)).fetchone()
                if row and row[0] >= maximum:
                    return False
            db.executemany("""INSERT INTO security_rates VALUES (?,?,?,1)
                ON CONFLICT(kind,scope) DO UPDATE SET count=count+1""",
                [(kind, scope, now + window) for scope, _ in limits])
            return True

    def reset_rate(self, kind, scope):
        with self.connect() as db:
            db.execute("DELETE FROM security_rates WHERE kind=? AND scope=?", (kind, scope))

    def observe_account(self, ip, user_id, window):
        now = int(time.time())
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM security_login_sources WHERE expires<=?", (now,))
            db.execute("""INSERT INTO security_login_sources VALUES (?,?,?)
                ON CONFLICT(ip,user_id) DO UPDATE SET expires=excluded.expires""", (ip, user_id, now + window))
            return db.execute("SELECT count(*) FROM security_login_sources WHERE ip=?", (ip,)).fetchone()[0]

    def identity(self, uid):
        with self.connect() as db:
            reg = db.execute("SELECT * FROM registrations LEFT JOIN invite_history USING(invite_id) WHERE user_id=?", (uid,)).fetchone()
            changes = [dict(row) for row in db.execute(
                "SELECT * FROM identity_history WHERE user_id=? ORDER BY changed_at DESC LIMIT 500", (uid,))]
        for row in changes:
            for field in ("before_value", "after_value"):
                row[field] = json.loads(row[field])
        return {"registration": dict(reg) if reg else None, "changes": changes}

    @staticmethod
    def identity_matches(db, query):
        needle = query.casefold()
        like = "%" + needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        db.create_function("fold", 1, lambda x: str(x or "").casefold())
        return {row[0] for row in db.execute("""
            SELECT user_id FROM registrations LEFT JOIN invite_history USING(invite_id)
            WHERE fold(user_id || ' ' || coalesce(username,'') || ' ' || coalesce(display_name,'') || ' ' ||
                coalesce(email,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(ip,'') || ' ' ||
                coalesce(registered_at,'') || ' ' || coalesce(inviter_id,'') || ' ' || coalesce(code_display,'')) LIKE ? ESCAPE '\\'
                OR code_hash IN (?,?)
            UNION SELECT user_id FROM identity_history
                WHERE field IN ('username','displayName','email','phone') AND
                 (fold(before_value) LIKE ? ESCAPE '\\' OR fold(after_value) LIKE ? ESCAPE '\\')
            """, (like, digest(query), needle, like, like))}

    def registration_names(self):
        with self.connect() as db:
            return {row[0]: row[1] or "" for row in db.execute("SELECT user_id,display_name FROM registrations")}

    def registration_matches(self, filters):
        clause = []
        args = {}
        for key, column, operator in (
                ("inviter", "inviter_id", "="), ("registeredFrom", "registered_at", ">="),
                ("registeredTo", "registered_at", "<="), ("registerIp", "ip", "=")):
            if filters.get(key):
                clause.append(column + operator + ":" + key)
                args[key] = filters[key]
        if filters.get("invite"):
            clause.append("(code_hash IN (:invite,:inviteHash) OR code_display=:invite)")
            args.update(invite=filters["invite"], inviteHash=digest(filters["invite"]))
        with self.connect() as db:
            return {row[0] for row in db.execute("SELECT user_id FROM registrations LEFT JOIN invite_history USING(invite_id) WHERE "
                                                + " AND ".join(clause), args)}

    def user_matches(self, query):
        with self.connect() as db:
            return self.identity_matches(db, query)

    def user_ids_for_invite(self, value):
        with self.connect() as db:
            return {row[0] for row in db.execute("""SELECT user_id FROM registrations JOIN invite_history USING(invite_id)
                WHERE code_hash IN (?,?) OR code_display=?""", (digest(value), value.lower(), value))}

    @staticmethod
    def scope(db, filters, user_ids=()):
        conditions = ["NOT EXISTS (SELECT 1 FROM audit_hidden h WHERE h.log_id=e.log_id)"]
        params = {}
        for key, column in {"ip": "ip", "eventType": "event_type", "risk": "risk", "target": "target_id",
                            "requestId": "request_id", "eventId": "event_id", "actorId": "actor_id"}.items():
            if filters.get(key):
                conditions.append("e." + column + "=:" + key)
                params[key] = filters[key]
        if filters.get("toolbox"):
            conditions.append("json_extract(e.payload, '$.details.variant')=:toolbox")
            params["toolbox"] = filters["toolbox"]
        if filters.get("userId"):
            conditions.append("(e.actor_id=:userId OR e.target_id=:userId)")
            params["userId"] = filters["userId"]
        if filters.get("invite"):
            params["invite"] = filters["invite"]
            params["inviteHash"] = digest(filters["invite"])
            conditions.append("""(e.invite_hash IN (:invite,:inviteHash) OR e.actor_id IN (
                SELECT user_id FROM registrations JOIN invite_history USING(invite_id)
                WHERE code_hash IN (:invite,:inviteHash) OR code_display=:invite) OR e.target_id IN (
                SELECT user_id FROM registrations JOIN invite_history USING(invite_id)
                WHERE code_hash IN (:invite,:inviteHash) OR code_display=:invite))""")
        for key, operator in (("from", ">="), ("to", "<="), ("watermark", "<="), ("before", "<")):
            if filters.get(key):
                col = "created_at" if key in ("from", "to") else "log_id"
                conditions.append("e." + col + operator + ":" + key)
                params[key] = filters[key]
        for key, table in (("q", "matched_query"), ("user", "matched_identity")):
            if not filters.get(key):
                continue
            query = filters[key]
            db.create_function("fold", 1, lambda value: str(value or "").casefold())
            db.execute(f"CREATE TEMP TABLE {table} (uid TEXT PRIMARY KEY)")
            matches = set((user_ids or {}).get(key, ())) | Store.identity_matches(db, query)
            db.executemany(f"INSERT INTO {table} VALUES (?)", [(uid,) for uid in matches])
            condition = f"e.actor_id IN (SELECT uid FROM {table}) OR e.target_id IN (SELECT uid FROM {table})"
            if key == "q":
                condition += " OR instr(fold(e.payload),:q)>0"
                params["q"] = query.casefold()
            conditions.append("(" + condition + ")")
        return " AND ".join(conditions), params

    def query(self, filters, limit, user_ids=()):
        with self.connect() as db:
            where, params = self.scope(db, filters, user_ids)
            params["limit"] = limit + 1
            rows = db.execute("SELECT e.* FROM audit_events e WHERE " + where +
                              " ORDER BY log_id DESC LIMIT :limit", params).fetchall()
        items = []
        for row in rows[:limit]:
            item = json.loads(row["payload"])
            item.update(logId=row["log_id"], eventKey=item["eventId"])
            items.append(item)
        return {"items": items, "nextBefore": items[-1]["logId"] if len(rows) > limit else None}

    def invite_hashes(self):
        with self.connect() as db:
            return {row[0] for row in db.execute("SELECT code_hash FROM invite_history")}

    def create_preview(self, proof, session, filters, result):
        now = int(time.time())
        with self.connect() as db:
            db.execute("DELETE FROM audit_previews WHERE expires<=?", (now,))
            db.execute("INSERT INTO audit_previews VALUES (?,?,?,?,?)",
                       (digest(proof), session, encode(filters), encode(result), now + 180))

    def cleanup(self, filters, user_ids=(), record=None, proof=None, session=None):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            where, params = self.scope(db, filters, user_ids)
            where += " AND e.event_type NOT IN ('audit_log_cleared','audit_log_filtered_cleared')"
            row = db.execute("SELECT count(*), min(created_at), max(created_at), max(log_id) FROM audit_events e WHERE " + where, params).fetchone()
            result = dict(zip(("count", "from", "to", "watermark"), row))
            if not proof:
                return result, False
            stored = db.execute(
                "SELECT summary FROM audit_previews WHERE proof_hash=? AND session_hash=? AND filters=? AND expires>?",
                (digest(proof), session, encode(filters), int(time.time()))).fetchone()
            if not stored:
                return result, False
            db.execute("DELETE FROM audit_previews WHERE proof_hash=?", (digest(proof),))
            if json.loads(stored[0]) != result or not result["count"]:
                return result, False
            before = db.execute("SELECT count(*) FROM audit_events e WHERE NOT EXISTS (SELECT 1 FROM audit_hidden h WHERE h.log_id=e.log_id)").fetchone()[0]
            db.execute("INSERT INTO audit_hidden SELECT e.log_id FROM audit_events e WHERE " + where, params)
            record["details"].update(scope=result, beforeCount=before, afterCount=before - result["count"],
                                     cleared=result["count"])
            record["actionDetail"] = f"清理 {result['count']} 条审计日志"
            self.append(db, record)
            return result, True

