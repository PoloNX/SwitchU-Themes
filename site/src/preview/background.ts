import type { StudioDraft } from '../theme/draft';
import type { PreviewPalette } from '../theme/color';
import { hslTripletToCss, hslTripletToRgb } from '../theme/color';

interface PreviewShape {
  type: 'circle' | 'triangle' | 'square' | 'diamond' | 'hexagon';
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
  wobble: number;
  rotation: number;
  rotationSpeed: number;
}

interface BackgroundScene {
  shapes: PreviewShape[];
}

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let current = value;
    current = Math.imul(current ^ (current >>> 15), current | 1);
    current ^= current + Math.imul(current ^ (current >>> 7), current | 61);
    return ((current ^ (current >>> 14)) >>> 0) / 4294967296;
  };
}

function pickShape(random: () => number, requested: StudioDraft['background']['shape']): PreviewShape['type'] {
  if (requested !== 'mixed') {
    return requested;
  }

  const shapes: PreviewShape['type'][] = ['circle', 'triangle', 'square', 'diamond', 'hexagon'];
  return shapes[Math.floor(random() * shapes.length)] ?? 'circle';
}

function clampShapeCount(draft: StudioDraft): number {
  if (draft.background.layout === 'grid') {
    return Math.min(draft.background.columns * draft.background.rows, 448);
  }
  return Math.min(draft.background.count, 160);
}

export function createBackgroundScene(draft: StudioDraft, width: number, height: number): BackgroundScene {
  const random = createRandom(hashString(`${draft.id}:${draft.name}:${draft.background.layout}`));
  const count = Math.max(1, clampShapeCount(draft));
  const shapes: PreviewShape[] = [];

  for (let index = 0; index < count; index += 1) {
    if (draft.background.layout === 'grid') {
      const col = index % draft.background.columns;
      const row = Math.floor(index / draft.background.columns);
      const gridWidth = (draft.background.columns - 1) * draft.background.spacingX;
      const gridHeight = (draft.background.rows - 1) * draft.background.spacingY;
      const originX = (width - gridWidth) * 0.5;
      const originY = (height - gridHeight) * 0.5;
      shapes.push({
        type: pickShape(random, draft.background.shape),
        x: originX + col * draft.background.spacingX,
        y: originY + row * draft.background.spacingY,
        size: draft.background.sizeMin + random() * Math.max(0.01, draft.background.sizeMax - draft.background.sizeMin),
        speed: 0,
        phase: random() * Math.PI * 2,
        wobble: 0,
        rotation: draft.background.fixedOrientation ? (draft.background.orientation * Math.PI) / 180 : random() * Math.PI * 2,
        rotationSpeed: draft.background.rotationSpeed,
      });
      continue;
    }

    shapes.push({
      type: pickShape(random, draft.background.shape),
      x: random() * width,
      y: random() * height,
      size: draft.background.sizeMin + random() * Math.max(0.01, draft.background.sizeMax - draft.background.sizeMin),
      speed: draft.background.speedMin + random() * Math.max(0.01, draft.background.speedMax - draft.background.speedMin),
      phase: random() * Math.PI * 2,
      wobble: draft.background.wobble * (0.4 + random() * 0.6),
      rotation: draft.background.fixedOrientation ? (draft.background.orientation * Math.PI) / 180 : random() * Math.PI * 2,
      rotationSpeed: draft.background.rotationSpeed * (random() > 0.5 ? 1 : -1),
    });
  }

  return { shapes };
}

function drawRoundedPolygon(
  context: CanvasRenderingContext2D,
  type: PreviewShape['type'],
  size: number,
  roundness: number,
): void {
  if (type === 'circle') {
    context.beginPath();
    context.arc(0, 0, size, 0, Math.PI * 2);
    return;
  }

  if (type === 'square' && roundness > 0.001) {
    const half = size * 0.707;
    const radius = half * Math.min(1, roundness);
    context.beginPath();
    context.roundRect(-half, -half, half * 2, half * 2, radius);
    return;
  }

  const points: [number, number][] = [];
  if (type === 'triangle') {
    points.push([0, -size], [-size * 0.866, size * 0.5], [size * 0.866, size * 0.5]);
  } else if (type === 'square') {
    const half = size * 0.707;
    points.push([-half, -half], [half, -half], [half, half], [-half, half]);
  } else if (type === 'diamond') {
    points.push([0, -size], [size * 0.6, 0], [0, size], [-size * 0.6, 0]);
  } else {
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6;
      points.push([Math.cos(angle) * size, Math.sin(angle) * size]);
    }
  }

  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) {
      context.moveTo(x, y);
      return;
    }
    context.lineTo(x, y);
  });
  context.closePath();
}

