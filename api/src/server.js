import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET || 'dev_secret_change_me';
const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';

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
  return pool.query(sql, params);
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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
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
      rules_text TEXT NOT NULL DEFAULT '',
      closes_at TIMESTAMPTZ,
      min_age INTEGER NOT NULL DEFAULT 18,
      age_restricted BOOLEAN NOT NULL DEFAULT TRUE,
      ticket_price_pence INTEGER NOT NULL DEFAULT 0,
      max_tickets INTEGER NOT NULL DEFAULT 100,
      max_per_user INTEGER NOT NULL DEFAULT 10,
      draw_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'draft',
      image_url TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      total_pence INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'paid_test',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price_pence INTEGER NOT NULL DEFAULT 0,
      line_total_pence INTEGER NOT NULL DEFAULT 0,
      answer_given TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS entries (
      id SERIAL PRIMARY KEY,
      competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
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


    CREATE TABLE IF NOT EXISTS draw_results (
      id SERIAL PRIMARY KEY,
      competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
      entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
      ticket_number INTEGER NOT NULL DEFAULT 0,
      winner_name TEXT NOT NULL DEFAULT '',
      winner_email TEXT NOT NULL DEFAULT '',
      draw_method TEXT NOT NULL DEFAULT 'wheel_of_names',
      notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS free_entry_requests (
      id SERIAL PRIMARY KEY,
      competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
      entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      postal_reference TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      processed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS instant_win_prizes (
      id SERIAL PRIMARY KEY,
      competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
      prize_title TEXT NOT NULL,
      prize_value_pence INTEGER NOT NULL DEFAULT 0,
      prize_image_url TEXT NOT NULL DEFAULT '',
      quantity_total INTEGER NOT NULL DEFAULT 1,
      winning_tickets TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS instant_win_claims (
      id SERIAL PRIMARY KEY,
      prize_id INTEGER NOT NULL REFERENCES instant_win_prizes(id) ON DELETE CASCADE,
      competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_email TEXT NOT NULL DEFAULT '',
      ticket_number INTEGER NOT NULL,
      prize_title TEXT NOT NULL DEFAULT '',
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (competition_id, ticket_number)
    );

    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS prize_summary TEXT NOT NULL DEFAULT '';
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS ticket_presets TEXT NOT NULL DEFAULT '10,20,50,100,250,500,1000,2500';
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS max_per_order INTEGER NOT NULL DEFAULT 2500;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Instant Wins';

    INSERT INTO site_settings (key, value) VALUES
      ('site_name', 'Prizetown'),
      ('support_email', 'support@prizetown.local'),
      ('hero_eyebrow', 'Custom competition platform'),
      ('hero_title', 'Win big prizes with Prizetown'),
      ('hero_text', 'Browse live competitions, add tickets to your basket, answer the entry question, and checkout to receive ticket numbers.'),
      ('footer_text', 'Please play responsibly. Free entry routes and terms should be checked before public launch.'),
      ('free_entry_global', 'Postal/free entry route details can be added here from Admin Settings.'),
      ('terms_text', 'Add your competition terms, eligibility rules, draw process, free entry route and privacy/contact wording here before going public.'),
      ('responsible_play_text', '18+ only. Please enter responsibly. Do not spend more than you can afford.'),
      ('age_confirmation_text', 'I confirm I am 18 or over and I agree to the competition rules and free-entry terms.')
    ON CONFLICT (key) DO NOTHING;

    ALTER TABLE entries ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS rules_text TEXT NOT NULL DEFAULT '';
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS min_age INTEGER NOT NULL DEFAULT 18;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS age_restricted BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS prize_summary TEXT NOT NULL DEFAULT '';
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS ticket_presets TEXT NOT NULL DEFAULT '10,20,50,100,250,500,1000,2500';
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS max_per_order INTEGER NOT NULL DEFAULT 2500;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Instant Wins';
    CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_entries_order_id ON entries(order_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  `);

  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS prize_image_url TEXT NOT NULL DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS quantity_total INTEGER NOT NULL DEFAULT 1`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS winning_tickets TEXT NOT NULL DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS prize_value_pence INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  await pool.query(`UPDATE instant_win_prizes SET active = TRUE WHERE active IS NULL`).catch(() => {});
  await pool.query(`UPDATE instant_win_prizes SET quantity_total = 1 WHERE quantity_total IS NULL`).catch(() => {});

  
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS prize_image_url TEXT NOT NULL DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS quantity_total INTEGER NOT NULL DEFAULT 1`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS winning_tickets TEXT NOT NULL DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS prize_value_pence INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS claimed_entry_id INTEGER`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ`).catch(() => {});
  await pool.query(`UPDATE instant_win_prizes SET active = TRUE WHERE active IS NULL`).catch(() => {});
  await pool.query(`UPDATE instant_win_prizes SET quantity_total = 1 WHERE quantity_total IS NULL`).catch(() => {});
  await pool.query(`UPDATE instant_win_prizes SET winning_tickets = '' WHERE winning_tickets IS NULL`).catch(() => {});

  
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS prize_image_url TEXT NOT NULL DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS quantity_total INTEGER NOT NULL DEFAULT 1`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS winning_tickets TEXT NOT NULL DEFAULT ''`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS prize_value_pence INTEGER NOT NULL DEFAULT 0`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS winning_ticket_number INTEGER`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'available'`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS claimed_entry_id INTEGER`).catch(() => {});
  await pool.query(`ALTER TABLE instant_win_prizes ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ`).catch(() => {});
  await pool.query(`UPDATE instant_win_prizes SET active = TRUE WHERE active IS NULL`).catch(() => {});
  await pool.query(`UPDATE instant_win_prizes SET quantity_total = 1 WHERE quantity_total IS NULL`).catch(() => {});
  await pool.query(`UPDATE instant_win_prizes SET winning_tickets = '' WHERE winning_tickets IS NULL`).catch(() => {});
  await pool.query(`UPDATE instant_win_prizes SET status = 'available' WHERE status IS NULL`).catch(() => {});

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@prizetown.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = await query('SELECT id FROM users WHERE email = $1', [normalizeEmail(adminEmail)]);
  if (existing.rowCount === 0) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await query('INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)', ['Admin', normalizeEmail(adminEmail), hash, 'admin']);
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, app: 'Prizetown API', version: 'v49' }));


async function getSettingsObject() {
  const result = await query('SELECT key, value FROM site_settings ORDER BY key');
  return Object.fromEntries(result.rows.map(row => [row.key, row.value]));
}

const allowedSettings = [
  'site_name',
  'support_email',
  'hero_eyebrow',
  'hero_title',
  'hero_text',
  'footer_text',
  'free_entry_global',
  'terms_text',
  'responsible_play_text',
  'age_confirmation_text'
];

app.get('/settings', async (_req, res) => {
  res.json(await getSettingsObject());
});

app.get('/admin/settings', auth('admin'), async (_req, res) => {
  res.json(await getSettingsObject());
});

app.patch('/admin/settings', auth('admin'), async (req, res) => {
  const updates = req.body || {};
  for (const key of allowedSettings) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      await query(
        `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, String(updates[key] ?? '')]
      );
    }
  }
  res.json(await getSettingsObject());
});

