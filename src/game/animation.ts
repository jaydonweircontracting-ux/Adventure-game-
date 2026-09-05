import type { CombatDirection } from './combat';
import type { GoatAIState } from './ai';
export type AnimationState = GoatAIState | 'run' | 'attack';
export function getSpriteState(state: AnimationState, direction: CombatDirection): string { return state + '_' + direction; }
export function getAttackFrame(elapsedMs: number): 'windup' | 'hit' | 'recover' { return elapsedMs < 100 ? 'windup' : elapsedMs < 200 ? 'hit' : 'recover'; }