function drawShape(
  context: CanvasRenderingContext2D,
  shape: PreviewShape,
  x: number,
  y: number,
  rotation: number,
  draft: StudioDraft,
  fillStyle: string,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  drawRoundedPolygon(context, shape.type, shape.size, draft.background.roundness);
  context.fillStyle = fillStyle;
  context.fill();
  context.restore();
}

function shapePositions(shape: PreviewShape, draft: StudioDraft, width: number, height: number, time: number): [number, number][] {
  let x = shape.x;
  let y = shape.y;
  if (draft.background.layout === 'floating') {
    const span = height + shape.size * 2 + 40;
    y = ((shape.y - time * shape.speed + span) % span) - shape.size - 20;
    x = shape.x + Math.sin(time * 0.7 + shape.phase) * shape.wobble;
    if (x < -shape.size) x = width + shape.size;
    if (x > width + shape.size) x = -shape.size;
  }

  const positions: [number, number][] = [[x, y]];
  if (draft.background.symmetry === 'horizontal' || draft.background.symmetry === 'quad') {
    positions.push([width - x, y]);
  }
  if (draft.background.symmetry === 'vertical' || draft.background.symmetry === 'quad') {
    positions.push([x, height - y]);
  }
  if (draft.background.symmetry === 'quad') {
    positions.push([width - x, height - y]);
  }

  return positions;
}

function drawGradient(context: CanvasRenderingContext2D, width: number, height: number, palette: PreviewPalette): void {
  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, palette.backgroundAccent);
  base.addColorStop(1, palette.background);
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * 0.7, height * 0.2, 20, width * 0.7, height * 0.2, width * 0.65);
  glow.addColorStop(0, 'rgba(255,255,255,0.24)');
  glow.addColorStop(0.4, 'rgba(255,255,255,0.08)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function drawBackgroundImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  draft: StudioDraft,
  width: number,
  height: number,
): void {
  const imageWidth = (image as HTMLImageElement).width;
  const imageHeight = (image as HTMLImageElement).height;
  if (!imageWidth || !imageHeight) {
    return;
  }

  const scaleX = width / imageWidth;
  const scaleY = height / imageHeight;
  const scale = draft.background.imageFit === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const x = (width - drawWidth) * 0.5;
  const y = (height - drawHeight) * 0.5;

  context.save();
  context.globalAlpha = draft.background.imageOpacity;
  context.drawImage(image, x, y, drawWidth, drawHeight);
  context.restore();
}

export function renderBackgroundScene(
  canvas: HTMLCanvasElement,
  scene: BackgroundScene,
  draft: StudioDraft,
  palette: PreviewPalette,
  time: number,
  backgroundImage?: CanvasImageSource,
): void {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  drawGradient(context, width, height, palette);

  if (backgroundImage) {
    drawBackgroundImage(context, backgroundImage, draft, width, height);
  }

  const [shapeR, shapeG, shapeB] = hslTripletToRgb(draft.colors.shapes);
  const bodyAlpha = Math.min(1, Math.max(0, draft.background.opacity));

  for (const shape of scene.shapes) {
    const rotation = shape.rotation + shape.rotationSpeed * time;
    const positions = shapePositions(shape, draft, width, height, time);
    for (const [x, y] of positions) {
      drawShape(context, shape, x, y, rotation, draft, `rgba(${shapeR}, ${shapeG}, ${shapeB}, ${bodyAlpha * 0.92})`);
      drawShape(context, { ...shape, size: shape.size * 0.85 }, x, y - shape.size * 0.08, rotation, draft, 'rgba(255, 255, 255, 0.18)');
      drawShape(context, { ...shape, size: shape.size * 1.06 }, x, y, rotation, draft, `rgba(255, 255, 255, ${draft.background.layout === 'grid' ? 0.08 : 0.11})`);
    }
  }

  context.strokeStyle = hslTripletToCss(draft.colors.cursor, 0.06);
  context.lineWidth = 2;
  context.strokeRect(0, 0, width, height);
}
