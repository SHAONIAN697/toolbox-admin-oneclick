"""Personal cloud-share resource management and Provider adapters."""
import hashlib
import base64
from concurrent.futures import ThreadPoolExecutor
import gzip
import html
import http.cookiejar
import json
import ipaddress
import os
import re
import socket
import threading
import time
import unicodedata
import uuid
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, urljoin

LANZOU_HOSTS = {"lanzou.com", "lanzout.com", "lanzoui.com", "lanzoux.com", "lanzous.com", "lanzoum.com"}


FEATURE = "cloud_resolver"
PROVIDERS = {
    "123pan": {"label": "123 云盘", "domains": ("123pan.com", "123684.com"), "status": "已接入"},
    "xiaofeiji": {"label": "小飞机网盘", "domains": ("xiaofeiji.com", "feijipan.com"), "status": "已接入"},
    "lanzou": {"label": "蓝奏云优享", "domains": tuple(sorted(LANZOU_HOSTS)), "status": "已接入"},
    "tianyi": {"label": "天翼云盘", "domains": ("cloud.189.cn", "189.cn"), "status": "已接入"},
    "weiyun": {"label": "腾讯微云", "domains": ("share.weiyun.com", "weiyun.com"), "status": "已接入"},
    "qaiu": {"label": "其他网盘（聚合解析）", "domains": (), "status": "已接入"},
    "mock": {"label": "测试平台", "domains": ("mock.local",), "status": "仅测试"},
}
QAIU_LEGACY_CLOUD_PROVIDERS = {"123pan", "xiaofeiji", "tianyi", "weiyun"}
LOCK = threading.RLock()
PARSE_EXECUTOR = ThreadPoolExecutor(max_workers=8, thread_name_prefix="cloud-resolver")
ACTIVE_PARSE_TASKS = set()
HTTP_TIMEOUT = 15
MAX_PAGE_BYTES = 1024 * 1024
LANZOU_CHALLENGE_ORDER = (0xf, 0x23, 0x1d, 0x18, 0x21, 0x10, 0x1, 0x26, 0xa, 0x9, 0x13, 0x1f, 0x28, 0x1b, 0x16, 0x17, 0x19, 0xd, 0x6, 0xb, 0x27, 0x12, 0x14, 0x8, 0xe, 0x15, 0x20, 0x1a, 0x2, 0x1e, 0x7, 0x4, 0x11, 0x5, 0x3, 0x1c, 0x22, 0x25, 0xc, 0x24)
LANZOU_CHALLENGE_KEY = "3000176000856006061501533003690027800375"
LANZOU_DOWNLOAD_HOSTS = {
    "webgetstore.com",
    "lanrar.com",
}
FEIJI_API_BASE = "https://api.feijipan.com"
FEIJI_AES_KEY = b"dingHao-disk-app"
QAIU_API_BASE = "https://pan.vst76.cn"
QAIU_API_KEY_ENV = "NFD189_API_KEY"
QAIU_API_BASE_ENV = "NFD189_API_BASE"
QAIU_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
QAIU_DOWNLOAD_HEADER_NAMES = {
    "accept": "Accept", "accept-language": "Accept-Language", "origin": "Origin",
    "referer": "Referer", "user-agent": "User-Agent", "x-requested-with": "X-Requested-With",
}


class ProviderError(ValueError):
    """A user-facing, non-sensitive provider failure."""


_DIAGNOSTIC_CONTEXT = threading.local()


def _set_diagnostic_context(app, redact_values=None, **details):
    _DIAGNOSTIC_CONTEXT.app = app
    _DIAGNOSTIC_CONTEXT.details = details
    _DIAGNOSTIC_CONTEXT.redact_values = list(redact_values or [])


def _diag(event, details=None, redact_values=None):
    app = getattr(_DIAGNOSTIC_CONTEXT, "app", None)
    writer = getattr(app, "cloud_resolver_diagnostic_log", None) if app else None
    if not callable(writer):
        return
    merged = dict(getattr(_DIAGNOSTIC_CONTEXT, "details", {}) or {})
    merged.update(details or {})
    context_secrets = getattr(_DIAGNOSTIC_CONTEXT, "redact_values", []) or []
    writer(event, merged, redact_values=list(context_secrets) + list(redact_values or []))


def _diagnostic_enabled():
    app = getattr(_DIAGNOSTIC_CONTEXT, "app", None)
    enabled = getattr(app, "cloud_resolver_diagnostic_enabled", None) if app else None
    return bool(callable(enabled) and enabled())


def _diagnostic_response_body(raw):
    try:
        return json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError):
        return {"rawText": raw.decode("utf-8", errors="replace")}


def _diagnostic_request_body(request):
    raw = getattr(request, "data", None)
    if not raw:
        return None
    if not isinstance(raw, bytes):
        raw = str(raw).encode("utf-8", "replace")
    text = raw.decode("utf-8", "replace")
    content_type = str(request.get_header("Content-type") or "").lower()
    if "application/json" in content_type:
        try:
            return json.loads(text)
        except (TypeError, ValueError):
            pass
    if "application/x-www-form-urlencoded" in content_type:
        parsed = urllib.parse.parse_qs(text, keep_blank_values=True)
        return {key: values[-1] if len(values) == 1 else values for key, values in parsed.items()}
    return {"rawText": text[:MAX_PAGE_BYTES], "bytes": len(raw)}


def _diag_http_started(request, endpoint_path=""):
    if not _diagnostic_enabled():
        return
    request_headers = dict(request.header_items())
    query_params = urllib.parse.parse_qs(urlparse(request.full_url).query, keep_blank_values=True)
    safe_headers = {
        key: value for key, value in request_headers.items()
        if key.casefold() in ("accept", "accept-encoding", "content-type", "origin", "referer", "user-agent", "x-requested-with")
    }
    _diag("provider_http_request_started", {
        "method": getattr(request, "method", None) or ("POST" if request.data else "GET"),
        "requestUrl": request.full_url,
        "endpointPath": endpoint_path or urlparse(request.full_url).path,
        "requestParams": {key: values[-1] if len(values) == 1 else values for key, values in query_params.items()},
        "requestHeaders": safe_headers,
        "requestHeaderNames": sorted(request_headers),
        "requestBodyBytes": len(request.data or b"") if isinstance(request.data, bytes) else 0,
        "requestBody": _diagnostic_request_body(request),
    })


def _diag_http_response(response, raw, started, endpoint_path="", body=None, truncated=False):
    if not _diagnostic_enabled():
        return
    headers = getattr(response, "headers", {}) or {}
    safe_headers = {
        key: value for key, value in headers.items()
        if key.casefold() in ("content-type", "content-length", "content-encoding", "date", "server", "retry-after", "x-request-id", "trace-id")
    }
    _diag("provider_http_response_received", {
        "endpointPath": endpoint_path or urlparse(response.geturl()).path,
        "responseUrl": response.geturl(),
        "httpStatus": getattr(response, "status", None) or response.getcode(),
        "elapsedMs": round((time.monotonic() - started) * 1000),
        "responseHeaders": safe_headers,
        "responseBodyBytes": len(raw or b""),
        "responseBodyTruncated": bool(truncated),
        "responseBody": body if body is not None else _diagnostic_response_body(raw or b""),
    })


def _diag_http_failure(request, started, exc):
    if not _diagnostic_enabled():
        return
    _diag("provider_http_request_failed", {
        "endpointPath": urlparse(request.full_url).path,
        "httpStatus": getattr(exc, "code", None),
        "elapsedMs": round((time.monotonic() - started) * 1000),
        "errorType": type(exc).__name__,
        "error": str(getattr(exc, "reason", exc)),
    })


def _qaiu_api_key(app, store):
    """Read the aggregate resolver key without ever returning it to an API caller."""
    encrypted = (store.get("qaiuApiKeyEncrypted") or "").strip()
    saved = _unprotect(app, encrypted) if encrypted else ""
    return saved or os.environ.get(QAIU_API_KEY_ENV, "").strip()


def _normalize_qaiu_api_base(value):
    value = str(value or "").strip()
    if not value or len(value) > 512 or any(char.isspace() for char in value):
        raise ValueError("请输入有效的聚合解析服务地址。")
    try:
        parsed = urllib.parse.urlsplit(value)
    except ValueError as exc:
        raise ValueError("服务地址格式无效。") from exc
    if (parsed.scheme.lower() not in ("http", "https") or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise ValueError("服务地址必须是有效的 HTTP 或 HTTPS 基础地址，且不能包含账号、参数或片段。")
    try:
        parsed.port
    except ValueError as exc:
        raise ValueError("服务地址中的端口无效。") from exc
    if parsed.scheme.lower() == "http":
        hostname = parsed.hostname.lower()
        try:
            is_loopback = ipaddress.ip_address(hostname).is_loopback
        except ValueError:
            is_loopback = hostname == "localhost"
        if not is_loopback:
            raise ValueError("为保护 API Key，HTTP 地址仅允许本机回环地址；其他地址请使用 HTTPS。")
    return urllib.parse.urlunsplit((parsed.scheme.lower(), parsed.netloc, parsed.path.rstrip("/"), "", ""))


def _qaiu_configured_api_base(store):
    configured = str((store or {}).get("qaiuApiBase") or os.environ.get(QAIU_API_BASE_ENV, "")).strip()
    if not configured:
        return None
    try:
        return _normalize_qaiu_api_base(configured)
    except ValueError as exc:
        raise ProviderError("QAIU_API_BASE_INVALID") from exc


def _qaiu_api_base_for_display(store):
    try:
        return _qaiu_configured_api_base(store) or QAIU_API_BASE
    except ProviderError:
        return ""


def _qaiu_error(status=0, payload=None):
    payload = payload if isinstance(payload, dict) else {}
    try:
        code = int(payload.get("code") or 0)
    except (TypeError, ValueError):
        code = 0
    if status == 401 or code == 401:
        return "QAIU_API_KEY_INVALID"
    if status == 403 or code == 403:
        return "QAIU_QUOTA_EXHAUSTED"
    if status >= 500 or code >= 500:
        return "QAIU_PARSE_FAILED"
    if status >= 400 or code == 400:
        return "QAIU_LINK_UNSUPPORTED"
    return "QAIU_PARSE_FAILED"


def _qaiu_request(path, params=None, api_key="", require_api_key=True, api_base=None):
    if require_api_key and not str(api_key or "").strip():
        _diag("upstream_request_skipped", {"endpointPath": str(path or ""), "reason": "QAIU_API_KEY_REQUIRED"})
        raise ProviderError("QAIU_API_KEY_REQUIRED")
    query = urllib.parse.urlencode({key: value for key, value in (params or {}).items() if value is not None})
    try:
        base = _normalize_qaiu_api_base(api_base or QAIU_API_BASE)
    except ValueError as exc:
        _diag("upstream_request_skipped", {"endpointPath": str(path or ""), "reason": "QAIU_API_BASE_INVALID", "error": str(exc)})
        raise ProviderError("QAIU_API_BASE_INVALID") from exc
    endpoint = base + "/" + str(path or "").lstrip("/")
    headers = {"Accept": "application/json", "User-Agent": "ToolboxCloudResolver/1.0"}
    if api_key:
        headers["X-API-Key"] = str(api_key).strip()
    request = urllib.request.Request(endpoint + (("?" + query) if query else ""), headers=headers)
    started = time.monotonic()
    safe_params = dict(params or {})
    if safe_params.get("pwd"):
        safe_params["pwd"] = "[已脱敏]"
    request_secrets = [api_key, (params or {}).get("pwd", "")]
    _diag("upstream_request_started", {
        "method": "GET", "endpoint": endpoint, "endpointPath": "/" + str(path or "").lstrip("/"),
        "timeoutSeconds": HTTP_TIMEOUT,
        "credentialPresent": bool(api_key),
        "requestHeaders": {"Accept": headers["Accept"], "User-Agent": headers["User-Agent"]},
        "requestParams": safe_params,
    }, redact_values=request_secrets)
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT) as response:
            raw = response.read(QAIU_MAX_RESPONSE_BYTES + 1)
            status = getattr(response, "status", None) or response.getcode()
            response_headers = {key: value for key, value in response.headers.items()
                                if key.casefold() in ("content-type", "content-length", "date", "server", "retry-after", "x-request-id", "trace-id")}
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read(QAIU_MAX_RESPONSE_BYTES + 1)
        except Exception:
            raw = b""
        response_body = _diagnostic_response_body(raw)
        mapped_error = _qaiu_error(exc.code, response_body if isinstance(response_body, dict) else None)
        error_headers = {key: value for key, value in (exc.headers.items() if exc.headers else [])
                         if key.casefold() in ("content-type", "content-length", "date", "server", "retry-after", "x-request-id", "trace-id")}
        _diag("upstream_response_received", {
            "endpoint": endpoint, "httpStatus": exc.code, "elapsedMs": round((time.monotonic() - started) * 1000),
            "responseHeaders": error_headers, "responseBodyBytes": len(raw),
            "responseBodyTruncated": len(raw) > QAIU_MAX_RESPONSE_BYTES,
            "responseBody": response_body, "mappedError": mapped_error,
        }, redact_values=request_secrets)
        raise ProviderError(mapped_error) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        _diag("upstream_request_failed", {
            "endpoint": endpoint, "elapsedMs": round((time.monotonic() - started) * 1000),
            "errorType": type(exc).__name__, "error": str(getattr(exc, "reason", exc)),
            "mappedError": "PROVIDER_UNAVAILABLE",
        }, redact_values=request_secrets)
        raise ProviderError("PROVIDER_UNAVAILABLE") from exc
    if len(raw) > QAIU_MAX_RESPONSE_BYTES:
        _diag("upstream_response_received", {
            "endpoint": endpoint, "httpStatus": status, "elapsedMs": round((time.monotonic() - started) * 1000),
            "responseHeaders": response_headers, "responseBodyBytes": len(raw), "responseBodyTruncated": True,
            "responseBody": _diagnostic_response_body(raw[:QAIU_MAX_RESPONSE_BYTES]),
            "mappedError": "PROVIDER_RESPONSE_TOO_LARGE",
        }, redact_values=request_secrets)
        raise ProviderError("PROVIDER_RESPONSE_TOO_LARGE")
    try:
        payload = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError) as exc:
        _diag("upstream_response_received", {
            "endpoint": endpoint, "httpStatus": status, "elapsedMs": round((time.monotonic() - started) * 1000),
            "responseHeaders": response_headers, "responseBodyBytes": len(raw),
            "responseBody": _diagnostic_response_body(raw), "errorType": type(exc).__name__,
            "error": str(exc), "mappedError": "PROVIDER_BAD_RESPONSE",
        }, redact_values=request_secrets)
        raise ProviderError("PROVIDER_BAD_RESPONSE") from exc
    if not isinstance(payload, dict):
        _diag("upstream_response_received", {
            "endpoint": endpoint, "httpStatus": status, "elapsedMs": round((time.monotonic() - started) * 1000),
            "responseHeaders": response_headers, "responseBodyBytes": len(raw),
            "responseBody": payload, "mappedError": "PROVIDER_BAD_RESPONSE",
        }, redact_values=request_secrets)
        raise ProviderError("PROVIDER_BAD_RESPONSE")
    mapped_error = ""
    if status >= 400 or (payload.get("code") not in (None, 200, "200") or payload.get("success") is False):
        mapped_error = _qaiu_error(status, payload)
    if "data" not in payload:
        mapped_error = mapped_error or "PROVIDER_BAD_RESPONSE"
    _diag("upstream_response_received", {
        "endpoint": endpoint, "httpStatus": status, "elapsedMs": round((time.monotonic() - started) * 1000),
        "responseHeaders": response_headers, "responseBodyBytes": len(raw), "responseBodyTruncated": False,
        "responseBody": payload, "mappedError": mapped_error,
    }, redact_values=request_secrets)
    if mapped_error:
        raise ProviderError(mapped_error)
    if "data" not in payload:
        raise ProviderError("PROVIDER_BAD_RESPONSE")
    return payload


def _qaiu_link_details(payload):
    data = payload.get("data") if isinstance(payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    share = data.get("shareLinkInfo") if isinstance(data.get("shareLinkInfo"), dict) else {}
    name = str(share.get("panName") or data.get("panName") or data.get("providerName") or "").strip()
    kind = str(share.get("type") or data.get("type") or "").strip().lower()
    other = share.get("otherParam") if isinstance(share.get("otherParam"), dict) else {}
    return name[:80], kind[:40], other


def _qaiu_download_headers(other_param, kind=""):
    result = {}

    def add(name, value):
        normalized = QAIU_DOWNLOAD_HEADER_NAMES.get(str(name or "").strip().lower())
        text = str(value or "").strip()
        if normalized and text and len(text) <= 2048 and "\r" not in text and "\n" not in text:
            result[normalized] = text

    if isinstance(other_param, dict):
        for name, value in other_param.items():
            if str(name).lower() == "ua":
                add("User-Agent", value)
            elif str(name).lower() == "headers" and isinstance(value, dict):
                for header, header_value in value.items():
                    add(header, header_value)
            else:
                add(name, value)
    kind = str(kind or "").lower()
    if kind == "cow" and "Referer" not in result:
        result["Referer"] = "https://cowtransfer.com/"
    elif kind == "pcx" and "Referer" not in result:
        result["Referer"] = "https://pan-yz.chaoxing.com/"
    return result


def _qaiu_safe_https_url(value, resolve=False):
    parsed = urlparse(str(value or ""))
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not host or parsed.username or parsed.password:
        return False
    try:
        if parsed.port not in (None, 443):
            return False
    except ValueError:
        return False
    if host in ("localhost", "localhost.localdomain") or host.endswith((".localhost", ".local", ".internal")):
        return False
    try:
        address = ipaddress.ip_address(host)
        return address.is_global
    except ValueError:
        pass
    if not resolve:
        return True
    try:
        addresses = {item[4][0].split("%", 1)[0] for item in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)}
        return bool(addresses) and all(ipaddress.ip_address(item).is_global for item in addresses)
    except (OSError, ValueError):
        return False


class _QaiuDownloadRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _qaiu_safe_https_url(newurl, resolve=True):
            raise ProviderError("PROVIDER_REDIRECT_BLOCKED")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def qaiu_download_response(url, headers=None, timeout=60, method="GET"):
    if not _qaiu_safe_https_url(url, resolve=True):
        raise ProviderError("PROVIDER_HOST_BLOCKED")
    request = urllib.request.Request(url, headers=headers or {}, method=method)
    return urllib.request.build_opener(_QaiuDownloadRedirect()).open(request, timeout=timeout)


def _feiji_gf_mul(a, b):
    result = 0
    for _ in range(8):
        if b & 1:
            result ^= a
        a = ((a << 1) ^ (0x11B if a & 0x80 else 0)) & 0xFF
        b >>= 1
    return result


def _feiji_sbox():
    table = []
    for value in range(256):
        inverse = 0 if value == 0 else next(x for x in range(1, 256) if _feiji_gf_mul(value, x) == 1)
        table.append((inverse ^ ((inverse << 1) | (inverse >> 7)) ^ ((inverse << 2) | (inverse >> 6)) ^
                      ((inverse << 3) | (inverse >> 5)) ^ ((inverse << 4) | (inverse >> 4)) ^ 0x63) & 0xFF)
    return table


