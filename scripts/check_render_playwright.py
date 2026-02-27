#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import http.server
import socketserver
import threading
import time
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


@contextlib.contextmanager
def serve(root: Path):
    prev = Path.cwd()
    try:
        # SimpleHTTPRequestHandler serves from cwd.
        import os

        os.chdir(root)
        with socketserver.TCPServer(("127.0.0.1", 0), QuietHandler) as httpd:
            port = httpd.server_address[1]
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            yield f"http://127.0.0.1:{port}"
            httpd.shutdown()
            thread.join(timeout=1)
    finally:
        import os

        os.chdir(prev)


def build_markdown_with_images() -> str:
    svg = """
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" rx="16" fill="#f8e5d5"/>
  <rect x="110" y="190" width="240" height="150" rx="14" fill="#fff" stroke="#c9b59a"/>
  <rect x="370" y="190" width="240" height="150" rx="14" fill="#fff" stroke="#c9b59a"/>
  <rect x="630" y="190" width="220" height="150" rx="14" fill="#fff" stroke="#c9b59a"/>
</svg>
""".strip()
    data_url = "data:image/svg+xml;utf8," + quote(svg, safe="")
    return f"""# Render Check
- author: Test Bot
- organization: QA
- position: CI
- date: 2026-02-27
- footer: Render Check Footer

## 画像1枚
![img-1]({data_url})

## 画像2枚
![img-2a]({data_url})
![img-2b]({data_url})

## 画像3枚
![img-3a]({data_url})
![img-3b]({data_url})
![img-3c]({data_url})

## 画像4枚
![img-4a]({data_url})
![img-4b]({data_url})
![img-4c]({data_url})
![img-4d]({data_url})
"""


def assert_snapshot(snapshot: dict) -> None:
    bad: list[str] = []
    for slide in snapshot.get("slides", []):
        title = slide.get("title", "")
        overflow = float(slide.get("overflow", 0))
        figures = slide.get("figures", [])

        if overflow > 3:
            bad.append(f'{title}: overflow={overflow}')

        for i, fig in enumerate(figures, start=1):
            if not fig.get("inBounds", False):
                bad.append(f'{title} fig#{i}: out of bounds')
            if fig.get("captionText", "") and not fig.get("captionVisible", False):
                bad.append(f'{title} fig#{i}: caption hidden')
            if fig.get("captionText", "") and float(fig.get("captionGap", 0)) > 10:
                bad.append(f'{title} fig#{i}: caption gap too large ({fig.get("captionGap")})')
            if float(fig.get("imgW", 0)) < 80 or float(fig.get("imgH", 0)) < 45:
                bad.append(f'{title} fig#{i}: image too small ({fig.get("imgW")}x{fig.get("imgH")})')

    if bad:
        raise AssertionError("Render checks failed:\n- " + "\n- ".join(bad))


def assert_one_slide(page, index_one_based: int) -> None:
    page.evaluate("(idx) => window.__mdSlideViewerTest.goToSlide(idx)", index_one_based)
    time.sleep(0.25)
    snap = page.evaluate("window.__mdSlideViewerTest.getLayoutSnapshot(true)")
    assert_snapshot(snap)


def main() -> None:
    md = build_markdown_with_images()
    with serve(ROOT) as base_url:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1920, "height": 1080})
            page.goto(f"{base_url}/index.html", wait_until="domcontentloaded")
            page.wait_for_function("window.__mdSlideViewerTest && window.marked")
            page.evaluate("window.__mdSlideViewerTest.setAspectRatio('16:9')")
            page.evaluate("(markdown) => window.__mdSlideViewerTest.loadMarkdown(markdown)", md)
            # Relayout runs async (raf + timers); give it a little time.
            time.sleep(0.5)
            # 1: title, 2..5: image slides
            for idx in (2, 3, 4, 5):
                assert_one_slide(page, idx)
            browser.close()


if __name__ == "__main__":
    main()
