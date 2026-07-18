#!/usr/bin/env python3
"""
Generate IntelliNex Field Android launcher icons + assets/logo.png
from the HMIS public logos (same assets as the web sidebar).

Usage (from mobile-collector):
  python3 scripts/generate-android-icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT.parent / 'public'
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
ASSETS_LOGO = ROOT / 'assets' / 'logo.png'
ASSETS_ICON = ROOT / 'assets' / 'icon.png'

# Prefer the mark used in the HMIS sidebar / login branding
SOURCE_CANDIDATES = [
    PUBLIC / 'logo_intelli.png',
    PUBLIC / 'intellilogo_white.png',
    PUBLIC / 'logo_intell_ndi.png',
    PUBLIC / 'logo_da_intelli.png',
]

SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

# IntelliNex Field primary (matches src/config/api.ts THEME.primary)
BACKGROUND = (15, 76, 117, 255)  # #0F4C75
LOGO_SCALE = 0.78


def pick_source() -> Path:
    for path in SOURCE_CANDIDATES:
        if path.is_file():
            return path
    raise SystemExit(
        'No IntelliNex logo found under public/. Expected one of:\n  '
        + '\n  '.join(str(p) for p in SOURCE_CANDIDATES)
    )


def extract_emblem(source: Image.Image) -> Image.Image:
    """Crop the circular cross+arrow mark from the full wordmark logo."""
    rgba = source.convert('RGBA')
    arr = np.array(rgba)
    # Non-near-black opaque pixels = logo content (works for black-bg wordmarks)
    mask = ((arr[:, :, 0] > 28) | (arr[:, :, 1] > 28) | (arr[:, :, 2] > 28)) & (arr[:, :, 3] > 8)
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return rgba

    row_counts = mask.sum(axis=1)
    y0, y1 = int(ys.min()), int(ys.max())
    # Emblem sits above the wordmark; find the first horizontal gap after content starts
    gap_y = None
    for y in range(y0 + 40, y1 - 20):
        if row_counts[y] < 8 and row_counts[y + 8 : y + 40].sum() > 80:
            gap_y = y
            break
    if gap_y is None:
        gap_y = y0 + max(80, (y1 - y0) // 2)

    emblem = rgba.crop((int(xs.min()), y0, int(xs.max()) + 1, gap_y))
    # Trim empty edges again
    e = np.array(emblem)
    emask = ((e[:, :, 0] > 28) | (e[:, :, 1] > 28) | (e[:, :, 2] > 28)) & (e[:, :, 3] > 8)
    eys, exs = np.where(emask)
    if len(exs):
        emblem = emblem.crop((int(exs.min()), int(eys.min()), int(exs.max()) + 1, int(eys.max()) + 1))

    # Make near-black background transparent so it sits cleanly on brand color
    e = np.array(emblem)
    dark = (e[:, :, 0] < 24) & (e[:, :, 1] < 24) & (e[:, :, 2] < 24)
    e[dark, 3] = 0
    return Image.fromarray(e, 'RGBA')


def fit_on_canvas(mark: Image.Image, size: int, bg: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), bg)
    max_side = int(size * LOGO_SCALE)
    logo = mark.copy()
    logo.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    x = (size - logo.width) // 2
    y = (size - logo.height) // 2
    canvas.paste(logo, (x, y), logo)
    return canvas


def round_icon(square: Image.Image) -> Image.Image:
    size = square.size[0]
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    rounded = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    rounded.paste(square, (0, 0), mask)
    # Fill outside with brand color for adaptive launchers that expect opaque round icons
    bg = Image.new('RGBA', (size, size), BACKGROUND)
    bg.paste(rounded, (0, 0), rounded)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    return out


def save_login_logo(source: Image.Image) -> None:
    """Full logo for LoginScreen (trim empty margins, keep transparent)."""
    rgba = source.convert('RGBA')
    arr = np.array(rgba)
    mask = ((arr[:, :, 0] > 28) | (arr[:, :, 1] > 28) | (arr[:, :, 2] > 28)) & (arr[:, :, 3] > 8)
    ys, xs = np.where(mask)
    if len(xs):
        pad = 8
        box = (
            max(0, int(xs.min()) - pad),
            max(0, int(ys.min()) - pad),
            min(rgba.width, int(xs.max()) + 1 + pad),
            min(rgba.height, int(ys.max()) + 1 + pad),
        )
        rgba = rgba.crop(box)
    # Knock out solid black plate so it composites on light login card
    a = np.array(rgba)
    dark = (a[:, :, 0] < 24) & (a[:, :, 1] < 24) & (a[:, :, 2] < 24)
    a[dark, 3] = 0
    rgba = Image.fromarray(a, 'RGBA')
    ASSETS_LOGO.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(ASSETS_LOGO)
    print(f'Wrote {ASSETS_LOGO}')


def main() -> None:
    source_path = pick_source()
    print(f'Source: {source_path}')
    source = Image.open(source_path).convert('RGBA')
    save_login_logo(source)

    emblem = extract_emblem(source)
    ASSETS_ICON.parent.mkdir(parents=True, exist_ok=True)
    emblem.save(ASSETS_ICON)
    print(f'Wrote {ASSETS_ICON}')

    for folder, size in SIZES.items():
        out_dir = RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        square = fit_on_canvas(emblem, size, BACKGROUND)
        square.save(out_dir / 'ic_launcher.png')
        round_icon(square).save(out_dir / 'ic_launcher_round.png')
        print(f'Wrote {folder} ({size}px)')


if __name__ == '__main__':
    main()