def _feiji_encrypt_hex(value):
    """Match the small AES-128-ECB hex helper used by the Feijipan web client."""
    key = FEIJI_AES_KEY
    sbox = _feiji_sbox()
    words = [list(key[i:i + 4]) for i in range(0, 16, 4)]
    rcon = 1
    for index in range(4, 44):
        temp = words[index - 1][:]
        if index % 4 == 0:
            temp = [sbox[temp[1]], sbox[temp[2]], sbox[temp[3]], sbox[temp[0]]]
            temp[0] ^= rcon
            rcon = _feiji_gf_mul(rcon, 2)
        words.append([words[index - 4][j] ^ temp[j] for j in range(4)])
    round_keys = [sum(words[4 * i:4 * i + 4], []) for i in range(11)]
    data = bytearray(str(value).encode("utf-8"))
    pad = 16 - len(data) % 16
    data.extend(bytes([pad]) * pad)
    output = bytearray()
    for offset in range(0, len(data), 16):
        state = list(data[offset:offset + 16])
        for index in range(16):
            state[index] ^= round_keys[0][index]
        for round_no in range(1, 11):
            state = [sbox[x] for x in state]
            state = [state[0], state[5], state[10], state[15], state[4], state[9], state[14], state[3],
                     state[8], state[13], state[2], state[7], state[12], state[1], state[6], state[11]]
            if round_no != 10:
                mixed = []
                for col in range(4):
                    a = state[col * 4:col * 4 + 4]
                    mixed.extend([_feiji_gf_mul(a[0], 2) ^ _feiji_gf_mul(a[1], 3) ^ a[2] ^ a[3],
                                  a[0] ^ _feiji_gf_mul(a[1], 2) ^ _feiji_gf_mul(a[2], 3) ^ a[3],
                                  a[0] ^ a[1] ^ _feiji_gf_mul(a[2], 2) ^ _feiji_gf_mul(a[3], 3),
                                  _feiji_gf_mul(a[0], 3) ^ a[1] ^ a[2] ^ _feiji_gf_mul(a[3], 2)])
                state = mixed
            state = [state[i] ^ round_keys[round_no][i] for i in range(16)]
        output.extend(state)
    return bytes(output).hex().upper()


def _decode_text(raw):
    text = raw.decode("utf-8", "replace")
    return text


def _allowed_lanzou_host(url):
    parsed = urlparse(str(url or ""))
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https":
        return False
    return any(host == domain or host.endswith("." + domain) for domain in LANZOU_HOSTS | {
        "woozooo.com", "lanzouw.com", "lanrar.com", "lanzouc.com"})


class _LanzouRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not _allowed_lanzou_host(newurl):
            raise ProviderError("PROVIDER_REDIRECT_BLOCKED")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class _LanzouDownloadRedirect(urllib.request.HTTPRedirectHandler):
    """Allow the provider's short-lived CDN host after ajax.php verification."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urlparse(str(newurl or ""))
        host = (parsed.hostname or "").lower().rstrip(".")
        allowed = _allowed_lanzou_host(newurl) or any(
            host == domain or host.endswith("." + domain) for domain in LANZOU_DOWNLOAD_HOSTS
        )
        if parsed.scheme != "https" or not allowed:
            raise ProviderError("PROVIDER_REDIRECT_BLOCKED")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _read_http(opener, request, limit=MAX_PAGE_BYTES):
    if not _allowed_lanzou_host(request.full_url):
        raise ProviderError("PROVIDER_HOST_BLOCKED")
    started = time.monotonic()
    _diag_http_started(request)
    try:
        with opener.open(request, timeout=HTTP_TIMEOUT) as response:
            chunks, size = [], 0
            while True:
                chunk = response.read(min(65536, limit - size + 1))
                if not chunk:
                    break
                chunks.append(chunk)
                size += len(chunk)
                if size > limit:
                    raw = b"".join(chunks)
                    _diag_http_response(response, raw, started, body=_diagnostic_response_body(raw), truncated=True)
                    raise ProviderError("PROVIDER_RESPONSE_TOO_LARGE")
            raw = b"".join(chunks)
            body = raw
            if "gzip" in str(response.headers.get("Content-Encoding") or "").lower():
                try:
                    body = gzip.decompress(body)
                except (OSError, EOFError) as exc:
                    _diag_http_response(response, raw, started, body={"error": str(exc)}, truncated=False)
                    raise ProviderError("PROVIDER_BAD_RESPONSE") from exc
            _diag_http_response(response, raw, started, body=_diagnostic_response_body(body))
            return body, response.geturl()
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read(limit + 1)
        except Exception:
            raw = b""
        _diag_http_response(exc, raw[:limit], started, body=_diagnostic_response_body(raw[:limit]), truncated=len(raw) > limit)
        raise ProviderError("PROVIDER_HTTP_ERROR") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        _diag_http_failure(request, started, exc)
        raise ProviderError("PROVIDER_UNAVAILABLE") from exc


def _js_var(source, name):
    match = re.search(r"(?:var\s+)?" + re.escape(name) + r"\s*=\s*['\"]([^'\"]*)['\"]", source)
    return match.group(1) if match else ""


def _js_field(source, name):
    match = re.search(r"['\"]" + re.escape(name) + r"['\"]\s*:\s*['\"]([^'\"]*)['\"]", source)
    return match.group(1) if match else ""


def _lanzou_opener(cookie_jar=None):
    jar = urllib.request.HTTPCookieProcessor(cookie_jar or http.cookiejar.CookieJar())
    return urllib.request.build_opener(jar, _LanzouRedirect())


def _lanzou_read(opener, cookie_jar, request, limit=MAX_PAGE_BYTES):
    """Read a page and transparently solve Lanzou's anti-hotlink cookie page."""
    raw, final_url = _read_http(opener, request, limit)
    source = _decode_text(raw)
    cookie_value = _lanzou_challenge_cookie(source)
    if not cookie_value:
        return raw, final_url
    _lanzou_set_cookie(cookie_jar, request.full_url, "acw_sc__v2", cookie_value)
    retry_headers = dict(request.headers)
    retry_headers["Cookie"] = _lanzou_cookie_header(cookie_jar, retry_headers.get("Cookie", ""))
    retry = urllib.request.Request(request.full_url, headers=retry_headers, method=getattr(request, "method", None))
    return _read_http(opener, retry, limit)


def _lanzou_cookie_header(jar, extra=""):
    """Return one deterministic Cookie header from a CookieJar and extras.

    Lanzou's CDN changes ``acw_tc``/``down_ip`` while the confirmation page is
    being loaded.  A header captured before that response is stale and makes
    ``file/ajax.php`` answer ``?SignError``.  Keep the caller's cookies, then
    let the current jar value win for duplicate names.
    """
    values = {}
    for part in str(extra or "").split(";"):
        name, separator, value = part.strip().partition("=")
        if separator and name.strip():
            values[name.strip()] = value.strip()
    for cookie in jar:
        values[cookie.name] = cookie.value
    return "; ".join(name + "=" + value for name, value in values.items())


def _lanzou_set_cookie(jar, url, name, value):
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if not host:
        return
    jar.set_cookie(http.cookiejar.Cookie(
        version=0, name=str(name), value=str(value), port=None,
        port_specified=False, domain=host, domain_specified=False,
        domain_initial_dot=False, path="/", path_specified=True,
        secure=parsed.scheme.lower() == "https", expires=None, discard=True,
        comment=None, comment_url=None, rest={}, rfc2109=False,
    ))


def _lanzou_challenge_cookie(source):
    """Return the acw_sc__v2 value used by the current Lanzou anti-hotlink page."""
    match = re.search(r"var\s+arg1\s*=\s*['\"]([0-9a-fA-F]+)['\"]", source or "")
    if not match:
        return ""
    arg = match.group(1).upper()
    if len(arg) != len(LANZOU_CHALLENGE_ORDER) or len(arg) != len(LANZOU_CHALLENGE_KEY):
        return ""
    shuffled = [""] * len(arg)
    for index, char in enumerate(arg):
        try:
            shuffled[LANZOU_CHALLENGE_ORDER.index(index + 1)] = char
        except ValueError:
            return ""
    try:
        return "".join(format(int("".join(shuffled[index:index + 2]), 16) ^ int(LANZOU_CHALLENGE_KEY[index:index + 2], 16), "02x")
                       for index in range(0, len(shuffled), 2))
    except (TypeError, ValueError):
        return ""


def lanzou_download_response(url, headers=None, timeout=60, method="GET"):
    """Open a Lanzou file URL, solving its JavaScript cookie challenge if needed.

    The returned object is a live urllib response and must be closed by the caller.
    """
    if not _allowed_lanzou_host(url):
        raise ProviderError("PROVIDER_HOST_BLOCKED")
    request_headers = dict(headers or {})
    request_headers.setdefault("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ToolboxAdminApi")
    request_headers.setdefault("Accept", "*/*")
    request_headers.setdefault("Accept-Encoding", "identity")
    request_headers.setdefault("Referer", url)
    jar = http.cookiejar.CookieJar()
    # A verified file URL commonly redirects straight to a short-lived
    # ``webgetstore.com``/``lanrar.com`` CDN object.  Use the download-aware
    # redirect policy for the whole handshake; the old Lanzou-only handler
    # rejected that final 302 before the binary response could be returned.
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar), _LanzouDownloadRedirect()
    )
    request = urllib.request.Request(url, headers=request_headers, method=str(method or "GET").upper())
    try:
        response = opener.open(request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        response = exc
    if response.getcode() >= 400:
        response.close()
        raise ProviderError("PROVIDER_HTTP_ERROR")
    content_type = str(response.headers.get("Content-Type") or "").lower()
    if "html" not in content_type:
        return response
    try:
        challenge_body = response.read(128 * 1024)
        content_encoding = str(response.headers.get("Content-Encoding") or "").lower()
        if "gzip" in content_encoding:
            try:
                challenge_body = gzip.decompress(challenge_body)
            except (OSError, EOFError):
                raise ProviderError("PROVIDER_BAD_RESPONSE")
        challenge_source = challenge_body.decode("utf-8", "replace")
    finally:
        response.close()
    cookie_value = _lanzou_challenge_cookie(challenge_source)
    if not cookie_value:
        raise ProviderError("DOWNLOAD_URL_UNAVAILABLE")
    # Store the challenge cookie in the jar.  Sending it only as a manually
    # assembled header prevents CookieJar from tracking the provider's newer
    # anti-bot cookies and is the usual cause of the second-layer SignError.
    _lanzou_set_cookie(jar, url, "acw_sc__v2", cookie_value)
    retry_headers = dict(request_headers)
    existing_cookie = retry_headers.get("Cookie", "").strip()
    retry_headers["Cookie"] = _lanzou_cookie_header(jar, existing_cookie)
    retry_request = urllib.request.Request(url, headers=retry_headers, method=str(method or "GET").upper())
    try:
        response = opener.open(retry_request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        response = exc
    if response.getcode() >= 400:
        response.close()
        raise ProviderError("PROVIDER_HTTP_ERROR")
    if "html" not in str(response.headers.get("Content-Type") or "").lower():
        return response

    # Some Lanzou CDN nodes add a second, browser-only confirmation page. It
    # exposes the same file/sign pair used by its ajax.php request. Calling it
    # here keeps the client from ever receiving that HTML as a download.
    try:
        verify_body = response.read(256 * 1024)
        verify_encoding = str(response.headers.get("Content-Encoding") or "").lower()
        verify_url = response.geturl()
    finally:
        response.close()
    if "gzip" in verify_encoding:
        try:
            verify_body = gzip.decompress(verify_body)
        except (OSError, EOFError):
            raise ProviderError("PROVIDER_BAD_RESPONSE")
    verify_source = verify_body.decode("utf-8", "replace")
    verify_match = re.search(
        r"['\"]file['\"]\s*:\s*['\"]([^'\"]+)['\"]\s*,\s*"
        r"['\"]el['\"]\s*:\s*el\s*,\s*['\"]sign['\"]\s*:\s*['\"]([^'\"]+)['\"]",
        verify_source,
        re.I,
    )
    if not verify_match:
        raise ProviderError("DOWNLOAD_URL_UNAVAILABLE")
    verify_file, verify_sign = verify_match.groups()
    ajax_url = urljoin(verify_url, "ajax.php")
    # Build this after the confirmation response has been consumed: that
    # response normally sets ``down_ip`` and can rotate the CDN session cookie.
    cookie_header = _lanzou_cookie_header(jar, existing_cookie)
    ajax_headers = dict(retry_headers)
    ajax_headers.update({
        "Cookie": cookie_header,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://" + (urlparse(verify_url).hostname or ""),
        "Referer": verify_url,
    })
    ajax_opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar), _LanzouRedirect()
    )
    # el=2 is the normal "verify and download" action. Older nodes use 1 or
    # 3, so retry those only when the response is a non-success JSON result.
    result = None
    for element in ("2", "1", "3"):
        body = urllib.parse.urlencode({
            "file": verify_file,
            "el": element,
            "sign": verify_sign,
        }).encode("utf-8")
        ajax_request = urllib.request.Request(ajax_url, data=body, headers=ajax_headers, method="POST")
        try:
            ajax_response = ajax_opener.open(ajax_request, timeout=timeout)
            ajax_raw = ajax_response.read(128 * 1024)
            ajax_encoding = str(ajax_response.headers.get("Content-Encoding") or "").lower()
            ajax_response.close()
        except urllib.error.HTTPError as exc:
            try:
                ajax_raw = exc.read(128 * 1024)
            finally:
                exc.close()
            ajax_encoding = ""
        if "gzip" in ajax_encoding:
            try:
                ajax_raw = gzip.decompress(ajax_raw)
            except (OSError, EOFError):
                continue
        try:
            candidate = json.loads(ajax_raw.decode("utf-8", "replace"))
        except (TypeError, ValueError):
            continue
        candidate_url = str(candidate.get("url") or "")
        if str(candidate.get("zt")) == "1" and candidate_url and candidate_url != "?SignError":
            result = candidate
            break
    if not result:
        raise ProviderError("DOWNLOAD_URL_UNAVAILABLE")

    target_url = str(result.get("url") or "")
    if not re.match(r"^https://", target_url, re.I):
        target_url = urljoin(str(result.get("dom") or verify_url), target_url)
    parsed_target = urlparse(target_url)
    target_host = (parsed_target.hostname or "").lower().rstrip(".")
    if parsed_target.scheme != "https" or not (
        _allowed_lanzou_host(target_url)
        or any(target_host == domain or target_host.endswith("." + domain) for domain in LANZOU_DOWNLOAD_HOSTS)
    ):
        raise ProviderError("PROVIDER_REDIRECT_BLOCKED")
    final_headers = dict(request_headers)
    final_headers["Referer"] = verify_url
    final_headers["Cookie"] = _lanzou_cookie_header(jar, existing_cookie)
    final_request = urllib.request.Request(target_url, headers=final_headers, method=str(method or "GET").upper())
    try:
        final_response = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(jar), _LanzouDownloadRedirect()
        ).open(final_request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        exc.close()
        raise ProviderError("PROVIDER_HTTP_ERROR") from exc
    if "html" in str(final_response.headers.get("Content-Type") or "").lower():
        final_response.close()
        raise ProviderError("DOWNLOAD_URL_UNAVAILABLE")
    return final_response


def _lanzou_json(opener, url, data, referer):
    body = urllib.parse.urlencode(data).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST", headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": referer,
        "X-Requested-With": "XMLHttpRequest",
    })
    raw, _ = _read_http(opener, request)
    try:
        return json.loads(_decode_text(raw))
    except (TypeError, ValueError) as exc:
        raise ProviderError("PROVIDER_BAD_RESPONSE") from exc


def _lanzou_file(opener, cookie_jar, page_url, file_id, name="", size=0, referer=""):
    raw, final_url = _lanzou_read(opener, cookie_jar, urllib.request.Request(page_url, headers={
        "User-Agent": "Mozilla/5.0", "Referer": referer or page_url}), MAX_PAGE_BYTES)
    source = _decode_text(raw)
    iframe = re.search(r'<iframe[^>]+src=["\']([^"\']*/fn\?[^"\']+)', source, re.I)
    if not iframe:
        if re.search(r"密码|提取码|访问码|password", source, re.I):
            raise ProviderError("ACCESS_CODE_REQUIRED")
        raise ProviderError("FILE_PAGE_UNSUPPORTED")
    iframe_url = urljoin(final_url, html.unescape(iframe.group(1)))
    iframe_raw, iframe_final = _read_http(opener, urllib.request.Request(iframe_url, headers={
        "User-Agent": "Mozilla/5.0", "Referer": page_url}), MAX_PAGE_BYTES)
    iframe_source = _decode_text(iframe_raw)
    ajaxdata = _js_var(iframe_source, "ajaxdata")
    sign = _js_var(iframe_source, "wp_sign")
    domains = [x for x in (_js_var(iframe_source, "domain1"), _js_var(iframe_source, "domain2")) if x]
    domains = [x for x in domains if _allowed_lanzou_host(x)]
    if not ajaxdata or not sign or not domains:
        raise ProviderError("FILE_PAGE_UNSUPPORTED")
    result = None
    success_result = None
    download_urls = []
    for api_url in domains:
        try:
            result = _lanzou_json(opener, api_url, {
                "action": "downprocess", "websignkey": ajaxdata, "signs": ajaxdata,
                "sign": sign, "websign": "", "kd": "0", "ves": "1",
            }, iframe_final)
        except ProviderError:
            continue
        if str(result.get("zt")) == "1" and result.get("url") and result.get("dom"):
            success_result = result
            download_host = str(result["dom"]).rstrip("/")
            if not _allowed_lanzou_host(download_host):
                continue
            url_part = str(result["url"])
            if url_part.startswith("?"):
                url_part = "?" + urllib.parse.quote(url_part[1:], safe="/=&+%")
            else:
                url_part = urllib.parse.quote(url_part, safe="/?=&+%")
            download_urls.append(download_host + "/file/" + url_part + "&toolsdown")
            if len(download_urls) >= 2:
                break
    if not isinstance(success_result, dict) or not download_urls:
        info = str((result or {}).get("info") or "")
        raise ProviderError("ACCESS_CODE_REQUIRED" if re.search(r"密码|提取码|访问码", info) else "DOWNLOAD_URL_UNAVAILABLE")
    return {"id": str(file_id), "name": html.unescape(str(name or "未命名文件"))[:240],
            "path": "/" + str(name or ""), "size": max(0, int(size or 0)), "type": "file",
            "downloadUrl": download_urls[0], "backupUrl": download_urls[1] if len(download_urls) > 1 else ""}


