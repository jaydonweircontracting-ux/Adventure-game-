// BUILD 974: quest/persistence extras 6/6 — qglobals / data-bucket KV.
// Rules/formats only, original TypeScript. Ported rule (EQEmu
// analysis): persistent key/value storage scoped by owner/zone, with
// expiry on buckets, as the persistence primitive behind cross-session
// quest state. Adapted to a single-player game: one player, no zones
// as owners — scopes are quest / task / town / dialogue / world.
//
// WHY A NEW STORE (audit, stated not hidden): the existing 936
// QuestStorage is numeric-only AND its sanitizer drops every key that
// is not a known quest/task mission key, clamped to that mission's
// range. A boolean flag ("player did X") or a string flag literally
// cannot survive that store, and widening it would break its
// clamped-numeric contract. So flags live in their own save field
// with their own grammar, and the two stores never share keys:
// QuestStorage keys are `quest:<id>:<stageId>` / `task:<id>:<activity>`;
// flag keys are `flag:<scope>:<subject>[:<aspect>...]`. Same `quest:`
// word, different field, different grammar — no collision in practice
// and none possible in the save, since the fields are separate.
//
// KEY GRAMMAR: flag:<scope>:<segment>(:<segment>)*
// - scope: quest | task | town | dialogue | world
// - segment: lowercase letters, digits, hyphen, underscore; must start
//   alphanumeric. Quest ids (e.g. rats-in-the-cellar) and town slugs
//   (e.g. mosslight) fit; free-form text, spaces, and uppercase do not.
// VALUES: boolean | finite number | string of at most 200 chars.
// VERSIONING: the store carries version 1. A save with any other
// version restores to EMPTY (never partially trusted) — a future
// version migrates explicitly, it does not silently reinterpret.
// SANITIZE: garbage keys, wrong types, non-finite numbers, overlong
// strings, and entries past the 500-flag cap are dropped on load.
// The store is pure: setWorldFlag returns a new state (or the same
// reference when nothing changed), so App refs stay the source of
// truth exactly like the 973 fired-traps set.

export type WorldFlagValue = boolean | number | string;

export const WORLD_FLAGS_VERSION = 1;

/** Cap: a world with more than 500 persistent flags is a bug, not content. Excess entries drop on load. */
export const WORLD_FLAGS_MAX = 500;

export type WorldFlagsState = {
  version: number;
  flags: Record<string, WorldFlagValue>;
};

const FLAG_KEY_RE = /^flag:(quest|task|town|dialogue|world):[a-z0-9][a-z0-9_-]*(:[a-z0-9][a-z0-9_-]*)*$/;

export function isValidWorldFlagKey(key: unknown): key is string {
  return typeof key === 'string' && FLAG_KEY_RE.test(key);
}

function isValidWorldFlagValue(value: unknown): value is WorldFlagValue {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 200;
  return false;
}

export function createEmptyWorldFlags(): WorldFlagsState {
  return { version: WORLD_FLAGS_VERSION, flags: {} };
}

/** Builds a flag key from scope + segments (segments are NOT validated here — set/sanitize enforce the grammar). */
export function worldFlagKey(scope: 'quest' | 'task' | 'town' | 'dialogue' | 'world', ...segments: string[]): string {
  return ['flag', scope, ...segments].join(':');
}

export function questFlagKey(questId: string, aspect: string): string {
  return worldFlagKey('quest', questId, aspect);
}

export function taskFlagKey(taskId: string, aspect: string): string {
  return worldFlagKey('task', taskId, aspect);
}

export function townFlagKey(townSlug: string, aspect: string): string {
  return worldFlagKey('town', townSlug, aspect);
}

export function getWorldFlag(state: WorldFlagsState, key: string): WorldFlagValue | undefined {
  return state.flags[key];
}

export function hasWorldFlag(state: WorldFlagsState, key: string): boolean {
  return key in state.flags;
}

/**
 * Sets one flag. Invalid keys/values are ignored (same state, changed
 * false) — a bad write never corrupts the store. Setting the same
 * value again is a no-op (same reference).
 */
export function setWorldFlag(
  state: WorldFlagsState,
  key: string,
  value: WorldFlagValue,
): { state: WorldFlagsState; changed: boolean } {
  if (!isValidWorldFlagKey(key) || !isValidWorldFlagValue(value)) return { state, changed: false };
  if (state.flags[key] === value) return { state, changed: false };
  return { state: { version: WORLD_FLAGS_VERSION, flags: { ...state.flags, [key]: value } }, changed: true };
}

/**
 * Sanitizes a loaded store: wrong version → empty; garbage keys,
 * wrong-typed values, and entries past the cap are dropped. Never
 * throws, never invents flags for missing keys.
 */
export function sanitizeWorldFlags(raw: unknown): WorldFlagsState {
  const empty = createEmptyWorldFlags();
  if (!raw || typeof raw !== 'object') return empty;
  const record = raw as Record<string, unknown>;
  if (record.version !== WORLD_FLAGS_VERSION) return empty;
  const flagsRaw = record.flags;
  if (!flagsRaw || typeof flagsRaw !== 'object') return empty;
  const flags: Record<string, WorldFlagValue> = {};
  for (const [key, value] of Object.entries(flagsRaw as Record<string, unknown>)) {
    if (Object.keys(flags).length >= WORLD_FLAGS_MAX) break;
    if (!isValidWorldFlagKey(key) || !isValidWorldFlagValue(value)) continue;
    flags[key] = value;
  }
  return { version: WORLD_FLAGS_VERSION, flags };
}
