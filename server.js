import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { CHUNK_SIZE, generateChunk } from './world_generator.js';
import { loadWorldState, saveWorldState } from './persistence.js';

const PORT = Number(process.env.PORT || 3000);
const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: 'adventure-world-server' }));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('Adventure infinite world server is active.\n');
});

const wss = new WebSocketServer({ server });
const savedState = loadWorldState();
const runtimeState = {
  players: savedState.players,
  customChunkMutations: savedState.customChunkMutations,
  activeConnections: new Map(),
};
let connectionSequence = 0;

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function sendChunkView(playerId) {
  const player = runtimeState.players[playerId];
  const ws = runtimeState.activeConnections.get(playerId);
  if (!player || !ws || ws.readyState !== WebSocket.OPEN) return;

  const chunkX = Math.floor(player.globalX / CHUNK_SIZE);
  const chunkY = Math.floor(player.globalY / CHUNK_SIZE);
  const localX = ((player.globalX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const localY = ((player.globalY % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;

  send(ws, {
    family: 'MAP_CHUNK',
    action: 'RENDER',
    data: {
      globalX: player.globalX,
      globalY: player.globalY,
      localX,
      localY,
      chunkX,
      chunkY,
      chunkData: generateChunk(chunkX, chunkY),
    },
  });
}

function broadcast(payload, excludeId = null) {
  for (const [id, ws] of runtimeState.activeConnections.entries()) {
    if (id !== excludeId) send(ws, payload);
  }
}

function checkpoint() {
  try {
    saveWorldState(runtimeState);
  } catch (error) {
    console.error('World checkpoint failed:', error.message);
  }
}

const checkpointTimer = setInterval(checkpoint, 10000);
checkpointTimer.unref?.();

wss.on('connection', (ws) => {
  let playerId = null;
  connectionSequence += 1;

  ws.on('message', (raw) => {
    try {
      const packet = JSON.parse(raw.toString());
      const family = packet?.family;
      const action = packet?.action;
      const data = packet?.data || {};

      if (family === 'AUTH' && action === 'JOIN') {
        const requestedName = typeof data.username === 'string' ? data.username.trim() : '';
        const safeName = requestedName.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
        playerId = safeName || 'Hero_' + connectionSequence;
        if (!runtimeState.players[playerId]) {
          runtimeState.players[playerId] = {
            name: playerId,
            globalX: 8,
            globalY: 8,
            inventory: ['Nunchucks'],
          };
        }
        runtimeState.activeConnections.set(playerId, ws);
        sendChunkView(playerId);
        return;
      }

      if (!playerId || !runtimeState.players[playerId]) return;

      if (family === 'MOVE' && action === 'UPDATE') {
        const nextX = Number(data.newGlobalX);
        const nextY = Number(data.newGlobalY);
        if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || Math.abs(nextX) > 1000000000 || Math.abs(nextY) > 1000000000) {
          send(ws, { family: 'ERROR', action: 'INVALID_MOVE', data: { message: 'Coordinates must be finite and bounded.' } });
          return;
        }
        const player = runtimeState.players[playerId];
        player.globalX = nextX;
        player.globalY = nextY;
        sendChunkView(playerId);
        broadcast({ family: 'PLAYER_SYNC', action: 'UPDATE', data: { name: player.name, globalX: nextX, globalY: nextY } }, playerId);
      }
    } catch (error) {
      send(ws, { family: 'ERROR', action: 'INVALID_PACKET', data: { message: 'Packet could not be parsed.' } });
      console.warn('Packet processing failed:', error.message);
    }
  });

  ws.on('close', () => {
    if (playerId && runtimeState.activeConnections.get(playerId) === ws) {
      runtimeState.activeConnections.delete(playerId);
      checkpoint();
    }
  });
});

function shutdown() {
  clearInterval(checkpointTimer);
  checkpoint();
  wss.close(() => server.close(() => process.exit(0)));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log('Adventure infinite world server listening on port ' + PORT);
});
