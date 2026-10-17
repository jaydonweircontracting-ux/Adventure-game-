/**
 * BUILD 835 foundation: pure integrity checks shared by Debug UI and tests.
 * Diagnostics consume snapshots of real engine data and never alter the world.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface WorldDiagnostic {
  id: string;
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  entityId?: string;
  x?: number;
  y?: number;
  action?: string;
}

export interface InspectableWorldEntity {
  id: string;
  kind: string;
  x?: number;
  y?: number;
  chunk?: string;
  destinationId?: string;
}

export interface WorldIntegritySnapshot {
  entities: readonly InspectableWorldEntity[];
  knownDestinationIds?: ReadonlySet<string>;
}

export function validateWorldSnapshot(snapshot: WorldIntegritySnapshot): WorldDiagnostic[] {
  const diagnostics: WorldDiagnostic[] = [];
  const firstById = new Map<string, InspectableWorldEntity>();

  for (const entity of snapshot.entities) {
    const first = firstById.get(entity.id);
    if (first) {
      diagnostics.push({
        id: `duplicate-id:${entity.id}:${entity.kind}`,
        severity: 'error',
        code: 'duplicate-entity-id',
        message: `Entity ID "${entity.id}" is shared by multiple entities.`,
        entityId: entity.id,
        x: entity.x,
        y: entity.y,
        action: 'Give each entity a stable unique ID; inspect both placements before deleting either.',
      });
    } else {
      firstById.set(entity.id, entity);
    }

    if ((entity.x !== undefined && !Number.isFinite(entity.x)) ||
        (entity.y !== undefined && !Number.isFinite(entity.y))) {
      diagnostics.push({
        id: `invalid-coordinates:${entity.id}`,
        severity: 'error',
        code: 'invalid-coordinates',
        message: `Entity "${entity.id}" has a non-finite world coordinate.`,
        entityId: entity.id,
        action: 'Inspect and correct the entity coordinates in World Studio.',
      });
    }

    if (entity.destinationId && snapshot.knownDestinationIds &&
        !snapshot.knownDestinationIds.has(entity.destinationId)) {
      diagnostics.push({
        id: `missing-destination:${entity.id}:${entity.destinationId}`,
        severity: 'error',
        code: 'missing-destination',
        message: `Entity "${entity.id}" points to missing destination "${entity.destinationId}".`,
        entityId: entity.id,
        x: entity.x,
        y: entity.y,
        action: 'Connect the entrance to an existing destination or create the missing destination.',
      });
    }
  }

  return diagnostics;
}

export interface PathFailureSample {
  npcId: string;
  destinationKey: string;
  tick: number;
  reason?: string;
}

export interface StuckNpcFinding {
  npcId: string;
  destinationKey: string;
  failures: number;
  firstTick: number;
  lastTick: number;
  reasons: string[];
}

/** Groups recent route failures by NPC and destination; input is not mutated. */
export function findRepeatedPathFailures(
  samples: readonly PathFailureSample[],
  threshold = 3,
): StuckNpcFinding[] {
  const safeThreshold = Math.max(2, Math.floor(threshold));
  const groups = new Map<string, PathFailureSample[]>();
  for (const sample of samples) {
    if (!sample.npcId || !sample.destinationKey || !Number.isFinite(sample.tick)) continue;
    const key = `${sample.npcId}\u0000${sample.destinationKey}`;
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }

  const findings: StuckNpcFinding[] = [];
  for (const group of groups.values()) {
    if (group.length < safeThreshold) continue;
    const ordered = [...group].sort((a, b) => a.tick - b.tick);
    const last = ordered[ordered.length - 1];
    findings.push({
      npcId: last.npcId,
      destinationKey: last.destinationKey,
      failures: ordered.length,
      firstTick: ordered[0].tick,
      lastTick: last.tick,
      reasons: [...new Set(ordered.map((entry) => entry.reason).filter((value): value is string => Boolean(value)))],
    });
  }
  return findings.sort((a, b) => b.failures - a.failures || a.npcId.localeCompare(b.npcId));
}
