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
    import os

    prev = Path.cwd()
    try:
        os.chdir(root)
        with socketserver.TCPServer(("127.0.0.1", 0), QuietHandler) as httpd:
            port = httpd.server_address[1]
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            yield f"http://127.0.0.1:{port}"
            httpd.shutdown()
            thread.join(timeout=1)
    finally:
        os.chdir(prev)


def build_markdown() -> str:
    # Vertical-ish image
    svg = """
<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
  <rect width="540" height="960" rx="24" fill="#f8e5d5"/>
  <rect x="70" y="120" width="400" height="720" rx="18" fill="#fff" stroke="#c9b59a"/>
</svg>
""".strip()
    data_url = "data:image/svg+xml;utf8," + quote(svg, safe="")
    long_lines = "\n".join([f"- テキスト行 {i}" for i in range(1, 22)])
    return f"""# Alignment Check
- author: Bot
- organization: QA
- position: Test
- date: 2026-02-27
- footer: Footer

## テキスト少なめ
短いテキストです。

## テキスト多め
{long_lines}

## 縦長画像
![縦長サンプル]({data_url})
"""


def measure_active(page) -> dict:
    return page.evaluate(
        """
() => {
  const slide = document.querySelector('.slide.is-active');
  if (!slide) return {};
  const header = slide.querySelector('.slide__header');
  const footer = slide.querySelector('.slide__footer');
  const content = slide.querySelector('.slide__content');
  const s = slide.getBoundingClientRect();
  const h = header.getBoundingClientRect();
  const f = footer.getBoundingClientRect();
  const c = content.getBoundingClientRect();
  return {
    title: slide.querySelector('.slide__header h2')?.textContent || '',
    slideTop: s.top,
    slideBottom: s.bottom,
    headerTopFromSlide: h.top - s.top,
    footerTopFromSlide: f.top - s.top,
    contentTopFromSlide: c.top - s.top,
    contentHeight: c.height,
    contentScrollHeight: content.scrollHeight,
    contentOverflow: Math.max(0, content.scrollHeight - content.clientHeight),
    fitClasses: Array.from(slide.classList).filter(c => c.startsWith('fit-')),
  };
}
"""
    )


def main() -> None:
    md = build_markdown()
    with serve(ROOT) as base:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1920, "height": 1080})
            page.goto(f"{base}/index.html", wait_until="domcontentloaded")
            page.wait_for_function("window.__mdSlideViewerTest && window.marked")
            page.evaluate("window.__mdSlideViewerTest.setAspectRatio('16:9')")
            page.evaluate("(markdown) => window.__mdSlideViewerTest.loadMarkdown(markdown)", md)
            time.sleep(0.6)

            rows = []
            for idx in (2, 3, 4):
                page.evaluate("(i) => window.__mdSlideViewerTest.goToSlide(i)", idx)
                time.sleep(0.35)
                rows.append(measure_active(page))

            print("Alignment diagnostics:")
            for r in rows:
                print(
                    f"- {r['title']}: headerY={r['headerTopFromSlide']:.1f}, "
                    f"contentY={r['contentTopFromSlide']:.1f}, footerY={r['footerTopFromSlide']:.1f}, "
                    f"overflow={r['contentOverflow']:.1f}, fit={','.join(r['fitClasses']) or 'none'}"
                )
            browser.close()


if __name__ == "__main__":
    main()
