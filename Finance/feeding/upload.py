"""Upload a file to the dashboard Worker (stored in R2)."""
from __future__ import annotations

import os
import urllib.error
import urllib.request
from pathlib import Path

WORKER_URL = "https://tiny-dew-e513.leeway-id.workers.dev/"
SECRET_ENV = "CSWAM_DASH_SECRET"
TIMEOUT_SECONDS = 60
USER_AGENT = "CSWAM-Dashboard-Feeding/1.0"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never follow redirects: urllib would forward the x-secret header to the new host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def has_secret() -> bool:
    return bool(os.environ.get(SECRET_ENV))


def upload(path: Path, remote_name: str) -> str:
    secret = os.environ.get(SECRET_ENV, "")
    if not secret:
        raise RuntimeError(f"환경변수 {SECRET_ENV} 가 없음 — setx {SECRET_ENV} \"<업로드 키>\" 후 터미널 재시작")
    req = urllib.request.Request(
        WORKER_URL,
        data=path.read_bytes(),
        method="POST",
        headers={
            "x-secret": secret,
            "x-filename": remote_name,
            "Content-Type": "application/octet-stream",
            # Cloudflare rejects the default 'Python-urllib' signature (403, error code 1010)
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with _OPENER.open(req, timeout=TIMEOUT_SECONDS) as resp:
            return f"{remote_name} 업로드 완료 (HTTP {resp.status})"
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")[:200]
        raise RuntimeError(f"업로드 실패 HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"업로드 실패 (네트워크): {exc.reason}") from exc
