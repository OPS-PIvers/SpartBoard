"""
Resize a raw screenshot to a Google Marketplace listing size (1280x800 or
640x400), with no cropping by default.

Drop your captures anywhere and run, e.g.:
  python marketplace-assets/resize_screenshot.py shot.png
  python marketplace-assets/resize_screenshot.py shot.png --size 640x400
  python marketplace-assets/resize_screenshot.py shot.png --mode cover --bg "#0f172a"

Modes:
  fit   (default) letterbox onto the canvas — nothing is cropped; gaps filled
        with --bg (default white).
  cover scale to fill, then center-crop to exact size — full-bleed, may trim edges.

Output defaults to <input>-<W>x<H>.png next to the input.
"""

import argparse
import os

from PIL import Image


def parse_size(value):
    w, h = value.lower().split("x")
    return int(w), int(h)


def parse_bg(value):
    v = value.lstrip("#")
    return tuple(int(v[i : i + 2], 16) for i in (0, 2, 4))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--size", default="1280x800", help="WxH, e.g. 1280x800 or 640x400")
    ap.add_argument("--mode", choices=["fit", "cover"], default="fit")
    ap.add_argument("--bg", default="#ffffff", help="hex fill for 'fit' letterbox")
    ap.add_argument("--out")
    args = ap.parse_args()

    target_w, target_h = parse_size(args.size)
    bg = parse_bg(args.bg)

    img = Image.open(args.input).convert("RGB")
    iw, ih = img.size
    pick = max if args.mode == "cover" else min
    scale = pick(target_w / iw, target_h / ih)
    nw, nh = round(iw * scale), round(ih * scale)
    img = img.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new("RGB", (target_w, target_h), bg)
    if args.mode == "cover":
        left, top = (nw - target_w) // 2, (nh - target_h) // 2
        canvas.paste(img.crop((left, top, left + target_w, top + target_h)), (0, 0))
    else:
        canvas.paste(img, ((target_w - nw) // 2, (target_h - nh) // 2))

    out = args.out or f"{os.path.splitext(args.input)[0]}-{target_w}x{target_h}.png"
    canvas.save(out)
    print(f"wrote {out}  {target_w}x{target_h}  mode={args.mode}")


if __name__ == "__main__":
    main()
