#!/usr/bin/env python3
"""Write src/game/monsterSprites/<kind>.json sprite definitions.

Single source of truth for the monster sprite system. The CSS generator
(scripts/gen-monster-sprite-css.mjs) and sim tests read these files.
Grid convention (all sheets): 8 cols x 5 rows of 64px cells.
  rows 0-3: facings down/left/right/up — cols 0-1 idle, 2-5 walk, 6-7 attack
  row 4:    cols 0-1 hurt, cols 2-5 death
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / 'src' / 'game' / 'monsterSprites'
OUT.mkdir(parents=True, exist_ok=True)

ANIMS = {
    "idle":   {"row": "facing", "startCol": 0, "frames": 2, "frameMs": 450},
    "walk":   {"row": "facing", "startCol": 2, "frames": 4, "frameMs": 140},
    "attack": {"row": "facing", "startCol": 6, "frames": 2, "frameMs": 110},
    "hurt":   {"row": 4, "startCol": 0, "frames": 2, "frameMs": 120},
    "death":  {"row": 4, "startCol": 2, "frames": 4, "frameMs": 130},
}

# kind: (displaySize, shadowDx, shadowDy, shadowAlpha, variants, biomes, minDanger)
KINDS = {
    "rat":      (26, 2, 2, 0.22, {"default": {}}, ["meadow", "forest"], 1),
    "bat":      (30, 3, 7, 0.16, {"default": {}}, ["rock"], 1),
    "slime":    (30, 2, 3, 0.25, {"default": {}}, ["meadow", "forest"], 1),
    "spider":   (34, 2, 3, 0.25, {"default": {}}, ["forest"], 2),
    "wolf":     (44, 2, 3, 0.25, {"default": {},
                                 "black": {"filter": "brightness(0.55) saturate(0.8)"},
                                 "dire": {"filter": "brightness(0.5) saturate(0.7)", "scale": 1.3}}, ["forest", "meadow"], 1),
    "goblin":   (36, 2, 3, 0.25, {"default": {},
                                 "warrior": {"filter": "saturate(1.35) brightness(0.9)"},
                                 "shaman": {"filter": "hue-rotate(50deg) saturate(1.25)"}}, ["forest"], 2),
    "skeleton": (38, 2, 3, 0.25, {"default": {},
                                 "warrior": {"filter": "saturate(1.3) brightness(0.92)"},
                                 "mage": {"filter": "hue-rotate(170deg) brightness(1.05) saturate(1.3)"}}, ["rock", "desert"], 2),
    "orc":      (48, 2, 4, 0.28, {"default": {}}, ["forest", "rock", "tundra", "meadow"], 2),
    "troll":    (78, 4, 6, 0.3,  {"default": {}}, ["forest", "rock", "tundra"], 3),
}

for kind, (size, dx, dy, alpha, variants, biomes, danger) in KINDS.items():
    definition = {
        "id": kind,
        "spriteSheet": f"/mobs/{kind}_sheet.png",
        "cell": 64,
        "cols": 8,
        "rows": 5,
        "facingRows": {"down": 0, "left": 1, "right": 2, "up": 3},
        "animations": ANIMS,
        "displaySize": size,
        "anchor": {"x": 0.5, "y": 0.6},
        "shadow": {"dx": dx, "dy": dy, "alpha": alpha},
        "collision": {"w": round(size / 46, 2), "h": round(size / 46, 2)},
        "variants": variants,
        "biomes": biomes,
        "minDanger": danger,
    }
    (OUT / f"{kind}.json").write_text(json.dumps(definition, indent=2) + "\n")
    print("wrote", kind)
