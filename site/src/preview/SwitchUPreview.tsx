import {
  Gamepad2,
  Grid3x3,
  ImageIcon,
  Power,
  Settings2,
  Smile,
} from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ThemeCatalogRecord } from '../theme/schema';
import type { StudioAsset, StudioDraft } from '../theme/draft';
import { createBackgroundScene, renderBackgroundScene } from './background';
import { hslTripletToCss, paletteFromDraft } from '../theme/color';

const sidebarButtonsLeft = [
  { id: 'album', label: 'Album', Icon: ImageIcon },
  { id: 'mii-editor', label: 'Mii Editor', Icon: Smile },
  { id: 'settings', label: 'Settings', Icon: Settings2 },
] as const;

const sidebarButtonsRight = [
  { id: 'controllers', label: 'Controllers', Icon: Gamepad2, active: false },
  { id: 'power', label: 'Power', Icon: Power, active: false },
  { id: 'theme-shop', label: 'Theme Shop', Icon: Grid3x3, active: true },
] as const;

const previewSlotIndexes = Array.from({ length: 15 }, (_, index) => index);

function useObjectImage(asset: StudioAsset | undefined): HTMLImageElement | undefined {
  const [image, setImage] = useState<HTMLImageElement>();

  useEffect(() => {
    if (!asset?.url) {
      setImage(undefined);
      return;
    }

    const nextImage = new Image();
    nextImage.decoding = 'async';
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = asset.url;
    return () => {
      setImage(undefined);
    };
  }, [asset?.url]);

  return image;
}

function useFontFace(asset: StudioAsset | undefined, familyPrefix: string, fallback: string): string {
  const [family, setFamily] = useState(fallback);

  useEffect(() => {
    if (!asset?.url) {
      setFamily(fallback);
      return;
    }

    const familyName = `${familyPrefix}-${asset.name.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}`;
    const fontFace = new FontFace(familyName, `url(${asset.url})`);

    let active = true;
    void fontFace.load().then((loadedFace) => {
      if (!active) {
        return;
      }
      document.fonts.add(loadedFace);
      setFamily(`"${familyName}", ${fallback}`);
    }).catch(() => {
      if (active) {
        setFamily(fallback);
      }
    });

    return () => {
      active = false;
    };
  }, [asset?.name, asset?.url, familyPrefix, fallback]);

  return family;
}

function formatHudTime(date: Date): string {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatHudDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).padStart(4, '0');
  return `${day}/${month}/${year}`;
}

