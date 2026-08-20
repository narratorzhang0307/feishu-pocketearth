#!/usr/bin/env python3
import json
import os
import tempfile

import ambient_observer


def main():
    remembered = []
    original_remember = ambient_observer.remember_ambient_state
    ambient_observer.remember_ambient_state = lambda state: remembered.append(state) or {"entries": list(remembered)}
    try:
        with tempfile.TemporaryDirectory(prefix="sunset-ambient-smoke-") as tmp:
            ready = ambient_observer.save_ambient_state(
                {
                    "ok": True,
                    "stage": "ready",
                    "message": "相机已就绪。",
                    "camera": {"available": True, "model": "imx708"},
                },
                path=os.path.join(tmp, "ready.json"),
            )
            sensor = ambient_observer.save_ambient_state(
                {
                    "ok": True,
                    "stage": "sensor",
                    "message": "环境DJ 已拿到光线信号。",
                    "camera": {"available": True, "model": "imx708"},
                    "signals": {
                        "ok": True,
                        "brightness": 0.22,
                        "contrast": 0.11,
                        "light": "dim",
                        "activity": "unknown",
                        "tags": ["室内光线", "低光"],
                    },
                },
                path=os.path.join(tmp, "sensor.json"),
            )

            capture_path = os.path.join(tmp, "ambient-frame.jpg")
            original_collect_camera_status = ambient_observer.collect_camera_status
            original_capture_snapshot = ambient_observer.capture_snapshot
            original_edge_vision = ambient_observer.edge_vision
            original_finish_report = ambient_observer.finish_report
            try:
                from PIL import Image

                def fake_capture_snapshot(_status):
                    Image.new("RGB", (16, 16), (42, 42, 42)).save(capture_path)
                    return capture_path, ""

                ambient_observer.collect_camera_status = lambda: {
                    "available": True,
                    "model": "IMX708",
                    "tools": {"still": "/usr/bin/rpicam-still"},
                }
                ambient_observer.capture_snapshot = fake_capture_snapshot
                ambient_observer.edge_vision = lambda _path: (_ for _ in ()).throw(RuntimeError("offline"))
                ambient_observer.finish_report = lambda report: report
                capture_report = ambient_observer.observe_once(capture=True)
            finally:
                ambient_observer.collect_camera_status = original_collect_camera_status
                ambient_observer.capture_snapshot = original_capture_snapshot
                ambient_observer.edge_vision = original_edge_vision
                ambient_observer.finish_report = original_finish_report
    finally:
        ambient_observer.remember_ambient_state = original_remember

    remembered_stages = [item.get("stage") for item in remembered]
    cases = [
        {
            "name": "ready status does not enter ambient memory",
            "passed": ready.get("stage") == "ready" and "ready" not in remembered_stages,
        },
        {
            "name": "sensor observation enters ambient memory",
            "passed": sensor.get("stage") == "sensor" and remembered_stages[-1:] == ["sensor"],
        },
        {
            "name": "sensor state carries bounded radio adjustment",
            "passed": -0.2 <= (sensor.get("radioAdjustment") or {}).get("energyDelta", 9) <= 0.2,
        },
        {
            "name": "captured frame is deleted after local signal analysis",
            "passed": capture_report.get("stage") == "sensor" and not os.path.exists(capture_path),
        },
    ]
    ok = all(item["passed"] for item in cases)
    print(json.dumps({"ok": ok, "cases": cases, "rememberedStages": remembered_stages}, ensure_ascii=False, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
