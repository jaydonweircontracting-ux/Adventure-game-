import fs from 'node:fs';
import path from 'node:path';

const STATE_FILE = path.join(process.cwd(), 'world_state.json');

function emptyState() {
  return { players: {}, customChunkMutations: {} };
}

function loadWorldState(filePath = STATE_FILE) {
  try {
    if (!fs.existsSync(filePath)) return emptyState();
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      players: parsed.players && typeof parsed.players === 'object' ? parsed.players : {},
      customChunkMutations: parsed.customChunkMutations && typeof parsed.customChunkMutations === 'object'
        ? parsed.customChunkMutations
        : {},
    };
  } catch (error) {
    console.warn('World state could not be loaded; starting with an empty state:', error.message);
    return emptyState();
  }
}

function saveWorldState(state, filePath = STATE_FILE) {
  const cleanPlayers = {};
  for (const [id, player] of Object.entries(state.players || {})) {
    cleanPlayers[id] = {
      name: typeof player.name === 'string' ? player.name : id,
      globalX: Number.isFinite(player.globalX) ? player.globalX : 8,
      globalY: Number.isFinite(player.globalY) ? player.globalY : 8,
      inventory: Array.isArray(player.inventory) ? player.inventory : [],
    };
  }

  const payload = {
    players: cleanPlayers,
    customChunkMutations: state.customChunkMutations || {},
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

export { STATE_FILE, loadWorldState, saveWorldState };
