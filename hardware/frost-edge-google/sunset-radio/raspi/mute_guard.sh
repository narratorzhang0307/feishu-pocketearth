#!/usr/bin/env bash
set -euo pipefail

INTERVAL="${SUNSET_MUTE_GUARD_INTERVAL:-3}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIO_MODE_PY="${SUNSET_AUDIO_MODE_PY:-${SCRIPT_DIR}/audio_mode.py}"
DIALOG_VOLUME="${SUNSET_DIALOG_VOLUME:-25}"
RADIO_VOLUME="${SUNSET_RADIO_VOLUME:-45}"
TTS_ACTIVE_PATH="${SUNSET_TTS_ACTIVE_PATH:-/tmp/sunset-radio-tts-active}"

audio_mode() {
  python3 "${AUDIO_MODE_PY}" --mode 2>/dev/null || printf 'soft_mute\n'
}

while true; do
  mode="$(audio_mode)"
  case "${mode}" in
    dialog)
      wpctl set-mute @DEFAULT_AUDIO_SINK@ 0 >/dev/null 2>&1 || true
      wpctl set-volume @DEFAULT_AUDIO_SINK@ "${DIALOG_VOLUME}%" >/dev/null 2>&1 || true
      if [[ ! -f "${TTS_ACTIVE_PATH}" ]]; then
        pkill -x ffplay >/dev/null 2>&1 || true
        pkill -x cvlc >/dev/null 2>&1 || true
      fi
      ;;
    radio)
      wpctl set-mute @DEFAULT_AUDIO_SINK@ 0 >/dev/null 2>&1 || true
      wpctl set-volume @DEFAULT_AUDIO_SINK@ "${RADIO_VOLUME}%" >/dev/null 2>&1 || true
      ;;
    *)
      wpctl set-mute @DEFAULT_AUDIO_SINK@ 1 >/dev/null 2>&1 || true
      wpctl set-volume @DEFAULT_AUDIO_SINK@ 0% >/dev/null 2>&1 || true
      pkill -x ffplay >/dev/null 2>&1 || true
      pkill -x cvlc >/dev/null 2>&1 || true
      ;;
  esac
  sleep "${INTERVAL}"
done
