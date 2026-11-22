// stationPanel3d.tsx — NEURON HEX 0x2E (BUILD 1111). The crafting station panel.
//
// The panel for one placed station: its recipes, what each costs, which
// are unlocked, and a Craft button per recipe. The panel holds NO game
// logic — every action goes back to the view, which runs the registry
// withdraw/deposit and owns the state. Follows the InventoryPanel pattern
// (0x2B): the view passes its panel state and handlers in as props.
import { stationDefFor, type StationId, type StationRecipe } from './craftingStations';
import { itemMetaFor } from './playerInventory';

export interface StationPanelProps {
  open: boolean;
  station: StationId | null;
  recipes: Array<{ recipe: StationRecipe; canCraft: boolean; unlocked: boolean }>;
  onCraft: (id: string) => void;
  onClose: () => void;
}

export function StationPanel(props: StationPanelProps) {
  const { open, station, recipes, onCraft, onClose } = props;
  if (!open || !station) return null;
  const def = stationDefFor(station);
  return (
    <div data-testid="station-panel" data-station={station} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 386, maxWidth: 'calc(100vw - 16px)', maxHeight: '86vh', overflowY: 'auto', padding: '10px 12px', borderRadius: 10, background: '#14241df2', color: '#fff', fontSize: 12, zIndex: 40, boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>{def.icon} {def.name}</span>
        <button type="button" data-testid="station-close" aria-label="Close station" onClick={onClose} style={{ padding: '2px 10px', border: '1px solid #c4d1bd', borderRadius: 6, background: '#22392d', color: '#fff', fontWeight: 700, fontSize: 12 }}>✕</button>
      </div>
      <div style={{ marginTop: 4, opacity: 0.9 }}>{def.blurb}</div>
      <div style={{ marginTop: 10 }}>
        {recipes.map(({ recipe, canCraft, unlocked }) => {
          const productMeta = itemMetaFor(recipe.product);
          const lockedReason = !unlocked && recipe.unlock.kind === 'discover'
            ? 'Discover ' + itemMetaFor(recipe.unlock.material).name + ' to unlock'
            : null;
          return (
            <div key={recipe.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6, padding: '6px 8px', border: '1px solid #5a6b5e', borderRadius: 6, background: '#1c2f26' }}>
              <span style={{ opacity: unlocked ? 1 : 0.6 }}>
                <span style={{ fontWeight: 700 }}>{productMeta.icon} {recipe.name}</span>
                {recipe.productQty > 1 ? ' ×' + recipe.productQty : ''}
                <span style={{ opacity: 0.75 }}> — {recipe.materials.map((m) => m.qty + ' ' + itemMetaFor(m.kind).name).join(' + ')}</span>
                <span style={{ opacity: 0.6 }}> · {recipe.tier}</span>
                {lockedReason ? <span style={{ display: 'block', opacity: 0.8 }}>🔒 {lockedReason}</span> : null}
              </span>
              <button type="button" data-testid={'station-craft-' + recipe.id} disabled={!unlocked || !canCraft} onClick={() => onCraft(recipe.id)} style={{ padding: '3px 10px', border: '1px solid #c4d1bd', borderRadius: 6, background: unlocked && canCraft ? '#3f7d4e' : '#3a4a3f', color: '#fff', fontWeight: 700, fontSize: 12, opacity: unlocked && canCraft ? 1 : 0.5, flexShrink: 0 }}>Craft</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
