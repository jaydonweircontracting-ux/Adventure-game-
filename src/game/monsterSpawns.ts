/**
 * Data-driven spawn specs for the sprite-sheet monsters.
 *
 * monstersForChunk() in App.tsx keeps its existing hand-written rules for the
 * legacy kinds and additionally iterates this table. Everything here is
 * deterministic per chunk (no Math.random), matching the existing spawn code.
 */
export interface MonsterSpawnSpec {
  kind: string;
  biomes: string[];
  minDanger: number;
  /** count = packBase + (abs(chunk.x * seedMulX + chunk.y * seedMulY) % packVar) */
  packBase: number;
  packVar: number;
  hpMult: number;
  seedSalt: number;
  seedMulX: number;
  seedMulY: number;
  /** Variants cycled deterministically by spawn seed. */
  variants: string[];
  /** Optional elite variant for high-danger chunks (1 in 3 spawns). */
  eliteVariant?: { minDanger: number; variant: string };
}

export const MONSTER_SPAWN_TABLE: MonsterSpawnSpec[] = [
  {
    kind: 'wolf', biomes: ['forest', 'meadow'], minDanger: 1,
    packBase: 2, packVar: 2, hpMult: 0.9, seedSalt: 14000, seedMulX: 19, seedMulY: 29,
    variants: ['default', 'default', 'black'],
    eliteVariant: { minDanger: 3, variant: 'dire' },
  },
  {
    kind: 'slime', biomes: ['meadow', 'forest'], minDanger: 1,
    packBase: 1, packVar: 2, hpMult: 0.6, seedSalt: 15000, seedMulX: 23, seedMulY: 31,
    variants: ['default'],
  },
  {
    kind: 'bat', biomes: ['rock'], minDanger: 1,
    packBase: 2, packVar: 2, hpMult: 0.5, seedSalt: 16000, seedMulX: 29, seedMulY: 37,
    variants: ['default'],
  },
  {
    kind: 'rat', biomes: ['meadow', 'forest'], minDanger: 1,
    packBase: 2, packVar: 3, hpMult: 0.4, seedSalt: 17000, seedMulX: 31, seedMulY: 41,
    variants: ['default'],
  },
];
