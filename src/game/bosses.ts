// Boss mechanics framework (BUILD 511).
//
// Bosses are more than inflated HP. Each boss has:
// - Phases (triggered at health thresholds)
// - Attack patterns per phase
// - Telegraphs (warnings before big attacks)
// - Summons (adds during fight)
//
// Data-driven, not hardcoded per boss.

export type BossPhaseTrigger =
  | { kind: 'health_below'; percent: number };

export type BossAttackKind =
  | 'charge'           // Rush at player
  | 'aoe_slam'         // Area damage around boss
  | 'summon'           // Spawn minions
  | 'projectile'       // Ranged attack
  | 'enrage'           // Damage/speed buff
  | 'burrow'           // Disappear, erupt beneath player
  | 'split';           // Split into two at half health

export interface BossAttack {
  kind: BossAttackKind;
  /** Telegraph duration in ticks (warning before attack) */
  telegraphTicks: number;
  /** Damage multiplier */
  damageMult: number;
  /** Cooldown in ticks */
  cooldownTicks: number;
  /** Description for logs */
  description: string;
}

export interface BossPhase {
  /** Phase number (1-indexed) */
  phase: number;
  /** Trigger to enter this phase */
  trigger: BossPhaseTrigger;
  /** Attacks available in this phase */
  attacks: BossAttack[];
  /** Flavor text when phase starts */
  phaseText: string;
}

export interface BossDefinition {
  id: string;
  name: string;
  /** Base HP multiplier (vs normal) */
  hpMult: number;
  phases: BossPhase[];
}

// Example: Burrowing Beast
export const BURROWING_BEAST: BossDefinition = {
  id: 'burrowing_beast',
  name: 'Burrowing Beast',
  hpMult: 8,
  phases: [
    {
      phase: 1,
      trigger: { kind: 'health_below', percent: 100 },
      attacks: [
        {
          kind: 'charge',
          telegraphTicks: 30,
          damageMult: 1.5,
          cooldownTicks: 120,
          description: 'The beast lowers its head and charges!',
        },
      ],
      phaseText: 'A massive beast emerges from the ground!',
    },
    {
      phase: 2,
      trigger: { kind: 'health_below', percent: 50 },
      attacks: [
        {
          kind: 'charge',
          telegraphTicks: 20,
          damageMult: 1.5,
          cooldownTicks: 90,
          description: 'The beast charges!',
        },
        {
          kind: 'burrow',
          telegraphTicks: 45,
          damageMult: 2.0,
          cooldownTicks: 180,
          description: 'The beast burrows underground...',
        },
        {
          kind: 'summon',
          telegraphTicks: 30,
          damageMult: 0.5,
          cooldownTicks: 240,
          description: 'The beast calls for help!',
        },
      ],
      phaseText: 'The beast is enraged! It burrows into the ground!',
    },
  ],
};

// Example: Two-Headed Serpent
export const TWO_HEADED_SERPENT: BossDefinition = {
  id: 'two_headed_serpent',
  name: 'Two-Headed Serpent',
  hpMult: 10,
  phases: [
    {
      phase: 1,
      trigger: { kind: 'health_below', percent: 100 },
      attacks: [
        {
          kind: 'projectile',
          telegraphTicks: 25,
          damageMult: 1.2,
          cooldownTicks: 100,
          description: 'The serpent spits venom!',
        },
      ],
      phaseText: 'A massive two-headed serpent coils before you!',
    },
    {
      phase: 2,
      trigger: { kind: 'health_below', percent: 50 },
      attacks: [
        {
          kind: 'projectile',
          telegraphTicks: 20,
          damageMult: 1.2,
          cooldownTicks: 80,
          description: 'Both heads spit venom!',
        },
        {
          kind: 'split',
          telegraphTicks: 60,
          damageMult: 1.0,
          cooldownTicks: 9999, // once
          description: 'The serpent splits in two!',
        },
      ],
      phaseText: 'The serpent splits into two separate creatures!',
    },
  ],
};

/**
 * Get current phase for a boss at given health percent.
 */
export function phaseForHealth(
  boss: BossDefinition,
  healthPercent: number,
): BossPhase {
  // Find the highest phase whose trigger is met.
  let current = boss.phases[0];
  for (const phase of boss.phases) {
    if (phase.trigger.kind === 'health_below' && healthPercent <= phase.trigger.percent) {
      current = phase;
    }
  }
  return current;
}

/**
 * Get all boss definitions.
 */
export function allBosses(): BossDefinition[] {
  return [BURROWING_BEAST, TWO_HEADED_SERPENT];
}