def _lanzou_single_file_metadata(page, final_url):
    """Extract best-effort metadata from the newer direct iframe share page."""
    title_match = re.search(r"<title[^>]*>(.*?)</title>", page or "", re.I | re.S)
    name = html.unescape(re.sub(r"\s+-\s*蓝奏云\s*$", "", title_match.group(1).strip(), flags=re.I)) if title_match else "未命名文件"
    size_match = re.search(r"(?:文件大小|文件大小：|size)[^<\d]*([\d.]+\s*(?:B|K|KB|M|MB|G|GB|T|TB))", page or "", re.I)
    size = _lanzou_size(size_match.group(1)) if size_match else 0
    file_id = urlparse(final_url).path.rstrip("/").rsplit("/", 1)[-1] or "share-file"
    return file_id, name, size


def _lanzou_size(value):
    match = re.match(r"\s*([\d.]+)\s*(B|K|KB|M|MB|G|GB|T|TB)?", str(value or ""), re.I)
    if not match:
        return 0
    number, unit = float(match.group(1)), (match.group(2) or "B").upper()
    factor = {"B": 1, "K": 1024, "KB": 1024, "M": 1024 ** 2, "MB": 1024 ** 2,
              "G": 1024 ** 3, "GB": 1024 ** 3, "T": 1024 ** 4, "TB": 1024 ** 4}.get(unit, 1)
    return int(number * factor)


def _cloud_proxy_url(handler, source_id, api_key):
    return handler.base_url().rstrip("/") + "/api/cloud-resolver/download-file?sourceId=" + urllib.parse.quote(str(source_id)) + "&key=" + urllib.parse.quote(str(api_key))


def _lanzou_parse(url, access_code=""):
    cookie_jar = http.cookiejar.CookieJar()
    opener = _lanzou_opener(cookie_jar)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    raw, final_url = _lanzou_read(opener, cookie_jar, request)
    page = _decode_text(raw)
    # Password-protected single-file shares use a separate page script rather
    # than the legacy uid/puid file-list API.
    protected_endpoint = re.search(r"(?:url|action\s*:\s*).{0,180}?(https?://[^'\"]*ajaxfile\.php\?file=([A-Za-z0-9_-]+))", page, re.I | re.S)
    protected_signs = [value for value in re.findall(r"var\s+isngis\s*=\s*['\"]([^'\"]+)['\"]", page, re.I) if value]
    if protected_endpoint and protected_signs:
        data = _lanzou_json(opener, protected_endpoint.group(1), {
            "action": "downprocess", "sign": protected_signs[-1], "kd": "1", "p": str(access_code or "")[:64],
        }, final_url)
        if str(data.get("zt")) != "1":
            info = str(data.get("inf") or data.get("info") or "")
            raise ProviderError("ACCESS_CODE_INVALID" if access_code else "ACCESS_CODE_REQUIRED")
        download_host = str(data.get("dom") or "").rstrip("/")
        if not download_host or not _allowed_lanzou_host(download_host) or not data.get("url"):
            raise ProviderError("DOWNLOAD_URL_UNAVAILABLE")
        url_part = str(data["url"])
        if url_part.startswith("?"):
            url_part = "?" + urllib.parse.quote(url_part[1:], safe="/=&+%")
        else:
            url_part = urllib.parse.quote(url_part, safe="/?=&+%")
        title_match = re.search(r"<title[^>]*>(.*?)</title>", page, re.I | re.S)
        name = html.unescape((title_match.group(1).strip() if title_match else "未命名文件"))
        size_match = re.search(r"(?:文件大小|大小)[^<\d]*([\d.]+\s*(?:B|K|KB|M|MB|G|GB|T|TB))", page, re.I)
        return [{"id": protected_endpoint.group(2), "name": name[:240], "path": "/" + name[:240],
                 "size": _lanzou_size(size_match.group(1)) if size_match else 0, "type": "file",
                 "downloadUrl": download_host + "/file/" + url_part + "&toolsdown", "backupUrl": ""}]
    if re.search(r"密码|提取码|访问码|password", page, re.I) and not _js_field(page, "puid"):
        raise ProviderError("ACCESS_CODE_REQUIRED")
    filemore = re.search(r"filemoreajax\.php\?file=([A-Za-z0-9_-]+)", page, re.I)
    # Newer Lanzou single-file shares expose the download iframe directly and
    # omit the legacy uid/puid/filemoreajax metadata used by folder shares.
    direct_iframe = re.search(r'<iframe[^>]+src=["\']([^"\']*/fn\?[^"\']+)', page, re.I)
    if direct_iframe and not filemore:
        file_id, name, size = _lanzou_single_file_metadata(page, final_url)
        return [_lanzou_file(opener, cookie_jar, final_url, file_id, name, size, final_url)]
    fid = _js_var(page, "fid") or (filemore.group(1) if filemore else "")
    uid, puid = _js_field(page, "uid"), _js_field(page, "puid")
    token, key = _js_var(page, "ib4k4x"), _js_var(page, "_h2w6q")
    token = token or _js_var(page, "ibjk9d")
    key = key or _js_var(page, "_hhwb6")
    if not token or not key:
        token_ref = re.search(r"['\"]t['\"]\s*:\s*([A-Za-z_$][\w$]*)", page)
        key_ref = re.search(r"['\"]k['\"]\s*:\s*([A-Za-z_$][\w$]*)", page)
        token = _js_var(page, token_ref.group(1)) if token_ref else token
        key = _js_var(page, key_ref.group(1)) if key_ref else key
    if not fid or not uid or not puid or not token or not key:
        raise ProviderError("SHARE_PAGE_UNSUPPORTED")
    data = _lanzou_json(opener, urljoin(final_url, "/filemoreajax.php?file=" + urllib.parse.quote(fid)), {
        "lx": "2", "fid": fid, "uid": uid, "puid": puid, "pg": "1", "rep": "0",
        "t": token, "k": key, "up": "1", "ls": "1", "pwd": str(access_code or "")[:64],
    }, final_url)
    if str(data.get("zt")) != "1":
        info = str(data.get("info") or "")
        raise ProviderError("ACCESS_CODE_REQUIRED" if re.search(r"密码|提取码|访问码", info) else "SHARE_FILES_UNAVAILABLE")
    files = []
    for item in data.get("text") or []:
        item_id = str(item.get("id") or "")
        if not item_id or item_id == "-1" or str(item.get("t")) == "1":
            continue
        item_url = urljoin(final_url, "/" + item_id)
        try:
            files.append(_lanzou_file(opener, cookie_jar, item_url, item_id, item.get("name_all") or item.get("name"),
                                      _lanzou_size(item.get("size")), final_url))
        except ProviderError as exc:
            if str(exc) == "ACCESS_CODE_REQUIRED":
                raise
            files.append({"id": item_id, "name": html.unescape(str(item.get("name_all") or item.get("name") or "未命名文件"))[:240],
                          "path": "/" + str(item.get("name_all") or item.get("name") or ""), "size": _lanzou_size(item.get("size")), "type": "file",
                          "downloadUrl": "", "errorCode": str(exc)})
    if not files:
        raise ProviderError("SHARE_FILES_EMPTY")
    return files


TIANYI_API_BASE = "https://cloud.189.cn/api"
TIANYI_REFERER_BASE = "https://cloud.189.cn/web/share?code="


def _tianyi_browser_id(share_code):
    # The public share API requires a browser identifier, but does not require
    # a user session for metadata and directory listing requests.
    return hashlib.sha256(("toolbox-tianyi:" + str(share_code)).encode("utf-8")).hexdigest()[:32]


def _tianyi_json(opener, endpoint, params, referer=""):
    query = urllib.parse.urlencode([(str(k), str(v)) for k, v in (params or {}).items() if v is not None])
    target = TIANYI_API_BASE + endpoint + ("?" + query if query else "")
    parsed = urlparse(target)
    if parsed.scheme != "https" or (parsed.hostname or "").lower() not in {"cloud.189.cn", "api.cloud.189.cn"}:
        raise ProviderError("PROVIDER_HOST_BLOCKED")
    request = urllib.request.Request(target, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "application/json;charset=UTF-8",
        "Referer": referer or "https://cloud.189.cn/",
        "Browser-Id": _tianyi_browser_id(params.get("shareCode") or params.get("shareId") or "share"),
        "Sign-Type": "1",
    })
    started = time.monotonic()
    _diag_http_started(request, endpoint)
    try:
        with opener.open(request, timeout=HTTP_TIMEOUT) as response:
            raw = response.read(MAX_PAGE_BYTES)
            _diag_http_response(response, raw, started, endpoint, truncated=len(raw) >= MAX_PAGE_BYTES)
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read(MAX_PAGE_BYTES)
            _diag_http_response(exc, raw, started, endpoint, truncated=len(raw) >= MAX_PAGE_BYTES)
            data = json.loads(raw.decode("utf-8", "replace"))
            error = _tianyi_error(data) if isinstance(data, dict) else ""
            if error:
                raise ProviderError(error) from exc
        except ProviderError:
            raise
        except Exception:
            pass
        if exc.code in (400, 404):
            raise ProviderError("SHARE_NOT_FOUND") from exc
        raise ProviderError("PROVIDER_HTTP_ERROR") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        _diag_http_failure(request, started, exc)
        raise ProviderError("PROVIDER_UNAVAILABLE") from exc
    try:
        data = json.loads(raw.decode("utf-8", "replace"))
    except (TypeError, ValueError) as exc:
        raise ProviderError("PROVIDER_RESPONSE_INVALID") from exc
    if not isinstance(data, dict):
        raise ProviderError("PROVIDER_RESPONSE_INVALID")
    return data


def _tianyi_error(data):
    code = str(data.get("res_code") or data.get("errorCode") or data.get("code") or "")
    message = str(data.get("res_message") or data.get("errorMsg") or data.get("message") or "")
    if code in {"ShareInfoNotFound", "ShareNotFound", "FileNotFound", "InvalidShareCode"}:
        return "SHARE_NOT_FOUND"
    if code in {"ErrorAccessCode", "AccessCodeError", "ShareAccessCodeFaildCountOver"}:
        return "ACCESS_CODE_INVALID"
    if "not found" in message.lower() or "不存在" in message or "无效" in message:
        return "SHARE_NOT_FOUND"
    return ""


def _tianyi_parse(url, access_code=""):
    provider, share_code = _provider_for(url)
    if provider != "tianyi" or not share_code:
        raise ProviderError("INVALID_SHARE_URL")
    opener = urllib.request.build_opener()
    referer = TIANYI_REFERER_BASE + urllib.parse.quote(share_code)
    info = _tianyi_json(opener, "/open/share/getShareInfoByCodeV2.action", {
        "shareCode": share_code, "noCache": "0.1",
    }, referer)
    error = _tianyi_error(info)
    if error:
        raise ProviderError(error)
    if str(info.get("res_code", "")) not in ("", "0"):
        raise ProviderError("SHARE_NOT_FOUND")
    share_id = str(info.get("shareId") or "")
    file_id = str(info.get("fileId") or "")
    if not file_id:
        raise ProviderError("SHARE_NOT_FOUND")
    code = str(access_code or info.get("accessCode") or "").strip()
    if info.get("needAccessCode") and not code:
        raise ProviderError("ACCESS_CODE_REQUIRED")
    if info.get("needAccessCode"):
        checked = _tianyi_json(opener, "/open/share/checkAccessCode.action", {
            "shareCode": share_code, "accessCode": code, "noCache": "0.1",
        }, referer)
        if not checked.get("success", True) or not checked.get("shareId"):
            error = _tianyi_error(checked)
            raise ProviderError(error or "ACCESS_CODE_INVALID")
        share_id = str(checked.get("shareId"))
    params = {
        "shareId": share_id, "shareMode": info.get("shareMode") or 1,
        "iconOption": 5, "pageNum": 1, "pageSize": 60,
        "fileId": file_id, "shareDirFileId": file_id,
        "isFolder": str(bool(info.get("isFolder"))).lower(),
        "orderBy": "lastOpTime", "descending": "true", "accessCode": code,
        "noCache": "0.1",
    }
    listing = _tianyi_json(opener, "/open/share/listShareDir.action", params, referer)
    error = _tianyi_error(listing)
    if error:
        raise ProviderError(error)
    file_area = listing.get("fileListAO") or {}
    rows = list(file_area.get("fileList") or [])
    folders = list(file_area.get("folderList") or [])
    files = []
    for item in folders + rows:
        item_id = str(item.get("id") or item.get("fileId") or "")
        name = html.unescape(str(item.get("name") or item.get("fileName") or "未命名文件"))[:240]
        if not item_id:
            continue
        is_folder = bool(item.get("isFolder") or item in folders or item.get("fileCount") is not None)
        files.append({
            "id": item_id, "name": name, "path": "/" + name,
            "size": 0 if is_folder else max(0, int(item.get("size") or item.get("fileSize") or 0)),
            "type": "folder" if is_folder else "file",
            "downloadUrl": str(item.get("downloadUrl") or ""),
            "backupUrl": "",
            # Tianyi's public listing API exposes file metadata but does not
            # issue anonymous download URLs. Keep the official share page so
            # clients can complete the login/transfer flow in a browser.
            "browserUrl": str(url or ""),
            "errorCode": "" if item.get("downloadUrl") else ("LOGIN_REQUIRED_FOR_DOWNLOAD" if not is_folder else ""),
        })
    if not files:
        raise ProviderError("SHARE_FILES_EMPTY")
    return files


def _feiji_request(opener, endpoint, params):
    now_ms = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    client_uuid = str((params or {}).get("_uuid") or uuid.uuid4().hex)
    request_params = {
        "devType": 6, "devModel": "Windows", "uuid": client_uuid,
        "extra": 2, "timestamp": _feiji_encrypt_hex(now_ms),
    }
    request_params.update({key: value for key, value in (params or {}).items()
                           if not str(key).startswith("_") and value is not None and value != ""})
    query = urllib.parse.urlencode(request_params)
    target = FEIJI_API_BASE + endpoint + "?" + query
    request = urllib.request.Request(target, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://share.feijipan.com",
        "Referer": "https://share.feijipan.com/",
    }, method="POST")
    started = time.monotonic()
    _diag_http_started(request, endpoint)
    try:
        with opener.open(request, timeout=HTTP_TIMEOUT) as response:
            raw = response.read(MAX_PAGE_BYTES)
            _diag_http_response(response, raw, started, endpoint, truncated=len(raw) >= MAX_PAGE_BYTES)
            data = json.loads(raw.decode("utf-8", "replace"))
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read(MAX_PAGE_BYTES)
        except Exception:
            raw = b""
        _diag_http_response(exc, raw, started, endpoint, truncated=len(raw) >= MAX_PAGE_BYTES)
        raise ProviderError("PROVIDER_HTTP_ERROR") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        _diag_http_failure(request, started, exc)
        raise ProviderError("PROVIDER_UNAVAILABLE") from exc
    if not isinstance(data, dict):
        raise ProviderError("PROVIDER_RESPONSE_INVALID")
    if int(data.get("code") or 0) not in (0, 200):
        message = str(data.get("msg") or "")
        if re.search(r"提取码|密码|验证码", message):
            raise ProviderError("ACCESS_CODE_INVALID")
        raise ProviderError("PROVIDER_RESPONSE_INVALID")
    return data


def _feiji_file_redirect(opener, share_id, file_id, browser_url="", user_id="", client_uuid=""):
    """Resolve a Feijipan file through the same signed redirect used by its web client."""
    now_ms = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    params = urllib.parse.urlencode({
        "downloadId": _feiji_encrypt_hex(str(file_id) + "|" + str(user_id or "")),
        # Match the share-page Download button. enable=0 is the preview
        # branch, while the actual download request uses enable=1.
        "enable": 1,
        "devType": 6,
        "uuid": str(client_uuid or uuid.uuid4().hex),
        "timestamp": _feiji_encrypt_hex(now_ms),
        "auth": _feiji_encrypt_hex(str(file_id) + "|" + now_ms),
        "shareId": str(share_id),
    })
    target = FEIJI_API_BASE + "/ws/file/redirect?" + params
    request = urllib.request.Request(target, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "*/*",
        "Origin": "https://share.feijipan.com",
        "Referer": browser_url or "https://share.feijipan.com/",
    })
    started = time.monotonic()
    _diag_http_started(request, "/ws/file/redirect")
    try:
        with opener.open(request, timeout=HTTP_TIMEOUT) as response:
            content_type = str(response.headers.get("Content-Type") or "").lower()
            resolved = response.geturl()
            payload = None
            raw = b""
            if "json" in content_type:
                raw = response.read(MAX_PAGE_BYTES)
                payload = json.loads(raw.decode("utf-8", "replace"))
            _diag_http_response(response, raw, started, "/ws/file/redirect", body=payload,
                                truncated=len(raw) >= MAX_PAGE_BYTES)
            if isinstance(payload, dict) and payload.get("code") not in (None, 0, 200):
                return ""
            if resolved and not resolved.startswith(FEIJI_API_BASE):
                return resolved
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError) as exc:
        _diag_http_failure(request, started, exc)
        return ""
    return ""


def _feiji_parse(url, access_code=""):
    provider, share_id = _provider_for(url)
    if provider != "xiaofeiji" or not share_id:
        raise ProviderError("INVALID_SHARE_URL")
    parsed = urlparse(url)
    query_code = urllib.parse.parse_qs(parsed.query).get("code", [""])[0]
    code = str(access_code or query_code or "").strip()
    opener = urllib.request.build_opener()
    client_uuid = uuid.uuid4().hex
    listing = _feiji_request(opener, "/ws/share/list", {
        "shareId": share_id, "code": code, "type": 0, "offset": 1, "limit": 110, "_uuid": client_uuid,
    })
    rows = listing.get("list") or []
    files = []
    browser_url = str(url or "")
    for group in rows:
        if not isinstance(group, dict):
            continue
        nested = group.get("fileList") if isinstance(group.get("fileList"), list) else [group]
        for item in nested:
            if not isinstance(item, dict):
                continue
            item_id = str(item.get("fileId") or item.get("id") or "")
            if not item_id:
                continue
            name = html.unescape(str(item.get("fileName") or item.get("name") or "未命名文件"))[:240]
            is_folder = bool(item.get("folderId") is not None or int(item.get("fileType") or 1) == 2)
            download_url = str(item.get("downloadUrl") or "")
            if not download_url and not is_folder:
                download_url = _feiji_file_redirect(opener, share_id, item_id, browser_url, client_uuid=client_uuid)
            files.append({"id": item_id, "name": name, "path": "/" + name,
                          # The official web formatter treats fileSize as KB.
                          "size": max(0, int(float(item.get("fileSize") or item.get("size") or 0) * 1024)),
                          "type": "folder" if is_folder else "file", "downloadUrl": download_url,
                          "backupUrl": "", "browserUrl": browser_url,
                          "errorCode": "" if download_url or is_folder else (
                              "FEIJI_LOGIN_REQUIRED" if item.get("type") == 0 else "DOWNLOAD_URL_UNAVAILABLE")})
    if not files:
        if code:
            raise ProviderError("ACCESS_CODE_INVALID")
        raise ProviderError("SHARE_FILES_EMPTY")
    return files


