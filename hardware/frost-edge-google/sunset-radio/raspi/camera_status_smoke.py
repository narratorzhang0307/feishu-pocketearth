#!/usr/bin/env python3
import json
import subprocess

import camera_status


def collect_with(raw="", hello="/usr/bin/rpicam-hello", still="/usr/bin/rpicam-still", returncode=0):
    original_first_command = camera_status.first_command
    original_run = camera_status.run
    original_glob = camera_status.glob.glob
    try:
        camera_status.first_command = lambda names: hello if names == camera_status.HELLO_COMMANDS else still
        camera_status.run = lambda args, timeout=4: subprocess.CompletedProcess(
            args,
            returncode,
            raw if returncode == 0 else "",
            "" if returncode == 0 else raw,
        )
        camera_status.glob.glob = lambda pattern: [pattern.replace("*", "0")]
        return camera_status.collect_camera_status()
    finally:
        camera_status.first_command = original_first_command
        camera_status.run = original_run
        camera_status.glob.glob = original_glob


def main():
    imx708_raw = "Available cameras\n0 : imx708 [4608x2592 10-bit RGGB] (/base/soc/i2c0mux/i2c@1/imx708@1a)"
    unavailable_raw = "No cameras available!"
    imx708 = collect_with(imx708_raw)
    missing_camera = collect_with(unavailable_raw)
    no_tools = collect_with("", hello="", still="")
    cases = [
        {
            "name": "IMX708 model is recognized from rpicam output",
            "passed": camera_status.parse_camera_model(imx708_raw) == "IMX708",
        },
        {
            "name": "generic sensor model parsing still works",
            "passed": camera_status.parse_camera_model("0 : ov5647 [2592x1944]") == "OV5647",
        },
        {
            "name": "listed IMX708 camera is available",
            "passed": imx708.get("ok") is True
            and imx708.get("available") is True
            and imx708.get("model") == "IMX708",
        },
        {
            "name": "camera tools without a detected camera stay nonfatal",
            "passed": missing_camera.get("ok") is True
            and missing_camera.get("available") is False
            and "当前没看到" in camera_status.camera_message(missing_camera),
        },
        {
            "name": "missing camera tools fail clearly",
            "passed": no_tools.get("ok") is False
            and "相机工具" in camera_status.camera_message(no_tools),
        },
        {
            "name": "ambient copy never promises autoplay",
            "passed": "只调下一段" in camera_status.ambient_message(imx708),
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
