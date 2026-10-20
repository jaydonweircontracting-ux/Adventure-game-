// Equipment art wiring (BUILD 911, Phase B2).
//
// The sprite pipeline (rpgSprites.ts + characterSystem.drawIsoCharacter) has
// always drawn RpgLook.equipment layers, and NPCs always had deterministic
// outfits (variantLook) — but the equipment PNG folders were never installed
// into public/rpg/, and the game's real gear (items.ts GeneratedItem bases,
// the 8-slot paperdoll) had no connection to the sprite at all. This module
// is that connection, kept pure and data-driven:
//
//   ITEM_BASE_ART      item base id -> sprite folder(s) worn for that item.
//                      Adding art for a future item = one data line here
//                      (+ installing the folder, see below). An explicit
//                      empty array means "deliberately no worn art" (rings,
//                      amulets, the spellbook: no pack art reads correctly
//                      at character scale).
//   RPG_FOLDER_VISUAL_SLOT
//                      sprite folder -> visual layer slot. The manifest
//                      (rpgManifest.json) catalogues all 93 equipment
//                      folders; the folders classified here are the ones
//                      installed into public/rpg/ by
//                      scripts/install-rpg-equipment.mjs (which scans this
//                      file, characterSystem.ts and RpgCharacterCreator.tsx
//                      for referenced folder names).
//   composePlayerLook  merges the three appearance sources into ONE RpgLook:
//                      character-creator picks < paperdoll toggles < equipped
//                      GeneratedItems (real gear always wins its layer).
//                      App.tsx memoizes the result on state change, so the
//                      render loop gains no per-frame work.
//
// Layer model (verified against the pack's frame geometry): the pack's
// "legs" folders split into full leg layers (pants/kilts) and boot-only
// layers (they paint just the boot region), so boots compose OVER pants.
// A worn helmet suppresses the hair layer (same rule as variantLook);
// beards coexist with both. DrkCloakBACK is classified but deliberately
// never emitted: the renderer draws equipment after the base body, and a
// back-cloak layer belongs *behind* the body — emitting it would paint the
// cape over the chest. It drops in the day the renderer gains a back pass.

import type { GeneratedItem } from '../items';
import type { RpgLook } from './rpgSprites';

/** Visual layer slots, in canonical draw order (see COMPOSE_ORDER). */
export type RpgVisualSlot =
  | 'legs' | 'boots' | 'torso' | 'accessory' | 'arms'
  | 'headwear' | 'hair' | 'beard' | 'weapon' | 'shield';

const COMPOSE_ORDER: readonly RpgVisualSlot[] = [
  'legs', 'boots', 'torso', 'accessory', 'arms',
  'headwear', 'hair', 'beard', 'weapon', 'shield',
];

/** Sprite folder -> visual slot. Folders not listed are not installed. */
export const RPG_FOLDER_VISUAL_SLOT: Readonly<Record<string, RpgVisualSlot>> = {
  // Legs (full leg layers: pants, kilts, wraps)
  BluePants: 'legs', BrownPants: 'legs', AhoulKilt1: 'legs',
  // Boots (boot-region layers; compose over the leg layer)
  BlackBoots: 'boots', DrkBoot: 'boots', AhoulBoots1: 'boots', DrkArcaneBoot: 'boots',
  // Torso (clothing first, then armor — one layer either way)
  BlueVest: 'torso', BrvHrtTunic: 'torso', BrvHrtVest: 'torso',
  ChestPiece1: 'torso', ChestPiece2: 'torso',
  BreastPlate1: 'torso', BreastPlateGold: 'torso', Breastplate2: 'torso',
  DrkChestPlat: 'torso', AhoulChestpiece1: 'torso', AhoulLeatherBreastplate: 'torso',
  DrkChainTunic: 'torso', DrkArcaneShirt: 'torso',
  // Accessory (cloak front clasp; drawn over the torso)
  DrkCloakFRONT: 'accessory',
  // Arms (gloves, guards, bands, shoulderpads)
  AhoulArmBand: 'arms', AhoulArmGuards: 'arms', DrkArmPlat: 'arms',
  AhoulShoulderpads1: 'arms', DrkGluv: 'arms',
  // Headwear (suppresses the hair layer while worn)
  CanvasHood: 'headwear', ChainCoif: 'headwear', CoifFelious: 'headwear',
  CoifMudam: 'headwear', DrkCoif: 'headwear', DrkHelm: 'headwear', DrkHood: 'headwear',
  // Hair + beard
  DreamWalkerHair1: 'hair', DreamWalkerHair2: 'hair', DreamWalkerHair3: 'hair',
  BeardDark: 'beard', BeardGrey: 'beard', BeardLight: 'beard', BeardRed: 'beard',
  // Weapons
  Dagger: 'weapon', BroadSword: 'weapon', BroadSword2: 'weapon',
  BastardSword: 'weapon', BattleAxe: 'weapon', Axe: 'weapon',
  BoneBow: 'weapon', BoneClub: 'weapon', ChainMace: 'weapon',
  CurvedHandRazor: 'weapon', DaggerWand: 'weapon',
  // Shields (paperdoll offhand slot)
  BucklerNisos: 'shield', BucklerWood: 'shield',
};

/**
 * Classified in the catalog but never emitted by composePlayerLook (see the
 * header note on renderer layer order). Kept as data so the back-cloak art
 * is installed and ready for a future back-layer pass.
 */
