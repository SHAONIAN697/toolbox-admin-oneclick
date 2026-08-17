# coding: utf-8
"""Agent feature extension for ToolboxAdminApi."""
import json
import time
from pathlib import Path

AGENT_APPLICATIONS_PATH = DATA / "agent-applications.json"
AGENT_LOGS_PATH = DATA / "agent-logs.json"


def agent_defaults():
    return {
        "allowApply": False,
        "applyReviewMode": "manual",
        "defaultBalance": 0,
        "applyDescription": "",
        "invitePrice": 0,
        "currency": "CNY",
        "allowNegativeBalance": False,
        "orderCooldownMinutes": 30,
    }


def normalize_agent_settings(agent):
    current = agent_defaults()
    if isinstance(agent, dict):
        current.update(agent)
    current["allowApply"] = current.get("allowApply") is True
    current["applyReviewMode"] = "auto" if current.get("applyReviewMode") == "auto" else "manual"
    try:
        current["defaultBalance"] = max(0, float(current.get("defaultBalance") or 0))
    except Exception:
        current["defaultBalance"] = 0
    try:
        current["invitePrice"] = max(0, float(current.get("invitePrice") or current.get("agentInviteCost") or 0))
    except Exception:
        current["invitePrice"] = 0
    try:
        current["orderCooldownMinutes"] = max(0, int(current.get("orderCooldownMinutes") or 0))
    except Exception:
        current["orderCooldownMinutes"] = 30
    current["currency"] = str(current.get("currency") or "CNY").strip()[:12] or "CNY"
    current["allowNegativeBalance"] = current.get("allowNegativeBalance") is True
    current["applyDescription"] = str(current.get("applyDescription") or "").strip()
    return current


def agent_settings():
    data = _orig_read_system_settings()
    data["agent"] = normalize_agent_settings(data.get("agent") or {})
    return data["agent"]


def read_agent_applications():
    data = read_json(AGENT_APPLICATIONS_PATH, {"applications": []})
    if not isinstance(data, dict):
        data = {"applications": []}
    data.setdefault("applications", [])
    return data


def write_agent_applications(data):
    data.setdefault("applications", [])
    write_json(AGENT_APPLICATIONS_PATH, data)


def read_agent_logs():
    data = read_json(AGENT_LOGS_PATH, {"logs": []})
    if not isinstance(data, dict):
        data = {"logs": []}
    data.setdefault("logs", [])
    return data


def write_agent_logs(data):
    data.setdefault("logs", [])
    write_json(AGENT_LOGS_PATH, data)


def user_name_for_agent(user):
    return user_display_name(user) or (user or {}).get("username") or ""


def public_agent_application(row):
    return {
        "id": row.get("id"),
        "userId": row.get("userId", ""),
        "username": row.get("username", ""),
        "displayName": row.get("displayName") or row.get("username", ""),
        "contact": row.get("contact", ""),
        "reason": row.get("reason", ""),
        "status": row.get("status", "pending"),
        "rejectReason": row.get("rejectReason", ""),
        "reviewerId": row.get("reviewerId", ""),
        "reviewerName": row.get("reviewerName", ""),
        "reviewedAt": row.get("reviewedAt", ""),
        "createdAt": row.get("createdAt", ""),
        "updatedAt": row.get("updatedAt", ""),
    }


def latest_agent_application_for_user(user_id):
    rows = [x for x in read_agent_applications().get("applications", []) if x.get("userId") == user_id]
    rows.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    return rows[0] if rows else None


def agent_pending_application_count():
    return sum(1 for x in read_agent_applications().get("applications", []) if x.get("status") == "pending")


def log_agent_action(action, user, actor=None, detail=""):
    data = read_agent_logs()
    data["logs"].insert(0, {
        "id": new_id("alog"),
        "action": action,
        "userId": (user or {}).get("id", ""),
        "username": (user or {}).get("username", ""),
        "actorId": (actor or {}).get("id", "system"),
        "actorName": user_name_for_agent(actor) if actor else "??",
        "detail": detail,
        "createdAt": now_iso(),
    })
    data["logs"] = data["logs"][:300]
    write_agent_logs(data)


def agent_stats_from_store(store, user_id):
    invites = [x for x in store.get("inviteCodes", []) if x.get("ownerAgentId") == user_id or x.get("boundAgentId") == user_id]
    promoted = [u for u in store.get("users", []) if u.get("parentAgentId") == user_id]
    orders = [o for o in read_orders().get("orders", []) if o.get("agentId") == user_id]
    return {"inviteCount": len(invites), "promotedUserCount": len(promoted), "agentOrderCount": len(orders)}


