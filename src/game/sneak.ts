// Sneak mode (BUILD 932).
//
// Extends the existing pickpocket (BUILD 526/527), crime (BUILD 521) and
// witness-driven per-town bounty (BUILD 926) systems — it does NOT add a
// second wanted system, a new skill, or a new currency.
//
// MODEL (radius + alerted state — the engine has no line-of-sight raycasts,
// so none are invented here):
// - Sneak is a transient player mode (HUD toggle). While it is on, NPCs do
//   not passively detect the player: a townsfolk only "detects" the player
//   when an alerting event names them (a failed pickpocket, a survived
//   stealth hit, or being close enough to observe a sneak crime).
// - A crime committed while sneaking is witnessed only by NPCs within
//   SNEAK_WITNESS_RADIUS (12u) of the crime — vs the normal WITNESS_RADIUS
//   of 25u. The victim of a failed pickpocket or an assault is at distance
//   0, so they always count. An undetected stealth kill has no witnesses
//   at all, so the BUILD 926 pending-report path receives nothing and no
//   bounty posts. Non-sneak crimes are byte-identical to BUILD 926.
// - A stealth attack (melee only — arrows cannot hit NPCs) against a target
//   that has not detected the player deals double damage. The first hit is
//   the stealth hit: if the victim survives, they are alerted, and later
//   hits are normal damage.
//
// PICKPOCKET LOOT (items, not just gold):
// - Worn gear is NEVER stealable: its render is deterministic from the NPC
//   id (BUILD 921/922), so removing it from a living NPC would desync the
//   corpse logic. Only the BUILD 922 `ownedGear` stash is a source.
// - A stash piece is stealable when removing one copy (a) drops no
//   best-per-slot score — i.e. it is a spare, never the NPC's best in its
//   slot — and (b) keeps the NPC's last trade tool. This is the 922
//   no-downgrade / no-income-loss guardrail restated for theft; the 922
//   sell rule additionally demands a weapon AND an armor piece remain even
//   when the NPC never had them, which would block stealing a spare from a
//   weaponless commoner who is left exactly as equipped as before — theft
//   uses the no-worse-equipped reading, not the stricter sell reading.
//   Children never have stealable gear. If nothing is stealable, the loot
//   is gold (the existing purse share), so the fallback is honest.
// - A stolen stash piece MUST be stored back as an explicit ownedGear list
//   (never left undefined): undefined means "seed-derived starting stash",
//   so leaving it undefined would regenerate the stolen piece on next read.

import { equippedBestBySlot, TRADE_TOOLS } from './npcGearEconomy';

/** Pickpocket button range — matches the existing pickpocket range check. */
export const SNEAK_PICKPOCKET_RANGE = 8;

/**
 * Witness radius while sneaking, in field units. Normal witness radius
 * (crime.ts WITNESS_RADIUS) is 25; sneaking shrinks it to 12, so only
 * nearby observers notice a sneak crime.
 */
export const SNEAK_WITNESS_RADIUS = 12;

/** Damage multiplier for a stealth attack against an undetected target. */
export const SNEAK_STEALTH_DAMAGE_MULT = 2;

/** Pickpocket awareness forced on an alerted target (cf. 0.1 sleeping). */
export const SNEAK_ALERTED_AWARENESS = 0.9;

/** BUILD 933: player sprite opacity while sneaking (field views). 1 = full. */
export const SNEAK_PLAYER_OPACITY = 0.55;

/**
 * BUILD 967: movement speed multiplier while sneaking — exactly half speed
 * (user order 2026-10-21: "move 2x slower"). This is the SINGLE source of
 * truth for the sneak slowdown: every player movement path in App.tsx
 * (field walk/run/mounted/tap-to-move + interior walk) multiplies its final
 * speed by sneakSpeedMultiplier(), so the sneak/normal ratio is exactly 0.5
 * against every base speed and the toggle on/off restores full speed with
 * no stuck state. Detection ranges, stealth damage, crime, and NPC/creature
 * speeds are untouched — this is movement only.
 */
export const SNEAK_SPEED_MULT = 0.5;

/** 0.5 while sneaking, 1 otherwise — applied last, after run/encumbrance. */
export function sneakSpeedMultiplier(sneaking: boolean): number {
  return sneaking ? SNEAK_SPEED_MULT : 1;
}

/**
 * BUILD 933: sanitize a saved alerted-id list (the parallel save field in
 * App's SaveGameData). Old saves carry no field (→ empty); garbage entries
 * are dropped; duplicates collapse. The alerted set itself is a Set in App,
 * so this is the only shape the save/load path needs.
 */
export function sanitizeAlertedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const id of value) {
    if (typeof id === 'string' && id.length > 0 && !out.includes(id)) out.push(id);
  }
  return out;
}

export type SneakWitness = { npcId: string; confidence: number };
export type NpcPosition = { id: string; position: { x: number; y: number } };

