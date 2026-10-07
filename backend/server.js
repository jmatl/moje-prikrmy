const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

app.use(cors({ origin: true, methods: ['GET', 'PUT', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Accept'] }));
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_diaries (
      family_key TEXT PRIMARY KEY,
      foods JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false });
  }
});

app.get('/api/families/:key', async (req, res) => {
  const key = String(req.params.key || '').trim().toUpperCase();
  if (!key) return res.status(400).json({ error: 'missing_key' });
  const result = await pool.query(
    'SELECT foods, updated_at FROM family_diaries WHERE family_key = $1',
    [key]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json({ foods: result.rows[0].foods, updatedAt: result.rows[0].updated_at });
});

app.put('/api/families/:key', async (req, res) => {
  const key = String(req.params.key || '').trim().toUpperCase();
  if (!key) return res.status(400).json({ error: 'missing_key' });
  const foods = req.body && req.body.foods;
  if (!Array.isArray(foods)) return res.status(400).json({ error: 'foods_must_be_array' });
  await pool.query(
    `INSERT INTO family_diaries (family_key, foods, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (family_key)
     DO UPDATE SET foods = EXCLUDED.foods, updated_at = NOW()`,
    [key, JSON.stringify(foods)]
  );
  res.json({ ok: true, foods });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

init()
  .then(() => app.listen(port, '0.0.0.0', () => console.log(`sync server listening on ${port}`)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
