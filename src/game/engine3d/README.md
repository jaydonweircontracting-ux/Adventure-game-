# Independent 3D Engine

This folder is isolated from the existing 2D and isometric 2.5D renderers.

- `engine3d.ts`: shared mode and renderer contracts.
- `Engine3DView.tsx`: standalone WebGL perspective-rendered test scene with WASD movement and orbit/zoom controls.
- `GraphicsModeSelector.tsx`: reusable mode selector that persists the selected preference.

## Integration status
The prototype renderer and selector are foundations, not yet wired into the app's authoritative renderer switch or Debug menu. Do not claim the whole game is playable in 3D until App.tsx owns the mode transition and adapters connect world state, collisions, NPCs, combat, inventory, and saves. Keep 3D lazy-loaded and preserve 2D/2.5D as independent paths.
