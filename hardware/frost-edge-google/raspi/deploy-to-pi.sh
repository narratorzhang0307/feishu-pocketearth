#!/usr/bin/env bash
set -euo pipefail

PI_HOST="${1:-sunset-pi}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE="$(ssh "$PI_HOST" 'mktemp -d /tmp/pocket-earth-edge.XXXXXX')"

cleanup() {
  ssh "$PI_HOST" "test -n '$STAGE' && test '$STAGE' != / && rm -rf -- '$STAGE'" >/dev/null 2>&1 || true
}
trap cleanup EXIT

FILES=(
  LINUX-LAYOUT.md
  LIVE-HANDOFF.md
  frost_pi_event_adapter.py
  frost_pi_event_adapter_smoke.py
  frost_pi_feed_client.py
  frost_pi_gemma.py
  frost_pi_gemma_smoke.py
  frost_pi_skill_agent.py
  frost_pi_skill_agent_smoke.py
  frost_pi_device_driver.py
  frost_pi_device_driver_smoke.py
  frost_pi_earth_answers.py
  frost_pi_earth_answers_smoke.py
  earth_answers_365.json
  frost_pi_live_preflight.py
  frost_pi_live_preflight_smoke.py
  frost_pi_content_cache.json
  frost_pi_podcast_sync.py
  frost_pi_podcast_sync_smoke.py
  frost_pi_podcast_cache.json
  frost_pi_project_launcher.py
  frost_pi_project_launcher_smoke.py
  frost_pi_quiet_home.py
  frost_pi_quiet_home_smoke.py
  frost_pi_daybook.json
  frost_pi_sunset_bridge.py
  frost_pi_sunset_bridge_smoke.py
  frost_pi_sunset_hints.json
  whisplay_pi_home_guard.py
  whisplay_pi_home_guard_smoke.py
  pocket-earth-edge.service
  pocket-earth-gemma.service
  pocket-earth-launcher.service
  pocket-earth-podcast-sync.service
  pocket-earth-podcast-sync.timer
)

PERSONA_SHEET="$SCRIPT_DIR/../../../public/frost-personas/frost-personas-01.png"

for file in "${FILES[@]}"; do
  test -f "$SCRIPT_DIR/$file"
done
test -f "$PERSONA_SHEET"

scp -q "${FILES[@]/#/$SCRIPT_DIR/}" "$PI_HOST:$STAGE/"
scp -q "$PERSONA_SHEET" "$PI_HOST:$STAGE/frost-personas-01.png"

ssh "$PI_HOST" "set -euo pipefail
  sudo install -d -m 0755 -o pi -g pi /home/pi/pocket-earth /home/pi/pocket-earth/agents /home/pi/pocket-earth/assets /home/pi/earth-answers
  sudo install -m 0644 -o pi -g pi '$STAGE/LINUX-LAYOUT.md' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/LIVE-HANDOFF.md' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_event_adapter.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_event_adapter_smoke.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_feed_client.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_gemma.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_gemma_smoke.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_skill_agent.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_skill_agent_smoke.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_device_driver.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_device_driver_smoke.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_earth_answers.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_earth_answers_smoke.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/earth_answers_365.json' /home/pi/earth-answers/
  sudo install -m 0755 -o pi -g pi '$STAGE/frost_pi_live_preflight.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_live_preflight_smoke.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_content_cache.json' /home/pi/pocket-earth/
  sudo install -m 0755 -o pi -g pi '$STAGE/frost_pi_podcast_sync.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_podcast_sync_smoke.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_podcast_cache.json' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost-personas-01.png' /home/pi/pocket-earth/assets/
  sudo install -m 0755 -o pi -g pi '$STAGE/frost_pi_project_launcher.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_project_launcher_smoke.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_quiet_home.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_quiet_home_smoke.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_daybook.json' /home/pi/pocket-earth/
  sudo install -m 0755 -o pi -g pi '$STAGE/frost_pi_sunset_bridge.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_sunset_bridge_smoke.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/frost_pi_sunset_hints.json' /home/pi/pocket-earth/
  sudo install -m 0755 -o pi -g pi '$STAGE/whisplay_pi_home_guard.py' /home/pi/pocket-earth/
  sudo install -m 0644 -o pi -g pi '$STAGE/whisplay_pi_home_guard_smoke.py' /home/pi/pocket-earth/
  sudo install -m 0644 '$STAGE/pocket-earth-edge.service' /etc/systemd/system/pocket-earth-edge.service
  sudo install -m 0644 '$STAGE/pocket-earth-gemma.service' /etc/systemd/system/pocket-earth-gemma.service
  sudo install -m 0644 '$STAGE/pocket-earth-launcher.service' /etc/systemd/system/pocket-earth-launcher.service
  sudo install -m 0644 '$STAGE/pocket-earth-podcast-sync.service' /etc/systemd/system/pocket-earth-podcast-sync.service
  sudo install -m 0644 '$STAGE/pocket-earth-podcast-sync.timer' /etc/systemd/system/pocket-earth-podcast-sync.timer
  sudo install -d -m 0750 -o pi -g pi /var/lib/pocket-earth-edge /var/cache/pocket-earth-edge
  legacy_cursor=/home/pi/.local/state/pocket-earth/frost-feed.cursor
  state_cursor=/var/lib/pocket-earth-edge/frost-feed.cursor
  if sudo test -s \"\$legacy_cursor\" && ! sudo test -s \"\$state_cursor\"; then
    sudo install -m 0640 -o pi -g pi \"\$legacy_cursor\" \"\$state_cursor\"
    echo 'Migrated the committed Frost feed cursor into /var/lib/pocket-earth-edge.'
  fi
  cd /home/pi/pocket-earth
  /usr/bin/python3 frost_pi_event_adapter_smoke.py
  /usr/bin/python3 frost_pi_gemma_smoke.py
  /usr/bin/python3 frost_pi_skill_agent_smoke.py
  /usr/bin/python3 frost_pi_device_driver_smoke.py
  /usr/bin/python3 frost_pi_earth_answers_smoke.py
  /usr/bin/python3 frost_pi_sunset_bridge_smoke.py
  /usr/bin/python3 frost_pi_project_launcher_smoke.py
  /usr/bin/python3 frost_pi_quiet_home_smoke.py
  /usr/bin/python3 frost_pi_live_preflight_smoke.py
  /usr/bin/python3 frost_pi_podcast_sync_smoke.py
  /usr/bin/python3 whisplay_pi_home_guard_smoke.py
  sudo /usr/bin/python3 whisplay_pi_home_guard.py --install
  sudo systemctl daemon-reload
  sudo systemctl enable --now pocket-earth-podcast-sync.timer
  if sudo test -f /etc/pocket-earth-edge.env; then
    sudo systemctl enable pocket-earth-edge.service pocket-earth-launcher.service
    sudo systemctl restart whisplay-daemon.service
    sleep 2
    sudo systemctl restart pocket-earth-edge.service
    sudo systemctl restart pocket-earth-launcher.service
  else
    echo 'Pocket Earth code installed; /etc/pocket-earth-edge.env is required before service start.'
  fi
"

echo "Pocket Earth Edge code installed at /home/pi/pocket-earth on $PI_HOST."
