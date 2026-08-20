#!/usr/bin/env python3
"""Secret-free client for the local Google Gemma service on Frost Edge.

The Raspberry Pi runtime talks only to a loopback OpenAI-compatible endpoint.
The model service is isolated from Pocket Earth application state and never
receives cloud credentials, private photos, precise coordinates or memories.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


DEFAULT_BASE_URL = "http://127.0.0.1:8787/v1"
DEFAULT_MODEL = "gemma-4-e4b-it"


class GemmaEdgeClient:
    def __init__(self, base_url=None, model=None, timeout=None):
        self.base_url = str(base_url or os.environ.get("FROST_GEMMA_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.model = str(model or os.environ.get("FROST_GEMMA_MODEL") or DEFAULT_MODEL)
        self.timeout = float(timeout or os.environ.get("FROST_GEMMA_TIMEOUT") or 45)

    def _request(self, path, payload=None, timeout=None):
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + path,
            data=body,
            headers={"content-type": "application/json"},
            method="GET" if body is None else "POST",
        )
        with urllib.request.urlopen(request, timeout=timeout or self.timeout) as response:
            return json.loads(response.read().decode("utf-8"))

    def health(self):
        try:
            payload = self._request("/models", timeout=min(self.timeout, 3))
            models = [str(item.get("id") or "") for item in payload.get("data", []) if isinstance(item, dict)]
            return {
                "ok": bool(models),
                "provider": "local-gemma",
                "modelOwner": "Google",
                "transport": "loopback",
                "model": models[0] if models else self.model,
            }
        except (OSError, ValueError, urllib.error.URLError, json.JSONDecodeError):
            return {
                "ok": False,
                "provider": "local-gemma",
                "modelOwner": "Google",
                "transport": "loopback",
                "model": self.model,
            }

    def chat(self, system, prompt, *, json_output=False, max_tokens=192, temperature=0.0):
        messages = []
        if system:
            messages.append({"role": "system", "content": str(system)})
        messages.append({"role": "user", "content": str(prompt or "")})
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": float(temperature),
            "max_tokens": max(1, min(512, int(max_tokens))),
            "stream": False,
        }
        if json_output:
            payload["response_format"] = {"type": "json_object"}
        data = self._request("/chat/completions", payload)
        choices = data.get("choices") if isinstance(data, dict) else None
        text = ""
        if isinstance(choices, list) and choices:
            message = choices[0].get("message") if isinstance(choices[0], dict) else None
            text = str((message or {}).get("content") or "").strip()
        return {
            "text": text,
            "provider": "local-gemma",
            "modelOwner": "Google",
            "transport": "loopback",
            "model": str(data.get("model") or self.model) if isinstance(data, dict) else self.model,
        }


def brain(system, prompt):
    """Adapter used by the registered Frost Edge skill router."""
    return GemmaEdgeClient().chat(system, prompt, json_output=True, max_tokens=120)["text"]


if __name__ == "__main__":
    client = GemmaEdgeClient()
    print(json.dumps(client.health(), ensure_ascii=False, indent=2))
