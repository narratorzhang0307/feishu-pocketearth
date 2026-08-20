#!/usr/bin/env bash
set -euo pipefail

URL="${SUNSET_KIOSK_URL:-http://127.0.0.1:8080/?action=radio&raspi=1}"
PROFILE="${SUNSET_KIOSK_PROFILE:-$HOME/.config/sunset-radio-kiosk}"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"

mkdir -p "${PROFILE}"

for _ in $(seq 1 40); do
  if command -v curl >/dev/null 2>&1 && curl -fsS "${URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if [[ "${URL}" != *"t="* ]]; then
  if [[ "${URL}" == *"?"* ]]; then
    URL="${URL}&t=$(date +%s)"
  else
    URL="${URL}?t=$(date +%s)"
  fi
fi

exec /usr/bin/chromium \
  --kiosk "${URL}" \
  --no-sandbox \
  --no-first-run \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-background-networking \
  --autoplay-policy=no-user-gesture-required \
  --proxy-server=direct:// \
  --proxy-bypass-list=* \
  --ozone-platform=wayland \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="${SUNSET_DEBUG_PORT:-9222}" \
  --remote-allow-origins=* \
  --user-data-dir="${PROFILE}"
