// BUILD 974: quest/persistence extras 6/6 — player titles earned from
// quest completion. Rules/formats only, original TypeScript.
//
// DISTINCTION (stated plainly — this is a second title source, not a
// duplicate of BUILD 941, and the two must not be confused):
// - 941 AA titles: derived from TOTAL AA POINTS SPENT (0/5/15/30/50),
//   shown in the Skills panel as "Alternate Advancement — <title>".
//   They change when you spend AA points, whether or not you ever
//   finish a quest. Untouched by this module.
// - 974 quest titles: earned by COMPLETING a quest's work — one fixed
//   title per static quest, derived from that quest's own content
//   (what it asks you to do), not from spend, level, or any new lore.
//   Shown on the quest log's Completed tab, on that quest's card.
//   Display-only like 941: a title changes no number, no price, no
//   combat value, no guard behavior.
// - Reachability: the six task-driven quests (940 shell) cannot complete
//   as linear quests, so their titles are earned by completing the
//   TASK that wraps the quest instead — the title follows completion
//   of the quest's work in either form. Callers pass completed quest
//   ids AND the quest ids of completed tasks; duplicates collapse.

import { QUESTS } from './quests';

/** Title earned by completing each static quest. Grounded in the quest's own work, not invented lore. */
export const QUEST_COMPLETION_TITLES: Record<string, string> = {
  'rats-in-the-cellar': 'Rat-Catcher',
  'lost-heirloom': 'Heirloom Finder',
  'wolf-pack': 'Pack-Breaker',
  'silk-for-the-seamstress': 'Bowstring Weaver',
  'bandit-toll': 'Toll-Breaker',
  'the-old-crypt': 'Crypt-Rester',
  'caravan-guard': 'Caravan Warden',
  'troll-bridge': 'Troll-Slayer',
  'the-sunken-cache': 'Cache Diver',
  'ashes-of-aldoria': 'Hero of Aldoria',
};

/** The title for one quest id, or undefined for unknown/generated quests (they earn none). */
export function questTitleForQuest(questId: string): string | undefined {
  return QUEST_COMPLETION_TITLES[questId];
}

/**
 * Titles earned from a set of completed quest ids (quest completions
 * plus the quest ids of completed tasks), in static-quest order,
 * deduplicated. Unknown ids earn nothing and are skipped, never faked.
 */
export function questTitlesForCompleted(completedQuestIds: readonly string[]): string[] {
  const done = new Set(completedQuestIds);
  const titles: string[] = [];
  for (const def of QUESTS) {
    if (!done.has(def.id)) continue;
    const title = QUEST_COMPLETION_TITLES[def.id];
    if (title && !titles.includes(title)) titles.push(title);
  }
  return titles;
}
