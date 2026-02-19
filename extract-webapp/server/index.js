import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({ dest: "uploads/" });

const systemPrompt = fs.readFileSync(path.join(__dirname, "prompts", "system_prompt.txt"), "utf-8").trim();
const userPromptTemplate = fs.readFileSync(path.join(__dirname, "prompts", "user_prompt.txt"), "utf-8").trim();

const openai = new OpenAI({
  baseURL: process.env.LOCALAI_BASE_URL || "http://localhost:8080/v1",
  apiKey: "localai", // LocalAI doesn't require a real key
});

const CONTEXT_SIZE = parseInt(process.env.CONTEXT_SIZE || "4096", 10);
// Reserve tokens for prompts overhead + response
const PROMPT_OVERHEAD_TOKENS = parseInt(process.env.PROMPT_OVERHEAD_TOKENS || "800", 10);
const CHARS_PER_TOKEN = 4;
const MAX_CHUNK_CHARS = (CONTEXT_SIZE - PROMPT_OVERHEAD_TOKENS) * CHARS_PER_TOKEN;

function splitIntoChunks(text, maxChars) {
  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    const candidate = current ? current + "\n\n" + para : para;
    if (candidate.length > maxChars && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // If a single paragraph is still too large, hard-split it
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk];
    const parts = [];
    for (let i = 0; i < chunk.length; i += maxChars) {
      parts.push(chunk.slice(i, i + maxChars));
    }
    return parts;
  });
}

function parseJSON(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

function mergeResults(results) {
  const merged = {};
  for (const result of results) {
    if (!result || typeof result !== "object") continue;
    for (const [key, value] of Object.entries(result)) {
      if (value === null || value === undefined) continue;
      if (!(key in merged) || merged[key] === null) {
        merged[key] = value;
      } else if (Array.isArray(merged[key]) && Array.isArray(value)) {
        // Merge arrays, deduplicate by string representation
        const existing = new Set(merged[key].map((v) => JSON.stringify(v)));
        for (const item of value) {
          if (!existing.has(JSON.stringify(item))) merged[key].push(item);
        }
      }
      // For scalar fields already set, keep first non-null value
    }
  }
  return merged;
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "LLM Data Extractor API is running" });
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const text = fs.readFileSync(filePath, "utf-8");
    fs.unlinkSync(filePath); // delete temp file

    const chunks = splitIntoChunks(text, MAX_CHUNK_CHARS);
    console.log(`Processing ${chunks.length} chunk(s) (max ${MAX_CHUNK_CHARS} chars each)`);

    const chunkResults = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`  Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
      const completion = await openai.chat.completions.create({
        model: process.env.LOCALAI_MODEL || "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPromptTemplate.replace("{{text}}", chunks[i]) },
        ],
      });
      chunkResults.push(parseJSON(completion.choices[0].message.content));
    }

    const merged = mergeResults(chunkResults);
    res.json({ result: Object.keys(merged).length ? merged : chunkResults[0] ?? "" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
});



// Catch-all: serve the React app for any unmatched route
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(5000, () => console.log("Server running on port 5000"));
