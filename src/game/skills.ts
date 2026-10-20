// Skill system foundation — RuneScape-style progression
// Data-driven skill definitions, XP curves, and level calculations.

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface SkillState {
  xp: number;
  level: number;
}

// RuneScape-inspired XP curve: level n requires roughly n^2 * 100 XP
// Level 1: 0 XP, Level 2: 100 XP, Level 10: 10,000 XP, Level 99: ~980,100 XP
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 2));
}

export function levelForXp(xp: number): number {
  if (xp < 0) return 1;
  // Solve: xp = 100 * (level-1)^2
  // level = 1 + sqrt(xp/100)
  const level = 1 + Math.floor(Math.sqrt(xp / 100));
  return Math.min(99, Math.max(1, level));
}

export function xpToNextLevel(currentXp: number): { current: number; needed: number; progress: number } {
  const level = levelForXp(currentXp);
  if (level >= 99) return { current: currentXp, needed: 0, progress: 1 };
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const needed = nextLevelXp - currentXp;
  const progress = (currentXp - currentLevelXp) / (nextLevelXp - currentLevelXp);
  return { current: currentXp, needed, progress: Math.max(0, Math.min(1, progress)) };
}

export const SKILLS: Record<string, SkillDef> = {
  woodcutting: {
    id: 'woodcutting',
    name: 'Woodcutting',
    description: 'Chop trees to gather wood. Higher levels fell trees faster.',
    icon: '🪓',
  },
  mining: {
    id: 'mining',
    name: 'Mining',
    description: 'Mine rocks to gather ore and stone.',
    icon: '⛏️',
  },
  fishing: {
    id: 'fishing',
    name: 'Fishing',
    description: 'Catch fish from water. Cook them for food.',
    icon: '🎣',
  },
  smithing: {
    id: 'smithing',
    name: 'Smithing',
    description: 'Smelt ore into bars and forge equipment.',
    icon: '🔨',
  },
  crafting: {
    id: 'crafting',
    name: 'Crafting',
    description: 'Create useful items from raw materials.',
    icon: '🧵',
  },
  cooking: {
    id: 'cooking',
    name: 'Cooking',
    description: 'Prepare food from raw ingredients.',
    icon: '🍳',
  },
};

export function createEmptySkills(): Record<string, SkillState> {
  const skills: Record<string, SkillState> = {};
  for (const id of Object.keys(SKILLS)) {
    skills[id] = { xp: 0, level: 1 };
  }
  return skills;
}

export function awardXp(
  skills: Record<string, SkillState>,
  skillId: string,
  amount: number
): { leveledUp: boolean; oldLevel: number; newLevel: number } {
  const skill = skills[skillId];
  if (!skill) return { leveledUp: false, oldLevel: 1, newLevel: 1 };

  const oldLevel = skill.level;
  skill.xp += amount;
  skill.level = levelForXp(skill.xp);
  const leveledUp = skill.level > oldLevel;

  return { leveledUp, oldLevel, newLevel: skill.level };
}

// Woodcutting XP: 25 XP per tree felled (takes ~3-4 swings)
// At 25 XP/tree: Level 2 after 4 trees, Level 10 after ~400 trees
export const WOODCUTTING_XP_PER_TREE = 25;

// ---------------------------------------------------------------------------
// Skill masters (BUILD 881 — EO skill-master model, need-driven teachers)
// ---------------------------------------------------------------------------

export interface SkillMasterDef {
  skillId: string;
  /** Named Mosslight NPC who teaches this skill. */
  npcName: string;
  /** Stat checked at apprenticeship time. */
  stat: 'str' | 'dex' | 'int' | 'luk';
  /** Minimum stat value to become an apprentice. */
  requiredStat: number;
  /**
   * XP multiplier on EARNED xp once apprenticed. Never grants free XP —
   * the bonus only multiplies XP from real successful actions.
   */
  xpBonus: number;
  /** The master's invitation line. */
  pitch: string;
}

export const SKILL_MASTERS: Record<string, SkillMasterDef> = {
  smithing: {
    skillId: 'smithing',
    npcName: 'Tom',
    stat: 'str',
    requiredStat: 12,
    xpBonus: 1.5,
    pitch: 'Steel remembers the hand that shapes it. Show me strong arms and I will show you the forge.',
  },
  woodcutting: {
    skillId: 'woodcutting',
    npcName: 'Aldric',
    stat: 'str',
    requiredStat: 10,
    xpBonus: 1.5,
    pitch: 'The north fields taught me every tree by name. Keep up with my axe and you will learn.',
  },
  cooking: {
    skillId: 'cooking',
    npcName: 'Bryn',
    stat: 'dex',
    requiredStat: 10,
    xpBonus: 1.5,
    pitch: 'A steady hand makes a steady stew. Prove your dexterity and my kitchen is yours.',
  },
};

/** Find the master definition for a named NPC (undefined = not a master). */
export function masterForNpc(npcName: string): SkillMasterDef | undefined {
  return Object.values(SKILL_MASTERS).find((m) => m.npcName === npcName);
}

/** Check the stat prerequisite for apprenticeship. Pure. */
export function apprenticeshipCheck(
  stats: Record<string, number>,
  master: SkillMasterDef,
): { ok: boolean; reason: string } {
  const value = stats[master.stat] ?? 0;
  if (value >= master.requiredStat) return { ok: true, reason: '' };
  return {
    ok: false,
    reason: `Requires ${master.requiredStat} ${master.stat.toUpperCase()} (you have ${value})`,
  };
}

/**
 * XP multiplier for a skill given current apprenticeships.
 * apprenticeships: skillId -> master npcName. 1 = no master.
 */
export function apprenticeXpBonus(
  apprenticeships: Record<string, string>,
  skillId: string,
): number {
  if (!apprenticeships[skillId]) return 1;
  const master = SKILL_MASTERS[skillId];
  return master ? master.xpBonus : 1;
}
