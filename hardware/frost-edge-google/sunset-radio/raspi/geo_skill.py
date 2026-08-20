#!/usr/bin/env python3
"""Geo skill for the Sunset Radio ambient agent.

Resolves per-city coordinates (from the private ``resource-library/city-meta.json``)
and the device's own location (from optional ``SUNSET_HOME_*`` env config). It never
contacts the network: coordinates come from the shipped catalog, and the device
location is an explicit local override. If nothing is configured the skill degrades
honestly (``ok: False``) rather than guessing where the user is.

``city-meta.json`` is keyed by Chinese city name (``cityNameZh``) and each entry is
``{"lat": .., "lng": .., "description": ".."}``. Many catalog city files carry a real
``tzOffset``; the few that are ``0`` fall back to a longitude-derived display offset so
the local sunset clock still reads sensibly.
"""
import json
import os

# Repo layout: raspi/geo_skill.py  ->  ../resource-library/city-meta.json
_DEFAULT_META = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "resource-library",
    "city-meta.json",
)
META_PATH = os.environ.get("SUNSET_CITY_META_PATH", _DEFAULT_META)

# Persisted device location. A future voice command ("我在上海" / "设置位置") can call
# save_device_location(); device_location() reads env first, then this file, then unset —
# so the interface is ready without wiring any NLU yet.
HOME_STATE_PATH = os.environ.get(
    "SUNSET_HOME_STATE_PATH",
    os.path.join(os.path.expanduser("~"), ".local", "share", "sunset-radio", "home-location.json"),
)

_META_CACHE = None
_META_CACHE_PATH = None


def _safe_float(value, fallback=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def load_city_meta(path=None):
    """Return the ``cityNameZh -> {lat, lng, description}`` map (cached).

    Missing / unreadable meta returns an empty dict so callers degrade to
    tz-offset-only behaviour instead of raising.
    """
    global _META_CACHE, _META_CACHE_PATH
    path = path or META_PATH
    if _META_CACHE is not None and _META_CACHE_PATH == path:
        return _META_CACHE
    meta = {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
        if isinstance(raw, dict):
            for name, entry in raw.items():
                if not isinstance(entry, dict):
                    continue
                lat = _safe_float(entry.get("lat"))
                lng = _safe_float(entry.get("lng"))
                meta[str(name)] = {
                    "lat": lat,
                    "lng": lng,
                    "description": str(entry.get("description") or ""),
                }
    except (OSError, json.JSONDecodeError, ValueError):
        meta = {}
    _META_CACHE = meta
    _META_CACHE_PATH = path
    return meta


def reset_cache():
    """Test hook: drop the cached meta so a new path/file is re-read."""
    global _META_CACHE, _META_CACHE_PATH
    _META_CACHE = None
    _META_CACHE_PATH = None


def _city_name(city):
    if isinstance(city, dict):
        return str(city.get("cityNameZh") or city.get("cityName") or city.get("slug") or "").strip()
    return str(city or "").strip()


def city_geo(city, meta=None):
    """Return ``{lat, lng, description, ok}`` for a catalog city dict or a name.

    ``ok`` is True only when both coordinates are finite.
    """
    meta = meta if isinstance(meta, dict) else load_city_meta()
    name = _city_name(city)
    entry = meta.get(name) or {}
    lat = entry.get("lat")
    lng = entry.get("lng")
    ok = isinstance(lat, float) and isinstance(lng, float)
    return {
        "ok": ok,
        "name": name,
        "lat": lat,
        "lng": lng,
        "description": entry.get("description") or "",
    }


def display_tz_offset(city, geo=None):
    """Hours to add to UTC for a human-readable local clock.

    Prefer the catalog ``tzOffset``; when it is 0 (either genuinely UTC or missing
    data) derive an approximate offset from longitude so the local sunset clock is
    not silently pinned to UTC for cities that should not be.
    """
    tz = 0.0
    if isinstance(city, dict):
        tz = _safe_float(city.get("tzOffset"), 0.0) or 0.0
    if tz:
        return tz
    lng = None
    if isinstance(geo, dict):
        lng = geo.get("lng")
    if lng is None:
        lng = city_geo(city).get("lng")
    if isinstance(lng, (int, float)):
        return round(lng / 15.0)
    return 0.0


def load_saved_home(path=None):
    """Read the persisted device location written by save_device_location()."""
    path = path or HOME_STATE_PATH
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return {}


def save_device_location(lat, lng, name="", tz_offset=None, path=None):
    """Persist a device location (for a future "设置位置" voice command to call).

    Returns the stored dict, or a not-ok dict if the coordinates are invalid.
    """
    path = path or HOME_STATE_PATH
    lat = _safe_float(lat)
    lng = _safe_float(lng)
    if lat is None or lng is None:
        return {"ok": False, "error": "invalid_coords"}
    tz = _safe_float(tz_offset)
    if tz is None:
        tz = round(lng / 15.0)
    payload = {"lat": lat, "lng": lng, "name": str(name or "").strip(), "tzOffset": tz}
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    os.replace(tmp, path)
    return {"ok": True, **payload}


def _location_result(lat, lng, name, tz, source):
    if tz is None:
        tz = round(lng / 15.0)
    return {
        "ok": True,
        "source": source,
        "name": name or "此处",
        "lat": lat,
        "lng": lng,
        "tzOffset": tz,
        "message": f"本机位置：{name or '此处'}（{lat:.3f}, {lng:.3f}）。",
    }


def device_location():
    """The Pi's own location, from explicit local config only.

    Resolution order: ``SUNSET_HOME_LAT`` / ``SUNSET_HOME_LNG`` env (plus optional
    ``SUNSET_HOME_NAME`` / ``SUNSET_HOME_TZOFFSET``) → the persisted home-location file
    (``save_device_location``) → unset. No IP geolocation, no guessing: an unset location
    returns ``ok: False`` and the day plan still orders the world's cities by real sunset.
    """
    lat = _safe_float(os.environ.get("SUNSET_HOME_LAT"))
    lng = _safe_float(os.environ.get("SUNSET_HOME_LNG"))
    if lat is not None and lng is not None:
        return _location_result(
            lat, lng,
            str(os.environ.get("SUNSET_HOME_NAME") or "").strip(),
            _safe_float(os.environ.get("SUNSET_HOME_TZOFFSET")),
            "config",
        )

    saved = load_saved_home()
    slat = _safe_float(saved.get("lat"))
    slng = _safe_float(saved.get("lng"))
    if slat is not None and slng is not None:
        return _location_result(slat, slng, str(saved.get("name") or "").strip(), _safe_float(saved.get("tzOffset")), "saved")

    return {
        "ok": False,
        "source": "unset",
        "name": "未设置位置",
        "lat": None,
        "lng": None,
        "tzOffset": None,
        "message": "本机位置未配置（.env.runtime 设 SUNSET_HOME_LAT/LNG/NAME，或说「设置位置」）；仍可按全球城市日落排全天。",
    }


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Geo skill: city coordinates + device location.")
    parser.add_argument("city", nargs="?", help="City name (cityNameZh) to look up.")
    parser.add_argument("--set-home", nargs=2, metavar=("LAT", "LNG"), help="Persist device location.")
    parser.add_argument("--name", default="", help="Name for --set-home.")
    args = parser.parse_args()
    if args.set_home:
        out = {"saved": save_device_location(args.set_home[0], args.set_home[1], args.name)}
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0
    out = {"device": device_location()}
    if args.city:
        out["city"] = city_geo(args.city)
        out["displayTzOffset"] = display_tz_offset({"cityNameZh": args.city})
    else:
        out["cityCount"] = len(load_city_meta())
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