export const RPG_BACK_LAYER_FOLDERS: readonly string[] = ['DrkCloakBACK'];
export const RPG_FOLDER_IS_BACK_LAYER: Readonly<Record<string, boolean>> = {
  DrkCloakBACK: true,
};

/**
 * Item base id (items.ts ITEM_BASES) -> worn sprite folder(s).
 * Every base id has an explicit entry; [] = no worn art by design.
 */
export const ITEM_BASE_ART: Readonly<Record<string, readonly string[]>> = {
  // Weapons
  rusty_sword: ['BroadSword'],
  iron_sword: ['BroadSword2'],
  steel_blade: ['BastardSword'],
  bronze_sword: ['BroadSword'],
  soldier_blade: ['BastardSword'],
  oak_bow: ['BoneBow'],
  hunting_bow: ['BoneBow'],
  yew_bow: ['BoneBow'],
  longbow: ['BoneBow'],
  apprentice_staff: ['DaggerWand'],
  oak_staff: ['DaggerWand'],
  elder_staff: ['DaggerWand'],
  hand_axe: ['Axe'],
  war_axe: ['BattleAxe'],
  mace: ['ChainMace'],
  war_hammer: ['BoneClub'],
  dagger: ['Dagger'],
  rune_dagger: ['CurvedHandRazor'],
  // Offhand
  wooden_shield: ['BucklerWood'],
  iron_shield: ['BucklerNisos'],
  kite_shield: ['BucklerNisos'],
  tower_shield: ['BucklerNisos'],
  spellbook: [],
  // Helmet
  cloth_hood: ['CanvasHood'],
  leather_cap: ['CoifFelious'],
  iron_helm: ['ChainCoif'],
  steel_helm: ['DrkHelm'],
  mage_hood: ['DrkHood'],
  // Armor
  cloth_robe: ['DrkArcaneShirt'],
  leather_armor: ['AhoulLeatherBreastplate'],
  chainmail: ['DrkChainTunic'],
  plate_armor: ['BreastPlate1'],
  mage_robe: ['DrkArcaneShirt'],
  traveler_cloak: ['DrkCloakFRONT'],
  // Gloves
  cloth_gloves: ['DrkGluv'],
  leather_gloves: ['AhoulArmGuards'],
  gauntlets: ['DrkArmPlat'],
  silk_gloves: ['AhoulArmBand'],
  // Boots
  worn_boots: ['BlackBoots'],
  leather_boots: ['DrkBoot'],
  swift_boots: ['AhoulBoots1'],
  iron_boots: ['DrkArcaneBoot'],
  // Jewelry: no worn art at character scale.
  copper_ring: [],
  silver_ring: [],
  gold_ring: [],
  jade_ring: [],
  bone_amulet: [],
  stone_amulet: [],
  silver_amulet: [],
  wolf_pendant: [],
};

/** Paperdoll quick-toggle art (legacy inventory toggles). */
export const TOGGLE_ART = {
  dagger: 'Dagger',
  sword: 'BroadSword2',
  bow: 'BoneBow',
  shirt: 'BlueVest',
} as const;

export interface PlayerGearToggles {
  dagger: boolean;
  bow: boolean;
  shirt: boolean;
  sword: boolean;
}

/** Worn sprite folders for one item instance ([] when it has no art). */
export function artFoldersForItem(item: Pick<GeneratedItem, 'baseId'>): readonly string[] {
  return ITEM_BASE_ART[item.baseId] ?? [];
}

/**
 * Compose the player's rendered look from the three appearance sources.
 * Pure: same inputs -> same look, so the result survives save/load and
 * chunk transitions by construction (it derives from persisted state).
 */
export function composePlayerLook(
  creatorLook: RpgLook,
  toggles: PlayerGearToggles,
  equipment: readonly GeneratedItem[],
): RpgLook {
  const layers: Partial<Record<RpgVisualSlot, string>> = {};
  const put = (folder: string | undefined) => {
    if (!folder) return;
    const slot = RPG_FOLDER_VISUAL_SLOT[folder];
    if (slot) layers[slot] = folder;
  };

  // 1. Character-creator picks (basic clothing + hair, BUILD 909 rules).
  for (const folder of creatorLook.equipment) put(folder);

  // 2. Paperdoll quick toggles fill layers the creator left empty.
  if (toggles.shirt && !layers.torso) layers.torso = TOGGLE_ART.shirt;
  if (!layers.weapon) {
    if (toggles.sword) layers.weapon = TOGGLE_ART.sword;
    else if (toggles.bow) layers.weapon = TOGGLE_ART.bow;
    else if (toggles.dagger) layers.weapon = TOGGLE_ART.dagger;
  }

  // 3. Equipped generated gear wins its layer outright.
  for (const item of equipment) {
    if (!item.equipped) continue;
    for (const folder of artFoldersForItem(item)) put(folder);
  }

  // A worn helmet/hood covers the hair layer (variantLook parity).
  if (layers.headwear) delete layers.hair;

  const equipmentOut: string[] = [];
  for (const slot of COMPOSE_ORDER) {
    const folder = layers[slot];
    if (folder) equipmentOut.push(folder);
  }
  return { base: creatorLook.base, equipment: equipmentOut };
}
