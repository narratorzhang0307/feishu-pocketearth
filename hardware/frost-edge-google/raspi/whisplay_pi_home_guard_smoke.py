#!/usr/bin/env python3
"""Offline idempotency and rollback checks for the Whisplay desktop guard."""

from pathlib import Path
from tempfile import TemporaryDirectory

from whisplay_pi_home_guard import MARKER, guarded, install, restore


SOURCE = '''EXIT_GESTURE_QUAD_CLICK = "quad"

class Daemon:
    def _render_desktop(self):
        self.last_frame = None
        self.desktop.render([])

    def _on_button_released(self):
        with self.state_lock:
            if self.foreground_app_id:
                app = None
                is_internal_app = False
                if app and app.exit_gesture == EXIT_GESTURE_QUAD_CLICK:
                    pass
                return

            self._recent_release_times = []
            apps = self._app_list()
            if not apps:
                self._render_desktop()
                return
'''


def main() -> int:
    with TemporaryDirectory() as directory:
        target = Path(directory) / "whisplay_daemon.py"
        target.write_text(SOURCE, encoding="utf-8")
        install(target)
        first = target.read_text(encoding="utf-8")
        assert guarded(target) and MARKER in first
        install(target)
        assert target.read_text(encoding="utf-8") == first
        restore(target)
        assert target.read_text(encoding="utf-8") == SOURCE
    print("whisplay_pi_home_guard smoke passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
