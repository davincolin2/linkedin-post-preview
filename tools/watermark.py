"""Burn the @yosefdavinc watermark into images (bottom right, high contrast).

Usage: python tools/watermark.py <image> [<image> ...]

Image prompts must NOT ask the model to draw the watermark. This script is the
only watermark source, so there is never a double watermark.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

WM = '@yosefdavinc'
FONT_PATH = r'C:\Windows\Fonts\arialbd.ttf'


def watermark(path):
    img = Image.open(path).convert('RGBA')
    w, h = img.size
    size = max(24, int(w * 0.035))  # about 42px on a 1200px wide image
    font = ImageFont.truetype(FONT_PATH, size)
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    bb = d.textbbox((0, 0), WM, font=font)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    margin = int(w * 0.025)
    x, y = w - tw - margin, h - th - margin - 5
    for ox, oy in [(-2, -2), (-2, 2), (2, -2), (2, 2), (-2, 0), (2, 0), (0, -2), (0, 2)]:
        d.text((x + ox, y + oy), WM, font=font, fill=(0, 0, 0, 200))
    d.text((x, y), WM, font=font, fill=(255, 255, 255, 230))
    out = Image.alpha_composite(img, overlay).convert('RGB')
    if path.lower().endswith('.png'):
        out.save(path, 'PNG')
    else:
        out.save(path, 'JPEG', quality=95)
    print('watermarked:', path)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('usage: python tools/watermark.py <image> [...]')
    for p in sys.argv[1:]:
        watermark(p)
