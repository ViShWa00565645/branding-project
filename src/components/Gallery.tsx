import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../utils/supabaseClient";
import { getDeviceId } from "../utils/auth";
import {
  Download, Loader2, ImageOff, Instagram, Linkedin,
  RefreshCw, Clock, Layers, ExternalLink, Sparkles,
  X, ArrowUpRight, Eye, Grid3X3, ChevronLeft, ChevronRight,
} from "lucide-react";

/* ────────────────────────────────────────────
   Types
──────────────────────────────────────────── */
interface HistoryRow {
  id: number;
  url: string;
  caption: string;
  created_at: string;
  device_id?: string;
}

/* ────────────────────────────────────────────
   Gallery Component
──────────────────────────────────────────── */
export default function Gallery() {
  const [items, setItems] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [lightboxItem, setLightboxItem] = useState<HistoryRow | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number>(-1);
  const [imageLoadStates, setImageLoadStates] = useState<Record<number, "loading" | "loaded" | "error">>({});
  const [entranceReady, setEntranceReady] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());

  /* ── Fetch history rows from Supabase filtered by this device ── */
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("history")
        .select("*")
        .eq("device_id", getDeviceId())
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setItems((data as HistoryRow[]) || []);
      setHiddenIds(new Set());
    } catch (err: any) {
      console.error("Gallery fetch error:", err);
      setError(err.message || "Failed to load gallery");
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Initial fetch + Supabase real-time subscription ── */
  useEffect(() => {
    fetchHistory();

    const channel = supabase
      .channel("history-realtime")
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "history" },
        (payload: any) => {
          const newRow = payload.new as HistoryRow;
          // Only add to gallery if it belongs to this device
          if (newRow.device_id === getDeviceId()) {
            setItems((prev) => [newRow, ...prev]);
          }
        }
      )
      .on(
        "postgres_changes" as any,
        { event: "DELETE", schema: "public", table: "history" },
        (payload: any) => {
          const deletedId = payload.old?.id;
          if (deletedId) {
            setItems((prev) => prev.filter((item) => item.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchHistory]);

  /* ── Entrance animation trigger ── */
  useEffect(() => {
    if (!loading && items.length > 0) {
      const timer = setTimeout(() => setEntranceReady(true), 150);
      return () => clearTimeout(timer);
    }
  }, [loading, items.length]);

  /* ── Keyboard navigation for lightbox ── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxItem(null);
        setLightboxIdx(-1);
      }
      if (lightboxItem && items.length > 0) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          const nextIdx = (lightboxIdx + 1) % items.length;
          setLightboxIdx(nextIdx);
          setLightboxItem(items[nextIdx]);
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          const prevIdx = (lightboxIdx - 1 + items.length) % items.length;
          setLightboxIdx(prevIdx);
          setLightboxItem(items[prevIdx]);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightboxItem, lightboxIdx, items]);

  /* ── Download handler ── */
  const handleDownload = async (item: HistoryRow) => {
    setDownloadingId(item.id);
    try {
      const response = await fetch(item.url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      const ext = item.url.includes(".jpg") || item.url.includes(".jpeg") ? "jpg" : "png";
      link.download = `PosterAI_${item.caption?.replace(/\s+/g, "_") || "export"}_${item.id}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(item.url, "_blank");
    } finally {
      setTimeout(() => setDownloadingId(null), 800);
    }
  };

  /* ── Track image loading per card ── */
  const handleImageLoad = (id: number) => {
    setImageLoadStates((prev) => ({ ...prev, [id]: "loaded" }));
  };
  const handleImageError = (id: number) => {
    setImageLoadStates((prev) => ({ ...prev, [id]: "error" }));
    // Hide broken/deleted images completely
    setHiddenIds((prev) => new Set(prev).add(id));
  };

  /* ── Format relative time ── */
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  /* ── Open lightbox ── */
  const openLightbox = (item: HistoryRow) => {
    const idx = items.findIndex((i) => i.id === item.id);
    setLightboxIdx(idx);
    setLightboxItem(item);
  };

  /* ── Masonry column distribution (3 columns), excluding hidden/broken images ── */
  const visibleItems = items.filter((item) => !hiddenIds.has(item.id));
  const columns: HistoryRow[][] = [[], [], []];
  visibleItems.forEach((item, idx) => {
    columns[idx % 3].push(item);
  });

  return (
    <div
      ref={galleryRef}
      className="w-full max-w-7xl mx-auto relative"
      style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
    >

      {/* ═══════════════════════════════════════
          GALLERY HERO HEADER
         ═══════════════════════════════════════ */}
      <div
        className="relative mb-12 overflow-hidden"
        style={{
          borderRadius: "28px",
          background: "linear-gradient(140deg, #05050a 0%, #0d0d1a 25%, #121228 50%, #0a0f1e 75%, #050508 100%)",
          padding: "56px 44px 48px",
        }}
      >
        {/* Animated grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        {/* Floating gradient orbs */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: "-30%",
            right: "-10%",
            width: "420px",
            height: "420px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139, 92, 246, 0.35) 0%, rgba(139, 92, 246, 0.08) 40%, transparent 70%)",
            filter: "blur(60px)",
            animation: "gallery-float-orb 12s ease-in-out infinite",
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: "-25%",
            left: "-8%",
            width: "340px",
            height: "340px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(236, 72, 153, 0.3) 0%, rgba(236, 72, 153, 0.05) 40%, transparent 70%)",
            filter: "blur(50px)",
            animation: "gallery-float-orb 15s ease-in-out infinite reverse",
          }}
        />
        {/* Subtle top-center accent */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: "-15%",
            left: "35%",
            width: "260px",
            height: "260px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(56, 189, 248, 0.18) 0%, transparent 60%)",
            filter: "blur(50px)",
            animation: "gallery-float-orb 18s ease-in-out infinite 3s",
          }}
        />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-8">
          <div>
            {/* Icon + label */}
            <div className="flex items-center gap-4 mb-5">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03))",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(16px)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <Grid3X3 className="w-6 h-6 text-white/80" />
              </div>
              <div>
                <span
                  className="text-[10px] font-extrabold uppercase tracking-[0.25em] block"
                  style={{ color: "rgba(139, 92, 246, 0.7)" }}
                >
                  PosterAI Collection
                </span>
                <h2
                  className="text-3xl sm:text-4xl font-black text-white"
                  style={{ letterSpacing: "-0.045em", lineHeight: 1.1, marginTop: "4px" }}
                >
                  Cloud Gallery
                </h2>
              </div>
            </div>
            <p className="text-sm font-medium max-w-lg leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
              {visibleItems.length > 0
                ? `${visibleItems.length} ${visibleItems.length === 1 ? "masterpiece" : "masterpieces"} curated in your private cloud collection.`
                : "Your cloud gallery awaits its first creation. Export a poster from the Editor to begin."}
            </p>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="flex items-center gap-2.5 px-6 py-3.5 text-xs font-bold rounded-2xl cursor-pointer transition-all"
            style={{
              background: loading
                ? "rgba(255,255,255,0.04)"
                : "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.75)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.14)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.2)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = loading ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Syncing…" : "Refresh Gallery"}
          </button>
        </div>

        {/* Live sync indicator */}
        <div className="relative z-10 mt-8 flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "rgba(255,255,255,0.25)" }}
          >
            Real-time sync active
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          LOADING STATE
         ═══════════════════════════════════════ */}
      {loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 gap-6">
          <div className="relative w-24 h-24">
            <div className="absolute inset-0 rounded-full" style={{ border: "2px solid #f0f0f2" }} />
            <div
              className="absolute inset-0 rounded-full animate-spin"
              style={{
                border: "2px solid transparent",
                borderTopColor: "#111",
                borderRightColor: "rgba(0,0,0,0.15)",
              }}
            />
            <div
              className="absolute inset-4 rounded-full flex items-center justify-center"
              style={{ background: "#fafafc" }}
            >
              <Layers className="w-6 h-6 text-gray-300" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-black text-gray-800 tracking-tight">Loading Your Gallery</p>
            <p className="text-[11px] text-gray-400 font-medium mt-2">
              Fetching creations from Supabase cloud storage…
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          ERROR STATE
         ═══════════════════════════════════════ */}
      {error && (
        <div className="flex flex-col items-center justify-center py-24 gap-5">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #fef2f2, #fee2e2)",
              boxShadow: "0 8px 32px rgba(239, 68, 68, 0.1)",
            }}
          >
            <ImageOff className="w-8 h-8 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-base font-black text-gray-800 tracking-tight">Connection Error</p>
            <p className="text-xs text-gray-500 mt-1.5 max-w-xs leading-relaxed">{error}</p>
          </div>
          <button
            onClick={fetchHistory}
            className="mt-3 px-7 py-3 bg-black text-white text-xs font-bold rounded-2xl cursor-pointer transition-all hover:bg-gray-900 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════
          EMPTY STATE
         ═══════════════════════════════════════ */}
      {!loading && !error && visibleItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 gap-6">
          <div
            className="w-28 h-28 rounded-3xl flex items-center justify-center relative"
            style={{
              background: "linear-gradient(145deg, #f8f8fa, #eeeff1)",
              border: "2px dashed #d4d4d8",
            }}
          >
            <Sparkles className="w-12 h-12 text-gray-300" />
            <div
              className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                boxShadow: "0 4px 12px rgba(139, 92, 246, 0.4)",
              }}
            >
              <span className="text-white text-[9px] font-black">0</span>
            </div>
          </div>
          <div className="text-center">
            <p
              className="text-xl font-black text-gray-800 tracking-tight"
              style={{ letterSpacing: "-0.03em" }}
            >
              No Creations Yet
            </p>
            <p className="text-xs text-gray-400 mt-3 max-w-sm leading-relaxed font-medium">
              Switch to the <strong className="text-gray-600">Editor</strong> tab and create your first masterpiece.
              <br />
              Every exported poster appears here automatically via real-time sync.
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          MASONRY GRID
         ═══════════════════════════════════════ */}
      {!loading && !error && visibleItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-7">
              {col.map((item, itemIdx) => {
                const isHovered = hoveredId === item.id;
                const loadState = imageLoadStates[item.id] || "loading";
                const staggerDelay = colIdx * 100 + itemIdx * 140;
                const isFirst = items.indexOf(item) === 0;
                const isDownloading = downloadingId === item.id;

                return (
                  <div
                    key={item.id}
                    className="group relative overflow-hidden cursor-pointer"
                    style={{
                      borderRadius: "24px",
                      backgroundColor: "#f3f3f6",
                      boxShadow: isHovered
                        ? "0 32px 64px -16px rgba(0,0,0,0.22), 0 16px 32px -12px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.03)"
                        : "0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)",
                      transform: isHovered
                        ? "translateY(-8px) scale(1.012)"
                        : "translateY(0) scale(1)",
                      opacity: entranceReady ? 1 : 0,
                      transition: `all 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.7s ease ${staggerDelay}ms, box-shadow 0.4s ease`,
                    }}
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => openLightbox(item)}
                  >
                    {/* Loading skeleton shimmer */}
                    {loadState === "loading" && (
                      <div
                        className="absolute inset-0 z-10 flex items-center justify-center"
                        style={{
                          background:
                            "linear-gradient(110deg, #f0f0f2 30%, #e4e4e7 50%, #f0f0f2 70%)",
                          backgroundSize: "300% 100%",
                          animation: "gallery-shimmer 2s ease infinite",
                        }}
                      >
                        <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
                      </div>
                    )}

                    {/* Broken images are hidden completely via hiddenIds filter — no error fallback needed */}

                    {/* The poster image */}
                    <img
                      src={item.url}
                      alt={item.caption || "Poster"}
                      loading="lazy"
                      onLoad={() => handleImageLoad(item.id)}
                      onError={() => handleImageError(item.id)}
                      className="w-full h-auto block"
                      style={{
                        opacity: loadState === "loaded" ? 1 : 0,
                        transition: "opacity 0.6s ease, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
                        transform: isHovered ? "scale(1.06)" : "scale(1)",
                        minHeight: loadState !== "loaded" ? "240px" : undefined,
                      }}
                    />

                    {/* Hover overlay — cinematic gradient */}
                    <div
                      className="absolute inset-0 flex flex-col justify-end pointer-events-none"
                      style={{
                        background: isHovered
                          ? "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.15) 55%, transparent 75%)"
                          : "linear-gradient(to top, rgba(0,0,0,0.15) 0%, transparent 20%)",
                        transition: "all 0.5s ease",
                      }}
                    >
                      {/* Caption + metadata — revealed on hover */}
                      <div
                        className="p-6"
                        style={{
                          transform: isHovered ? "translateY(0)" : "translateY(16px)",
                          opacity: isHovered ? 1 : 0,
                          transition: "all 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
                        }}
                      >
                        <p
                          className="text-white font-black text-lg mb-2"
                          style={{
                            letterSpacing: "-0.025em",
                            lineHeight: 1.25,
                            textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                          }}
                        >
                          {item.caption || "Untitled Poster"}
                        </p>
                        <div className="flex items-center gap-1.5 mb-5">
                          <Clock className="w-3 h-3 text-white/40" />
                          <span className="text-[10px] text-white/40 font-semibold">
                            {timeAgo(item.created_at)}
                          </span>
                        </div>

                        {/* Action buttons */}
                        <div
                          className="flex gap-3 pointer-events-auto"
                          style={{
                            transform: isHovered ? "translateY(0)" : "translateY(24px)",
                            opacity: isHovered ? 1 : 0,
                            transition: "all 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.06s",
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(item);
                            }}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl text-[11px] font-bold cursor-pointer transition-all"
                            style={{
                              backgroundColor: "rgba(255,255,255,0.95)",
                              color: "#0a0a0a",
                              backdropFilter: "blur(20px)",
                              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "#fff";
                              (e.currentTarget as HTMLElement).style.transform = "scale(1.06)";
                              (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(0,0,0,0.25)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.95)";
                              (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)";
                            }}
                          >
                            {isDownloading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            {isDownloading ? "Saving…" : "Download"}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(item.url, "_blank");
                            }}
                            className="flex items-center gap-2 px-4 py-3 rounded-xl text-[11px] font-bold cursor-pointer transition-all"
                            style={{
                              backgroundColor: "rgba(255,255,255,0.1)",
                              color: "#fff",
                              backdropFilter: "blur(20px)",
                              border: "1px solid rgba(255,255,255,0.12)",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.22)";
                              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.25)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.1)";
                              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)";
                            }}
                          >
                            <ExternalLink className="w-3 h-3" />
                            Open
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Top-right badge — poster ID */}
                    <div
                      className="absolute top-4 right-4"
                      style={{
                        opacity: isHovered ? 1 : 0,
                        transform: isHovered ? "scale(1) translateY(0)" : "scale(0.7) translateY(-6px)",
                        transition: "all 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                    >
                      <span
                        className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider"
                        style={{
                          backgroundColor: "rgba(0,0,0,0.45)",
                          color: "rgba(255,255,255,0.85)",
                          backdropFilter: "blur(16px)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        #{item.id}
                      </span>
                    </div>

                    {/* Top-left "LATEST" badge for newest item */}
                    {isFirst && (
                      <div
                        className="absolute top-4 left-4"
                        style={{
                          opacity: entranceReady ? 1 : 0,
                          transition: "opacity 0.6s ease 0.4s",
                        }}
                      >
                        <span
                          className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5"
                          style={{
                            background: "linear-gradient(135deg, #8b5cf6, #a855f7, #ec4899)",
                            color: "#fff",
                            boxShadow: "0 4px 16px rgba(139, 92, 246, 0.45)",
                          }}
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          Latest
                        </span>
                      </div>
                    )}

                    {/* Center view indicator */}
                    <div
                      className="absolute top-1/2 left-1/2 pointer-events-none"
                      style={{
                        transform: isHovered ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.4)",
                        opacity: isHovered ? 1 : 0,
                        transition: "all 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                    >
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center"
                        style={{
                          backgroundColor: "rgba(255,255,255,0.12)",
                          backdropFilter: "blur(16px)",
                          border: "1px solid rgba(255,255,255,0.15)",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                        }}
                      >
                        <Eye className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════
          LIGHTBOX MODAL
         ═══════════════════════════════════════ */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
          style={{
            backgroundColor: "rgba(0,0,0,0.94)",
            backdropFilter: "blur(32px)",
            animation: "gallery-lightbox-enter 0.3s ease",
          }}
          onClick={() => { setLightboxItem(null); setLightboxIdx(-1); }}
        >
          <div
            className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "gallery-lightbox-content-enter 0.4s cubic-bezier(0.22, 1, 0.36, 1)" }}
          >
            {/* Top bar: close + counter */}
            <div className="absolute -top-14 left-0 right-0 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-white/30">
                {lightboxIdx + 1} / {items.length}
              </span>
              <button
                onClick={() => { setLightboxItem(null); setLightboxIdx(-1); }}
                className="cursor-pointer transition-all flex items-center gap-2.5 group"
              >
                <span className="text-[10px] font-bold text-white/35 uppercase tracking-wider group-hover:text-white/60 transition-colors">
                  ESC
                </span>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.07)";
                  }}
                >
                  <X className="w-4 h-4 text-white/80" />
                </div>
              </button>
            </div>

            {/* Prev / Next navigation arrows */}
            {items.length > 1 && (
              <>
                <button
                  className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-16 w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-all z-20"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const prevIdx = (lightboxIdx - 1 + items.length) % items.length;
                    setLightboxIdx(prevIdx);
                    setLightboxItem(items[prevIdx]);
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.07)";
                  }}
                >
                  <ChevronLeft className="w-5 h-5 text-white/70" />
                </button>
                <button
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-16 w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-all z-20"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextIdx = (lightboxIdx + 1) % items.length;
                    setLightboxIdx(nextIdx);
                    setLightboxItem(items[nextIdx]);
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.07)";
                  }}
                >
                  <ChevronRight className="w-5 h-5 text-white/70" />
                </button>
              </>
            )}

            {/* Full image */}
            <img
              src={lightboxItem.url}
              alt={lightboxItem.caption || "Poster"}
              className="max-h-[75vh] w-auto max-w-full object-contain"
              style={{
                borderRadius: "20px",
                boxShadow: "0 40px 100px -25px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)",
              }}
            />

            {/* Bottom info bar */}
            <div
              className="mt-6 flex flex-col sm:flex-row items-center justify-between w-full max-w-2xl px-5 py-4 rounded-2xl gap-4"
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.06)",
                backdropFilter: "blur(24px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
              }}
            >
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <p
                  className="text-white font-black text-sm tracking-tight truncate"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {lightboxItem.caption || "Untitled"}
                </p>
                <p className="text-white/30 text-[10px] font-semibold mt-1 flex items-center gap-1.5 justify-center sm:justify-start">
                  <Clock className="w-3 h-3" />
                  {new Date(lightboxItem.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => window.open(lightboxItem.url, "_blank")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.16)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)";
                  }}
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  Full Size
                </button>
                <button
                  onClick={() => handleDownload(lightboxItem)}
                  className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-xl cursor-pointer transition-all"
                  style={{
                    background: "linear-gradient(135deg, #ffffff, #f0f0f0)",
                    color: "#0a0a0a",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "scale(1.04)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(0,0,0,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.25)";
                  }}
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          GALLERY FOOTER — Curated by Vishwa Rajasekar
         ═══════════════════════════════════════ */}
      <div className="mt-20 pt-12 pb-4 relative">
        {/* Separator */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-4/5"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(0,0,0,0.08) 25%, rgba(0,0,0,0.08) 75%, transparent)",
          }}
        />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-8">
          {/* Curator info */}
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                background: "linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)",
                boxShadow: "0 6px 20px rgba(131, 58, 180, 0.3)",
              }}
            >
              <span className="text-white text-xs font-black tracking-tight">VR</span>
            </div>
            <div>
              <p
                className="text-sm font-black text-gray-800 tracking-tight"
                style={{ letterSpacing: "-0.02em" }}
              >
                Created by{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "linear-gradient(135deg, #1a1a1a 20%, #666 80%)" }}
                >
                  Vishwa Rajasekar
                </span>
              </p>
              <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                PosterAI Cloud Gallery • Professional Creative Suite
              </p>
            </div>
          </div>

          {/* Social links */}
          <div className="flex gap-3">
            <a
              href="https://www.instagram.com/astralvishwa/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-[11px] font-bold transition-all cursor-pointer"
              style={{
                border: "1px solid #e5e7eb",
                color: "#555",
                backgroundColor: "white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "#E1306C";
                el.style.color = "#E1306C";
                el.style.backgroundColor = "#fdf2f8";
                el.style.boxShadow = "0 6px 20px rgba(225, 48, 108, 0.15)";
                el.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "#e5e7eb";
                el.style.color = "#555";
                el.style.backgroundColor = "white";
                el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
                el.style.transform = "translateY(0)";
              }}
            >
              <Instagram className="w-4 h-4" />
              @astralvishwa
            </a>
            <a
              href="https://www.linkedin.com/in/vishwarajasekar"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-[11px] font-bold transition-all cursor-pointer"
              style={{
                border: "1px solid #e5e7eb",
                color: "#555",
                backgroundColor: "white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "#0A66C2";
                el.style.color = "#0A66C2";
                el.style.backgroundColor = "#eff6ff";
                el.style.boxShadow = "0 6px 20px rgba(10, 102, 194, 0.15)";
                el.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = "#e5e7eb";
                el.style.color = "#555";
                el.style.backgroundColor = "white";
                el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
                el.style.transform = "translateY(0)";
              }}
            >
              <Linkedin className="w-4 h-4" />
              LinkedIn
            </a>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          CSS KEYFRAME ANIMATIONS
         ═══════════════════════════════════════ */}
      <style>{`
        @keyframes gallery-shimmer {
          0% { background-position: 300% 50%; }
          100% { background-position: -300% 50%; }
        }
        @keyframes gallery-float-orb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(12px, -18px) scale(1.06); }
          50% { transform: translate(-8px, -30px) scale(0.94); }
          75% { transform: translate(-18px, -12px) scale(1.03); }
        }
        @keyframes gallery-lightbox-enter {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes gallery-lightbox-content-enter {
          from { opacity: 0; transform: scale(0.94) translateY(16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
