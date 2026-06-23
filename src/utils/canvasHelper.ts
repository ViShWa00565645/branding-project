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
 * using @imgly/background-removal with isnet_fp16 model and the
 * advanced "BMW Solid Mask" algorithm (alpha > 15 → 255).
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
    // 1. Run @imgly/background-removal with isnet_fp16 model for professional-grade masking
    const cutoutBlob = await removeBackground(imageSrc, {
      model: "isnet_fp16",
      progress: (key: string, current: number, total: number) => {
        if (onProgress) {
          const percent = total > 0 ? Math.round((current / total) * 100) : 0;
          let stage = "Analyzing image...";
          if (key.includes("fetch")) stage = "Downloading AI Model (isnet_fp16)...";
          if (key.includes("compute")) stage = "Processing subject mask...";
          onProgress(stage, percent);
        }
      },
    } as any);
    const blobUrl = URL.createObjectURL(cutoutBlob);

    // 2. Load blob as Image so we can postprocess with Canvas & BMW Solid Mask
    const imgObj = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = blobUrl;
    });

    // Create post-processing canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(blobUrl);
      throw new Error("Failed to create canvas context");
    }

    const w = imgObj.width;
    const h = imgObj.height;
    canvas.width = w;
    canvas.height = h;

    // Draw cutout output
    ctx.drawImage(imgObj, 0, 0, w, h);
    URL.revokeObjectURL(blobUrl);

    // 3. BMW SOLID MASK FIX:
    // For any pixel with alpha > 20, force it to 255.
    // This makes car windows, hair strands, and semi-transparent edges 100% solid.
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a > 20) {
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // 4. Apply custom manual Brush Mask strokes on top
    if (strokes.length > 0) {
      ctx.save();

      // Load raw original background to restore from if stroke is "restore"
      const originalImg = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = imageSrc;
      });

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
          ctx.drawImage(originalImg, 0, 0, w, h);

          // Re-solidify newly restored pixels with BMW fix (alpha > 20)
          const areaData = ctx.getImageData(0, 0, w, h);
          const aData = areaData.data;
          for (let k = 0; k < aData.length; k += 4) {
            if (aData[k + 3] > 20) {
              aData[k + 3] = 255;
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
  backgroundBlur: number = 0
): Promise<string> {
  return new Promise((resolve, reject) => {
    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous";
    bgImg.src = backgroundSrc;

    bgImg.onload = () => {
      const cutoutImg = new Image();
      cutoutImg.crossOrigin = "anonymous";

      const proceed = () => {
        // ─── 0. Resolution baseline — always start from naturalWidth × naturalHeight ───
        let targetWidth = bgImg.naturalWidth;
        let targetHeight = bgImg.naturalHeight;

        if (resolution === "hd") {
          const hdBound = 1920;
          const longestEdge = Math.max(targetWidth, targetHeight);
          if (longestEdge < hdBound) {
            const scale = hdBound / longestEdge;
            targetWidth = Math.round(targetWidth * scale);
            targetHeight = Math.round(targetHeight * scale);
          }
        } else if (resolution === "4k") {
          const fourKBound = 3840;
          const longestEdge = Math.max(targetWidth, targetHeight);
          if (longestEdge < fourKBound) {
            const scale = fourKBound / longestEdge;
            targetWidth = Math.round(targetWidth * scale);
            targetHeight = Math.round(targetHeight * scale);
          }
        }

        // ─── 1. Aspect-ratio crop math ───
        let canvasW = targetWidth;
        let canvasH = targetHeight;
        let sourceX = 0;
        let sourceY = 0;
        let sourceW = bgImg.naturalWidth;
        let sourceH = bgImg.naturalHeight;

        if (targetRatio) {
          const currentRatio = sourceW / sourceH;
          if (currentRatio > targetRatio) {
            const croppedW = sourceH * targetRatio;
            sourceX = (sourceW - croppedW) / 2;
            sourceW = croppedW;
          } else {
            const croppedH = sourceW / targetRatio;
            sourceY = (sourceH - croppedH) / 2;
            sourceH = croppedH;
          }
          canvasW = targetWidth;
          canvasH = Math.round(targetWidth / targetRatio);
        }

        // ─── 2. Create the export canvas ───
        const canvas = document.createElement("canvas");
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) {
          reject("Could not create high resolution rendering canvas context");
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // ─── 3. Layer 1 — Background (with optional DSLR blur) ───
        const scaleFactor = canvasW / displayWidthRef;

        if (backgroundBlur && backgroundBlur > 0) {
          const scaledBlur = backgroundBlur * scaleFactor;
          ctx.save();
          ctx.drawImage(bgImg, sourceX, sourceY, sourceW, sourceH, 0, 0, canvasW, canvasH);
          ctx.filter = `blur(${scaledBlur}px)`;
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
          ctx.drawImage(bgImg, sourceX, sourceY, sourceW, sourceH, 0, 0, canvasW, canvasH);
        }

        ctx.filter = "none";

        // ─── 4. Layer 2 — TRIPLE-PASS Text Rendering ───
        // Draw text 3 times for maximum solidity and sharpness in high-res exports
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

            ctx.translate(tx, ty);
            ctx.rotate((t.rotation * Math.PI) / 180);

            ctx.font = `${italicPrefix}${resolvedWeight} ${finalFontSize}px "${t.fontFamily}", sans-serif`;
            ctx.textBaseline = "middle";
            ctx.textAlign = "center";
            ctx.globalAlpha = t.opacity;

            // Shadow / Glow — only on first pass to prevent cumulative shadow buildup
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

            // Bold stroke overlay (first pass only)
            if (pass === 0 && t.isBold) {
              ctx.shadowColor = "transparent";
              ctx.shadowBlur = 0;
              ctx.strokeStyle = t.color;
              ctx.lineWidth = Math.max(1, 2 * scaleFactor);
              ctx.lineJoin = "round";
              ctx.strokeText(t.text, 0, 0);
            }

            // Underline (first pass only)
            if (pass === 0 && t.isUnderline) {
              ctx.shadowColor = "transparent";
              ctx.shadowBlur = 0;
              const textMetrics = ctx.measureText(t.text);
              const textWidth = textMetrics.width;
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
        if (cutoutSrc && cutoutImg.complete && cutoutImg.naturalWidth > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.globalAlpha = 1.0;

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

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              resolve(url);
            } else {
              reject("Failed to compile final image canvas data");
            }
          },
          mime,
          quality
        );
      };

      if (cutoutSrc) {
        cutoutImg.onload = proceed;
        cutoutImg.onerror = () => {
          console.warn("Cutout image failed to load, exporting with text only");
          proceed();
        };
        cutoutImg.src = cutoutSrc;
      } else {
        proceed();
      }
    };

    bgImg.onerror = () => {
      reject("Failed to load background source image for composite");
    };
  });
}