class _WeiyunRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urlparse(newurl)
        if parsed.scheme != "https" or parsed.hostname != "share.weiyun.com":
            raise ProviderError("PROVIDER_REDIRECT_BLOCKED")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _weiyun_read(opener, url, data=None, referer=""):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "share.weiyun.com":
        raise ProviderError("PROVIDER_HOST_BLOCKED")
    request = urllib.request.Request(url, data=data, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36",
        "Referer": referer or url, "Origin": "https://share.weiyun.com",
        "Content-Type": "application/json", "Accept": "application/json,text/html",
    })
    started = time.monotonic()
    _diag_http_started(request)
    try:
        with opener.open(request, timeout=HTTP_TIMEOUT) as response:
            if urlparse(response.geturl()).hostname != "share.weiyun.com":
                raise ProviderError("PROVIDER_REDIRECT_BLOCKED")
            raw = response.read(MAX_PAGE_BYTES + 1)
            _diag_http_response(response, raw[:MAX_PAGE_BYTES], started, truncated=len(raw) > MAX_PAGE_BYTES)
            if len(raw) > MAX_PAGE_BYTES:
                raise ProviderError("PROVIDER_RESPONSE_TOO_LARGE")
            return raw.decode("utf-8")
    except urllib.error.HTTPError as exc:
        try:
            raw = exc.read(MAX_PAGE_BYTES + 1)
        except Exception:
            raw = b""
        _diag_http_response(exc, raw[:MAX_PAGE_BYTES], started, truncated=len(raw) > MAX_PAGE_BYTES)
        raise ProviderError("WEIYUN_VERIFICATION_REQUIRED" if exc.code in (401, 403) else "PROVIDER_HTTP_ERROR") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        _diag_http_failure(request, started, exc)
        raise ProviderError("PROVIDER_UNAVAILABLE") from exc
    except UnicodeError as exc:
        raise ProviderError("PROVIDER_BAD_RESPONSE") from exc


def _weiyun_request(opener, jar, name, cmd, params, referer):
    # The sharing page sets wyctoken. A hardcoded g_tk=5381 returns HTTP 403.
    token = next((c.value for c in jar if c.name == "wyctoken"), "5381")
    header = {"seq": int(_now().timestamp()), "type": 1, "cmd": cmd, "appid": 30113,
              "version": 3, "major_version": 3, "minor_version": 3, "fix_version": 3,
              "user_flag": 0, "env_id": "", "device_info": json.dumps({"browser": "Chrome"})}
    body = {"ReqMsg_body": {"ext_req_head": {
        "token_info": {"token_type": 0, "login_key_type": 27, "login_key_value": ""},
        "language_info": {"language_type": 2052}}, ".weiyun." + name + "MsgReq_body": params}}
    payload = json.dumps({"req_header": json.dumps(header), "req_body": json.dumps(body)}).encode("utf-8")
    protocol = "weiyunShare" if cmd in (12023, 12024) else "weiyunShareNoLogin"
    endpoint = "https://share.weiyun.com/webapp/json/" + protocol + "/" + name
    endpoint += "?" + urllib.parse.urlencode({"refer": "Chrome_windows", "g_tk": token})
    try:
        result = json.loads(_weiyun_read(opener, endpoint, payload, referer))
        data = result.get("data") or {}
        head = data.get("rsp_header") or {}
        ret = result.get("ret") or head.get("retcode") or 0
        if ret:
            message = str(result.get("msg") or head.get("retmsg") or "")
            if re.search(r"密码|提取码|访问码", message):
                raise ProviderError("ACCESS_CODE_INVALID")
            if ret == -3000 or re.search(r"登录|登陆|login", message, re.I):
                raise ProviderError("WEIYUN_LOGIN_REQUIRED")
            if re.search(r"失效|取消|不存在|过期", message):
                raise ProviderError("SHARE_EXPIRED")
            raise ProviderError("WEIYUN_VERIFICATION_REQUIRED")
        value = (data.get("rsp_body") or {}).get("RspMsg_body")
        if not isinstance(value, dict):
            raise ProviderError("PROVIDER_BAD_RESPONSE")
        return value
    except (ValueError, TypeError, AttributeError) as exc:
        if isinstance(exc, ProviderError):
            raise
        raise ProviderError("PROVIDER_BAD_RESPONSE") from exc


def _weiyun_parse(url, access_code=""):
    provider, share_key = _provider_for(url)
    if provider != "weiyun" or not re.fullmatch(r"[A-Za-z0-9]+", share_key):
        raise ProviderError("INVALID_SHARE_URL")
    referer = "https://share.weiyun.com/" + share_key
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), _WeiyunRedirect())
    page = _weiyun_read(opener, referer)
    match = re.search(r"window\.syncData\s*=\s*", page)
    try:
        sync = json.JSONDecoder().raw_decode(page[match.end():].lstrip())[0] if match else {}
        info = sync.get("shareInfo") or {}
    except (ValueError, AttributeError) as exc:
        raise ProviderError("PROVIDER_BAD_RESPONSE") from exc
    code = str(access_code or "").strip()
    if info.get("need_pwd") and not code:
        raise ProviderError("ACCESS_CODE_REQUIRED")
    if not info or info.get("need_pwd") or code:
        info = _weiyun_request(opener, jar, "WeiyunShareView", 12002,
                               {"share_key": share_key, "share_pwd": code}, referer)
    files, pending, visited = [], [(info, "", info.get("pdir_key") or "")], set()
    root_page, contexts = info, set()
    while root_page.get("finish_flag") is False:
        context = root_page.get("server_page_context")
        if not context or context in contexts or len(contexts) >= 10:
            raise ProviderError("PROVIDER_RESPONSE_TOO_LARGE")
        contexts.add(context)
        root_page = _weiyun_request(opener, jar, "WeiyunShareView", 12002,
            {"share_key": share_key, "share_pwd": code, "local_page_context": context}, referer)
        pending.append((root_page, "", info.get("pdir_key") or ""))
    while pending:
        listing, path, parent = pending.pop(0)
        for item in listing.get("file_list") or []:
            file_id = str(item.get("file_id") or "")
            if not file_id or any(x["id"] == file_id for x in files):
                continue
            name = str(item.get("filename") or "未命名文件")[:240]
            files.append({"id": file_id, "name": name, "path": path + "/" + name,
                          "size": max(0, int(item.get("file_size") or 0)), "type": "file",
                          "pdirKey": item.get("pdir_key") or parent, "downloadUrl": "",
                          "backupUrl": "", "browserUrl": referer})
            if len(files) > 1000:
                raise ProviderError("PROVIDER_RESPONSE_TOO_LARGE")
        for directory in listing.get("dir_list") or []:
            key = directory.get("dir_key")
            if not key or key in visited:
                continue
            visited.add(key)
            if len(visited) > 50:
                raise ProviderError("PROVIDER_RESPONSE_TOO_LARGE")
            for start in range(0, 1100, 100):
                sub = _weiyun_request(opener, jar, "WeiyunShareDirList", 12031, {
                    "share_key": share_key, "share_pwd": code, "dir_key": key,
                    "dir_name": directory.get("dir_name") or "", "get_type": 0,
                    "start": start, "count": 100, "get_abstract_url": True}, referer)
                pending.append((sub, path + "/" + str(directory.get("dir_name") or "文件夹"), key))
                if sub.get("finish_flag") is True or not (sub.get("file_list") or sub.get("dir_list")):
                    break
            else:
                raise ProviderError("PROVIDER_RESPONSE_TOO_LARGE")
    if not files:
        raise ProviderError("SHARE_FILES_EMPTY")
    try:
        _weiyun_request(opener, jar, "WeiyunShareBatchDownload", 12024, {
            "share_key": share_key, "pwd": code,
            "file_owner": info.get("share_uin") or info.get("share_uin_security") or "",
            "download_type": 0, "file_list": [{"file_id": f["id"], "pdir_key": f["pdirKey"],
                "filename": f["name"], "file_size": f["size"]} for f in files]}, referer)
        # Authenticated CDN URLs also require a browser cookie. Keep those in
        # the official browser flow instead of emitting an unusable raw URL.
        for file in files:
            file["errorCode"] = "WEIYUN_LOGIN_REQUIRED"
    except ProviderError as exc:
        for file in files:
            file["errorCode"] = str(exc)
    return files


def _qaiu_list_rows(payload):
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("files", "fileList", "list"):
            if isinstance(data.get(key), list):
                return data[key]
    return []


def _qaiu_request_at_base(path, params, api_key, api_base, require_api_key=True):
    if api_base is None:
        return _qaiu_request(path, params, api_key, require_api_key)
    return _qaiu_request(path, params, api_key, require_api_key, api_base=api_base)


def _qaiu_folder_files(url, access_code, api_key, provider_name, headers, api_base=None):
    files, visited = [], set()

    def visit(folder_url, folder_path="", depth=0):
        if depth > 12 or len(files) >= 1000:
            raise ProviderError("PROVIDER_RESPONSE_TOO_LARGE")
        marker = str(folder_url or "")
        if marker in visited:
            _diag("folder_visit_skipped", {"reason": "duplicate", "depth": depth, "folderPath": folder_path})
            return
        visited.add(marker)
        _diag("folder_list_started", {"depth": depth, "folderPath": folder_path, "folderUrl": marker})
        payload = _qaiu_request_at_base("/v2/getFileList", {"url": marker, "pwd": access_code}, api_key, api_base)
        rows = _qaiu_list_rows(payload)
        _diag("folder_list_received", {"depth": depth, "folderPath": folder_path, "entryCount": len(rows)})
        for item in rows:
            if not isinstance(item, dict):
                continue
            name = html.unescape(str(item.get("fileName") or item.get("name") or "未命名文件").strip())[:240]
            path = (folder_path.rstrip("/") + "/" + name) if folder_path else "/" + name
            parser_url = str(item.get("parserUrl") or item.get("downloadUrl") or "").strip()
            kind = str(item.get("fileType") or "").lower()
            if kind == "folder":
                if parser_url:
                    if not _qaiu_safe_https_url(parser_url):
                        raise ProviderError("QAIU_BAD_DOWNLOAD_URL")
                    visit(parser_url, path, depth + 1)
                continue
            if not parser_url:
                continue
            if not _qaiu_safe_https_url(parser_url):
                raise ProviderError("QAIU_BAD_DOWNLOAD_URL")
            try:
                size = max(0, int(item.get("size") or 0))
            except (TypeError, ValueError):
                size = 0
            file_id = str(item.get("fileId") or item.get("id") or "")[:160]
            if not file_id:
                file_id = hashlib.sha256((path + "|" + parser_url).encode("utf-8")).hexdigest()[:24]
            files.append({"id": file_id, "name": name, "path": path, "size": size, "type": "file",
                          "downloadUrl": parser_url, "backupUrl": "", "browserUrl": url,
                          "providerName": provider_name, "resolverType": "qaiu", "downloadHeaders": dict(headers)})
            if len(files) >= 1000:
                raise ProviderError("PROVIDER_RESPONSE_TOO_LARGE")

    visit(url)
    return files


def _qaiu_parse(url, access_code="", api_key="", provider="", api_base=None):
    if not str(api_key or "").strip():
        raise ProviderError("QAIU_API_KEY_REQUIRED")
    # Feijipan commonly carries its extraction code in ?code=... instead of
    # the separate password field. Pass it to the aggregate service as pwd.
    if provider == "xiaofeiji" and not str(access_code or "").strip():
        access_code = urllib.parse.parse_qs(urlparse(str(url)).query).get("code", [""])[0].strip()
    _diag("aggregate_parse_started", {
        "provider": provider, "shareUrl": url, "accessCodePresent": bool(access_code),
        "credentialPresent": bool(api_key), "apiBase": api_base or QAIU_API_BASE,
    }, redact_values=[access_code, api_key])
    details = {}
    try:
        details = _qaiu_request_at_base("/v2/linkInfo", {"url": url, "pwd": access_code}, "", api_base,
                                        require_api_key=False)
    except ProviderError as exc:
        # linkInfo is an optional, unmetered hint; the actual JSON parser below
        # remains authoritative for whether a share is supported and usable.
        _diag("link_info_hint_failed", {"errorCode": str(exc), "continuing": True}, redact_values=[access_code, api_key])
        details = {}
    provider_name, provider_type, other_param = _qaiu_link_details(details)
    provider_name = provider_name or PROVIDERS.get(provider, {}).get("label") or "其他网盘"
    download_headers = _qaiu_download_headers(other_param, provider_type)
    try:
        if api_base is None:
            files = _qaiu_folder_files(url, access_code, api_key, provider_name, download_headers)
        else:
            files = _qaiu_folder_files(url, access_code, api_key, provider_name, download_headers, api_base)
    except ProviderError as exc:
        if str(exc) in ("QAIU_API_KEY_REQUIRED", "QAIU_API_KEY_INVALID", "QAIU_QUOTA_EXHAUSTED"):
            _diag("folder_parse_failed", {"errorCode": str(exc), "provider": provider}, redact_values=[access_code, api_key])
            raise
        _diag("folder_parse_unavailable", {"errorCode": str(exc), "continuingToSingleFileParser": True}, redact_values=[access_code, api_key])
        files = []
    if files:
        _diag("aggregate_parse_result", {"provider": provider, "resultType": "folder_list", "fileCount": len(files),
                                          "files": [{"id": row.get("id"), "name": row.get("name"), "size": row.get("size"), "type": row.get("type")} for row in files]})
        return files

    _diag("single_file_parser_started", {"provider": provider, "endpointPath": "/json/parser"}, redact_values=[access_code, api_key])
    payload = _qaiu_request_at_base("/json/parser", {"url": url, "pwd": access_code}, api_key, api_base)
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    file_info = data.get("fileInfo") if isinstance(data.get("fileInfo"), dict) else {}
    download_url = str(data.get("directLink") or data.get("downloadUrl") or "").strip()
    if not download_url or not _qaiu_safe_https_url(download_url):
        raise ProviderError("QAIU_DOWNLOAD_URL_UNAVAILABLE")
    name = html.unescape(str(file_info.get("fileName") or "未命名文件").strip())[:240]
    try:
        size = max(0, int(file_info.get("size") or 0))
    except (TypeError, ValueError):
        size = 0
    file_id = str(data.get("shareKey") or hashlib.sha256(url.encode("utf-8")).hexdigest()[:24])[:160]
    result = [{"id": file_id, "name": name, "path": "/" + name, "size": size, "type": "file",
               "downloadUrl": download_url, "backupUrl": "", "browserUrl": url,
               "providerName": provider_name, "resolverType": "qaiu", "downloadHeaders": download_headers}]
    _diag("aggregate_parse_result", {"provider": provider, "resultType": "single_file_parser", "fileCount": 1,
                                      "files": [{"id": file_id, "name": name, "size": size, "type": "file"}],
                                      "downloadUrl": download_url}, redact_values=[access_code, api_key])
    return result


def _provider_parse(provider, url, access_code="", api_key="", api_base=None):
    if provider == "lanzou":
        return _lanzou_parse(url, access_code)
    if provider == "mock":
        raise ProviderError("OFFICIAL_API_UNSUPPORTED")
    if provider == "xiaofeiji":
        try:
            if api_base is None:
                return _qaiu_parse(url, access_code, api_key, provider)
            return _qaiu_parse(url, access_code, api_key, provider, api_base)
        except ProviderError as exc:
            # Keep the aggregate service as the primary path. If it is
            # temporarily unable to parse Feijipan, use the official listing
            # so the user can still inspect the files or open the download page.
            if str(exc) not in ("QAIU_PARSE_FAILED", "PROVIDER_UNAVAILABLE"):
                raise
            return _feiji_parse(url, access_code)
    if api_base is None:
        return _qaiu_parse(url, access_code, api_key, provider)
    return _qaiu_parse(url, access_code, api_key, provider, api_base)


def _provider_parse_configured(provider, url, access_code, api_key, api_base):
    if api_base is None:
        return _provider_parse(provider, url, access_code, api_key)
    return _provider_parse(provider, url, access_code, api_key, api_base)


def _has_downloadable_file(files):
    """Return whether parsed metadata contains at least one real direct URL."""
    return any(
        isinstance(item, dict)
        and item.get("type") != "folder"
        and str(item.get("downloadUrl") or "").strip()
        for item in (files or [])
    )


def _parse_failure_code(files):
    return next((x.get("errorCode") for x in files if x.get("errorCode")), "DOWNLOAD_URL_UNAVAILABLE")


def _parse_task_files(task, access_code="", api_key="", api_base=None):
    started = time.monotonic()
    _diag("provider_parse_started", {
        "taskId": task.get("id", ""), "provider": task.get("provider", ""), "shareUrl": task.get("shareUrl", ""),
        "accessCodePresent": bool(access_code), "credentialPresent": bool(api_key), "apiBase": api_base or "",
    }, redact_values=[access_code, api_key])
    files = _provider_parse_configured(task.get("provider"), task.get("shareUrl"), access_code, api_key, api_base)
    task["files"] = files
    task["resolverType"] = "qaiu" if task.get("provider") not in ("lanzou", "mock") else "official"
    task["providerName"] = next((x.get("providerName") for x in files if x.get("providerName")),
                                 PROVIDERS.get(task.get("provider"), {}).get("label", "其他网盘"))
    unavailable = task.get("provider") != "mock" and not _has_downloadable_file(files)
    task["status"] = "failed" if unavailable else "parsed"
    task["errorCode"] = _parse_failure_code(files) if unavailable else ""
    if task.get("provider") == "weiyun" and not _has_downloadable_file(files):
        task["errorCode"] = _parse_failure_code(files)
    task["updatedAt"] = _iso(_now())
    _diag("provider_parse_completed", {
        "taskId": task.get("id", ""), "provider": task.get("provider", ""), "status": task.get("status"),
        "errorCode": task.get("errorCode", ""), "fileCount": len(files),
        "files": [{"id": row.get("id"), "name": row.get("name"), "size": row.get("size"), "type": row.get("type")} for row in files if isinstance(row, dict)],
        "elapsedMs": round((time.monotonic() - started) * 1000),
    }, redact_values=[access_code, api_key])
    return files


