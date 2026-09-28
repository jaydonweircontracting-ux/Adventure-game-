import { useEffect, useState } from 'react';
import {
  CharacterChoices,
  DEFAULT_CHARACTER,
  HAIR_COLOR_OPTIONS,
  HAIR_STYLE_OPTIONS,
  HAT_OPTIONS,
  OUTFIT_OPTIONS,
  SKIN_OPTIONS,
  compositeCharacterSheet,
} from '../game/characterCreator';

const partUrl = (file: string) => `${import.meta.env.BASE_URL}manaseed/${file}`;

interface CharacterCreatorProps {
  onConfirm: (choices: CharacterChoices) => void;
  onCancel: () => void;
}

function PartThumb({
  file,
  label,
  selected,
  onSelect,
}: {
  file: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={'creator-thumb' + (selected ? ' is-selected' : '')}
      style={{ backgroundImage: `url("${partUrl(file)}")` }}
      onClick={onSelect}
      aria-label={label}
      title={label}
      aria-pressed={selected}
    />
  );
}

const HAIR_STYLE_LABELS: Record<string, string> = { bob1: 'Bob', dap1: 'Dapper' };

export default function CharacterCreator({ onConfirm, onCancel }: CharacterCreatorProps) {
  const [choices, setChoices] = useState<CharacterChoices>({ ...DEFAULT_CHARACTER });
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    compositeCharacterSheet(choices, partUrl)
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
                  <PartThumb
                    key={skin}
                    file={`char_a_pONE3_0bas_humn_${skin}.png`}
                    label={`Skin ${skin}`}
                    selected={choices.skin === skin}
                    onSelect={() => set('skin', skin)}
                  />
                ))}
              </div>
            </div>

            <div className="creator-group">
              <span className="creator-group-title">Outfit</span>
              <div className="creator-thumb-row">
                {OUTFIT_OPTIONS.map((outfit) => (
                  <PartThumb
                    key={outfit}
                    file={`char_a_pONE3_1out_${outfit}.png`}
                    label={`Outfit ${outfit}`}
                    selected={choices.outfit === outfit}
                    onSelect={() => set('outfit', outfit)}
                  />
                ))}
              </div>
            </div>

            <div className="creator-group">
              <span className="creator-group-title">Hair</span>
              <div className="creator-chip-row">
                {HAIR_STYLE_OPTIONS.map((style) => (
                  <button
                    key={style}
                    type="button"
                    className={'creator-chip' + (choices.hairStyle === style ? ' is-selected' : '')}
                    onClick={() => set('hairStyle', style)}
                    aria-pressed={choices.hairStyle === style}
                  >
                    {HAIR_STYLE_LABELS[style]}
                  </button>
                ))}
                <button
                  type="button"
                  className={'creator-chip' + (choices.hairStyle === 'none' ? ' is-selected' : '')}
                  onClick={() => set('hairStyle', 'none')}
                  aria-pressed={choices.hairStyle === 'none'}
                >
                  Bald
                </button>
              </div>
              {choices.hairStyle !== 'none' && (
                <div className="creator-thumb-row">
                  {HAIR_COLOR_OPTIONS.map((color) => (
                    <PartThumb
                      key={color}
                      file={`char_a_pONE3_4har_${choices.hairStyle}_${color}.png`}
                      label={`Hair ${color}`}
                      selected={choices.hairColor === color}
                      onSelect={() => set('hairColor', color)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="creator-group">
              <span className="creator-group-title">Hat</span>
              <div className="creator-thumb-row">
                <button
                  type="button"
                  className={'creator-chip' + (choices.hat === null ? ' is-selected' : '')}
                  onClick={() => set('hat', null)}
                  aria-pressed={choices.hat === null}
                >
                  None
                </button>
                {HAT_OPTIONS.map((hat) => (
                  <PartThumb
                    key={hat}
                    file={`char_a_pONE3_5hat_${hat}.png`}
                    label={`Hat ${hat}`}
                    selected={choices.hat === hat}
                    onSelect={() => set('hat', hat)}
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
