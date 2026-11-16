/**
 * BUILD 1059 — Utility scorer (G25): the founders choose what to do
 * by scored utility, not a fixed priority. The vision brief's
 * recommendation is Sims-style utility AI, and the audit
 * (~/workspace/verify-vision/PLAN.md §2) found no utility-AI scorer
 * anywhere in the codebase — this is the one genuinely new engine
 * the vision needs. It replaces the 1057 fixed priority
 * (chooseFounderActivity: night → sleep; hunger ≤30 → eat; social
 * ≤25 → rest; else work), which is DELETED — the scorer IS the
 * decision, in the real-time tick and in the wait-step re-choice.
 *
 * SCORING FORMULA (all scores 0..1, highest wins; ties break by the
 * fixed order sleep > eat > build > work > rest — safety first, then
 * food, then the settlement's project, then gathering, then company;
 * deterministic, no randomness, so a choice is reproducible and
 * testable):
 *
 * - sleep = need(energy)^2 + (night ? 0.8 : 0), capped at 1.
 *   need(x) = (100 - x)/100. Night sleep dominates (energy 90 at
 *   night scores 0.81); by day a founder sleeps when energy is low
 *   (energy 20 → 0.64, energy 15 → 0.72).
 * - eat = foodStock > 0 ? need(hunger)^2 x 1.2 : 0, capped at 1.
 *   Gated on food — no food, no meal (the 1057 rule). Beats the
 *   hardest work (0.57) at hunger ≤ ~30, so the eat threshold while
 *   a build is pending matches the old priority; while idle it eats
 *   below ~44 (peckish, not starving — Sims-like, and the reason the
 *   30-meal stock lasts ~4 days instead of ~5).
 * - rest = need(social)^2 x 0.9. Beats the hardest work at social
 *   ≤ ~20; a lonely founder rests at camp instead of working.
 *   BUILD 1060: + a companionship premium when the founder's
 *   closest founder is at camp — 0.15 x ((closestAffinity - 50)/50)
 *   x need(social), so a lonely founder with a close friend at camp
 *   rests more eagerly than a lonely founder alone (affinity 90 →
 *   +0.12 x need; affinity 50, neutral → +0). The premium is the
 *   RELATIONSHIP effect over neutral company, not company itself —
 *   so the same needs score differently by who is at camp. The
 *   rest DESTINATION (a tile beside the closest founder) is picked
 *   by memory.ts restTileFor, not here — the scorer only scores.
 * - work (chop) = 0 when no tree is in range. Otherwise:
 *   - construction pending: 0.25 + 0.40 x min(1, needWood/12) -
 *     0.02 x min(8, treeDist), where needWood = max(0, 12 - spent -
 *     pile). Wood is worth most when the hut still needs it (pile 0
 *     → 0.57) and fades as the pile fills (pile 10, 2 still needed
 *     → 0.24).
 *   - hut done: 0.45 x max(0, 1 - pile/24) - 0.02 x min(8, treeDist),
 *     clamped ≥ 0. With the hut done the pile is a buffer, not a
 *     project: worth chopping into while it is small (pile 0 → 0.37)
 *     and worth nothing once it is large (pile ≥ 20 → 0) — this is
 *     the 1058 loose end closed: with the hut done and a full pile,
 *     the founders rest instead of chopping endlessly into a pile
 *     with no sink.
 * - build = 0 unless construction is pending (state !== 'done') AND
 *   the pile holds a step's wood (≥ 2) AND nobody else is building
 *   (one builder — the site has one work tile). Then 0.80 - 0.02 x
 *   min(8, distToSite): building beats chopping whenever the pile
 *   holds wood for a step, even when a tree is nearer than the site.
 * - continuation bonus: +0.10 to the activity matching the founder's
 *   current job (chopping → work, building → build). A builder keeps
 *   building and a chopper is not yanked off a tree by a 0.02 score
 *   gap; and if the scorer still flips a mid-chop founder to build,
 *   the work-state machine finishes the current tree first (the tick
 *   executes work by workState, not by activity), so nothing stalls.
 *
 * DIVERGENCES FROM THE OLD PRIORITY (each asserted + probed):
 * (a) mid hunger (35) + low energy (20), day: old → work; scorer →
 *     sleep (0.64 > eat 0.51 > work 0.37).
 * (b) hut done + pile 24 + fine needs: old → work; scorer → rest
 *     (work 0, rest 0.14 wins).
 * (c) construction pending + pile 4 + tree 4 away: old → work;
 *     scorer → build (0.72 > work 0.30).
 *
 * Pure module (no React, no WebGL, no localStorage) so the sim and
 * the standalone asserts can import it directly. Scores are computed
 * live, never stored — no new save key, no version bump (the
 * founders save stays v2); the tick stores the last decision on the
 * founder state (session-only) so E can report WHY.
 */