def _process_parse_task(app, task_id):
    with LOCK:
        store = _load(app)
        saved_task = next((row for row in store["tasks"] if row.get("id") == task_id), None)
        if not saved_task or saved_task.get("status") != "processing":
            return
        task = dict(saved_task)
        access_code = _unprotect(app, saved_task.get("accessCodeEncrypted"))
        api_key = _qaiu_api_key(app, store)

    started = time.monotonic()
    _set_diagnostic_context(app, redact_values=[access_code, api_key], taskId=task_id,
                            provider=task.get("provider", ""), ownerUserId=task.get("ownerUserId", ""))
    _diag("parse_task_started", {
        "shareUrl": task.get("shareUrl", ""), "accessCodePresent": bool(access_code),
        "apiKeyConfigured": bool(api_key), "taskStatus": task.get("status", ""),
    }, redact_values=[access_code, api_key])
    try:
        api_base = _qaiu_configured_api_base(store)
        _parse_task_files(task, access_code, api_key, api_base)
    except ProviderError as exc:
        task.update({"status": "failed", "errorCode": str(exc), "updatedAt": _iso(_now())})
        _diag("parse_task_error", {"errorType": type(exc).__name__, "error": str(exc), "errorCode": str(exc)}, redact_values=[access_code, api_key])
    except Exception as exc:
        task.update({"status": "failed", "errorCode": "PROVIDER_UNAVAILABLE", "updatedAt": _iso(_now())})
        _diag("parse_task_error", {"errorType": type(exc).__name__, "error": str(exc), "errorCode": "PROVIDER_UNAVAILABLE"}, redact_values=[access_code, api_key])

    with LOCK:
        store = _load(app)
        saved_task = next((row for row in store["tasks"] if row.get("id") == task_id), None)
        if not saved_task or saved_task.get("status") != "processing":
            return
        for key in ("files", "status", "errorCode", "resolverType", "providerName", "updatedAt"):
            saved_task[key] = task.get(key)
        _save(app, store)
    _diag("parse_task_finished", {
        "status": task.get("status", ""), "errorCode": task.get("errorCode", ""),
        "fileCount": len(task.get("files") or []), "elapsedMs": round((time.monotonic() - started) * 1000),
    }, redact_values=[access_code, api_key])


def _run_parse_task(app, task_id):
    try:
        return _process_parse_task(app, task_id)
    finally:
        with LOCK:
            ACTIVE_PARSE_TASKS.discard(task_id)


def _schedule_parse_task(app, task_id):
    with LOCK:
        if task_id in ACTIVE_PARSE_TASKS:
            return
        ACTIVE_PARSE_TASKS.add(task_id)
    try:
        PARSE_EXECUTOR.submit(_run_parse_task, app, task_id)
    except Exception:
        with LOCK:
            ACTIVE_PARSE_TASKS.discard(task_id)
        raise


def defaults():
    return {
        "enabled": True,
        "qaiuApiKeyEncrypted": "",
        "qaiuApiBase": "",
        "providers": {key: {"enabled": True, "status": row["status"]} for key, row in PROVIDERS.items()},
        "resources": [], "tasks": [], "sources": [], "downloadTasks": [],
        "entitlements": [], "renewalHistory": [], "plans": [], "codes": [], "settings": {
            "maxFileSize": 2 * 1024 * 1024 * 1024, "dailyParseLimit": 20,
            "maxRetries": 2, "mergeByName": True,
        },
    }


def _now():
    return datetime.now(timezone.utc)


def _iso(value):
    return value.isoformat(timespec="seconds")


def _order_expiry(app, order, now=None):
    """Return the expiry of a pending payment order.

    Older orders do not have pendingExpiresAt, so derive it from createdAt and
    the system setting. This keeps old data recoverable without migration.
    """
    now = now or _now()
    value = order.get("pendingExpiresAt")
    if value:
        try:
            parsed = _parse_time(value)
            return parsed
        except ValueError:
            pass
    try:
        created = _parse_time(order.get("createdAt"))
    except ValueError:
        created = now
    settings = app.read_system_settings()
    minutes = settings.get("cloudResolverOrderExpiryMinutes", 30)
    try:
        minutes = max(1, min(10080, int(minutes)))
    except (TypeError, ValueError):
        minutes = 30
    return created + timedelta(minutes=minutes)


def _order_public_with_expiry(app, order):
    if order.get("status") == "pending":
        expiry = _order_expiry(app, order)
        order["pendingExpiresAt"] = _iso(expiry)
        order["remainingSeconds"] = max(0, int((expiry - _now()).total_seconds()))
        order["isExpired"] = expiry <= _now()
    return app.public_order(order)


def _load(app):
    store = app.read_json(app.CLOUD_RESOLVER_PATH, defaults())
    base = defaults()
    for key, value in base.items():
        if key not in store:
            store[key] = value
    for key, value in base["settings"].items():
        store["settings"].setdefault(key, value)
    for key, value in base["providers"].items():
        store["providers"].setdefault(key, value)
    # Older data files predate the public Tianyi share adapter.
    if store["providers"].get("tianyi", {}).get("status") == "待接入":
        store["providers"]["tianyi"]["status"] = "已接入"
    if store["providers"].get("xiaofeiji", {}).get("status") == "待接入":
        store["providers"]["xiaofeiji"]["status"] = "已接入"
    if store["providers"].get("weiyun", {}).get("status") == "待接入":
        store["providers"]["weiyun"]["status"] = "已接入"
    for provider in ("123pan", "qaiu"):
        if store["providers"].get(provider, {}).get("status") == "待接入":
            store["providers"][provider]["status"] = "已接入"
    if not isinstance(store.get("renewalHistory"), list):
        store["renewalHistory"] = []
    return store


def _save(app, store):
    app.write_json(app.CLOUD_RESOLVER_PATH, store)


def _audit(app, actor, handler, action, target="", details=None, success=True):
    safe = dict(details or {})
    for key in ("accessCode", "access_code", "token", "downloadUrl", "shareUrl"):
        safe.pop(key, None)
    app.audit_event("cloud_resolver_" + action, actor=actor, target=target, handler=handler,
                    details=safe, success=success)


def _effective_entitlement(store, user):
    if user.get("role") == "super":
        now = _now()
        return {"userId": user.get("id"), "featureCode": FEATURE, "status": "active",
                "source": "admin_grant", "startedAt": _iso(now - timedelta(days=1)),
                "expiredAt": "", "allowedProviders": list(PROVIDERS),
                "parseQuota": -1, "parseUsed": 0, "trafficQuota": -1,
                "trafficUsed": 0, "dailyParseLimit": -1, "dailyParseUsed": 0}
    rows = [row for row in store["entitlements"] if row.get("userId") == user.get("id")
            and row.get("featureCode") == FEATURE and row.get("status") == "active"]
    valid = []
    changed = False
    now = _now()
    for row in rows:
        try:
            expiry = _parse_time(row["expiredAt"]) if row.get("expiredAt") else None
            if expiry and expiry <= now:
                row["status"] = "expired"
                changed = True
                continue
        except (ValueError, TypeError):
            row["status"] = "expired"
            changed = True
            continue
        valid.append(row)
    if changed:
        store["_dirty"] = True
    return max(valid, key=lambda item: item.get("expiredAt") or "9999") if valid else None


def _require_entitlement(app, store, user):
    row = _effective_entitlement(store, user)
    if store.pop("_dirty", False):
        _save(app, store)
    if not row:
        raise PermissionError("USER_ENTITLEMENT_REQUIRED")
    return row


def _public_entitlement(row):
    if not row:
        return None
    result = {key: value for key, value in row.items()
              if key not in ("grantedBy", "adminNote")}
    result.setdefault("expiresAt", result.get("expiredAt", ""))
    return result


def _parse_time(value):
    if not value:
        return None
    try:
        text = str(value).strip()
        native_parser = getattr(datetime, "fromisoformat", None)
        if native_parser:
            parsed = native_parser(text.replace("Z", "+00:00"))
        else:
            normalized = text.replace("Z", "+0000")
            if re.search(r"[+-]\d\d:\d\d$", normalized):
                normalized = normalized[:-3] + normalized[-2:]
            parsed = None
            for pattern in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z"):
                try:
                    parsed = datetime.strptime(normalized, pattern)
                    break
                except ValueError:
                    pass
            if parsed is None:
                raise ValueError("invalid datetime")
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        raise ValueError("到期时间格式不正确。")


def _quota_add(old_value, new_value):
    old_value = int(old_value if old_value is not None else -1)
    new_value = int(new_value if new_value is not None else -1)
    if old_value < 0 or new_value < 0:
        return -1
    return old_value + new_value


def _apply_entitlement(app, store, user_id, plan, source, actor_id="", handler=None,
                       reference_id="", renew=True, overwrite=False, absolute_expiry="",
                       note=""):
    now = _now()
    current = next((row for row in store["entitlements"]
                    if row.get("userId") == user_id and row.get("featureCode") == FEATURE
                    and row.get("status") == "active"), None)
    old_expiry = _parse_time(current.get("expiredAt")) if current and current.get("expiredAt") else None
    if old_expiry and old_expiry <= now:
        current["status"] = "expired"
        current = None
        old_expiry = None
    days = max(1, min(36500, int(plan.get("durationDays", 30))))
    if absolute_expiry:
        new_expiry = _parse_time(absolute_expiry)
        if not new_expiry or new_expiry <= now:
            raise ValueError("到期时间必须晚于当前时间。")
    else:
        base = old_expiry if (current and renew and not overwrite) else now
        new_expiry = base + timedelta(days=days)
    if current and renew and not overwrite:
        before = dict(current)
        current.update({
            "status": "active", "planId": plan.get("id", current.get("planId", "")),
            "expiredAt": _iso(new_expiry), "expiresAt": _iso(new_expiry), "allowedProviders": plan.get("allowedProviders") or list(PROVIDERS),
            "parseQuota": _quota_add(current.get("parseQuota", -1), plan.get("parseQuota", -1)),
            "trafficQuota": _quota_add(current.get("trafficQuota", -1), plan.get("trafficQuota", -1)),
            "dailyParseLimit": int(plan.get("dailyParseLimit", current.get("dailyParseLimit", 20))),
            "source": source, "lastRenewedAt": _iso(now), "updatedAt": _iso(now),
            "grantedBy": actor_id or current.get("grantedBy", ""), "adminNote": note[:500],
        })
        row = current
    else:
        if current and overwrite:
            current["status"] = "disabled"
            current["updatedAt"] = _iso(now)
        row = {"id": "crent_" + hashlib.sha256((str(user_id) + _iso(now) + source + str(len(store["entitlements"]))).encode()).hexdigest()[:16],
               "userId": user_id, "featureCode": FEATURE, "status": "active", "source": source,
               "planId": plan.get("id", ""), "startedAt": _iso(now), "expiredAt": _iso(new_expiry), "expiresAt": _iso(new_expiry),
               "allowedProviders": plan.get("allowedProviders") or list(PROVIDERS),
               "parseQuota": int(plan.get("parseQuota", -1)), "parseUsed": 0,
               "trafficQuota": int(plan.get("trafficQuota", -1)), "trafficUsed": 0,
               "dailyParseLimit": int(plan.get("dailyParseLimit", 20)), "dailyParseUsed": 0,
               "lastUsedAt": "", "lastRenewedAt": _iso(now), "grantedBy": actor_id,
               "adminNote": note[:500], "createdAt": _iso(now), "updatedAt": _iso(now)}
        store["entitlements"].append(row)
        before = {"expiredAt": "", "parseQuota": 0, "trafficQuota": 0}
    store["renewalHistory"].insert(0, {
        "id": "crrenew_" + hashlib.sha256((row["id"] + _iso(now) + str(reference_id)).encode()).hexdigest()[:16],
        "userId": user_id, "entitlementId": row["id"], "planId": plan.get("id", ""),
        "source": source, "referenceId": reference_id, "actorId": actor_id,
        "previousExpiredAt": before.get("expiredAt", "") if isinstance(before, dict) else "",
        "addedDays": days, "expiredAt": row.get("expiredAt", ""), "createdAt": _iso(now),
        "note": note[:500],
    })
    return row


def _clean_share_input(url, access_code=""):
    clean_url = str(url or "").strip()
    code = str(access_code or "").strip()
    embedded = re.search(r"(?:密码|访问码|提取码|pwd|pass(?:word)?)\s*[:：=]\s*([^\s,，;；]+)", clean_url, re.I)
    if embedded:
        clean_url = clean_url[:embedded.start()]
        if not code:
            code = embedded.group(1)
    # Users commonly paste a share URL followed by a Chinese access-code note.
    clean_url = re.sub(r"\s*[（(]\s*(?:密码|访问码|提取码|pwd|pass(?:word)?)\s*[:：=].*?[）)]\s*$", "", clean_url, flags=re.I)
    clean_url = re.sub(r"[（）()\[\]{}<>，,；;。.!！?？]+$", "", clean_url).strip()
    code = re.sub(r"[（）()\[\]{}<>，,；;。.!！?？]+$", "", code).strip()
    return clean_url, code


def _provider_for(url, selected=""):
    clean_url, _ = _clean_share_input(url)
    # Users commonly paste a share URL followed by a Chinese access-code note.
    # The helper leaves ordinary query strings and URL paths untouched.
    parsed = urlparse(clean_url)
    if selected == "mock" and parsed.scheme == "mock" and parsed.netloc:
        return "mock", (parsed.path.strip("/") or parsed.netloc)[:120]
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("INVALID_SHARE_URL")
    host = parsed.hostname.lower().rstrip(".")
    for key, row in PROVIDERS.items():
        if any(host == domain.strip() or host.endswith("." + domain.strip()) for domain in row["domains"]):
            if selected == "qaiu" and key != "lanzou":
                share_id = parsed.path.strip("/").split("/")[-1][:120] or host[:120]
                return "qaiu", share_id
            if selected and selected != key:
                raise ValueError("INVALID_SHARE_URL")
            share_id = ""
            if key == "tianyi":
                match = re.search(r"/t/([A-Za-z0-9]+)", parsed.path)
                share_id = match.group(1) if match else ""
            elif key == "lanzou":
                match = re.search(r"/([A-Za-z0-9]{6,})/?$", parsed.path)
                share_id = match.group(1) if match else ""
            else:
                share_id = parsed.path.strip("/").split("/")[-1][:120]
            if not share_id:
                raise ValueError("INVALID_SHARE_URL")
            return key, share_id
    if selected in ("", "qaiu"):
        share_id = parsed.path.strip("/").split("/")[-1][:120] or host[:120]
        return "qaiu", share_id
    raise ValueError("INVALID_SHARE_URL")


def _protect(app, value):
    """Keep access codes recoverable only by the server, never in API output/logs."""
    plain = str(value or "")
    if not plain:
        return ""
    encrypted = app.aes128_cbc_encrypt(plain.encode("utf-8"))
    return "aes128:" + base64.b64encode(encrypted).decode("ascii")


def _unprotect(app, value):
    protected = str(value or "")
    if not protected.startswith("aes128:"):
        return ""
    try:
        encrypted = base64.b64decode(protected[7:].encode("ascii"), validate=True)
        return app.aes128_cbc_decrypt(encrypted).decode("utf-8")
    except Exception:
        return ""


def _public_task(row):
    result = {key: value for key, value in row.items() if key not in ("accessCodeEncrypted", "accessCode", "qaiuApiKey")}
    if row.get("resolverType") == "qaiu":
        result["files"] = []
        for item in row.get("files", []):
            if not isinstance(item, dict):
                continue
            public_file = {key: value for key, value in item.items()
                           if key not in ("downloadUrl", "backupUrl", "downloadHeaders")}
            # The owner needs to see which resolved line will be added. Keep
            # this as a separate display field instead of exposing parser
            # headers or replacing the stored source URL.
            public_file["resolvedUrl"] = str(item.get("downloadUrl") or item.get("browserUrl") or "")
            public_file["backupResolvedUrl"] = str(item.get("backupUrl") or "")
            result["files"].append(public_file)
    return result


def _public_source(row):
    result = {key: value for key, value in row.items()
              if key not in ("accessCodeEncrypted", "shareUrl", "sourceKey", "downloadHeaders")}
    if row.get("resolverType") == "qaiu":
        result.pop("downloadUrl", None)
        result.pop("backupUrl", None)
    return result


def _public_download_task(row):
    result = dict(row)
    if row.get("resolverType") == "qaiu":
        result["upstreamUrl"] = ""
        result["upstreamBackupUrl"] = ""
    return result


def _owner(row, user):
    if row.get("ownerUserId") != user.get("id"):
        raise PermissionError("RESOURCE_FORBIDDEN")


def _button_scopes(config):
    result = []
    for scope_type, scopes in (("page", config.get("pages") or {}), ("toolbox", config.get("toolbox_tabs") or [])):
        items = scopes.items() if isinstance(scopes, dict) else ((str(i), x) for i, x in enumerate(scopes))
        for scope_id, scope in items:
            for section_index, section in enumerate((scope or {}).get("sections") or []):
                for button_index, button in enumerate((section or {}).get("buttons") or []):
                    result.append({"scopeType": scope_type, "scopeId": str(scope_id), "scopeName": scope.get("title") or scope.get("name") or str(scope_id),
                                   "sectionIndex": section_index, "sectionName": section.get("title") or "默认分组",
                                   "buttonIndex": button_index, "button": button})
    return result


def _norm_name(value):
    return unicodedata.normalize("NFC", str(value or "").strip())


