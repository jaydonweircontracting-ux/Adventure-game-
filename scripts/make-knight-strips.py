#!/usr/bin/env python3
"""BUILD 962: slice the 2D HD Character Knight sheets into game strips.

Source: ~/workspace/user/files/228BAA33-F2A1-4FE1-9947-F253169A2FC7-2D HD Character Knight.zip
(each sheet 1920x1024 = 15 cols x 8 rows of 128px cells, one direction per
row, one animation frame per column, "With shadows" only, NO license file).

Output: public/sprites/knight/knight-{idle,walk,attack,hurt,death}.png,
each 15 cols x 4 rows of 64px cells (960x256). Strip rows are
[down, left, right, up] = source rows [1, 2, 6, 5] (measured by eye from
enlarged Idle/Walk frames; diagonals are not shipped — the game faces
monsters in 4 directions and falls back to down for diagonal cameras,
exactly like the monster-sheet convention).

Run: python3 scripts/make-knight-strips.py
"""
import os
import sys
import zipfile

from PIL import Image

ZIP_PATH = os.path.expanduser(
    "~/workspace/user/files/228BAA33-F2A1-4FE1-9947-F253169A2FC7-2D HD Character Knight.zip"
)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "sprites", "knight")
CELL = 128
OUT_CELL = 64
# strip row order [down, left, right, up] -> source rows
SOURCE_ROWS = [1, 2, 6, 5]
ANIMS = {
    "idle": "Idle.png",
    "walk": "Walk.png",
    "attack": "Melee.png",
    "hurt": "TakeDamage.png",
    "death": "Die.png",
}
PREFIX = "2D HD Character Knight/Spritesheets/With shadows/"


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    with zipfile.ZipFile(ZIP_PATH) as zf:
        for anim, sheet in ANIMS.items():
            with zf.open(PREFIX + sheet) as fh:
                im = Image.open(fh)
                im.load()
            strip = Image.new("RGBA", (15 * OUT_CELL, 4 * OUT_CELL), (0, 0, 0, 0))
            for strip_row, src_row in enumerate(SOURCE_ROWS):
                for col in range(15):
                    cell = im.crop(
                        (col * CELL, src_row * CELL, (col + 1) * CELL, (src_row + 1) * CELL)
                    ).resize((OUT_CELL, OUT_CELL), Image.LANCZOS)
                    strip.paste(cell, (col * OUT_CELL, strip_row * OUT_CELL))
            out = os.path.join(OUT_DIR, f"knight-{anim}.png")
            strip.save(out, optimize=True)
            print(f"{anim}: {out} {strip.size} {os.path.getsize(out)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
