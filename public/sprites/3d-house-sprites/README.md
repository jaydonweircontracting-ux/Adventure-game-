# 3D House Sprites

Dedicated home for the low-poly medieval house pack and related 3D building assets used by Adventure's separate 3D mode.

## Uploaded source pack

`free-medieval-houses-3d-low-poly-pack 2.zip` contains FBX models in Unity, Unreal, and full-house variants, plus a house texture atlas. The current Adventure 3D renderer is a custom WebGL mesh renderer and does not load FBX directly. Keep source models here when converted to a web-ready format (GLB/glTF), then wire those models into `src/game/engine3d/Engine3DWorldView.tsx`.

## Runtime integration

Until a web-ready model loader is added, the 3D world renders authored house geometry in place of the old plain building blocks. House footprints, doors, and collision remain controlled by the existing world layout.

## Asset licensing

Check the uploaded pack's included `License.txt` before redistributing the source models. Do not remove the original license terms.