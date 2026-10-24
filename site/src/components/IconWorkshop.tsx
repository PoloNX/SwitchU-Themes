import {
  Download,
  Gamepad2,
  Grid3x3,
  ImageIcon,
  Info,
  Power,
  Settings2,
  Smile,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import {
  BUILT_IN_PACKS,
  PACK_GLYPHS,
  SIDEBAR_GLYPHS,
  packInstallPath,
  slugifyPackId,
  type IconPackGlyph,
} from '../icons/pack';
import { submitIconPack } from '../icons/submit';

interface GlyphState {
  url: string;
  file: File;
}

const GLYPH_FALLBACKS: Record<string, typeof ImageIcon> = {
  'album.png': ImageIcon,
  'mii_editor.png': Smile,
  'settings.png': Settings2,
  'controller.png': Gamepad2,
  'power.png': Power,
  'themes.png': Grid3x3,
};

function glyphFallbackIcon(glyph: IconPackGlyph) {
  return GLYPH_FALLBACKS[glyph.file] ?? ImageIcon;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function IconWorkshop() {
  const [packId, setPackId] = useState('my-icons');
  const [name, setName] = useState('My Icons');
  const [author, setAuthor] = useState('');
  const [glyphs, setGlyphs] = useState<Record<string, GlyphState>>({});
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [building, setBuilding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const uploadedCount = useMemo(() => Object.keys(glyphs).length, [glyphs]);
  const normalizedId = slugifyPackId(packId) || 'my-icons';

  function onGlyphUpload(glyph: IconPackGlyph, file: File | undefined) {
    if (!file) {
      return;
    }

    const previous = glyphs[glyph.file];
    if (previous) {
      URL.revokeObjectURL(previous.url);
    }

    setGlyphs((current) => ({
      ...current,
      [glyph.file]: { url: URL.createObjectURL(file), file },
    }));
    setFeedback(null);
  }

  function onGlyphClear(glyph: IconPackGlyph) {
    setGlyphs((current) => {
      const next = { ...current };
      const previous = next[glyph.file];
      if (previous) {
        URL.revokeObjectURL(previous.url);
      }
      delete next[glyph.file];
      return next;
    });
  }

  async function handleDownload() {
    const files = Object.values(glyphs);
    if (files.length === 0) {
      setFeedback({ kind: 'error', text: 'Upload at least one glyph before exporting.' });
      return;
    }

    setBuilding(true);
    setFeedback(null);
    try {
      const zip = new JSZip();
      const root = zip.folder(`icons/${normalizedId}`) ?? zip;
      for (const glyph of PACK_GLYPHS) {
        const entry = glyphs[glyph.file];
        if (!entry) {
          continue;
        }
        root.file(glyph.file, entry.file);
      }

      const archive = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      triggerDownload(archive, `${normalizedId}-icons.zip`);
      setFeedback({
        kind: 'success',
        text: `Pack exported. Extract it to ${packInstallPath(normalizedId)} on your SD card.`,
      });
    } catch (cause) {
      setFeedback({ kind: 'error', text: cause instanceof Error ? cause.message : 'Failed to build the pack.' });
    } finally {
      setBuilding(false);
    }
  }

  async function handleSubmit() {
    const files = Object.values(glyphs);
    if (files.length === 0) {
      setFeedback({ kind: 'error', text: 'Upload at least one glyph before submitting.' });
      return;
    }

    setSubmitting(true);
    setPrUrl(null);
    setFeedback(null);
    try {
      const result = await submitIconPack(
        normalizedId,
        name,
        author,
        PACK_GLYPHS.flatMap((glyph) => {
          const entry = glyphs[glyph.file];
          return entry ? [{ fileName: glyph.file, file: entry.file }] : [];
        }),
      );
      setPrUrl(result.pullRequestUrl);
      setFeedback({
        kind: 'success',
        text: `Pull request created: ${result.pullRequestUrl}`,
      });
    } catch (cause) {
      setFeedback({ kind: 'error', text: cause instanceof Error ? cause.message : 'Icon pack submission failed.' });
    } finally {
      setSubmitting(false);
    }
  }

  const leftGlyphs = SIDEBAR_GLYPHS.filter((glyph) => glyph.sidebar === 'left');
  const rightGlyphs = SIDEBAR_GLYPHS.filter((glyph) => glyph.sidebar === 'right');

  return (
    <section className="icon-workshop">
      <div className="studio-layout">
        <div className="panel studio-panel studio-panel--controls">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Icon workshop</p>
              <h2>Pack details</h2>
            </div>
          </div>

          <div className="studio-control-section">
            <div className="studio-grid studio-grid--two">
              <label className="studio-field">
                <span className="studio-field__label">Pack ID</span>
                <input
                  className="studio-input"
                  value={packId}
                  onChange={(event) => setPackId(event.currentTarget.value)}
                  placeholder="my-icons"
                />
                <small className="studio-field__hint">Lowercase + hyphens. Becomes the folder name under icons/.</small>
              </label>
              <label className="studio-field">
                <span className="studio-field__label">Display name</span>
                <input
                  className="studio-input"
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  placeholder="My Icons"
                />
              </label>
              <label className="studio-field">
                <span className="studio-field__label">Author</span>
                <input
                  className="studio-input"
                  value={author}
                  onChange={(event) => setAuthor(event.currentTarget.value)}
                  placeholder="optional"
                />
              </label>
            </div>
          </div>

          <div className="studio-control-section">
            <div className="studio-control-section__title">Glyphs ({uploadedCount}/{PACK_GLYPHS.length} uploaded)</div>
            <div className="icon-glyph-grid">
              {PACK_GLYPHS.map((glyph) => {
                const entry = glyphs[glyph.file];
                const Fallback = glyphFallbackIcon(glyph);
                return (
                  <div className="icon-glyph-card" key={glyph.file}>
                    <div className="icon-glyph-card__preview">
                      {entry ? <img src={entry.url} alt={glyph.label} /> : <Fallback size={28} />}
                    </div>
                    <div className="icon-glyph-card__body">
                      <strong>{glyph.label}</strong>
                      <span className="icon-glyph-card__file">{glyph.file}</span>
                    </div>
                    <div className="icon-glyph-card__actions">
                      <label className="ghost-button icon-glyph-card__upload">
                        <Upload size={15} />
                        <span>{entry ? 'Replace' : 'Upload'}</span>
                        <input
                          type="file"
                          accept=".png"
                          hidden
                          onChange={(event) => onGlyphUpload(glyph, event.currentTarget.files?.[0])}
                        />
                      </label>
                      {entry ? (
                        <button className="ghost-button icon-glyph-card__clear" type="button" onClick={() => onGlyphClear(glyph)} title={`Remove ${glyph.label}`}>
                          <X size={15} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="studio-control-section">
            <div className="submit-card">
              <p>
                Missing glyphs fall back to the built-in default pack on the console, so you only need to
                upload the icons you want to override.
              </p>
              <div className="submit-actions">
                <button className="submit-button" type="button" disabled={building || submitting} onClick={() => { void handleDownload(); }}>
                  <Download size={18} />
                  <span>{building ? 'Building zip…' : 'Download icon pack'}</span>
                </button>
                <button className="submit-button submit-button--secondary" type="button" disabled={building || submitting} onClick={() => { void handleSubmit(); }}>
                  <Upload size={18} />
                  <span>{submitting ? 'Opening pull request…' : 'Submit to SwitchU'}</span>
                </button>
              </div>
              {feedback ? (
                <div className={`submit-feedback submit-feedback--${feedback.kind}`}>
                  {feedback.text}
                  {prUrl && feedback.kind === 'success' ? <> <a href={prUrl} target="_blank" rel="noreferrer">View PR</a></> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="panel studio-panel studio-panel--preview">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Live preview</p>
              <h2>{name.trim() || 'Icon pack'}</h2>
            </div>
          </div>

          <div className="icon-pack-preview">
            <div className="icon-pack-preview__column">
              {leftGlyphs.map((glyph) => {
                const entry = glyphs[glyph.file];
                const Fallback = glyphFallbackIcon(glyph);
                return (
                  <button key={glyph.file} type="button" className="sidebar-button" aria-label={glyph.label} title={glyph.label}>
                    {entry ? <img src={entry.url} alt={glyph.label} /> : <Fallback aria-hidden size={30} />}
                  </button>
                );
              })}
            </div>
            <div className="icon-pack-preview__spacer" />
            <div className="icon-pack-preview__column">
              {rightGlyphs.map((glyph) => {
                const entry = glyphs[glyph.file];
                const Fallback = glyphFallbackIcon(glyph);
                return (
                  <button key={glyph.file} type="button" className="sidebar-button" aria-label={glyph.label} title={glyph.label}>
                    {entry ? <img src={entry.url} alt={glyph.label} /> : <Fallback aria-hidden size={30} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="icon-pack-note">
            <Info size={16} />
            <span>
              Packs are read from <code>{packInstallPath(normalizedId)}</code>. Monochrome packs adapt to the
              theme chrome on the console; colour packs keep their authored look.
            </span>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">Built-in packs</p>
            <h2>Reference</h2>
          </div>
        </div>
        <div className="icon-pack-gallery">
          {BUILT_IN_PACKS.map((pack) => (
            <div className="icon-pack-card" key={pack.id}>
              <strong>{pack.name}</strong>
              <span>{pack.description}</span>
              <code>icons/{pack.id}/</code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
