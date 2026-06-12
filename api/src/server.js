import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET || 'dev_secret_change_me';
const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
const publicSiteUrl = process.env.PUBLIC_SITE_URL || 'https://prizetown.co.uk';
const resendApiKey = process.env.RESEND_API_KEY || '';
const emailFrom = process.env.EMAIL_FROM || 'Prizetown <no-reply@prizetown.co.uk>';
const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@prizetown.co.uk';
const adminAlertEmail = process.env.ADMIN_ALERT_EMAIL || '';

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

function normalizeUkPostcode(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return { full: '', area: '', outcode: '' };
  const match = raw.match(/^([A-Z]{1,2})([0-9][0-9A-Z]?)([0-9][A-Z]{2})$/);
  if (!match) throw new Error('Enter a valid UK postcode, for example BB1 2AB');
  const area = match[1];
  const outcode = `${match[1]}${match[2]}`;
  const inward = match[3];
  return { full: `${outcode} ${inward}`, area, outcode };
}


function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function postcodeZoneRecommendation(population = 0, households = 0) {
  const pop = toInt(population);
  const homes = toInt(households);
  if (!pop && !homes) {
    return {
      band: 'unknown',
      suggested_max_tickets: 100,
      suggested_prize: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£10-ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£25 starter prize',
      guidance: 'Add estimated population or households to get a better recommendation.'
    };
  }

  const score = pop || homes * 2.3;

  if (score < 10000) {
    return {
      band: 'small',
      suggested_max_tickets: 100,
      suggested_prize: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£10-ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£50 starter prize',
      guidance: 'Small area: keep ticket limits low and build trust with simple local prizes.'
    };
  }

  if (score < 50000) {
    return {
      band: 'medium',
      suggested_max_tickets: 500,
      suggested_prize: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£25-ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£150 local prize',
      guidance: 'Medium area: good for regular local draws with modest prize growth.'
    };
  }

  if (score < 150000) {
    return {
      band: 'large',
      suggested_max_tickets: 1500,
      suggested_prize: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£100-ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£500 headline local prize',
      guidance: 'Large area: enough audience for bigger local campaigns and more ticket capacity.'
    };
  }

  return {
    band: 'regional',
    suggested_max_tickets: 3000,
    suggested_prize: 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£250-ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£1,000+ regional prize',
    guidance: 'Regional-size area: use stronger promotion, clear odds, and staged prize growth.'
  };
}


function parseCsvRows(text) {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(current);
      if (row.some(v => String(v || '').trim() !== '')) rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += ch;
  }

  row.push(current);
  if (row.some(v => String(v || '').trim() !== '')) rows.push(row);

  if (rows.length === 0) return [];
  const headers = rows.shift().map(h => String(h || '').trim().toLowerCase().replace(/^\ufeff/, ''));
  return rows.map(values => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = String(values[index] || '').trim();
    });
    return item;
  });
}

function boolFromCsv(value, fallback = true) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return ['true', 'yes', 'y', '1', 'active'].includes(v);
}

function cleanLaunchPriority(value) {
  const v = String(value || '').trim().toLowerCase();
  return ['low', 'normal', 'high'].includes(v) ? v : 'normal';
}

