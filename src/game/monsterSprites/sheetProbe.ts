// Runtime probe for monster sheet PNGs.
// The JSON defs are bundled, but the PNGs ship as separate files — a bad
// deploy or a renamed asset can 404 a sheet and leave monsters invisible.
// This probes each sheet once per session; failures are sticky for the
// session (a sheet that later appears does not swap an NPC mid-session).

import { SHEET_KINDS, spriteDefFor } from './index';

const FAILED_SHEETS: Set<string> = new Set();
const LISTENERS: Set<() => void> = new Set();
let PROBE_STARTED = false;

function sheetUrls(): string[] {
  const urls: string[] = [];
  for (const kind of SHEET_KINDS) {
    const def = spriteDefFor(kind);
    if (def && def.spriteSheet && !urls.includes(def.spriteSheet)) urls.push(def.spriteSheet);
  }
  return urls;
}

/** Start probing all monster sheets (idempotent, browser-only). */
export function probeMonsterSheets(): void {
  if (PROBE_STARTED) return;
  PROBE_STARTED = true;
  if (typeof Image === 'undefined') return; // sim / non-browser runtimes
  for (const url of sheetUrls()) {
    const img = new Image();
    img.onload = () => { /* healthy */ };
    img.onerror = () => {
      if (FAILED_SHEETS.has(url)) return;
      FAILED_SHEETS.add(url);
      for (const listener of LISTENERS) {
        try { listener(); } catch { /* never break the game on a listener */ }
      }
    };
    img.src = url;
  }
}

/** True when the sheet PNG failed to load this session. */
export function isMonsterSheetFailed(spriteSheet: string | undefined): boolean {
  return !!spriteSheet && FAILED_SHEETS.has(spriteSheet);
}

/** Subscribe to sheet failures (returns an unsubscribe). */
export function onMonsterSheetFailure(listener: () => void): () => void {
  LISTENERS.add(listener);
  return () => { LISTENERS.delete(listener); };
}

/** Test-only hook. */
export function clearSheetProbeState(): void {
  FAILED_SHEETS.clear();
  LISTENERS.clear();
  PROBE_STARTED = false;
}
