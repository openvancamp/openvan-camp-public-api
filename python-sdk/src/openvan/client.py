"""HTTP transport for the OpenVan.camp API — standard library only."""

from __future__ import annotations

import json
from typing import Any, Mapping, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

__version__ = "0.1.1"

DEFAULT_BASE_URL = "https://openvan.camp"

Query = Mapping[str, Any]


class OpenVanError(Exception):
    """An API request failed. ``message`` is the API's own explanation when it gave one."""

    def __init__(self, message: str, status: int, url: str, body: Any = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.url = url
        self.body = body


class OpenVanClient:
    """Low-level client: builds URLs with the attribution tag and decodes JSON."""

    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        source: str = "openvan-python",
        timeout: float = 30.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.source = source
        self.timeout = timeout

    def url(self, path: str, query: Optional[Query] = None) -> str:
        """Absolute API URL; empty values are dropped and ``source`` is always added."""
        params = {k: _query_value(v) for k, v in (query or {}).items() if v is not None and v != ""}
        params["source"] = self.source
        return f"{self.base_url}{path}?{urlencode(params)}"

    def get(self, path: str, query: Optional[Query] = None) -> Any:
        return self._request(Request(self.url(path, query), method="GET"))

    def post(self, path: str, body: Any) -> Any:
        request = Request(
            self.url(path),
            data=json.dumps(body).encode(),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        return self._request(request)

    def _request(self, request: Request) -> Any:
        request.add_header("Accept", "application/json")
        request.add_header("User-Agent", f"openvan-python/{__version__}")
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode())
        except HTTPError as error:
            # The API explains most errors in the body ("Place not found: …"); keep that message.
            body: Any = None
            try:
                body = json.loads(error.read().decode())
            except (ValueError, OSError):
                pass
            message = None
            if isinstance(body, dict):
                message = body.get("message") or body.get("error")
            raise OpenVanError(
                message if isinstance(message, str) else f"HTTP {error.code}: {error.reason}",
                error.code,
                request.full_url,
                body,
            ) from None
        except URLError as error:
            raise OpenVanError(f"Network error: {error.reason}", 0, request.full_url) from None


def _query_value(value: Any) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    return str(value)