export const SwitchUPreview = forwardRef<HTMLDivElement, {
  draft: StudioDraft;
  selectedRecord: ThemeCatalogRecord | null;
}>(({ draft, selectedRecord }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [previewScale, setPreviewScale] = useState(1);
  const palette = useMemo(() => paletteFromDraft(draft), [draft]);
  const scene = useMemo(() => createBackgroundScene(draft, 1280, 720), [draft]);
  const backgroundImage = useObjectImage(draft.background.image);
  const regularFontFamily = useFontFace(draft.fonts.regular, 'switchu-regular', '"Space Grotesk", sans-serif');
  const smallFontFamily = useFontFace(draft.fonts.small ?? draft.fonts.regular, 'switchu-small', '"Sora", sans-serif');

  function setPreviewRef(node: HTMLDivElement | null) {
    viewportRef.current = node;

    if (typeof ref === 'function') {
      ref(node);
      return;
    }

    if (ref) {
      ref.current = node;
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) {
      return undefined;
    }

    const updateScale = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width <= 0 || height <= 0) {
        return;
      }
      setPreviewScale(Math.min(width / 1280, height / 720));
    };

    updateScale();

    const observer = new ResizeObserver(() => {
      updateScale();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    canvas.width = 1280;
    canvas.height = 720;

    const start = performance.now();
    const render = () => {
      const elapsed = (performance.now() - start) / 1000;
      renderBackgroundScene(canvas, scene, draft, palette, elapsed, backgroundImage);
      frameId = window.requestAnimationFrame(render);
    };

    render();
    return () => window.cancelAnimationFrame(frameId);
  }, [backgroundImage, draft, palette, scene]);

  const batteryLevel = 96;
  const accentGlow = hslTripletToCss(draft.colors.cursor, 0.38);
  const previewLabel = selectedRecord
    ? `SwitchU preview for ${selectedRecord.entry.name}`
    : `SwitchU preview for ${draft.name}`;

  return (
    <div className="switchu-preview-frame">
      <div
        ref={setPreviewRef}
        className="switchu-preview"
        aria-label={previewLabel}
        style={{
          ['--preview-cursor' as string]: palette.cursor,
          ['--preview-cursor-glow' as string]: palette.cursorGlow,
          ['--preview-accent' as string]: palette.accent,
          ['--preview-panel-base' as string]: palette.panelBase,
          ['--preview-panel-border' as string]: palette.panelBorder,
          ['--preview-panel-highlight' as string]: palette.panelHighlight,
          ['--preview-text-primary' as string]: palette.textPrimary,
          ['--preview-text-secondary' as string]: palette.textSecondary,
          ['--preview-page-dot' as string]: palette.pageDot,
          ['--preview-regular-font' as string]: regularFontFamily,
          ['--preview-small-font' as string]: smallFontFamily,
          ['--preview-cursor-shadow' as string]: accentGlow,
        }}
      >
        <div
          className="switchu-preview__stage"
          style={{
            transform: `scale(${previewScale})`,
          }}
        >
          <canvas ref={canvasRef} className="switchu-preview__background" />

          <div className="switchu-preview__topbar">
            <div className="preview-pill preview-pill--clock" aria-hidden>
              <span className="preview-pill__time">{formatHudTime(now)}</span>
              <span className="preview-pill__date">{formatHudDate(now)}</span>
            </div>
            <div className="preview-pill preview-pill--battery" aria-hidden>
              <div className="battery-hud">
                <div className="battery-hud__body">
                  <div className="battery-hud__fill" style={{ width: `${batteryLevel}%` }} />
                </div>
                <div className="battery-hud__tip" />
              </div>
              <span className="preview-pill__percent">{batteryLevel}%</span>
            </div>
          </div>

          <div className="switchu-preview__side switchu-preview__side--left">
            {sidebarButtonsLeft.map(({ id, label, Icon }) => (
              <button key={id} type="button" className="sidebar-button" aria-label={label} title={label}>
                <Icon aria-hidden size={30} />
              </button>
            ))}
          </div>

          <div className="switchu-preview__side switchu-preview__side--right">
            {sidebarButtonsRight.map(({ id, label, Icon, active }) => (
              <button
                key={id}
                type="button"
                className={`sidebar-button ${active ? 'sidebar-button--active' : ''}`}
                aria-label={label}
                title={label}
              >
                <Icon aria-hidden size={30} />
              </button>
            ))}
          </div>

          <div className="switchu-preview__grid-shell">
            <div className="switchu-preview__grid">
              {previewSlotIndexes.map((index) => (
                <div
                  key={index}
                  className={[
                    'preview-slot',
                    index === 5 ? 'preview-slot--gamepad' : '',
                    index === 8 || index === 13 ? 'preview-slot--dimmed' : '',
                    index === 2 || index === 11 ? 'preview-slot--soft' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {index === 5 ? (
                    <div className="preview-slot__badge" aria-hidden>
                      <Gamepad2 size={58} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="preview-pill preview-pill--title">
            <span className="preview-pill__title">Theme Shop</span>
          </div>

          <div className="page-indicator" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((dotIndex) => (
              <span key={dotIndex} className={`page-indicator__dot ${dotIndex === 0 ? 'page-indicator__dot--active' : ''}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

SwitchUPreview.displayName = 'SwitchUPreview';
