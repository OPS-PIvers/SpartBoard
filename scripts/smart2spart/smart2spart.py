#!/usr/bin/env python3
"""
smart2spart — convert a SMART Notebook (.notebook) file into an optimized
SpartBoard bundle (.spartnb) for high-fidelity import.

A .notebook file is a ZIP containing:
  - pageN.svg          one standard SVG per page (vector ink, text, images)
  - images/*           raster assets referenced by the page SVGs (relative href)
  - imsmanifest.xml     defines the *real* page order and lesson grouping

The page SVGs are clean and browser-renderable, BUT:
  1. Their <image href="images/foo.png"> references are relative, so uploading a
     bare SVG breaks every embedded image.
  2. The pageN.svg *filename number is NOT the display order* — the manifest's
     ordered <resource identifier="pages"> (and the lesson groups) define order.
  3. Embedded images are often wildly oversized for an 800px-wide page (e.g. a
     1.2 MB coin photo shown at thumbnail size), which is the bulk of file size.

This tool fixes all three: it reads the manifest for true order + lesson
sections, downscales/recompresses each referenced image to display resolution,
inlines them as data URIs so each page SVG is self-contained, and writes a
.spartnb ZIP (renumbered pages + manifest.json). The result is typically a
fraction of the source size while being lossless at display resolution.

Usage:
    python smart2spart.py "Unit 9.notebook"
    python smart2spart.py "Unit 9.notebook" -o "Unit 9.spartnb"
    python smart2spart.py "Unit 9.notebook" --max-edge 1600 --quality 82
    python smart2spart.py "Unit 9.notebook" --lossless   # keep PNGs, no lossy

Requires: Pillow  (pip install Pillow)
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

try:
    from PIL import Image
except ImportError:  # pragma: no cover - environment guard
    sys.stderr.write(
        "ERROR: Pillow is required. Install it with:  pip install Pillow\n"
    )
    sys.exit(2)


# ----------------------------------------------------------------------------
# Manifest parsing
# ----------------------------------------------------------------------------

# IMS content-packaging namespace used by SMART's imsmanifest.xml.
_IMS_NS = "{http://www.imsglobal.org/xsd/imscp_v1p1}"


@dataclass
class Section:
    """A lesson/section: a titled, contiguous run of pages in display order."""

    title: str
    start_index: int
    page_count: int


@dataclass
class NotebookPlan:
    """The ordered page list + lesson sections derived from the manifest."""

    ordered_pages: list[str] = field(default_factory=list)  # e.g. ["page141.svg", ...]
    sections: list[Section] = field(default_factory=list)


def _local(tag: str) -> str:
    """Strip the XML namespace from a tag name."""
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _resource_files(resource: ET.Element) -> list[str]:
    """Ordered list of href values from a <resource>'s child <file> elements."""
    hrefs: list[str] = []
    for child in resource:
        if _local(child.tag) == "file":
            href = child.get("href")
            if href:
                # Normalize Windows backslashes the manifest sometimes uses.
                hrefs.append(href.replace("\\", "/"))
    return hrefs


