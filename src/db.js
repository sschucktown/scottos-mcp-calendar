// src/db.js — file storage for dev (no Postgres needed)
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

const HAS_DB =
  process.env.DATABASE_URL ||
  (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER);

// where we stash Google OAuth tokens in dev
const TOKENS_PATH = path.resolve('./tokens.local.json');

let pool = null;
if (HAS_DB) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
  });
}

export async function ensureTables() {
  if (!pool) return; // file mode: nothing to do
  await pool.query(`
    create table if not exists user_tokens (
      user_id text primary key,
      tokens jsonb not null,
      updated_at timestamptz not null default now()
    );
  `);
}

// ---------- DB mode ----------
async function dbUpsert(userId, tokens) {
  await ensureTables();
  await pool.query(
    `insert into user_tokens (user_id, tokens) values ($1, $2)
     on conflict (user_id) do update set tokens = excluded.tokens, updated_at = now()`,
    [userId, tokens]
  );
}
async function dbGet(userId) {
  await ensureTables();
  const { rows } = await pool.query('select tokens from user_tokens where user_id = $1', [userId]);
  return rows[0]?.tokens || null;
}

// ---------- File mode ----------
function fileReadAll() {
  if (!fs.existsSync(TOKENS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8')); }
  catch { return {}; }
}
function fileWriteAll(obj) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(obj, null, 2));
}

export async function upsertUserToken(userId, tokens) {
  if (pool) return dbUpsert(userId, tokens);
  const data = fileReadAll();
  data[userId] = tokens;
  fileWriteAll(data);
}

export async function getUserTokenById(userId) {
  if (pool) return dbGet(userId);
  const data = fileReadAll();
  return data[userId] || null;
}
