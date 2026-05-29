# Marketplace Store-Listing assets

Assets for the Google Workspace **Marketplace SDK → Store Listing** (Classroom
add-on). Generated from `public/favicon.png` by `generate_assets.py`.

| File                      | Size    | Where it goes                                        |
| ------------------------- | ------- | ---------------------------------------------------- |
| `icon-32.png`             | 32×32   | Small application icon                               |
| `icon-128.png`            | 128×128 | **Application icon** (required by the Store Listing) |
| `card-banner-220x140.png` | 220×140 | **Application card banner** (required)               |

Notes:

- `icon-128.png` is upscaled (~1.8×) from the 72×72 favicon — there is no vector
  source, so it is slightly soft. If a higher-res SpartBoard mark turns up, drop it
  in and re-run for a sharper 128.
- The card banner uses the brand-blue vertical gradient (`#2d3f89` → `#1d2a5d`)
  with the mark + "SpartBoard" wordmark.
- Regenerate: `python marketplace-assets/generate_assets.py`

## Screenshots (you capture, then process to spec)

The listing needs at least one **screenshot**, 1280×800 or 640×400, PNG/JPG (up
to 5). The best images come from the real, logged-in app — capture them from
your own session so they show populated content:

1. Good candidates: a populated **dashboard** with a few widgets, the **dock /
   widget picker** open, a **quiz** or **video activity** in progress.
2. Capture at a generous window size (a ~16:10 window, e.g. 1440×900, crops
   cleanest) and save the PNGs anywhere.
3. Process each to exact listing size with the helper:
   ```
   python marketplace-assets/resize_screenshot.py my-shot.png            # -> 1280x800, letterboxed (no crop)
   python marketplace-assets/resize_screenshot.py my-shot.png --mode cover   # full-bleed, may trim edges
   python marketplace-assets/resize_screenshot.py my-shot.png --size 640x400
   ```
   `fit` (default) never crops (pads with `--bg`, default white); `cover` fills
   the frame and may trim edges.
