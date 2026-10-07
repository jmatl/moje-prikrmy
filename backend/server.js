const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');

const app = express();
const port = process.env.PORT || 10000;
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.error('REDIS_URL is required');
  process.exit(1);
}

const redis = createClient({ url: redisUrl });
redis.on('error', err => console.error('redis error', err));

app.use(cors({ origin: true, methods: ['GET', 'PUT', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Accept'] }));
app.use(express.json({ limit: '1mb' }));

function normalizeKey(value) {
  return String(value || '').trim().toUpperCase();
}

app.get('/health', async (_req, res) => {
  try {
    const pong = await redis.ping();
    res.json({ ok: pong === 'PONG' });
  } catch (err) {
    res.status(503).json({ ok: false });
  }
});

app.get('/api/families/:key', async (req, res) => {
  const key = normalizeKey(req.params.key);
  if (!key) return res.status(400).json({ error: 'missing_key' });
  const raw = await redis.get(`family:${key}`);
  if (!raw) return res.status(404).json({ error: 'not_found' });
  try {
    res.json(JSON.parse(raw));
  } catch {
    res.status(500).json({ error: 'invalid_data' });
  }
});

app.put('/api/families/:key', async (req, res) => {
  const key = normalizeKey(req.params.key);
  if (!key) return res.status(400).json({ error: 'missing_key' });
  const foods = req.body && req.body.foods;
  if (!Array.isArray(foods)) return res.status(400).json({ error: 'foods_must_be_array' });
  const payload = { foods, updatedAt: new Date().toISOString() };
  await redis.set(`family:${key}`, JSON.stringify(payload));
  res.json({ ok: true, ...payload });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

(async () => {
  await redis.connect();
  app.listen(port, '0.0.0.0', () => console.log(`sync server listening on ${port}`));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
