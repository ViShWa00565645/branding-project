import React, { useState } from "react";
import { Camera, LayoutGrid, Instagram, Linkedin, X, Shield, FileText } from "lucide-react";
import TextBehindSubject from "./components/TextBehindSubject";
import Gallery from "./components/Gallery";
import logo from "./assets/logo.png";

type ActiveView = "editor" | "gallery";

/* ═══════════════════════════════════════════════════════
   LEGAL MODAL — Shared backdrop-blur modal shell
   ═══════════════════════════════════════════════════════ */
function LegalModal({
  open,
  onClose,
  title,
  icon: Icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      id={`modal-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8"
      style={{
        backgroundColor: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        animation: "modal-backdrop-in 0.25s ease",
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ animation: "modal-content-in 0.3s cubic-bezier(0.22,1,0.36,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gray-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
              <Icon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-black tracking-tight">{title}</h2>
              <p className="text-[10px] text-gray-400 font-semibold mt-0.5">BehindLens AI · behindlensai.online</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-gray-600 leading-relaxed space-y-4">
          {children}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-gray-400 font-medium">
            Last updated: June 2026
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 cursor-pointer transition-colors"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   APP ROOT
   ═══════════════════════════════════════════════════════ */
export default function App() {
  const [sharedImage, setSharedImage] = useState<string>("");
  const [resetCanvasTrigger] = useState<number>(0);
  const [activeView, setActiveView] = useState<ActiveView>("editor");

  // Legal modals state
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#fafafc] text-black font-sans flex flex-col justify-between selection:bg-neutral-900 selection:text-white">
      
      {/* 1. MINIMAL SUITE HEADER */}
      <header className="bg-white border-b border-gray-200/80 sticky top-0 z-50 shadow-3xs">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
          
          {/* Brand Logo Only */}
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="BehindLens AI Logo" className="h-11 object-contain" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black tracking-widest text-gray-400 uppercase leading-none">
                BehindLens AI
              </span>
              <span className="bg-black text-[7px] text-white font-black px-1.5 py-0.5 rounded-sm uppercase tracking-wider leading-none">
                PRO
              </span>
            </div>
          </div>

          {/* Icon-Only Floating Pill Navigation */}
          <div className="flex items-center p-1 rounded-full border border-gray-200 bg-gray-50/80 shadow-xs">
            <button
              id="nav-editor-tab"
              onClick={() => setActiveView("editor")}
              title="Editor"
              className={`flex items-center justify-center w-9 h-9 rounded-full cursor-pointer transition-all ${
                activeView === "editor"
                  ? "bg-black text-white shadow-sm"
                  : "bg-transparent text-gray-400 hover:text-black"
              }`}
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              id="nav-gallery-tab"
              onClick={() => setActiveView("gallery")}
              title="Gallery"
              className={`flex items-center justify-center w-9 h-9 rounded-full cursor-pointer transition-all relative ${
                activeView === "gallery"
                  ? "bg-black text-white shadow-sm"
                  : "bg-transparent text-gray-400 hover:text-black"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              {activeView !== "gallery" && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                </span>
              )}
            </button>
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

      {/* 3. CLEAN PRODUCTION FOOTER */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          
          <div>
            <span className="text-xs font-extrabold text-black tracking-widest uppercase">
              BehindLens AI
            </span>
            <p className="text-[10px] text-gray-500 mt-1 font-semibold leading-relaxed">
              Created by{" "}
              <strong className="text-black">Vishwa Rajasekar</strong>
              {" · "}
              High-fidelity client-side 4K design engine. Your photos are processed securely in your local browser.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Social Links */}
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-150 p-2.5 rounded-xl">
              <a
                href="https://www.instagram.com/astralvishwa/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] text-gray-700 hover:text-pink-600 font-extrabold transition-colors"
              >
                <Instagram className="w-3.5 h-3.5" />
                <span>Instagram</span>
              </a>
              <span className="text-gray-300">|</span>
              <a
                href="https://www.linkedin.com/in/vishwarajasekar"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] text-gray-700 hover:text-blue-600 font-extrabold transition-colors"
              >
                <Linkedin className="w-3.5 h-3.5" />
                <span>LinkedIn</span>
              </a>
            </div>

            {/* Legal Links */}
            <div className="flex items-center gap-2">
              <button
                id="footer-privacy-policy"
                onClick={() => setPrivacyOpen(true)}
                className="text-[10px] text-gray-400 hover:text-black font-semibold cursor-pointer transition-colors"
              >
                Privacy Policy
              </button>
              <span className="text-gray-300 text-[10px]">·</span>
              <button
                id="footer-terms-of-service"
                onClick={() => setTermsOpen(true)}
                className="text-[10px] text-gray-400 hover:text-black font-semibold cursor-pointer transition-colors"
              >
                Terms of Service
              </button>
            </div>
          </div>

        </div>
      </footer>

      {/* ═══════════════════════════════════════════════════
          PRIVACY POLICY MODAL
         ═══════════════════════════════════════════════════ */}
      <LegalModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} title="Privacy Policy" icon={Shield}>
        <h3 className="text-base font-black text-black">Your Privacy Matters</h3>
        <p>
          BehindLens AI is designed with a <strong>privacy-first architecture</strong>. We believe your creative work belongs to you — and only you.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">1. Local Image Processing</h4>
        <p>
          All image processing — including AI subject masking, text compositing, filter baking, and 4K export rendering — happens <strong>entirely in your browser</strong>. Your photos are never uploaded to our servers for processing.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">2. Cloud Gallery (Optional)</h4>
        <p>
          When you export a poster, you have the option to save it to your private cloud gallery powered by Supabase. This is <strong>entirely user-initiated</strong>. Cloud-saved images are tied to your device identifier and are not shared publicly.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">3. No Tracking or Analytics</h4>
        <p>
          We do not use cookies, tracking pixels, or third-party analytics. No personal data is collected, stored, or sold.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">4. AI Analysis (Optional)</h4>
        <p>
          The optional "AI Analyze" feature sends a base64-encoded image to Google's Gemini API for layout analysis. This is user-triggered only and Google's standard API privacy policies apply.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">5. Contact</h4>
        <p>
          For privacy questions, reach out to <strong>Vishwa Rajasekar</strong> via{" "}
          <a href="https://www.linkedin.com/in/vishwarajasekar" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold">LinkedIn</a>.
        </p>
      </LegalModal>

      {/* ═══════════════════════════════════════════════════
          TERMS OF SERVICE MODAL
         ═══════════════════════════════════════════════════ */}
      <LegalModal open={termsOpen} onClose={() => setTermsOpen(false)} title="Terms of Service" icon={FileText}>
        <h3 className="text-base font-black text-black">Terms of Use</h3>
        <p>
          By using BehindLens AI ("the Service"), you agree to the following terms. The Service is provided by <strong>Vishwa Rajasekar</strong>.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">1. Acceptable Use</h4>
        <p>
          You may use BehindLens AI for personal and commercial creative projects. You retain full ownership of all images you upload and all posters you create.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">2. Content Responsibility</h4>
        <p>
          You are solely responsible for the content of images you upload. Do not upload content that is illegal, infringing, or violates the rights of others.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">3. Service Availability</h4>
        <p>
          The Service is provided "as is" without warranties of any kind. We strive for 99.9% uptime but do not guarantee uninterrupted access. The AI masking model runs client-side and performance depends on your device.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">4. Intellectual Property</h4>
        <p>
          The BehindLens AI software, UI design, and branding are the intellectual property of Vishwa Rajasekar. You may not reverse-engineer, redistribute, or rebrand the application.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">5. Cloud Storage</h4>
        <p>
          Images saved to the cloud gallery are stored on Supabase infrastructure. We reserve the right to remove content that violates these terms. Cloud storage is provided as a convenience and is not guaranteed to be permanent.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">6. Limitation of Liability</h4>
        <p>
          BehindLens AI shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.
        </p>

        <h4 className="text-sm font-bold text-black mt-2">7. Changes to Terms</h4>
        <p>
          We may update these terms at any time. Continued use of the Service constitutes acceptance of the revised terms.
        </p>
      </LegalModal>

    </div>
  );
}