def route(handler, app, path, method, auth):
    user = auth["user"]
    user_id = user.get("id")
    is_super = app.is_super(user)
    _set_diagnostic_context(app, actorId=user_id or "", actor=user.get("username", ""))
    _diag("resolver_api_route_started", {
        "method": method, "path": path, "query": getattr(handler, "query", {}),
    })
    with LOCK:
        store = _load(app)
        if path == "/api/cloud-resolver/config" and method == "GET":
            return handler.send_json({"enabled": store["enabled"], "providers": [
                {"id": key, "name": PROVIDERS[key]["label"], "enabled": bool(store["providers"][key].get("enabled")),
                 "status": store["providers"][key].get("status") or "待接入"} for key in PROVIDERS]})
        if path == "/api/cloud-resolver/entitlement" and method == "GET":
            entitlement = _effective_entitlement(store, user)
            if store.pop("_dirty", False):
                _save(app, store)
            return handler.send_json({"entitlement": entitlement, "allowed": bool(entitlement), "role": user.get("role")})
        if path == "/api/cloud-resolver/plans" and method == "GET":
            return handler.send_json({"plans": [row for row in sorted(store["plans"], key=lambda x: (int(x.get("sortOrder", 0)), x.get("createdAt", ""))) if row.get("enabled", True)]})
        if path == "/api/cloud-resolver/payment-channels" and method == "GET":
            return handler.send_json({"channels": app.public_payment_channels(app.read_system_settings())})
        if path == "/api/cloud-resolver/renewal-history" and method == "GET":
            return handler.send_json({"items": [row for row in store["renewalHistory"] if row.get("userId") == user_id][:100]})
        if path == "/api/cloud-resolver/orders" and method == "GET":
            orders = []
            changed = False
            order_data = app.read_orders()
            for row in order_data.get("orders", []):
                if row.get("userId") != user_id or row.get("action") != "cloud_resolver_plan_purchase":
                    continue
                if row.get("status") == "pending":
                    expiry = _order_expiry(app, row)
                    if expiry <= _now():
                        row["status"] = "expired"
                        row["expiredAt"] = _iso(_now())
                        row["updatedAt"] = row["expiredAt"]
                        changed = True
                orders.append(_order_public_with_expiry(app, row))
            if changed:
                app.write_orders(order_data)
            return handler.send_json({"orders": orders[:100]})
        if path == "/api/cloud-resolver/orders" and method == "POST":
            body = handler.read_body()
            plan = next((x for x in store["plans"] if x.get("id") == body.get("planId") and x.get("enabled", True)), None)
            if not plan:
                return handler.send_json({"error": "套餐不存在或已停用。"}, 400)
            amount = float(plan.get("memberPrice") or 0)
            action = "cloud_resolver_plan_purchase"
            settings = app.read_system_settings()
            payment_channel = str(body.get("paymentChannel") or "").strip()
            payment_type = str(body.get("paymentType") or "").strip().lower()
            payment_url = ""
            if amount > 0:
                valid_channels = app.public_payment_channels(settings)
                selected = next((row for row in valid_channels
                                 if row.get("key") == payment_channel
                                 and row.get("paymentType") == payment_type), None)
                if not selected:
                    matches = [row for row in valid_channels if row.get("key") == payment_channel]
                    if len(matches) == 1:
                        selected = matches[0]
                        payment_type = selected.get("paymentType") or "alipay"
                if not selected:
                    return handler.send_json({"error": "支付通道未配置或未启用。"}, 400)
            orders = app.read_orders()
            existing = next((x for x in orders.get("orders", [])
                             if x.get("userId") == user_id and x.get("action") == action
                             and x.get("status") == "pending" and (x.get("request") or {}).get("planId") == plan["id"]), None)
            if existing:
                expiry = _order_expiry(app, existing)
                if expiry > _now():
                    # Reuse the still-valid order. Rebuild its payment URL when
                    # an older record did not persist one or the user selected
                    # another configured payment channel.
                    selected_channel = payment_channel or existing.get("paymentProvider") or existing.get("paymentChannel")
                    selected_type = payment_type or existing.get("paymentType") or "alipay"
                    if amount > 0 and selected_channel:
                        existing["paymentProvider"] = selected_channel
                        existing["paymentChannel"] = selected_channel
                        existing["paymentType"] = selected_type
                        existing["paymentUrl"] = app.build_payment_url(existing, settings, handler.base_url() if hasattr(handler, "base_url") else "")
                    existing["pendingExpiresAt"] = _iso(expiry)
                    existing["updatedAt"] = _iso(_now())
                    app.write_orders(orders)
                    return handler.send_json({"order": _order_public_with_expiry(app, existing),
                                              "paymentUrl": existing.get("paymentUrl", ""), "reused": True,
                                              "message": "未支付订单仍在有效期内，已恢复原订单支付。"})
                existing["status"] = "expired"
                existing["expiredAt"] = _iso(_now())
                existing["updatedAt"] = existing["expiredAt"]
                app.write_orders(orders)
            order, _ = app.create_admin_order(user, action, amount, "CNY", "网盘套餐：" + plan["name"],
                                              request={"planId": plan["id"], "featureCode": FEATURE},
                                              payment_method="interface" if amount > 0 else "manual",
                                              payment_channel=payment_channel, reuse_existing=False)
            order["cloudPlanId"] = plan["id"]
            order["paymentType"] = payment_type
            order["paymentProvider"] = payment_channel
            order["updatedAt"] = _iso(_now())
            order["pendingExpiresAt"] = _iso(_order_expiry(app, order))
            if amount > 0:
                base_url = handler.base_url() if hasattr(handler, "base_url") else ""
                order["paymentUrl"] = app.build_payment_url(order, settings, base_url)
            orders = app.read_orders()
            for current_order in orders.get("orders", []):
                if current_order.get("id") == order.get("id"):
                    current_order.update({"cloudPlanId": plan["id"],
                                          "request": {"planId": plan["id"], "featureCode": FEATURE},
                                          "paymentType": order.get("paymentType", ""),
                                          "paymentProvider": order.get("paymentProvider", ""),
                                          "paymentUrl": order.get("paymentUrl", ""),
                                          "pendingExpiresAt": order.get("pendingExpiresAt", ""),
                                          "updatedAt": order["updatedAt"]})
            if amount <= 0:
                # Free/test plans use the same fulfillment path as paid plans;
                # this keeps entitlement creation idempotent and auditable.
                fulfill_order(app, order, external_trade_no="manual-free")
                for current_order in orders.get("orders", []):
                    if current_order.get("id") == order.get("id"):
                        current_order.update({"status": order.get("status"), "fulfilledAt": order.get("fulfilledAt"),
                                              "paidAt": order.get("paidAt"), "fulfilledBy": order.get("fulfilledBy")})
            app.write_orders(orders)
            return handler.send_json({"order": _order_public_with_expiry(app, order), "paymentUrl": order.get("paymentUrl", ""),
                                      "message": "套餐已开通。" if amount <= 0 else "订单已创建，正在跳转支付。"}, 201)
        if path == "/api/cloud-resolver/activate" and method == "POST":
            body = handler.read_body()
            code = str(body.get("code") or "").strip().upper()
            if not code:
                return handler.send_json({"error": "请输入激活码。"}, 400)
            digest = hashlib.sha256(code.encode("utf-8")).hexdigest()
            row = next((x for x in store["codes"] if x.get("codeHash") == digest), None)
            redeemable = row and row.get("status") in ("available", "assigned", "sold")
            if row and row.get("status") == "sold" and row.get("soldTo") != user_id:
                redeemable = False
            if row and user_id in (row.get("redeemedUsers") or []):
                return handler.send_json({"error": "该激活码已由当前账号兑换。"}, 409)
            if row and row.get("assignedAgentId") and row.get("status") == "assigned":
                return handler.send_json({"error": "该激活码尚未销售给当前账号。"}, 403)
            if not redeemable or (row.get("expiresAt") and row["expiresAt"] < _iso(_now())):
                return handler.send_json({"error": "激活码无效或已使用。"}, 400)
            max_uses = max(1, int(row.get("maxUses") or 1))
            used_count = int(row.get("usedCount") or 0)
            if used_count >= max_uses:
                return handler.send_json({"error": "激活码无效或已使用。"}, 400)
            row["usedCount"] = used_count + 1
            row.setdefault("redeemedUsers", []).append(user_id)
            row["redeemedBy"] = user_id; row["redeemedAt"] = _iso(_now())
            row["status"] = "redeemed" if row["usedCount"] >= max_uses else ("sold" if row.get("soldTo") else "available")
            entitlement = _grant(app, store, user_id, row, "redeemed_code", actor_id=user_id, handler=handler, reference_id=code)
            _save(app, store); _audit(app, user, handler, "code_redeem", entitlement["id"], {"source": "redeemed_code"})
            return handler.send_json({"entitlement": _public_entitlement(entitlement)})
        if path == "/api/cloud-resolver/parse" and method == "POST":
            if not store["enabled"]:
                return handler.send_json({"error": "PROVIDER_DISABLED"}, 503)
            entitlement = _require_entitlement(app, store, user)
            body = handler.read_body()
            links = body.get("links") if isinstance(body.get("links"), list) else [body]
            if not links or len(links) > 100:
                return handler.send_json({"error": "一次最多提交 100 条链接。"}, 400)
            tasks = []
            today = _now().date().isoformat()
            used = sum(1 for x in store["tasks"] if x.get("ownerUserId") == user_id and x.get("createdAt", "").startswith(today))
            daily_limit = int(entitlement.get("dailyParseLimit", 20))
            if daily_limit >= 0 and used + len(links) > daily_limit:
                return handler.send_json({"error": "DAILY_QUOTA_EXCEEDED"}, 429)
            quota = int(entitlement.get("parseQuota", -1))
            if quota >= 0 and int(entitlement.get("parseUsed", 0)) + len(links) > quota:
                return handler.send_json({"error": "PARSE_QUOTA_EXCEEDED"}, 429)
            pending_parse_task_ids = []
            for item in links:
                if not isinstance(item, dict):
                    return handler.send_json({"error": "链接参数格式错误。"}, 400)
                url, access_code = _clean_share_input(item.get("url"), item.get("accessCode"))
                try:
                    provider, share_id = _provider_for(url, str(item.get("provider") or ""))
                except ValueError as exc:
                    return handler.send_json({"error": str(exc)}, 400)
                if provider == "mock" and not getattr(app, "CLOUD_RESOLVER_MOCK_ENABLED", False):
                    return handler.send_json({"error": "PROVIDER_DISABLED"}, 503)
                pconfig = store["providers"].get(provider) or {}
                if not pconfig.get("enabled", True):
                    return handler.send_json({"error": "PROVIDER_DISABLED", "provider": provider}, 503)
                allowed_providers = set(entitlement.get("allowedProviders") or [])
                provider_allowed = provider in allowed_providers or (
                    provider == "qaiu" and QAIU_LEGACY_CLOUD_PROVIDERS.issubset(allowed_providers)
                )
                if not provider_allowed:
                    return handler.send_json({"error": "PROVIDER_DISABLED", "provider": provider}, 403)
                task = {"id": app.new_id("crtask"), "ownerUserId": user_id, "ownerRole": user.get("role"),
                        "resourceScope": "personal", "provider": provider, "shareId": share_id,
                        "shareUrl": url, "accessCodeEncrypted": _protect(app, access_code),
                        "remark": str(item.get("remark") or "")[:200], "version": str(item.get("version") or "")[:80],
                        "platform": str(item.get("platform") or "")[:80], "architecture": str(item.get("architecture") or "")[:80],
                        "language": str(item.get("language") or "")[:40], "tags": item.get("tags") if isinstance(item.get("tags"), list) else [],
                        "status": "processing", "errorCode": "", "files": [],
                        "createdAt": _iso(_now()), "updatedAt": _iso(_now())}
                # Explicit mock mode is for automated tests only and never enabled by default.
                if provider == "mock" and getattr(app, "CLOUD_RESOLVER_MOCK_ENABLED", False):
                    task["provider"] = "mock"; task["status"] = "parsed"; task["errorCode"] = ""
                    task["files"] = [{"id": app.new_id("file"), "name": str(x.get("name") or "测试文件")[:240],
                                      "path": str(x.get("path") or "/"), "size": max(0, int(x.get("size") or 0)),
                                      "type": str(x.get("type") or "file")} for x in (item.get("mockFiles") or body.get("mockFiles") or [])]
                elif provider != "mock":
                    pending_parse_task_ids.append(task["id"])
                store["tasks"].insert(0, task); tasks.append(task)
                _diag("parse_task_queued", {
                    "taskId": task["id"], "provider": provider, "shareUrl": url,
                    "accessCodePresent": bool(access_code), "metadata": {
                        "version": task.get("version", ""), "platform": task.get("platform", ""),
                        "architecture": task.get("architecture", ""), "language": task.get("language", ""),
                    },
                })
                entitlement["parseUsed"] = int(entitlement.get("parseUsed") or 0) + 1
                entitlement["dailyParseUsed"] = used + len(tasks); entitlement["lastUsedAt"] = task["createdAt"]
            _save(app, store); _audit(app, user, handler, "parse_submit", ",".join(x["id"] for x in tasks), {"count": len(tasks), "providers": sorted({x["provider"] for x in tasks})})
            for task_id in pending_parse_task_ids:
                _schedule_parse_task(app, task_id)
                _diag("parse_task_scheduled", {"taskId": task_id})
            latest_tasks = {row.get("id"): row for row in _load(app)["tasks"]}
            tasks = [_public_task(latest_tasks.get(task.get("id"), task)) for task in tasks]
            return handler.send_json({"tasks": tasks}, 201)
        if path == "/api/cloud-resolver/parse-tasks" and method == "GET":
            _require_entitlement(app, store, user)
            owned_tasks = [x for x in store["tasks"] if x.get("ownerUserId") == user_id]
            for task in owned_tasks:
                if task.get("status") == "processing":
                    _schedule_parse_task(app, task.get("id"))
            return handler.send_json({"tasks": [_public_task(x) for x in owned_tasks]})
        if path == "/api/cloud-resolver/parse-tasks/batch" and method == "POST":
            _require_entitlement(app, store, user)
            body = handler.read_body()
            action = str(body.get("action") or "")
            requested = list(dict.fromkeys(str(value) for value in body.get("ids", []) if value))
            owned = {row.get("id"): row for row in store["tasks"] if row.get("ownerUserId") == user_id}
            targets = [owned[value] for value in requested if value in owned]
            rejected = len(requested) - len(targets)
            results = []
            if action not in ("delete", "archive", "retry"):
                return handler.send_json({"error": "不支持的批量任务操作。"}, 400)
            if action == "delete":
                for task in targets:
                    if task.get("status") == "processing":
                        results.append({"id": task.get("id"), "ok": False, "reason": "请先取消正在解析的任务。"})
                        continue
                    store["tasks"].remove(task)
                    results.append({"id": task.get("id"), "ok": True})
            elif action == "archive":
                for task in targets:
                    task["status"] = "archived"
                    task["archivedAt"] = _iso(_now())
                    task["updatedAt"] = task["archivedAt"]
                    results.append({"id": task.get("id"), "ok": True})
            else:
                retry_task_ids = []
                for task in targets:
                    if task.get("status") not in ("failed", "parsed", "pending"):
                        results.append({"id": task.get("id"), "ok": False, "reason": "当前任务状态不能重试。"})
                        continue
                    if task.get("provider") == "mock":
                        task.update({"status": "failed", "errorCode": "OFFICIAL_API_UNSUPPORTED", "updatedAt": _iso(_now())})
                        results.append({"id": task.get("id"), "ok": False, "reason": task["errorCode"]})
                        continue
                    task.update({"status": "processing", "errorCode": "", "files": [], "updatedAt": _iso(_now())})
                    retry_task_ids.append(task["id"])
                    results.append({"id": task.get("id"), "ok": True, "reason": "PROCESSING"})
            _save(app, store)
            _audit(app, user, handler, "task_batch_" + action, ",".join(requested[:100]),
                   {"requested": len(requested), "succeeded": sum(1 for row in results if row["ok"]),
                    "failed": rejected + sum(1 for row in results if not row["ok"])})
            if action == "retry":
                for task_id in retry_task_ids:
                    _schedule_parse_task(app, task_id)
            return handler.send_json({"succeeded": sum(1 for row in results if row["ok"]),
                                      "failed": rejected + sum(1 for row in results if not row["ok"]),
                                      "results": results})
        match = re.fullmatch(r"/api/cloud-resolver/parse-tasks/([^/]+)(?:/(files|retry|cancel|archive|complete))?", path)
        if match:
            _require_entitlement(app, store, user)
            task = next((x for x in store["tasks"] if x.get("id") == match.group(1)), None)
            if not task:
                return handler.send_json({"error": "RESOURCE_NOT_FOUND"}, 404)
            _owner(task, user)
            action = match.group(2)
            if method == "GET" and action in (None, "files"):
                return handler.send_json(_public_task(task))
            if method == "DELETE" and action is None:
                if task.get("status") == "processing":
                    return handler.send_json({"error": "请先取消正在解析的任务，再删除。"}, 409)
                store["tasks"].remove(task)
                _save(app, store); _audit(app, user, handler, "parse_delete", task["id"])
                return handler.send_json({"ok": True})
            if method == "POST" and action == "archive":
                task["status"] = "archived"
                task["archivedAt"] = _iso(_now())
                task["updatedAt"] = task["archivedAt"]
                _save(app, store); _audit(app, user, handler, "task_archive", task["id"])
                return handler.send_json(_public_task(task))
            if method == "POST" and action == "complete":
                task["status"] = "completed"
                task["selectedFileCount"] = max(0, int(handler.read_body().get("selectedFileCount") or 0))
                task["processedAt"] = _iso(_now())
                task["updatedAt"] = task["processedAt"]
                _save(app, store); _audit(app, user, handler, "task_complete", task["id"],
                                          {"selectedFileCount": task["selectedFileCount"]})
                return handler.send_json(_public_task(task))
            if method == "POST" and action == "retry":
                if task.get("provider") == "mock":
                    task["status"] = "failed"; task["errorCode"] = "OFFICIAL_API_UNSUPPORTED"; task["updatedAt"] = _iso(_now())
                    _save(app, store); _audit(app, user, handler, "parse_retry", task["id"], {"provider": task["provider"]})
                    return handler.send_json(_public_task(task))
                task.update({"status": "processing", "errorCode": "", "files": [], "updatedAt": _iso(_now())})
                _save(app, store); _audit(app, user, handler, "parse_retry", task["id"], {"provider": task["provider"]})
                _schedule_parse_task(app, task["id"])
                latest_task = next((row for row in _load(app)["tasks"] if row.get("id") == task["id"]), task)
                return handler.send_json(_public_task(latest_task))
            if method == "POST" and action == "cancel":
                task["status"] = "cancelled"; task["updatedAt"] = _iso(_now()); _save(app, store)
                _audit(app, user, handler, "parse_cancel", task["id"]); return handler.send_json(_public_task(task))
        if path == "/api/cloud-resolver/assign/preview" and method == "POST":
            _require_entitlement(app, store, user)
            body = handler.read_body(); task = next((x for x in store["tasks"] if x.get("id") == body.get("taskId")), None)
            if not task:
                return handler.send_json({"error": "RESOURCE_NOT_FOUND"}, 404)
            _owner(task, user)
            if task.get("status") != "parsed":
                return handler.send_json({"error": task.get("errorCode") or "OFFICIAL_API_UNSUPPORTED"}, 409)
            cfg = app.read_config(user_id); rows = _button_scopes(cfg)
            selected = set(str(x) for x in body.get("fileIds", [])); files = [x for x in task.get("files", []) if x.get("id") in selected]
            if not files:
                return handler.send_json({"error": "请选择文件。"}, 400)
            if task.get("provider") == "xiaofeiji" and any(
                x.get("type") != "folder" and not str(x.get("downloadUrl") or "").strip() for x in files
            ):
                return handler.send_json({"error": "DOWNLOAD_URL_UNAVAILABLE"}, 409)
            scope_type = body.get("scopeType", "page"); scope_id = str(body.get("scopeId") or ""); section_index = int(body.get("sectionIndex") or 0)
            target_rows = [x for x in rows if x["scopeType"] == scope_type and x["scopeId"] == scope_id and x["sectionIndex"] == section_index]
            preview = []
            for file in files:
                name = _norm_name(file.get("name"))
                matches = [x for x in target_rows if _norm_name(x["button"].get("name")) == name]
                target_id = str((body.get("buttonTargets") or {}).get(file["id"]) or "")
                selected_target = next((x for x in target_rows if str(x["button"].get("id")) == target_id), None) if target_id else None
                create_new = body.get("createNewButton") is True
                action = ("create" if create_new else "reuse" if selected_target or (not target_id and len(matches) == 1)
                          else "target_not_found" if target_id else "ambiguous" if len(matches) > 1
                          else "target_required" if target_rows else "create")
                preview.append({"fileId": file["id"], "name": name, "action": action,
                                "matches": [{"buttonId": x["button"].get("id"), "name": x["button"].get("name"), "sectionName": x["sectionName"]} for x in matches]})
            return handler.send_json({"target": {"scopeType": scope_type, "scopeId": scope_id, "sectionIndex": section_index}, "preview": preview})
        if path == "/api/cloud-resolver/assign/commit" and method == "POST":
            entitlement = _require_entitlement(app, store, user)
            body = handler.read_body(); task = next((x for x in store["tasks"] if x.get("id") == body.get("taskId")), None)
            if not task:
                return handler.send_json({"error": "RESOURCE_NOT_FOUND"}, 404)
            _owner(task, user)
            if task.get("status") not in ("parsed", "completed"):
                return handler.send_json({"error": "OFFICIAL_API_UNSUPPORTED"}, 409)
            cfg = app.read_config(user_id); original_cfg = json.loads(json.dumps(cfg, ensure_ascii=False)); scope_type = body.get("scopeType", "page"); scope_id = str(body.get("scopeId") or ""); section_index = int(body.get("sectionIndex") or 0)
            if scope_type == "page": scope = (cfg.get("pages") or {}).get(scope_id)
            elif scope_type == "toolbox":
                tabs = cfg.get("toolbox_tabs") or []; scope = tabs[int(scope_id)] if scope_id.isdigit() and int(scope_id) < len(tabs) else None
            else: scope = None
            sections = (scope or {}).get("sections") or []
            if not scope or section_index < 0 or section_index >= len(sections):
                return handler.send_json({"error": "RESOURCE_FORBIDDEN"}, 403)
            files_by_id = {x["id"]: x for x in task.get("files", [])}; chosen = [files_by_id[x] for x in body.get("fileIds", []) if x in files_by_id]
            if not chosen: return handler.send_json({"error": "请选择文件。"}, 400)
            if task.get("provider") == "xiaofeiji" and any(
                x.get("type") != "folder" and not str(x.get("downloadUrl") or "").strip() for x in chosen
            ):
                return handler.send_json({"error": "DOWNLOAD_URL_UNAVAILABLE"}, 409)
            section = sections[section_index]; buttons = section.setdefault("buttons", []); results = []; config_changed = False
            for file in chosen:
                name = _norm_name(file.get("name")); matches = [] if body.get("createNewButton") is True else [b for b in buttons if _norm_name(b.get("name")) == name]
                fallback_url = str(file.get("downloadUrl") or "")
                # Legacy/mock providers may intentionally use their share URL;
                # Feijipan is rejected above unless it has a real direct URL.
                if not fallback_url and task.get("provider") != "xiaofeiji":
                    fallback_url = str(file.get("browserUrl") or task.get("shareUrl") or "")
                if not fallback_url and file.get("type") != "folder":
                    results.append({"fileId": file["id"], "status": "unavailable"})
                    continue
                target_id = str((body.get("buttonTargets") or {}).get(file["id"]) or "")
                button = next((b for b in buttons if str(b.get("id")) == target_id), None) if target_id else (matches[0] if len(matches) == 1 else None)
                created = False
                if not body.get("createNewButton"):
                    if target_id and not button: results.append({"fileId": file["id"], "status": "target_not_found"}); continue
                    if not target_id and len(matches) > 1: results.append({"fileId": file["id"], "status": "ambiguous"}); continue
                    if not target_id and not matches and buttons: results.append({"fileId": file["id"], "status": "target_required"}); continue
                if not button:
                    browser_only = task.get("provider") == "weiyun" and not file.get("downloadUrl")
                    button = app.new_button({"name": name, "description": task.get("remark") or "", "action": "link" if browser_only else "download",
                                             "download_url": fallback_url, "backup_url": file.get("backupUrl") or "",
                                             "url": fallback_url, "target": fallback_url,
                                             "files": [], "download_mode": "multiple"})
                    buttons.append(button); created = True
                    config_changed = True
                elif task.get("provider") != "weiyun" and file.get("downloadUrl"):
                    # The resolved source is a downloadable line, even when
                    # the selected existing button was previously a plain link.
                    button["action"] = "download"
                # Keep the admin button editor in sync with the source list.
                # Cloud sources remain authoritative for runtime failover, but
                # the editable backup_urls field makes every added line visible
                # and manually manageable from the button page.
                if not created and fallback_url and str(button.get("download_url") or button.get("url") or button.get("target") or "") != fallback_url:
                    existing_backups = button.get("backup_urls") if isinstance(button.get("backup_urls"), list) else []
                    if not existing_backups and button.get("backup_url"):
                        existing_backups = [button.get("backup_url")]
                    existing_backups = [str(value).strip() for value in existing_backups if str(value).strip()]
                    if fallback_url not in existing_backups and fallback_url != str(button.get("download_url") or button.get("url") or button.get("target") or ""):
                        existing_backups.append(fallback_url)
                    if existing_backups:
                        normalized_backups = list(dict.fromkeys(existing_backups))
                        if button.get("backup_urls") != normalized_backups or button.get("backup_url") != normalized_backups[0]:
                            button["backup_urls"] = normalized_backups; button["backup_url"] = normalized_backups[0]
                            config_changed = True
                elif not (button.get("download_url") or button.get("url") or button.get("target")) and fallback_url:
                    button["download_url"] = fallback_url
                    button["url"] = fallback_url
                    button["target"] = fallback_url
                    config_changed = True
                    if file.get("backupUrl"):
                        button["backup_url"] = file["backupUrl"]
                        config_changed = True
                digest = hashlib.sha256((task["provider"] + ":" + task["shareId"] + ":" + file["id"]).encode("utf-8")).hexdigest()
                duplicate = any(x.get("sourceKey") == digest for x in store["sources"] if x.get("ownerUserId") == user_id and x.get("buttonId") == button.get("id"))
                if duplicate: results.append({"fileId": file["id"], "buttonId": button.get("id"), "status": "duplicate"}); continue
                source = {"id": app.new_id("crsrc"), "ownerUserId": user_id, "ownerRole": user.get("role"), "resourceScope": "personal",
                          "resourceId": task["id"], "sourceId": task["id"], "buttonId": button.get("id"), "provider": task["provider"],
                          "providerName": file.get("providerName") or task.get("providerName", ""),
                          "resolverType": file.get("resolverType") or task.get("resolverType", ""),
                          "shareUrl": task["shareUrl"], "shareId": task["shareId"], "accessCodeEncrypted": task.get("accessCodeEncrypted", ""),
                          "fileId": file["id"], "filePath": file.get("path", ""), "fileName": name, "fileSize": file.get("size", 0),
                          "downloadUrl": file.get("downloadUrl", ""), "backupUrl": file.get("backupUrl", ""),
                          "downloadHeaders": file.get("downloadHeaders") or {},
                          "version": task.get("version", ""), "platform": task.get("platform", ""), "architecture": task.get("architecture", ""),
                          "language": task.get("language", ""), "priority": len([x for x in store["sources"] if x.get("buttonId") == button.get("id")]),
                          "enabled": True, "status": "draft", "isPrimary": created, "parseStatus": task.get("status"), "sourceKey": digest,
                          "createdBy": user_id, "updatedBy": user_id, "createdAt": _iso(_now()), "updatedAt": _iso(_now())}
                store["sources"].append(source); button.setdefault("cloudSources", []).append({k: source[k] for k in ("id", "provider", "fileName", "status", "isPrimary", "priority")})
                results.append({"fileId": file["id"], "buttonId": button.get("id"), "status": "created_button" if created else "added_backup_source"})
            try:
                if config_changed or any(result.get("status") in ("created_button", "added_backup_source") for result in results):
                    app.write_config(cfg, user_id)
                    if not any(x.get("ownerUserId") == user_id and x.get("sourceId") == task["id"] for x in store["resources"]):
                        store["resources"].append({"id": app.new_id("crres"), "ownerUserId": user_id, "ownerRole": user.get("role"), "resourceScope": "personal", "sourceId": task["id"], "createdAt": _iso(_now()), "updatedAt": _iso(_now())})
                _save(app, store)
            except Exception:
                app.write_config(original_cfg, user_id)
                raise
            _audit(app, user, handler, "assign_commit", task["id"], {"results": results})
            succeeded = sum(1 for row in results if row.get("status") in ("created_button", "added_backup_source"))
            skipped = sum(1 for row in results if row.get("status") == "duplicate")
            failed = len(results) - succeeded - skipped
            if succeeded and not failed:
                task["status"] = "completed"
                task["selectedFileCount"] = len(chosen)
                task["processedAt"] = _iso(_now())
                task["updatedAt"] = task["processedAt"]
                _save(app, store)
            return handler.send_json({"results": results})
        if path == "/api/cloud-resolver/resources" and method == "GET":
            _require_entitlement(app, store, user)
            return handler.send_json({"resources": [x for x in store["resources"] if x.get("ownerUserId") == user_id],
                                     "sources": [_public_source(x) for x in store["sources"] if x.get("ownerUserId") == user_id]})
        resource_match = re.fullmatch(r"/api/cloud-resolver/resources/([^/]+)", path)
        if resource_match and method in ("PATCH", "DELETE"):
            _require_entitlement(app, store, user)
            resource = next((x for x in store["resources"] if x.get("id") == resource_match.group(1)), None)
            if not resource:
                return handler.send_json({"error": "RESOURCE_NOT_FOUND"}, 404)
            _owner(resource, user)
            if method == "DELETE":
                source_ids = {x.get("id") for x in store["sources"] if x.get("resourceId") == resource.get("sourceId") or x.get("sourceId") == resource.get("sourceId")}
                store["sources"] = [x for x in store["sources"] if x.get("id") not in source_ids]
                cfg = app.read_config(user_id)
                for row in _button_scopes(cfg):
                    button = row["button"]
                    button["cloudSources"] = [x for x in button.get("cloudSources", []) if x.get("id") not in source_ids]
                app.write_config(cfg, user_id)
                store["resources"].remove(resource)
                _save(app, store); _audit(app, user, handler, "resource_delete", resource["id"])
                return handler.send_json({"ok": True})
            body = handler.read_body()
            for key in ("name", "remark", "tags", "enabled"):
                if key in body:
                    resource[key] = body[key]
            resource["updatedAt"] = _iso(_now()); _save(app, store)
            _audit(app, user, handler, "resource_update", resource["id"], {"fields": sorted(body.keys())})
            return handler.send_json(resource)
        source_match = re.fullmatch(r"/api/cloud-resolver/sources/([^/]+)(?:/(refresh|primary))?", path)
        if source_match and method in ("PATCH", "DELETE", "POST"):
            _require_entitlement(app, store, user)
            source = next((x for x in store["sources"] if x.get("id") == source_match.group(1)), None)
            if not source:
                return handler.send_json({"error": "RESOURCE_NOT_FOUND"}, 404)
            _owner(source, user); action = source_match.group(2)
            if method == "DELETE":
                store["sources"].remove(source)
                cfg = app.read_config(user_id)
                for row in _button_scopes(cfg):
                    if row["button"].get("id") == source.get("buttonId"):
                        row["button"]["cloudSources"] = [x for x in row["button"].get("cloudSources", []) if x.get("id") != source.get("id")]
                app.write_config(cfg, user_id)
                _save(app, store); _audit(app, user, handler, "source_delete", source["id"])
                return handler.send_json({"ok": True})
            if action == "refresh":
                if source.get("provider") not in ("mock",):
                    try:
                        access_code = _unprotect(app, source.get("accessCodeEncrypted"))
                        refreshed = _provider_parse_configured(source.get("provider"), source.get("shareUrl"), access_code,
                                                              _qaiu_api_key(app, store), _qaiu_configured_api_base(store))
                        match_file = next((x for x in refreshed if x.get("id") == source.get("fileId")), None)
                        if match_file:
                            source.update({"downloadUrl": match_file.get("downloadUrl", ""),
                                           "backupUrl": match_file.get("backupUrl", ""),
                                           "downloadHeaders": match_file.get("downloadHeaders") or {},
                                           "resolverType": match_file.get("resolverType") or source.get("resolverType") or "",
                                           "fileSize": match_file.get("size", source.get("fileSize", 0))})
                            source["status"] = "draft" if _has_downloadable_file([match_file]) else "unavailable"
                        else:
                            source["status"] = "unavailable"
                    except ProviderError:
                        source["status"] = "unavailable"
                source["lastCheckedAt"] = _iso(_now())
                if source.get("enabled", True) and source.get("status") != "unavailable":
                    source["status"] = "draft"
                elif not source.get("enabled", True):
                    source["status"] = "disabled"
            elif action == "primary":
                for row in store["sources"]:
                    if row.get("ownerUserId") == user_id and row.get("buttonId") == source.get("buttonId"):
                        row["isPrimary"] = row.get("id") == source.get("id")
            else:
                body = handler.read_body()
                for key in ("enabled", "status", "priority", "isPrimary"):
                    if key in body: source[key] = body[key]
            source["updatedAt"] = _iso(_now()); _save(app, store); _audit(app, user, handler, "source_update", source["id"], {"action": action or "patch"})
            return handler.send_json(_public_source(source))
        if path == "/api/cloud-resolver/download-task" and method == "POST":
            entitlement = _require_entitlement(app, store, user)
            body = handler.read_body(); source = next((x for x in store["sources"] if x.get("id") == body.get("sourceId")), None)
            if not source: return handler.send_json({"error": "RESOURCE_NOT_FOUND"}, 404)
            _owner(source, user)
            if source.get("enabled") is False or source.get("status") in ("disabled", "expired", "unavailable", "failed"):
                return handler.send_json({"error": "DOWNLOAD_SOURCE_UNAVAILABLE"}, 409)
            download_url = source.get("downloadUrl") or ""
            backup_url = source.get("backupUrl") or ""
            if source.get("provider") == "lanzou" or (not download_url and source.get("provider") not in ("mock",)):
                try:
                    access_code = _unprotect(app, source.get("accessCodeEncrypted"))
                    if source.get("provider") == "lanzou":
                        refreshed = _lanzou_parse(source.get("shareUrl"), access_code)
                    else:
                        refreshed = _provider_parse_configured(source.get("provider"), source.get("shareUrl"), access_code,
                                                              _qaiu_api_key(app, store), _qaiu_configured_api_base(store))
                    match_file = next((x for x in refreshed if x.get("id") == source.get("fileId")), None)
                    if match_file:
                        download_url = match_file.get("downloadUrl") or download_url
                        backup_url = match_file.get("backupUrl") or backup_url
                        source.update({"downloadUrl": download_url, "backupUrl": backup_url,
                                       "downloadHeaders": match_file.get("downloadHeaders") or source.get("downloadHeaders") or {},
                                       "resolverType": match_file.get("resolverType") or source.get("resolverType") or "",
                                       "updatedAt": _iso(_now())})
                except ProviderError:
                    pass
            # Xiaofeiji is downloaded through its official redirect API. Only
            # Tianyi remains browser-only because its public API does not issue
            # anonymous file URLs.
            browser_only = source.get("provider") in ("tianyi", "weiyun") and not download_url
            browser_url = str(source.get("shareUrl") or "") if browser_only else ""
            proxy_url = _cloud_proxy_url(handler, source["id"], (user or {}).get("apiKey") or "") if download_url else ""
            task = {"id": app.new_id("crdl"), "ownerUserId": user_id, "resourceScope": "personal", "sourceId": source["id"],
                    "provider": source.get("provider", ""),
                    "resolverType": source.get("resolverType", ""), "providerName": source.get("providerName", ""),
                    "status": "queued" if download_url else ("browser" if browser_only else "failed"),
                    "errorCode": "" if download_url else (("WEIYUN_LOGIN_REQUIRED" if source.get("provider") == "weiyun" else "LOGIN_REQUIRED_FOR_DOWNLOAD") if browser_only else "DOWNLOAD_URL_UNAVAILABLE"),
                    "browserOnly": browser_only, "browserUrl": browser_url,
                    "message": (("腾讯微云文件已识别，下载需要登录微云；请在官方分享页登录后选择文件下载。" if source.get("provider") == "weiyun" else "天翼云文件已识别，但下载需要登录天翼云；已打开分享页面，请转存后下载。") if browser_only else ("小飞机网盘官方直链暂时不可用，请刷新线路后重试。" if source.get("provider") == "xiaofeiji" and not download_url else "")),
                    "downloadUrl": proxy_url, "backupUrl": proxy_url,
                    "upstreamUrl": "" if source.get("resolverType") == "qaiu" else download_url,
                    "upstreamBackupUrl": "" if source.get("resolverType") == "qaiu" else backup_url,
                    "createdAt": _iso(_now()), "updatedAt": _iso(_now())}
            store["downloadTasks"].insert(0, task); _save(app, store); _audit(app, user, handler, "download_start", task["id"], {"sourceId": source["id"]})
            return handler.send_json(task, 201)
        if path == "/api/cloud-resolver/download-tasks" and method == "GET":
            _require_entitlement(app, store, user)
            return handler.send_json({"tasks": [_public_download_task(x) for x in store["downloadTasks"] if x.get("ownerUserId") == user_id]})
        if path.startswith("/api/admin/users/"):
            if not is_super:
                return handler.send_json({"error": "只有总管理员可以操作。"}, 403)
            user_match = re.fullmatch(r"/api/admin/users/([^/]+)/cloud-entitlement(?:/(grant|renew|revoke|history))?", path)
            if not user_match:
                return handler.send_json({"error": "接口不存在。"}, 404)
            target_id, action = user_match.group(1), user_match.group(2)
            target = app.find_user_by_id(target_id)
            if not target:
                return handler.send_json({"error": "用户不存在。"}, 404)
            current = _effective_entitlement(store, target)
            if action is None and method == "GET":
                return handler.send_json({"entitlement": _public_entitlement(current), "allowed": bool(current)})
            if action == "history" and method == "GET":
                return handler.send_json({"items": [row for row in store["renewalHistory"] if row.get("userId") == target_id][:200]})
            if action == "revoke" and method in ("POST", "DELETE"):
                rows = [row for row in store["entitlements"] if row.get("userId") == target_id and row.get("featureCode") == FEATURE and row.get("status") == "active"]
                for row in rows:
                    row["status"] = "revoked"; row["revokedAt"] = _iso(_now()); row["updatedAt"] = _iso(_now())
                _save(app, store); _audit(app, user, handler, "entitlement_revoke", target_id, {"count": len(rows)})
                return handler.send_json({"ok": True, "revoked": len(rows)})
            if action in ("grant", "renew") and method == "POST":
                body = handler.read_body()
                plan = next((x for x in store["plans"] if x.get("id") == body.get("planId") and x.get("enabled", True)), None)
                if not plan:
                    plan = {"id": body.get("planId", "admin-grant"), "durationDays": int(body.get("durationDays", 30)),
                            "parseQuota": int(body.get("parseQuota", -1)), "trafficQuota": int(body.get("trafficQuota", -1)),
                            "dailyParseLimit": int(body.get("dailyParseLimit", -1)), "allowedProviders": body.get("allowedProviders") or list(PROVIDERS)}
                entitlement = _grant(app, store, target_id, plan, "admin_grant", actor_id=user_id, handler=handler,
                                     reference_id="admin:" + action, renew=body.get("renewExisting", True) is not False,
                                     overwrite=body.get("overwrite", False) is True, absolute_expiry=body.get("expiresAt") or body.get("expiredAt", ""),
                                     note=str(body.get("note") or ""))
                _save(app, store); _audit(app, user, handler, "entitlement_" + action, target_id, {"entitlementId": entitlement["id"]})
                return handler.send_json(_public_entitlement(entitlement), 201)
            if action is None and method == "PATCH":
                if not current:
                    return handler.send_json({"error": "当前用户没有有效网盘权益，请先授权。"}, 404)
                body = handler.read_body()
                allowed = [key for key in body.get("allowedProviders", current.get("allowedProviders", [])) if key in PROVIDERS]
                for key in ("parseQuota", "trafficQuota", "dailyParseLimit", "planId", "adminNote"):
                    if key in body: current[key] = body[key]
                if "allowedProviders" in body: current["allowedProviders"] = allowed
                if body.get("expiresAt") or body.get("expiredAt"):
                    expiry = _parse_time(body.get("expiresAt") or body.get("expiredAt"))
                    if expiry <= _now(): return handler.send_json({"error": "到期时间必须晚于当前时间。"}, 400)
                    current["expiredAt"] = _iso(expiry); current["expiresAt"] = _iso(expiry)
                current["updatedAt"] = _iso(_now()); _save(app, store)
                _audit(app, user, handler, "entitlement_update", target_id, {"fields": sorted(body.keys())})
                return handler.send_json(_public_entitlement(current))
        if path.startswith("/api/admin/cloud-resolver/"):
            if not is_super: return handler.send_json({"error": "只有总管理员可以操作。"}, 403)
            if path == "/api/admin/cloud-resolver/settings" and method == "GET":
                return handler.send_json({"enabled": store["enabled"], "settings": store["settings"],
                                          "providers": store["providers"], "qaiuApiKeySet": bool(_qaiu_api_key(app, store)),
                                          "qaiuApiBase": _qaiu_api_base_for_display(store)})
            if path == "/api/admin/cloud-resolver/settings" and method == "PATCH":
                body = handler.read_body()
                api_base_update = None
                if "qaiuApiBase" in body:
                    raw_api_base = str(body.get("qaiuApiBase") or "").strip()
                    try:
                        api_base_update = _normalize_qaiu_api_base(raw_api_base) if raw_api_base else ""
                    except ValueError as exc:
                        return handler.send_json({"error": str(exc)}, 400)
                before = {"enabled": store["enabled"], "settings": dict(store["settings"]),
                          "qaiuApiBase": _qaiu_api_base_for_display(store)}
                if "enabled" in body: store["enabled"] = bool(body["enabled"])
                store["settings"].update({k: v for k, v in (body.get("settings") or {}).items() if k in ("maxFileSize", "dailyParseLimit", "maxRetries", "mergeByName")})
                if api_base_update is not None: store["qaiuApiBase"] = api_base_update
                if body.get("clearQaiuApiKey") is True:
                    store["qaiuApiKeyEncrypted"] = ""
                elif "qaiuApiKey" in body and str(body.get("qaiuApiKey") or "").strip():
                    key = str(body["qaiuApiKey"]).strip()
                    if len(key) > 512:
                        return handler.send_json({"error": "API Key 长度不能超过 512 个字符。"}, 400)
                    store["qaiuApiKeyEncrypted"] = _protect(app, key)
                _save(app, store); _audit(app, user, handler, "settings_update", details={"before": before, "after": {"enabled": store["enabled"], "settings": store["settings"], "qaiuApiBase": _qaiu_api_base_for_display(store)}})
                return handler.send_json({"enabled": store["enabled"], "settings": store["settings"],
                                          "qaiuApiKeySet": bool(_qaiu_api_key(app, store)),
                                          "qaiuApiBase": _qaiu_api_base_for_display(store)})
            if path == "/api/admin/cloud-resolver/providers" and method == "GET": return handler.send_json(store["providers"])
            provider_match = re.fullmatch(r"/api/admin/cloud-resolver/providers/([^/]+)", path)
            if provider_match and method == "PATCH":
                key = provider_match.group(1)
                if key not in PROVIDERS: return handler.send_json({"error": "Provider 不存在。"}, 404)
                body = handler.read_body(); before = dict(store["providers"][key]); store["providers"][key].update({"enabled": bool(body.get("enabled", before.get("enabled", True)))})
                store["providers"][key]["status"] = "待接入"; _save(app, store); _audit(app, user, handler, "provider_update", key, {"before": before, "after": store["providers"][key]})
                return handler.send_json(store["providers"][key])
            grant = re.fullmatch(r"/api/admin/cloud-resolver/users/([^/]+)/grant", path)
            if grant and method == "POST":
                target = app.find_user_by_id(grant.group(1))
                if not target: return handler.send_json({"error": "用户不存在。"}, 404)
                body = handler.read_body(); plan = {"id": "admin-grant", "durationDays": int(body.get("durationDays", 3650)), "parseQuota": int(body.get("parseQuota", -1)), "trafficQuota": int(body.get("trafficQuota", -1)), "allowedProviders": body.get("allowedProviders") or list(PROVIDERS), "dailyParseLimit": int(body.get("dailyParseLimit", -1))}
                entitlement = _grant(app, store, target["id"], plan, "admin_grant", actor_id=user_id, handler=handler); _save(app, store); _audit(app, user, handler, "entitlement_grant", target["id"], {"entitlementId": entitlement["id"], "source": "admin_grant"})
                return handler.send_json(_public_entitlement(entitlement), 201)
            if grant and method == "DELETE":
                rows = [x for x in store["entitlements"] if x.get("userId") == grant.group(1) and x.get("featureCode") == FEATURE and x.get("status") == "active"]
                for row in rows: row["status"] = "revoked"; row["revokedAt"] = _iso(_now())
                _save(app, store); _audit(app, user, handler, "entitlement_revoke", grant.group(1), {"count": len(rows)})
                return handler.send_json({"ok": True, "revoked": len(rows)})
            if path == "/api/admin/cloud-resolver/plans" and method == "GET": return handler.send_json({"plans": store["plans"]})
            if path == "/api/admin/cloud-resolver/plans" and method == "POST":
                body = handler.read_body()
                body.setdefault("dailyParseLimit", store["settings"].get("dailyParseLimit", -1))
                plan = _normalize_plan(app, body); store["plans"].append(plan); _save(app, store); _audit(app, user, handler, "plan_create", plan["id"], {"name": plan["name"]}); return handler.send_json(plan, 201)
            plan_match = re.fullmatch(r"/api/admin/cloud-resolver/plans/([^/]+)", path)
            if plan_match and method in ("PATCH", "DELETE"):
                plan = next((x for x in store["plans"] if x.get("id") == plan_match.group(1)), None)
                if not plan: return handler.send_json({"error": "套餐不存在。"}, 404)
                if method == "DELETE":
                    plan["enabled"] = False; plan["disabledAt"] = _iso(_now()); _save(app, store); _audit(app, user, handler, "plan_disable", plan["id"])
                    return handler.send_json(plan)
                body = handler.read_body()
                allowed = [x for x in body.get("allowedProviders", plan.get("allowedProviders", [])) if x in PROVIDERS]
                for key in ("name", "description", "memberPrice", "agentWholesalePrice", "durationDays", "parseQuota", "trafficQuota", "dailyParseLimit", "maxFileSize", "sortOrder", "enabled"):
                    if key in body: plan[key] = body[key]
                if "allowedProviders" in body: plan["allowedProviders"] = allowed
                plan["updatedAt"] = _iso(_now()); _save(app, store); _audit(app, user, handler, "plan_update", plan["id"], {"fields": sorted(body.keys())})
                return handler.send_json(plan)
            if path == "/api/admin/cloud-resolver/resources" and method == "GET":
                return handler.send_json({"resources": store["resources"], "sources": [_public_source(x) for x in store["sources"]]})
            user_resources = re.fullmatch(r"/api/admin/cloud-resolver/users/([^/]+)/resources", path)
            if user_resources and method == "GET":
                target_id = user_resources.group(1)
                return handler.send_json({
                    "resources": [x for x in store["resources"] if x.get("ownerUserId") == target_id],
                    "sources": [_public_source(x) for x in store["sources"] if x.get("ownerUserId") == target_id],
                })
            if path == "/api/admin/cloud-resolver/usage" and method == "GET":
                return handler.send_json({"entitlements": store["entitlements"], "tasks": [_public_task(x) for x in store["tasks"]], "downloadTasks": [_public_download_task(x) for x in store["downloadTasks"]]})
            if path == "/api/admin/cloud-resolver/audit-logs" and method == "GET":
                events = app.read_audit_events()
                events["items"] = [x for x in events.get("items", []) if str(x.get("action") or "").startswith("cloud_resolver_")]
                return handler.send_json(events)
            if path == "/api/admin/cloud-resolver/codes" and method == "GET":
                return handler.send_json({"codes": [{**_public_code(x, include_code=True), "id": x.get("id") or x.get("codeHash", "")[:16]} for x in store["codes"]]})
            if path == "/api/admin/cloud-resolver/codes" and method == "POST":
                body = handler.read_body(); plan = next((x for x in store["plans"] if x.get("id") == body.get("planId")), None)
                if not plan: return handler.send_json({"error": "套餐不存在。"}, 400)
                codes = []
                for _ in range(max(1, min(500, int(body.get("count", 1))))):
                    code = app.random_hex(8).upper(); max_uses = max(1, min(100, int(body.get("maxUses", 1))))
                    row = {"code": code, "codeHash": hashlib.sha256(code.encode()).hexdigest(), "maskedCode": code[:4] + "****" + code[-4:], "planId": plan["id"], "featureCode": FEATURE, "maxUses": max_uses, "usedCount": 0, "status": "assigned" if body.get("assignedAgentId") else "available", "assignedAgentId": str(body.get("assignedAgentId") or ""), "createdBy": user_id, "createdAt": _iso(_now()), "expiresAt": str(body.get("expiresAt") or ""), "redeemedUsers": [], "durationDays": int(plan.get("durationDays", 30)), "parseQuota": int(body.get("parseQuota", plan.get("parseQuota", -1))), "trafficQuota": int(plan.get("trafficQuota", -1)), "dailyParseLimit": int(plan.get("dailyParseLimit", 20)), "allowedProviders": [key for key in (body.get("allowedProviders", plan.get("allowedProviders", list(PROVIDERS))) or []) if key in PROVIDERS]}; store["codes"].append(row); codes.append(code)
                _save(app, store); _audit(app, user, handler, "codes_create", plan["id"], {"count": len(codes), "assignedAgentId": str(body.get("assignedAgentId") or "")}); return handler.send_json({"codes": codes}, 201)
            if path == "/api/admin/cloud-resolver/codes" and method == "DELETE":
                body = handler.read_body()
                ids = {str(value or "").strip().lower() for value in body.get("ids", []) if str(value or "").strip()}
                if not ids: return handler.send_json({"error": "请选择要删除的卡密。"}, 400)
                original_count = len(store["codes"])
                store["codes"] = [row for row in store["codes"] if str(row.get("id") or row.get("codeHash", "")[:16]).lower() not in ids]
                deleted = original_count - len(store["codes"])
                _save(app, store); _audit(app, user, handler, "cloud_resolver_codes_delete", "", {"count": deleted})
                return handler.send_json({"ok": True, "deleted": deleted})
            if path in ("/api/admin/cloud-resolver/codes/assign-to-agent", "/api/admin/cloud-resolver/codes/assign-agent") and method == "POST":
                body = handler.read_body()
                target_id = str(body.get("agentId") or "")
                target = app.find_user_by_id(target_id)
                if not target or not app.is_agent(target):
                    return handler.send_json({"error": "代理不存在。"}, 404)
                digest = hashlib.sha256(str(body.get("code") or "").strip().upper().encode()).hexdigest()
                row = next((x for x in store["codes"] if x.get("codeHash") == digest), None)
                if not row or row.get("status") not in ("available", "assigned"):
                    return handler.send_json({"error": "卡密不存在或不可分配。"}, 400)
                row["assignedAgentId"] = target_id; row["status"] = "assigned"
                _save(app, store); _audit(app, user, handler, "code_assign_agent", target_id, {"planId": row.get("planId")})
                return handler.send_json({"ok": True})
            code_match = re.fullmatch(r"/api/admin/cloud-resolver/codes/([^/]+)/(disable|enable)", path)
            if code_match and method == "POST":
                code_id = code_match.group(1).strip().lower()
                digest = hashlib.sha256(code_match.group(1).strip().upper().encode()).hexdigest()
                row = next((x for x in store["codes"] if x.get("id", "").lower() == code_id or x.get("codeHash", "").lower()[:16] == code_id or x.get("codeHash") == digest), None)
                if not row: return handler.send_json({"error": "激活码不存在。"}, 404)
                if code_match.group(2) == "disable":
                    if row.get("status") != "disabled": row["statusBeforeDisabled"] = row.get("status") or ("assigned" if row.get("assignedAgentId") else "available")
                    row["status"] = "disabled"
                else:
                    previous_status = row.pop("statusBeforeDisabled", "")
                    row["status"] = previous_status if previous_status and previous_status != "disabled" else ("assigned" if row.get("assignedAgentId") else "available")
                row["updatedAt"] = _iso(_now()); _save(app, store); _audit(app, user, handler, "cloud_resolver_code_" + code_match.group(2), row.get("maskedCode", ""))
                return handler.send_json(_public_code(row))
        if path.startswith("/api/agent/cloud-resolver/"):
            if not app.is_agent(user): return handler.send_json({"error": "仅代理可访问。"}, 403)
            if path in ("/api/agent/cloud-resolver/code-inventory", "/api/agent/cloud-resolver/codes") and method == "GET":
                return handler.send_json({"codes": [{**_public_code(x), "inventoryId": x.get("codeHash", "")[:16], "redeemable": x.get("status") in ("available", "assigned")} for x in store["codes"] if x.get("assignedAgentId") == user_id]})
            if path == "/api/agent/cloud-resolver/sell-code" and method == "POST":
                body = handler.read_body()
                inventory_id = str(body.get("inventoryId") or "").strip().lower()
                digest = hashlib.sha256(str(body.get("code") or "").strip().upper().encode()).hexdigest()
                # An administrator assigns inventory with ``assigned`` status;
                # keep accepting ``available`` for codes created by older
                # versions of the module.  Selling is still restricted to the
                # assigned agent and the target must be their own member.
                row = next((x for x in store["codes"]
                            if (x.get("codeHash") == digest or bool(inventory_id) and x.get("codeHash", "").lower()[:16] == inventory_id)
                            and x.get("assignedAgentId") == user_id
                            and x.get("status") in ("available", "assigned")), None)
                if not row: return handler.send_json({"error": "卡密不属于当前代理或已售出。"}, 403)
                target = app.find_user_by_id(str(body.get("userId") or ""))
                if not target or target.get("parentAgentId") != user_id: return handler.send_json({"error": "只能销售给自己的下级成员。"}, 403)
                price = float((app.read_system_settings().get("agent") or {}).get("cloudCodePrice") or 0)
                if price > 0 and row.get("status") not in ("available", "assigned"):
                    return handler.send_json({"error": "该卡密已销售，不能重复扣费。"}, 409)
                if price > 0:
                    with app.PAYMENT_LOCK:
                        latest = app.read_users()
                        agent = next((x for x in latest.get("users", []) if x.get("id") == user_id), None)
                        if not agent or float(agent.get("balance") or 0) < price:
                            return handler.send_json({"error": "代理余额不足，无法销售网盘激活码。"}, 400)
                        agent["balance"] = round(float(agent.get("balance") or 0) - price, 2)
                        app.write_users(latest)
                row["status"] = "sold"; row["soldTo"] = target["id"]; row["soldAt"] = _iso(_now()); row["soldPrice"] = price; _save(app, store); _audit(app, user, handler, "code_sell", row["planId"], {"recipientId": target["id"], "price": price}); return handler.send_json({"ok": True, "message": "卡密已售出，需由成员本人兑换。", "balance": next((x.get("balance") for x in app.read_users().get("users", []) if x.get("id") == user_id), user.get("balance", 0))})
            if path == "/api/agent/cloud-resolver/sales" and method == "GET":
                return handler.send_json({"sales": [{"planId": x.get("planId"), "soldTo": x.get("soldTo"), "soldAt": x.get("soldAt"), "status": x.get("status")}
                                            for x in store["codes"] if x.get("assignedAgentId") == user_id and x.get("status") in ("sold", "redeemed")]})
        return handler.send_json({"error": "接口不存在。"}, 404)