def promote_user_to_agent(user_id, actor=None, use_default=True, balance=None, detail=""):
    store = read_users()
    user = next((u for u in store.get("users", []) if u.get("id") == user_id), None)
    if not user:
        raise ValueError("??????")
    if user.get("role") == "super":
        raise ValueError("???????????")
    user["role"] = "agent"
    user["parentAgentId"] = ""
    if balance is not None:
        user["balance"] = max(0, float(balance or 0))
    elif use_default or "balance" not in user:
        user["balance"] = float(agent_settings().get("defaultBalance") or 0)
    write_users(store)
    log_agent_action("promote", user, actor, detail or "????")
    return user


def cancel_user_agent(user_id, actor=None):
    store = read_users()
    user = next((u for u in store.get("users", []) if u.get("id") == user_id), None)
    if not user:
        raise ValueError("??????")
    if user.get("role") == "super":
        raise ValueError("?????????")
    user["role"] = "user"
    user["balance"] = float(user.get("balance") or 0)
    for child in store.get("users", []):
        if child.get("parentAgentId") == user_id:
            child["parentAgentId"] = ""
            child.pop("parentAgentName", None)
    write_users(store)
    log_agent_action("cancel", user, actor, "??????")
    return user


def submit_agent_application(user, body):
    if user.get("role") == "agent":
        raise ValueError("???????")
    if user.get("role") == "super":
        raise ValueError("???????????")
    settings = agent_settings()
    if settings.get("allowApply") is not True:
        raise ValueError("???????????")
    latest = latest_agent_application_for_user(user.get("id"))
    if latest and latest.get("status") == "pending":
        raise ValueError("????????????????")
    contact = str(body.get("contact") or "").strip()
    reason = str(body.get("reason") or "").strip()
    if not contact:
        raise ValueError("????????")
    if not reason:
        raise ValueError("????????")
    row = {
        "id": new_id("agent_apply"),
        "userId": user.get("id"),
        "username": user.get("username"),
        "displayName": user_name_for_agent(user),
        "contact": contact,
        "reason": reason,
        "status": "pending",
        "rejectReason": "",
        "reviewerId": "",
        "reviewerName": "",
        "reviewedAt": "",
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    data = read_agent_applications()
    data["applications"].insert(0, row)
    if settings.get("applyReviewMode") == "auto":
        row["status"] = "approved"
        row["reviewerId"] = "system"
        row["reviewerName"] = "??????"
        row["reviewedAt"] = now_iso()
        row["updatedAt"] = row["reviewedAt"]
        promote_user_to_agent(user.get("id"), None, True, detail="????????")
    else:
        add_system_notice("???????", f"?? {user_name_for_agent(user)} ?????????????????", "warn", "super")
    write_agent_applications(data)
    return row


def review_agent_application(apply_id, status, reviewer, reject_reason=""):
    if status not in ("approved", "rejected"):
        raise ValueError("???????")
    data = read_agent_applications()
    row = next((x for x in data.get("applications", []) if x.get("id") == apply_id), None)
    if not row:
        raise ValueError("????????")
    if row.get("status") != "pending":
        raise ValueError("??????????????")
    row["status"] = status
    row["reviewerId"] = reviewer.get("id", "")
    row["reviewerName"] = user_name_for_agent(reviewer)
    row["reviewedAt"] = now_iso()
    row["updatedAt"] = row["reviewedAt"]
    if status == "approved":
        promote_user_to_agent(row.get("userId"), reviewer, True, detail="????????")
    else:
        row["rejectReason"] = str(reject_reason or "").strip()
        user = find_user_by_id(row.get("userId")) or {"id": row.get("userId"), "username": row.get("username")}
        log_agent_action("reject", user, reviewer, row.get("rejectReason") or "???????")
    write_agent_applications(data)
    return row


_orig_read_system_settings = read_system_settings
_orig_public_system_settings = public_system_settings
_orig_write_system_settings = write_system_settings
_orig_public_user = public_user
_orig_generate_invites_for_actor = generate_invites_for_actor
_orig_invite_request_from_body = invite_request_from_body
_orig_create_user = create_user
_orig_dispatch = Handler.dispatch
_orig_handle_super = Handler.handle_super
_orig_handle_admin = Handler.handle_admin


def read_system_settings_ext():
    data = _orig_read_system_settings()
    data["agent"] = normalize_agent_settings(data.get("agent") or {})
    return data


def public_system_settings_ext():
    data = _orig_public_system_settings()
    data["agent"] = normalize_agent_settings(data.get("agent") or {})
    data["agent"]["pendingApplyCount"] = agent_pending_application_count()
    return data


def write_system_settings_ext(body):
    res = _orig_write_system_settings(body)
    current = _orig_read_system_settings()
    patch = body.get("agent") if isinstance(body, dict) else None
    if isinstance(patch, dict):
        current["agent"] = normalize_agent_settings({**(current.get("agent") or {}), **patch})
        write_json(SYSTEM_PATH, current)
        return public_system_settings_ext()
    return res


def public_user_ext(user, store=None):
    try:
        data = _orig_public_user(user, store)
    except TypeError:
        data = _orig_public_user(user)
    if data and user:
        data["parentAgentId"] = user.get("parentAgentId", "")
        if user.get("parentAgentId"):
            parent = find_user_by_id(user.get("parentAgentId"))
            data["parentAgentName"] = user.get("parentAgentName") or user_name_for_agent(parent)
        data["balance"] = user.get("balance", 0)
        if user.get("role") == "agent":
            data.update(agent_stats_from_store(store or read_users(), user.get("id")))
        latest = latest_agent_application_for_user(user.get("id"))
        if latest:
            data["agentApplication"] = public_agent_application(latest)
    return data


def invite_request_from_body_ext(store, body):
    req = _orig_invite_request_from_body(store, body)
    register_role = "agent" if body.get("registerRole") == "agent" else "user"
    bound_agent_id = str(body.get("boundAgentId") or "").strip()
    bound_agent = find_user_by_id(bound_agent_id) if bound_agent_id else None
    if bound_agent and bound_agent.get("role") != "agent":
        bound_agent = None
    req.update({
        "registerRole": register_role,
        "boundAgentId": bound_agent.get("id") if bound_agent else "",
        "boundAgentName": user_name_for_agent(bound_agent) if bound_agent else "",
    })
    return req


def generate_invites_for_actor_ext(store, actor, body, price=0, charged_amount=0):
    request = invite_request_from_body_ext(store, body)
    created = _orig_generate_invites_for_actor(store, actor, request, price, charged_amount)
    for invite in created:
        invite["registerRole"] = request.get("registerRole") or "user"
        invite["boundAgentId"] = request.get("boundAgentId") or ""
        invite["boundAgentName"] = request.get("boundAgentName") or ""
        invite["isAgentInvite"] = invite.get("registerRole") == "agent"
    return created


def create_user_ext(username, password, display_name="", role="user", template_user=None, email="", parent_agent_id="", balance=0):
    try:
        return _orig_create_user(username, password, display_name, role, template_user, email, parent_agent_id, balance)
    except TypeError:
        return _orig_create_user(username, password, display_name, role, template_user, email)


def public_invite_ext(invite):
    item = dict(invite or {})
    item["registerRole"] = item.get("registerRole") if item.get("registerRole") in ("user", "agent") else "user"
    item["boundAgentId"] = item.get("boundAgentId", "")
    if item.get("boundAgentId") and not item.get("boundAgentName"):
        item["boundAgentName"] = user_name_for_agent(find_user_by_id(item.get("boundAgentId")))
    item["isAgentInvite"] = item.get("isAgentInvite") is True or item.get("registerRole") == "agent"
    return item


def register_with_agent(handler):
    body = handler.read_body()
    code = (body.get("inviteCode") or "").strip()
    store = read_users()
    invite = next((x for x in store["inviteCodes"] if x.get("code") == code), None)
    if not invite or invite.get("active") is False:
        raise ValueError("??????")
    used = int(invite.get("usedCount") or 0)
    max_uses = int(invite.get("maxUses") or 1)
    if max_uses > 0 and used >= max_uses:
        raise ValueError("????????")
    role = "agent" if invite.get("registerRole") == "agent" else "user"
    parent_agent_id = "" if role == "agent" else (invite.get("boundAgentId") or invite.get("ownerAgentId") or "")
    default_balance = float(agent_settings().get("defaultBalance") or 0) if role == "agent" else 0
    user = create_user(body.get("username"), body.get("password"), body.get("displayName"), role, None, body.get("email"), parent_agent_id, default_balance)
    if role == "agent":
        log_agent_action("promote", user, None, "?????????")
    store = read_users()
    invite = next((x for x in store["inviteCodes"] if x.get("code") == code), None)
    invite.setdefault("usedBy", []).append({"userId": user["id"], "username": user["username"], "usedAt": now_iso()})
    invite["usedCount"] = used + 1
    if max_uses > 0 and invite["usedCount"] >= max_uses:
        invite["active"] = False
    write_users(store)
    token = random_hex(32)
    user = mark_user_login(user["id"])
    SESSIONS[token] = {"userId": user["id"], "createdAt": now_iso()}
    save_sessions()
    return handler.send_json({"token": token, "user": public_user(user)})


def dispatch_ext(self):
    try:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        method = self.command.upper()
        if path == "/api/register" and method == "POST":
            return register_with_agent(self)
    except Exception as exc:
        return self.send_json({"error": str(exc)}, 500)
    return _orig_dispatch(self)


def handle_admin_ext(self, path, method, auth):
    if path == "/api/admin/agent-application":
        user = auth["user"]
        if method == "GET":
            latest = latest_agent_application_for_user(user.get("id"))
            settings = agent_settings()
            return self.send_json({
                "allowApply": settings.get("allowApply") is True,
                "reviewMode": settings.get("applyReviewMode") or "manual",
                "description": settings.get("applyDescription") or "",
                "defaultBalance": settings.get("defaultBalance") or 0,
                "isAgent": user.get("role") == "agent",
                "balance": user.get("balance", 0),
                "application": public_agent_application(latest) if latest else None,
            })
        if method == "POST":
            return self.send_json({"application": public_agent_application(submit_agent_application(user, self.read_body()))})
    if path == "/api/admin/agent-orders" and method == "GET":
        uid = auth["user"].get("id")
        orders = [public_order(o) for o in read_orders().get("orders", []) if o.get("agentId") == uid]
        return self.send_json({"orders": orders})
    return _orig_handle_admin(self, path, method, auth)


def handle_super_ext(self, path, method, auth):
    if path == "/api/super/agent-applications":
        if not is_super(auth["user"]):
            return self.send_json({"error": "???????????????"}, 403)
        if method == "GET":
            status = self.query.get("status", ["all"])[0]
            rows = read_agent_applications().get("applications", [])
            if status in ("pending", "approved", "rejected"):
                rows = [x for x in rows if x.get("status") == status]
            return self.send_json({"applications": [public_agent_application(x) for x in rows], "pendingCount": agent_pending_application_count()})
        if method == "POST":
            body = self.read_body()
            row = review_agent_application(body.get("id") or body.get("applicationId"), body.get("status"), auth["user"], body.get("rejectReason") or body.get("reason") or "")
            return self.send_json({"application": public_agent_application(row), "pendingCount": agent_pending_application_count()})
    if path == "/api/super/users/agent":
        if not is_super(auth["user"]):
            return self.send_json({"error": "?????????????"}, 403)
        body = self.read_body()
        action = body.get("action") or body.get("mode")
        uid = body.get("userId") or body.get("id")
        if method == "POST":
            if action == "cancel":
                return self.send_json(public_user(cancel_user_agent(uid, auth["user"])))
            bal = body.get("balance") if "balance" in body else None
            return self.send_json(public_user(promote_user_to_agent(uid, auth["user"], body.get("useDefaultBalance") is not False, bal)))
        if method == "PATCH":
            store = read_users()
            user = next((u for u in store.get("users", []) if u.get("id") == uid), None)
            if not user:
                raise ValueError("??????")
            if user.get("role") != "agent":
                raise ValueError("????????")
            user["balance"] = float(body.get("balance") or 0)
            write_users(store)
            log_agent_action("balance", user, auth["user"], "??????")
            return self.send_json(public_user(user))
    if path == "/api/super/invites" and method == "GET":
        store = read_users()
        invites = store.get("inviteCodes", [])
        if is_agent(auth["user"]):
            invites = [x for x in invites if x.get("ownerAgentId") == auth["user"].get("id")]
        return self.send_json({"invites": [public_invite_ext(x) for x in invites]})
    return _orig_handle_super(self, path, method, auth)


def install_agent_extension():
    globals()["read_system_settings"] = read_system_settings_ext
    globals()["public_system_settings"] = public_system_settings_ext
    globals()["write_system_settings"] = write_system_settings_ext
    globals()["public_user"] = public_user_ext
    globals()["invite_request_from_body"] = invite_request_from_body_ext
    globals()["generate_invites_for_actor"] = generate_invites_for_actor_ext
    globals()["create_user"] = create_user_ext
    Handler.dispatch = dispatch_ext
    Handler.handle_admin = handle_admin_ext
    Handler.handle_super = handle_super_ext
    data = _orig_read_system_settings()
    data["agent"] = normalize_agent_settings(data.get("agent") or {})
    write_json(SYSTEM_PATH, data)

install_agent_extension()
