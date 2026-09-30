#!/usr/bin/env python3
"""Assemble generated monster sprite strips into game-ready sheets.

Input:  work/monster-strips/<kind>_sheet source PNG (5 rows x 8 cols grid,
        white background) as produced by the image generator.
Output: public/mobs/<kind>_sheet.png — 512x320, 8 cols x 5 rows of 64px
        cells, transparency keyed from the background.

Row layout (0-based):
  0..3  facings down/left/right/up: cols 0-1 idle, 2-5 walk, 6-7 attack
  4     hurt (cols 0-1) + death (cols 2-5)
"""
import sys
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
STRIPS = REPO / 'work' / 'monster-strips'
OUT = REPO / 'public' / 'mobs'

CELL = 64
COLS, ROWS = 8, 5
WHITE_T = 235  # min(r,g,b) above this counts as background


def key_out_background(cell: Image.Image) -> Image.Image:
    """Flood-fill near-white from the cell borders -> transparent.

    Interior whites (eyes, fangs) are preserved because the fill only
    spreads through background pixels connected to an edge.
    """
    cell = cell.convert('RGBA')
    w, h = cell.size
    px = cell.load()
    bg = bytearray(w * h)  # 1 = background-connected
    stack = []
    for x in range(w):
        stack += [(x, 0), (x, h - 1)]
    for y in range(h):
        stack += [(0, y), (w - 1, y)]
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if bg[i]:
            continue
        r, g, b, _a = px[x, y]
        if min(r, g, b) < WHITE_T:
            continue
        bg[i] = 1
        if x > 0: stack.append((x - 1, y))
        if x < w - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < h - 1: stack.append((x, y + 1))
    for y in range(h):
        for x in range(w):
            if bg[y * w + x]:
                px[x, y] = (0, 0, 0, 0)
    return cell


def assemble(kind: str, src_name: str | None = None) -> Path:
    src = STRIPS / (src_name or f'media-generation-{kind}-sheet-0-*.png')
    matches = sorted(STRIPS.glob(src.name)) if '*' in src.name else [src]
    if not matches:
        raise SystemExit(f'no source strip for {kind}')
    src = matches[0]
    im = Image.open(src).convert('RGB')
    w, h = im.size
    cw, ch = w / COLS, h / ROWS
    sheet = Image.new('RGBA', (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            cell = im.crop((int(col * cw), int(row * ch), int((col + 1) * cw), int((row + 1) * ch)))
            cell = key_out_background(cell)
            cell = cell.resize((CELL, CELL), Image.NEAREST)
            sheet.paste(cell, (col * CELL, row * CELL), cell)
    out = OUT / f'{kind}_sheet.png'
    sheet.save(out)
    print(f'{kind}: {src.name} ({w}x{h}) -> {out} ({sheet.size[0]}x{sheet.size[1]})')
    return out


if __name__ == '__main__':
    for kind in sys.argv[1:]:
        assemble(kind)
