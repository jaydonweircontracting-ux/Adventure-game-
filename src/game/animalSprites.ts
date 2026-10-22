/**
 * Rendered-pack animal sprites (BUILD 952).
 *
 * The CraftPix free wild-animals pack ships 3D FBX models only — no 2D
 * sprites. Each model was rendered once to a PNG (three.js FBXLoader +
 * local headless Chromium, pack atlas texture, 3/4 side view, mirrored to
 * face right, trimmed so the image bottom is the feet) and ships in
 * public/sprites/animal-sprites/. No raw FBX ships (license forbids
 * redistributing the source files).
 *
 * Paths are public/ subpaths WITHOUT a leading slash, matching the
 * artUrl/assetUrl convention used by critter strips and kit sheets.
 * Deer has two renders: deer_1 (stag, antlers) and deer_2 (doe); the
 * variant follows the animal id, the same parity trick the 2D wolf
 * sheets use for their gray/brown/black variants.
 */

export function animalSpriteFor(species: string, id: number): string | null {
  switch (species) {
    case 'bear': return 'sprites/animal-sprites/bear.png';
    case 'boar': return 'sprites/animal-sprites/boar.png';
    case 'deer':
      return Math.abs(id) % 2 === 0
        ? 'sprites/animal-sprites/deer_1.png'
        : 'sprites/animal-sprites/deer_2.png';
    case 'fox': return 'sprites/animal-sprites/fox.png';
    case 'wolf': return 'sprites/animal-sprites/wolf.png';
    case 'rabbit': return 'sprites/animal-sprites/rabbit.png';
    case 'owl': return 'sprites/animal-sprites/owl.png';
    case 'squirrel': return 'sprites/animal-sprites/squirrel.png';
    case 'hedgehog': return 'sprites/animal-sprites/hedgehog.png';
    // Crab has no pack art; it keeps its kit sheet. Anything else has no
    // render and therefore no sprite (callers skip it).
    default: return null;
  }
}

/**
 * Species whose 2D DOM art uses the rendered PNG (class wildlife-animal).
 * Fox/boar keep their working animated kit sheets in 2D and wolf keeps its
 * animated sheets; all three still use renders in the iso view, where
 * wildlife previously had no art at all. Crab is in neither set.
 */
export const ANIMAL_2D_SPECIES: ReadonlySet<string> = new Set([
  'deer', 'bear', 'rabbit', 'owl', 'squirrel', 'hedgehog',
]);

/**
 * Iso draw height in world units (critters draw at a fixed 36). The image
 * is drawn feet-anchored with this height; width follows the PNG aspect.
 */
export const ANIMAL_DISPLAY_SIZE: Record<string, number> = {
  bear: 46,
  wolf: 38,
  deer: 38,
  boar: 36,
  fox: 32,
  owl: 28,
  rabbit: 26,
  squirrel: 22,
  hedgehog: 20,
};
