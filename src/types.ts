export interface TextConfig {
  id: string;
  text: string;
  fontSize: number; // 10px to 1000px
  fontWeight: number; // 100 to 900
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
  color: string;
  opacity: number; // 0 to 1
  letterSpacing: number; // in pixels or em
  lineHeight: number; // multiplier e.g. 1.2
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  glowEnabled: boolean;
  glowColor: string;
  glowBlur: number;
  // Position and transforming
  x: number; // percent based (0 - 100)
  y: number; // percent based (0 - 100)
  rotation: number; // degrees (0 - 360)
  scale: number; // 0.1 to 10
  heightScale: number; // 1 to 5 for vertical stretch
}

export interface PresetImage {
  id: string;
  title: string;
  category: "Humans" | "Cars" | "Products" | "Animals" | "Objects";
  imageUrl: string;
  // A clean cutout mask base64 or a smart contrast key config
  cutoutUrl?: string; // transparent foreground layer
  defaultText: string;
  defaultFontSize: number;
  defaultColor: string;
  defaultFontFamily: string;
  subjectMaskThreshold?: number; // threshold adjustment for auto masking
}

export interface AIResult {
  provider: "gemini" | "flux" | "huggingface";
  imageUrl: string;
  status: "idle" | "generating" | "success" | "error";
  error?: string;
  isPlaceholder?: boolean;
}

export type AspectRatio = "Original" | "1:1" | "4:5" | "9:16" | "16:9" | "2:3" | "16:10";

export const ASPECT_RATIO_PRESETS: Record<AspectRatio, { label: string; aspect: string; ratio: number | null }> = {
  Original: { label: "Original", aspect: "aspect-auto", ratio: null },
  "1:1": { label: "Square (1:1)", aspect: "aspect-square", ratio: 1 },
  "4:5": { label: "Social (4:5)", aspect: "aspect-[4/5]", ratio: 0.8 },
  "9:16": { label: "Story (9:16)", aspect: "aspect-[9/16]", ratio: 9 / 16 },
  "16:9": { label: "Landscape (16:9)", aspect: "aspect-[16/9]", ratio: 16 / 9 },
  "2:3": { label: "Portrait (2:3)", aspect: "aspect-[2/3]", ratio: 2 / 3 },
  "16:10": { label: "Widescreen (16:10)", aspect: "aspect-[16/10]", ratio: 16 / 10 },
};
