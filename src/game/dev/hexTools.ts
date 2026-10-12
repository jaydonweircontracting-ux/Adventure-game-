/**
 * Hexadecimal-aware development utilities (BUILD 678).
 *
 * Purpose: faster, more deterministic inspection of game data —
 * fingerprints, palette diagnostics, binary comparisons, asset metadata.
 *
 * Rule: use hex where it provides a real advantage (compact fingerprints,
 * byte-level diffs, color inspection). Do NOT convert ordinary game logic,
 * coordinates, or readable config to hex.
 */

/** Convert bytes to lowercase hex string. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/** Parse a hex string into bytes. Throws on invalid input with position. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '').toLowerCase();
  if (clean.length === 0) return new Uint8Array(0);
  if (clean.length % 2 !== 0) {
    throw new Error(`hexToBytes: odd length at position ${clean.length}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    const pair = clean.slice(i, i + 2);
    if (!/^[0-9a-f]{2}$/.test(pair)) {
      throw new Error(`hexToBytes: invalid hex at position ${i}: "${pair}"`);
    }
    out[i / 2] = parseInt(pair, 16);
  }
  return out;
}

/** Validate hex string; returns null if valid, else error description. */
export function validateHex(hex: string): string | null {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) return `odd length (${clean.length})`;
  const m = /[^0-9a-fA-F]/.exec(clean);
  if (m) return `invalid character "${m[0]}" at position ${m.index}`;
  return null;
}

/**
 * Convert integer to fixed-width hex with explicit overflow handling.
 * Throws if value doesn't fit in the requested byte width.
 */
export function intToHex(value: number, bytes: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`intToHex: expected non-negative integer, got ${value}`);
  }
  const max = Math.pow(256, bytes) - 1;
  if (value > max) {
    throw new Error(`intToHex: ${value} overflows ${bytes} bytes (max ${max})`);
  }
  return value.toString(16).padStart(bytes * 2, '0');
}

/** Format RGB as #RRGGBB. */
export function rgbToHex(r: number, g: number, b: number): string {
  for (const [name, v] of [['r', r], ['g', g], ['b', b]] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 255) {
      throw new Error(`rgbToHex: ${name}=${v} out of range 0-255`);
    }
  }
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Format RGBA as #RRGGBBAA. */
export function rgbaToHex(r: number, g: number, b: number, a: number): string {
  for (const [name, v] of [['r', r], ['g', g], ['b', b], ['a', a]] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 255) {
      throw new Error(`rgbaToHex: ${name}=${v} out of range 0-255`);
    }
  }
  return '#' + [r, g, b, a].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Parse #RRGGBB or #RRGGBBAA into channels. Throws on invalid input. */
export function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  if (clean.length !== 6 && clean.length !== 8) {
    throw new Error(`hexToRgba: expected 6 or 8 hex digits, got "${hex}"`);
  }
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`hexToRgba: invalid hex in "${hex}"`);
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
    a: clean.length === 8 ? parseInt(clean.slice(6, 8), 16) : 255,
  };
}

/**
 * Compare two buffers; return null if equal, else first differing byte info.
 */
export function diffBuffers(a: Uint8Array, b: Uint8Array): { index: number; a: number; b: number } | null {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return { index: i, a: a[i], b: b[i] };
  }
  if (a.length !== b.length) {
    return { index: len, a: a[len] ?? -1, b: b[len] ?? -1 };
  }
  return null;
}

/**
 * Compact hex preview of binary data (first N bytes + length).
 */
export function hexPreview(bytes: Uint8Array, maxBytes: number = 16): string {
  const shown = bytes.slice(0, maxBytes);
  const hex = bytesToHex(shown);
  return bytes.length > maxBytes ? `${hex}…(${bytes.length}B)` : `${hex}(${bytes.length}B)`;
}

/**
 * Stable hex fingerprint from a string (FNV-1a 32-bit).
 * For dev diagnostics and change detection — NOT cryptographic.
 */
export function fingerprintStr(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
