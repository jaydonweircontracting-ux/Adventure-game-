// BUILD 957: game audio — music tracks, SFX, zone resolution, settings.
// The game previously had only synthesized WebAudio blips (effects.ts
// playCombatSound, gated by the master `muted` flag). This module adds the
// first file-based audio: 5 user-supplied music tracks + 4 SFX sets, all
// under public/audio/. No second audio system: the synth blips are
// untouched, and the master mute still gates everything.
//
// SOURCES (recorded, no license terms claimed — none were supplied with
// the tracks, and no terms are invented here):
//   Music (user-supplied MP3s, filenames recorded verbatim):
//     title   geoffharvey-finding-mithral-openworld-game-375527.mp3
//     tavern  kaazoom-the-happy-whistler-1-min-edit-532435_2.mp3
//     town    kaazoom-embers-on-the-flagstone-full-version-medieval-tavern-rpg-music-616112.mp3
//     dungeon nojisuma-ruins-168316.mp3
//     fields  kaazoom-embers-on-the-flagstone-seamless-loop-medieval-tavern-rpg-616137.mp3
//   SFX (freesound, IDs recorded; authors from filenames):
//     coin    freesound ID 384921 (gamestudio, drop-coin)
//     map     freesound ID 384948 (gamestudio, open-map)
//     attack  freesound IDs 544351 (female fighter heavy grunt),
//             520933 / 520841 (male soldier grunts),
//             582547 / 544355 (male fighter heavy grunts) — all phatphrogstudio
//     fire    yodguard-fire-magic-5-378639.mp3 (user-supplied)
// DO NOT SWAP THE TWO EMBERS CUTS: town = the 2:08 full version
// (4,111,104 bytes), fields = the 0:36 seamless loop (1,151,232 bytes).

export type MusicTrackId = 'title' | 'tavern' | 'town' | 'dungeon' | 'fields';

export interface MusicTrack {
  id: MusicTrackId;
  title: string;
  file: string;
  /** Exact source size in bytes (verified at ship time). */
  sizeBytes: number;
  /** Approximate duration, for the music-list display only. */
  durationLabel: string;
  /** All music tracks loop while their zone is active. The fields cut is
   * seamless by construction; the others restart via the element loop
   * flag, so they may have a tiny gap at the loop point (stated). */
  loop: true;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  { id: 'title', title: 'Finding Mithral', file: 'geoffharvey-finding-mithral-openworld-game-375527.mp3', sizeBytes: 4136960, durationLabel: '2:09', loop: true },
  { id: 'tavern', title: 'The Happy Whistler', file: 'kaazoom-the-happy-whistler-1-min-edit-532435_2.mp3', sizeBytes: 1925376, durationLabel: '1:00', loop: true },
  { id: 'town', title: 'Embers on the Flagstone (full version)', file: 'kaazoom-embers-on-the-flagstone-full-version-medieval-tavern-rpg-music-616112.mp3', sizeBytes: 4111104, durationLabel: '2:08', loop: true },
  { id: 'dungeon', title: 'Ruins', file: 'nojisuma-ruins-168316.mp3', sizeBytes: 4773093, durationLabel: '2:29', loop: true },
  { id: 'fields', title: 'Embers on the Flagstone (seamless loop)', file: 'kaazoom-embers-on-the-flagstone-seamless-loop-medieval-tavern-rpg-616137.mp3', sizeBytes: 1151232, durationLabel: '0:36', loop: true },
];

export const MUSIC_TRACK_BY_ID: Record<MusicTrackId, MusicTrack> = Object.fromEntries(
  MUSIC_TRACKS.map((t) => [t.id, t]),
) as Record<MusicTrackId, MusicTrack>;

/** Total shipped audio size: 16,543,648 bytes (13 files). */
export const TOTAL_AUDIO_BYTES =
  MUSIC_TRACKS.reduce((sum, t) => sum + t.sizeBytes, 0) +
  35108 + 18390 + 257280 + 27585 + 34560 + 23040 + 27648 + 22272;

export type SfxId = 'coin' | 'map-open' | 'fireball' | 'attack-female' | 'attack-male-1' | 'attack-male-2' | 'attack-male-3' | 'attack-male-4';

