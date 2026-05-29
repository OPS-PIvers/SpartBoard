"""
Generate Google Workspace Marketplace Store-Listing assets from the app favicon.

Outputs (in this folder):
  - icon-32.png              32x32  application icon
  - icon-128.png             128x128 application icon
  - card-banner-220x140.png  220x140 application card banner

Source of truth is public/favicon.png (72x72 RGBA — the navy "whiteboard"
SpartBoard mark). The two icons are high-quality resamples that preserve the
favicon's transparent margins; the card banner composes the mark + "SpartBoard"
wordmark over a brand-blue vertical gradient (#2d3f89 -> #1d2a5d).

Re-run after the favicon changes:  python marketplace-assets/generate_assets.py
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "..", "public", "favicon.png")

BRAND_BLUE = (45, 63, 137)  # #2d3f89
BRAND_BLUE_DARK = (29, 42, 93)  # #1d2a5d

fav = Image.open(SRC).convert("RGBA")
print(f"source favicon: {fav.size[0]}x{fav.size[1]}")

# --- Icons: straight high-quality resamples, transparency preserved ---
fav.resize((32, 32), Image.LANCZOS).save(os.path.join(ROOT, "icon-32.png"))
fav.resize((128, 128), Image.LANCZOS).save(os.path.join(ROOT, "icon-128.png"))

# --- 220x140 card banner ---
W, H = 220, 140

# Vertical brand gradient (build 1xH column, then stretch — fast + smooth).
grad = Image.new("RGB", (1, H))
for y in range(H):
    t = y / (H - 1)
    grad.putpixel(
        (0, y),
        tuple(
            round(BRAND_BLUE[i] + (BRAND_BLUE_DARK[i] - BRAND_BLUE[i]) * t)
            for i in range(3)
        ),
    )
banner = grad.resize((W, H)).convert("RGBA")

# Logo mark, centered horizontally in the upper area.
LOGO = 60
logo = fav.resize((LOGO, LOGO), Image.LANCZOS)
banner.alpha_composite(logo, ((W - LOGO) // 2, 22))


def load_bold_font(size):
    for path in (
        r"C:\Windows\Fonts\segoeuib.ttf",  # Segoe UI Bold
        r"C:\Windows\Fonts\seguisb.ttf",  # Segoe UI Semibold
        r"C:\Windows\Fonts\arialbd.ttf",  # Arial Bold
    ):
        if os.path.exists(path):
            return ImageFont.truetype(path, size), path
    return ImageFont.load_default(), "PIL-default"


font, font_path = load_bold_font(26)
draw = ImageDraw.Draw(banner)
text = "SpartBoard"
bbox = draw.textbbox((0, 0), text, font=font)
tx = (W - (bbox[2] - bbox[0])) // 2 - bbox[0]
draw.text((tx, 92), text, font=font, fill=(255, 255, 255, 255))

banner.convert("RGB").save(os.path.join(ROOT, "card-banner-220x140.png"))

print(f"banner font: {font_path}")
print("wrote:", [f for f in sorted(os.listdir(ROOT)) if f.endswith(".png")])
