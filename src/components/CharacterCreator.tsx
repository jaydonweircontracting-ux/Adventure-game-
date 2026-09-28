import { useEffect, useState } from 'react';
import {
  CharacterChoices,
  DEFAULT_CHARACTER,
  HAIR_COLORS,
  HAIR_COLOR_OPTIONS,
  OUTFITS,
  OUTFIT_OPTIONS,
  SKIN_OPTIONS,
  SKIN_TONES,
  compositeCharacterSheet,
} from '../game/characterCreator';

const PLAYER_SPRITE_URL = `${import.meta.env.BASE_URL}assets/cute-fantasy/player.png`;

interface CharacterCreatorProps {
  onConfirm: (choices: CharacterChoices) => void;
  onCancel: () => void;
}

function Swatch({
  label,
  selected,
  onSelect,
  style,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  style: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      className={'creator-thumb' + (selected ? ' is-selected' : '')}
      style={style}
      onClick={onSelect}
      aria-label={label}
      title={label}
      aria-pressed={selected}
    />
  );
}

export default function CharacterCreator({ onConfirm, onCancel }: CharacterCreatorProps) {
  const [choices, setChoices] = useState<CharacterChoices>({ ...DEFAULT_CHARACTER });
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    compositeCharacterSheet(choices, PLAYER_SPRITE_URL)
      .then((url) => {
        if (!cancelled) setSheetUrl(url);
      })
      .catch(() => {
        if (!cancelled) setSheetUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [choices]);

  const set = <K extends keyof CharacterChoices>(key: K, value: CharacterChoices[K]) =>
    setChoices((current) => ({ ...current, [key]: value }));

  const previewStyle = sheetUrl
    ? ({ backgroundImage: `url("${sheetUrl}")` } as React.CSSProperties)
    : undefined;

  return (
    <section className="character-creator" aria-label="Character creation" data-testid="character-creator">
      <div className="character-creator-card">
        <span className="main-menu-kicker">THE FAR MEADOW · NEW ADVENTURER</span>
        <h1>Create Your Character</h1>
        <p className="creator-sub">Choose a look. Your hero appears at this exact size in the world.</p>

        <div className="creator-body">
          <div className="creator-preview-pane">
            <div className="creator-portrait" style={previewStyle} aria-hidden="true" />
            <div className="creator-walk" style={previewStyle} aria-hidden="true" />
            <div className="creator-facings" aria-hidden="true">
              <span className="creator-facing" style={previewStyle ? { ...previewStyle, backgroundPosition: '0 0' } : undefined} />
              <span className="creator-facing" style={previewStyle ? { ...previewStyle, backgroundPosition: '0 -32px' } : undefined} />
              <span className="creator-facing" style={previewStyle ? { ...previewStyle, backgroundPosition: '0 -64px' } : undefined} />
            </div>
            <span className="creator-preview-label">Down · Side · Up</span>
          </div>

          <div className="creator-options">
            <label className="creator-group">
              <span className="creator-group-title">Name</span>
              <input
                type="text"
                className="creator-name-input"
                value={choices.name}
                maxLength={24}
                placeholder="Adventurer"
                onChange={(event) => set('name', event.target.value)}
                data-testid="input-character-name"
              />
            </label>

            <div className="creator-group">
              <span className="creator-group-title">Skin</span>
              <div className="creator-thumb-row">
                {SKIN_OPTIONS.map((skin) => (
                  <Swatch
                    key={skin}
                    label={`Skin ${skin}`}
                    selected={choices.skin === skin}
                    onSelect={() => set('skin', skin)}
                    style={{ background: `#${SKIN_TONES[skin][0]}` }}
                  />
                ))}
              </div>
            </div>

            <div className="creator-group">
              <span className="creator-group-title">Outfit</span>
              <div className="creator-thumb-row">
                {OUTFIT_OPTIONS.map((outfit) => (
                  <Swatch
                    key={outfit}
                    label={`Outfit ${outfit}`}
                    selected={choices.outfit === outfit}
                    onSelect={() => set('outfit', outfit)}
                    style={{
                      background: `linear-gradient(to bottom, #${OUTFITS[outfit].shirt[0]} 50%, #${OUTFITS[outfit].pants[0]} 50%)`,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="creator-group">
              <span className="creator-group-title">Hair</span>
              <div className="creator-thumb-row">
                {HAIR_COLOR_OPTIONS.map((color) => (
                  <Swatch
                    key={color}
                    label={`Hair ${color}`}
                    selected={choices.hairColor === color}
                    onSelect={() => set('hairColor', color)}
                    style={{ background: `#${HAIR_COLORS[color][0]}` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="creator-actions">
          <button type="button" className="main-menu-button" onClick={onCancel} data-testid="button-cancel-character">
            Back
          </button>
          <button
            type="button"
            className="main-menu-button primary"
            onClick={() => onConfirm(choices)}
            data-testid="button-confirm-character"
          >
            Begin Adventure
          </button>
        </div>
      </div>
    </section>
  );
}
