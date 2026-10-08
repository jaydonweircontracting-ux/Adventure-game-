// Crime and witness system (BUILD 521 — Advanced World Reactivity).
//
// Records player crimes, determines witnesses, and feeds into the existing
// NPC memory system (villageLife.ts) for propagation via gossip.
// Pure module — tested in scripts/simulate.ts.
//
// Flow: CRIME → WITNESSES → MEMORIES → GOSSIP → CONSEQUENCES

export type CrimeType =
  | 'pickpocket'
  | 'theft'
  | 'assault'
  | 'murder'
  | 'trespass'
  | 'vandalism';

export interface CrimeEvent {
  /** Unique ID. */
  id: string;
  type: CrimeType;
  /** Chunk where it happened. */
  chunk: { x: number; y: number };
  /** Position within chunk. */
  position: { x: number; y: number };
  /** Game day. */
  day: number;
  /** Victim NPC ID (if any). */
  victimId?: string;
  /** Severity 1-5 (1=minor, 5=heinous). */
  severity: number;
}

export interface Witness {
  /** NPC ID who witnessed. */
  npcId: string;
  /** Crime ID they witnessed. */
  crimeId: string;
  /** 0-1 confidence (distance, line of sight, etc.). */
  confidence: number;
  /** Whether they've reported it (to guards/faction). */
  reported: boolean;
}

/** Severity by crime type. */
export const CRIME_SEVERITY: Record<CrimeType, number> = {
  pickpocket: 2,
  theft: 2,
  trespass: 1,
  assault: 3,
  vandalism: 2,
  murder: 5,
};

/** Witness radius in field units. */
export const WITNESS_RADIUS = 25;

/**
 * Determine which NPCs witness a crime.
 * Pure: given crime position and NPC positions, returns witnesses with confidence.
 * Confidence decreases with distance.
 */
export function findWitnesses(
  crime: { position: { x: number; y: number } },
  npcs: Array<{ id: string; position: { x: number; y: number } }>,
): Array<{ npcId: string; confidence: number }> {
  const out: Array<{ npcId: string; confidence: number }> = [];
  for (const npc of npcs) {
    const dx = npc.position.x - crime.position.x;
    const dy = npc.position.y - crime.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= WITNESS_RADIUS) {
      // Confidence: 1.0 at 0 distance, 0.3 at max radius.
      const confidence = Math.max(0.3, 1 - (dist / WITNESS_RADIUS) * 0.7);
      out.push({ npcId: npc.id, confidence: Math.round(confidence * 100) / 100 });
    }
  }
  return out;
}

/**
 * Create a crime event. Pure.
 */
export function createCrime(
  id: string,
  type: CrimeType,
  chunk: { x: number; y: number },
  position: { x: number; y: number },
  day: number,
  victimId?: string,
): CrimeEvent {
  return {
    id,
    type,
    chunk: { ...chunk },
    position: { ...position },
    day,
    victimId,
    severity: CRIME_SEVERITY[type],
  };
}

/**
 * Memory event string for a crime (integrates with villageLife addNPCMemory).
 */
export function crimeMemoryEvent(crime: CrimeEvent): string {
  switch (crime.type) {
    case 'murder': return 'PLAYER_KILLED_SOMEONE';
    case 'assault': return 'PLAYER_ATTACKED_ME';
    case 'pickpocket': return 'PLAYER_STOLE_FROM_ME';
    case 'theft': return 'PLAYER_STOLE_FROM_ME';
    case 'trespass': return 'PLAYER_TRESPASSED';
    case 'vandalism': return 'PLAYER_VANDALIZED';
  }
}

/**
 * Importance (1-3) for memory system based on severity.
 */
export function crimeMemoryImportance(crime: CrimeEvent): 1 | 2 | 3 {
  if (crime.severity >= 4) return 3;
  if (crime.severity >= 2) return 2;
  return 1;
}