import { isFounderNight } from './founders';
import type { FounderNeeds, FounderActivity } from './founders';
import { HUT_APPROACH, HUT_COST_WOOD, HUT_WOOD_PER_STEP, nearestUnfinishedSite } from './construction';
import type { ConstructionState } from './construction';

/** The five scored activities — the 1057 four plus 'build'. */
export type ScoredActivity = FounderActivity;

/** What the world looks like to the scorer, besides needs + clock. */
export type UtilityWorldContext = {
  /** Meals left in the shared camp stock. */
  foodStock: number;
  /** Wood in the founders' stockpile. */
  stockpileWood: number;
  /** The first hut's construction (pending vs done). */
  construction: ConstructionState;
  /** Manhattan distance camp → nearest tree in range, null when no
   *  tree is in range (nothing to chop). */
  nearestTreeDist: number | null;
  /** Manhattan distance founder → build-site approach tile. */
  distToSite: number;
  /** True when another founder is already building (one builder). */
  builderTaken: boolean;
  /** The founder's current job, for the continuation bonus — null
   *  when free (no tree targeted, not building). */
  currentJob: 'chop' | 'build' | null;
  /** BUILD 1060: the founder's highest effective affinity to any
   *  other founder (0..100, neutral 50 — memory.ts). Optional:
   *  absent means no relationship data (the 1059 asserts) and the
   *  companionship premium is 0, so old scores are unchanged. */
  closestAffinity?: number;
  /** BUILD 1060: true when the founder's closest founder is at
   *  camp (within 3 tiles of the camp centre) — the premium only
   *  applies when the friend is actually there to rest with. */
  companionAtCamp?: boolean;
};

/** Full scorer input: needs + clock + world. */
export type UtilityContext = UtilityWorldContext & {
  needs: FounderNeeds;
  /** Clock minutes of the day (0..1439). */
  minutes: number;
};

/** One score per activity, 0..1. */
export type UtilityScores = Record<ScoredActivity, number>;

/** A scored decision: the winner, the full table, and the runner-up
 *  (so E can report WHY: "build 0.72 > work 0.30"). */
export type ScoredDecision = {
  activity: ScoredActivity;
  scores: UtilityScores;
  top: ScoredActivity;
  runnerUp: ScoredActivity;
  topScore: number;
  runnerUpScore: number;
};

/** Fixed tie-break order: sleep > eat > build > work > rest. */
export const UTILITY_TIE_ORDER: ScoredActivity[] = ['sleep', 'eat', 'build', 'work', 'rest'];

/** Night sleep bonus (sleep dominates at night). */
export const UTILITY_NIGHT_BONUS = 0.8;
/** Eat weight (hunger need squared x this). */
export const UTILITY_EAT_WEIGHT = 1.2;
/** Rest weight (social need squared x this). */
export const UTILITY_REST_WEIGHT = 0.9;
/** Build base score (before the distance penalty). */
export const UTILITY_BUILD_BASE = 0.8;
/** Distance penalty per tile (capped at 8 tiles). */
export const UTILITY_DIST_PENALTY = 0.02;
/** Continuation bonus for the founder's current job. */
export const UTILITY_CONTINUATION_BONUS = 0.1;
/** Pile size at which chopping for the buffer is worth nothing
 *  (hut done). */
export const UTILITY_PILE_FULL = 24;
/** BUILD 1060: companionship premium on rest — the most a close
 *  friend at camp can add (at affinity 100 and full social need). */
export const UTILITY_COMPANION_BONUS = 0.15;

/** need(x) = (100 - x)/100 — 0 when satisfied, 1 when empty. */
export function utilityNeed(value: number): number {
  return Math.max(0, Math.min(1, (100 - value) / 100));
}

/**
 * Score all five activities from needs + context. Pure. Every score
 * is clamped to 0..1; gates return exactly 0 (eat with no food,
 * work with no tree in range, build when the hut is done / the pile
 * is short / another founder is building).
 */
