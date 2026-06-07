import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET || 'dev_secret_change_me';
const uploadDir = '/app/uploads';

fs.mkdirSync(uploadDir, { recursive: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '-');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({ storage });

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret, { expiresIn: '7d' });
}

function auth(requiredRole) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });
    try {
      const user = jwt.verify(token, jwtSecret);
      if (requiredRole && user.role !== requiredRole) return res.status(403).json({ error: 'Forbidden' });
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS competitions (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      question TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL DEFAULT '',
      free_entry_text TEXT NOT NULL DEFAULT '',
      ticket_price_pence INTEGER NOT NULL DEFAULT 0,
      max_tickets INTEGER NOT NULL DEFAULT 100,
      max_per_user INTEGER NOT NULL DEFAULT 10,
      draw_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'draft',
      image_url TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS entries (
      id SERIAL PRIMARY KEY,
      competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      ticket_number INTEGER NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (competition_id, ticket_number)
    );

    CREATE TABLE IF NOT EXISTS winners (
      id SERIAL PRIMARY KEY,
      competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
      entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
      winner_name TEXT NOT NULL,
      prize_title TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      announced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@prizetown.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  if (existing.rowCount === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)', ['Admin', adminEmail, hash, 'admin']);
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, app: 'Prizetown API' }));

app.post('/auth/register', async (req, res) => {
  const { name = '', email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email.toLowerCase(), hash, 'customer']
    );
    const user = result.rows[0];
    res.json({ user, token: signToken(user) });
  } catch (err) {
    res.status(400).json({ error: 'Email already registered' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await query('SELECT * FROM users WHERE email = $1', [(email || '').toLowerCase()]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid login' });
  const ok = await bcrypt.compare(password || '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid login' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token: signToken(user) });
});

app.get('/competitions', async (_req, res) => {
  const result = await query(`
    SELECT c.*,
      COUNT(e.id)::int AS entries_sold
    FROM competitions c
    LEFT JOIN entries e ON e.competition_id = c.id AND e.payment_status IN ('paid','free')
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `);
  res.json(result.rows);
});

app.get('/competitions/:slug', async (req, res) => {
  const result = await query(`
    SELECT c.*,
      COUNT(e.id)::int AS entries_sold
    FROM competitions c
    LEFT JOIN entries e ON e.competition_id = c.id AND e.payment_status IN ('paid','free')
    WHERE c.slug = $1
    GROUP BY c.id
  `, [req.params.slug]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Competition not found' });
  res.json(result.rows[0]);
});

app.post('/admin/upload', auth('admin'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.post('/admin/competitions', auth('admin'), async (req, res) => {
  const c = req.body;
  const result = await query(`
    INSERT INTO competitions
    (title, slug, description, question, answer, free_entry_text, ticket_price_pence, max_tickets, max_per_user, draw_at, status, image_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *
  `, [c.title, c.slug, c.description || '', c.question || '', c.answer || '', c.free_entry_text || '', c.ticket_price_pence || 0, c.max_tickets || 100, c.max_per_user || 10, c.draw_at || null, c.status || 'draft', c.image_url || '']);
  res.json(result.rows[0]);
});

app.patch('/admin/competitions/:id', auth('admin'), async (req, res) => {
  const c = req.body;
  const result = await query(`
    UPDATE competitions SET
      title=$1, slug=$2, description=$3, question=$4, answer=$5, free_entry_text=$6,
      ticket_price_pence=$7, max_tickets=$8, max_per_user=$9, draw_at=$10, status=$11, image_url=$12,
      updated_at=NOW()
    WHERE id=$13 RETURNING *
  `, [c.title, c.slug, c.description || '', c.question || '', c.answer || '', c.free_entry_text || '', c.ticket_price_pence || 0, c.max_tickets || 100, c.max_per_user || 10, c.draw_at || null, c.status || 'draft', c.image_url || '', req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Competition not found' });
  res.json(result.rows[0]);
});

app.delete('/admin/competitions/:id', auth('admin'), async (req, res) => {
  await query('DELETE FROM competitions WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

app.post('/competitions/:id/entries/free', auth(), async (req, res) => {
  const { answer } = req.body;
  const comp = (await query('SELECT * FROM competitions WHERE id = $1', [req.params.id])).rows[0];
  if (!comp || comp.status !== 'active') return res.status(400).json({ error: 'Competition is not active' });
  if (comp.answer && String(answer || '').trim().toLowerCase() !== comp.answer.trim().toLowerCase()) {
    return res.status(400).json({ error: 'Answer is incorrect' });
  }
  const count = await query('SELECT COUNT(*)::int AS count FROM entries WHERE competition_id=$1 AND user_id=$2', [comp.id, req.user.id]);
  if (count.rows[0].count >= comp.max_per_user) return res.status(400).json({ error: 'Max entries reached' });
  const sold = await query('SELECT COUNT(*)::int AS count FROM entries WHERE competition_id=$1 AND payment_status IN ($2,$3)', [comp.id, 'paid', 'free']);
  if (sold.rows[0].count >= comp.max_tickets) return res.status(400).json({ error: 'Sold out' });

  const ticketNumber = sold.rows[0].count + 1;
  const user = (await query('SELECT name,email FROM users WHERE id=$1', [req.user.id])).rows[0];
  const entry = await query(`
    INSERT INTO entries (competition_id,user_id,customer_name,customer_email,ticket_number,payment_status)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
  `, [comp.id, req.user.id, user.name, user.email, ticketNumber, 'free']);
  res.json(entry.rows[0]);
});

app.get('/admin/entries', auth('admin'), async (_req, res) => {
  const result = await query(`
    SELECT e.*, c.title AS competition_title
    FROM entries e
    JOIN competitions c ON c.id = e.competition_id
    ORDER BY e.created_at DESC
    LIMIT 500
  `);
  res.json(result.rows);
});

app.get('/winners', async (_req, res) => {
  const result = await query(`
    SELECT w.*, c.title AS competition_title
    FROM winners w
    JOIN competitions c ON c.id = w.competition_id
    ORDER BY w.announced_at DESC
  `);
  res.json(result.rows);
});

initDb()
  .then(() => app.listen(port, () => console.log(`Prizetown API running on ${port}`)))
  .catch((err) => {
    console.error('Failed to start API', err);
    process.exit(1);
  });
