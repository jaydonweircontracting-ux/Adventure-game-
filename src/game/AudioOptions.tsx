// BUILD 957: shared audio options section — ONE component rendered in
// BOTH the in-game options panel and the title-screen options overlay, so
// the controls can never drift apart. (The full in-game panel also carries
// debug/game actions that need a mounted game and cannot render pre-game;
// the audio section is the part meaningful on the title screen, and it is
// the same component in both hosts, not a copy.)
import { MUSIC_TRACKS, type AudioSettings, type MusicTrackId } from './audio';

interface AudioOptionsProps {
  settings: AudioSettings;
  onSettingsChange: (next: AudioSettings) => void;
  nowPlayingId: MusicTrackId | null;
  /** Manual play-from-list: plays the track now; the next zone change
   * clears the override and resumes zone music (App owns that rule). */
  onPlayTrack: (id: MusicTrackId) => void;
  /** Master mute (React state, not persisted) — rendered only when the
   * host passes it (the title overlay); the in-game panel already has
   * its own mute row above this section. */
  masterMuted?: boolean;
  onToggleMasterMute?: () => void;
}

export default function AudioOptions({ settings, onSettingsChange, nowPlayingId, onPlayTrack, masterMuted, onToggleMasterMute }: AudioOptionsProps) {
  const set = (patch: Partial<AudioSettings>) => onSettingsChange({ ...settings, ...patch });
  return (
    <div data-testid="audio-options" style={{ display: 'block' }}>
      {typeof masterMuted === 'boolean' && onToggleMasterMute && (
        <div className="options-sound-control">
          <div className="options-sound-info">
            <span><strong>All sound</strong><small>{masterMuted ? 'Everything is muted' : 'Sound is on'}</small></span>
          </div>
          <button className="options-sound-toggle" onClick={onToggleMasterMute} aria-pressed={masterMuted} data-testid="button-audio-master-mute">{masterMuted ? 'Turn on' : 'Mute'}</button>
        </div>
      )}
      <div className="options-sound-control" style={{ display: 'block' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <strong>🎵 Music</strong>
          <button className="options-sound-toggle" onClick={() => set({ musicOn: !settings.musicOn })} aria-pressed={settings.musicOn} data-testid="button-music-toggle">{settings.musicOn ? 'On' : 'Off'}</button>
        </div>
        <input aria-label="Music volume" data-testid="input-music-volume" type="range" min="0" max="100" step="5" value={Math.round(settings.musicVolume * 100)} onChange={(e) => set({ musicVolume: Number(e.target.value) / 100 })} style={{ width: '100%', minHeight: 30, touchAction: 'pan-y' }} />
        <small style={{ display: 'block', opacity: 0.8 }}>Music on/off and volume are saved on this device.</small>
      </div>
      <div className="options-sound-control" style={{ display: 'block' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <strong>🔊 Sound effects</strong>
          <button className="options-sound-toggle" onClick={() => set({ sfxOn: !settings.sfxOn })} aria-pressed={settings.sfxOn} data-testid="button-sfx-toggle">{settings.sfxOn ? 'On' : 'Off'}</button>
        </div>
        <input aria-label="Sound effects volume" data-testid="input-sfx-volume" type="range" min="0" max="100" step="5" value={Math.round(settings.sfxVolume * 100)} onChange={(e) => set({ sfxVolume: Number(e.target.value) / 100 })} style={{ width: '100%', minHeight: 30, touchAction: 'pan-y' }} />
        <small style={{ display: 'block', opacity: 0.8 }}>Effects have their own on/off and volume, separate from music.</small>
      </div>
      <div className="options-sound-control" style={{ display: 'block' }}>
        <strong>🎼 Music list</strong>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {MUSIC_TRACKS.map((track) => {
            const playing = nowPlayingId === track.id;
            return (
              <div key={track.id} data-testid={`music-list-row-${track.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: playing ? 800 : 400 }}>{playing ? '▶ ' : ''}{track.title}</span>
                  <small style={{ opacity: 0.75, marginLeft: 8 }}>{track.durationLabel}</small>
                  {playing && <small data-testid="music-now-playing" style={{ marginLeft: 8, color: '#7ddc9a', fontWeight: 700 }}>Now playing</small>}
                </span>
                <button className="options-sound-toggle" onClick={() => onPlayTrack(track.id)} data-testid={`button-play-track-${track.id}`}>{playing ? 'Playing' : 'Play'}</button>
              </div>
            );
          })}
        </div>
        <small style={{ display: 'block', opacity: 0.8, marginTop: 6 }}>Picking a track plays it now; moving to a new area resumes that area&apos;s music.</small>
      </div>
      <div style={{ fontSize: 11, opacity: 0.65, lineHeight: 1.5 }}>
        Audio credits — music: Finding Mithral (geoffharvey), The Happy Whistler + Embers on the Flagstone (kaazoom), Ruins (nojisuma). Effects: freesound IDs 384921 + 384948 (gamestudio), 544351 / 520933 / 520841 / 582547 / 544355 (phatphrogstudio), fire magic (yodguard). No license terms are stated for these files; sources are recorded as supplied.
      </div>
    </div>
  );
}