def _grant(app, store, user_id, plan, source, actor_id="", handler=None,
           reference_id="", renew=True, overwrite=False, absolute_expiry="", note=""):
    return _apply_entitlement(app, store, user_id, plan, source, actor_id=actor_id,
                              handler=handler, reference_id=reference_id, renew=renew,
                              overwrite=overwrite, absolute_expiry=absolute_expiry, note=note)


def _public_code(row, include_code=False):
    return {key: value for key, value in row.items()
            if key not in ("codeHash", "redeemedUsers", "code") or (include_code and key == "code")}


def fulfill_order(app, order, external_trade_no=""):
    """Fulfill an existing shared order exactly once after payment confirmation."""
    if order.get("action") != "cloud_resolver_plan_purchase":
        return False
    if order.get("fulfilledAt"):
        return True
    if order.get("status") == "expired":
        raise ValueError("订单已过期，请重新创建支付订单。")
    if order.get("status") == "pending" and _order_expiry(app, order) <= _now():
        order["status"] = "expired"
        order["expiredAt"] = _iso(_now())
        order["updatedAt"] = order["expiredAt"]
        raise ValueError("订单已过期，请重新创建支付订单。")
    store = _load(app)
    user = app.find_user_by_id(order.get("userId"))
    plan_id = (order.get("request") or {}).get("planId") or order.get("cloudPlanId")
    plan = next((row for row in store["plans"] if row.get("id") == plan_id), None)
    if not user or not plan:
        raise ValueError("套餐订单信息无效。")
    entitlement = _grant(app, store, user["id"], plan, "payment", actor_id=user["id"],
                         reference_id=order.get("id", ""), handler=None, renew=True)
    _save(app, store)
    order["status"] = "paid"
    order["fulfilledAt"] = _iso(_now())
    order["paidAt"] = order.get("paidAt") or _iso(_now())
    order["externalTradeNo"] = external_trade_no or order.get("externalTradeNo", "")
    order["fulfilledBy"] = "payment_callback"
    return entitlement


def _normalize_plan(app, body):
    name = str(body.get("name") or "").strip()[:80]
    if not name: raise ValueError("套餐名称不能为空。")
    allowed = [x for x in body.get("allowedProviders", list(PROVIDERS)) if x in PROVIDERS]
    return {"id": app.new_id("crplan"), "name": name, "description": str(body.get("description") or "")[:500],
            "memberPrice": max(0, float(body.get("memberPrice") or 0)), "agentWholesalePrice": max(0, float(body.get("agentWholesalePrice") or 0)),
            "durationDays": max(1, min(36500, int(body.get("durationDays") or 30))), "parseQuota": max(-1, int(body.get("parseQuota", -1))),
            "trafficQuota": max(-1, int(body.get("trafficQuota", -1))), "dailyParseLimit": max(-1, int(body.get("dailyParseLimit", 20))),
            "maxFileSize": max(0, int(body.get("maxFileSize") or 0)), "allowedProviders": allowed, "enabled": body.get("enabled", True) is not False,
            "sortOrder": int(body.get("sortOrder") or 0), "createdAt": _iso(_now())}
