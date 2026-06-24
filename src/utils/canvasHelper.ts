import { removeBackground } from "@imgly/background-removal";
import { TextConfig } from "../types";

export interface BrushStroke {
  x: number; // percentage based (0-100) of image width
  y: number; // percentage based (0-100) of image height
  radius: number; // brush size
  type: "erase" | "restore";
}

/**
 * Creates high performance transparent cutout from a source image
 * using @imgly/background-removal with isnet model and the
 * advanced "BMW Solid Mask" algorithm (alpha > 20 → 255).
 */
export async function generateCutout(
  imageSrc: string,
  threshold: number,
  feather: number,
  strokes: BrushStroke[] = [],
  customBgColor?: string,
  onProgress?: (step: string, percent: number) => void
): Promise<string> {
  try {
    // 1. Run @imgly/background-removal with isnet model (high-quality) for professional-grade masking
    const cutoutBlob = await removeBackground(imageSrc, {
      model: "isnet",
      progress: (key: string, current: number, total: number) => {
        if (onProgress) {
          const percent = total > 0 ? Math.round((current / total) * 100) : 0;
          let stage = "Analyzing image...";
          if (key.includes("fetch")) stage = "Downloading AI Model (isnet)...";
          if (key.includes("compute")) stage = "Processing subject mask...";
          onProgress(stage, percent);
        }
      },
    } as any);
    const blobUrl = URL.createObjectURL(cutoutBlob);

    // 2. Load blob as Image so we can postprocess with Canvas & Soft-Glow outline removal
    const imgObj = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = blobUrl;
    });

    // Load original image to get the true full-resolution dimensions (e.g., 4K)
    const originalImg = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = imageSrc;
    });

    // Create post-processing canvas at the original image's full resolution
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(blobUrl);
      throw new Error("Failed to create canvas context");
    }

    const w = originalImg.naturalWidth;
    const h = originalImg.naturalHeight;
    canvas.width = w;
    canvas.height = h;

    // Enforce high quality smoothing during full-res scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Draw the cutout scaled back to the original full-resolution (naturalWidth/Height)
    ctx.drawImage(imgObj, 0, 0, w, h);
    URL.revokeObjectURL(blobUrl);

    // 3. BMW SOLID MASK & SOFT-GLOW REMOVAL:
    // For semi-transparent edge outline pixels, we clean up gray/white halos.
    // Otherwise, we solidify alpha > 20 to 255 to hide text behind subject perfectly.
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a > 0 && a < 255) {
        // Soft-Glow Removal: clean up white/grey outlines/halos around hair and shoulders
        const isLightGrey = r > 180 && g > 180 && b > 180 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && Math.abs(r - b) < 25;
        if (isLightGrey && a < 180) {
          data[i + 3] = Math.max(0, Math.round(a * 0.1)); // Soften / fade out outline halos
        } else if (a > 20) {
          data[i + 3] = 255;
        } else {
          data[i + 3] = 0;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // 4. Apply custom manual Brush Mask strokes on top
    if (strokes.length > 0) {
      ctx.save();

      // Reuse the already loaded original image
      const originalImgRestore = originalImg;

      strokes.forEach((stroke) => {
        const sx = (stroke.x / 100) * w;
        const sy = (stroke.y / 100) * h;
        const srad = (stroke.radius / 100) * w;

        ctx.beginPath();
        ctx.arc(sx, sy, srad, 0, Math.PI * 2);

        if (stroke.type === "erase") {
          // Cut holes in cutout
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillStyle = "rgba(0,0,0,1)";
          ctx.fill();
        } else if (originalImg) {
          // Restore from original image
          ctx.globalCompositeOperation = "source-over";
          ctx.save();
          ctx.beginPath();
          ctx.arc(sx, sy, srad, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(originalImgRestore, 0, 0, w, h);

          // Re-solidify and clean outline halos
          const areaData = ctx.getImageData(0, 0, w, h);
          const aData = areaData.data;
          for (let k = 0; k < aData.length; k += 4) {
            const ar = aData[k];
            const ag = aData[k + 1];
            const ab = aData[k + 2];
            const aa = aData[k + 3];

            if (aa > 0 && aa < 255) {
              // Soft-Glow Removal: clean up white/grey outlines/halos around hair and shoulders
              const isLightGrey = ar > 180 && ag > 180 && ab > 180 && Math.abs(ar - ag) < 25 && Math.abs(ag - ab) < 25 && Math.abs(ar - ab) < 25;
              if (isLightGrey && aa < 180) {
                aData[k + 3] = Math.max(0, Math.round(aa * 0.1));
              } else if (aa > 20) {
                aData[k + 3] = 255;
              } else {
                aData[k + 3] = 0;
              }
            }
          }
          ctx.putImageData(areaData, 0, 0);

          ctx.restore();
        }
      });
      ctx.restore();
    }

    // Done. Extract base64 transparent PNG cutout
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.error("AI Background Removal / Cutout compilation failed", err);
    throw err;
  }
}

/**
 * Composites background + text + cutout foreground at the full native resolution
 * of the source photograph. Uses naturalWidth × naturalHeight for true 4K export.
 *
 * Key engineering features:
 *  1. Resolution baseline is always naturalWidth × naturalHeight
 *  2. Triple-Pass text rendering for solid, sharp font texture in exports
 *  3. BMW Solid Mask ensures subject cutout has zero transparency bleed
 *  4. JPEG encoder quality at 0.98 for near-lossless professional output
 */
export async function exportComposite(
  backgroundSrc: string,
  cutoutSrc: string | null,
  textConfig: TextConfig | TextConfig[],
  aspectRatioLabel: string,
  targetRatio: number | null,
  resolution: "original" | "hd" | "4k",
  format: "png" | "jpeg",
  displayWidthRef: number = 500,
  backgroundBlur: number = 0,
  filters?: {
    brightness: number;
    contrast: number;
    saturation: number;
    sharpen: number;
  }
): Promise<string> {
  // 1. Preload both images using Promise.all to ensure background and cutout are 100% loaded
  const loadImg = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  };

  const promises: [Promise<HTMLImageElement>, Promise<HTMLImageElement | null>] = [
    loadImg(backgroundSrc),
    cutoutSrc ? loadImg(cutoutSrc).catch(() => null) : Promise.resolve(null)
  ];

  const [bgImg, cutoutImg] = await Promise.all(promises);
  if (!bgImg) {
    throw new Error("Failed to load background source image");
  }

  // ─── 0. Resolution baseline — set canvas dimensions exactly to bgImg.naturalWidth and bgImg.naturalHeight ───
  let canvasW = bgImg.naturalWidth;
  let canvasH = bgImg.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceW = bgImg.naturalWidth;
  let sourceH = bgImg.naturalHeight;

  // ─── 1. Aspect-ratio crop math at full native resolution ───
  if (targetRatio) {
    const currentRatio = sourceW / sourceH;
    if (currentRatio > targetRatio) {
      const croppedW = sourceH * targetRatio;
      sourceX = (sourceW - croppedW) / 2;
      sourceW = croppedW;
      canvasW = Math.round(croppedW);
      canvasH = Math.round(sourceH);
    } else {
      const croppedH = sourceW / targetRatio;
      sourceY = (sourceH - croppedH) / 2;
      sourceH = croppedH;
      canvasW = Math.round(sourceW);
      canvasH = Math.round(croppedH);
    }
  }

  // ─── 2. Create the export canvas ───
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    throw new Error("Could not create high resolution rendering canvas context");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // ─── 3. Layer 1 — Background (with optional DSLR blur & adjustments) ───
  const scaleFactor = canvasW / displayWidthRef;

  // Build combined filter string
  let filterString = "";
  if (filters) {
    filterString += `brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) `;
    if (filters.sharpen > 0) {
      filterString += `url(#sharpen-effect) `;
    }
  }

  if (backgroundBlur && backgroundBlur > 0) {
    const scaledBlur = backgroundBlur * scaleFactor;
    ctx.save();
    ctx.filter = `${filterString}blur(${scaledBlur}px)`.trim();
    const offset = scaledBlur * 2;
    ctx.drawImage(
      bgImg,
      sourceX, sourceY, sourceW, sourceH,
      -offset, -offset,
      canvasW + offset * 2,
      canvasH + offset * 2
    );
    ctx.restore();
  } else {
    ctx.save();
    if (filterString) {
      ctx.filter = filterString.trim();
    }
    ctx.drawImage(bgImg, sourceX, sourceY, sourceW, sourceH, 0, 0, canvasW, canvasH);
    ctx.restore();
  }

  ctx.filter = "none";

  // ─── 4. Layer 2 — TRIPLE-PASS Text Rendering ───
  const textConfigs = Array.isArray(textConfig) ? textConfig : [textConfig];

  textConfigs.forEach((t) => {
    const tx = (t.x / 100) * canvasW;
    const ty = (t.y / 100) * canvasH;
    const finalFontSize = t.fontSize * scaleFactor * t.scale;
    const resolvedWeight = (t.isBold && t.fontWeight < 700) ? 900 : t.fontWeight;
    const italicPrefix = t.isItalic ? "italic " : "";

    // Triple-Pass: draw text 3 times for solid, sharp font texture
    for (let pass = 0; pass < 3; pass++) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Set font and letter spacing first to accurately measure text metrics
      ctx.font = `${italicPrefix}${resolvedWeight} ${finalFontSize}px "${t.fontFamily}", sans-serif`;
      if (t.letterSpacing !== undefined) {
        (ctx as any).letterSpacing = `${t.letterSpacing * scaleFactor}px`;
      }

      const textMetrics = ctx.measureText(t.text);
      const textWidth = textMetrics.width;

      // Bounding box dimensions for alignment check (accounting for letter width/height)
      const halfW = textWidth / 2;
      const halfH = (finalFontSize * (t.heightScale || 1)) / 2;

      // Constrain adjusted translation coordinates to prevent clipping on the canvas edges
      let adjustedTx = tx;
      let adjustedTy = ty;

      if (adjustedTx - halfW < 0) {
        adjustedTx = halfW;
      } else if (adjustedTx + halfW > canvasW) {
        adjustedTx = canvasW - halfW;
      }

      if (adjustedTy - halfH < 0) {
        adjustedTy = halfH;
      } else if (adjustedTy + halfH > canvasH) {
        adjustedTy = canvasH - halfH;
      }

      // Apply translation, rotation, and scaling transformations safely inside save/restore
      ctx.translate(adjustedTx, adjustedTy);
      ctx.rotate((t.rotation * Math.PI) / 180);

      // Apply vertical stretch
      if (t.heightScale && t.heightScale !== 1) {
        ctx.scale(1, t.heightScale);
      }

      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.globalAlpha = t.opacity;

      // Shadow / Glow (High-DPI scaled)
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
      }

      // Fill text
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);

      // Bold stroke overlay with High-DPI scaled strokeWidth (first pass only)
      if (pass === 0 && t.isBold) {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.strokeStyle = t.color;
        const strokeWidth = Math.max(1, 2 * scaleFactor);
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = "round";
        ctx.strokeText(t.text, 0, 0);
      }

      // Underline with High-DPI scaled metrics (first pass only)
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
  });

  // ─── 5. Layer 3 — Subject cutout overlay ───
  if (cutoutImg) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = 1.0;

    if (filterString) {
      ctx.filter = filterString.trim();
    }

    let cutoutSourceX = 0;
    let cutoutSourceY = 0;
    let cutoutSourceW = cutoutImg.naturalWidth;
    let cutoutSourceH = cutoutImg.naturalHeight;

    if (targetRatio) {
      const currentRatio = cutoutSourceW / cutoutSourceH;
      if (currentRatio > targetRatio) {
        const croppedW = cutoutSourceH * targetRatio;
        cutoutSourceX = (cutoutSourceW - croppedW) / 2;
        cutoutSourceW = croppedW;
      } else {
        const croppedH = cutoutSourceW / targetRatio;
        cutoutSourceY = (cutoutSourceH - croppedH) / 2;
        cutoutSourceH = croppedH;
      }
    }

    ctx.drawImage(
      cutoutImg,
      cutoutSourceX, cutoutSourceY, cutoutSourceW, cutoutSourceH,
      0, 0, canvasW, canvasH
    );
    ctx.restore();
  }

  // ─── 6. Encode & export ───
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  const quality = format === "jpeg" ? 0.98 : undefined;

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          resolve(url);
        } else {
          reject(new Error("Failed to compile final image canvas data"));
        }
      },
      mime,
      quality
    );
  });
}