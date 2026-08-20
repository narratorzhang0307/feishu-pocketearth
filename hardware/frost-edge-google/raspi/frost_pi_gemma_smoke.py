#!/usr/bin/env python3
"""Contract smoke test for the loopback Google Gemma client."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from frost_pi_gemma import GemmaEdgeClient


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def _send(self, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        assert self.path == "/v1/models"
        self._send({"data": [{"id": "gemma-4-e4b-it"}]})

    def do_POST(self):
        assert self.path == "/v1/chat/completions"
        length = int(self.headers.get("content-length") or 0)
        payload = json.loads(self.rfile.read(length))
        assert payload["model"] == "gemma-4-e4b-it"
        assert payload["messages"][-1]["role"] == "user"
        self._send({
            "model": "gemma-4-e4b-it",
            "choices": [{"message": {"content": '{"skill":"open_podcast","args":{}}'}}],
        })


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = f"http://127.0.0.1:{server.server_address[1]}/v1"
        client = GemmaEdgeClient(base_url=base, model="gemma-4-e4b-it", timeout=2)
        assert client.health()["ok"] is True
        result = client.chat("route", "口袋播客", json_output=True)
        assert result["modelOwner"] == "Google"
        assert json.loads(result["text"])["skill"] == "open_podcast"
    finally:
        server.shutdown()
        server.server_close()
    print("frost_pi_gemma_smoke: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
