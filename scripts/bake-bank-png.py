#!/usr/bin/env python3
"""BUILD 982: bake the Mosslight Bank exterior to a single self-contained PNG.

The bank is the ONE building whose iso art is a baked PNG rather than a
live composition or the shared starter overlay: the follow-up build will
replace old house art, so the bank must not depend on kit pieces or the
starter overlay at runtime. The game reads ONLY public/buildings/bank.png
for the bank (iso view, 2D aspect, rig meta, building-art test).

The bake is a faithful port of src/game/townSprites.ts drawKenneyHouse
(BUILD 980 kit-native geometry — NOT the slab approximation in
make-variant-renders.py, whose floating roof/chimney artifacts are
visible in the shipped 959 audit renders and would be wrong as in-game
art): wall tiles share edges along the (33,7) along-vector, each roof
tile's bottom edge anchors exactly on its wall cell's top edge, the
chimney plants on the roof slope. Composition (same pieces as the
make-variant-renders.py bank spec): 5-cell stone facade, door at the
center cell, roof-high-point, chimney right.

After rendering, the PNG is center-padded so the door leaf's center is
exactly at 0.50 of the width (the trigger sits at 0.51 by the shared
fieldDoorPosition formula, so painted-door vs trigger deviation is
exactly 0.01 * footprint width — the same convention as every filler).

Inputs : public/sprites/town-sprites/<piece>.png (shipped kit Previews)
Output : public/buildings/bank.png
Run    : python3 scripts/bake-bank-png.py (from the repo root)
"""
from PIL import Image
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT = os.path.join(ROOT, "public", "sprites", "town-sprites")
OUT = os.path.join(ROOT, "public", "buildings", "bank.png")

# Kit-native geometry (townSprites.ts, BUILD 980).
ALONG, DROP, HEIGHT = 33, 7, 30
WALL_BL = (15, 43)  # wall-face bottom-left anchor in the 64px frame
ROOF = {"bl": (16, 47), "flip": False, "stretchX": 33 / 31, "yOffS": 6}  # roof-high-point
WALLS = ["wall-window-stone", "wall-window-stone", "wall-door",
         "wall-window-stone", "wall-window-stone"]
CHIMNEY = "chimney"

CELLS = len(WALLS)
WALL_BAND_W = 1100.0  # wall band width in bake px
S = WALL_BAND_W / (CELLS * ALONG)
CANVAS_W, CANVAS_H = 1600, 1100
X, Y_BOTTOM = 200.0, 900.0


def piece(name):
    return Image.open(os.path.join(KIT, name + ".png")).convert("RGBA")


def draw_anchored(canvas, img, ix, iy, sx, sy, flip, stretch_x=1.0):
    """Mirror of drawKenneyHouse's drawAnchored (canvas coords, y down)."""
    dw = round(64 * S * stretch_x)
    dh = round(64 * S)
    resized = img.resize((dw, dh), Image.NEAREST)
    if flip:
        resized = resized.transpose(Image.FLIP_LEFT_RIGHT)
        px = round(sx + ix * S * stretch_x - dw)
    else:
        px = round(sx - ix * S * stretch_x)
    py = round(sy - iy * S)
    canvas.alpha_composite(resized, (px, py))
    return (px, py, dw, dh)


def ground_bl(c):
    return (X + c * ALONG * S, Y_BOTTOM - (CELLS - c) * DROP * S)


def top_y(c, row):
    bx, by = ground_bl(c)
    return (bx, by - row * HEIGHT * S)


def alpha_bbox(img):
    return img.getchannel("A").getbbox()


def main():
    imgs = {p: piece(p) for p in set(WALLS + [ "roof-high-point", CHIMNEY ])}
    c = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    # Ground row.
    for i, p in enumerate(WALLS):
        bx, by = ground_bl(i)
        draw_anchored(c, imgs[p], WALL_BL[0], WALL_BL[1], bx, by, False)
    # Roof: one tile per wall cell, bottom on the wall top.
    for i in range(CELLS):
        tx, ty = top_y(i, 1)
        ay = ty + ROOF["yOffS"] * S
        draw_anchored(c, imgs["roof-high-point"], ROOF["bl"][0], ROOF["bl"][1],
                      tx, ay, ROOF["flip"], ROOF["stretchX"])
    # Chimney right, planted on the roof slope (drawKenneyHouse math).
    chim_w = 0.55 * ALONG * S
    chim_h = 1.15 * ALONG * S
    chim_x = X + WALL_BAND_W * 0.74
    wall_top_at = top_y(0, 1)[1] + (chim_x - X) * (DROP / ALONG)
    foot_y = wall_top_at - 15 * S
    rect_bottom = foot_y + (14 / 64) * chim_h
    chim = imgs[CHIMNEY].resize((round(chim_w), round(chim_h)), Image.NEAREST)
    c.alpha_composite(chim, (round(chim_x - chim_w / 2), round(rect_bottom - chim_h)))
    # Crop to content + pad.
    bbox = alpha_bbox(c)
    assert bbox, "empty render"
    pad = 8
    c = c.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                min(CANVAS_W, bbox[2] + pad), min(CANVAS_H, bbox[3] + pad)))
    # Center-pad so the door leaf center is exactly at 0.50 of the width.
    # Door cell (index 2) draw rect + the wall-door piece's own alpha bbox.
    # Crop origin (canvas coords -> cropped coords):
    ox = max(0, bbox[0] - pad)
    door_draw_x = ground_bl(2)[0] - WALL_BL[0] * S - ox
    door_piece_bbox = alpha_bbox(imgs["wall-door"])
    assert door_piece_bbox, "wall-door piece has no opaque pixels"
    leaf_cx = door_draw_x + (door_piece_bbox[0] + door_piece_bbox[2]) / 2 * S
    w, h = c.size
    target_cx = w / 2
    shift = target_cx - leaf_cx
    if abs(shift) >= 0.5:
        # Pad on the side that moves the leaf toward center.
        pad_left = max(0, round(shift))
        pad_right = max(0, round(-shift))
        padded = Image.new("RGBA", (w + pad_left + pad_right, h), (0, 0, 0, 0))
        padded.alpha_composite(c, (pad_left, 0))
        c = padded
        w, h = c.size
        leaf_cx = leaf_cx + pad_left
    print(f"bank.png: {c.size[0]}x{c.size[1]}, door center fraction {leaf_cx / c.size[0]:.4f}")
    c.save(OUT)
    return c.size


if __name__ == "__main__":
    main()
