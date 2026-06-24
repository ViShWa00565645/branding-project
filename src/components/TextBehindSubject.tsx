import React, { useState, useEffect, useRef } from "react";
import { GOOGLE_FONTS, loadGoogleFont } from "../utils/fonts";
import { AspectRatio, ASPECT_RATIO_PRESETS, TextConfig } from "../types";
import {
  generateCutout,
  exportCompositeBlob,
  BrushStroke,
  ExportFormat,
  ExportResolution,
  ImageFilters,
} from "../utils/canvasHelper";
import { supabase } from "../utils/supabaseClient";
import { getDeviceId } from "../utils/auth";
import {
  Type, CaseUpper, Paintbrush, Sliders, Move, RefreshCw,
  Download, AlertCircle, Trash2, Eye, EyeOff, Upload,
  ChevronDown, Search, Camera, Linkedin, Instagram, Check, Share2
} from "lucide-react";
import logo from "../assets/logo.png";

export default function TextBehindSubject({
  sharedImage,
  setSharedImage,
  resetCanvasTrigger,
}: {
  sharedImage?: string;
  setSharedImage?: React.Dispatch<React.SetStateAction<string>>;
  resetCanvasTrigger?: number;
}) {
  const [localImage, setLocalImage] = useState<string>("");
  const selectedImage = sharedImage !== undefined ? sharedImage : localImage;
  const setSelectedImage = setSharedImage !== undefined ? setSharedImage : setLocalImage;

  const [customImageFile, setCustomImageFile] = useState<File | null>(null);

  // Layout ratio
  const [ratio, setRatio] = useState<AspectRatio>("Original");

  // Synchronize canvas resets when trigger increments
  useEffect(() => {
    if (resetCanvasTrigger && resetCanvasTrigger > 0) {
      setStrokes([]);
      setThreshold(32);
      setRatio("Original");
      setCustomImageFile(null);
    }
  }, [resetCanvasTrigger]);

  // Cutout loading state and the generated cutout base64 URL
  const [isMasking, setIsMasking] = useState<boolean>(false);
  const [maskProgress, setMaskProgress] = useState<{ step: string; percent: number } | null>(null);
  const [maskError, setMaskError] = useState<string | null>(null);
  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);

  // Mask thresholds and edge feather rules
  const [threshold, setThreshold] = useState<number>(35);
  const [feather, setFeather] = useState<number>(10);
  const [customBgColor, setCustomBgColor] = useState<string>("");

  // Active DSLR background lens blur intensity
  const [bgBlur, setBgBlur] = useState<number>(0);

  // Is "Behind Subject Layer" enabled?
  const [behindSubjectEnabled, setBehindSubjectEnabled] = useState<boolean>(true);

  // Canvas brush strokes for manual erase / restore of mask
  const [brushMode, setBrushMode] = useState<"disabled" | "erase" | "restore">("disabled");
  const [brushSize, setBrushSize] = useState<number>(8);
  const [strokes, setStrokes] = useState<BrushStroke[]>([]);

  // Text layers state
  const [textLayers, setTextLayers] = useState<TextConfig[]>([
    {
      id: "1",
      text: "POSTER",
      fontSize: 120,
      fontWeight: 800,
      fontFamily: "Space Grotesk",
      isBold: false,
      isItalic: false,
      isUnderline: false,
      color: "#ffffff",
      opacity: 1,
      letterSpacing: 2,
      lineHeight: 1.2,
      shadowColor: "rgba(0,0,0,0.4)",
      shadowBlur: 10,
      shadowOffsetX: 4,
      shadowOffsetY: 4,
      glowEnabled: false,
      glowColor: "#ffffff",
      glowBlur: 15,
      x: 50,
      y: 45,
      rotation: 0,
      scale: 1,
      heightScale: 1,
    }
  ]);
  const [selectedLayerId, setSelectedLayerId] = useState<string>("1");

  const selectedLayer = textLayers.find((l) => l.id === selectedLayerId) || textLayers[0] || null;

  const updateSelectedLayer = (updates: Partial<TextConfig>) => {
    if (!selectedLayerId) return;
    setTextLayers((prev) =>
      prev.map((l) => (l.id === selectedLayerId ? { ...l, ...updates } : l))
    );
  };

  // Automatically dismiss the mobile virtual keyboard
  useEffect(() => {
    const handleGlobalTouchOrClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      const isTextInput =
        (target.tagName === "INPUT" && (target.getAttribute("type") === "text" || !target.getAttribute("type"))) ||
        target.tagName === "TEXTAREA";

      if (!isTextInput) {
        const activeEl = document.activeElement as HTMLElement;
        if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
          activeEl.blur();
        }
      }
    };

    document.addEventListener("mousedown", handleGlobalTouchOrClick, { passive: true });
    document.addEventListener("touchstart", handleGlobalTouchOrClick, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleGlobalTouchOrClick);
      document.removeEventListener("touchstart", handleGlobalTouchOrClick);
    };
  }, []);

  // Current open tab — 3 tabs: Text, Image, Settings
  const [activeTab, setActiveTab] = useState<"text" | "image" | "settings">("text");

  // Image Processing State Variables
  const [brightness, setBrightness] = useState<number>(1.0);
  const [contrast, setContrast] = useState<number>(1.0);
  const [saturation, setSaturation] = useState<number>(1.0);
  const [sharpen, setSharpen] = useState<number>(0.0);

  // Dynamic sharpen kernel matrix calculation: 0 -sharpen 0 -sharpen (1 + 4*sharpen) -sharpen 0 -sharpen 0
  const sharpenKernel = `0 ${-sharpen} 0 ${-sharpen} ${1 + 4 * sharpen} ${-sharpen} 0 ${-sharpen} 0`;

  // Font family select dropdown states
  const [fontDropdownOpen, setFontDropdownOpen] = useState<boolean>(false);
  const [fontSearch, setFontSearch] = useState<string>("");

  // Export configuration
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isPostingToGallery, setIsPostingToGallery] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [exportResolution, setExportResolution] = useState<ExportResolution>("original");
  const [previewWidth, setPreviewWidth] = useState<number>(500);

  // Community gallery upload status (Button B only)
  const [galleryStatus, setGalleryStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [galleryMessage, setGalleryMessage] = useState<string>("");

  // Interaction Ref for canvas dragging
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ isDragging: boolean; startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  // Track live preview width so export scaleFactor matches on-screen layout
  useEffect(() => {
    const node = canvasContainerRef.current;
    if (!node) return;

    const updatePreviewWidth = () => {
      const width = node.clientWidth;
      if (width > 0) {
        setPreviewWidth(width);
      }
    };

    updatePreviewWidth();
    const observer = new ResizeObserver(updatePreviewWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, [selectedImage, ratio]);

  // Initialize and load default baseline fonts
  useEffect(() => {
    if (selectedLayer) {
      loadGoogleFont(selectedLayer.fontFamily);
    }
  }, [selectedLayer?.fontFamily]);

  // Load the cutout when image, threshold, feather, or custom brush strokes change
  useEffect(() => {
    async function updateMask() {
      if (!selectedImage) return;
      setIsMasking(true);
      setMaskProgress({ step: "Analyzing image...", percent: 0 });
      setMaskError(null);
      try {
        const result = await generateCutout(
          selectedImage,
          threshold,
          feather,
          strokes,
          customBgColor || undefined,
          (step, percent) => {
            setMaskProgress({ step, percent });
          }
        );
        setCutoutUrl(result);
      } catch (err: unknown) {
        console.error("Mask generation failed", err);
        setMaskError("Automatic subject detection failed. Ensure the image is accessible.");
      } finally {
        setIsMasking(false);
        setMaskProgress(null);
      }
    }
    updateMask();
  }, [selectedImage, threshold, feather, strokes, customBgColor]);

  // Handle custom image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCustomImageFile(file);
    setStrokes([]);
    setThreshold(30);
    setRatio("Original");

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSelectedImage(reader.result);
        setTextLayers((prev) =>
          prev.map((l, idx) =>
            idx === 0
              ? {
                  ...l,
                  text: "POSTER",
                  fontSize: 120,
                  color: "#ffffff",
                  fontFamily: "Space Grotesk",
                  x: 50,
                  y: 40,
                }
              : l
          )
        );
      }
    };
    reader.readAsDataURL(file);
  };

  // Direct Drag on Canvas text element
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, layerId: string) => {
    if (brushMode !== "disabled") return;
    e.preventDefault();
    (document.activeElement as HTMLElement)?.blur();
    setSelectedLayerId(layerId);

    const targetLayer = textLayers.find((l) => l.id === layerId);
    if (!targetLayer || !canvasContainerRef.current) return;

    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initialX: targetLayer.x,
      initialY: targetLayer.y,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current || !dragRef.current.isDragging || !canvasContainerRef.current) return;

      const drag = dragRef.current;
      const bounds = canvasContainerRef.current.getBoundingClientRect();

      const deltaX = ((ev.clientX - drag.startX) / bounds.width) * 100;
      const deltaY = ((ev.clientY - drag.startY) / bounds.height) * 100;

      let targetX = drag.initialX + deltaX;
      let targetY = drag.initialY + deltaY;

      targetX = Math.max(0, Math.min(100, targetX));
      targetY = Math.max(0, Math.min(100, targetY));

      const roundedX = Math.round(targetX * 10) / 10;
      const roundedY = Math.round(targetY * 10) / 10;

      setTextLayers((prev) =>
        prev.map((l) => (l.id === layerId ? { ...l, x: roundedX, y: roundedY } : l))
      );
    };

    const handleMouseUp = () => {
      if (dragRef.current) {
        dragRef.current.isDragging = false;
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Touch handlers for responsive mobile dragging
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>, layerId: string) => {
    if (brushMode !== "disabled") return;
    if (e.touches.length !== 1) return;
    (document.activeElement as HTMLElement)?.blur();
    setSelectedLayerId(layerId);

    const targetLayer = textLayers.find((l) => l.id === layerId);
    if (!targetLayer || !canvasContainerRef.current) return;

    const touch = e.touches[0];
    dragRef.current = {
      isDragging: true,
      startX: touch.clientX,
      startY: touch.clientY,
      initialX: targetLayer.x,
      initialY: targetLayer.y,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>, layerId: string) => {
    if (!dragRef.current || !dragRef.current.isDragging || !canvasContainerRef.current) return;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const container = canvasContainerRef.current;
    const bounds = container.getBoundingClientRect();

    const deltaX = ((touch.clientX - dragRef.current.startX) / bounds.width) * 100;
    const deltaY = ((touch.clientY - dragRef.current.startY) / bounds.height) * 100;

    let targetX = dragRef.current.initialX + deltaX;
    let targetY = dragRef.current.initialY + deltaY;

    targetX = Math.max(0, Math.min(100, targetX));
    targetY = Math.max(0, Math.min(100, targetY));

    const roundedX = Math.round(targetX * 10) / 10;
    const roundedY = Math.round(targetY * 10) / 10;

    setTextLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, x: roundedX, y: roundedY } : l))
    );
  };

  const handleTouchEnd = () => {
    if (dragRef.current) dragRef.current.isDragging = false;
  };

  // Brush drawing stroke click on Canvas for manual mask refinements
  const handleCanvasContainerClickAndDraw = (e: React.MouseEvent<HTMLDivElement>) => {
    if (brushMode === "disabled") return;
    const container = canvasContainerRef.current;
    if (!container) return;

    const bounds = container.getBoundingClientRect();
    const x = ((e.clientX - bounds.left) / bounds.width) * 100;
    const y = ((e.clientY - bounds.top) / bounds.height) * 100;

    const newStroke: BrushStroke = {
      x,
      y,
      radius: brushSize,
      type: brushMode,
    };

    setStrokes((prev) => [...prev, newStroke]);
  };

  // Touch drawing mask strokes
  const handleCanvasContainerTouchAndDraw = (e: React.TouchEvent<HTMLDivElement>) => {
    if (brushMode === "disabled") return;
    if (e.touches.length !== 1) return;
    const container = canvasContainerRef.current;
    if (!container) return;

    const touch = e.touches[0];
    const bounds = container.getBoundingClientRect();
    const x = ((touch.clientX - bounds.left) / bounds.width) * 100;
    const y = ((touch.clientY - bounds.top) / bounds.height) * 100;

    const newStroke: BrushStroke = {
      x,
      y,
      radius: brushSize,
      type: brushMode,
    };

    setStrokes((prev) => [...prev, newStroke]);
  };

  // Smart placement & face protection logic
  const handleSmartFaceReposition = () => {
    if (!selectedLayerId) return;
    const isPortrait = ratio === "9:16" || ratio === "4:5" || ratio === "2:3";
    updateSelectedLayer({
      x: 50,
      y: isPortrait ? 25 : 20,
      fontSize: selectedLayer ? Math.min(150, selectedLayer.fontSize) : 120,
    });
  };

  // Quick Action: Auto Fit
  const handleAutoFitText = () => {
    if (!selectedLayer) return;
    const textLength = selectedLayer.text.length || 1;
    let targetSize = 150;
    if (textLength > 6) {
      targetSize = 80;
    } else if (textLength > 4) {
      targetSize = 110;
    } else {
      targetSize = 180;
    }

    updateSelectedLayer({
      fontSize: targetSize,
      scale: 1,
      letterSpacing: textLength > 5 ? 1 : 4,
    });
  };

  // Quick Action: Auto Center
  const handleAutoCenterText = () => {
    updateSelectedLayer({
      x: 50,
      y: 48,
      rotation: 0,
    });
  };

  // Quick Action: Auto Color
  const handleAutoColor = () => {
    if (!selectedLayer) return;
    const colors = ["#ffffff", "#facc15", "#f97316", "#3b82f6", "#10b981", "#ef4444", "#a855f7"];
    const currentIndex = colors.indexOf(selectedLayer.color);
    const nextIndex = (currentIndex + 1) % colors.length;
    updateSelectedLayer({
      color: colors[nextIndex],
    });
  };

  // Reset Text Layout
  const handleResetTextLayout = () => {
    handleAutoCenterText();
    handleAutoFitText();
  };

  // Clear manual mask strokes
  const handleClearStrokes = () => {
    setStrokes([]);
  };

  const buildExportFileName = (): string =>
    `BehindLensAI_${Date.now()}.${exportFormat === "jpeg" ? "jpg" : "png"}`;

  const renderExportBlob = async (): Promise<Blob> => {
    if (!selectedImage) {
      throw new Error("No image selected");
    }

    const activeRatio = ASPECT_RATIO_PRESETS[ratio];
    const livePreviewWidth =
      canvasContainerRef.current?.clientWidth && canvasContainerRef.current.clientWidth > 0
        ? canvasContainerRef.current.clientWidth
        : previewWidth;

    textLayers.forEach((layer) => loadGoogleFont(layer.fontFamily));
    await document.fonts.ready;

    const filters: ImageFilters = {
      brightness,
      contrast,
      saturation,
      sharpen,
    };

    return exportCompositeBlob(
      selectedImage,
      behindSubjectEnabled ? cutoutUrl : null,
      textLayers,
      ratio,
      activeRatio.ratio,
      "original",
      exportFormat,
      livePreviewWidth,
      bgBlur,
      filters
    );
  };

  const triggerBrowserDownload = (blob: Blob, fileName: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Button A — private 4K download only (no cloud)
  const handlePrivateDownload = async () => {
    if (!selectedImage || isDownloading || isPostingToGallery) return;

    setIsDownloading(true);
    try {
      const blob = await renderExportBlob();
      triggerBrowserDownload(blob, buildExportFileName());
    } catch (err) {
      console.error(err);
      alert("Failed to export. Please check the files and try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  // Button B — optional community gallery share (with confirmation)
  const handlePostToGallery = async () => {
    if (!selectedImage || isDownloading || isPostingToGallery) return;

    const confirmed = window.confirm("Do you want to share this masterpiece with the world?");
    if (!confirmed) return;

    setIsPostingToGallery(true);
    setGalleryStatus("uploading");
    setGalleryMessage("Uploading to community gallery...");

    try {
      const blob = await renderExportBlob();
      const fileName = buildExportFileName();
      const storagePath = `exports/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("posters")
        .upload(storagePath, blob, {
          contentType: exportFormat === "jpeg" ? "image/jpeg" : "image/png",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from("posters")
        .getPublicUrl(storagePath);

      const publicUrl = publicUrlData?.publicUrl || "";

      const { error: dbError } = await supabase.from("history").insert({
        url: publicUrl,
        caption: selectedLayer?.text || textLayers[0]?.text || "Untitled Poster",
        created_at: new Date().toISOString(),
        device_id: getDeviceId(),
      });

      if (dbError) {
        throw new Error(dbError.message);
      }

      setGalleryStatus("success");
      setGalleryMessage("Posted to community gallery ✓");
    } catch (err: unknown) {
      console.warn("Gallery post failed:", err);
      setGalleryStatus("error");
      const msg = err instanceof Error ? err.message : "Unknown error";
      setGalleryMessage(`Gallery upload failed: ${msg}`);
    } finally {
      setIsPostingToGallery(false);
    }
  };

  const isExportBusy = isDownloading || isPostingToGallery;

  return (
    <div id="text-behind-subject-editor" className="flex flex-col lg:grid lg:grid-cols-12 gap-6 w-full max-w-7xl mx-auto">

      {/* LEFT PANEL: UPLOAD & CANVAS */}
      <div className="lg:col-span-7 lg:sticky lg:top-6 lg:self-start flex flex-col items-center select-none">

        {/* LARGE UPLOAD BOX */}
        {!selectedImage && (
          <label
            id="upload-box"
            className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 hover:border-black rounded-2xl w-full cursor-pointer transition-all bg-white p-10 text-center shadow-xs mb-4"
            style={{ minHeight: "400px" }}
          >
            <Upload className="w-14 h-14 text-gray-400 mb-4 animate-pulse" />
            <span className="text-lg font-bold text-gray-800">Upload Your Photo to Start</span>
            <span className="text-sm text-gray-400 mt-2">Supports PNG, JPG, JPEG — any resolution</span>
            <span className="mt-6 px-6 py-3 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors">
              Choose Photo
            </span>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
        )}

        {selectedImage && (
          <>
            {/* CHANGE PHOTO BAR */}
            <div className="w-full flex items-center justify-between mb-3 bg-white p-3 rounded-xl border border-gray-100 shadow-xs">
              <div className="flex items-center gap-2">
                {customImageFile && (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block"></span>
                    {customImageFile.name}
                  </span>
                )}
              </div>
              <label className="text-xs font-semibold text-black bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center gap-1.5">
                <Upload className="w-3 h-3" />
                Change Photo
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>

            {/* RATIO SELECTOR */}
            <div className="w-full mb-3 flex items-center justify-between gap-1 overflow-x-auto pb-1 scrollbar-thin">
              <div className="flex gap-1">
                {Object.keys(ASPECT_RATIO_PRESETS).map((presetKey) => {
                  const active = ratio === presetKey;
                  return (
                    <button
                      key={presetKey}
                      onClick={() => setRatio(presetKey as AspectRatio)}
                      className={`px-3 py-1 text-xs font-medium rounded-full border transition-all cursor-pointer whitespace-nowrap ${
                        active
                          ? "bg-black border-black text-white"
                          : "bg-white border-gray-200 text-gray-600 hover:border-gray-400"
                      }`}
                    >
                      {presetKey}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setBehindSubjectEnabled(!behindSubjectEnabled)}
                  title="Toggle Behind Subject Layer"
                  className={`p-1.5 rounded-md border text-xs flex items-center gap-1 cursor-pointer transition-all ${
                    behindSubjectEnabled
                      ? "bg-black border-black text-white"
                      : "bg-white border-gray-200 text-gray-500 hover:text-black"
                  }`}
                >
                  {behindSubjectEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Behind Subject</span>
                </button>
              </div>
            </div>

            {/* PREVIEW CANVAS CONTAINER */}
            <div
              id="preview-canvas-wrapper"
              className="relative w-full border border-gray-200 bg-gray-50 rounded-2xl overflow-hidden flex items-center justify-center p-2 mb-2 select-none min-h-[300px]"
              style={{ minHeight: "350px" }}
            >
              {/* Interactive display node — masking overlay scoped here only (sidebar stays editable) */}
              <div
                id="rendering-stage"
                ref={canvasContainerRef}
                onMouseDown={handleCanvasContainerClickAndDraw}
                onTouchStart={handleCanvasContainerTouchAndDraw}
                style={{ maxHeight: "75vh" }}
                className={`relative max-w-full overflow-hidden shadow-xl border border-gray-150 transition-all ${ASPECT_RATIO_PRESETS[ratio].aspect}`}
              >
                {isMasking && (
                  <div className="absolute inset-0 bg-white/90 backdrop-blur-xs z-50 flex flex-col justify-center items-center p-4 gap-3 select-none pointer-events-none">
                    <div className="relative w-12 h-12 flex items-center justify-center">
                      <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                      {maskProgress && (
                        <span className="text-[10px] font-bold text-gray-800 font-mono">{maskProgress.percent}%</span>
                      )}
                    </div>
                    <p className="text-sm font-bold tracking-wide text-black text-center transition-all">
                      {maskProgress?.step || "AI Automatic subject masking..."}
                    </p>
                    {maskProgress && (
                      <div className="w-52 bg-gray-100 h-2 rounded-full overflow-hidden border border-gray-200">
                        <div
                          className="bg-black h-full transition-all duration-300"
                          style={{ width: `${maskProgress.percent}%` }}
                        ></div>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 font-mono text-center max-w-[285px] leading-relaxed">
                      {maskProgress?.step.includes("Model")
                        ? "Neural weights downloading on first setup (subsequent loads are immediate from cache!)"
                        : "Delineating subject boundaries using isnet engine"}
                    </p>
                  </div>
                )}
                {/* Layer 1: Background Image */}
                <img
                  src={selectedImage}
                  alt="Poster Background"
                  draggable={false}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: ratio === "Original" ? "fill" : "cover",
                    zIndex: 1,
                    filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) ${sharpen > 0 ? "url(#sharpen-effect)" : ""} ${bgBlur > 0 ? `blur(${bgBlur}px)` : ""}`,
                    transform: bgBlur > 0 ? "scale(1.04)" : "scale(1)",
                    transition: "filter 150ms ease-out, transform 150ms ease-out",
                  }}
                  className="select-none pointer-events-none"
                />

                {/* Ghost Image to preserve layout aspect-ratio on "Original" */}
                <img
                  src={selectedImage}
                  alt="Poster Background Helper"
                  draggable={false}
                  className={`opacity-0 pointer-events-none select-none block ${
                    ratio === "Original" ? "w-full h-auto" : "w-full h-full object-cover"
                  }`}
                />

                {/* Layer 2: Text Layers */}
                {textLayers.map((layer) => {
                  const isSelected = selectedLayerId === layer.id;
                  return (
                    <div
                      key={layer.id}
                      onMouseDown={(e) => handleMouseDown(e, layer.id)}
                      onTouchStart={(e) => handleTouchStart(e, layer.id)}
                      onTouchMove={(e) => handleTouchMove(e, layer.id)}
                      onTouchEnd={handleTouchEnd}
                      style={{
                        top: `${layer.y}%`,
                        left: `${layer.x}%`,
                        transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale}) scaleY(${layer.heightScale || 1})`,
                        fontFamily: `"${layer.fontFamily}", sans-serif`,
                        fontSize: `${layer.fontSize}px`,
                        fontWeight: layer.fontWeight,
                        color: layer.color,
                        opacity: layer.opacity,
                        letterSpacing: `${layer.letterSpacing}px`,
                        lineHeight: layer.lineHeight,
                        textDecoration: layer.isUnderline ? "underline" : "none",
                        fontStyle: layer.isItalic ? "italic" : "normal",
                        textShadow: layer.glowEnabled
                          ? `0 0 ${layer.glowBlur}px ${layer.glowColor}`
                          : `${layer.shadowOffsetX}px ${layer.shadowOffsetY}px ${layer.shadowBlur}px ${layer.shadowColor}`,
                        zIndex: 2,
                        border: isSelected && brushMode === "disabled" ? "1.5px dashed #000000" : "none",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: isSelected && brushMode === "disabled" ? "rgba(255,255,255,0.15)" : "transparent",
                      }}
                      className={`absolute text-center select-none whitespace-nowrap font-sans origin-center ${
                        brushMode === "disabled" ? "cursor-grab active:cursor-grabbing hover:bg-black/5" : ""
                      }`}
                    >
                      {layer.text || "POSTER"}
                    </div>
                  );
                })}

                {/* Layer 3: Cutout Foreground Overlay */}
                {behindSubjectEnabled && cutoutUrl && (
                  <img
                    src={cutoutUrl}
                    alt="Subject Foreground layer"
                    draggable={false}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: ratio === "Original" ? "fill" : "cover",
                      zIndex: 3,
                      pointerEvents: "none",
                      filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) ${sharpen > 0 ? "url(#sharpen-effect)" : ""}`,
                    }}
                    className="select-none"
                  />
                )}

                {/* Brush Mode indicator */}
                {brushMode !== "disabled" && (
                  <div className="absolute top-2 left-2 z-20 bg-black/80 backdrop-blur-md px-2 py-1.5 rounded-md text-[10px] text-white font-medium flex items-center gap-1">
                    <Paintbrush className="w-3 h-3 text-yellow-400" />
                    Brush Active: Tap area on canvas to {brushMode} mask.
                  </div>
                )}
              </div>
            </div>

            {/* MANUAL MASK BRUSH CONTROLS */}
            <div className="w-full bg-gray-50 border border-gray-150 p-2.5 rounded-xl flex flex-wrap gap-2 items-center justify-between">
              <div className="flex gap-1 w-full sm:w-auto">
                <button
                  onClick={() => setBrushMode(brushMode === "erase" ? "disabled" : "erase")}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-lg border font-medium flex items-center justify-center gap-1 cursor-pointer transition-all ${
                    brushMode === "erase"
                      ? "bg-red-500 border-red-500 text-white"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Erase Mask Area
                </button>
                <button
                  onClick={() => setBrushMode(brushMode === "restore" ? "disabled" : "restore")}
                  className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-lg border font-medium flex items-center justify-center gap-1 cursor-pointer transition-all ${
                    brushMode === "restore"
                      ? "bg-green-600 border-green-600 text-white"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Keep/Restore Area
                </button>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
                {brushMode !== "disabled" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-gray-500 font-mono">Brush size:</span>
                    <input
                      type="range"
                      min="2"
                      max="20"
                      value={brushSize}
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                      className="w-20 accent-black"
                    />
                    <span className="text-xs font-mono font-bold text-black">{brushSize}%</span>
                  </div>
                )}

                {strokes.length > 0 && (
                  <button
                    onClick={handleClearStrokes}
                    className="text-[10px] text-red-500 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    Reset Brush Strokes ({strokes.length})
                  </button>
                )}
              </div>
            </div>

            {/* DSLR LENS BLUR BOX */}
            <div className="w-full mt-3 bg-white border border-gray-200 p-4 rounded-xl shadow-3xs flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-black" />
                  DSLR Lens Background Blur
                </span>
                <span className="text-xs font-black text-black font-mono bg-gray-100 px-2 py-0.5 rounded-sm">
                  {bgBlur === 0 ? "SHARP (f/22)" : `f/${(22 / (1 + bgBlur / 1.5)).toFixed(1)} (${bgBlur}px)`}
                </span>
              </div>

              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max="24"
                  value={bgBlur}
                  onChange={(e) => setBgBlur(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-ew-resize accent-black focus:outline-none"
                />
                <div className="flex justify-between text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                  <span>Sharp (f/22)</span>
                  <span>Creamy (f/2.8)</span>
                  <span>Ultra Bokeh (f/1.2)</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 mt-1">
                {[
                  { label: "f/22 (Sharp)", val: 0 },
                  { label: "f/8 (Street)", val: 4 },
                  { label: "f/2.8 (Portrait)", val: 12 },
                  { label: "f/1.2 (Bokeh)", val: 24 },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => setBgBlur(p.val)}
                    className={`py-2 px-1 text-[10px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                      bgBlur === p.val
                        ? "bg-black text-white border-black shadow-xs pointer-events-none"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-black"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* RIGHT PANEL: SIDEBAR TAB EDITOR — stays interactive while AI masks the image */}
      <div
        onPointerDown={(e) => {
          const target = e.target as HTMLElement;
          const isTextInput = target.tagName === "INPUT" && (target.getAttribute("type") === "text" || !target.getAttribute("type"));
          if (!isTextInput) {
            (document.activeElement as HTMLElement)?.blur();
          }
        }}
        className="lg:col-span-5 flex flex-col bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden min-h-[400px]"
      >
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-gray-600">
            Created by <strong className="text-black">Vishwa Rajasekar</strong>
          </span>
          <div className="flex items-center gap-3 text-[10px] font-bold">
            <a
              href="https://www.instagram.com/astralvishwa/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-gray-600 hover:text-pink-600 transition-colors"
            >
              <Instagram className="w-3.5 h-3.5" />
              @astralvishwa
            </a>
            <a
              href="https://www.linkedin.com/in/vishwarajasekar"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors"
            >
              <Linkedin className="w-3.5 h-3.5" />
              vishwarajasekar
            </a>
          </div>
        </div>

        {/* LAYER MANAGER SECTION */}
        <div className="p-4 border-b border-gray-150 bg-gray-50/50">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[10px] font-black tracking-widest text-gray-400 uppercase">Text Layers</span>
            <button
              onClick={() => {
                const newId = Date.now().toString();
                const newLayer: TextConfig = {
                  id: newId,
                  text: `TEXT ${textLayers.length + 1}`,
                  fontSize: 120,
                  fontWeight: 800,
                  fontFamily: selectedLayer?.fontFamily || "Space Grotesk",
                  isBold: false,
                  isItalic: false,
                  isUnderline: false,
                  color: "#ffffff",
                  opacity: 1,
                  letterSpacing: 2,
                  lineHeight: 1.2,
                  shadowColor: "rgba(0,0,0,0.4)",
                  shadowBlur: 10,
                  shadowOffsetX: 4,
                  shadowOffsetY: 4,
                  glowEnabled: false,
                  glowColor: "#ffffff",
                  glowBlur: 15,
                  x: 50,
                  y: 35 + (textLayers.length * 10) % 40,
                  rotation: 0,
                  scale: 1,
                  heightScale: 1,
                };
                setTextLayers((prev) => [...prev, newLayer]);
                setSelectedLayerId(newId);
              }}
              className="bg-black hover:bg-black/90 active:scale-[0.95] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-3xs"
            >
              + Add New Text
            </button>
          </div>

          <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
            {textLayers.map((layer) => {
              const active = selectedLayerId === layer.id;
              return (
                <div
                  key={layer.id}
                  onClick={() => setSelectedLayerId(layer.id)}
                  className={`group flex items-center justify-between p-2 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                    active
                      ? "bg-black border-black text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-350 hover:text-black"
                  }`}
                >
                  <span className="truncate max-w-[150px]">{layer.text || "Untitled text"}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono opacity-60">
                      {layer.fontSize}px
                    </span>
                    {textLayers.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTextLayers((prev) => prev.filter((l) => l.id !== layer.id));
                          if (active) {
                            const remaining = textLayers.filter((l) => l.id !== layer.id);
                            if (remaining.length > 0) {
                              setSelectedLayerId(remaining[remaining.length - 1].id);
                            }
                          }
                        }}
                        className={`p-1 rounded-md hover:bg-red-500 hover:text-white transition-colors cursor-pointer ${
                          active ? "text-gray-400 group-hover:text-gray-200" : "text-gray-400"
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* TAB HEADER BAR — 3 tabs: Text, Image, Settings */}
        <div className="flex border-b border-gray-150 bg-gray-50">
          {[
            { id: "text", label: "Text", icon: Type },
            { id: "image", label: "Image", icon: Camera },
            { id: "settings", label: "Settings", icon: Sliders },
          ].map((tab) => {
            const Active = activeTab === tab.id;
            const IconComp = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as "text" | "image" | "settings")}
                className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                  Active
                    ? "bg-white border-black text-black"
                    : "border-transparent text-gray-500 hover:text-black"
                }`}
              >
                <IconComp className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB PANELS */}
        <div className="p-5 flex-1 flex flex-col justify-between">

          {/* TAB 1: TEXT SETTINGS */}
          {activeTab === "text" && selectedLayer && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Enter Caption</label>
                <input
                  type="text"
                  maxLength={40}
                  value={selectedLayer.text}
                  onChange={(e) => updateSelectedLayer({ text: e.target.value })}
                  placeholder="e.g. FOCUS, RUN, LION"
                  className="w-full text-sm border border-gray-200 p-2.5 rounded-lg focus:outline-none focus:border-black font-semibold text-black uppercase"
                />
              </div>

              <div className="relative">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  50+ Premium Font Family
                </label>

                {/* Toggle Dropdown Button */}
                <button
                  type="button"
                  onClick={() => setFontDropdownOpen(!fontDropdownOpen)}
                  style={{ fontFamily: `"${selectedLayer.fontFamily}"` }}
                  className="w-full h-11 flex items-center justify-between text-left px-3.5 py-2.5 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg text-sm font-semibold text-black cursor-pointer shadow-xs transition-all focus:outline-none focus:ring-1 focus:ring-black"
                >
                  <span className="truncate">{selectedLayer.fontFamily}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ${fontDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Dropdown List */}
                {fontDropdownOpen && (
                  <div className="absolute left-0 mt-1.5 w-full bg-white border border-gray-100 rounded-xl shadow-xl z-50 p-2 flex flex-col gap-1.5 max-h-[250px] overflow-hidden">
                    <div className="flex items-center gap-1.5 px-2.5 py-2 bg-gray-50 rounded-lg border border-gray-100 shrink-0">
                      <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <input
                        type="text"
                        placeholder="Search 50+ fonts..."
                        value={fontSearch}
                        onChange={(e) => setFontSearch(e.target.value)}
                        className="w-full bg-transparent border-none text-xs text-black focus:outline-none placeholder-gray-400"
                        autoFocus
                      />
                      {fontSearch && (
                        <button
                          type="button"
                          onClick={() => setFontSearch("")}
                          className="text-[10px] text-gray-400 font-extrabold hover:text-black uppercase cursor-pointer shrink-0"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-50 pr-0.5">
                      {GOOGLE_FONTS.filter((f) => f.name.toLowerCase().includes(fontSearch.toLowerCase())).length === 0 ? (
                        <div className="p-4 text-center text-xs text-gray-400 font-medium">
                          No matching fonts found
                        </div>
                      ) : (
                        GOOGLE_FONTS.filter((f) => f.name.toLowerCase().includes(fontSearch.toLowerCase())).map((font) => {
                          const isSelected = selectedLayer.fontFamily === font.id;
                          return (
                            <button
                              key={font.id}
                              type="button"
                              id={`btn-font-${font.id.replace(/\s+/g, "-")}`}
                              onClick={() => {
                                loadGoogleFont(font.id);
                                updateSelectedLayer({ fontFamily: font.id });
                                setFontDropdownOpen(false);
                                setFontSearch("");
                              }}
                              style={{ fontFamily: `"${font.id}"` }}
                              className={`w-full text-left p-2.5 text-xs transition-colors flex justify-between items-center cursor-pointer rounded-md ${
                                isSelected ? "bg-black text-white font-bold" : "text-gray-800 hover:bg-gray-50"
                              }`}
                            >
                              <span>{font.name}</span>
                              <span className={`text-[9.5px] font-sans font-normal uppercase tracking-wider ${
                                isSelected ? "text-gray-300" : "text-gray-400"
                              }`}>
                                {font.category}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  <span>Size (10px to 400px)</span>
                  <span className="font-mono text-black">{selectedLayer.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="400"
                  value={selectedLayer.fontSize}
                  onChange={(e) => updateSelectedLayer({ fontSize: parseInt(e.target.value) })}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  <span>Weight (100 to 900)</span>
                  <span className="font-mono text-black">{selectedLayer.fontWeight}</span>
                </div>
                <input
                  type="range"
                  min="100"
                  step="100"
                  max="900"
                  value={selectedLayer.fontWeight}
                  onChange={(e) => updateSelectedLayer({ fontWeight: parseInt(e.target.value) })}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Text Color</label>
                <div className="flex gap-2.5 items-center">
                  <input
                    type="color"
                    value={selectedLayer.color}
                    onChange={(e) => updateSelectedLayer({ color: e.target.value })}
                    className="w-10 h-10 p-0 border border-gray-200 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={selectedLayer.color}
                    onChange={(e) => updateSelectedLayer({ color: e.target.value })}
                    className="flex-1 text-sm border border-gray-200 p-2 rounded-lg font-mono font-semibold"
                  />
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-100 p-3 rounded-xl">
                <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Quick Palette</span>
                <div className="flex flex-wrap gap-2">
                  {["#ffffff", "#000000", "#ef4444", "#3b82f6", "#10b981", "#eab308", "#a855f7", "#ec4899", "#14b8a6", "#f97316"].map((col) => (
                    <button
                      key={col}
                      onClick={() => updateSelectedLayer({ color: col })}
                      className="w-7 h-7 rounded-full border border-gray-200 shadow-3xs cursor-pointer hover:scale-110 active:scale-95 transition-transform"
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMAGE PROCESSING SUITE */}
          {activeTab === "image" && (
            <div className="flex flex-col gap-4 animate-fade-in">
              {/* Magic Enhance Action */}
              <div className="bg-gray-50 border border-gray-150 p-3 rounded-xl flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500">✨ Magic Auto-Enhance</span>
                  <button
                    onClick={() => {
                      setBrightness(1.1);
                      setContrast(1.2);
                      setSaturation(1.1);
                      setSharpen(0.4);
                    }}
                    className="bg-black hover:bg-black/90 active:scale-[0.95] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-all shadow-sm"
                  >
                    ✨ Auto-Enhance
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 font-sans leading-relaxed">
                  Automatically adjust brightness, contrast, and saturation levels to make colors pop.
                </p>
              </div>

              {/* High-End Sliders */}
              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  <span>Brightness</span>
                  <span className="font-mono text-black">{Math.round(brightness * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={brightness}
                  onChange={(e) => setBrightness(parseFloat(e.target.value))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  <span>Contrast</span>
                  <span className="font-mono text-black">{Math.round(contrast * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={contrast}
                  onChange={(e) => setContrast(parseFloat(e.target.value))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  <span>Saturation</span>
                  <span className="font-mono text-black">{Math.round(saturation * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.05"
                  value={saturation}
                  onChange={(e) => setSaturation(parseFloat(e.target.value))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  <span>Sharpen Intensity</span>
                  <span className="font-mono text-black">{sharpen.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max="2.00"
                  step="0.05"
                  value={sharpen}
                  onChange={(e) => setSharpen(parseFloat(e.target.value))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* TAB 3: SETTINGS & TRANSFORMING */}
          {activeTab === "settings" && selectedLayer && (
            <div className="flex flex-col gap-4 animate-fade-in overflow-y-auto max-h-[50vh] pr-0.5 scrollbar-thin">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Style Toggles</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateSelectedLayer({ isBold: !selectedLayer.isBold })}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      selectedLayer.isBold ? "bg-black border-black text-white" : "bg-white border-gray-200 text-gray-700 hover:border-gray-450"
                    }`}
                  >
                    Bold Border
                  </button>
                  <button
                    onClick={() => updateSelectedLayer({ isItalic: !selectedLayer.isItalic })}
                    className={`flex-1 py-2 text-xs font-medium italic rounded-lg border transition-all cursor-pointer ${
                      selectedLayer.isItalic ? "bg-black border-black text-white" : "bg-white border-gray-200 text-gray-700 hover:border-gray-450"
                    }`}
                  >
                    Italic
                  </button>
                  <button
                    onClick={() => updateSelectedLayer({ isUnderline: !selectedLayer.isUnderline })}
                    className={`flex-1 py-2 text-xs font-medium underline rounded-lg border transition-all cursor-pointer ${
                      selectedLayer.isUnderline ? "bg-black border-black text-white" : "bg-white border-gray-200 text-gray-700 hover:border-gray-450"
                    }`}
                  >
                    Underline
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    <span>Letter Spacing</span>
                    <span className="font-mono font-bold text-black">{selectedLayer.letterSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min="-5"
                    max="50"
                    value={selectedLayer.letterSpacing}
                    onChange={(e) => updateSelectedLayer({ letterSpacing: parseInt(e.target.value) })}
                    className="w-full accent-black cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    <span>Vertical Stretch</span>
                    <span className="font-mono font-bold text-black">{selectedLayer.heightScale || 1}x</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="0.1"
                    value={selectedLayer.heightScale || 1}
                    onChange={(e) => updateSelectedLayer({ heightScale: parseFloat(e.target.value) })}
                    className="w-full accent-black cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    <span>Line Height</span>
                    <span className="font-mono font-bold text-black">{selectedLayer.lineHeight}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.5"
                    step="0.1"
                    value={selectedLayer.lineHeight}
                    onChange={(e) => updateSelectedLayer({ lineHeight: parseFloat(e.target.value) })}
                    className="w-full accent-black cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    <span>Opacity</span>
                    <span className="font-mono text-black">{Math.round(selectedLayer.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={selectedLayer.opacity}
                    onChange={(e) => updateSelectedLayer({ opacity: parseFloat(e.target.value) })}
                    className="w-full accent-black cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  <span>Additional Scale Factor</span>
                  <span className="font-mono text-black">{selectedLayer.scale.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="4.0"
                  step="0.1"
                  value={selectedLayer.scale}
                  onChange={(e) => updateSelectedLayer({ scale: parseFloat(e.target.value) })}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  <span>Text Orientation Rotation</span>
                  <span className="font-mono text-black">{selectedLayer.rotation}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={selectedLayer.rotation}
                  onChange={(e) => updateSelectedLayer({ rotation: parseInt(e.target.value) })}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              <div className="border-t border-gray-100 pt-3">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Glow Neon Effect</label>
                  <input
                    type="checkbox"
                    checked={selectedLayer.glowEnabled}
                    onChange={(e) => updateSelectedLayer({ glowEnabled: e.target.checked })}
                    className="w-4 h-4 accent-black cursor-pointer"
                  />
                </div>

                {selectedLayer.glowEnabled ? (
                  <div className="grid grid-cols-2 gap-3 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold block mb-1">Blur Amount</span>
                      <input
                        type="range"
                        min="5"
                        max="80"
                        value={selectedLayer.glowBlur}
                        onChange={(e) => updateSelectedLayer({ glowBlur: parseInt(e.target.value) })}
                        className="w-full accent-black"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold block mb-1">Neon Color</span>
                      <input
                        type="color"
                        value={selectedLayer.glowColor}
                        onChange={(e) => updateSelectedLayer({ glowColor: e.target.value })}
                        className="w-full h-8 p-0 border border-gray-200 rounded-md cursor-pointer"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-400 font-bold mb-1">
                        <span>Shadow Blur</span>
                        <span>{selectedLayer.shadowBlur}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="30"
                        value={selectedLayer.shadowBlur}
                        onChange={(e) => updateSelectedLayer({ shadowBlur: parseInt(e.target.value) })}
                        className="w-full accent-black"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold block mb-1">Shadow Offset</span>
                      <div className="flex gap-1">
                        <input
                          type="range"
                          min="-20"
                          max="20"
                          value={selectedLayer.shadowOffsetX}
                          onChange={(e) =>
                            updateSelectedLayer({
                              shadowOffsetX: parseInt(e.target.value),
                              shadowOffsetY: parseInt(e.target.value),
                            })
                          }
                          className="w-full accent-black"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Smart Reposition Targets */}
              <div className="border-t border-gray-100 pt-3">
                <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Smart Reposition Targets</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleSmartFaceReposition}
                    className="px-3 py-2 text-xs bg-black text-white font-semibold rounded-lg hover:opacity-90 flex items-center justify-center gap-1 cursor-pointer transition-all shadow-sm"
                  >
                    <Sliders className="w-3.5 h-3.5 text-yellow-400" />
                    Protect Face Block
                  </button>
                  <button
                    className="px-3 py-2 text-xs bg-gray-50 border border-gray-200 text-black font-semibold rounded-lg hover:bg-gray-100 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    onClick={handleResetTextLayout}
                    title="Center and align text automatically"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Auto Reset Fit
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* EXPORT OPTIONS BOX */}
          <div className="mt-6 border-t border-gray-150 pt-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-1 text-xs">
              <div className="flex items-center gap-1 font-semibold text-gray-500 uppercase tracking-wider">
                <span>Format</span>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                  className="bg-gray-50 border border-gray-200 rounded-md py-0.5 px-2 focus:outline-none focus:border-black font-sans font-medium text-black cursor-pointer uppercase text-[11px]"
                >
                  <option value="png">PNG (Lossless)</option>
                  <option value="jpeg">JPG (Lite)</option>
                </select>
              </div>

              <div className="flex items-center gap-1 font-semibold text-gray-500 uppercase tracking-wider">
                <span>Density</span>
                <select
                  value={exportResolution}
                  onChange={(e) => setExportResolution(e.target.value as ExportResolution)}
                  className="bg-gray-50 border border-gray-200 rounded-md py-0.5 px-2 focus:outline-none focus:border-black font-sans font-medium text-black cursor-pointer uppercase text-[11px]"
                >
                  <option value="original">Original</option>
                  <option value="hd">Full HD (1080p)</option>
                  <option value="4k">Printers 4K</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePrivateDownload}
              disabled={isExportBusy || !selectedImage}
              className="w-full py-4 px-5 rounded-xl text-sm font-bold text-white bg-black hover:bg-black/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isDownloading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Rendering 4K export...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download High-Res (Private)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePostToGallery}
              disabled={isExportBusy || !selectedImage}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:border-black hover:text-black active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPostingToGallery ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Posting to gallery...</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Post to Community Gallery</span>
                </>
              )}
            </button>

            {galleryMessage && (
              <div className={`text-xs font-medium flex items-center gap-1.5 p-2 rounded-lg border ${
                galleryStatus === "success"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : galleryStatus === "error"
                  ? "bg-yellow-50 border-yellow-200 text-yellow-700"
                  : "bg-blue-50 border-blue-200 text-blue-700"
              }`}>
                {galleryStatus === "success" ? (
                  <Check className="w-3.5 h-3.5" />
                ) : galleryStatus === "error" ? (
                  <AlertCircle className="w-3.5 h-3.5" />
                ) : (
                  <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                )}
                {galleryMessage}
              </div>
            )}
          </div>

          {/* CREATOR BRANDING FOOTER */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col items-center justify-center gap-4 text-xs text-gray-500 font-sans">
            <div className="flex w-full items-center justify-between">
              <span className="font-medium">Created by <strong className="text-black font-semibold">Vishwa Rajasekar</strong></span>
              <div className="flex gap-3">
                <a
                  href="https://www.instagram.com/astralvishwa/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-pink-600 font-bold flex items-center gap-1 transition-colors"
                >
                  <Instagram className="w-3.5 h-3.5" />
                  Instagram
                </a>
                <a
                  href="https://www.linkedin.com/in/vishwarajasekar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-600 font-bold flex items-center gap-1 transition-colors"
                >
                  <Linkedin className="w-3.5 h-3.5" />
                  LinkedIn
                </a>
              </div>
            </div>
            <img src={logo} alt="BehindLens AI Logo" className="h-16 object-contain opacity-90" />
          </div>

        </div>

      </div>

      {/* Dynamic SVG Filter for sharpening */}
      <svg style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}>
        <filter id="sharpen-effect">
          <feConvolveMatrix order="3" kernelMatrix={sharpenKernel} preserveAlpha="true" />
        </filter>
      </svg>

    </div>
  );
}
