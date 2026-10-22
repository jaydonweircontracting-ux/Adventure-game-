#!/usr/bin/env python3
"""BUILD 965: slice characters.zip monster sheets into the game's 8x5 monster-sheet grid.

Source: ~/workspace/user/files/characters.zip (16 PNGs, 2009, NO license file
-- no terms claimed; the fact is recorded in the build note, like the knight
pack in BUILD 962). Each monster sheet is 2048x2048 = 8 cols x 8 rows of
256px cells: rows are 8 directions, columns are animation frames:
  cols 0-3 walk cycle, col 4 attack lunge, col 5 attack follow-through,
  col 6 hurt/stagger, col 7 death (fallen).

Direction rows, measured by eye from enlarged cells + attack thrusts:
  source row 2 -> down  (front view, face visible)
  source row 7 -> left  (pure side profile, spear horizontal left -- mirror of right)
  source row 4 -> right (pure side profile, spear horizontal right, thrust right)
  source row 6 -> up    (full back view)
Diagonals (rows 0, 1, 3, 5) are NOT shipped: the game faces monsters in 4
directions and falls back to down for diagonal cameras -- the same rule the
knight strips follow (BUILD 962).

Output grid (existing convention, no renderer changes): 8 cols x 5 rows of
64px cells (512x320). Rows 0-3 = down/left/right/up; cols 0-1 idle, 2-5 walk,
6-7 attack; row 4 = hurt (cols 0-1) + death (cols 2-5).
  idle   = source cols [0, 2] (both standing poses -- calmer than stepping frames)
  walk   = source cols [0, 1, 2, 3] (the walk cycle)
  attack = source cols [4, 5] (lunge + follow-through)
  hurt   = source col 6 twice (the sheet has exactly one stagger pose; duplicated
           so the 2-frame hurt anim holds the stagger -- no invented pose)
  death  = source cols [6, 7, 7, 7] (stagger -> fallen -> fallen -> fallen)
Hurt/death use the DOWN direction's poses (most readable; the existing row-4
convention is directionless).

Re-anchoring: source figures sit centered in their 256px cells with empty
space below; the game's sheets put feet at the cell bottom (verified on the
BUILD 964 generated sheets). Each output cell is built by cropping the source
cell to its alpha bbox, scaling by min(baseScale, 62/bboxW, 62/bboxH), and
pasting so the bbox bottom lands at y=62 and the bbox center-x at x=32.
baseScale per kind matches the BUILD 964 sheet's standing figure height
in-cell (measured 2026-10-22 on public/mobs/<kind>_sheet.png idle cell 0,0):
goblin 54, skeleton 63, slime 26, ogre 50 (troll_sheet, which ogre's def
reused). The per-cell fit cap only shrinks extreme poses (wide death fall,
high sword raise) -- the standing figure keeps its current on-screen size.

Outputs (the paths the game already reads -- defs + generated CSS reference
/mobs/<kind>_sheet.png, so no renderer changes are needed):
  public/mobs/goblin_sheet.png, skeleton_sheet.png, slime_sheet.png
  (overwrite the generated placeholders),
  public/mobs/ogre_sheet.png (new; ogre.json's spriteSheet moves from
  troll_sheet.png to it -- troll keeps troll_sheet.png).
Unmapped (no game kind exists -- shipped nowhere, never faked onto another
kind): elemental, magician, werewolf, zombie.

Run: python3 scripts/make-monster-sheets.py
"""
import os
import sys
import zipfile

from PIL import Image

ZIP_PATH = os.path.expanduser("~/workspace/user/files/characters.zip")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "mobs")
SRC_CELL = 256
OUT_CELL = 64
# Output row order [down, left, right, up] -> source rows.
SOURCE_ROWS = [2, 7, 4, 6]
# (kind, source png, base scale) -- base scale = BUILD 964 standing in-cell
# height / source standing bbox height (goblin 54/68, skeleton 63/107,
# slime 26/35, ogre 50/158).
KINDS = {
    "goblin": ("goblin.png", 54 / 68),
    "skeleton": ("skeleton.png", 63 / 107),
    "slime": ("slime.png", 26 / 35),
    "ogre": ("ogre.png", 50 / 158),
}
# Output (col, row) -> (source col, source row) for every grid cell.
# Rows 0-3: facing rows. Row 4: hurt/death from the DOWN row's poses.
CELL_MAP = {}
for out_row, src_row in enumerate(SOURCE_ROWS):
    CELL_MAP.update({
        (0, out_row): (0, src_row),
        (1, out_row): (2, src_row),
        (2, out_row): (0, src_row),
        (3, out_row): (1, src_row),
        (4, out_row): (2, src_row),
        (5, out_row): (3, src_row),
        (6, out_row): (4, src_row),
        (7, out_row): (5, src_row),
    })
DOWN = SOURCE_ROWS[0]
CELL_MAP.update({
    (0, 4): (6, DOWN),
    (1, 4): (6, DOWN),
    (2, 4): (6, DOWN),
    (3, 4): (7, DOWN),
    (4, 4): (7, DOWN),
    (5, 4): (7, DOWN),
    (6, 4): (7, DOWN),
    (7, 4): (7, DOWN),
})


def cell_bbox(im):
    """Alpha bbox of a 256px source cell, or None if empty."""
    alpha = im.split()[3]
    return alpha.getbbox()


def build_sheet(src_im, base_scale):
    sheet = Image.new("RGBA", (8 * OUT_CELL, 5 * OUT_CELL), (0, 0, 0, 0))
    for (oc, orow), (sc, srow) in sorted(CELL_MAP.items()):
        cell = src_im.crop(
            (sc * SRC_CELL, srow * SRC_CELL,
             (sc + 1) * SRC_CELL, (srow + 1) * SRC_CELL)
        )
        box = cell_bbox(cell)
        if box is None:
            raise SystemExit(f"empty source cell col={sc} row={srow}")
        cropped = cell.crop(box)
        bw, bh = cropped.size
        scale = min(base_scale, 62 / bw, 62 / bh)
        w, h = max(1, round(bw * scale)), max(1, round(bh * scale))
        resized = cropped.resize((w, h), Image.LANCZOS)
        # Feet at y=62 (bottom margin 2px), horizontally centered at x=32.
        left = 32 - w // 2 + oc * OUT_CELL
        top = 62 - h + 1 + orow * OUT_CELL
        sheet.paste(resized, (left, top), resized)
    return sheet


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    with zipfile.ZipFile(ZIP_PATH) as zf:
        for kind, (png, base_scale) in sorted(KINDS.items()):
            with zf.open(png) as fh:
                src = Image.open(fh)
                src.load()
            sheet = build_sheet(src, base_scale)
            out = os.path.join(OUT_DIR, f"{kind}_sheet.png")
            sheet.save(out, optimize=True)
            print(f"{kind}: {out} {sheet.size} {os.path.getsize(out)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