/**
 * The pickpocket button gate, as a pure predicate (the HUD calls this with
 * the live target id, roster NPC, player position, and isNpcDead result).
 * Targeted-only, no nearest fallback: the button must never offer to rob
 * someone the player didn't select. Range is the shared pickpocket range.
 */
export function canOfferPickpocket(
  sneaking: boolean,
  targetNpcId: string | null,
  npc: { id: string; indoors?: boolean; position: { x: number; y: number } } | null,
  playerPosition: { x: number; y: number },
  npcIsDead: boolean,
): boolean {
  if (!sneaking || !targetNpcId || !npc) return false;
  if (npc.id !== targetNpcId || npc.indoors || npcIsDead) return false;
  return Math.hypot(playerPosition.x - npc.position.x, playerPosition.y - npc.position.y) <= SNEAK_PICKPOCKET_RANGE;
}

/** Has this NPC been alerted by the player's sneak actions this session? */
export function isNpcAlerted(alertedIds: ReadonlySet<string>, npcId: string): boolean {
  return alertedIds.has(npcId);
}

/**
 * Is the target unaware of a sneaking player? True only while sneaking AND
 * the target is not alerted. When not sneaking, everyone sees the player.
 */
export function isStealthUndetected(
  sneaking: boolean,
  alertedIds: ReadonlySet<string>,
  npcId: string,
): boolean {
  return sneaking && !alertedIds.has(npcId);
}

/** Apply the stealth multiplier when the target is undetected, else unchanged. */
export function stealthDamage(
  baseDamage: number,
  sneaking: boolean,
  alertedIds: ReadonlySet<string>,
  npcId: string,
  // BUILD 958: rogues strike at x3 — the multiplier is a parameter so the
  // class bonus flows through this single function instead of a second
  // stealth path. Default stays x2 for every other class.
  multiplier: number = SNEAK_STEALTH_DAMAGE_MULT,
): number {
  return isStealthUndetected(sneaking, alertedIds, npcId)
    ? baseDamage * multiplier
    : baseDamage;
}

/**
 * Keep only witnesses within the sneak witness radius of the crime.
 * Pure: positions are looked up from the roster snapshot the caller passes.
 * Witnesses with no roster entry are dropped (they cannot be placed).
 */
export function filterSneakWitnesses(
  witnesses: readonly SneakWitness[],
  npcs: readonly NpcPosition[],
  crimePosition: { x: number; y: number },
): SneakWitness[] {
  const byId = new Map(npcs.map((n) => [n.id, n.position]));
  return witnesses.filter((w) => {
    const pos = byId.get(w.npcId);
    if (!pos) return false;
    return Math.hypot(pos.x - crimePosition.x, pos.y - crimePosition.y) <= SNEAK_WITNESS_RADIUS;
  });
}

/**
 * Stash base ids the player may steal from this NPC without leaving them
 * worse equipped or incomeless. Order follows the stash order; duplicates
 * are returned once (the caller removes a single copy).
 */
export function stealableStashGear(
  archetype: string,
  wornBaseIds: readonly string[],
  ownedBaseIds: readonly string[],
): string[] {
  if (archetype === 'child') return [];
  const before = equippedBestBySlot(wornBaseIds, ownedBaseIds);
  const tools = TRADE_TOOLS[archetype] ?? [];
  const hadTool = [...wornBaseIds, ...ownedBaseIds].some((b) => tools.includes(b));
  const out: string[] = [];
  for (const baseId of ownedBaseIds) {
    if (out.includes(baseId)) continue;
    const remaining = [...ownedBaseIds];
    remaining.splice(remaining.indexOf(baseId), 1);
    const after = equippedBestBySlot(wornBaseIds, remaining);
    // (a) No downgrade: every slot's best score must not drop (a slot
    // vanishing entirely counts as dropping to 0).
    let downgrade = false;
    for (const [slot, best] of before) {
      if ((after.get(slot)?.score ?? 0) < best.score) { downgrade = true; break; }
    }
    if (downgrade) continue;
    // (b) No income loss: the last trade tool never goes.
    if (hadTool && ![...wornBaseIds, ...remaining].some((b) => tools.includes(b))) continue;
    out.push(baseId);
  }
  return out;
}

export type PickpocketLoot =
  | { kind: 'item'; baseId: string }
  | { kind: 'gold' };

/**
 * What one pickpocket attempt lifts: the first stealable stash piece, else
 * gold from the purse. Worn gear never appears here.
 */
export function choosePickpocketLoot(
  archetype: string,
  wornBaseIds: readonly string[],
  ownedBaseIds: readonly string[],
): PickpocketLoot {
  const stealable = stealableStashGear(archetype, wornBaseIds, ownedBaseIds);
  if (stealable.length > 0) return { kind: 'item', baseId: stealable[0] };
  return { kind: 'gold' };
}