export const SFX_FILES: Record<SfxId, string> = {
  coin: 'freesound_gamestudio-drop-coin-384921.mp3',
  'map-open': 'freesound_gamestudio-open-map-384948.mp3',
  fireball: 'yodguard-fire-magic-5-378639.mp3',
  'attack-female': 'phatphrogstudio-female-fighter-voice-heavy-attack-grunt-544351.mp3',
  'attack-male-1': 'phatphrogstudio-male-soldier-voice-attack-grunt-2-520933.mp3',
  'attack-male-2': 'phatphrogstudio-male-soldier-voice-attack-grunt-520841.mp3',
  'attack-male-3': 'phatphrogstudio-male-fighter-voice-2-heavy-attack-grunt-582547.mp3',
  'attack-male-4': 'phatphrogstudio-male-fighter-voice-heavy-attack-grunt-544355.mp3',
};

const MALE_GRUNTS: SfxId[] = ['attack-male-1', 'attack-male-2', 'attack-male-3', 'attack-male-4'];
const ALL_GRUNTS: SfxId[] = ['attack-female', ...MALE_GRUNTS];

/**
 * Attack-grunt mapping (exact, stated):
 * - gender 'female' -> the single female clip, every time.
 * - gender 'male' -> the 4 male clips cycled deterministically by the
 *   caller's counter (counter % 4), so one fighter varies his grunts.
 * - gender null/unknown (the player — CharacterChoices carries no gender
 *   field — and any NPC missing gender data) -> round-robin over ALL 5
 *   clips by the same counter. This is a deliberately gender-neutral
 *   fallback: unknown gender is never silently treated as male.
 * Pure: the counter is supplied by the caller (the engine keeps its own).
 */
export function attackGruntFor(gender: 'male' | 'female' | null, counter: number): SfxId {
  if (gender === 'female') return 'attack-female';
  if (gender === 'male') return MALE_GRUNTS[((counter % 4) + 4) % 4];
  return ALL_GRUNTS[((counter % 5) + 5) % 5];
}

export interface MusicZoneInput {
  /** Title screen visible (no game mounted). Highest priority. */
  menuOpen: boolean;
  /** Stone Soup dungeon overlay open. Beats tavern/town/fields. */
  dungeonOpen: boolean;
  /** Player inside a tavern interior (roomType === 'tavern'). Beats town/fields. */
  inTavern: boolean;
  /** Settlement id for the current chunk (townIdForChunk), or null.
   * Any settlement — Mosslight Crossing (4,7) or any other town/village —
   * plays the town track; wilderness (null) plays the fields track. */
  townId: string | null;
}

/**
 * Zone -> track resolution, one music stream at a time. Priority, stated:
 * title > dungeon > tavern > town (any settlement) > fields (wilderness,
 * pastures, and every non-settlement chunk). Non-tavern interiors (houses,
 * guild, chapel, shops, cellar) do NOT swap the track — the area track
 * keeps playing under them. Pure.
 */
export function resolveMusicZone(input: MusicZoneInput): MusicTrackId {
  if (input.menuOpen) return 'title';
  if (input.dungeonOpen) return 'dungeon';
  if (input.inTavern) return 'tavern';
  if (input.townId !== null) return 'town';
  return 'fields';
}

export interface AudioSettings {
  musicOn: boolean;
  /** 0..1 */
  musicVolume: number;
  sfxOn: boolean;
  /** 0..1 */
  sfxVolume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicOn: true,
  musicVolume: 0.7,
  sfxOn: true,
  sfxVolume: 0.9,
};

export const AUDIO_SETTINGS_KEY = 'ag-audio-settings';

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

/** Sanitized load: garbage or partial JSON merges onto the defaults. Pure. */
export function sanitizeAudioSettings(value: unknown): AudioSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_AUDIO_SETTINGS };
  const v = value as Partial<AudioSettings>;
  return {
    musicOn: typeof v.musicOn === 'boolean' ? v.musicOn : DEFAULT_AUDIO_SETTINGS.musicOn,
    musicVolume: clamp01(v.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
    sfxOn: typeof v.sfxOn === 'boolean' ? v.sfxOn : DEFAULT_AUDIO_SETTINGS.sfxOn,
    sfxVolume: clamp01(v.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume),
  };
}

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    return sanitizeAudioSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private browsing: settings still apply for the session */
  }
}

/**
 * Minimal file-audio engine. One HTMLAudioElement for music (the
 * one-stream rule: setTrack replaces the source, never layers), fresh
 * one-shot elements for SFX (they may overlap each other). Safe in Node
 * (no window/Audio): every method no-ops, so standalone tests can import
 * this module. Settings are read from localStorage on each SFX play so
 * the engine never drifts from the React state that writes them; the
 * master `muted` flag (React state, NOT persisted) is pushed in via
 * setMasterMuted by App.
 *
 * Autoplay rule: browsers block play() before any user gesture. The
 * engine stays locked until unlock() is called from a real gesture
 * handler (App's first-tap listener on the title screen); setTrack
 * before unlock only records the pending track, and unlock() starts it.
 */
