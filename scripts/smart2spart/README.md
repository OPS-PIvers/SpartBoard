# smart2spart

Convert a **SMART Notebook** (`.notebook`) file into an optimized **SpartBoard
bundle** (`.spartnb`) for high-fidelity import into the SMART Notebook widget.

## Why this exists

A `.notebook` file is a ZIP of one standard SVG per page plus an `images/`
folder of raster assets. Importing it directly into SpartBoard loses fidelity
for three reasons this tool fixes:

1. **Broken images.** Page SVGs reference images by relative path
   (`href="images/foo.png"`). Uploaded on their own, those references break and
   every embedded image renders blank. → We **inline** each image as a data URI
   so every page is self-contained.
2. **Wrong page order.** The `pageN.svg` filename number is _not_ the display
   order — the order (and lesson grouping) lives in `imsmanifest.xml`. → We read
   the manifest for the **true page order and lesson sections**.
3. **Bloat.** Embedded images are often far larger than they display (an 800px
   page carrying a 1.2 MB photo). → We **downscale + recompress** each image to
   display resolution.

The result is typically a fraction of the source size while remaining lossless
at display resolution. Lesson sections become navigable in the widget.

## Setup (one time)

Requires Python 3.10+ and Pillow.

```bash
pip install -r requirements.txt
```

## Usage

```bash
python smart2spart.py "Unit 9 - Bailey Busse.notebook"
# -> writes "Unit 9 - Bailey Busse.spartnb" next to it
```

Then drag the `.spartnb` file into the SpartBoard SMART Notebook widget to
import.

### Options

| Flag           | Default | Meaning                                                       |
| -------------- | ------- | ------------------------------------------------------------- |
| `-o, --output` | _auto_  | Output path (defaults to the input name with `.spartnb`).     |
| `--max-edge N` | `1600`  | Cap the longest edge of embedded images in px. `0` disables.  |
| `--quality N`  | `82`    | WebP quality (1–100) for lossy re-encode.                     |
| `--lossless`   | off     | Keep original image data (optimize only, no lossy re-encode). |
| `-q, --quiet`  | off     | Suppress progress output.                                     |

### Example output

```
Converting: Copy of Unit 9 - Bailey Busse.notebook  (14.38 MB)
Done.
  Pages:           230
  Images inlined:  159  (missing: 0)
  Image bytes:     11.43 MB -> 3.17 MB
  Bundle size:     14.38 MB -> 6.26 MB
  Output:          Copy of Unit 9 - Bailey Busse.spartnb
```

## Bundle format (`.spartnb`)

A ZIP containing:

- `manifest.json` — `{ version, title, pageCount, pages[{file,width,height}], sections[{title,startIndex,pageCount}] }`
- `pages/0.svg … N.svg` — self-contained SVGs (images inlined), renumbered to display order.

## Tests

```bash
python test_smart2spart.py
```

## Packaging for teachers (later)

To ship a double-click Windows executable so teachers don't need Python:

```bash
pip install pyinstaller
pyinstaller --onefile smart2spart.py
# -> dist/smart2spart.exe
```
