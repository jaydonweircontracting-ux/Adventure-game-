#!/usr/bin/env python3
"""BUILD 966: slice character art into the game's 8x5 monster-sheet grid.

CORRECTION (measured 2026-10-22, stated plainly): the "Heavy HQ
x256_Spritesheets" pack is NOT a heavy-armored human character, despite its
name and the queue record. Every animation folder (Idle/Walk/Attack/Hit/Death)
renders the same orange eight-legged spider, viewed from a high angle, with
16 angle files per animation (each 1024x1024 = 4x4 grid of 256px frames).
The three uploaded copies are byte-identical (md5 31e48c02...). It therefore
reskins the in-game SPIDER kind (whose generated sheet it replaces) -- it
cannot serve the soldier slot, and no human is faked from it.

The characters.zip male sheets ARE modular: male_base/male_heavy/male_light/
male_unarmored are full bodies, while male_longsword/male_shield/male_longbow/
male_staff are weapon-only overlays in the identical pose grid (a longsword
cell holds ~100 opaque px: blade + hand, no body). Compositing body + weapon
at slice time is the pack's intended use (verified: heavy + longsword aligns
the blade into the hand exactly). Soldier and bandit are currently
legacy blob renders in iso (LEGACY_KINDS); promoting them to sheets gives
them real figures with zero renderer changes.

Direction rows, same family as BUILD 965 (verified on the heavy body:
row 2 = front view):
  characters source row 2 -> down, row 7 -> left, row 4 -> right, row 6 -> up
HQ spider angles, verified from Idle frames (0 = fangs-forward front,
180 = back, 090 = head-right, 270 = head-left):
  angle 0 -> down, 270 -> left, 090 -> right, 180 -> up
Diagonals are NOT shipped: the game faces monsters in 4 directions and falls
back to down for diagonal cameras (knight/monster convention).

Output grid (existing convention, no renderer changes): 8 cols x 5 rows of
64px cells (512x320). Rows 0-3 = down/left/right/up; cols 0-1 idle, 2-5 walk,
6-7 attack; row 4 = hurt (cols 0-1) + death (cols 2-5), cols 6-7 filler.
  soldier = heavy body + longsword, bandit = light body + longsword
    (ranged bandits keep the sword sheet -- one sheet per kind, same
    limitation as every other kind; most bandits are melee)
  idle   = source cols [0, 2], walk = [0, 1, 2, 3], attack = [4, 5],
  hurt   = source col 6 twice, death = [6, 7, 7, 7] (965 cell map, reused)
  spider idle = Idle frames [0, 8], walk = Walk [0, 4, 8, 12],
  attack = Attack1 [8, 10] (stance -> high rear strike, viewed),
  hurt = Hit1 [0, 6], death = Death1 [0, 5, 10, 15] (standing -> on back,
  legs curled -- viewed; Death1 ends on its back)
Re-anchoring (965 pattern): crop to alpha bbox, scale by
min(base_scale, 62/bboxW, 62/bboxH), paste bbox bottom at y=62, center-x 32.
Soldier/bandit base scale 63/107 matches the skeleton's in-cell standing
height (human-sized, displaySize 40). Spider fits the 62 box, matching the
old generated spider sheet's 60x48 idle bbox.

Outputs (paths the game already reads):
  public/mobs/soldier_sheet.png, bandit_sheet.png (new; defs added, kinds
  leave LEGACY_KINDS), spider_sheet.png (overwrite; spider.json unchanged).
No separate public/sprites/character-sprites/ folder: the monster-sheet
paths ARE the character-sprite location for these kinds -- a second folder
would need renderer changes for zero benefit.
Unshipped, stated: male_base, male_unarmored (bodies with no kind to serve
-- soldier takes heavy, bandit takes light), male_shield (not composited;
soldier reads cleanly with sword alone, and the knight already covers
sword+shield), male_longbow, male_staff (no archer/wizard kinds exist --
BUILD 962), elemental/magician/werewolf/zombie (already unmapped, BUILD 965).
Player + NPCs stay on the RPG pack (BUILD 702): these flat sheets lack
Idle/Bow/Cast/Run and are not the layered system -- no replacement claimed.
Elf/dwarf sheets still do not exist (invisible in iso -- pre-existing,
BUILD 965 note stands).

Run: python3 scripts/make-character-sheets.py
"""
import os
import sys
import zipfile

from PIL import Image

CHARS_ZIP = os.path.expanduser("~/workspace/user/files/characters.zip")
HQ_ZIP = os.path.expanduser(
    "~/workspace/user/files/9098DDF1-5240-4AF2-B65A-79791B8785E1-"
    "(Heavy HQ) x256_Spritesheets.zip"
)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "mobs")
SRC_CELL = 256
OUT_CELL = 64
# Output row order [down, left, right, up] -> characters source rows.
SOURCE_ROWS = [2, 7, 4, 6]
# Output row order [down, left, right, up] -> HQ spider angles.
SPIDER_ANGLES = ["0", "270", "090", "180"]

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


