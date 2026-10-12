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
