// inventoryPanel3d.tsx — NEURON HEX 0x2B (BUILD 1108). The inventory panel.
//
// The Minecraft-style inventory UI: a 9-column slot grid, an equip row
// (weapon / tool / armor) and a detail row for the selected slot. The
// panel holds NO game logic — every action goes back to the view, which
// runs the pure slot ops in playerInventory.ts and owns the state.
//
// Interaction: pointer events do everything (mouse + touch, one path).
// pointerdown records the drag source; pointerup on a different slot
// moves/merges/swaps; pointerup on the same slot is a tap — it selects
// the slot, or drops a picked-up stack there. There is deliberately NO
// onClick on the slots: a drag's tail click lands on the nearest common
// ancestor of the down/up targets (the grid), and routing selection
// through click as well would double-apply the drop. (The first version
// selected through click and guarded the drag with a suppress flag — the
// flag stayed set after a drag because the tail click never reached a
// slot, so the tap after a drag did nothing. Caught by the 1108 probe.)
// Follows the BuildPanel pattern (0x2A): the view passes its panel
// state and handlers in as props.
import { useRef, useState } from 'react';
import { equipSlotFor, itemMetaFor, stackMaxFor, type EquipSlotId, type PlayerInventoryLayout } from './playerInventory';
import { maxDurabilityFor, type HandRecipe } from './gathering';

export interface InventoryPanelProps {
  open: boolean;
  layout: PlayerInventoryLayout;
  onMove: (from: number, to: number) => void;
  onSplit: (index: number) => void;
  onEquip: (index: number) => void;
  onUnequip: (slot: EquipSlotId) => void;
  onClose: () => void;
  /** BUILD 1110 (0x2D): hand-crafting — the recipes with their
   *  current affordability (the view computes canCraft from the
   *  registry player store). The panel stays presentational: it
   *  never touches the registry itself. */
  recipes: Array<{ recipe: HandRecipe; canCraft: boolean }>;
  onCraft: (id: string) => void;
}

const EQUIP_LABELS: Array<{ id: EquipSlotId; label: string }> = [
  { id: 'weapon', label: 'Weapon' },
  { id: 'tool', label: 'Tool' },
  { id: 'armor', label: 'Armor' },
];

