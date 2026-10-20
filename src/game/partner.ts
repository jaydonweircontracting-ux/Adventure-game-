// Marriage / partner slot (BUILD 894 — EO partner system).
//
// Pure and deterministic — no React, no DOM. The player can propose to an
// adult NPC whose disposition is admiring (80+). One partner at a time; the
// bond persists in the dialogue save section next to disposition.

export interface PartnerState {
  npcId: string;
  npcName: string;
  /** In-game day the partnership began. */
  day: number;
}

/** Disposition required before an NPC will accept a proposal. */
export const PROPOSAL_MIN_DISPOSITION = 80;

/** Archetypes that can never be partners. */
const INELIGIBLE_ARCHETYPES = new Set(['child']);

/**
 * Whether the player can propose to this NPC right now: no current partner,
 * disposition admiring, and the NPC is an eligible adult. Pure.
 */
export function canPropose(
  disposition: number,
  currentPartner: PartnerState | null,
  archetype: string,
): boolean {
  if (currentPartner) return false;
  if (INELIGIBLE_ARCHETYPES.has(archetype)) return false;
  return disposition >= PROPOSAL_MIN_DISPOSITION;
}

/** Whether this NPC is the player's partner. Pure. */
export function isPartner(state: PartnerState | null, npcId: string): boolean {
  return state !== null && state.npcId === npcId;
}

/** Display label for the partner slot. Pure. */
export function partnerLabel(state: PartnerState | null): string {
  return state ? `💞 Partner: ${state.npcName} (since day ${state.day})` : '💞 Partner: none';
}

/** Validate a restored partner value. Pure. */
export function isPartnerState(value: unknown): value is PartnerState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.npcId === 'string' && v.npcId.length > 0 &&
    typeof v.npcName === 'string' && v.npcName.length > 0 &&
    typeof v.day === 'number' && Number.isFinite(v.day)
  );
}
