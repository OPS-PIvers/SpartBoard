#!/usr/bin/env python3
"""
Tests for smart2spart. Builds a synthetic in-memory .notebook archive that
exercises the tricky bits found in real SMART files, then asserts the
converted .spartnb bundle is correct.

Run:  python test_smart2spart.py
(uses stdlib unittest + Pillow; no pytest required)
"""

import base64
import io
import json
import os
import re
import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image

import smart2spart as s2s


def _png_bytes(w: int, h: int, color=(200, 50, 50), alpha: bool = False) -> bytes:
    mode = "RGBA" if alpha else "RGB"
    fill = color + ((255,) if alpha else ())
    img = Image.new(mode, (w, h), fill)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _page_svg(width: int, height: int, image_hrefs: list[str]) -> bytes:
    images = "".join(
        f'<image href="{h}" x="0" y="0" width="100" height="100"/>' for h in image_hrefs
    )
    svg = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<svg width="{width}" height="{height}" xml:id="p">'
        f'<rect x="0" y="0" width="100%" height="100%" style="fill:#fff"/>'
        f'<g class="foreground"><text x="10" y="20">hi</text>{images}</g></svg>'
    )
    return svg.encode("utf-8")


# Manifest with 2 lesson groups whose page order differs from filename order,
# proving order comes from the manifest, not the filenames.
_MANIFEST = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<manifest identifier="id1" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <organizations>
    <organization id="pagegroups">
      <item id="g0" identifierref="group0_pages"><title>Lesson B</title></item>
      <item id="g1" identifierref="group1_pages"><title>Lesson A</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="group0_pages" type="webcontent">
      <file href="page2.svg"/>
      <file href="page0.svg"/>
    </resource>
    <resource identifier="group1_pages" type="webcontent">
      <file href="page1.svg"/>
    </resource>
    <resource identifier="pages" type="webcontent">
      <file href="page2.svg"/><file href="page0.svg"/><file href="page1.svg"/>
    </resource>
  </resources>
</manifest>
"""


def _build_notebook(path: Path) -> None:
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("imsmanifest.xml", _MANIFEST)
        # A normal image, and one whose filename contains a literal '#'.
        zf.writestr("images/photo.png", _png_bytes(3000, 2000))  # oversized
        zf.writestr("images/nickle front #1.jpg", _png_bytes(50, 50))
        # page2 references both images; one href has a literal '#'.
        zf.writestr(
            "page2.svg",
            _page_svg(800, 600, ["images/photo.png", "images/nickle front #1.jpg"]),
        )
        zf.writestr("page0.svg", _page_svg(800, 720, []))
        zf.writestr("page1.svg", _page_svg(800, 600, ["images/photo.png"]))
        # An orphan page not referenced anywhere in the manifest.
        zf.writestr("page9.svg", _page_svg(800, 500, []))


class Smart2SpartTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.nb = Path(self.tmp) / "Sample.notebook"
        self.out = Path(self.tmp) / "Sample.spartnb"
        _build_notebook(self.nb)

    def _convert(self, **kw) -> dict:
        opts = s2s.OptimizeOptions(**kw)
        s2s.convert(self.nb, self.out, opts, verbose=False)
        with zipfile.ZipFile(self.out) as zf:
            self.bundle = {n: zf.read(n) for n in zf.namelist()}
        return json.loads(self.bundle["manifest.json"])

    def test_page_order_follows_manifest_not_filenames(self):
        m = self._convert()
        # Manifest order is page2, page0, page1 (Lesson B then A), then orphan page9.
        self.assertEqual(m["pageCount"], 4)
        self.assertEqual(m["title"], "Sample")
        # page0.svg in the bundle corresponds to source page2 (height 600),
        # bundle page1 -> source page0 (height 720).
        self.assertEqual(m["pages"][0]["height"], 600)
        self.assertEqual(m["pages"][1]["height"], 720)

    def test_sections_from_lesson_groups(self):
        m = self._convert()
        titles = [(s["title"], s["startIndex"], s["pageCount"]) for s in m["sections"]]
        self.assertEqual(titles, [("Lesson B", 0, 2), ("Lesson A", 2, 1)])

    def test_images_inlined_no_broken_refs(self):
        self._convert()
        for name, data in self.bundle.items():
            if name.endswith(".svg"):
                self.assertNotIn(b'href="images/', data, f"{name} has a broken ref")
        # The image-bearing page must contain data URIs.
        joined = b"".join(v for k, v in self.bundle.items() if k.endswith(".svg"))
        self.assertIn(b"data:image/", joined)

    def test_literal_hash_filename_resolves(self):
        # The "nickle front #1.jpg" image must be inlined, not dropped.
        self._convert()
        # Exactly one source image had a '#'; ensure no missing refs remain
        # (covered by no-broken-refs), and that at least 2 distinct images inlined.
        joined = b"".join(v for k, v in self.bundle.items() if k.endswith(".svg"))
        self.assertGreaterEqual(joined.count(b"data:image/"), 2)

    def test_oversized_image_is_downscaled(self):
        m = self._convert(max_edge=256)
        # Pull the first data URI out and decode it; longest edge must be <=256.
        page = self.bundle["pages/0.svg"].decode()
        match = re.search(r"data:image/(\w+);base64,([A-Za-z0-9+/=]+)", page)
        self.assertIsNotNone(match)
        raw = base64.b64decode(match.group(2))
        img = Image.open(io.BytesIO(raw))
        self.assertLessEqual(max(img.width, img.height), 256)
        _ = m

    def test_injects_svg_namespace(self):
        # SMART page SVGs omit xmlns; the output must declare it so each page
        # renders when loaded via an <img> tag in SpartBoard.
        self._convert()
        for name, data in self.bundle.items():
            if name.endswith(".svg"):
                self.assertIn(b'xmlns="http://www.w3.org/2000/svg"', data)

    def test_lossless_mode_keeps_png(self):
        self._convert(lossless=True)
        joined = b"".join(v for k, v in self.bundle.items() if k.endswith(".svg"))
        # No WebP re-encoding in lossless mode.
        self.assertNotIn(b"data:image/webp", joined)

    def tearDown(self):
        for f in (self.nb, self.out):
            if f.exists():
                os.remove(f)
        os.rmdir(self.tmp)


if __name__ == "__main__":
    unittest.main(verbosity=2)
