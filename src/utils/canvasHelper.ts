import { removeBackground } from "@imgly/background-removal";
import { TextConfig } from "../types";
import { loadGoogleFont } from "./fonts";

export interface BrushStroke {
  x: number;
  y: number;
  radius: number;
  type: "erase" | "restore";
}

export interface ImageFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  sharpen: number;
}

export type ExportResolution = "original" | "hd" | "4k";
export type ExportFormat = "png" | "jpeg";

const PRO_MASK_ALPHA_THRESHOLD = 20;
const ISNET_MODEL = "isnet" as const;

/**
 * Async robust image loader — resolves only after decode() and valid natural dimensions.
 * Prevents the white-background export bug caused by drawing before pixels are ready.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;

    const finish = async () => {
      if (settled) return;
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        settled = true;
        reject(new Error(`Image loaded with zero dimensions: ${src.slice(0, 120)}`));
        return;
      }
      try {
        if (typeof img.decode === "function") {
          await img.decode();
        }
        settled = true;
        resolve(img);
      } catch (err) {
        settled = true;
        reject(err);
      }
    };

    if (!src.startsWith("data:") && !src.startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => void finish();
    img.onerror = () => {
      if (settled) return;
      settled = true;
      reject(new Error(`Failed to load image: ${src.slice(0, 120)}`));
    };

    img.src = src;
    if (img.complete) {
      void finish();
    }
  });
}

/**
 * Pro Masking pixel loop — alpha > 20 → 255, alpha <= 20 → 0.
 * Preserves inter-subject gaps and car-window transparency.
 */
function applyProMask(imageData: ImageData): void {
  const data = imageData.data;
  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i] > PRO_MASK_ALPHA_THRESHOLD ? 255 : 0;
  }
}

