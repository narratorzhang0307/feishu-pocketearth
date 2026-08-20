# Local Google AI Edge model

This directory belongs only to the Google edition in this project.

- Model: `gemma-3n-E2B-it-int4-Web.litertlm`
- Source: `google/gemma-3n-E2B-it-litert-lm` on Hugging Face
- Size: `3038117888` bytes
- SHA-256: `b6c8e1081ec80730f14473a5ece941b48da5d8e2a80c97c2963da153f3eff3d2`
- Runtime URL: `/local-models/gemma-3n-E2B-it-int4-Web.litertlm`
- License gate: accept the Google Gemma terms before downloading

Official sources:

- Model card: <https://huggingface.co/google/gemma-3n-E2B-it-litert-lm>
- Gemma 3n overview: <https://ai.google.dev/gemma/docs/gemma-3n>
- Web runtime guide: <https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js>

The weight file is intentionally excluded from Git and `dist`. For a new-domain
deployment, copy this directory next to `server.mjs`; that server exposes the
model with same-origin `HEAD`, `GET`, and byte-range responses.

Verify a downloaded file before use:

```bash
test "$(wc -c < gemma-3n-E2B-it-int4-Web.litertlm | tr -d ' ')" = "3038117888"
shasum -a 256 gemma-3n-E2B-it-int4-Web.litertlm
```

The expected SHA-256 is the value documented above. The server distributes the
artifact; inference still runs in the browser with MediaPipe and WebGPU.