def parse_manifest(manifest_xml: bytes, available_pages: list[str]) -> NotebookPlan:
    """
    Build the page order + lesson sections from imsmanifest.xml.

    Order of preference:
      1. The lesson groups in <organization id="pagegroups"> (gives order AND
         section titles, which is what teachers actually see).
      2. The flat ordered <resource identifier="pages"> list.
      3. Numeric filename sort (legacy fallback) — handled by the caller when
         this returns nothing usable.

    `available_pages` is the set of pageN.svg actually present in the archive;
    it is used to filter dangling manifest references and to append any orphan
    pages the manifest forgot, so no page is ever silently dropped.
    """
    plan = NotebookPlan()
    try:
        root = ET.fromstring(manifest_xml)
    except ET.ParseError:
        return plan  # caller falls back to numeric sort

    available = set(available_pages)

    # Map resource identifier -> ordered page files.
    resources: dict[str, list[str]] = {}
    for resources_el in root.iter(f"{_IMS_NS}resources"):
        for resource in resources_el:
            if _local(resource.tag) != "resource":
                continue
            ident = resource.get("identifier")
            if not ident:
                continue
            files = [f for f in _resource_files(resource) if f.endswith(".svg")]
            if files:
                resources[ident] = files

    # 1. Lesson groups → order + sections.
    seen: set[str] = set()
    for org in root.iter(f"{_IMS_NS}organization"):
        for item in org:
            if _local(item.tag) != "item":
                continue
            ref = item.get("identifierref")
            title_el = next(
                (c for c in item if _local(c.tag) == "title"), None
            )
            title = (title_el.text or "").strip() if title_el is not None else ""
            pages = resources.get(ref or "", [])
            # Keep only present, not-yet-placed pages, preserving order.
            group_pages = [
                p for p in pages if p in available and p not in seen
            ]
            if not group_pages:
                continue
            start = len(plan.ordered_pages)
            plan.ordered_pages.extend(group_pages)
            seen.update(group_pages)
            plan.sections.append(
                Section(
                    title=title or f"Section {len(plan.sections) + 1}",
                    start_index=start,
                    page_count=len(group_pages),
                )
            )
        if plan.ordered_pages:
            break  # first organization with content wins

    # 2. Fall back to the flat "pages" resource for ordering if no groups.
    if not plan.ordered_pages:
        flat = resources.get("pages", [])
        plan.ordered_pages = [p for p in flat if p in available]
        plan.sections = []  # no lesson grouping available

    # 3. Append any present pages the manifest never referenced (defensive),
    #    in numeric filename order so nothing is lost.
    placed = set(plan.ordered_pages)
    orphans = sorted(
        (p for p in available_pages if p not in placed),
        key=_page_number,
    )
    plan.ordered_pages.extend(orphans)

    return plan


_PAGE_NUM_RE = re.compile(r"(\d+)")


def _page_number(name: str) -> int:
    m = _PAGE_NUM_RE.search(name)
    return int(m.group(1)) if m else 0


# ----------------------------------------------------------------------------
# Image optimization + inlining
# ----------------------------------------------------------------------------

# Match both SVG2 `href="images/..."` and legacy `xlink:href="images/..."`.
_IMG_HREF_RE = re.compile(r'(\bxlink:href|\bhref)\s*=\s*"(images/[^"]+)"')

# Pull width/height off the root <svg ...> tag.
_SVG_W_RE = re.compile(r'<svg\b[^>]*\bwidth="([\d.]+)"')
_SVG_H_RE = re.compile(r'<svg\b[^>]*\bheight="([\d.]+)"')

_SVG_NS = "http://www.w3.org/2000/svg"
_XLINK_NS = "http://www.w3.org/1999/xlink"


def ensure_svg_namespaces(svg_text: str) -> str:
    """
    SMART page SVGs omit the root `xmlns` declaration. That renders fine inline
    inside SMART, but a standalone SVG loaded via an <img> tag (how SpartBoard
    displays pages) will NOT render without the SVG namespace. Inject it (and
    xlink, if used) into the opening <svg> tag when missing. Idempotent.
    """
    m = re.search(r"<svg\b", svg_text)
    if not m:
        return svg_text
    tag_end = svg_text.find(">", m.start())
    if tag_end == -1:
        return svg_text
    head = svg_text[m.start() : tag_end]
    additions = ""
    if "xmlns=" not in head:
        additions += f' xmlns="{_SVG_NS}"'
    if "xmlns:xlink=" not in head and "xlink:" in svg_text:
        additions += f' xmlns:xlink="{_XLINK_NS}"'
    if not additions:
        return svg_text
    insert_at = m.start() + len("<svg")
    return svg_text[:insert_at] + additions + svg_text[insert_at:]


@dataclass
class OptimizeOptions:
    max_edge: int = 1600       # cap longest image edge (px); 0 = no resize
    quality: int = 82          # WebP/JPEG quality for lossy re-encode
    lossless: bool = False     # if True, keep originals (only optimize PNG)


@dataclass
class ConvertStats:
    pages: int = 0
    images_inlined: int = 0
    images_missing: int = 0
    bytes_images_before: int = 0
    bytes_images_after: int = 0


