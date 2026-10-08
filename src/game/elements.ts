// Elemental system (BUILD 484 — Infinite World Phase 2).
//
// Lightweight elemental framework for companions, items, and environmental
// interactions. Elements: Fire, Water, Earth, Nature, Wind, Ice, Lightning, Shadow.
//
// Design: simple effectiveness chart, resistance/weakness, environmental interactions.
// Not overcomplicated — just enough for meaningful gameplay.

export type Element =
  | 'fire' | 'water' | 'earth' | 'nature'
  | 'wind' | 'ice' | 'lightning' | 'shadow'
  | 'none'; // for non-elemental

export const ELEMENTS: Element[] = [
  'fire', 'water', 'earth', 'nature',
  'wind', 'ice', 'lightning', 'shadow',
];

/**
 * Effectiveness chart: attacker -> defender -> multiplier.
 * 2.0 = super effective, 0.5 = resisted, 1.0 = neutral.
 */
const EFFECTIVENESS: Record<Element, Partial<Record<Element, number>>> = {
  fire: { nature: 2.0, ice: 2.0, water: 0.5, fire: 0.5, earth: 0.5 },
  water: { fire: 2.0, earth: 2.0, water: 0.5, nature: 0.5, ice: 0.5 },
  earth: { lightning: 2.0, fire: 2.0, wind: 0.5, nature: 0.5, water: 0.5 },
  nature: { water: 2.0, earth: 2.0, fire: 0.5, ice: 0.5, wind: 0.5 },
  wind: { nature: 2.0, earth: 0.5, ice: 0.5 },
  ice: { nature: 2.0, wind: 2.0, water: 2.0, fire: 0.5, ice: 0.5 },
  lightning: { water: 2.0, wind: 2.0, earth: 0.5, lightning: 0.5, nature: 0.5 },
  shadow: { shadow: 0.5 }, // shadow is neutral except vs itself
  none: {},
};

/**
 * Get damage multiplier for attacker element vs defender element.
 */
export function elementalMultiplier(
  attacker: Element,
  defender: Element,
): number {
  if (attacker === 'none' || defender === 'none') return 1.0;
  return EFFECTIVENESS[attacker]?.[defender] ?? 1.0;
}

/**
 * Environmental interactions.
 * Returns description of what happens when element interacts with terrain.
 */
export function elementalInteraction(
  element: Element,
  terrain: 'vegetation' | 'ice' | 'water' | 'rock' | 'fire',
): string | null {
  const interactions: Record<string, Record<string, string>> = {
    fire: {
      vegetation: 'Burns vegetation, clearing the area.',
      ice: 'Melts ice, creating water.',
    },
    water: {
      fire: 'Extinguishes fire.',
    },
    lightning: {
      water: 'Electrifies water — dangerous to enter!',
    },
    ice: {
      water: 'Freezes water, creating walkable ice.',
    },
    earth: {
      rock: 'Breaks rocks, revealing hidden paths.',
    },
    nature: {
      vegetation: 'Grows plants, creating cover.',
    },
  };
  return interactions[element]?.[terrain] ?? null;
}

/**
 * Get the element strong against the given element (for hints).
 */
export function strongAgainst(element: Element): Element[] {
  const result: Element[] = [];
  for (const atk of ELEMENTS) {
    if (elementalMultiplier(atk, element) > 1.0) {
      result.push(atk);
    }
  }
  return result;
}
