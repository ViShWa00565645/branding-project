import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// --- YOUR WORKING API KEY ---
const MY_REAL_KEY = "AIzaSyBPQjcYFhm8jbx68cfNH-o1uCKM_L9QSDg";

// 1. Instantiating with the proper configuration object
const genAI = new (GoogleGenAI as any)({ apiKey: MY_REAL_KEY });

app.post("/api/analyze-guide-image", async (req, res) => {
  try {
    const { base64Image, prompt } = req.body;
    if (!base64Image) return res.status(400).json({ error: "No image" });

    const parts = base64Image.split(",");
    const base64Data = parts[1] || parts[0];

    // 2. Using "as any" to fix the "getGenerativeModel does not exist" error
    const model = (genAI as any).getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent([
      { text: prompt || "Analyze this image layout" },
      { inlineData: { data: base64Data, mimeType: "image/png" } }
    ]);

    res.json({ enhancedPrompt: result.response.text() });
  } catch (err: any) {
    console.error("AI Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA fallback — skip /api routes so Express API endpoints still work
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`🚀 SUCCESS! BEHINDLENS AI IS LIVE ON PORT ${PORT}`);
  });
}
bootstrap();