app.post('/auth/register', async (req, res) => {
  const { name = '', email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, normalizeEmail(email), hash, 'customer']
    );
    const user = result.rows[0];
    res.json({ user, token: signToken(user) });
  } catch {
    res.status(400).json({ error: 'Email already registered' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await query('SELECT * FROM users WHERE email = $1', [normalizeEmail(email)]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid login' });
  const ok = await bcrypt.compare(password || '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid login' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token: signToken(user) });
});


async function audit(user, action, details = '') {
  try {
    await query('INSERT INTO audit_logs (user_id, user_email, action, details) VALUES ($1,$2,$3,$4)', [user?.id || null, user?.email || '', action, details]);
  } catch (err) {
    console.warn('Audit log failed', err.message);
  }
}

function ensureCompetitionOpen(competition) {
  if (!competition || competition.status !== 'active') throw new Error('Competition is not active');
  const now = Date.now();
  if (competition.closes_at && new Date(competition.closes_at).getTime() <= now) throw new Error('Competition is closed');
  if (competition.draw_at && new Date(competition.draw_at).getTime() <= now) throw new Error('Competition draw date has passed');
}


let drawBroadcastState = {
  mode: 'idle',
  competition_id: null,
  competition_title: '',
  competition_number: '',
  draw_date: '',
  ticket_capacity: 0,
  eligible_count: 0,
  visual_tickets: [],
  winner: null,
  updated_at: new Date().toISOString()
};

app.get('/draw/broadcast-state', (_req, res) => {
  res.json(drawBroadcastState);
});

app.post('/admin/draw/broadcast-state', auth('admin'), (req, res) => {
  try {
    const body = req.body || {};
    drawBroadcastState = {
      ...drawBroadcastState,
      ...body,
      visual_tickets: Array.isArray(body.visual_tickets) ? body.visual_tickets.slice(0, 150) : [],
      winner: body.winner || null,
      updated_at: new Date().toISOString()
    };
    res.json(drawBroadcastState);
  } catch (err) {
    console.error('Broadcast state update failed', err);
    res.status(400).json({ error: err.message || 'Broadcast state update failed' });
  }
});

app.post('/admin/draw/broadcast-reset', auth('admin'), (_req, res) => {
  drawBroadcastState = {
    mode: 'idle',
    competition_id: null,
    competition_title: '',
    competition_number: '',
    draw_date: '',
    ticket_capacity: 0,
    eligible_count: 0,
    visual_tickets: [],
    winner: null,
    updated_at: new Date().toISOString()
  };
  res.json(drawBroadcastState);
});

app.get('/competitions', async (_req, res) => {
  const result = await query(`
    SELECT c.*,
      COUNT(DISTINCT e.id)::int AS entries_sold,
      COUNT(DISTINCT iwp.id)::int AS instant_prize_types,
      COALESCE(SUM(iwp.quantity_total), 0)::int AS instant_prize_total,
      COUNT(DISTINCT iwc.id)::int AS instant_prize_found
    FROM competitions c
    LEFT JOIN entries e ON e.competition_id = c.id AND e.payment_status IN ('paid','free','paid_test','free_manual')
    LEFT JOIN instant_win_prizes iwp ON iwp.competition_id = c.id AND iwp.active = TRUE
    LEFT JOIN instant_win_claims iwc ON iwc.prize_id = iwp.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `);
  res.json(result.rows);
});

app.get('/competitions/:slug', async (req, res) => {
  const result = await query(`
    SELECT c.*,
      COUNT(DISTINCT e.id)::int AS entries_sold,
      COUNT(DISTINCT iwp.id)::int AS instant_prize_types,
      COALESCE(SUM(iwp.quantity_total), 0)::int AS instant_prize_total,
      COUNT(DISTINCT iwc.id)::int AS instant_prize_found
    FROM competitions c
    LEFT JOIN entries e ON e.competition_id = c.id AND e.payment_status IN ('paid','free','paid_test','free_manual')
    LEFT JOIN instant_win_prizes iwp ON iwp.competition_id = c.id AND iwp.active = TRUE
    LEFT JOIN instant_win_claims iwc ON iwc.prize_id = iwp.id
    WHERE c.slug = $1
    GROUP BY c.id
  `, [req.params.slug]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Competition not found' });
  res.json(result.rows[0]);
});

app.get('/competitions/:id/entries', async (req, res) => {
  const result = await query(`
    SELECT ticket_number, customer_name, created_at
    FROM entries
    WHERE competition_id = $1 AND payment_status IN ('paid','free','paid_test','free_manual')
    ORDER BY ticket_number ASC
  `, [req.params.id]);
  res.json(result.rows);
});

app.post('/admin/upload', auth('admin'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.post('/admin/competitions', auth('admin'), async (req, res) => {
  const c = req.body;
  const result = await query(`
    INSERT INTO competitions
    (title, slug, description, question, answer, free_entry_text, rules_text, closes_at, min_age, age_restricted, ticket_price_pence, max_tickets, max_per_user, draw_at, status, image_url, prize_summary, ticket_presets, max_per_order, category)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    RETURNING *
  `, [c.title, c.slug, c.description || '', c.question || '', c.answer || '', c.free_entry_text || '', c.rules_text || '', c.closes_at || null, toInt(c.min_age, 18), c.age_restricted !== false, toInt(c.ticket_price_pence), toInt(c.max_tickets, 100), toInt(c.max_per_user, 10), c.draw_at || null, c.status || 'draft', c.image_url || '', c.prize_summary || '', c.ticket_presets || '10,20,50,100,250,500,1000,2500', toInt(c.max_per_order, 2500), c.category || 'Instant Wins']);
  await audit(req.user, 'competition_created', `Created competition ${result.rows[0].title}`);
  res.json(result.rows[0]);
});

app.patch('/admin/competitions/:id', auth('admin'), async (req, res) => {
  const c = req.body;
  const result = await query(`
    UPDATE competitions SET
      title=$1, slug=$2, description=$3, question=$4, answer=$5, free_entry_text=$6, rules_text=$7,
      closes_at=$8, min_age=$9, age_restricted=$10, ticket_price_pence=$11, max_tickets=$12, max_per_user=$13, draw_at=$14, status=$15, image_url=$16,
      prize_summary=$17, ticket_presets=$18, max_per_order=$19, category=$20,
      updated_at=NOW()
    WHERE id=$21 RETURNING *
  `, [c.title, c.slug, c.description || '', c.question || '', c.answer || '', c.free_entry_text || '', c.rules_text || '', c.closes_at || null, toInt(c.min_age, 18), c.age_restricted !== false, toInt(c.ticket_price_pence), toInt(c.max_tickets, 100), toInt(c.max_per_user, 10), c.draw_at || null, c.status || 'draft', c.image_url || '', c.prize_summary || '', c.ticket_presets || '10,20,50,100,250,500,1000,2500', toInt(c.max_per_order, 2500), c.category || 'Instant Wins', req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Competition not found' });
  await audit(req.user, 'competition_updated', `Updated competition ${result.rows[0].title}`);
  res.json(result.rows[0]);
});

app.delete('/admin/competitions/:id', auth('admin'), async (req, res) => {
  await query('DELETE FROM competitions WHERE id = $1', [req.params.id]);
  await audit(req.user, 'competition_deleted', `Deleted competition ${req.params.id}`);
  res.json({ ok: true });
});

async function allocateTickets(client, { competition, user, orderId, quantity, paymentStatus }) {
  const used = await client.query(
    'SELECT ticket_number FROM entries WHERE competition_id=$1 ORDER BY ticket_number ASC',
    [competition.id]
  );
  const usedSet = new Set(used.rows.map(r => Number(r.ticket_number)));
  const entries = [];
  for (let n = 1; n <= competition.max_tickets && entries.length < quantity; n += 1) {
    if (usedSet.has(n)) continue;
    const inserted = await client.query(`
      INSERT INTO entries (competition_id,user_id,order_id,customer_name,customer_email,ticket_number,payment_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [competition.id, user?.id || null, orderId, user?.name || '', user?.email || '', n, paymentStatus]);
    entries.push(inserted.rows[0]);
  }
  if (entries.length !== quantity) throw new Error('Not enough tickets remaining');
  return entries;
}

function ticketListContains(csv, ticketNumber) {
  return String(csv || '')
    .split(/[,\n\r ]+/)
    .map(v => Number(String(v).trim()))
    .filter(Boolean)
    .includes(Number(ticketNumber));
}

async function claimInstantWins(client, entries) {
  const claims = [];
  for (const entry of entries) {
    const prizes = await client.query(`
      SELECT p.*, COUNT(c.id)::int AS found_count
      FROM instant_win_prizes p
      LEFT JOIN instant_win_claims c ON c.prize_id = p.id
      WHERE p.competition_id=$1 AND p.active=TRUE
      GROUP BY p.id
      ORDER BY p.sort_order ASC, p.id ASC
    `, [entry.competition_id]);
    for (const prize of prizes.rows) {
      if (Number(prize.found_count || 0) >= Number(prize.quantity_total || 0)) continue;
      if (!ticketListContains(prize.winning_tickets, entry.ticket_number)) continue;
      try {
        const claim = (await client.query(`
          INSERT INTO instant_win_claims (prize_id, competition_id, entry_id, user_id, customer_name, customer_email, ticket_number, prize_title)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          RETURNING *
        `, [prize.id, entry.competition_id, entry.id, entry.user_id || null, entry.customer_name || '', entry.customer_email || '', entry.ticket_number, prize.prize_title])).rows[0];
        claims.push({ ...claim, prize_value_pence: prize.prize_value_pence, prize_image_url: prize.prize_image_url });
      } catch {
        // Another prize already claimed for this ticket; ignore safely.
      }
      break;
    }
  }
  return claims;
}

app.post('/orders', auth(), async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const notes = String(req.body.notes || '');
  const ageConfirmed = req.body.age_confirmed === true;
  if (!ageConfirmed) return res.status(400).json({ error: 'Please confirm your age and acceptance of the competition rules.' });
  if (items.length === 0) return res.status(400).json({ error: 'Basket is empty' });
  if (items.length > 20) return res.status(400).json({ error: 'Too many basket items' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE entries IN EXCLUSIVE MODE');

    const user = (await client.query('SELECT id,name,email FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (!user) throw new Error('User not found');

    const prepared = [];
    let total = 0;

    for (const item of items) {
      const competitionId = toInt(item.competition_id || item.id || item.competitionId);
      const answerGiven = String(item.answer || '').trim();
      if (!competitionId) throw new Error('A basket item is missing its competition ID. Please remove it and add it again.');
      const competition = (await client.query('SELECT * FROM competitions WHERE id=$1', [competitionId])).rows[0];
      if (!competition) throw new Error('One basket competition no longer exists. Please remove it and add it again.');
      ensureCompetitionOpen(competition);
      const quantity = Math.min(toInt(competition.max_per_order, 2500) || 2500, Math.max(1, toInt(item.quantity, 1)));
      if (competition.question && !answerGiven) {
        throw new Error(`Please answer the entry question for ${competition.title}`);
      }
      if (competition.answer && answerGiven.toLowerCase() !== competition.answer.trim().toLowerCase()) {
        throw new Error(`Answer is incorrect for ${competition.title}. Please check the entry question answer.`);
      }
      const already = (await client.query(
        "SELECT COUNT(*)::int AS count FROM entries WHERE competition_id=$1 AND user_id=$2 AND payment_status IN ('paid','free','paid_test','free_manual')",
        [competition.id, user.id]
      )).rows[0].count;
      if (already + quantity > competition.max_per_user) {
        const remainingForUser = Math.max(0, Number(competition.max_per_user || 0) - Number(already || 0));
        throw new Error(`${competition.title}: max entries reached. Max per user is ${competition.max_per_user}. You already have ${already}; you can add ${remainingForUser} more.`);
      }
      const sold = (await client.query(
        "SELECT COUNT(*)::int AS count FROM entries WHERE competition_id=$1 AND payment_status IN ('paid','free','paid_test','free_manual')",
        [competition.id]
      )).rows[0].count;
      if (sold + quantity > competition.max_tickets) throw new Error(`${competition.title} does not have enough tickets left`);
      const lineTotal = competition.ticket_price_pence * quantity;
      total += lineTotal;
      prepared.push({ competition, quantity, answerGiven, lineTotal });
    }

    const order = (await client.query(`
      INSERT INTO orders (user_id, customer_name, customer_email, total_pence, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [user.id, user.name || '', user.email, total, 'paid_test', notes])).rows[0];

    const allEntries = [];
    for (const item of prepared) {
      await client.query(`
        INSERT INTO order_items (order_id, competition_id, quantity, unit_price_pence, line_total_pence, answer_given)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [order.id, item.competition.id, item.quantity, item.competition.ticket_price_pence, item.lineTotal, item.answerGiven]);
      const entries = await allocateTickets(client, { competition: item.competition, user, orderId: order.id, quantity: item.quantity, paymentStatus: 'paid_test' });
      const instantClaims = await claimInstantWins(client, entries);
      allEntries.push(...entries.map(e => ({ ...e, competition_title: item.competition.title, instant_wins: instantClaims.filter(claim => claim.entry_id === e.id) })));
    }

    await client.query('COMMIT');
    await audit(req.user, 'order_created', `Order #${order.id} created with ${allEntries.length} entries`);
    res.json({ order, entries: allEntries });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Checkout failed', err);
    res.status(400).json({ error: err.message || 'Checkout failed' });
  } finally {
    client.release();
  }
});

app.post('/competitions/:id/entries/free', auth(), async (req, res) => {
  const { answer } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE entries IN EXCLUSIVE MODE');
    const comp = (await client.query('SELECT * FROM competitions WHERE id = $1', [req.params.id])).rows[0];
    ensureCompetitionOpen(comp);
    if (comp.answer && String(answer || '').trim().toLowerCase() !== comp.answer.trim().toLowerCase()) {
      throw new Error('Answer is incorrect');
    }
    const count = await client.query(
      "SELECT COUNT(*)::int AS count FROM entries WHERE competition_id=$1 AND user_id=$2 AND payment_status IN ('paid','free','paid_test','free_manual')",
      [comp.id, req.user.id]
    );
    if (count.rows[0].count >= comp.max_per_user) throw new Error('Max entries reached');
    const sold = await client.query(
      "SELECT COUNT(*)::int AS count FROM entries WHERE competition_id=$1 AND payment_status IN ('paid','free','paid_test','free_manual')",
      [comp.id]
    );
    if (sold.rows[0].count >= comp.max_tickets) throw new Error('Sold out');

    const user = (await client.query('SELECT id,name,email FROM users WHERE id=$1', [req.user.id])).rows[0];
    const entries = await allocateTickets(client, { competition: comp, user, orderId: null, quantity: 1, paymentStatus: 'free' });
    const instant_wins = await claimInstantWins(client, entries);
    await client.query('COMMIT');
    res.json({ ...entries[0], instant_wins });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(400).json({ error: err.message || 'Entry failed' });
  } finally {
    client.release();
  }
});

app.get('/me/entries', auth(), async (req, res) => {
  const result = await query(`
    SELECT e.*, c.title AS competition_title, c.image_url, c.draw_at, o.total_pence, o.status AS order_status
    FROM entries e
    JOIN competitions c ON c.id = e.competition_id
    LEFT JOIN orders o ON o.id = e.order_id
    WHERE e.user_id = $1
    ORDER BY e.created_at DESC
  `, [req.user.id]);
  res.json(result.rows);
});

app.get('/me/orders', auth(), async (req, res) => {
  const result = await query(`
    SELECT o.*, COUNT(e.id)::int AS entry_count
    FROM orders o
    LEFT JOIN entries e ON e.order_id = o.id
    WHERE o.user_id = $1
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `, [req.user.id]);
  res.json(result.rows);
});

app.get('/admin/entries', auth('admin'), async (_req, res) => {
  const result = await query(`
    SELECT e.*, c.title AS competition_title, o.status AS order_status
    FROM entries e
    JOIN competitions c ON c.id = e.competition_id
    LEFT JOIN orders o ON o.id = e.order_id
    ORDER BY e.created_at DESC
    LIMIT 500
  `);
  res.json(result.rows);
});

app.get('/admin/orders', auth('admin'), async (_req, res) => {
  const result = await query(`
    SELECT o.*, COUNT(e.id)::int AS entry_count
    FROM orders o
    LEFT JOIN entries e ON e.order_id = o.id
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 500
  `);
  res.json(result.rows);
});



app.get('/admin/audit-logs', auth('admin'), async (_req, res) => {
  const result = await query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200');
  res.json(result.rows);
});

app.post('/admin/free-entry', auth('admin'), async (req, res) => {
  const competitionId = toInt(req.body.competition_id);
  const customerName = String(req.body.customer_name || '').trim();
  const customerEmail = normalizeEmail(req.body.customer_email);
  const postalReference = String(req.body.postal_reference || '').trim();
  const notes = String(req.body.notes || '').trim();
  if (!competitionId || !customerName || !customerEmail) return res.status(400).json({ error: 'Competition, customer name and email are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE entries IN EXCLUSIVE MODE');
    const competition = (await client.query('SELECT * FROM competitions WHERE id=$1', [competitionId])).rows[0];
    ensureCompetitionOpen(competition);

    const existing = (await client.query(
      "SELECT COUNT(*)::int AS count FROM entries WHERE competition_id=$1 AND customer_email=$2 AND payment_status IN ('paid','free','paid_test','free_manual','free_manual')",
      [competition.id, customerEmail]
    )).rows[0].count;
    if (existing + 1 > competition.max_per_user) throw new Error('Max entries reached for this email');

    const sold = (await client.query(
      "SELECT COUNT(*)::int AS count FROM entries WHERE competition_id=$1 AND payment_status IN ('paid','free','paid_test','free_manual','free_manual')",
      [competition.id]
    )).rows[0].count;
    if (sold + 1 > competition.max_tickets) throw new Error('Sold out');

    const manualUser = { id: null, name: customerName, email: customerEmail };
    const [entry] = await allocateTickets(client, { competition, user: manualUser, orderId: null, quantity: 1, paymentStatus: 'free_manual' });
    const instant_wins = await claimInstantWins(client, [entry]);
    const freeReq = (await client.query(`
      INSERT INTO free_entry_requests (competition_id, entry_id, customer_name, customer_email, postal_reference, notes, processed_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [competition.id, entry.id, customerName, customerEmail, postalReference, notes, req.user.id])).rows[0];
    await client.query('COMMIT');
    await audit(req.user, 'manual_free_entry_created', `Manual/free entry #${entry.id} for ${customerEmail} on ${competition.title}`);
    res.json({ request: freeReq, entry: { ...entry, instant_wins } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(400).json({ error: err.message || 'Free entry failed' });
  } finally {
    client.release();
  }
});


app.get('/competitions/:id/instant-wins', async (req, res) => {
  const result = await query(`
    SELECT p.*, COUNT(c.id)::int AS found_count
    FROM instant_win_prizes p
    LEFT JOIN instant_win_claims c ON c.prize_id = p.id
    WHERE p.competition_id=$1 AND p.active=TRUE
    GROUP BY p.id
    ORDER BY p.sort_order ASC, p.id ASC
  `, [req.params.id]);
  res.json(result.rows.map(row => ({ ...row, winning_tickets: undefined })));
});

app.get('/instant-winners', async (_req, res) => {
  const result = await query(`
    SELECT c.*, comp.title AS competition_title, p.prize_image_url, p.prize_value_pence
    FROM instant_win_claims c
    JOIN competitions comp ON comp.id = c.competition_id
    JOIN instant_win_prizes p ON p.id = c.prize_id
    ORDER BY c.claimed_at DESC
    LIMIT 200
  `);
  res.json(result.rows);
});








app.get('/admin/competitions/:id/draw-entries', auth('admin'), async (req, res) => {
  const competition = (await query('SELECT * FROM competitions WHERE id=$1', [req.params.id])).rows[0];
  if (!competition) return res.status(404).json({ error: 'Competition not found' });
  const result = await query(`
    SELECT e.id, e.ticket_number, e.customer_name, e.customer_email, e.payment_status, e.created_at,
           COALESCE(o.status, e.payment_status) AS order_status
    FROM entries e
    LEFT JOIN orders o ON o.id = e.order_id
    WHERE e.competition_id=$1 AND e.payment_status IN ('paid','free','paid_test','free_manual')
    ORDER BY e.ticket_number ASC
  `, [req.params.id]);
  const wheelEntries = result.rows.map(e => `Ticket #${e.ticket_number} - ${e.customer_name || e.customer_email || 'Customer'}`);
  const wheelUrl = `https://wheelofnames.com/?entries=${encodeURIComponent(wheelEntries.join(','))}&title=${encodeURIComponent(`${competition.title} Draw`)}`;
  res.json({ competition, entries: result.rows, wheel_entries: wheelEntries, wheel_url: wheelUrl });
});

app.post('/admin/draw-results', auth('admin'), async (req, res) => {
  const competitionId = toInt(req.body.competition_id);
  const entryId = toInt(req.body.entry_id);
  const notes = String(req.body.notes || '').trim();
  if (!competitionId || !entryId) return res.status(400).json({ error: 'Competition and winning entry are required' });
  const entry = (await query(`
    SELECT e.*, c.title AS competition_title
    FROM entries e
    JOIN competitions c ON c.id = e.competition_id
    WHERE e.id=$1 AND e.competition_id=$2 AND e.payment_status IN ('paid','free','paid_test','free_manual')
  `, [entryId, competitionId])).rows[0];
  if (!entry) return res.status(404).json({ error: 'Eligible winning entry not found' });
  const existing = await query('SELECT id FROM draw_results WHERE competition_id=$1 LIMIT 1', [competitionId]);
  if (existing.rowCount > 0) return res.status(400).json({ error: 'A final draw winner has already been recorded for this competition' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = (await client.query(`
      INSERT INTO draw_results (competition_id, entry_id, ticket_number, winner_name, winner_email, draw_method, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [competitionId, entryId, entry.ticket_number, entry.customer_name || 'Customer', entry.customer_email || '', 'wheel_of_names', notes, req.user.id])).rows[0];
    const winner = (await client.query(`
      INSERT INTO winners (competition_id, entry_id, winner_name, prize_title)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [competitionId, entryId, entry.customer_name || 'Customer', entry.competition_title])).rows[0];
    await client.query('UPDATE competitions SET status=$1, updated_at=NOW() WHERE id=$2', ['closed', competitionId]);
    await client.query('COMMIT');
    await audit(req.user, 'final_draw_recorded', `Winner ticket #${entry.ticket_number} recorded for ${entry.competition_title}`);
    res.json({ draw_result: result, winner });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(400).json({ error: err.message || 'Could not record draw result' });
  } finally {
    client.release();
  }
});

app.get('/admin/draw-results', auth('admin'), async (_req, res) => {
  const result = await query(`
    SELECT d.*, c.title AS competition_title
    FROM draw_results d
    JOIN competitions c ON c.id = d.competition_id
    ORDER BY d.created_at DESC
    LIMIT 200
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



app.get('/admin/instant-wins', auth('admin'), async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        iwp.id,
        iwp.competition_id,
        iwp.prize_title,
        COALESCE(iwp.prize_value_pence, 0) AS prize_value_pence,
        COALESCE(iwp.winning_ticket_number, 0) AS winning_ticket_number,
        COALESCE(iwp.status, 'available') AS status,
        COALESCE(iwp.active, TRUE) AS active,
        COALESCE(iwp.prize_image_url, '') AS prize_image_url,
        COALESCE(iwp.quantity_total, 1) AS quantity_total,
        COALESCE(iwp.winning_tickets, '') AS winning_tickets,
        COALESCE(iwp.sort_order, 0) AS sort_order,
        c.title AS competition_title
      FROM instant_win_prizes iwp
      LEFT JOIN competitions c ON c.id = iwp.competition_id
      ORDER BY iwp.id DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('admin instant wins list failed', err);
    res.status(500).json({ error: 'Instant wins could not be loaded', detail: err.message });
  }
});

app.post('/admin/instant-wins', auth('admin'), async (req, res) => {
  try {
    const competitionId = Number(req.body.competition_id);
    const prizeTitle = String(req.body.prize_title || '').trim();
    const prizeValuePence = Number(req.body.prize_value_pence || 0);
    const winningTicketNumber = Number(req.body.winning_ticket_number || 0);

    if (!competitionId) return res.status(400).json({ error: 'Choose a competition.' });
    if (!prizeTitle) return res.status(400).json({ error: 'Prize title is required.' });
    if (!winningTicketNumber || winningTicketNumber < 1) return res.status(400).json({ error: 'Winning ticket number is required.' });

    const comp = await pool.query('SELECT id, max_tickets FROM competitions WHERE id = $1', [competitionId]);
    if (comp.rowCount === 0) return res.status(404).json({ error: 'Competition not found.' });
    if (winningTicketNumber > Number(comp.rows[0].max_tickets || 0)) {
      return res.status(400).json({ error: 'Winning ticket is above this competition max tickets.' });
    }

    const existing = await pool.query(
      'SELECT id FROM instant_win_prizes WHERE competition_id = $1 AND winning_ticket_number = $2',
      [competitionId, winningTicketNumber]
    );
    if (existing.rowCount > 0) return res.status(409).json({ error: 'That winning ticket already has an instant prize.' });

    const { rows } = await pool.query(
      `INSERT INTO instant_win_prizes
        (competition_id, prize_title, prize_value_pence, winning_ticket_number, status, active, quantity_total, winning_tickets, sort_order)
       VALUES ($1, $2, $3, $4, 'available', TRUE, 1, $5, 0)
       RETURNING *`,
      [competitionId, prizeTitle, prizeValuePence, winningTicketNumber, String(winningTicketNumber)]
    );

    await pool.query(
      `INSERT INTO audit_logs (user_email, action, details)
       VALUES ($1, 'instant_win_created', $2)`,
      [req.user?.email || 'admin', `Added instant win "${prizeTitle}" on ticket #${winningTicketNumber}`]
    ).catch(() => {});

    res.json(rows[0]);
  } catch (err) {
    console.error('admin instant wins add failed', err);
    res.status(500).json({ error: 'Instant win could not be added', detail: err.message });
  }
});

app.delete('/admin/instant-wins/:id', auth('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid instant win id.' });
    await pool.query(`DELETE FROM instant_win_prizes WHERE id = $1 AND COALESCE(status, 'available') <> 'claimed'`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('admin instant wins delete failed', err);
    res.status(500).json({ error: 'Instant win could not be deleted', detail: err.message });
  }
});

initDb()
  .then(() => app.listen(port, () => console.log(`Prizetown API running on ${port} (v49 Arnold build fix)`)))
  .catch((err) => {
    console.error('Failed to start API', err);
    process.exit(1);
  });
