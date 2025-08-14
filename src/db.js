// src/db.js — file-based token store (ESM)
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// tokens live in /data/tokens.json (create folder if missing)
const DATA_DIR = path.join(__dirname, '..', 'data');
const TOKENS_PATH = path.join(DATA_DIR, 'tokens.json');

async function readJSON() {
  try {
    const raw = await fs.readFile(TOKENS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {}; // first run or missing file
  }
}

async function writeJSON(obj) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TOKENS_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

export async function ensureTables() {
  // no-op for file mode
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(TOKENS_PATH); } catch { await writeJSON({}); }
}

export async function upsertUserToken(userId, tokens) {
  const all = await readJSON();
  all[userId] = tokens;          // overwrite or create
  await writeJSON(all);
  return true;
}

export async function getUserTokenById(userId) {
  const all = await readJSON();
  return all[userId] || null;
}
