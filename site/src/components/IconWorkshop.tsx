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
import { useMemo, useState, type DragEvent } from 'react';
import JSZip from 'jszip';
import {
  LEFT_SIDEBAR_VISUAL,
  PACK_GLYPHS,
  RIGHT_SIDEBAR_VISUAL,
  glyphsInVisualOrder,
  packInstallPath,
  slugifyPackId,
  type IconPackGlyph,
} from '../icons/pack';
import { submitIconPack, withMosaicPreview } from '../icons/submit';

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
  const [dragOverFile, setDragOverFile] = useState<string | null>(null);

  const uploadedCount = useMemo(() => Object.keys(glyphs).length, [glyphs]);
  const normalizedId = slugifyPackId(packId) || 'my-icons';

  function pickPngFile(fileList: FileList | null | undefined): File | undefined {
    if (!fileList?.length) {
      return undefined;
    }

    const match = Array.from(fileList).find((file) => {
      const name = file.name.toLowerCase();
      return file.type === 'image/png' || name.endsWith('.png');
    });

    return match ?? undefined;
  }

  function onGlyphUpload(glyph: IconPackGlyph, file: File | undefined) {
    if (!file) {
      return;
    }

    const name = file.name.toLowerCase();
    if (file.type && file.type !== 'image/png' && !name.endsWith('.png')) {
      setFeedback({ kind: 'error', text: `${glyph.label} expects a .png file.` });
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

  function onGlyphDragOver(event: DragEvent<HTMLElement>, glyph: IconPackGlyph) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragOverFile(glyph.file);
  }

  function onGlyphDragLeave(event: DragEvent<HTMLElement>, glyph: IconPackGlyph) {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) {
      return;
    }
    setDragOverFile((current) => (current === glyph.file ? null : current));
  }

  function onGlyphDrop(event: DragEvent<HTMLElement>, glyph: IconPackGlyph) {
    event.preventDefault();
    setDragOverFile(null);
    const file = pickPngFile(event.dataTransfer.files);
    if (!file) {
      setFeedback({ kind: 'error', text: `Drop a .png onto ${glyph.label}.` });
      return;
    }
    onGlyphUpload(glyph, file);
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
      const packFiles = await withMosaicPreview(
        PACK_GLYPHS.flatMap((glyph) => {
          const entry = glyphs[glyph.file];
          return entry ? [{ fileName: glyph.file, file: entry.file }] : [];
        }),
      );
      const zip = new JSZip();
      const root = zip.folder(`icons/${normalizedId}`) ?? zip;
      for (const file of packFiles) {
        root.file(file.fileName, file.file);
      }

      const archive = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      triggerDownload(archive, `${normalizedId}-icons.zip`);
      setFeedback({
        kind: 'success',
        text: `Pack exported (includes 3×2 preview.png). Extract it to ${packInstallPath(normalizedId)} on your SD card.`,
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

  const leftGlyphs = glyphsInVisualOrder(LEFT_SIDEBAR_VISUAL);
  const rightGlyphs = glyphsInVisualOrder(RIGHT_SIDEBAR_VISUAL);

  return (
    <section className="icon-workshop">
      <div className="studio-layout studio-layout--icons">
        <div className="panel studio-panel studio-panel--controls">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Icon workshop</p>
              <h2>Pack details</h2>
            </div>
          </div>

          <div className="studio-control-section">
            <div className="studio-grid studio-grid--pack-details">
              <label className="studio-field">
                <span className="studio-field__label">Pack ID</span>
                <input
                  className="studio-input"
                  value={packId}
                  onChange={(event) => setPackId(event.currentTarget.value)}
                  placeholder="my-icons"
                />
                <small className="studio-field__hint">Lowercase + hyphens. Becomes folder name.</small>
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
              <label className="studio-field studio-field--span">
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
            <div className="studio-control-section__title">Live preview</div>
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

        <div className="panel studio-panel studio-panel--glyphs">
          <div className="panel__header">
            <div>
              <p className="panel__eyebrow">Glyphs</p>
              <h2>{uploadedCount}/{PACK_GLYPHS.length} uploaded</h2>
            </div>
          </div>
          <p className="studio-control-section__subtitle icon-workshop__glyphs-lead">
            Drag and Drop square PNGs onto each slot, or click Upload. Empty slots will use defaults.
          </p>
          <div className="icon-glyph-grid">
            {PACK_GLYPHS.map((glyph) => {
              const entry = glyphs[glyph.file];
              const Fallback = glyphFallbackIcon(glyph);
              const isDragOver = dragOverFile === glyph.file;
              return (
                <div
                  className={`icon-glyph-card ${entry ? 'icon-glyph-card--filled' : 'icon-glyph-card--empty'} ${isDragOver ? 'icon-glyph-card--dragover' : ''}`}
                  key={glyph.file}
                  onDragEnter={(event) => onGlyphDragOver(event, glyph)}
                  onDragOver={(event) => onGlyphDragOver(event, glyph)}
                  onDragLeave={(event) => onGlyphDragLeave(event, glyph)}
                  onDrop={(event) => onGlyphDrop(event, glyph)}
                >
                  <div className="icon-glyph-card__preview">
                    {entry ? <img src={entry.url} alt={glyph.label} /> : <Fallback size={28} />}
                    {!entry ? <span className="icon-glyph-card__drop-hint">Drop PNG</span> : null}
                  </div>
                  <div className="icon-glyph-card__body">
                    <strong>{glyph.label}</strong>
                    <span className="icon-glyph-card__file">{glyph.file}</span>
                  </div>
                  <div className={`icon-glyph-card__actions${entry ? ' icon-glyph-card__actions--filled' : ''}`}>
                    <label className="ghost-button icon-glyph-card__upload">
                      <Upload size={15} />
                      <span>{entry ? 'Replace' : 'Upload'}</span>
                      <input
                        type="file"
                        accept=".png,image/png"
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
      </div>
    </section>
  );
}