export function InventoryPanel(props: InventoryPanelProps) {
  const { open, layout, onMove, onSplit, onEquip, onUnequip, onClose, recipes, onCraft } = props;
  const [selected, setSelected] = useState<number | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const dragFromRef = useRef<number | null>(null);
  if (!open) return null;
  const selectedSlot = selected !== null ? layout.slots[selected] : null;
  const selectedMeta = selectedSlot && selectedSlot.kind ? itemMetaFor(selectedSlot.kind) : null;
  const selectedEquipSlot = selectedSlot && selectedSlot.kind ? equipSlotFor(selectedSlot.kind) : null;
  const selectedAlreadyEquipped = selectedEquipSlot ? layout.equipped[selectedEquipSlot] === selectedSlot?.kind : false;
  // Tap on a slot: select it — or, when a filled slot is already picked
  // up, drop that stack here (move / merge / swap, same as a drag).
  // Tapping the selected slot again puts it down (deselects).
  const handleSlotTap = (i: number) => {
    if (selected !== null && selected !== i) {
      const picked = layout.slots[selected];
      if (picked && picked.kind) { onMove(selected, i); setSelected(null); return; }
    }
    setSelected(selected === i ? null : i);
  };
  const slotStyle = (isSelected: boolean, isDragSource: boolean): React.CSSProperties => ({
    width: 38,
    height: 38,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    border: '1px solid ' + (isSelected ? '#e8c96a' : isDragSource ? '#7fb069' : '#5a6b5e'),
    borderRadius: 6,
    background: isSelected ? '#3a4a2e' : '#22392d',
    color: '#fff',
    fontSize: 20,
    lineHeight: 1,
    touchAction: 'none',
    userSelect: 'none',
    cursor: 'pointer',
  });
  return (
    <div data-testid="inventory-panel" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 386, maxWidth: 'calc(100vw - 16px)', maxHeight: '86vh', overflowY: 'auto', padding: '10px 12px', borderRadius: 10, background: '#14241df2', color: '#fff', fontSize: 12, zIndex: 40, boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>🎒 Inventory</span>
        <button type="button" data-testid="inventory-close" aria-label="Close inventory" onClick={onClose} style={{ padding: '2px 10px', border: '1px solid #c4d1bd', borderRadius: 6, background: '#22392d', color: '#fff', fontWeight: 700, fontSize: 12 }}>✕</button>
      </div>
      {/* Equip row: what the player carries ready — tap an occupied box to unequip it back into the grid. */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {EQUIP_LABELS.map(({ id, label }) => {
          const kind = layout.equipped[id];
          const meta = kind ? itemMetaFor(kind) : null;
          return (
            <button key={id} type="button" data-testid={'equip-' + id} aria-label={label + ' slot' + (kind ? ': ' + (meta ? meta.name : kind) : ' (empty)')} title={label + (kind && meta ? ': ' + meta.name : ' (empty)')} onClick={() => { if (kind) onUnequip(id); }} style={{ flex: 1, height: 46, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, border: '1px solid #5a6b5e', borderRadius: 6, background: '#22392d', color: '#fff', fontSize: 10 }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{meta ? meta.icon : '—'}</span>
              <span>{label}{kind && meta ? ' · ' + meta.name : ''}</span>
              {kind && maxDurabilityFor(kind) !== null ? (
                <span style={{ opacity: 0.75 }}>{layout.equippedDurability[id] ?? maxDurabilityFor(kind)}/{maxDurabilityFor(kind)}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {/* Slot grid: 9 columns. Drag a filled slot onto another to move /
          merge / swap; tap one to select it, tap another to drop it there. */}
      <div data-testid="inventory-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 38px)', gap: 4, marginTop: 10, justifyContent: 'center' }}>
        {layout.slots.map((slot, i) => {
          const meta = slot.kind ? itemMetaFor(slot.kind) : null;
          return (
            <div
              key={i}
              data-testid={'inv-slot-' + i}
              data-kind={slot.kind ?? ''}
              data-qty={slot.qty}
              data-selected={selected === i}
              title={meta ? meta.name + (slot.qty > 1 ? ' ×' + slot.qty : '') : 'Empty slot'}
              style={slotStyle(selected === i, dragFrom === i)}
              onPointerDown={(e) => { e.preventDefault(); dragFromRef.current = i; setDragFrom(i); }}
              onPointerUp={() => {
                const from = dragFromRef.current;
                dragFromRef.current = null;
                setDragFrom(null);
                if (from === null) return;
                if (from !== i) { onMove(from, i); return; }
                handleSlotTap(i);
              }}
            >
              {meta ? <span>{meta.icon}</span> : null}
              {slot.qty > 1 ? <span style={{ position: 'absolute', right: 2, bottom: 1, fontSize: 10, fontWeight: 700, textShadow: '0 1px 2px #000' }}>{slot.qty}</span> : null}
            </div>
          );
        })}
      </div>
      {/* Detail row for the selected slot. */}
      <div style={{ marginTop: 10, minHeight: 54, padding: '8px 10px', border: '1px solid #5a6b5e', borderRadius: 6, background: '#1c2f26' }}>
        {selectedSlot && selectedSlot.kind && selectedMeta ? (
          <div>
            <div style={{ fontWeight: 800 }}>{selectedMeta.icon} {selectedMeta.name}{selectedSlot.qty > 1 ? ' ×' + selectedSlot.qty : ''}</div>
            <div style={{ marginTop: 2, opacity: 0.9 }}>{selectedMeta.description}</div>
            <div style={{ marginTop: 2, opacity: 0.75 }}>Stacks to {stackMaxFor(selectedSlot.kind)}{selectedEquipSlot ? ' · Fits the ' + selectedEquipSlot + ' slot' : ''}{selectedSlot.kind && maxDurabilityFor(selectedSlot.kind) !== null ? ' · Durability ' + (selectedSlot.durability ?? maxDurabilityFor(selectedSlot.kind)) + '/' + maxDurabilityFor(selectedSlot.kind) : ''}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button type="button" data-testid="inv-split" disabled={selectedSlot.qty < 2} onClick={() => onSplit(selected as number)} style={{ padding: '4px 10px', border: '1px solid #c4d1bd', borderRadius: 6, background: selectedSlot.qty < 2 ? '#3a4a3f' : '#22392d', color: '#fff', fontWeight: 700, fontSize: 12, opacity: selectedSlot.qty < 2 ? 0.5 : 1 }}>Split</button>
              {selectedEquipSlot ? (
                <button type="button" data-testid="inv-equip" disabled={selectedAlreadyEquipped} onClick={() => onEquip(selected as number)} style={{ padding: '4px 10px', border: '1px solid #c4d1bd', borderRadius: 6, background: selectedAlreadyEquipped ? '#3a4a3f' : '#3f7d4e', color: '#fff', fontWeight: 700, fontSize: 12, opacity: selectedAlreadyEquipped ? 0.5 : 1 }}>{selectedAlreadyEquipped ? 'Equipped' : 'Equip'}</button>
              ) : null}
            </div>
          </div>
        ) : (
          <div style={{ opacity: 0.75 }}>Tap a slot to see what it holds. Drag a slot onto another to move it — same kind stacks merge, different kinds swap. Split halves a stack into an empty slot. Tap a selected slot again to put it down.</div>
        )}
      </div>
      {/* BUILD 1110 (0x2D): hand-crafting — sticks, torches and the
          four basic tools, made here from what you carry. No station
          needed; the stations (workbench, blacksmith, furnace) are
          0x2E. A recipe you cannot afford is greyed out, never a
          surprise — the button tells you what it costs. */}
      <div style={{ marginTop: 10, padding: '8px 10px', border: '1px solid #5a6b5e', borderRadius: 6, background: '#1c2f26' }}>
        <div style={{ fontWeight: 800 }}>🔨 Hand-crafting</div>
        {recipes.map(({ recipe, canCraft }) => (
          <div key={recipe.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
            <span style={{ opacity: canCraft ? 1 : 0.6 }}>{recipe.name}{recipe.productQty > 1 ? ' ×' + recipe.productQty : ''} <span style={{ opacity: 0.75 }}>— {recipe.materials.map((m) => m.qty + ' ' + m.kind).join(' + ')}</span></span>
            <button type="button" data-testid={'craft-' + recipe.id} disabled={!canCraft} onClick={() => onCraft(recipe.id)} style={{ padding: '3px 10px', border: '1px solid #c4d1bd', borderRadius: 6, background: canCraft ? '#3f7d4e' : '#3a4a3f', color: '#fff', fontWeight: 700, fontSize: 12, opacity: canCraft ? 1 : 0.5 }}>Craft</button>
          </div>
        ))}
      </div>
    </div>
  );
}
