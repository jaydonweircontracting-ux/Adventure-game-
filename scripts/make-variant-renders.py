#!/usr/bin/env python3
"""BUILD 959 (deploy fix): faithful single-PNG renders of the 5 NEW Kenney
house variants, for the public/buildings/ audit catalog.

The building-art regression test requires every BUILDING_VARIANTS entry
to have an audited public/buildings/<variant>.png. The 5 new 959 variants
are runtime Kenney compositions (no single source PNG), so this script
renders each composition with the SAME layout the game uses at runtime
(src/game/townSprites.ts drawKenneyHouse, slab-cropped wall rows):
ground row (door at center cell), optional upper row, full-width roof,
chimneys, banners. Outputs are audit/reference renders; the game still
composes live from the kit pieces.

Inputs : public/sprites/town-sprites/<piece>.png (shipped kit Previews)
Outputs: public/buildings/{cottage-wide,hall-grand,house-balcony,
         house-tall,shop-banner}.png
NOTE: the bank PNG is NOT made by this script (its slab renderer floats
roofs/chimneys — see the shipped 959 renders). The bank is baked by
scripts/bake-bank-png.py, a faithful port of drawKenneyHouse.
Run    : python3 scripts/make-variant-renders.py (from the repo root)
"""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT = os.path.join(ROOT, "public", "sprites", "town-sprites")
OUT = os.path.join(ROOT, "public", "buildings")
CELL = 256  # runtime cell size analogue (square cells)
# Slab crop per townSprites.ts KENNEY_WALL_CROP (measured alpha bboxes).
CROP_DEFAULT = (14, 13, 50, 51)
CROP = {"wall-window-shutters": (14, 11, 51, 52)}


def piece(name):
    return Image.open(os.path.join(KIT, name + ".png")).convert("RGBA")


def wall_cell(name):
    """Wall-family piece, slab-cropped and scaled to one square cell."""
    box = CROP.get(name, CROP_DEFAULT)
    return piece(name).crop(box).resize((CELL, CELL), Image.NEAREST)


def render(name, walls, upper, roof, chimneys, banners):
    cells = len(walls)
    rows = 2 if upper else 1
    w = cells * CELL
    # Bottom-up layout (mirrors drawKenneyHouse, yBottom = canvas bottom).
    # Canvas tall enough for chimney headroom; cropped to content at end.
    h = rows * CELL + int(CELL * 0.9) + 320
    c = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    y_bottom = h
    wall_top = y_bottom - rows * CELL
    for i, p in enumerate(walls):
        c.alpha_composite(wall_cell(p), (i * CELL, y_bottom - CELL))
    if upper:
        for i, p in enumerate(upper):
            c.alpha_composite(wall_cell(p), (i * CELL, y_bottom - 2 * CELL))
    roof_h = int(CELL * 0.9)
    roof_y = wall_top - roof_h + int(CELL * 0.16)
    c.alpha_composite(piece(roof).resize((w, roof_h), Image.NEAREST), (0, roof_y))
    for side in chimneys:
        chim_w = int(CELL * 0.55)
        chim_h = int(CELL * 1.15)
        chim_bottom = roof_y + int(roof_h * 0.6)
        chim_x = int(w * 0.08) if side == "left" else int(w * 0.74)
        c.alpha_composite(
            piece("chimney").resize((chim_w, chim_h), Image.NEAREST),
            (chim_x, chim_bottom - chim_h),
        )
    if banners:
        door_idx = next(i for i, p in enumerate(walls) if "door" in p)
        door_left = door_idx * CELL
        ban_w = int(CELL * 0.32)
        ban_h = int(CELL * 0.95)
        ban_y = y_bottom - CELL + int(CELL * 0.02)
        c.alpha_composite(
            piece(banners[0]).resize((ban_w, ban_h), Image.NEAREST),
            (door_left + int(CELL * 0.03), ban_y),
        )
        c.alpha_composite(
            piece(banners[1]).resize((ban_w, ban_h), Image.NEAREST),
            (door_left + CELL - int(CELL * 0.03) - ban_w, ban_y),
        )
    # Crop to content with a small margin (chimney tops, roof).
    bbox = c.getchannel("A").getbbox()
    assert bbox, "empty render: " + name
    pad = 8
    c = c.crop((
        max(0, bbox[0] - pad), max(0, bbox[1] - pad),
        min(w, bbox[2] + pad), min(h, bbox[3] + pad),
    ))
    c.save(os.path.join(OUT, name + ".png"))
    return c.size


VARIANTS = {
    # 5-cell wide cottage, gable roof, chimney left.
    "cottage-wide": (
        ["wall-window-glass", "wall-window-glass", "wall-door",
         "wall-window-glass", "wall-window-glass"],
        None, "roof-gable", ["left"], None,
    ),
    # 5-cell grand hall, tall pointed roof, chimneys both sides.
    "hall-grand": (
        ["wall-window-shutters", "wall-window-shutters", "wall-door",
         "wall-window-shutters", "wall-window-shutters"],
        None, "roof-high-point", ["left", "right"], None,
    ),
    # Balcony house: open balcony level above the ground row.
    "house-balcony": (
        ["wall-window-glass", "wall-door", "wall-window-glass"],
        ["balcony-wall-fence", "balcony-wall", "balcony-wall-fence"],
        "roof-gable", ["right"], None,
    ),
    # Two-story timber house: timber window row above.
    "house-tall": (
        ["wall-window-glass", "wall-door", "wall-window-glass"],
        ["wall-wood-window-glass", "wall-wood-window-glass",
         "wall-wood-window-glass"],
        "roof-high", ["right"], None,
    ),
    # Timber banner shop: hanging signs flanking the door.
    "shop-banner": (
        ["wall-wood-window-glass", "wall-wood-door", "wall-wood-window-glass"],
        None, "roof", ["right"], ["banner-red", "banner-green"],
    ),
}

if __name__ == "__main__":
    for name, spec in VARIANTS.items():
        print(name, render(name, *spec))
