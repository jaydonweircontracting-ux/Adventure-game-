import React, { useEffect, useRef, useState } from 'react';
import { RPG_BASES, RPG_DEFAULT_LOOK, type RpgBase, type RpgLook } from '../game/iso/rpgSprites';
import { CharacterAnimator, drawIsoCharacter } from '../game/iso/characterSystem';

type Slot = { label: string; options: string[] };
const SLOTS: Record<string, Slot> = {
  legs: { label: 'Legwear / boots', options: ['BluePants', 'BrownPants', 'BlackBoots', 'DrkBoot', 'AhoulBoots1', 'AhoulKilt1'] },
  torso: { label: 'Clothing / chest armor', options: ['BlueVest', 'BrvHrtTunic', 'BrvHrtVest', 'ChestPiece1', 'ChestPiece2', 'BreastPlate1', 'BreastPlateGold', 'Breastplate2', 'DrkChestPlat', 'AhoulChestpiece1', 'AhoulLeatherBreastplate'] },
  arms: { label: 'Arms / shoulders', options: ['AhoulArmBand', 'AhoulArmGuards', 'DrkArmPlat', 'AhoulShoulderpads1', 'AhoulLeatherShoulderpads', 'AhoulMetalShoulderpads'] },
  head: { label: 'Helmet / hood', options: ['CanvasHood', 'ChainCoif', 'CoifFelious', 'CoifMudam', 'DrkCoif', 'DrkHelm', 'DrkHood'] },
  hair: { label: 'Hairstyle', options: ['DreamWalkerHair1', 'DreamWalkerHair2', 'DreamWalkerHair3'] },
  beard: { label: 'Beard', options: ['BeardDark', 'BeardGrey', 'BeardLight', 'BeardRed'] },
  weapon: { label: 'Weapon', options: ['Dagger', 'BroadSword', 'BroadSword2', 'BastardSword', 'BattleAxe', 'Axe', 'BoneBow', 'BoneClub', 'ChainMace'] },
  shield: { label: 'Shield', options: ['BucklerNisos', 'BucklerWood'] },
};

const STORAGE_KEY = 'ag-rpg-character-look-v1';

function loadInitialLook(): RpgLook {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const value = JSON.parse(raw) as Partial<RpgLook>;
      const base = RPG_BASES.includes(value.base as RpgBase) ? value.base as RpgBase : RPG_DEFAULT_LOOK.base;
      const equipment = Array.isArray(value.equipment) ? value.equipment.filter((item): item is string => typeof item === 'string' && Object.values(SLOTS).some((slot) => slot.options.includes(item))) : [];
      return { base, equipment };
    }
  } catch { /* use a safe default */ }
  return { ...RPG_DEFAULT_LOOK, equipment: [] };
}

function Preview({ look }: { look: RpgLook }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const animator = new CharacterAnimator('character-creator-preview');
    let raf = 0;
    const frame = (now: number) => {
      canvas.width = Math.max(1, Math.floor(canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1)));
      canvas.height = Math.max(1, Math.floor(canvas.clientHeight * Math.min(2, window.devicePixelRatio || 1)));
      g.setTransform(canvas.width / 220, 0, 0, canvas.height / 200, 0, 0);
      g.clearRect(0, 0, 220, 200);
      animator.update({ x: 0, y: 0, moving: false, facing: 'down', nowMs: now });
      drawIsoCharacter({ g, x: 110, y: 176, look: lookRef.current, nowMs: now, animator, size: 154, shadow: true });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} className="rpg-creator-preview" aria-label="Live preview of the selected RPG model" />;
}

interface Props {
  onConfirm: (look: RpgLook) => void;
  onCancel: () => void;
}
export default function RpgCharacterCreator({ onConfirm, onCancel }: Props) {
  const [base, setBase] = useState<RpgBase>(() => loadInitialLook().base);
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const initial = loadInitialLook();
    const result: Record<string, string> = {};
    for (const item of initial.equipment) {
      for (const [slot, data] of Object.entries(SLOTS)) if (data.options.includes(item)) result[slot] = item;
    }
    return result;
  });
  const look: RpgLook = {
    base,
    // Stable render order: lower body, torso, arms, head, hair/beard, weapon and shield.
    equipment: ['legs', 'torso', 'arms', 'head', 'hair', 'beard', 'weapon', 'shield'].map((slot) => selected[slot]).filter((item): item is string => Boolean(item)),
  };
  const choose = (slot: string, value: string) => {
    setSelected((current) => {
      const next = { ...current };
      if (value) next[slot] = value;
      else delete next[slot];
      return next;
    });
  };
  const confirm = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(look)); } catch { /* session still works */ }
    onConfirm(look);
  };
  return (
    <section className="character-creator" aria-label="Isometric RPG character creation" data-testid="rpg-character-creator">
      <div className="character-creator-card rpg-character-creator-card">
        <span className="main-menu-kicker">THE FAR MEADOW · RPG MODEL WORKSHOP</span>
        <h1>Create Your Character</h1>
        <p className="creator-sub">Build your hero from the new animated RPG models. This creator does not use the retired 2D sprite sheets.</p>
        <div className="rpg-creator-layout">
          <div className="rpg-creator-preview-pane">
            <Preview look={look} />
            <span className="creator-preview-label">Live 8-direction model preview</span>
            <label className="creator-group">
              <span className="creator-group-title">Body model</span>
              <select className="rpg-creator-select" value={base} onChange={(event) => setBase(event.target.value as RpgBase)}>
                {RPG_BASES.map((model) => <option key={model} value={model}>{model.replace(/^Base/, '')}</option>)}
              </select>
            </label>
          </div>
          <div className="rpg-creator-options">
            {Object.entries(SLOTS).map(([slot, data]) => (
              <label className="creator-group" key={slot}>
                <span className="creator-group-title">{data.label}</span>
                <select className="rpg-creator-select" value={selected[slot] || ''} onChange={(event) => choose(slot, event.target.value)}>
                  <option value="">None / default</option>
                  {data.options.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            ))}
            <p className="rpg-creator-note">Some clothing, hair, armor and weapon PNGs are listed in the asset manifest but are not yet installed in the live asset directory. Those selections will render once their matching animated files are added; the selected base model remains visible.</p>
          </div>
        </div>
        <div className="creator-actions">
          <button type="button" className="main-menu-button" onClick={onCancel}>Back</button>
          <button type="button" className="main-menu-button" onClick={confirm} data-testid="button-confirm-rpg-character">Begin Adventure</button>
        </div>
      </div>
      <style>{`
        .rpg-character-creator-card{max-height:92vh;overflow:auto}
        .rpg-creator-layout{display:grid;grid-template-columns:minmax(190px, .85fr) minmax(250px, 1.15fr);gap:20px;align-items:start}
        .rpg-creator-preview-pane{display:flex;flex-direction:column;gap:10px;align-items:stretch}
        .rpg-creator-preview{display:block;width:100%;height:260px;background:radial-gradient(ellipse at center bottom,#263b31 0%,#14231e 65%,#101a17 100%);border:1px solid #365246;border-radius:12px}
        .rpg-creator-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .rpg-creator-select{width:100%;min-height:42px;border:1px solid #53675b;border-radius:8px;background:#17251f;color:#f0f5f0;padding:8px;font:inherit}
        .rpg-creator-note{grid-column:1/-1;font-size:12px;line-height:1.45;color:#aebeb3;margin:4px 0}
        @media(max-width:620px){.rpg-creator-layout{grid-template-columns:1fr}.rpg-creator-preview{height:220px}.rpg-creator-options{grid-template-columns:1fr 1fr}}
      `}</style>
    </section>
  );
}
