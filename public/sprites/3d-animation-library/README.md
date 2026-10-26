# Universal Animation Library 2

Source archive supplied for Adventure's separate 3D mode: `Universal Animation Library 2[Standard].zip`.

## Included web-ready exports

- `Unreal-Godot/UAL2_Standard.glb` — 8.09 MB; 43 named animation clips; root motion disabled.
- `Unreal-Godot/UAL2_Standard_RM.glb` — 8.10 MB; root motion baked into the clips.
- `Female Mannequin/Unreal-Godot/Mannequin_F.glb` — 1.44 MB; matching female mannequin rig, intended to be retargeted to the library animations.
- Unity FBX exports and Blender source are also in the archive.

The exact clip names parsed from `UAL2_Standard.glb` are recorded in `animation-catalog.json`.

## Useful animation groups

- Movement / traversal: `ClimbUp_1m`, `NinjaJump_Start`, `NinjaJump_Idle_Loop`, `NinjaJump_Land`, `Slide_Start`, `Slide_Loop`, `Slide_Exit`, `Walk_Carry_Loop`
- Melee: `Melee_Hook`, `Melee_Hook_Rec`, `Sword_Regular_A`, `Sword_Regular_A_Rec`, `Sword_Regular_B`, `Sword_Regular_B_Rec`, `Sword_Regular_C`, `Sword_Regular_Combo`, `Sword_Heavy_Combo`, `Sword_Block`, `Sword_Dash`, `Shield_Dash`, `Shield_OneShot`
- World interactions: `Chest_Open`, `Consume`, `Farm_Harvest`, `Farm_PlantSeed`, `Farm_Watering`, `TreeChopping_Loop`
- Reactions / social / idle: `Hit_Knockback`, `LayToIdle`, `Yes`, `Idle_No_Loop`, `Idle_FoldArms_Loop`, `Idle_Lantern_Loop`, `Idle_Rail_Call`, `Idle_Rail_Loop`
- Zombie: `Zombie_Idle_Loop`, `Zombie_Walk_Fwd_Loop`, `Zombie_Scratch`

## Runtime status — important

This is an asset inventory, not a claim that the animation pack is already playing in-game. Adventure's current 3D view is a custom WebGL renderer that draws the existing RPG sprite sets; it does not yet load GLB skeletal meshes or play their animation tracks. To use these clips in the live 3D mode, the next code milestone is to add a GLB/skinned-mesh animation runtime, import the GLB files and dependencies into this folder, then map game states (walk, attack, block, harvest, loot, zombie) to these clip names. Until that loader and the actual binary assets are integrated, existing sprite-based gameplay remains active.

## License

The supplied archive states **CC0 1.0 Universal**. Keep the included license/attribution notes with the source archive and verify any redistribution packaging remains consistent with the archive.