function configureHighQualityContext(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

function buildBackgroundFilter(filters?: ImageFilters, blurPx?: number): string {
  const parts: string[] = [];
  if (filters) {
    parts.push(`brightness(${filters.brightness})`);
    parts.push(`contrast(${Math.round(filters.contrast * 100)}%)`);
    parts.push(`saturate(${Math.round(filters.saturation * 100)}%)`);
  }
  if (blurPx && blurPx > 0) {
    parts.push(`blur(${blurPx}px)`);
  }
  return parts.join(" ");
}

async function ensureTextFontsLoaded(textConfigs: TextConfig[]): Promise<void> {
  const families = [...new Set(textConfigs.map((t) => t.fontFamily))];
  families.forEach((family) => loadGoogleFont(family));

  await Promise.all(
    families.map((family) =>
      Promise.all([
        document.fonts.load(`400 16px "${family}"`),
        document.fonts.load(`700 16px "${family}"`),
        document.fonts.load(`900 16px "${family}"`),
      ]).catch(() => undefined)
    )
  );
  await document.fonts.ready;
}

function computeCropRect(
  naturalW: number,
  naturalH: number,
  targetRatio: number | null
): { x: number; y: number; w: number; h: number } {
  if (!targetRatio) {
    return { x: 0, y: 0, w: naturalW, h: naturalH };
  }

  const currentRatio = naturalW / naturalH;
  if (currentRatio > targetRatio) {
    const w = naturalH * targetRatio;
    return { x: (naturalW - w) / 2, y: 0, w, h: naturalH };
  }

  const h = naturalW / targetRatio;
  return { x: 0, y: (naturalH - h) / 2, w: naturalW, h };
}

/**
 * 4K Clarity Lock — canvas matches background native pixel grid at 1:1 source resolution.
 * HD mode downscales longest edge to 1920px; original/4k stay at full native clarity.
 */
function resolveCanvasDimensions(
  crop: { w: number; h: number },
  resolution: ExportResolution
): { canvasW: number; canvasH: number } {
  let canvasW = Math.round(crop.w);
  let canvasH = Math.round(crop.h);

  if (resolution === "hd") {
    const maxDim = 1920;
    const longest = Math.max(canvasW, canvasH);
    if (longest > maxDim) {
      const scale = maxDim / longest;
      canvasW = Math.round(canvasW * scale);
      canvasH = Math.round(canvasH * scale);
    }
  }

  return { canvasW, canvasH };
}

/**
 * Triple-Pass Typography + Mustang Stretch (ctx.scale(1, heightScale)).
 * scaleFactor = canvas.width / previewWidth drives all typography sizing.
 */
function drawTextLayer(
  ctx: CanvasRenderingContext2D,
  t: TextConfig,
  canvasW: number,
  canvasH: number,
  scaleFactor: number
): void {
  const tx = (t.x / 100) * canvasW;
  const ty = (t.y / 100) * canvasH;
  const finalFontSize = t.fontSize * scaleFactor * t.scale;
  const resolvedWeight = t.isBold && t.fontWeight < 700 ? 900 : t.fontWeight;
  const italicPrefix = t.isItalic ? "italic " : "";
  const heightScale = t.heightScale || 1;

  ctx.save();
  configureHighQualityContext(ctx);
  ctx.font = `${italicPrefix}${resolvedWeight} ${finalFontSize}px "${t.fontFamily}", sans-serif`;

  const letterSpacingCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (t.letterSpacing !== undefined) {
    letterSpacingCtx.letterSpacing = `${t.letterSpacing * scaleFactor}px`;
  }

  const textMetrics = ctx.measureText(t.text);
  const textWidth = textMetrics.width;

  ctx.translate(tx, ty);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(1, heightScale);

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.globalAlpha = t.opacity;
  ctx.fillStyle = t.color;

  const hasDropShadow =
    !t.glowEnabled &&
    (t.shadowBlur > 0 || t.shadowOffsetX !== 0 || t.shadowOffsetY !== 0);

  if (t.glowEnabled) {
    ctx.save();
    ctx.shadowColor = t.glowColor;
    ctx.shadowBlur = t.glowBlur * scaleFactor;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  } else if (hasDropShadow) {
    ctx.save();
    ctx.shadowColor = t.shadowColor;
    ctx.shadowBlur = t.shadowBlur * scaleFactor;
    ctx.shadowOffsetX = t.shadowOffsetX * scaleFactor;
    ctx.shadowOffsetY = t.shadowOffsetY * scaleFactor;
    ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalAlpha = t.opacity;
  ctx.fillStyle = t.color;

  for (let pass = 0; pass < 3; pass++) {
    ctx.fillText(t.text, 0, 0);
  }

  if (t.isBold) {
    ctx.strokeStyle = t.color;
    ctx.lineWidth = Math.max(1, 2 * scaleFactor);
    ctx.lineJoin = "round";
    ctx.strokeText(t.text, 0, 0);
  }

  if (t.isUnderline) {
    const underlineY = finalFontSize / 1.7;
    ctx.beginPath();
    ctx.moveTo(-textWidth / 2, underlineY);
    ctx.lineTo(textWidth / 2, underlineY);
    ctx.strokeStyle = t.color;
    ctx.lineWidth = Math.max(2, finalFontSize / 15);
    ctx.lineCap = "round";
    ctx.stroke();
  }

  ctx.restore();
}

export async function generateCutout(
  imageSrc: string,
  _threshold: number,
  _feather: number,
  strokes: BrushStroke[] = [],
  _customBgColor?: string,
  onProgress?: (step: string, percent: number) => void
): Promise<string> {
  const cutoutBlob = await removeBackground(imageSrc, {
    model: ISNET_MODEL,
    progress: (key: string, current: number, total: number) => {
      if (!onProgress) return;
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      let stage = "Analyzing image...";
      if (key.includes("fetch")) stage = "Downloading AI Model (isnet FP32)...";
      if (key.includes("compute")) stage = "Processing subject mask...";
      onProgress(stage, percent);
    },
  });

  const blobUrl = URL.createObjectURL(cutoutBlob);

  try {
    const [cutoutImg, originalImg] = await Promise.all([
      loadImage(blobUrl),
      loadImage(imageSrc),
    ]);

    const w = originalImg.naturalWidth;
    const h = originalImg.naturalHeight;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create canvas context");
    }

    configureHighQualityContext(ctx);
    ctx.drawImage(
      cutoutImg,
      0,
      0,
      cutoutImg.naturalWidth,
      cutoutImg.naturalHeight,
      0,
      0,
      w,
      h
    );

    const imgData = ctx.getImageData(0, 0, w, h);
    applyProMask(imgData);
    ctx.putImageData(imgData, 0, 0);

    if (strokes.length > 0) {
      strokes.forEach((stroke) => {
        const sx = (stroke.x / 100) * w;
        const sy = (stroke.y / 100) * h;
        const srad = (stroke.radius / 100) * w;

        ctx.beginPath();
        ctx.arc(sx, sy, srad, 0, Math.PI * 2);

        if (stroke.type === "erase") {
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillStyle = "rgba(0,0,0,1)";
          ctx.fill();
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.save();
          ctx.beginPath();
          ctx.arc(sx, sy, srad, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(originalImg, 0, 0, w, h);

          const areaData = ctx.getImageData(0, 0, w, h);
          applyProMask(areaData);
          ctx.putImageData(areaData, 0, 0);
          ctx.restore();
        }
      });
      ctx.globalCompositeOperation = "source-over";
    }

    return canvas.toDataURL("image/png");
  } catch (err) {
    console.error("AI Background Removal / Cutout compilation failed", err);
    throw err;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

interface CompositeRenderInput {
  backgroundSrc: string;
  cutoutSrc: string | null;
  textConfigs: TextConfig[];
  targetRatio: number | null;
  resolution: ExportResolution;
  format: ExportFormat;
  previewWidth: number;
  backgroundBlur: number;
  filters?: ImageFilters;
}

async function renderCompositeCanvas(input: CompositeRenderInput): Promise<HTMLCanvasElement> {
  const {
    backgroundSrc,
    cutoutSrc,
    textConfigs,
    targetRatio,
    resolution,
    format,
    previewWidth,
    backgroundBlur,
    filters,
  } = input;

  const [bgImg, cutoutImg] = await Promise.all([
    loadImage(backgroundSrc),
    cutoutSrc ? loadImage(cutoutSrc) : Promise.resolve(null),
  ]);

  await ensureTextFontsLoaded(textConfigs);

  const naturalWidth = bgImg.naturalWidth;
  const naturalHeight = bgImg.naturalHeight;
  
  // Canvas Size Lock: Set the export canvas width and height strictly to bgImg.naturalWidth and bgImg.naturalHeight.
  const canvasW = naturalWidth;
  const canvasH = naturalHeight;

  // High-DPI Math: Calculate the scaleFactor by dividing the naturalWidth by the previewWidth.
  const scaleFactor = canvasW / Math.max(1, previewWidth);

  // SuperScale Factor: 2x the natural resolution to render the text internally before downscaling it for ultra-smooth edges.
  const superScale = 2;
  const superW = canvasW * superScale;
  const superH = canvasH * superScale;

  const superCanvas = document.createElement("canvas");
  superCanvas.width = superW;
  superCanvas.height = superH;
  const superCtx = superCanvas.getContext("2d", { alpha: true });
  if (!superCtx) {
    throw new Error("Could not create supersampled rendering canvas context");
  }

  // Anti-Aliasing: Enable image smoothing and set quality to high.
  superCtx.imageSmoothingEnabled = true;
  superCtx.imageSmoothingQuality = "high";

  if (format === "jpeg") {
    superCtx.fillStyle = "#ffffff";
    superCtx.fillRect(0, 0, superW, superH);
  }

  const scaledBlur = backgroundBlur > 0 ? backgroundBlur * scaleFactor : 0;
  const bgFilter = buildBackgroundFilter(filters, scaledBlur * superScale);

  superCtx.save();
  superCtx.filter = bgFilter || "none";

  if (backgroundBlur > 0) {
    const bleed = scaledBlur * 2 * superScale;
    superCtx.drawImage(
      bgImg,
      0,
      0,
      naturalWidth,
      naturalHeight,
      -bleed,
      -bleed,
      superW + bleed * 2,
      superH + bleed * 2
    );
  } else {
    superCtx.drawImage(
      bgImg,
      0,
      0,
      naturalWidth,
      naturalHeight,
      0,
      0,
      superW,
      superH
    );
  }
  superCtx.restore();
  superCtx.filter = "none";

  // Triple-Pass Solid Texture: Render every text layer 3 times at 2x supersampled scale.
  textConfigs.forEach((t) => drawTextLayer(superCtx, t, superW, superH, scaleFactor * superScale));

  if (cutoutImg) {
    superCtx.save();
    superCtx.imageSmoothingEnabled = true;
    superCtx.imageSmoothingQuality = "high";
    superCtx.globalCompositeOperation = "source-over";
    superCtx.globalAlpha = 1;
    superCtx.filter = "none";
    superCtx.drawImage(
      cutoutImg,
      0,
      0,
      cutoutImg.naturalWidth,
      cutoutImg.naturalHeight,
      0,
      0,
      superW,
      superH
    );
    superCtx.restore();
  }

  // Downscale the supersampled canvas to the final canvas size
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    throw new Error("Could not create final rendering canvas context");
  }

  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(superCanvas, 0, 0, superW, superH, 0, 0, canvasW, canvasH);

  return canvas;
}

/**
 * Pro-Studio export — native 4K composite with filter-baked background and triple-pass type.
 */
export async function exportCompositeBlob(
  backgroundSrc: string,
  cutoutSrc: string | null,
  textConfig: TextConfig | TextConfig[],
  _aspectRatioLabel: string,
  targetRatio: number | null,
  resolution: ExportResolution,
  format: ExportFormat,
  previewWidth: number = 500,
  backgroundBlur: number = 0,
  filters?: ImageFilters
): Promise<Blob> {
  const textConfigs = Array.isArray(textConfig) ? textConfig : [textConfig];

  const canvas = await renderCompositeCanvas({
    backgroundSrc,
    cutoutSrc,
    textConfigs,
    targetRatio,
    resolution,
    format,
    previewWidth,
    backgroundBlur,
    filters,
  });

  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  // JPEG/PNG Quality: Ensure the final toBlob uses a quality setting of 1.0 (100% quality).
  const quality = 1.0;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to compile final image canvas data"));
          return;
        }
        resolve(blob);
      },
      mime,
      quality
    );
  });
}

/** Creates an object URL from the rendered composite (caller should revoke when done). */
export async function exportComposite(
  backgroundSrc: string,
  cutoutSrc: string | null,
  textConfig: TextConfig | TextConfig[],
  aspectRatioLabel: string,
  targetRatio: number | null,
  resolution: ExportResolution,
  format: ExportFormat,
  previewWidth: number = 500,
  backgroundBlur: number = 0,
  filters?: ImageFilters
): Promise<string> {
  const textConfigs = Array.isArray(textConfig) ? textConfig : [textConfig];

  await Promise.all([
    loadImage(backgroundSrc),
    cutoutSrc ? loadImage(cutoutSrc) : Promise.resolve(null),
    ensureTextFontsLoaded(textConfigs),
  ]);

  const blob = await exportCompositeBlob(
    backgroundSrc,
    cutoutSrc,
    textConfig,
    aspectRatioLabel,
    targetRatio,
    resolution,
    format,
    previewWidth,
    backgroundBlur,
    filters
  );
  return URL.createObjectURL(blob);
}
