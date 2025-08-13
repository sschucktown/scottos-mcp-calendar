import pg from 'pg'
const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false }
})

export async function ensureTables() {
  await pool.query(`
    create table if not exists user_tokens (
      user_id text primary key,
      tokens jsonb not null,
      updated_at timestamptz not null default now()
    );
  `)
}

export async function upsertUserToken(userId, tokens) {
  await ensureTables()
  await pool.query(
    `insert into user_tokens (user_id, tokens) values ($1, $2)
     on conflict (user_id) do update set tokens = excluded.tokens, updated_at = now()`,
    [userId, tokens]
  )
}

export async function getUserTokenById(userId) {
  await ensureTables()
  const { rows } = await pool.query('select tokens from user_tokens where user_id = $1', [userId])
  return rows[0]?.tokens || null
}