def _optimize_image(raw: bytes, opts: OptimizeOptions) -> tuple[bytes, str]:
    """
    Downscale + recompress one image. Returns (bytes, mime_subtype).

    Strategy:
      - Resize so the longest edge <= max_edge (never upscale).
      - Lossy mode: re-encode to WebP (q=quality). WebP keeps alpha, so it works
        for both photos and cut-out PNGs, and is far smaller than source PNG.
      - Lossless mode: keep the original format but run Pillow's optimizer.
      - If the re-encoded result isn't actually smaller, keep the original bytes.
    """
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception:
        return raw, ""  # not a decodable image; leave untouched

    fmt = (img.format or "").lower()

    # Resize (preserve aspect ratio, never upscale).
    if opts.max_edge > 0:
        longest = max(img.width, img.height)
        if longest > opts.max_edge:
            scale = opts.max_edge / longest
            new_size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
            img = img.resize(new_size, Image.LANCZOS)

    out = io.BytesIO()
    if opts.lossless:
        # Keep format; just optimize. Fall back to PNG for odd formats.
        save_fmt = "PNG" if fmt not in ("png", "jpeg", "jpg") else (img.format or "PNG")
        try:
            img.save(out, format=save_fmt, optimize=True)
            subtype = "png" if save_fmt == "PNG" else save_fmt.lower()
        except Exception:
            return raw, ""
    else:
        # Lossy WebP keeps alpha and crushes size for an 800px canvas.
        has_alpha = img.mode in ("RGBA", "LA", "PA") or (
            img.mode == "P" and "transparency" in img.info
        )
        if has_alpha:
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")
        try:
            img.save(out, format="WEBP", quality=opts.quality, method=6)
            subtype = "webp"
        except Exception:
            return raw, ""

    encoded = out.getvalue()
    if len(encoded) < len(raw):
        return encoded, subtype
    # Re-encode didn't help — keep the smaller original.
    return raw, ""


def _zip_image_lookup(zf: zipfile.ZipFile) -> dict[str, str]:
    """Map normalized lower-case image paths -> actual zip entry names."""
    lookup: dict[str, str] = {}
    for name in zf.namelist():
        norm = name.replace("\\", "/")
        lookup[norm.lower()] = name
    return lookup


def _data_uri(data: bytes, subtype: str) -> str:
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:image/{subtype};base64,{b64}"


def _guess_subtype(name: str) -> str:
    lower = name.lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        return "jpeg"
    if lower.endswith(".gif"):
        return "gif"
    if lower.endswith(".webp"):
        return "webp"
    return "png"


def inline_page_images(
    svg_text: str,
    zf: zipfile.ZipFile,
    img_lookup: dict[str, str],
    opts: OptimizeOptions,
    stats: ConvertStats,
    image_cache: dict[str, str],
) -> str:
    """Replace every relative images/* href in one page SVG with a data URI."""

    def repl(m: re.Match[str]) -> str:
        attr, href = m.group(1), m.group(2)
        # Candidate keys in priority order. SMART often writes a literal '#' in
        # filenames (e.g. "nickle front #1.jpg") WITHOUT URL-encoding it, so the
        # full unquoted path must be tried before treating '#' as a fragment.
        candidates = [unquote(href).replace("\\", "/")]
        if "#" in href:
            candidates.append(unquote(href.split("#", 1)[0]).replace("\\", "/"))

        key = next(
            (
                c.lower()
                for c in candidates
                if c.lower() in image_cache or c.lower() in img_lookup
            ),
            None,
        )
        if key is None:
            stats.images_missing += 1
            return m.group(0)  # leave untouched; genuinely can't resolve

        if key in image_cache:
            stats.images_inlined += 1
            return f'{attr}="{image_cache[key]}"'

        entry = img_lookup[key]

        raw = zf.read(entry)
        stats.bytes_images_before += len(raw)
        data, subtype = _optimize_image(raw, opts)
        if not subtype:
            subtype = _guess_subtype(entry)
        stats.bytes_images_after += len(data)
        uri = _data_uri(data, subtype)
        image_cache[key] = uri
        stats.images_inlined += 1
        return f'{attr}="{uri}"'

    return _IMG_HREF_RE.sub(repl, svg_text)


# ----------------------------------------------------------------------------
# Conversion
# ----------------------------------------------------------------------------


