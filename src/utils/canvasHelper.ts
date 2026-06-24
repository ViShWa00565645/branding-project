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

/**
 * Zero-fail async loader — resolves only after decode() and valid natural dimensions.
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

/** BMW Solid Mask — alpha > 15 becomes fully opaque; halos below threshold are cleared. */
function applyBmwSolidMask(imageData: ImageData): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a <= 0 || a >= 255) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const isLightGrey =
      r > 180 &&
      g > 180 &&
      b > 180 &&
      Math.abs(r - g) < 25 &&
      Math.abs(g - b) < 25 &&
      Math.abs(r - b) < 25;

    if (isLightGrey && a < 180) {
      data[i + 3] = Math.max(0, Math.round(a * 0.1));
    } else if (a > 15) {
      data[i + 3] = 255;
    } else {
      data[i + 3] = 0;
    }
  }
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

function resolveExportDimensions(
  naturalWidth: number,
  naturalHeight: number,
  crop: { w: number; h: number },
  resolution: ExportResolution
): { canvasW: number; canvasH: number; outputScale: number } {
  const baseW = Math.round(crop.w);
  const baseH = Math.round(crop.h);

  if (resolution === "original" || resolution === "4k") {
    return { canvasW: baseW, canvasH: baseH, outputScale: 1 };
  }

  const maxDim = 1920;
  const longest = Math.max(baseW, baseH);
  if (longest <= maxDim) {
    return { canvasW: baseW, canvasH: baseH, outputScale: 1 };
  }

  const scale = maxDim / longest;
  return {
    canvasW: Math.round(baseW * scale),
    canvasH: Math.round(baseH * scale),
    outputScale: scale,
  };
}

/**
 * Triple-pass text: pass 1 shadow/glow, passes 2–3 solid fill for gap-free glyphs.
 * Mustang Stretch: ctx.scale(1, heightScale) applied before drawing.
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
  ctx.font = `${italicPrefix}${resolvedWeight} ${finalFontSize}px "${t.fontFamily}", sans-serif`;

  const letterSpacingCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (t.letterSpacing !== undefined) {
    letterSpacingCtx.letterSpacing = `${t.letterSpacing * scaleFactor}px`;
  }

  const textMetrics = ctx.measureText(t.text);
  const textWidth = textMetrics.width;
  const halfW = textWidth / 2;
  const halfH = (finalFontSize * heightScale) / 2;

  let adjustedTx = tx;
  let adjustedTy = ty;
  if (adjustedTx - halfW < 0) adjustedTx = halfW;
  else if (adjustedTx + halfW > canvasW) adjustedTx = canvasW - halfW;
  if (adjustedTy - halfH < 0) adjustedTy = halfH;
  else if (adjustedTy + halfH > canvasH) adjustedTy = canvasH - halfH;

  ctx.translate(adjustedTx, adjustedTy);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(1, heightScale);

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.globalAlpha = t.opacity;
  ctx.fillStyle = t.color;

  for (let pass = 0; pass < 3; pass++) {
    ctx.save();

    if (pass === 0) {
      if (t.glowEnabled) {
        ctx.shadowColor = t.glowColor;
        ctx.shadowBlur = t.glowBlur * scaleFactor;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else if (t.shadowBlur > 0 || t.shadowOffsetX !== 0 || t.shadowOffsetY !== 0) {
        ctx.shadowColor = t.shadowColor;
        ctx.shadowBlur = t.shadowBlur * scaleFactor;
        ctx.shadowOffsetX = t.shadowOffsetX * scaleFactor;
        ctx.shadowOffsetY = t.shadowOffsetY * scaleFactor;
      }
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.globalAlpha = t.opacity;
      ctx.fillStyle = t.color;
    }

    ctx.fillText(t.text, 0, 0);

    if (pass === 0 && t.isBold) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = Math.max(1, 2 * scaleFactor);
      ctx.lineJoin = "round";
      ctx.strokeText(t.text, 0, 0);
    }

    if (pass === 0 && t.isUnderline) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
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
    model: "isnet",
    progress: (key: string, current: number, total: number) => {
      if (!onProgress) return;
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      let stage = "Analyzing image...";
      if (key.includes("fetch")) stage = "Downloading AI Model (isnet)...";
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

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cutoutImg, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    applyBmwSolidMask(imgData);
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
          applyBmwSolidMask(areaData);
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

/**
 * Zero-fail export engine — native-resolution composite with Auto-Enhance on background.
 * Returns raw Blob for private download or cloud upload pipelines.
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
  const safePreviewWidth = Math.max(1, previewWidth);

  const [bgImg, cutoutImg] = await Promise.all([
    loadImage(backgroundSrc),
    cutoutSrc ? loadImage(cutoutSrc) : Promise.resolve(null),
  ]);

  await ensureTextFontsLoaded(textConfigs);

  const naturalWidth = bgImg.naturalWidth;
  const naturalHeight = bgImg.naturalHeight;
  const crop = computeCropRect(naturalWidth, naturalHeight, targetRatio);
  const { canvasW, canvasH, outputScale } = resolveExportDimensions(
    naturalWidth,
    naturalHeight,
    crop,
    resolution
  );

  const scaleFactor = (naturalWidth / safePreviewWidth) * outputScale;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    throw new Error("Could not create high resolution rendering canvas context");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  const scaledBlur = backgroundBlur > 0 ? backgroundBlur * scaleFactor : 0;
  const bgFilter = buildBackgroundFilter(filters, scaledBlur);

  ctx.save();
  ctx.filter = bgFilter || "none";

  if (backgroundBlur > 0) {
    const bleed = scaledBlur * 2;
    ctx.drawImage(
      bgImg,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      -bleed,
      -bleed,
      canvasW + bleed * 2,
      canvasH + bleed * 2
    );
  } else {
    ctx.drawImage(
      bgImg,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      0,
      0,
      canvasW,
      canvasH
    );
  }
  ctx.restore();
  ctx.filter = "none";

  textConfigs.forEach((t) => drawTextLayer(ctx, t, canvasW, canvasH, scaleFactor));

  if (cutoutImg) {
    const cutoutCrop = computeCropRect(
      cutoutImg.naturalWidth,
      cutoutImg.naturalHeight,
      targetRatio
    );

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(
      cutoutImg,
      cutoutCrop.x,
      cutoutCrop.y,
      cutoutCrop.w,
      cutoutCrop.h,
      0,
      0,
      canvasW,
      canvasH
    );
    ctx.restore();
  }

  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const quality = format === "jpeg" ? 0.98 : undefined;

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
