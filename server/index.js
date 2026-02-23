import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// HTTP Basic Auth
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || "admin";
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || "changeme";
app.use((req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="LLM Data Extractor"');
    return res.status(401).send("Authentication required.");
  }
  const [user, pass] = Buffer.from(authHeader.slice(6), "base64").toString().split(":");
  if (user !== BASIC_AUTH_USER || pass !== BASIC_AUTH_PASS) {
    res.set("WWW-Authenticate", 'Basic realm="LLM Data Extractor"');
    return res.status(401).send("Invalid credentials.");
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));

const upload = multer({ dest: "uploads/" });

// SQLite setup
const db = new Database(path.join(__dirname, "results.db"));
db.exec(`
  CREATE TABLE IF NOT EXISTS results (
    patient_id     TEXT PRIMARY KEY,
    result         TEXT NOT NULL,
    original_file  TEXT,
    updated_at     TEXT NOT NULL
  )
`);
// Migrate existing databases that don't have the original_file column
try { db.exec("ALTER TABLE results ADD COLUMN original_file TEXT"); } catch { /* already exists */ }
const upsertResult = db.prepare(`
  INSERT INTO results (patient_id, result, original_file, updated_at)
  VALUES (@patient_id, @result, @original_file, @updated_at)
  ON CONFLICT(patient_id) DO UPDATE SET
    result        = excluded.result,
    original_file = excluded.original_file,
    updated_at    = excluded.updated_at
`);
const listResults = db.prepare("SELECT patient_id, updated_at FROM results ORDER BY updated_at DESC");
const getResult   = db.prepare("SELECT result FROM results WHERE patient_id = ?");

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
    const raw = fs.readFileSync(filePath, "utf-8");
    fs.unlinkSync(filePath); // delete temp file

    // Try to parse as structured patient JSON; fall back to plain text
    let text = raw;
    let patientId = null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.patient?.id) patientId = parsed.patient.id;
      if (parsed?.clinical_notes) text = parsed.clinical_notes;
    } catch { /* plain text file — use as-is */ }

    const chunks = splitIntoChunks(text, MAX_CHUNK_CHARS);
    console.log(`Processing ${chunks.length} chunk(s) (max ${MAX_CHUNK_CHARS} chars each)`);

    // Stream results via Server-Sent Events
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (event, data) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

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

      const partial = mergeResults(chunkResults);
      if (patientId) partial.patient_id = patientId;
      send("progress", { chunk: i + 1, total: chunks.length, result: partial });
    }

    const merged = mergeResults(chunkResults);
    if (patientId) merged.patient_id = patientId;
    const finalResult = Object.keys(merged).length ? merged : chunkResults[0] ?? "";
    send("done", { result: finalResult });
    res.end();

    // Persist to SQLite
    if (patientId && finalResult && typeof finalResult === "object") {
      try {
        upsertResult.run({
          patient_id: patientId,
          result: JSON.stringify(finalResult),
          original_file: raw,
          updated_at: new Date().toISOString(),
        });
        console.log(`Saved result for patient ${patientId}`);
      } catch (dbErr) {
        console.error("DB write failed:", dbErr);
      }
    }
  } catch (error) {
    console.error(error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Something went wrong" })}\n\n`);
    res.end();
  }
});



app.get("/results", (req, res) => {
  res.json(listResults.all());
});

app.get("/results/:patientId", (req, res) => {
  const row = getResult.get(req.params.patientId);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(JSON.parse(row.result));
});

// Catch-all: serve the React app for any unmatched route
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(5000, () => console.log("Server running on port 5000"));