function competitionProfitPlan(input = {}) {
  const ticketPricePence = toInt(input.ticket_price_pence);
  const maxTickets = toInt(input.max_tickets);
  const prizeCostPence = toInt(input.prize_cost_pence);
  const marketingBudgetPence = toInt(input.marketing_budget_pence);
  const otherBufferPence = toInt(input.other_buffer_pence);
  const feePercent = Number(input.payment_fee_percent ?? 4);
  const cleanFeePercent = Number.isFinite(feePercent) ? Math.max(0, feePercent) : 4;
  const vatEnabled = input.vat_enabled === true || String(input.vat_enabled).toLowerCase() === 'true';

  const maxRevenuePence = ticketPricePence * maxTickets;
  const paymentFeesPence = Math.round(maxRevenuePence * (cleanFeePercent / 100));
  const vatPence = vatEnabled ? Math.round(maxRevenuePence / 6) : 0;
  const estimatedProfitPence = maxRevenuePence - prizeCostPence - paymentFeesPence - marketingBudgetPence - otherBufferPence - vatPence;
  const profitMarginPercent = maxRevenuePence > 0 ? (estimatedProfitPence / maxRevenuePence) * 100 : 0;
  const prizePercent = maxRevenuePence > 0 ? (prizeCostPence / maxRevenuePence) * 100 : 0;
  const targetProfitPence = Math.round(maxRevenuePence * 0.25);

  let status = 'unknown';
  let warning = 'Add ticket price and max tickets to calculate profit.';
  if (maxRevenuePence > 0) {
    if (estimatedProfitPence < 0) {
      status = 'loss';
      warning = 'Loss-making: costs are higher than maximum ticket revenue.';
    } else if (profitMarginPercent < 15) {
      status = 'risky';
      warning = 'Risky: profit margin is below 15%. Reduce prize/costs or raise ticket cap/price.';
    } else if (profitMarginPercent < 25) {
      status = 'caution';
      warning = 'Caution: margin is below the built-in 25% target.';
    } else {
      status = 'good';
      warning = 'Good: estimated margin meets the 25% minimum target.';
    }
  }

  return {
    target_margin_percent: 25,
    max_revenue_pence: maxRevenuePence,
    prize_percent: Number(prizePercent.toFixed(1)),
    payment_fees_pence: paymentFeesPence,
    vat_pence: vatPence,
    estimated_profit_pence: estimatedProfitPence,
    profit_margin_percent: Number(profitMarginPercent.toFixed(1)),
    target_profit_pence: targetProfitPence,
    status,
    warning
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


    CREATE TABLE IF NOT EXISTS postcode_zones (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'outcode',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      estimated_population INTEGER NOT NULL DEFAULT 0,
      estimated_households INTEGER NOT NULL DEFAULT 0,
      launch_priority TEXT NOT NULL DEFAULT 'normal',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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


    CREATE TABLE IF NOT EXISTS competition_postcode_zones (
      competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
      zone_id INTEGER NOT NULL REFERENCES postcode_zones(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (competition_id, zone_id)
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

    CREATE TABLE IF NOT EXISTS email_logs (
      id SERIAL PRIMARY KEY,
      event TEXT NOT NULL DEFAULT '',
      recipient TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'resend',
      provider_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT NOT NULL DEFAULT '',
      related_type TEXT NOT NULL DEFAULT '',
      related_id INTEGER,
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
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS postcode_mode TEXT NOT NULL DEFAULT 'all';
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS prize_cost_pence INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS marketing_budget_pence INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS other_buffer_pence INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS payment_fee_percent NUMERIC NOT NULL DEFAULT 4;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS vat_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS auto_draw_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS draw_auto_started_at TIMESTAMPTZ;

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
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS postcode_mode TEXT NOT NULL DEFAULT 'all';
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS prize_cost_pence INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS marketing_budget_pence INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS other_buffer_pence INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS payment_fee_percent NUMERIC NOT NULL DEFAULT 4;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS vat_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS auto_draw_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS draw_auto_started_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_entries_user_id ON entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_entries_order_id ON entries(order_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS postcode_full TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS postcode_area TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS postcode_outcode TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_users_postcode_area ON users(postcode_area);
    CREATE INDEX IF NOT EXISTS idx_users_postcode_outcode ON users(postcode_outcode);
    ALTER TABLE postcode_zones ADD COLUMN IF NOT EXISTS estimated_population INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE postcode_zones ADD COLUMN IF NOT EXISTS estimated_households INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE postcode_zones ADD COLUMN IF NOT EXISTS launch_priority TEXT NOT NULL DEFAULT 'normal';
    CREATE INDEX IF NOT EXISTS idx_postcode_zones_active ON postcode_zones(active);
    CREATE INDEX IF NOT EXISTS idx_competition_postcode_zones_zone ON competition_postcode_zones(zone_id);
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

app.get('/health', (_req, res) => res.json({ ok: true, app: 'Prizetown API', version: 'v210' }));
app.get('/admin/system-check', auth('admin'), async (_req, res) => {
  const checks = [];
  const warnings = [];
  const errors = [];

  function add(status, title, detail, meta = {}) {
    const row = { status, title, detail, meta };
    checks.push(row);
    if (status === 'warning') warnings.push(row);
    if (status === 'error') errors.push(row);
  }

  try {
    const dbPing = await pool.query('SELECT NOW() AS now');
    add('ok', 'Database connection', `Database responded at ${dbPing.rows?.[0]?.now || 'now'}.`);
  } catch (err) {
    add('error', 'Database connection', err.message);
  }

  try {
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const testFile = path.join(uploadDir, `.prizetown-health-${Date.now()}.tmp`);
    await fs.promises.writeFile(testFile, 'ok');
    await fs.promises.unlink(testFile);
    add('ok', 'Uploads folder', `Uploads folder is writable: ${uploadDir}`);
  } catch (err) {
    add('error', 'Uploads folder', `Uploads folder is not writable: ${err.message}`);
  }

  async function countTable(table, label) {
    try {
      const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      add('ok', label, `${result.rows[0].count} records found.`, { count: result.rows[0].count });
      return result.rows[0].count;
    } catch (err) {
      add('warning', label, `Could not count ${table}: ${err.message}`);
      return 0;
    }
  }

  const competitionCount = await countTable('competitions', 'Competitions');
  const orderCount = await countTable('orders', 'Orders');
  const entryCount = await countTable('entries', 'Entries');
  const winnerCount = await countTable('winners', 'Winners');

  try {
    const open = await pool.query("SELECT COUNT(*)::int AS count FROM competitions WHERE COALESCE(status, '') NOT IN ('closed', 'archived')");
    add(open.rows[0].count > 0 ? 'ok' : 'warning', 'Open competitions', `${open.rows[0].count} open/live competitions found.`, { count: open.rows[0].count });
  } catch (err) {
    add('warning', 'Open competitions', err.message);
  }

  try {
    const missingDraw = await pool.query("SELECT COUNT(*)::int AS count FROM competitions WHERE draw_at IS NULL");
    add(missingDraw.rows[0].count === 0 ? 'ok' : 'warning', 'Draw dates', `${missingDraw.rows[0].count} competitions are missing a draw date/time.`, { count: missingDraw.rows[0].count });
  } catch (err) {
    add('warning', 'Draw dates', err.message);
  }

  try {
    const settings = await pool.query("SELECT key, value FROM settings WHERE key IN ('terms_text','privacy_text','free_entry_global','cookie_notice_text','legal_disclaimer_text','site_name')");
    const keys = new Set(settings.rows.map(r => r.key));
    ['terms_text','privacy_text','free_entry_global','cookie_notice_text','legal_disclaimer_text'].forEach(key => {
      add(keys.has(key) ? 'ok' : 'warning', `Legal setting: ${key}`, keys.has(key) ? 'Present.' : 'Missing or not saved yet.');
    });
  } catch (err) {
    add('warning', 'Legal/settings text', err.message);
  }

  try {
    const state = await pool.query("SELECT value FROM settings WHERE key = 'draw_broadcast_state' LIMIT 1");
    if (state.rows.length) {
      let parsed = {};
      try { parsed = JSON.parse(state.rows[0].value || '{}'); } catch {}
      add('ok', 'Live draw broadcast state', `Broadcast state is reachable. Current mode: ${parsed.mode || 'unknown'}.`, { mode: parsed.mode || 'unknown' });
    } else {
      add('warning', 'Live draw broadcast state', 'No broadcast state has been saved yet. Open the Live Draw Window or send a test.');
    }
  } catch (err) {
    add('warning', 'Live draw broadcast state', err.message);
  }



  const jwtSecretConfigured = !!process.env.JWT_SECRET && process.env.JWT_SECRET !== 'dev_secret_change_me' && String(process.env.JWT_SECRET).length >= 32;
  add(jwtSecretConfigured ? 'ok' : 'warning', 'Security: JWT secret', jwtSecretConfigured ? 'JWT_SECRET is configured and not using the development fallback.' : 'JWT_SECRET is missing, too short or using the development fallback. Set a long random secret before public launch.');

  add('warning', 'Security: CORS policy', 'API currently uses open CORS. Before public launch, lock CORS to prizetown.co.uk and trusted admin origins only.');

  add('warning', 'Security: rate limiting', 'Rate limiting is not yet confirmed for login, checkout, free-entry, uploads and admin actions. Add limits before larger public traffic.');

  add('warning', 'Security: upload hardening', 'Uploads are writable, but file-size/type/MIME/SVG-script checks should be hardened before public launch.');

  add('warning', 'Security: admin access', 'Keep admin access behind Tailscale/Cloudflare rules and keep public /admin blocked.');

  add('warning', 'Security: backups and restore', 'Confirm daily database backups and test a restore before taking real payments.');

  add('warning', 'Backup: TrueNAS snapshot', 'Confirm a local TrueNAS snapshot or dataset backup exists for the Prizetown app, database and uploads paths.');

  add('warning', 'Backup: PostgreSQL dump', 'Confirm a scheduled pg_dump exists for the Prizetown database and is stored outside the live database volume.');

  add('warning', 'Backup: uploads folder', 'Confirm the uploads volume is included in backups so prize images and uploaded files can be restored.');

  add('warning', 'Backup: Google Drive off-site copy', 'Confirm database dumps, uploads backup and release notes are copied to Google Drive or another off-site location.');

  add('warning', 'Backup: restore test', 'Complete a restore test to a safe temporary location before trusting backups for public launch or real payments.');

  add('warning', 'Payment: webhook hardening', 'Live payment webhooks/idempotency are not connected yet. Do not allocate paid tickets from frontend-only payment state.');

  add('ok', 'API version', 'Prizetown API is running.', { version: 'v210' });
  add('ok', 'Configured public API URL', process.env.PUBLIC_API_URL || 'Not set.');
  add(resendApiKey ? 'ok' : 'warning', 'Transactional email', resendApiKey ? `Configured from ${emailFrom} with reply-to ${emailReplyTo}.` : 'RESEND_API_KEY is not configured yet.');
  add('ok', 'Configured upload directory', uploadDir);

  const summaryParts = [];
  if (errors.length === 0 && warnings.length === 0) {
    summaryParts.push('Prizetown looks healthy. The API, database and uploads checks passed, and no warnings were found.');
  } else {
    summaryParts.push(`Prizetown system check completed with ${errors.length} error(s) and ${warnings.length} warning(s).`);
    if (errors.length) summaryParts.push(`Fix first: ${errors.map(e => e.title).join(', ')}.`);
    if (warnings.length) summaryParts.push(`Review next: ${warnings.slice(0, 5).map(w => w.title).join(', ')}.`);
  }

  res.json({
    ok: errors.length === 0,
    generated_at: new Date().toISOString(),
    app: 'Prizetown',
    version: 'v210',
    totals: {
      competitions: competitionCount,
      orders: orderCount,
      entries: entryCount,
      winners: winnerCount,
      warnings: warnings.length,
      errors: errors.length
    },
    summary: summaryParts.join(' '),
    checks
  });
});



async function getSettingsObject() {
  const result = await query('SELECT key, value FROM site_settings ORDER BY key');
  return Object.fromEntries(result.rows.map(row => [row.key, row.value]));
}

const allowedSettings = [
  'site_name',
  'support_email',
  'email_from',
  'email_reply_to',
  'logo_url',
  'favicon_url',
  'brand_primary_color',
  'brand_accent_color',
  'brand_background_color',
  'brand_button_text_color',
  'brand_footer_credit',
  'brand_footer_link_url',
  'brand_footer_link_label',
  'hero_eyebrow',
  'hero_title',
  'hero_text',
  'footer_text',
  'social_facebook_url',
  'social_instagram_url',
  'social_tiktok_url',
  'social_x_url',
  'social_youtube_url',
  'youtube_live_url', 'spinner_style',
  'welcome_marquee_text',
  'free_entry_global',
  'terms_text',
  'privacy_text',
  'cookie_text',
  'refund_text',
  'winner_publication_text',
  'responsible_play_text',
  'age_confirmation_text',
  'promoter_text',
  'postal_entry_address',
  'cookie_banner_text',
  'legal_disclaimer_text',
  'popup_terms_label',
  'module_postcodes_enabled',
  'module_instant_wins_enabled',
  'module_live_draw_enabled',
  'module_arnold_enabled',
  'module_wheel_demo_enabled',
  'module_profit_planner_enabled',
  'module_cookie_legal_enabled'
];


async function sendTransactionalEmail({ to, subject, text, html, event = 'transactional_email', relatedType = null, relatedId = null }) {
  const recipient = normalizeEmail(to);
  const safeSubject = String(subject || '').trim();

  if (!recipient) return { ok: false, error: 'Recipient email is required' };
  if (!safeSubject) return { ok: false, error: 'Email subject is required' };
  if (!resendApiKey) return { ok: false, error: 'RESEND_API_KEY is not configured' };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [recipient],
        reply_to: emailReplyTo,
        subject: safeSubject,
        text: text || '',
        html: html || undefined
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = data?.message || data?.error || `Resend returned ${response.status}`;
      await query(
        `INSERT INTO email_logs (event, recipient, subject, status, error, related_type, related_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [event, recipient, safeSubject, 'failed', String(error), relatedType, relatedId]
      ).catch(() => {});
      return { ok: false, error, provider: 'resend', status: response.status, data };
    }

    await query(
      `INSERT INTO email_logs (event, recipient, subject, status, error, related_type, related_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [event, recipient, safeSubject, 'sent', '', relatedType, relatedId]
    ).catch(() => {});

    return { ok: true, provider: 'resend', id: data?.id || null };
  } catch (err) {
    const error = err?.message || 'Email send failed';
    await query(
      `INSERT INTO email_logs (event, recipient, subject, status, error, related_type, related_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [event, recipient, safeSubject, 'failed', String(error), relatedType, relatedId]
    ).catch(() => {});
    return { ok: false, error };
  }
}

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

app.get('/admin/email/status', auth('admin'), async (_req, res) => {
  const recent = await query(`
    SELECT id, event, recipient, subject, status, error, related_type, related_id, created_at
    FROM email_logs
    ORDER BY created_at DESC
    LIMIT 25
  `).catch(() => ({ rows: [] }));
  res.json({
    configured: !!resendApiKey,
    provider: 'resend',
    from: emailFrom,
    reply_to: emailReplyTo,
    public_site_url: publicSiteUrl,
    recent: recent.rows
  });
});


function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTicketList(entries = []) {
  return entries.map(e => {
    const title = e.competition_title || e.title || 'Competition';
    return `Ticket #${e.ticket_number} - ${title}`;
  }).join('\n');
}

function formatTicketListHtml(entries = []) {
  return entries.map(e => {
    const title = escapeHtml(e.competition_title || e.title || 'Competition');
    return `<li><strong>Ticket #${escapeHtml(e.ticket_number)}</strong> - ${title}</li>`;
  }).join('');
}

async function sendOrderConfirmationEmail({ user, order, entries = [] }) {
  if (!user?.email) return { ok: false, error: 'Customer email missing' };

  const orderId = order?.id || '';
  const total = typeof order?.total_pence === 'number' ? `ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£${(order.total_pence / 100).toFixed(2)}` : 'your order total';
  const ticketText = formatTicketList(entries);
  const ticketHtml = formatTicketListHtml(entries);

  return sendTransactionalEmail({
    to: user.email,
    subject: `Prizetown order confirmation #${orderId}`,
    text: `Thanks for entering Prizetown.

Order: #${orderId}
Total: ${total}

Your tickets:
${ticketText}

We will contact winners using the details on their account. Good luck!

Prizetown
${publicSiteUrl}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
      <h1>Thanks for entering Prizetown</h1>
      <p>Your order has been received.</p>
      <p><strong>Order:</strong> #${escapeHtml(orderId)}<br><strong>Total:</strong> ${escapeHtml(total)}</p>
      <h2>Your tickets</h2>
      <ul>${ticketHtml}</ul>
      <p>We will contact winners using the details on their account. Good luck!</p>
      <p><a href="${escapeHtml(publicSiteUrl)}">Visit Prizetown</a></p>
    </div>`,
    event: 'order_confirmation',
    relatedType: 'order',
    relatedId: order?.id || null
  });
}

async function sendFreeEntryConfirmationEmail({ user, competition, entry, instantWins = [] }) {
  if (!user?.email) return { ok: false, error: 'Customer email missing' };

  const compTitle = competition?.title || entry?.competition_title || 'Competition';
  const ticketNumber = entry?.ticket_number || '';
  const instantText = instantWins?.length ? `\nInstant win result: ${instantWins.map(w => w.prize_title || 'Instant win').join(', ')}` : '';

  return sendTransactionalEmail({
    to: user.email,
    subject: `Prizetown free entry confirmation - Ticket #${ticketNumber}`,
    text: `Your free entry has been recorded.

Competition: ${compTitle}
Ticket: #${ticketNumber}${instantText}

Good luck!

Prizetown
${publicSiteUrl}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;">
      <h1>Your free entry has been recorded</h1>
      <p><strong>Competition:</strong> ${escapeHtml(compTitle)}<br><strong>Ticket:</strong> #${escapeHtml(ticketNumber)}</p>
      ${instantWins?.length ? `<p><strong>Instant win result:</strong> ${escapeHtml(instantWins.map(w => w.prize_title || 'Instant win').join(', '))}</p>` : ''}
      <p>Good luck!</p>
      <p><a href="${escapeHtml(publicSiteUrl)}">Visit Prizetown</a></p>
    </div>`,
    event: 'free_entry_confirmation',
    relatedType: 'entry',
    relatedId: entry?.id || null
  });
}

app.post('/admin/email/test', auth('admin'), async (req, res) => {
  const to = normalizeEmail(req.body?.to || req.user?.email || '');
  if (!to) return res.status(400).json({ error: 'Test recipient email is required' });
  const result = await sendTransactionalEmail({
    to,
    subject: 'Prizetown test email',
    text: 'This is a Prizetown transactional email test. If you received this, Resend is working.',
    html: '<div style="font-family:Arial,sans-serif;line-height:1.5;"><h1>Prizetown test email</h1><p>If you received this, Resend is working.</p></div>',
    event: 'admin_test_email',
    relatedType: 'admin',
    relatedId: req.user?.id || null
  });
  if (!result.ok) return res.status(400).json({ error: result.error || 'Test email failed', result });
  res.json({ ok: true, result });
});

app.post('/auth/register', async (req, res) => {
  const { name = '', email, password, postcode = '' } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const siteSettings = await getSettingsObject();
  const postcodeRequired = String(siteSettings.module_postcodes_enabled ?? 'true') !== 'false';
  if (postcodeRequired && !postcode) return res.status(400).json({ error: 'Postcode required so we can show local competitions' });

  let pc = { full: '', area: '', outcode: '' };
  try {
    if (postcode) pc = normalizeUkPostcode(postcode);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, postcode_full, postcode_area, postcode_outcode)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, role, postcode_full, postcode_area, postcode_outcode`,
      [name, normalizeEmail(email), hash, 'customer', pc.full, pc.area, pc.outcode]
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
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, postcode_full: user.postcode_full || '', postcode_area: user.postcode_area || '', postcode_outcode: user.postcode_outcode || '' }, token: signToken(user) });
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
  show_arnold: true,
  updated_at: new Date().toISOString()
};

function trustedBroadcastTime() {
  return {
    server_now: new Date().toISOString(),
    server_time_zone: 'Europe/London',
    time_source: 'Prizetown server'
  };
}

function broadcastStateWithTrustedTime() {
  return {
    ...drawBroadcastState,
    ...trustedBroadcastTime()
  };
}

app.get('/draw/broadcast-state', async (_req, res) => {
  await runDueAutoDraws();
  res.json(broadcastStateWithTrustedTime());
});

app.post('/admin/draw/broadcast-state', auth('admin'), (req, res) => {
  try {
    const body = req.body || {};
    drawBroadcastState = {
      ...drawBroadcastState,
      ...body,
      visual_tickets: Array.isArray(body.visual_tickets) ? body.visual_tickets.slice(0, 150) : [],
      winner: body.winner || null,
      show_arnold: body.show_arnold !== false,
      updated_at: new Date().toISOString()
    };
    res.json(broadcastStateWithTrustedTime());
  } catch (err) {
    console.error('Broadcast state update failed', err);
    res.status(400).json({ error: err.message || 'Broadcast state update failed' });
  }
});

app.post('/admin/draw/run-due-auto', auth('admin'), async (_req, res) => {
  const completed = await runDueAutoDraws();
  res.json({ ok: true, completed });
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
    show_arnold: true,
    updated_at: new Date().toISOString()
  };
  res.json(broadcastStateWithTrustedTime());
});


function publicWinnerName(name = '') {
  const cleaned = String(name || '').trim();
  if (!cleaned) return 'Customer';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0] || ''}`.trim();
}

async function recordFinalDrawWinner(client, { competitionId, entry, createdBy = null, method = 'auto_scheduled', notes = '' }) {
  const existing = await client.query('SELECT id FROM draw_results WHERE competition_id=$1 LIMIT 1', [competitionId]);
  if (existing.rowCount > 0) return null;

  const result = (await client.query(`
    INSERT INTO draw_results (competition_id, entry_id, ticket_number, winner_name, winner_email, draw_method, notes, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
  `, [competitionId, entry.id, entry.ticket_number, entry.customer_name || 'Customer', entry.customer_email || '', method, notes, createdBy])).rows[0];

  const winner = (await client.query(`
    INSERT INTO winners (competition_id, entry_id, winner_name, prize_title)
    VALUES ($1,$2,$3,$4) RETURNING *
  `, [competitionId, entry.id, publicWinnerName(entry.customer_name || 'Customer'), entry.competition_title])).rows[0];

  await client.query('UPDATE competitions SET status=$1, draw_auto_started_at=COALESCE(draw_auto_started_at, NOW()), updated_at=NOW() WHERE id=$2', ['closed', competitionId]);

  return { draw_result: result, winner };
}

async function runDueAutoDraws() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const due = await client.query(`
      SELECT c.*,
             COUNT(e.id)::int AS eligible_count
      FROM competitions c
      LEFT JOIN entries e ON e.competition_id = c.id AND e.payment_status IN ('paid','free','paid_test','free_manual')
      LEFT JOIN draw_results d ON d.competition_id = c.id
      WHERE c.auto_draw_enabled = TRUE
        AND c.draw_at IS NOT NULL
        AND c.draw_at <= NOW()
        AND d.id IS NULL
        AND c.status IN ('active','sold_out','closed')
      GROUP BY c.id
      HAVING COUNT(e.id) > 0
      ORDER BY c.draw_at ASC
      LIMIT 3
    `);

    const completed = [];

    for (const comp of due.rows) {
      const eligibleCount = Number(comp.eligible_count || 0);
      const soldOut = eligibleCount >= Number(comp.max_tickets || 0);
      const closedByDate = comp.closes_at && new Date(comp.closes_at).getTime() <= Date.now();
      if (!soldOut && !closedByDate) continue;

      const eligibleEntries = (await client.query(`
        SELECT e.*, c.title AS competition_title
        FROM entries e
        JOIN competitions c ON c.id = e.competition_id
        WHERE e.competition_id=$1 AND e.payment_status IN ('paid','free','paid_test','free_manual')
        ORDER BY e.ticket_number ASC
      `, [comp.id])).rows;
      if (eligibleEntries.length === 0) continue;
      const entry = eligibleEntries[crypto.randomInt(0, eligibleEntries.length)];

      const saved = await recordFinalDrawWinner(client, {
        competitionId: comp.id,
        entry,
        method: 'auto_scheduled_secure_crypto',
        notes: 'Automatic scheduled draw'
      });
      if (!saved) continue;

      drawBroadcastState = {
        mode: 'winner',
        competition_id: comp.id,
        competition_title: comp.title,
        competition_number: `#${comp.id}`,
        draw_date: comp.draw_at || '',
        ticket_capacity: Number(comp.max_tickets || 0),
        eligible_count: eligibleCount,
        visual_tickets: [],
        winner: {
          ticket_number: entry.ticket_number,
          customer_name: publicWinnerName(entry.customer_name || 'Customer'),
          email: entry.customer_email || ''
        },
        show_arnold: drawBroadcastState.show_arnold !== false,
        updated_at: new Date().toISOString()
      };

      completed.push({ competition_id: comp.id, title: comp.title, ticket_number: entry.ticket_number, winner_name: publicWinnerName(entry.customer_name || 'Customer') });
    }

    await client.query('COMMIT');
    return completed;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Auto draw failed', err);
    return [];
  } finally {
    client.release();
  }
}

setInterval(() => {
  runDueAutoDraws().catch(err => console.error('Scheduled auto draw interval failed', err));
}, 30000);


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



app.post('/admin/profit-planner', auth('admin'), async (req, res) => {
  res.json(competitionProfitPlan(req.body || {}));
});

app.get('/admin/postcode-zones', auth('admin'), async (_req, res) => {
  const result = await query('SELECT * FROM postcode_zones ORDER BY active DESC, launch_priority DESC, type ASC, code ASC');
  res.json(result.rows.map(row => ({
    ...row,
    recommendation: postcodeZoneRecommendation(row.estimated_population, row.estimated_households)
  })));
});

app.post('/admin/postcode-zones', auth('admin'), async (req, res) => {
  try {
    const input = String(req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!input) return res.status(400).json({ error: 'Postcode area or outcode required' });

    let code = input;
    let type = 'area';

    if (/^[A-Z]{1,2}[0-9][0-9A-Z]?$/.test(input)) {
      type = 'outcode';
    } else if (/^[A-Z]{1,2}$/.test(input)) {
      type = 'area';
    } else {
      const pc = normalizeUkPostcode(input);
      code = pc.outcode;
      type = 'outcode';
    }

    const label = String(req.body.label || '').trim();
    const notes = String(req.body.notes || '').trim();
    const estimatedPopulation = toInt(req.body.estimated_population);
    const estimatedHouseholds = toInt(req.body.estimated_households);
    const launchPriority = ['low', 'normal', 'high'].includes(String(req.body.launch_priority || '').toLowerCase()) ? String(req.body.launch_priority).toLowerCase() : 'normal';

    const result = await query(`
      INSERT INTO postcode_zones (code, label, type, active, estimated_population, estimated_households, launch_priority, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (code) DO UPDATE SET
        label=EXCLUDED.label,
        type=EXCLUDED.type,
        active=EXCLUDED.active,
        estimated_population=EXCLUDED.estimated_population,
        estimated_households=EXCLUDED.estimated_households,
        launch_priority=EXCLUDED.launch_priority,
        notes=EXCLUDED.notes,
        updated_at=NOW()
      RETURNING *
    `, [code, label, type, req.body.active !== false, estimatedPopulation, estimatedHouseholds, launchPriority, notes]);

    await audit(req.user, 'postcode_zone_saved', `Saved postcode zone ${code}`);
    const row = result.rows[0];
    res.json({ ...row, recommendation: postcodeZoneRecommendation(row.estimated_population, row.estimated_households) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save postcode zone' });
  }
});

app.patch('/admin/postcode-zones/:id', auth('admin'), async (req, res) => {
  const launchPriority = ['low', 'normal', 'high'].includes(String(req.body.launch_priority || '').toLowerCase()) ? String(req.body.launch_priority).toLowerCase() : 'normal';
  const result = await query(`
    UPDATE postcode_zones SET
      label=$1,
      active=$2,
      estimated_population=$3,
      estimated_households=$4,
      launch_priority=$5,
      notes=$6,
      updated_at=NOW()
    WHERE id=$7
    RETURNING *
  `, [String(req.body.label || '').trim(), req.body.active !== false, toInt(req.body.estimated_population), toInt(req.body.estimated_households), launchPriority, String(req.body.notes || '').trim(), req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Postcode zone not found' });
  await audit(req.user, 'postcode_zone_updated', `Updated postcode zone ${result.rows[0].code}`);
  const row = result.rows[0];
  res.json({ ...row, recommendation: postcodeZoneRecommendation(row.estimated_population, row.estimated_households) });
});

app.delete('/admin/postcode-zones/:id', auth('admin'), async (req, res) => {
  await query('DELETE FROM postcode_zones WHERE id=$1', [req.params.id]);
  await audit(req.user, 'postcode_zone_deleted', `Deleted postcode zone ${req.params.id}`);
  res.json({ ok: true });
});



app.post('/admin/postcode-zones/import-csv', auth('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'CSV file required' });
    const text = fs.readFileSync(req.file.path, 'utf8');
    const rows = parseCsvRows(text);
    if (rows.length === 0) return res.status(400).json({ error: 'CSV is empty' });

    const imported = [];
    const skipped = [];

    for (const row of rows) {
      try {
        const input = String(row.code || row.postcode || row.outcode || row.area || '').trim().toUpperCase().replace(/\s+/g, '');
        if (!input) {
          skipped.push({ row, reason: 'Missing code' });
          continue;
        }

        let code = input;
        let type = String(row.type || '').trim().toLowerCase();

        if (/^[A-Z]{1,2}[0-9][0-9A-Z]?$/.test(input)) {
          type = 'outcode';
        } else if (/^[A-Z]{1,2}$/.test(input)) {
          type = 'area';
        } else {
          const pc = normalizeUkPostcode(input);
          code = pc.outcode;
          type = 'outcode';
        }

        const label = String(row.label || row.name || '').trim();
        const active = boolFromCsv(row.active, true);
        const estimatedPopulation = toInt(row.estimated_population || row.population || row.residents);
        const estimatedHouseholds = toInt(row.estimated_households || row.households);
        const launchPriority = cleanLaunchPriority(row.launch_priority || row.priority);
        const notes = String(row.notes || '').trim();

        const result = await query(`
          INSERT INTO postcode_zones (code, label, type, active, estimated_population, estimated_households, launch_priority, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (code) DO UPDATE SET
            label=EXCLUDED.label,
            type=EXCLUDED.type,
            active=EXCLUDED.active,
            estimated_population=EXCLUDED.estimated_population,
            estimated_households=EXCLUDED.estimated_households,
            launch_priority=EXCLUDED.launch_priority,
            notes=EXCLUDED.notes,
            updated_at=NOW()
          RETURNING *
        `, [code, label, type, active, estimatedPopulation, estimatedHouseholds, launchPriority, notes]);

        imported.push(result.rows[0]);
      } catch (err) {
        skipped.push({ code: row.code || '', reason: err.message || 'Could not import row' });
      }
    }

    await audit(req.user, 'postcode_zones_csv_imported', `Imported ${imported.length} postcode zones, skipped ${skipped.length}`);
    res.json({
      ok: true,
      imported: imported.length,
      skipped: skipped.length,
      skipped_rows: skipped.slice(0, 20),
      rows: imported.map(row => ({ ...row, recommendation: postcodeZoneRecommendation(row.estimated_population, row.estimated_households) }))
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not import postcode CSV' });
  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
});

app.get('/admin/competition-postcode-assignments', auth('admin'), async (_req, res) => {
  const result = await query(`
    SELECT c.id AS competition_id, c.title AS competition_title, COALESCE(c.postcode_mode, 'all') AS postcode_mode,
           COALESCE(json_agg(json_build_object('id', z.id, 'code', z.code, 'label', z.label, 'type', z.type) ORDER BY z.code) FILTER (WHERE z.id IS NOT NULL), '[]') AS zones
    FROM competitions c
    LEFT JOIN competition_postcode_zones cpz ON cpz.competition_id = c.id
    LEFT JOIN postcode_zones z ON z.id = cpz.zone_id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `);
  res.json(result.rows);
});

async function saveCompetitionPostcodeAssignment({ competitionId, mode, zoneIds }) {
  const cleanMode = mode === 'selected' ? 'selected' : 'all';
  await query('UPDATE competitions SET postcode_mode=$1, updated_at=NOW() WHERE id=$2', [cleanMode, competitionId]);
  await query('DELETE FROM competition_postcode_zones WHERE competition_id=$1', [competitionId]);

  if (cleanMode === 'selected') {
    const ids = Array.isArray(zoneIds) ? zoneIds.map(v => toInt(v)).filter(Boolean) : [];
    for (const zoneId of [...new Set(ids)]) {
      await query(`
        INSERT INTO competition_postcode_zones (competition_id, zone_id)
        VALUES ($1,$2)
        ON CONFLICT DO NOTHING
      `, [competitionId, zoneId]);
    }
  }
}

app.patch('/admin/competitions/:id/postcode-zones', auth('admin'), async (req, res) => {
  const competitionId = toInt(req.params.id);
  const exists = await query('SELECT id, title FROM competitions WHERE id=$1', [competitionId]);
  if (!exists.rows[0]) return res.status(404).json({ error: 'Competition not found' });

  await saveCompetitionPostcodeAssignment({
    competitionId,
    mode: req.body.mode,
    zoneIds: req.body.zone_ids || []
  });

  await audit(req.user, 'competition_postcode_assignment_updated', `Updated postcode assignment for ${exists.rows[0].title}`);
  res.json({ ok: true });
});

app.post('/admin/competition-postcode-bulk', auth('admin'), async (req, res) => {
  const competitionIds = Array.isArray(req.body.competition_ids) ? req.body.competition_ids.map(v => toInt(v)).filter(Boolean) : [];
  if (competitionIds.length === 0) return res.status(400).json({ error: 'Choose at least one competition' });

  for (const competitionId of [...new Set(competitionIds)]) {
    await saveCompetitionPostcodeAssignment({
      competitionId,
      mode: req.body.mode,
      zoneIds: req.body.zone_ids || []
    });
  }

  await audit(req.user, 'competition_postcode_bulk_updated', `Updated postcode assignment for ${competitionIds.length} competitions`);
  res.json({ ok: true, updated: competitionIds.length });
});

app.post('/admin/upload', auth('admin'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.post('/admin/competitions', auth('admin'), async (req, res) => {
  const c = req.body;
  const result = await query(`
    INSERT INTO competitions
    (title, slug, description, question, answer, free_entry_text, rules_text, closes_at, min_age, age_restricted, ticket_price_pence, max_tickets, max_per_user, draw_at, status, image_url, prize_summary, ticket_presets, max_per_order, category, postcode_mode, prize_cost_pence, marketing_budget_pence, other_buffer_pence, payment_fee_percent, vat_enabled, auto_draw_enabled)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
    RETURNING *
  `, [c.title, c.slug, c.description || '', c.question || '', c.answer || '', c.free_entry_text || '', c.rules_text || '', c.closes_at || null, toInt(c.min_age, 18), c.age_restricted !== false, toInt(c.ticket_price_pence), toInt(c.max_tickets, 100), toInt(c.max_per_user, 10), c.draw_at || null, c.status || 'draft', c.image_url || '', c.prize_summary || '', c.ticket_presets || '10,20,50,100,250,500,1000,2500', toInt(c.max_per_order, 2500), c.category || 'Instant Wins', c.postcode_mode === 'selected' ? 'selected' : 'all', toInt(c.prize_cost_pence), toInt(c.marketing_budget_pence), toInt(c.other_buffer_pence), Number(c.payment_fee_percent ?? 4), c.vat_enabled === true, c.auto_draw_enabled === true]);
  await audit(req.user, 'competition_created', `Created competition ${result.rows[0].title}`);
  res.json(result.rows[0]);
});

app.patch('/admin/competitions/:id', auth('admin'), async (req, res) => {
  const c = req.body;
  const result = await query(`
    UPDATE competitions SET
      title=$1, slug=$2, description=$3, question=$4, answer=$5, free_entry_text=$6, rules_text=$7,
      closes_at=$8, min_age=$9, age_restricted=$10, ticket_price_pence=$11, max_tickets=$12, max_per_user=$13, draw_at=$14, status=$15, image_url=$16,
      prize_summary=$17, ticket_presets=$18, max_per_order=$19, category=$20, postcode_mode=$21,
      prize_cost_pence=$22, marketing_budget_pence=$23, other_buffer_pence=$24, payment_fee_percent=$25, vat_enabled=$26, auto_draw_enabled=$27,
      updated_at=NOW()
    WHERE id=$28 RETURNING *
  `, [c.title, c.slug, c.description || '', c.question || '', c.answer || '', c.free_entry_text || '', c.rules_text || '', c.closes_at || null, toInt(c.min_age, 18), c.age_restricted !== false, toInt(c.ticket_price_pence), toInt(c.max_tickets, 100), toInt(c.max_per_user, 10), c.draw_at || null, c.status || 'draft', c.image_url || '', c.prize_summary || '', c.ticket_presets || '10,20,50,100,250,500,1000,2500', toInt(c.max_per_order, 2500), c.category || 'Instant Wins', c.postcode_mode === 'selected' ? 'selected' : 'all', toInt(c.prize_cost_pence), toInt(c.marketing_budget_pence), toInt(c.other_buffer_pence), Number(c.payment_fee_percent ?? 4), c.vat_enabled === true, c.auto_draw_enabled === true, req.params.id]);
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
  const available = [];
  for (let n = 1; n <= Number(competition.max_tickets || 0); n += 1) {
    if (!usedSet.has(n)) available.push(n);
  }
  if (available.length < quantity) throw new Error('Not enough tickets remaining');

  const chosen = [];
  for (let i = 0; i < quantity; i += 1) {
    const pickIndex = crypto.randomInt(0, available.length);
    const [ticketNumber] = available.splice(pickIndex, 1);
    chosen.push(ticketNumber);
  }

  const entries = [];
  for (const ticketNumber of chosen) {
    const inserted = await client.query(`
      INSERT INTO entries (competition_id,user_id,order_id,customer_name,customer_email,ticket_number,payment_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [competition.id, user?.id || null, orderId, user?.name || '', user?.email || '', ticketNumber, paymentStatus]);
    entries.push(inserted.rows[0]);
  }
  return entries.sort((a, b) => Number(a.ticket_number) - Number(b.ticket_number));
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
    const email_result = await sendOrderConfirmationEmail({ user, order, entries: allEntries }).catch(err => ({ ok: false, error: err.message || 'Email send failed' }));
    res.json({ order, entries: allEntries, email_result });
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
    const email_result = await sendFreeEntryConfirmationEmail({ user, competition: comp, entry: entries[0], instantWins: instant_wins }).catch(err => ({ ok: false, error: err.message || 'Email send failed' }));
    res.json({ ...entries[0], instant_wins, email_result });
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
    const email_result = await sendFreeEntryConfirmationEmail({ user: manualUser, competition, entry, instantWins: instant_wins }).catch(err => ({ ok: false, error: err.message || 'Email send failed' }));
    await audit(req.user, 'manual_free_entry_created', `Manual/free entry #${entry.id} for ${customerEmail} on ${competition.title}`);
    res.json({ request: freeReq, entry: { ...entry, instant_wins }, email_result });
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

app.post('/admin/competitions/:id/secure-draw', auth('admin'), async (req, res) => {
  const competitionId = toInt(req.params.id);
  if (!competitionId) return res.status(400).json({ error: 'Competition ID required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const competition = (await client.query('SELECT * FROM competitions WHERE id=$1 FOR UPDATE', [competitionId])).rows[0];
    if (!competition) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Competition not found' });
    }

    const existing = (await client.query(`
      SELECT d.*, e.customer_name, e.customer_email, c.title AS competition_title
      FROM draw_results d
      LEFT JOIN entries e ON e.id = d.entry_id
      JOIN competitions c ON c.id = d.competition_id
      WHERE d.competition_id=$1
      LIMIT 1
    `, [competitionId])).rows[0];

    if (existing) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `This competition already has a recorded draw winner: ticket #${existing.ticket_number}`,
        existing_draw: existing
      });
    }

    const entries = (await client.query(`
      SELECT e.*, c.title AS competition_title
      FROM entries e
      JOIN competitions c ON c.id = e.competition_id
      WHERE e.competition_id=$1 AND e.payment_status IN ('paid','free','paid_test','free_manual')
      ORDER BY e.ticket_number ASC
    `, [competitionId])).rows;

    if (entries.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No eligible paid/free tickets found for this competition' });
    }

    const winnerIndex = crypto.randomInt(0, entries.length);
    const entry = entries[winnerIndex];

    const saved = await recordFinalDrawWinner(client, {
      competitionId,
      entry,
      createdBy: req.user?.id || null,
      method: 'secure_server_crypto_randomInt',
      notes: `Secure server-side draw. Eligible entries: ${entries.length}. Winner index: ${winnerIndex}.`
    });

    if (!saved) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'A draw result already exists for this competition' });
    }

    await client.query('COMMIT');

    res.json({
      ok: true,
      method: 'secure_server_crypto_randomInt',
      generated_at: new Date().toISOString(),
      eligible_count: entries.length,
      competition,
      entries,
      winner: {
        entry_id: entry.id,
        ticket_number: entry.ticket_number,
        customer_name: entry.customer_name || 'Customer',
        email: entry.customer_email || ''
      },
      draw_result: saved.draw_result,
      public_winner: saved.winner
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Secure draw failed', err);
    res.status(500).json({ error: err.message || 'Secure draw failed' });
  } finally {
    client.release();
  }
});


app.post('/admin/draw-results', auth('admin'), async (req, res) => {
  const competitionId = toInt(req.body.competition_id);
  const entryId = toInt(req.body.entry_id);
  const notes = String(req.body.notes || '').trim();
  if (!competitionId || !entryId) return res.status(400).json({ error: 'Competition and winning entry are required' });
  const entry = (await query(`
    SELECT e.*, c.title AS competition_title, c.draw_at, c.max_tickets
    FROM entries e
    JOIN competitions c ON c.id = e.competition_id
    WHERE e.id=$1 AND e.competition_id=$2 AND e.payment_status IN ('paid','free','paid_test','free_manual')
  `, [entryId, competitionId])).rows[0];
  if (!entry) return res.status(404).json({ error: 'Eligible winning entry not found' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saved = await recordFinalDrawWinner(client, {
      competitionId,
      entry,
      createdBy: req.user.id,
      method: 'wheel_of_names',
      notes
    });
    if (!saved) throw new Error('A final draw winner has already been recorded for this competition');

    drawBroadcastState = {
      ...drawBroadcastState,
      mode: 'winner',
      competition_id: competitionId,
      competition_title: entry.competition_title,
      competition_number: `#${competitionId}`,
      draw_date: entry.draw_at || '',
      ticket_capacity: Number(entry.max_tickets || 0),
      winner: {
        ticket_number: entry.ticket_number,
        customer_name: publicWinnerName(entry.customer_name || 'Customer'),
        email: entry.customer_email || ''
      },
      updated_at: new Date().toISOString()
    };

    await client.query('COMMIT');
    await audit(req.user, 'final_draw_recorded', `Winner ticket #${entry.ticket_number} recorded for ${entry.competition_title}`);
    res.json(saved);
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
    SELECT
      w.*,
      c.title AS competition_title,
      c.draw_at,
      c.max_tickets,
      d.ticket_number,
      d.draw_method,
      d.notes AS draw_notes,
      d.created_at AS draw_recorded_at,
      COALESCE(eligible.eligible_count, 0) AS eligible_count,
      'Europe/London' AS server_time_zone,
      'Prizetown server' AS time_source
    FROM winners w
    JOIN competitions c ON c.id = w.competition_id
    LEFT JOIN draw_results d ON d.competition_id = w.competition_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS eligible_count
      FROM entries e
      WHERE e.competition_id = w.competition_id
        AND e.payment_status IN ('paid','free','paid_test','free_manual')
    ) eligible ON TRUE
    ORDER BY COALESCE(d.created_at, w.announced_at) DESC
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
  .then(() => app.listen(port, () => console.log(`Prizetown API running on ${port} (v210 support compact index)`)))
  .catch((err) => {
    console.error('Failed to start API', err);
    process.exit(1);
  });