export function scoreFounderActivities(ctx: UtilityContext): UtilityScores {
  const { needs, minutes, foodStock, stockpileWood, construction, nearestTreeDist, distToSite, builderTaken, currentJob } = ctx;
  const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
  const distPenalty = (d: number): number => UTILITY_DIST_PENALTY * Math.min(8, Math.max(0, d));

  const sleep = clamp01(utilityNeed(needs.energy) ** 2 + (isFounderNight(minutes) ? UTILITY_NIGHT_BONUS : 0));
  const eat = foodStock > 0 ? clamp01(utilityNeed(needs.hunger) ** 2 * UTILITY_EAT_WEIGHT) : 0;
  // BUILD 1060: the companionship premium — a lonely founder rests
  // more eagerly when their closest founder is at camp. The premium
  // scales with affinity ABOVE neutral (50): a neutral 50 adds
  // nothing, a close 90 adds 0.15 x 0.8 x need(social). Absent
  // relationship data (the 1059 callers) the premium is 0.
  const companionBonus =
    ctx.companionAtCamp && ctx.closestAffinity !== undefined
      ? UTILITY_COMPANION_BONUS * Math.max(0, (ctx.closestAffinity - 50) / 50) * utilityNeed(needs.social)
      : 0;
  const rest = clamp01(utilityNeed(needs.social) ** 2 * UTILITY_REST_WEIGHT + companionBonus);

  let work = 0;
  if (nearestTreeDist !== null) {
    if (construction.state !== 'done') {
      const needWood = Math.max(0, HUT_COST_WOOD - construction.spentWood - stockpileWood);
      work = clamp01(0.25 + 0.4 * Math.min(1, needWood / HUT_COST_WOOD) - distPenalty(nearestTreeDist));
    } else {
      work = clamp01(0.45 * Math.max(0, 1 - stockpileWood / UTILITY_PILE_FULL) - distPenalty(nearestTreeDist));
    }
  }

  let build = 0;
  if (construction.state !== 'done' && stockpileWood >= HUT_WOOD_PER_STEP && !builderTaken) {
    build = clamp01(UTILITY_BUILD_BASE - distPenalty(distToSite));
  }

  const scores: UtilityScores = { sleep, eat, rest, work, build };
  // Continuation bonus: the founder's current job scores a little
  // higher, so a builder keeps building and a chopper is not yanked
  // off a tree by a 0.02 gap.
  if (currentJob === 'chop') scores.work = clamp01(scores.work + UTILITY_CONTINUATION_BONUS);
  if (currentJob === 'build') scores.build = clamp01(scores.build + UTILITY_CONTINUATION_BONUS);
  return scores;
}

/**
 * Pick the winning activity from a scored table. Highest wins; ties
 * break by UTILITY_TIE_ORDER (first max wins). Pure, deterministic.
 */
export function chooseScoredActivity(ctx: UtilityContext): ScoredDecision {
  const scores = scoreFounderActivities(ctx);
  // Winner: first max in tie order (strict >, so the earliest of a
  // tie wins — deterministic). Runner-up: best of the rest, same
  // rule. Two clean passes; the display never names the winner as
  // its own runner-up.
  let top: ScoredActivity = UTILITY_TIE_ORDER[0];
  for (const a of UTILITY_TIE_ORDER) {
    if (scores[a] > scores[top]) top = a;
  }
  let runnerUp: ScoredActivity = UTILITY_TIE_ORDER.find((a) => a !== top) as ScoredActivity;
  for (const a of UTILITY_TIE_ORDER) {
    if (a !== top && scores[a] > scores[runnerUp]) runnerUp = a;
  }
  return { activity: top, scores, top, runnerUp, topScore: scores[top], runnerUpScore: scores[runnerUp] };
}

/** Manhattan distance between two tiles (the scorer's distance). */
export function founderTileDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Distance from a founder's position to the build site. BUILD
 *  1066: with a construction state, the nearest UNFINISHED site's
 *  approach tile (the site the founder would actually build); with
 *  no construction (the sim's old callers), the first hut's
 *  approach — the old behaviour. When every site is done there is
 *  nothing to build, so the distance is far (the build score is 0
 *  then anyway, gated on the construction being pending). */
export function founderDistToSite(pos: { x: number; y: number }, construction?: ConstructionState): number {
  if (construction) {
    const site = nearestUnfinishedSite(construction, pos);
    if (site) return founderTileDist(pos, site.approach);
    return 999;
  }
  return founderTileDist(pos, HUT_APPROACH);
}