export class AudioEngine {
  private musicEl: HTMLAudioElement | null = null;
  private currentTrack: MusicTrackId | null = null;
  private unlocked = false;
  private masterMuted = false;
  private attackCounter = 0;
  private lastSfx: { id: SfxId; at: number } | null = null;

  private audioSupported(): boolean {
    return typeof window !== 'undefined' && typeof window.Audio !== 'undefined';
  }

  setMasterMuted(muted: boolean): void {
    this.masterMuted = muted;
    if (this.musicEl) this.musicEl.muted = muted;
  }

  /** Called from a real user gesture. Starts any pending track. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.currentTrack && this.musicEl && !this.masterMuted) {
      const p = this.musicEl.play();
      if (p) p.catch(() => { /* autoplay still blocked; next gesture retries via setTrack */ });
    }
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  getCurrentTrack(): MusicTrackId | null {
    return this.currentTrack;
  }

  isMusicPlaying(): boolean {
    return this.currentTrack !== null && this.musicEl !== null && !this.musicEl.paused;
  }

  getLastSfx(): { id: SfxId; at: number } | null {
    return this.lastSfx;
  }

  /** One stream at a time: same track + same element = no-op (except
   * volume/mute application). Null stops the music. */
  setTrack(track: MusicTrackId | null, settings: AudioSettings): void {
    this.currentTrack = track;
    if (!this.audioSupported()) return;
    if (!this.musicEl) {
      this.musicEl = new window.Audio();
      this.musicEl.loop = true;
      this.musicEl.preload = 'auto';
    }
    if (track === null) {
      this.musicEl.pause();
      this.musicEl.removeAttribute('src');
      return;
    }
    const url = musicUrl(track);
    // Reuse the element when already on this track (no restart on
    // unrelated re-renders); otherwise swap source exactly once.
    if (this.musicEl.getAttribute('data-track') === track && this.musicEl.src) {
      this.applyMusicSettings(settings);
      return;
    }
    this.musicEl.setAttribute('data-track', track);
    this.musicEl.src = url;
    this.musicEl.loop = true;
    this.applyMusicSettings(settings);
    if (!this.unlocked || !settings.musicOn || this.masterMuted) return;
    const p = this.musicEl.play();
    if (p) p.catch(() => { /* blocked before gesture; unlock() retries */ });
  }

  applyMusicSettings(settings: AudioSettings): void {
    if (!this.musicEl) return;
    this.musicEl.volume = settings.musicVolume;
    this.musicEl.muted = this.masterMuted;
    if (!settings.musicOn) {
      this.musicEl.pause();
    } else if (this.unlocked && !this.masterMuted && this.currentTrack && this.musicEl.paused && this.musicEl.src) {
      const p = this.musicEl.play();
      if (p) p.catch(() => { /* ignore */ });
    }
  }

  playSfx(id: SfxId): void {
    this.lastSfx = { id, at: Date.now() };
    if (!this.audioSupported()) return;
    if (this.masterMuted) return;
    const settings = loadAudioSettings();
    if (!settings.sfxOn) return;
    try {
      const el = new window.Audio(sfxUrl(id));
      el.volume = settings.sfxVolume;
      const p = el.play();
      if (p) p.catch(() => { /* blocked before gesture; harmless */ });
    } catch {
      /* audio unavailable; never crash gameplay */
    }
  }

  /** Grunt for an attacker: gendered pool or the neutral fallback. */
  playAttackGrunt(gender: 'male' | 'female' | null): void {
    const id = attackGruntFor(gender, this.attackCounter);
    this.attackCounter += 1;
    this.playSfx(id);
  }
}

export const audioEngine = new AudioEngine();

/** Public-asset URL with the same ?v=<build> cache-busting as artUrl. */
export function musicUrl(track: MusicTrackId): string {
  const base = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';
  const build = (typeof window !== 'undefined' && (window as unknown as { __AG_BUILD?: string }).__AG_BUILD) || '957';
  return `${base}audio/${MUSIC_TRACK_BY_ID[track].file}?v=${build}`;
}

export function sfxUrl(id: SfxId): string {
  const base = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';
  const build = (typeof window !== 'undefined' && (window as unknown as { __AG_BUILD?: string }).__AG_BUILD) || '957';
  return `${base}audio/${SFX_FILES[id]}?v=${build}`;
}