def paste_cell(sheet, cell_im, oc, orow, base_scale, threshold=0):
    """Crop cell_im to its alpha bbox, fit in 62px, feet at y=62, centered.
    threshold: HQ strips carry a faint full-cell haze (alpha 1-8 over ~32k px
    per frame) that would otherwise shrink the visible spider to ~28px --
    the game itself thresholds at 8 (anchorFromAlpha), so spider cells use 8.
    Composite cells keep threshold 0 (BUILD 965 parity, clean alpha)."""
    alpha = cell_im.split()[3]
    if threshold:
        alpha = alpha.point(lambda v: 255 if v > threshold else 0)
    box = alpha.getbbox()
    if box is None:
        raise SystemExit(f"empty source cell col={oc} row={orow}")
    cropped = cell_im.crop(box)
    bw, bh = cropped.size
    scale = min(base_scale, 62 / bw, 62 / bh)
    w, h = max(1, round(bw * scale)), max(1, round(bh * scale))
    resized = cropped.resize((w, h), Image.LANCZOS)
    left = 32 - w // 2 + oc * OUT_CELL
    top = 62 - h + 1 + orow * OUT_CELL
    sheet.paste(resized, (left, top), resized)


def build_composite_sheet(body_im, weapon_im, base_scale):
    sheet = Image.new("RGBA", (8 * OUT_CELL, 5 * OUT_CELL), (0, 0, 0, 0))
    for (oc, orow), (sc, srow) in sorted(CELL_MAP.items()):
        cell = Image.new("RGBA", (SRC_CELL, SRC_CELL), (0, 0, 0, 0))
        cell.alpha_composite(
            body_im.crop((sc * SRC_CELL, srow * SRC_CELL,
                          (sc + 1) * SRC_CELL, (srow + 1) * SRC_CELL)))
        cell.alpha_composite(
            weapon_im.crop((sc * SRC_CELL, srow * SRC_CELL,
                            (sc + 1) * SRC_CELL, (srow + 1) * SRC_CELL)))
        paste_cell(sheet, cell, oc, orow, base_scale)
    return sheet


def hq_frame(strip_im, frame):
    r, c = divmod(frame, 4)
    return strip_im.crop((c * SRC_CELL, r * SRC_CELL,
                          (c + 1) * SRC_CELL, (r + 1) * SRC_CELL))


def build_spider_sheet(strips):
    """strips: {(anim, angle): 1024px strip image}."""
    sheet = Image.new("RGBA", (8 * OUT_CELL, 5 * OUT_CELL), (0, 0, 0, 0))
    # (out_col, out_row) -> (anim, frame, angle_index); angle_index 0 = down.
    plan = {}
    for out_row, angle in enumerate(SPIDER_ANGLES):
        plan.update({
            (0, out_row): ("Idle", 0, angle),
            (1, out_row): ("Idle", 8, angle),
            (2, out_row): ("Walk", 0, angle),
            (3, out_row): ("Walk", 4, angle),
            (4, out_row): ("Walk", 8, angle),
            (5, out_row): ("Walk", 12, angle),
            (6, out_row): ("Attack1", 8, angle),
            (7, out_row): ("Attack1", 10, angle),
        })
    down = SPIDER_ANGLES[0]
    plan.update({
        (0, 4): ("Hit1", 0, down),
        (1, 4): ("Hit1", 6, down),
        (2, 4): ("Death1", 0, down),
        (3, 4): ("Death1", 5, down),
        (4, 4): ("Death1", 10, down),
        (5, 4): ("Death1", 15, down),
        (6, 4): ("Death1", 15, down),
        (7, 4): ("Death1", 15, down),
    })
    for (oc, orow), (anim, frame, angle) in sorted(plan.items()):
        cell = hq_frame(strips[(anim, angle)], frame)
        paste_cell(sheet, cell, oc, orow, 1.0, threshold=8)
    return sheet


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    with zipfile.ZipFile(CHARS_ZIP) as zf:
        def load(name):
            with zf.open(name) as fh:
                im = Image.open(fh)
                im.load()
                return im
        heavy, light, sword = (load("male_heavy.png"),
                               load("male_light.png"),
                               load("male_longsword.png"))
        for kind, body in (("soldier", heavy), ("bandit", light)):
            sheet = build_composite_sheet(body, sword, 63 / 107)
            out = os.path.join(OUT_DIR, f"{kind}_sheet.png")
            sheet.save(out, optimize=True)
            print(f"{kind}: {out} {sheet.size} {os.path.getsize(out)} bytes")
    with zipfile.ZipFile(HQ_ZIP) as zf:
        strips = {}
        for anim in ("Idle", "Walk", "Attack1", "Hit1", "Death1"):
            for angle in SPIDER_ANGLES:
                name = f"x256_Spritesheets/{anim}/{anim}_{angle}.png"
                with zf.open(name) as fh:
                    im = Image.open(fh)
                    im.load()
                    strips[(anim, angle)] = im
        sheet = build_spider_sheet(strips)
        out = os.path.join(OUT_DIR, "spider_sheet.png")
        sheet.save(out, optimize=True)
        print(f"spider: {out} {sheet.size} {os.path.getsize(out)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
