# 3D Characters and NPCs

This folder is the destination for web-ready character models and supporting materials for the separate Adventure 3D mode.

## Character pack supplied for this project

The uploaded `Modular Character Outfits - Fantasy[Standard].zip` includes glTF exports for:

- `Male_Peasant`
- `Female_Peasant`
- `Male_Ranger`
- `Female_Ranger`

It also includes modular body parts, peasant/ranger textures, and FBX exports. The glTF models depend on companion `.bin` geometry buffers and texture images, so those companion files must stay alongside each model when importing it.

## Runtime status

The current 3D view uses a custom WebGL renderer. The player and NPCs now render from the game's existing animated RPG sprite sets (including multiple body types and eight camera-facing directions), rather than the blue NPC placeholder cubes. This keeps the current 3D mode working without introducing a new rendering dependency.

The supplied modular glTF models are catalogued here but have **not yet been copied into this repository or bound to the runtime**. The source archive is much larger than a text-only GitHub file update; add the glTF files together with their referenced `.bin` and texture assets when committing the model binaries. Do not rename or omit dependent files.

## Suggested runtime model mapping

- Player default: Male Peasant
- Civilian NPCs: Male/Female Peasant
- Ranger / archer NPCs: Male/Female Ranger

Keep the existing 2D and 2.5D character rendering unchanged while the separate 3D renderer is developed.