def convert(
    notebook_path: Path,
    output_path: Path,
    opts: OptimizeOptions,
    verbose: bool = True,
) -> ConvertStats:
    stats = ConvertStats()

    with zipfile.ZipFile(notebook_path, "r") as zf:
        names = zf.namelist()
        page_files = sorted(
            (n for n in names if re.fullmatch(r"page\d+\.svg", n, re.IGNORECASE)),
            key=_page_number,
        )
        if not page_files:
            raise SystemExit("No pageN.svg files found — not a SMART Notebook archive?")

        # Page order + lesson sections from the manifest (with fallbacks).
        manifest_entry = next((n for n in names if n.lower().endswith("imsmanifest.xml")), None)
        if manifest_entry:
            plan = parse_manifest(zf.read(manifest_entry), page_files)
        else:
            plan = NotebookPlan(ordered_pages=page_files, sections=[])

        if not plan.ordered_pages:
            plan.ordered_pages = page_files

        img_lookup = _zip_image_lookup(zf)
        # Cache: same image used on many pages is optimized once, reused as URI.
        image_cache: dict[str, str] = {}

        manifest_pages: list[dict] = []

        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as out:
            for index, page_name in enumerate(plan.ordered_pages):
                svg_text = zf.read(page_name).decode("utf-8", errors="replace")
                width = float(_SVG_W_RE.search(svg_text).group(1)) if _SVG_W_RE.search(svg_text) else 800.0
                height = float(_SVG_H_RE.search(svg_text).group(1)) if _SVG_H_RE.search(svg_text) else 600.0

                svg_text = inline_page_images(
                    svg_text, zf, img_lookup, opts, stats, image_cache
                )
                svg_text = ensure_svg_namespaces(svg_text)

                out_name = f"pages/{index}.svg"
                out.writestr(out_name, svg_text)
                manifest_pages.append(
                    {"file": out_name, "width": round(width), "height": round(height)}
                )
                stats.pages += 1
                if verbose and (index + 1) % 25 == 0:
                    print(f"  ... {index + 1}/{len(plan.ordered_pages)} pages", flush=True)

            manifest = {
                "version": 1,
                "title": notebook_path.stem,
                "pageCount": len(manifest_pages),
                "pages": manifest_pages,
                "sections": [
                    {
                        "title": s.title,
                        "startIndex": s.start_index,
                        "pageCount": s.page_count,
                    }
                    for s in plan.sections
                ],
            }
            out.writestr("manifest.json", json.dumps(manifest, indent=2))

    return stats


def _fmt_mb(n: int) -> str:
    return f"{n / (1024 * 1024):.2f} MB"


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="smart2spart",
        description="Convert a SMART Notebook (.notebook) into an optimized SpartBoard bundle (.spartnb).",
    )
    parser.add_argument("input", type=Path, help="Path to the .notebook file")
    parser.add_argument(
        "-o", "--output", type=Path, default=None,
        help="Output .spartnb path (default: alongside input)",
    )
    parser.add_argument(
        "--max-edge", type=int, default=1600,
        help="Cap the longest edge of embedded images in px (0 = no resize). Default 1600.",
    )
    parser.add_argument(
        "--quality", type=int, default=82,
        help="WebP quality for lossy re-encode (1-100). Default 82.",
    )
    parser.add_argument(
        "--lossless", action="store_true",
        help="Keep original image data (optimize only, no lossy re-encode).",
    )
    parser.add_argument("-q", "--quiet", action="store_true", help="Suppress progress output.")
    args = parser.parse_args(argv)

    if not args.input.exists():
        sys.stderr.write(f"ERROR: file not found: {args.input}\n")
        return 1

    output = args.output or args.input.with_suffix(".spartnb")
    opts = OptimizeOptions(
        max_edge=args.max_edge, quality=args.quality, lossless=args.lossless
    )

    src_size = args.input.stat().st_size
    if not args.quiet:
        print(f"Converting: {args.input.name}  ({_fmt_mb(src_size)})", flush=True)

    stats = convert(args.input, output, opts, verbose=not args.quiet)

    out_size = output.stat().st_size
    if not args.quiet:
        print("Done.")
        print(f"  Pages:           {stats.pages}")
        print(f"  Images inlined:  {stats.images_inlined}  (missing: {stats.images_missing})")
        print(
            f"  Image bytes:     {_fmt_mb(stats.bytes_images_before)} -> "
            f"{_fmt_mb(stats.bytes_images_after)}"
        )
        print(f"  Bundle size:     {_fmt_mb(src_size)} -> {_fmt_mb(out_size)}")
        print(f"  Output:          {output}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
