#!/usr/bin/env python3
"""BUILD 959: derive the windmill/watermill landmark composites from the
Kenney Fantasy Town Kit (CC0) modular pieces.

The kit ships NO complete windmill or watermill building — only the
rotor (windmill.png) and the wheel (watermill.png). These composites
assemble a tower/building from wall + door + window + roof pieces and
mount the rotor/wheel on it, so the town-layout prop pipeline (which
draws one billboard image per prop) can place them as structures.

Inputs : public/sprites/town-sprites/<piece>.png (shipped kit Previews)
Outputs: public/sprites/town-sprites/windmill-composite.png (108x148)
         public/sprites/town-sprites/watermill-composite.png (144x112)
Run    : python3 scripts/make-town-composites.py   (from the repo root)
Not run by the build — the outputs are checked in. Re-run after any
piece change to regenerate them.
"""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "public", "sprites", "town-sprites")


def piece(name):
    return Image.open(os.path.join(DIR, name + ".png")).convert("RGBA")


# Wall-slab alpha bboxes measured 2026-10-22 (see townSprites.ts
# KENNEY_WALL_CROP): full 64x64 frames tile with 28px transparent gaps,
# so tower rows crop to the slab and tile contiguously.
WALL_CROP = (14, 13, 50, 51)  # left, top, right, bottom (exclusive)
CELL_W = WALL_CROP[2] - WALL_CROP[0]  # 36
CELL_H = WALL_CROP[3] - WALL_CROP[1]  # 38


def paste(canvas, name, x, y, w, h):
    im = piece(name).resize((w, h), Image.NEAREST)
    canvas.alpha_composite(im, (x, y))


def paste_wall(canvas, name, cx, cy):
    """One tower cell: wall piece cropped to its slab, at native size."""
    im = piece(name).crop(WALL_CROP)
    canvas.alpha_composite(im, (cx * CELL_W, cy))


def windmill():
    # 3 cells wide x 2 tall tower, gable roof, sails over the peak.
    # Layout (top to bottom): sails, roof, window row, door row.
    tower_w = 3 * CELL_W  # 108
    roof_h = 36
    sails = 72
    total_h = roof_h + 2 * CELL_H + 36  # sails stick 36 above the roof
    c = Image.new("RGBA", (tower_w, total_h), (0, 0, 0, 0))
    paste(c, "roof-gable", 0, 36, tower_w, roof_h)
    for i, name in enumerate(["wall", "wall-window-glass", "wall"]):
        paste_wall(c, name, i, 36 + roof_h)
    for i, name in enumerate(["wall-window-glass", "wall-door", "wall-window-glass"]):
        paste_wall(c, name, i, 36 + roof_h + CELL_H)
    paste(c, "windmill", (tower_w - sails) // 2, 0, sails, sails)
    c.save(os.path.join(DIR, "windmill-composite.png"))
    return c.size


def watermill():
    # Building 2 wide: gable roof + window row + door row, wheel at right.
    tower_w = 2 * CELL_W  # 72
    roof_h = 36
    wheel = 72
    total_h = roof_h + 2 * CELL_H  # 112
    c = Image.new("RGBA", (tower_w + wheel, total_h), (0, 0, 0, 0))
    paste(c, "roof-gable", 0, 0, tower_w, roof_h)
    for i, name in enumerate(["wall-window-glass", "wall-window-glass"]):
        paste_wall(c, name, i, roof_h)
    for i, name in enumerate(["wall-window-glass", "wall-door"]):
        paste_wall(c, name, i, roof_h + CELL_H)
    paste(c, "watermill", tower_w, total_h - wheel, wheel, wheel)
    c.save(os.path.join(DIR, "watermill-composite.png"))
    return c.size


if __name__ == "__main__":
    print("windmill:", windmill())
    print("watermill:", watermill())
