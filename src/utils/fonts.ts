export interface FontItem {
  id: string;
  name: string;
  category: "Sans-Serif" | "Serif" | "Display" | "Monospace" | "Script";
}

export const GOOGLE_FONTS: FontItem[] = [
  // 1. Sans-Serif (Modern / Swiss / Clean)
  { id: "Inter", name: "Inter", category: "Sans-Serif" },
  { id: "Space Grotesk", name: "Space Grotesk", category: "Sans-Serif" },
  { id: "Outfit", name: "Outfit", category: "Sans-Serif" },
  { id: "Plus Jakarta Sans", name: "Plus Jakarta Sans", category: "Sans-Serif" },
  { id: "Syne", name: "Syne", category: "Sans-Serif" },
  { id: "Unbounded", name: "Unbounded", category: "Sans-Serif" },
  { id: "DM Sans", name: "DM Sans", category: "Sans-Serif" },
  { id: "Urbanist", name: "Urbanist", category: "Sans-Serif" },
  { id: "Lexend", name: "Lexend", category: "Sans-Serif" },
  { id: "Bricolage Grotesk", name: "Bricolage Grotesk", category: "Sans-Serif" },
  { id: "Montserrat", name: "Montserrat", category: "Sans-Serif" },
  { id: "Cabinet Grotesk", name: "Cabinet Grotesk", category: "Sans-Serif" },
  { id: "Satoshi", name: "Satoshi", category: "Sans-Serif" }, // Fallback to sans list

  // 2. Serif (Elegant / Editorial / Classic)
  { id: "Playfair Display", name: "Playfair Display", category: "Serif" },
  { id: "EB Garamond", name: "EB Garamond", category: "Serif" },
  { id: "Cormorant Garamond", name: "Cormorant Garamond", category: "Serif" },
  { id: "Merriweather", name: "Merriweather", category: "Serif" },
  { id: "DM Serif Display", name: "DM Serif Display", category: "Serif" },
  { id: "Young Serif", name: "Young Serif", category: "Serif" },
  { id: "Cinzel", name: "Cinzel", category: "Serif" },
  { id: "Fraunces", name: "Fraunces", category: "Serif" },
  { id: "Prata", name: "Prata", category: "Serif" },
  { id: "Instrument Serif", name: "Instrument Serif", category: "Serif" },
  { id: "Lora", name: "Lora", category: "Serif" },
  { id: "Cinzel Decorative", name: "Cinzel Decorative", category: "Serif" },

  // 3. Display (Bold / Cinematic / Brutalist)
  { id: "Anton", name: "Anton", category: "Display" },
  { id: "Archivo Black", name: "Archivo Black", category: "Display" },
  { id: "Paytone One", name: "Paytone One", category: "Display" },
  { id: "Lilita One", name: "Lilita One", category: "Display" },
  { id: "Righteous", name: "Righteous", category: "Display" },
  { id: "Russo One", name: "Russo One", category: "Display" },
  { id: "Barlow Condensed", name: "Barlow Condensed", category: "Display" },
  { id: "Bebas Neue", name: "Bebas Neue", category: "Display" },
  { id: "Oswald", name: "Oswald", category: "Display" },
  { id: "Krona One", name: "Krona One", category: "Display" },
  { id: "Faster One", name: "Faster One", category: "Display" },
  { id: "Clash Display", name: "Clash Display", category: "Display" },
  { id: "Staatliches", name: "Staatliches", category: "Display" },
  { id: "Rowdies", name: "Rowdies", category: "Display" },

  // 4. Monospace (Tech / Brutalist)
  { id: "JetBrains Mono", name: "JetBrains Mono", category: "Monospace" },
  { id: "Fira Code", name: "Fira Code", category: "Monospace" },
  { id: "Space Mono", name: "Space Mono", category: "Monospace" },
  { id: "DM Mono", name: "DM Mono", category: "Monospace" },
  { id: "Share Tech Mono", name: "Share Tech Mono", category: "Monospace" },
  { id: "VT323", name: "VT323", category: "Monospace" },
  { id: "Anonymous Pro", name: "Anonymous Pro", category: "Monospace" },

  // 5. Script / Calligraphy / Artistic
  { id: "Great Vibes", name: "Great Vibes", category: "Script" },
  { id: "Sacramento", name: "Sacramento", category: "Script" },
  { id: "Alex Brush", name: "Alex Brush", category: "Script" },
  { id: "Dancing Script", name: "Dancing Script", category: "Script" },
  { id: "Pacifico", name: "Pacifico", category: "Script" },
  { id: "Pinyon Script", name: "Pinyon Script", category: "Script" },
  { id: "Shadows Into Light", name: "Shadows Into Light", category: "Script" },
];

const loadedFonts = new Set<string>();

/**
 * Dynamically loads a Google Font file into the head if not already loaded.
 */
export function loadGoogleFont(family: string) {
  // Return if already loaded or is standard fallback
  if (loadedFonts.has(family) || family === "Satoshi" || family === "Clash Display") {
    return;
  }

  try {
    const formattedFamily = family.replace(/\s+/g, "+");
    const linkId = `gfont-${formattedFamily.toLowerCase()}`;

    // Prevent duplicate injections
    if (document.getElementById(linkId)) {
      loadedFonts.add(family);
      return;
    }

    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${formattedFamily}:wght@100;300;400;500;600;700;800;900&display=swap`;

    document.head.appendChild(link);
    loadedFonts.add(family);
  } catch (error) {
    console.error(`Failed to load Google Font: ${family}`, error);
  }
}

// Initial default fonts baseline load
export function loadBaselineFonts() {
  ["Inter", "Space Grotesk", "Outfit", "Playfair Display", "Bebas Neue"].forEach(
    loadGoogleFont
  );
}
