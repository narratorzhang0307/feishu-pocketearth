#!/usr/bin/env python3
"""Offline parsing checks for the live power preflight."""

import frost_pi_live_preflight as preflight


assert preflight._metric("battery: 73.4", "battery") == 73.4
assert preflight._metric("battery: I2C not connected", "battery") is None
assert preflight._boolean_metric("battery_power_plugged: true", "battery_power_plugged") is True
assert preflight._boolean_metric("battery_power_plugged: unknown", "battery_power_plugged") is None
assert preflight._text_metric("model: PiSugar 3", "model") == "PiSugar 3"
assert preflight._gemma_model_ids({"data": [{"id": "gemma-4-e4b-it"}]}) == ["gemma-4-e4b-it"]
assert preflight._gemma_model_ids({"data": "invalid"}) == []

safe = preflight._safe_shutdown({
    "auto_shutdown_level": 10,
    "auto_shutdown_delay": 30,
    "soft_poweroff": True,
    "soft_poweroff_shell": "shutdown --poweroff 0",
}, hook_enabled=True)
assert safe["configured"] is True
assert preflight._safe_shutdown({}, hook_enabled=False)["configured"] is False

print("frost_pi_live_preflight_smoke: ok")
