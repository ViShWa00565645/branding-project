import React, { useState } from "react";
import { Instagram, Linkedin, Paintbrush, Layers } from "lucide-react";
import TextBehindSubject from "./components/TextBehindSubject";
import Gallery from "./components/Gallery";
import logo from "./assets/logo.png";

type ActiveView = "editor" | "gallery";

export default function App() {
  const [sharedImage, setSharedImage] = useState<string>("");
  const [resetCanvasTrigger] = useState<number>(0);
  const [activeView, setActiveView] = useState<ActiveView>("editor");

  return (
    <div className="min-h-screen bg-[#fafafc] text-black font-sans flex flex-col justify-between selection:bg-neutral-900 selection:text-white">
      
      {/* 1. SUITE HEADER */}
      <header className="bg-white border-b border-gray-200/80 sticky top-0 z-50 shadow-3xs">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Brand Logo & Descriptor */}
          <div className="flex items-center gap-3">
            <img src={logo} alt="BehindLens AI Logo" className="h-14 object-contain" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black tracking-widest text-gray-400 uppercase leading-none">
                  BehindLens AI
                </span>
                <span className="bg-black text-[8px] text-white font-black px-1.5 py-0.5 rounded-sm uppercase tracking-wider leading-none">
                  DSLR + Canvas
                </span>
              </div>
              <h1 className="text-base font-black tracking-tight text-black font-sans mt-0.5">
                Professional Creative Studio
              </h1>
            </div>
          </div>

          {/* Navigation Tabs + Instagram */}
          <div className="flex items-center gap-2">

            {/* View Tabs */}
            <div className="flex items-center p-1 rounded-xl border border-gray-200 bg-gray-50/80">
              <button
                id="nav-editor-tab"
                onClick={() => setActiveView("editor")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                  activeView === "editor"
                    ? "bg-black text-white shadow-sm"
                    : "bg-transparent text-gray-500 hover:text-black"
                }`}
              >
                <Paintbrush className="w-3.5 h-3.5" />
                Editor
              </button>
              <button
                id="nav-gallery-tab"
                onClick={() => setActiveView("gallery")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all relative ${
                  activeView === "gallery"
                    ? "bg-black text-white shadow-sm"
                    : "bg-transparent text-gray-500 hover:text-black"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                View Gallery
                {activeView !== "gallery" && (
                  <span
                    className="absolute -top-0.5 -right-0.5 flex h-2 w-2"
                  >
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                  </span>
                )}
              </button>
            </div>

            {/* Instagram Follow Connection Badge */}
            <a
              href="https://www.instagram.com/astralvishwa/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 border border-zinc-200 hover:border-pink-500 rounded-xl bg-white hover:bg-pink-55/10 text-xs font-bold text-zinc-800 hover:text-pink-600 transition-all cursor-pointer shadow-3xs"
            >
              <Instagram className="w-4 h-4 text-pink-600 animate-pulse" />
              <span className="hidden sm:inline">Follow @astralvishwa</span>
            </a>
          </div>

        </div>
      </header>

      {/* 2. ACTIVE VIEW AREA */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">

        {/* Editor View */}
        {activeView === "editor" && (
          <div id="poster-designer-view" className="animate-fade-in">
            <TextBehindSubject
              sharedImage={sharedImage}
              setSharedImage={setSharedImage}
              resetCanvasTrigger={resetCanvasTrigger}
            />
          </div>
        )}

        {/* Gallery View */}
        {activeView === "gallery" && (
          <div id="gallery-view" className="animate-fade-in">
            <Gallery />
          </div>
        )}

      </main>

      {/* 3. CORE DESIGN STUDIO FOOTER */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          
          <div>
            <span className="text-xs font-extrabold text-black tracking-widest uppercase">
              BehindLens AI Professional Creative Suite
            </span>
            <p className="text-[10px] text-gray-400 mt-1 font-semibold leading-relaxed max-w-sm">
              An advanced high-fidelity client-side design engine. Your custom uploaded photos stay inside WebAssembly hardware structures and are securely processed in your local browser sandbox.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 bg-gray-50 border border-gray-150 p-2.5 rounded-xl">
            <a
              href="https://www.instagram.com/astralvishwa/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[10px] text-gray-700 hover:text-pink-600 font-extrabold transition-colors"
            >
              <Instagram className="w-3.5 h-3.5" />
              <span>Instagram: @astralvishwa</span>
            </a>
            <span className="text-gray-300">|</span>
            <a
              href="https://www.linkedin.com/in/vishwarajasekar"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[10px] text-gray-700 hover:text-blue-600 font-extrabold transition-colors"
            >
              <Linkedin className="w-3.5 h-3.5" />
              <span>LinkedIn: Vishwa Rajasekar</span>
            </a>
            <span className="text-gray-300">|</span>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold">
              <span className="w-1.5 h-1.5 bg-black rounded-full inline-block"></span>
              <span>100% Secure Processing</span>
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
}
