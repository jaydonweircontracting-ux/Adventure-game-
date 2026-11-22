// hotbar3d.tsx — NEURON HEX 0x2C (BUILD 1109). The 9-slot hotbar.
//
// Slots 0-8 of the SAME inventory the panel shows (playerInventory.ts)
// — never a second inventory. The bar is visible during play and
// auto-updates on pickup because it reads the view's live layout,
// which reconcileSlots() re-derives on every refresh. Tap a slot to
// select it (keys 1-9 do the same); tap the selected slot again — or
// the Use button — to use it (a meal restores 25 health; anything
// without a use effect cannot be used). Selection persists under its
// own key; the slots persist via 1108.
//
// Placement (measured from the 1108 probe shot, 390x844): the HUD
// block bottom-left is ~210px tall (top ≈ bottom:224), the right-side
// button stack runs Undo bottom:138..186 / Redo 200..248, and the
// Enter/Exit buttons sit at bottom:110 — so the bar floats at
// bottom:256, centered, clear of all of them (8px past Redo's top),
// over the terrain in front of the player. zIndex 5: above the
// canvas, below the inventory panel (40) and the door buttons (6).
// Follows the BuildPanel/InventoryPanel pattern: the view passes its
// state and handlers in as props; the component holds no game logic.
import { itemMetaFor, useEffectFor, type PlayerInventoryLayout } from './playerInventory';

export interface HotbarProps {
  layout: PlayerInventoryLayout;
  selected: number;
  onSelect: (index: number) => void;
  onUse: (index: number) => void;
}

const HOTBAR_BOTTOM_PX = 256;

export function Hotbar(props: HotbarProps) {
  const { layout, selected, onSelect, onUse } = props;
  const slots = layout.slots.slice(0, 9);
  const sel = slots[selected] ?? { kind: null, qty: 0 };
  const selMeta = sel.kind ? itemMetaFor(sel.kind) : null;
  const selUsable = sel.kind ? useEffectFor(sel.kind) !== null : false;
  return (
    <div data-testid="hotbar" style={{ position: 'absolute', left: '50%', bottom: HOTBAR_BOTTOM_PX, transform: 'translateX(-50%)', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, pointerEvents: 'auto' }}>
      {/* Selected-slot label + the Use button (only when usable). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 22, padding: '2px 8px', borderRadius: 6, background: 'rgba(20,36,29,0.85)', color: '#fff', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
        <span data-testid="hotbar-selected-label">{selMeta ? selMeta.icon + ' ' + selMeta.name + (sel.qty > 1 ? ' ×' + sel.qty : '') : 'Hotbar · tap a slot, or press 1–9'}</span>
        {selUsable ? (
          <button type="button" data-testid="hotbar-use" aria-label={'Use ' + (selMeta ? selMeta.name : 'selected item')} onClick={() => onUse(selected)} style={{ padding: '2px 10px', border: '1px solid #c4d1bd', borderRadius: 6, background: '#3f7d4e', color: '#fff', fontWeight: 700, fontSize: 11 }}>Use</button>
        ) : null}
      </div>
      <div data-testid="hotbar-slots" style={{ display: 'flex', gap: 4 }}>
        {slots.map((slot, i) => {
          const meta = slot.kind ? itemMetaFor(slot.kind) : null;
          const isSelected = selected === i;
          return (
            <div
              key={i}
              data-testid={'hotbar-slot-' + i}
              data-kind={slot.kind ?? ''}
              data-qty={slot.qty}
              data-selected={isSelected}
              title={meta ? meta.name + (slot.qty > 1 ? ' ×' + slot.qty : '') : 'Empty slot ' + (i + 1)}
              style={{
                width: 38,
                height: 38,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                border: '2px solid ' + (isSelected ? '#e8c96a' : '#5a6b5e'),
                borderRadius: 6,
                background: isSelected ? '#3a4a2e' : '#22392d',
                color: '#fff',
                fontSize: 20,
                lineHeight: 1,
                transform: isSelected ? 'translateY(-4px)' : 'none',
                touchAction: 'manipulation',
                userSelect: 'none',
                cursor: 'pointer',
              }}
              onClick={() => { if (isSelected) { if (selUsable) onUse(i); } else onSelect(i); }}
            >
              <span style={{ position: 'absolute', left: 2, top: 1, fontSize: 9, fontWeight: 700, opacity: 0.6 }}>{i + 1}</span>
              {meta ? <span>{meta.icon}</span> : null}
              {slot.qty > 1 ? <span style={{ position: 'absolute', right: 2, bottom: 1, fontSize: 10, fontWeight: 700, textShadow: '0 1px 2px #000' }}>{slot.qty}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
