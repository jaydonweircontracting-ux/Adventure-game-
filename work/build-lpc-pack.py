#!/usr/bin/env python3
"""Build the chibi LPC character asset pack for the adventure game.

Extracts the child-body paper-doll layers from the Universal LPC
Spritesheet Character Generator asset library, generates 5 skin-tone
variants of the body via palette remap, and writes a clean public/lpc/
pack the game's character system consumes.

Input : the generator zip the user supplied
Output: <repo>/public/lpc/*.png
"""
import os, sys, zipfile
from PIL import Image

REPO = os.path.expanduser('~/workspace/adventure-game')
ZIP = os.path.expanduser('~/workspace/user/files/10075CFA-3E5C-4128-B240-F584D266816A-Universal-LPC-Spritesheet-Character-Generator-master.zip')
ROOT = 'Universal-LPC-Spritesheet-Character-Generator-master/'
OUT = os.path.join(REPO, 'public', 'lpc')
os.makedirs(OUT, exist_ok=True)

# Base body palette (ivory) -> target tones (from palette_definitions/body/body_lpcr.json)
BASE = ['#271920', '#99423c', '#cc8665', '#e4a47c', '#f9d5ba', '#faece7']
TONES = {
    'ivory':  ['#271920', '#99423c', '#cc8665', '#e4a47c', '#f9d5ba', '#faece7'],
    'tan':    ['#271920', '#6a1d16', '#965b38', '#c07a4b', '#e4a47c', '#edc5a8'],
    'tawny':  ['#271920', '#6a1d16', '#7f4c31', '#ae6b3f', '#d38b59', '#e4a47c'],
    'bronze': ['#000000', '#3e111a', '#442725', '#603429', '#7f4c31', '#965b38'],
    'brown':  ['#000000', '#1a1213', '#2e1f1c', '#442725', '#6b3c2e', '#7f4c31'],
}
BODY_ANIMS = ['walk', 'idle', 'slash', 'hurt']
SHIRT_COLORS = ['black', 'blue', 'brown', 'gray', 'green', 'lavender', 'lightblue', 'pink']
PANTS_COLORS = ['black', 'blue', 'brown', 'darkblue', 'green', 'lightblue', 'maroon', 'red', 'white']
HAIR_STYLES = ['messy', 'braid']
HAIR_COLORS = ['black', 'brown', 'blonde', 'red', 'whiteblonde']
HATS = ['hairtie', 'thick']

def hx(s): return (int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16))

def recolor_body(im, target):
    """Remap exact base-palette RGBs to the target tone (alpha-safe)."""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    mapping = {hx(b): hx(t) for b, t in zip(BASE, target)}
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 10 and (r, g, b) in mapping:
                nr, ng, nb = mapping[(r, g, b)]
                px[x, y] = (nr, ng, nb, a)
    return im

def main():
    z = zipfile.ZipFile(ZIP)
    written = []

    def save(im, name):
        p = os.path.join(OUT, name)
        im.save(p)
        written.append((name, os.path.getsize(p)))

    # 1. Body: 5 tones x 4 animations (recolored)
    for anim in BODY_ANIMS:
        src = ROOT + f'spritesheets/body/bodies/child/{anim}.png'
        base_im = Image.open(z.open(src))
        print(f'body {anim}: {base_im.size} mode={base_im.mode}')
        for tone, target in TONES.items():
            save(recolor_body(base_im, target), f'body-{tone}-{anim}.png')

    # 2. Shirts / pants (walk only)
    for color in SHIRT_COLORS:
        src = ROOT + f'spritesheets/torso/clothes/shirt/child/walk/{color}.png'
        im = Image.open(z.open(src)); print('shirt', color, im.size)
        save(im, f'shirt-{color}-walk.png')
    for color in PANTS_COLORS:
        src = ROOT + f'spritesheets/legs/pants/child/walk/{color}.png'
        im = Image.open(z.open(src)); print('pants', color, im.size)
        save(im, f'pants-{color}-walk.png')

    # 3. Hair (full classic sheets; engine uses walk/slash/hurt rows)
    for style in HAIR_STYLES:
        for color in HAIR_COLORS:
            src = ROOT + f'spritesheets/hair/{style}/child/{color}.png'
            im = Image.open(z.open(src)); print('hair', style, color, im.size)
            save(im, f'hair-{style}-{color}.png')

    # 4. Hats (headbands, walk only)
    for hat in HATS:
        src = ROOT + f'spritesheets/hat/headband/{hat}/child/walk.png'
        im = Image.open(z.open(src)); print('hat', hat, im.size)
        save(im, f'hat-{hat}-walk.png')

    total = sum(s for _, s in written)
    print(f'\nwrote {len(written)} files, {total/1024:.0f} KB total -> {OUT}')

if __name__ == '__main__':
    main()
