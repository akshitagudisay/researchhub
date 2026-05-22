import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.main import app
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class StripApiPrefix(BaseHTTPMiddleware):
    """Strip the /api prefix that Vercel routes add before passing to FastAPI."""
    async def dispatch(self, request: Request, call_next):
        path = request.scope.get("path", "")
        if path.startswith("/api"):
            stripped = path[4:] or "/"
            request.scope["path"] = stripped
            raw = request.scope.get("raw_path", b"")
            if raw.startswith(b"/api"):
                request.scope["raw_path"] = raw[4:] or b"/"
        return await call_next(request)


app.add_middleware(StripApiPrefix)
