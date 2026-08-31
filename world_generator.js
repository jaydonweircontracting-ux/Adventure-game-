const CHUNK_SIZE = 16;

function createPRNG(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chunkSeed(chunkX, chunkY) {
  return (Math.imul(chunkX, 73856093) ^ Math.imul(chunkY, 19349663)) >>> 0;
}

/**
 * Generate one deterministic world chunk without retaining blank-world data.
 * tiles are addressed as tiles[y][x]: 0 grass, 1 cobblestone, 2 corrupted ground.
 */
function generateChunk(chunkX, chunkY) {
  const x = Math.trunc(chunkX);
  const y = Math.trunc(chunkY);
  const rand = createPRNG(chunkSeed(x, y));
  const tiles = Array.from({ length: CHUNK_SIZE }, () => Array(CHUNK_SIZE).fill(0));
  const structures = [];
  const roll = rand();
  let chunkType = 'wilderness';

  if (x === 0 && y === 0) {
    chunkType = 'town_center';
  } else if (roll < 0.15) {
    chunkType = 'town_outpost';
  } else if (roll > 0.88) {
    chunkType = 'dungeon_entrance';
  }

  if (chunkType === 'town_center') {
    for (let row = 4; row < 12; row += 1) {
      for (let column = 4; column < 12; column += 1) tiles[row][column] = 1;
    }
    structures.push({
      name: 'Town Hall', type: 'building', doorX: 8, doorY: 5,
      bounds: { minX: 6, maxX: 10, minY: 2, maxY: 5 },
    });
    structures.push({
      name: 'Global Item Shop', type: 'building', doorX: 5, doorY: 9,
      bounds: { minX: 2, maxX: 5, minY: 7, maxY: 10 },
    });
  } else if (chunkType === 'town_outpost') {
    structures.push({
      name: 'Guard Outpost', type: 'building', doorX: 9, doorY: 10,
      bounds: { minX: 6, maxX: 11, minY: 6, maxY: 10 },
    });
  } else if (chunkType === 'dungeon_entrance') {
    for (let row = 5; row < 11; row += 1) {
      for (let column = 5; column < 11; column += 1) tiles[row][column] = 2;
    }
    structures.push({
      name: 'Forgotten Crypt Entrance', type: 'dungeon', doorX: 8, doorY: 8,
      bounds: { minX: 7, maxX: 9, minY: 7, maxY: 9 },
    });
  }

  return { chunkX: x, chunkY: y, chunkType, tiles, structures };
}

export { CHUNK_SIZE, createPRNG, generateChunk };
