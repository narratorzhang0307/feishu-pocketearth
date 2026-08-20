#!/usr/bin/env python3
"""Offline self-test for geo_skill: meta lookup, display offset, device location.

No network, no real meta file required — writes a tiny temp meta and toggles env.
"""
import json
import os
import tempfile

import geo_skill


def with_temp_meta(entries):
    handle = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
    json.dump(entries, handle, ensure_ascii=False)
    handle.close()
    geo_skill.reset_cache()
    return handle.name


def main():
    failures = []

    def check(name, cond):
        if not cond:
            failures.append(name)

    meta_path = with_temp_meta({
        "阿姆斯特丹": {"lat": 52.37, "lng": 4.9, "description": "运河边的黄昏。"},
        "东京": {"lat": 35.68, "lng": 139.69, "description": "湾岸的最后一线金。"},
    })
    meta = geo_skill.load_city_meta(meta_path)
    check("meta_loads_two", len(meta) == 2)

    ams = geo_skill.city_geo({"cityNameZh": "阿姆斯特丹", "tzOffset": 0}, meta)
    check("ams_ok", ams["ok"] is True and abs(ams["lat"] - 52.37) < 1e-6)

    unknown = geo_skill.city_geo({"cityNameZh": "无此城"}, meta)
    check("unknown_not_ok", unknown["ok"] is False and unknown["lat"] is None)

    # tzOffset 0 (Amsterdam data gap) -> longitude-derived display offset, not UTC.
    off_ams = geo_skill.display_tz_offset({"cityNameZh": "阿姆斯特丹", "tzOffset": 0}, ams)
    check("ams_display_offset_from_lng", off_ams == round(4.9 / 15.0))

    # Real tzOffset is respected as-is.
    off_tokyo = geo_skill.display_tz_offset({"cityNameZh": "东京", "tzOffset": 9})
    check("tokyo_display_offset_keeps_tz", off_tokyo == 9)

    # Missing meta file -> empty map, graceful.
    geo_skill.reset_cache()
    empty = geo_skill.load_city_meta("/nonexistent/city-meta.json")
    check("missing_meta_empty", empty == {})

    # Device location unset -> ok False, still usable message.
    for key in ("SUNSET_HOME_LAT", "SUNSET_HOME_LNG", "SUNSET_HOME_NAME", "SUNSET_HOME_TZOFFSET"):
        os.environ.pop(key, None)
    dev_unset = geo_skill.device_location()
    check("device_unset_not_ok", dev_unset["ok"] is False and dev_unset["lat"] is None)

    # Device location configured via env -> ok True with values.
    os.environ["SUNSET_HOME_LAT"] = "31.23"
    os.environ["SUNSET_HOME_LNG"] = "121.47"
    os.environ["SUNSET_HOME_NAME"] = "上海"
    dev_set = geo_skill.device_location()
    check("device_set_ok", dev_set["ok"] is True and dev_set["name"] == "上海")
    check("device_set_tz_from_lng", dev_set["tzOffset"] == round(121.47 / 15.0))
    check("device_env_source", dev_set["source"] == "config")
    for key in ("SUNSET_HOME_LAT", "SUNSET_HOME_LNG", "SUNSET_HOME_NAME"):
        os.environ.pop(key, None)

    # Persisted home file: save then device_location() falls back to it (source 'saved').
    home_path = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8").name
    os.environ["SUNSET_HOME_STATE_PATH"] = home_path
    geo_skill.HOME_STATE_PATH = home_path
    saved = geo_skill.save_device_location(35.68, 139.69, "东京", path=home_path)
    check("save_ok", saved["ok"] is True and saved["tzOffset"] == round(139.69 / 15.0))
    dev_saved = geo_skill.device_location()
    check("device_saved_fallback", dev_saved["ok"] is True and dev_saved["name"] == "东京" and dev_saved["source"] == "saved")
    # Env still wins over the saved file.
    os.environ["SUNSET_HOME_LAT"] = "1.0"
    os.environ["SUNSET_HOME_LNG"] = "2.0"
    check("env_beats_saved", geo_skill.device_location()["source"] == "config")
    for key in ("SUNSET_HOME_LAT", "SUNSET_HOME_LNG", "SUNSET_HOME_STATE_PATH"):
        os.environ.pop(key, None)

    # Invalid coords -> not saved.
    bad = geo_skill.save_device_location("x", None, path=home_path)
    check("save_bad_rejected", bad["ok"] is False)

    for path in (meta_path, home_path):
        try:
            os.unlink(path)
        except OSError:
            pass

    if failures:
        print("GEO SKILL SMOKE FAIL:", ", ".join(failures))
        return 1
    print("GEO SKILL SMOKE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
