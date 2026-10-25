import { useRef } from 'react';

/**
 * Touch D-pad for phones/tablets. It dispatches the same keyboard events as
 * WASD, so the isolated renderer keeps one movement path for touch and keys.
 */
export default function Engine3DTouchControls() {
  const active = useRef(new Set<string>());
  const press = (key: string) => {
    if (active.current.has(key)) return;
    active.current.add(key);
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  };
  const release = (key: string) => {
    if (!active.current.delete(key)) return;
    window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  };
  const button = (key: string, label: string, gridColumn: string, gridRow: string) => (
    <button
      key={key}
      type="button"
      aria-label={label}
      onPointerDown={(event) => { event.preventDefault(); press(key); }}
      onPointerUp={() => release(key)}
      onPointerCancel={() => release(key)}
      onPointerLeave={() => release(key)}
      style={{
        gridColumn, gridRow, width: 52, height: 48, borderRadius: 10,
        border: '1px solid #c4d1bd', background: '#172c23e8', color: '#fff',
        fontSize: 20, fontWeight: 800, touchAction: 'none', userSelect: 'none',
      }}
    >{key === 'w' ? '▲' : key === 'a' ? '◀' : key === 's' ? '▼' : '▶'}</button>
  );
  return <div aria-label="Touch movement controls" style={{
    position: 'fixed', zIndex: 20002, bottom: 'max(18px, env(safe-area-inset-bottom))',
    right: 14, display: 'grid', gridTemplateColumns: '52px 52px 52px',
    gridTemplateRows: '48px 48px 48px', gap: 5, touchAction: 'none',
  }}>
    {button('w', 'Move forward', '2', '1')}
    {button('a', 'Move left', '1', '2')}
    {button('s', 'Move backward', '2', '2')}
    {button('d', 'Move right', '3', '2')}
  </div>;
}
