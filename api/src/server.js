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

const v279SecurityEvents = [];
const v279SecurityEventMax = Number(process.env.SECURITY_EVENT_LOG_MAX || 200);

function v279SecurityIp(req) {
  return String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req?.socket?.remoteAddress || req?.ip || 'unknown';
}

function v279RecordSecurityEvent(type, req, details = {}) {
  try {
    const event = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      at: new Date().toISOString(),
      type,
      ip: v279SecurityIp(req),
      method: req?.method || '',
      path: req?.originalUrl || req?.url || '',
      origin: String(req?.headers?.origin || ''),
      details
    };
    v279SecurityEvents.unshift(event);
    if (v279SecurityEvents.length > v279SecurityEventMax) v279SecurityEvents.length = v279SecurityEventMax;
    return event;
  } catch (_err) {
    return null;
  }
}

const v278DefaultAllowedOrigins = [
  'https://prizetown.co.uk',
  'https://www.prizetown.co.uk',
  'http://100.65.239.74:3100',
  'http://192.168.1.177:3100',
  'http://localhost:3100',
  'http://localhost:5173'
];

const v278AllowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || v278DefaultAllowedOrigins.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function v278IsAllowedOrigin(origin = '') {
  if (!origin) return true;
  if (v278AllowedOrigins.has(origin)) return true;
  return /^http:\/\/localhost:\d+$/.test(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
}

app.use((req, res, next) => {
  const origin = String(req.headers.origin || '').trim();

  if (origin && v278IsAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    return v278IsAllowedOrigin(origin) ? res.sendStatus(204) : res.sendStatus(403);
  }

  if (origin && !v278IsAllowedOrigin(origin)) {
    v279RecordSecurityEvent('blocked_origin', req, { origin });
    return res.status(403).json({ error: 'Origin not allowed.' });
  }

  return next();
});

// v276: basic security headers and lightweight login rate limiting.
// No extra packages, no database changes.
app.disable('x-powered-by');

const v276SecurityLoginAttempts = new Map();
const v276LoginLimitWindowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const v276LoginLimitMax = Number(process.env.LOGIN_RATE_LIMIT_MAX || 12);

function v276ClientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || req.ip || 'unknown';
}

function v276IsLoginLikeRequest(req) {
  if (req.method !== 'POST') return false;
  const path = String(req.path || req.url || '').toLowerCase();
  return path === '/admin/login' || path === '/login' || path.endsWith('/login');
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const isHttps = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
});

app.use((req, res, next) => {
  if (!v276IsLoginLikeRequest(req)) return next();

  const now = Date.now();
  const key = v276ClientKey(req);
  const current = v276SecurityLoginAttempts.get(key) || { count: 0, resetAt: now + v276LoginLimitWindowMs };

  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + v276LoginLimitWindowMs;
  }

  current.count += 1;
  v276SecurityLoginAttempts.set(key, current);

  if (current.count > v276LoginLimitMax) {
    res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
    v279RecordSecurityEvent('login_rate_limited', req, { limit: v276LoginLimitMax, reset_at: new Date(current.resetAt).toISOString() });
    return res.status(429).json({ error: 'Too many login attempts. Please wait and try again.' });
  }

  return next();
});
const port = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET || 'dev_secret_change_me';
const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';

const v277UploadMaxBytes = Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024);
// v277 upload filter wired into common multer patterns where present.
const v277AllowedUploadExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf']);
const v277AllowedUploadMimes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
const v277BlockedUploadExtensions = new Set(['.svg', '.svgz', '.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.xml', '.xhtml', '.php', '.exe', '.sh', '.bat', '.cmd']);

function v277FileExtension(fileName = '') {
  const clean = String(fileName || '').toLowerCase().split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot) : '';
}

function v277UploadFileFilter(_req, file, cb) {
  const originalName = file?.originalname || '';
  const ext = v277FileExtension(originalName);
  const mime = String(file?.mimetype || '').toLowerCase();

  if (!ext || v277BlockedUploadExtensions.has(ext)) {
    return cb(new Error('Upload blocked: this file type is not allowed.'));
  }

  if (!v277AllowedUploadExtensions.has(ext)) {
    return cb(new Error('Upload blocked: only JPG, PNG, WEBP, GIF and PDF files are allowed.'));
  }

  if (mime && !v277AllowedUploadMimes.has(mime)) {
    return cb(new Error('Upload blocked: file content type is not allowed.'));
  }

  return cb(null, true);
}

app.use((req, res, next) => {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (!type.includes('multipart/form-data')) return next();

  const length = Number(req.headers['content-length'] || 0);
  if (length && length > v277UploadMaxBytes) {
    v279RecordSecurityEvent('upload_too_large', req, { content_length: length, max_bytes: v277UploadMaxBytes });
    return res.status(413).json({
      error: 'Upload too large.',
      max_bytes: v277UploadMaxBytes
    });
  }

  return next();
});
const publicSiteUrl = process.env.PUBLIC_SITE_URL || 'https://prizetown.co.uk';
const resendApiKey = process.env.RESEND_API_KEY || '';
const emailFrom = process.env.EMAIL_FROM || 'Prizetown <no-reply@prizetown.co.uk>';
const emailReplyTo = process.env.EMAIL_REPLY_TO || 'support@prizetown.co.uk';
const adminAlertEmail = process.env.ADMIN_ALERT_EMAIL || '';

fs.mkdirSync(uploadDir, { recursive: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors({ origin: (origin, cb) => cb(null, v278IsAllowedOrigin(origin)), credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '-');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: v277UploadMaxBytes, files: 1 }, fileFilter: v277UploadFileFilter });

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

// v277b upload error handler
app.use((err, _req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Upload too large.', max_bytes: v277UploadMaxBytes });
  }
  if (String(err.message || '').toLowerCase().includes('upload blocked')) {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

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

function buildEmailReadinessV281() {
  return {
    configured: Boolean(resendApiKey && emailFrom),
    provider: 'Resend',
    resend_api_key_configured: Boolean(resendApiKey),
    email_from_configured: Boolean(emailFrom),
    email_reply_to_configured: Boolean(emailReplyTo),
    email_from: emailFrom || '',
    email_reply_to: emailReplyTo || '',
    recommended_next_steps: [
      'Verify the sender domain in Resend before public launch.',
      'Send a test email to the admin inbox before enabling automatic customer emails.',
      'Keep order confirmation, winner and support templates simple and factual.',
      'Do not send payment/order confirmation emails until payment webhooks are trusted.'
    ]
  };
}

function buildEmailTemplatesV281() {
  return {
    order_confirmation: {
      subject: 'Your Prizetown entry confirmation',
      purpose: 'Send only after backend-confirmed paid/free entry allocation.',
      text: 'Thanks for entering. Your entry has been recorded. Keep this email for your records.'
    },
    winner_notification: {
      subject: 'You are a Prizetown winner',
      purpose: 'Send after winner has been confirmed and saved.',
      text: 'Congratulations. You have been selected as a winner. We will contact you with the next steps.'
    },
    support_reply: {
      subject: 'Prizetown support update',
      purpose: 'Use for customer support follow-up.',
      text: 'Thanks for contacting Prizetown. We have received your message and will reply as soon as possible.'
    }
  };
}

function buildEmailTemplatesV282() {
  return {
    order_confirmation: {
      label: 'Order / entry confirmation',
      subject: 'Your Prizetown entry confirmation',
      text: 'Hi {{name}},\n\nThanks for entering {{competition}}.\n\nYour entry reference is {{reference}}.\n\nKeep this email for your records.\n\nThanks,\nPrizetown',
      warning: 'Only send after backend-confirmed paid/free entry allocation.'
    },
    winner_notification: {
      label: 'Winner notification',
      subject: 'You are a Prizetown winner',
      text: 'Hi {{name}},\n\nCongratulations — you have been selected as a Prizetown winner for {{competition}}.\n\nYour winning reference is {{reference}}. We will contact you with the next steps.\n\nThanks,\nPrizetown',
      warning: 'Only send after the winner has been confirmed and saved.'
    },
    support_reply: {
      label: 'Support reply',
      subject: 'Prizetown support update',
      text: 'Hi {{name}},\n\nThanks for contacting Prizetown.\n\nWe have received your message and will reply as soon as possible.\n\nThanks,\nPrizetown Support',
      warning: 'Use for customer support follow-up.'
    },
    admin_alert: {
      label: 'Admin alert',
      subject: 'Prizetown admin alert',
      text: 'Admin alert:\n\n{{message}}\n\nGenerated by Prizetown admin tools.',
      warning: 'Use for internal admin notifications only.'
    }
  };
}

function renderEmailTemplateV282(templateKey, values = {}) {
  const templates = buildEmailTemplatesV282();
  const template = templates[templateKey] || templates.support_reply;
  const safeValues = {
    name: values.name || 'Customer',
    competition: values.competition || 'Prizetown competition',
    reference: values.reference || 'Not provided',
    message: values.message || 'No message provided'
  };
  const render = (input) => String(input || '').replace(/{{(name|competition|reference|message)}}/g, (_match, key) => String(safeValues[key] || ''));
  return {
    key: templateKey,
    label: template.label,
    warning: template.warning,
    subject: render(template.subject),
    text: render(template.text)
  };
}

async function sendEmailV281({ to, subject, text, html }) {
  if (!resendApiKey) {
    const err = new Error('RESEND_API_KEY is not configured.');
    err.status = 400;
    throw err;
  }
  if (!to || !subject || (!text && !html)) {
    const err = new Error('Email requires to, subject and text/html.');
    err.status = 400;
    throw err;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + resendApiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: emailFrom,
      to,
      subject,
      text,
      html,
      reply_to: emailReplyTo || undefined
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body?.message || 'Email provider rejected the request.');
    err.status = response.status || 502;
    err.provider_response = body;
    throw err;
  }
  return body;
}
app.get('/health', (_req, res) => res.json({ ok: true, app: 'Prizetown API', version: 'v291' }));
app.get('/admin/security/events', auth('admin'), (_req, res) => {
  res.json({
    ok: true,
    generated_at: new Date().toISOString(),
    app: 'Prizetown',
    api_version: 'v291',
    max_events: v279SecurityEventMax,
    count: v279SecurityEvents.length,
    events: v279SecurityEvents.slice(0, 100)
  });
});
app.get('/admin/email/templates', auth('admin'), (_req, res) => {
  res.json({
    ok: true,
    generated_at: new Date().toISOString(),
    app: 'Prizetown',
    api_version: 'v291',
    templates: buildEmailTemplatesV282(),
    note: 'Manual templates only. Automatic customer emails remain disabled until payment webhook safety is ready.'
  });
});

app.post('/admin/email/manual-preview', auth('admin'), (req, res) => {
  const template_key = String(req.body?.template_key || 'support_reply').trim();
  const values = req.body?.values || {};
  res.json({
    ok: true,
    generated_at: new Date().toISOString(),
    app: 'Prizetown',
    api_version: 'v291',
    email: renderEmailTemplateV282(template_key, values)
  });
});

app.post('/admin/email/manual-send', auth('admin'), async (req, res) => {
  try {
    const to = String(req.body?.to || '').trim();
    const confirm = String(req.body?.confirm || '').trim();
    const template_key = String(req.body?.template_key || 'support_reply').trim();
    const values = req.body?.values || {};
    if (confirm !== 'SEND_EMAIL') {
      return res.status(400).json({ ok: false, error: 'Manual send requires confirm: SEND_EMAIL.' });
    }
    const rendered = renderEmailTemplateV282(template_key, values);
    const provider = await sendEmailV281({ to, subject: rendered.subject, text: rendered.text });
    if (typeof v279RecordSecurityEvent === 'function') v279RecordSecurityEvent('manual_email_sent', req, { to, template_key });
    res.json({ ok: true, sent: true, to, template_key, email: rendered, provider });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Failed to send manual email.',
      provider_response: err.provider_response || null
    });
  }
});

app.get('/admin/google-drive/status', auth('admin'), (_req, res) => {
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID || '';
  const serviceAccountJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '';
  const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_DRIVE_CREDENTIALS_FILE || '';
  const credentialsConfigured = Boolean(serviceAccountJson || credentialsFile);
  res.json({
    ok: true,
    provider: 'google-drive',
    configured: Boolean(folderId && credentialsConfigured),
    folder_id_configured: Boolean(folderId),
    credentials_configured: credentialsConfigured,
    credential_source: serviceAccountJson ? 'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON' : credentialsFile ? 'credentials file path' : null,
    required_env: [
      'GOOGLE_DRIVE_BACKUP_FOLDER_ID or GOOGLE_DRIVE_FOLDER_ID',
      'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS'
    ],
    note: 'Status only. Upload/test backup action will be added after credentials are configured.'
  });
});

function getGoogleDriveBackupConfig() {
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID || '';
  const serviceAccountJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '';
  const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_DRIVE_CREDENTIALS_FILE || '';
  return { folderId, serviceAccountJson, credentialsFile };
}

async function getGoogleDriveClient() {
  const { folderId, serviceAccountJson, credentialsFile } = getGoogleDriveBackupConfig();
  if (!folderId) throw new Error('Google Drive folder ID is not configured.');
  if (!serviceAccountJson && !credentialsFile) throw new Error('Google Drive credentials are not configured.');

  const { google } = require('googleapis');
  let authOptions = {
    scopes: ['https://www.googleapis.com/auth/drive.file']
  };

  if (serviceAccountJson) {
    let credentials;
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch (_err) {
      throw new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    }
    authOptions.credentials = credentials;
  } else {
    authOptions.keyFile = credentialsFile;
  }

  const auth = new google.auth.GoogleAuth(authOptions);
  const authClient = await auth.getClient();
  return { drive: google.drive({ version: 'v3', auth: authClient }), folderId };
}

app.post('/admin/google-drive/test-upload', auth('admin'), async (_req, res) => {
  try {
    const { Readable } = require('stream');
    const { drive, folderId } = await getGoogleDriveClient();
    const createdAt = new Date().toISOString();
    const name = `prizetown-test-upload-${createdAt.replace(/[:.]/g, '-')}.txt`;
    const body = [
      'Prizetown Google Drive test upload',
      `Created: ${createdAt}`,
      'Purpose: confirm Drive folder and service-account credentials can create backup files.',
      'This is not a real backup.'
    ].join('\n');

    const result = await drive.files.create({
      requestBody: {
        name,
        parents: [folderId],
        mimeType: 'text/plain'
      },
      media: {
        mimeType: 'text/plain',
        body: Readable.from([body])
      },
      fields: 'id,name,mimeType,webViewLink,createdTime'
    });

    res.json({
      ok: true,
      uploaded: true,
      file: result.data,
      note: 'Test file uploaded. You can delete it from Google Drive after confirming access.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive test upload failed.'
    });
  }
});

app.post('/admin/google-drive/backup-manifest', auth('admin'), async (_req, res) => {
  try {
    const { Readable } = require('stream');
    const { drive, folderId } = await getGoogleDriveClient();
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const name = `prizetown-backup-manifest-${safeTimestamp}.json`;

    const counts = {};
    for (const [key, sql] of Object.entries({
      competitions: 'SELECT COUNT(*)::int AS count FROM competitions',
      orders: 'SELECT COUNT(*)::int AS count FROM orders',
      entries: 'SELECT COUNT(*)::int AS count FROM entries',
      winners: 'SELECT COUNT(*)::int AS count FROM winners'
    })) {
      try {
        const result = await pool.query(sql);
        counts[key] = result.rows[0]?.count ?? null;
      } catch (_err) {
        counts[key] = null;
      }
    }

    const manifest = {
      app: 'Prizetown',
      manifest_type: 'google_drive_backup_manifest',
      created_at: createdAt,
      api_version: 'v291',
      upload_dir_configured: Boolean(uploadDir),
      public_api_url_configured: Boolean(process.env.PUBLIC_API_URL),
      counts,
      notes: [
        'This manifest proves Google Drive backup upload integration is working.',
        'It is not a database dump and does not include uploaded files.',
        'Use alongside PostgreSQL dumps, uploads copies and TrueNAS YAML backups.'
      ]
    };

    const result = await drive.files.create({
      requestBody: {
        name,
        parents: [folderId],
        mimeType: 'application/json'
      },
      media: {
        mimeType: 'application/json',
        body: Readable.from([JSON.stringify(manifest, null, 2)])
      },
      fields: 'id,name,mimeType,webViewLink,createdTime'
    });

    res.json({
      ok: true,
      uploaded: true,
      file: result.data,
      manifest,
      note: 'Backup manifest uploaded. This is a backup record, not a full database/uploads backup yet.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive backup manifest upload failed.'
    });
  }
});


function listUploadFilesForManifest(rootDir) {
  const path = require('path');
  const files = [];
  if (!rootDir || !fs.existsSync(rootDir)) return files;

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = fs.statSync(fullPath);
      files.push({
        path: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
        size_bytes: stat.size,
        modified_at: stat.mtime.toISOString()
      });
    }
  }

  walk(rootDir);
  return files;
}

app.post('/admin/google-drive/uploads-index', auth('admin'), async (_req, res) => {
  try {
    const { Readable } = require('stream');
    const { drive, folderId } = await getGoogleDriveClient();
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const name = `prizetown-uploads-index-${safeTimestamp}.json`;
    const files = listUploadFilesForManifest(uploadDir);
    const totalBytes = files.reduce((sum, file) => sum + (file.size_bytes || 0), 0);

    const manifest = {
      app: 'Prizetown',
      manifest_type: 'google_drive_uploads_index',
      created_at: createdAt,
      api_version: 'v291',
      upload_dir_configured: Boolean(uploadDir),
      upload_dir_exists: Boolean(uploadDir && fs.existsSync(uploadDir)),
      file_count: files.length,
      total_bytes: totalBytes,
      files,
      notes: [
        'This is an index of uploaded files for backup evidence.',
        'It does not upload the actual files yet.',
        'Use this to confirm which uploads should exist before/after restore.'
      ]
    };

    const result = await drive.files.create({
      requestBody: {
        name,
        parents: [folderId],
        mimeType: 'application/json'
      },
      media: {
        mimeType: 'application/json',
        body: Readable.from([JSON.stringify(manifest, null, 2)])
      },
      fields: 'id,name,mimeType,webViewLink,createdTime'
    });

    res.json({
      ok: true,
      uploaded: true,
      file: result.data,
      file_count: files.length,
      total_bytes: totalBytes,
      note: 'Uploads index uploaded. This records upload file names/sizes, not the actual upload files yet.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive uploads index upload failed.'
    });
  }
});


function quotePgIdentifier(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

async function collectDatabaseSnapshot(maxRowsPerTable = 5000) {
  const tablesResult = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const tables = [];
  for (const row of tablesResult.rows) {
    const tableName = row.table_name;
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM ${quotePgIdentifier(tableName)}`);
    const count = countResult.rows[0]?.count ?? 0;
    const rowsResult = maxRowsPerTable > 0
      ? await pool.query(`SELECT * FROM ${quotePgIdentifier(tableName)} LIMIT $1`, [maxRowsPerTable])
      : { rows: [] };
    tables.push({
      table: tableName,
      count,
      exported_count: rowsResult.rows.length,
      truncated: maxRowsPerTable > 0 && count > rowsResult.rows.length,
      rows: rowsResult.rows
    });
  }

  return tables;
}

async function uploadJsonToGoogleDrive(name, payload) {
  const { Readable } = require('stream');
  const { drive, folderId } = await getGoogleDriveClient();
  const result = await drive.files.create({
    requestBody: {
      name,
      parents: [folderId],
      mimeType: 'application/json'
    },
    media: {
      mimeType: 'application/json',
      body: Readable.from([JSON.stringify(payload, null, 2)])
    },
    fields: 'id,name,mimeType,webViewLink,createdTime'
  });
  return result.data;
}

app.post('/admin/google-drive/database-snapshot', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const tables = await collectDatabaseSnapshot(5000);
    const snapshot = {
      app: 'Prizetown',
      manifest_type: 'google_drive_database_snapshot',
      created_at: createdAt,
      api_version: 'v291',
      max_rows_per_table: 5000,
      table_count: tables.length,
      tables,
      notes: [
        'Admin-only JSON database snapshot for recovery evidence.',
        'Large tables are capped at 5000 rows per table in this safety version.',
        'Use PostgreSQL dumps for full production database backup.'
      ]
    };

    const file = await uploadJsonToGoogleDrive(`prizetown-database-snapshot-${safeTimestamp}.json`, snapshot);
    res.json({
      ok: true,
      uploaded: true,
      file,
      table_count: tables.length,
      note: 'Database snapshot uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive database snapshot upload failed.'
    });
  }
});

app.post('/admin/google-drive/backup-run-summary', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const tables = await collectDatabaseSnapshot(0);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const totalUploadBytes = uploadFiles.reduce((sum, file) => sum + (file.size_bytes || 0), 0);
    const { folderId, serviceAccountJson, credentialsFile } = getGoogleDriveBackupConfig();

    const summary = {
      app: 'Prizetown',
      manifest_type: 'google_drive_backup_run_summary',
      created_at: createdAt,
      api_version: 'v291',
      google_drive: {
        folder_id_configured: Boolean(folderId),
        credentials_configured: Boolean(serviceAccountJson || credentialsFile),
        credential_source: serviceAccountJson ? 'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON' : credentialsFile ? 'credentials file path' : null
      },
      database: {
        table_count: tables.length,
        tables: tables.map((table) => ({
          table: table.table,
          count: table.count
        }))
      },
      uploads: {
        upload_dir_configured: Boolean(uploadDir),
        upload_dir_exists: Boolean(uploadDir && fs.existsSync(uploadDir)),
        file_count: uploadFiles.length,
        total_bytes: totalUploadBytes
      },
      recommended_restore_checks: [
        'Confirm API health endpoint returns the deployed version.',
        'Confirm Admin login works.',
        'Confirm competitions, orders, entries and winners screens load.',
        'Confirm uploaded images/files still display.',
        'Confirm Google Drive backup files exist for this run.'
      ]
    };

    const file = await uploadJsonToGoogleDrive(`prizetown-backup-run-summary-${safeTimestamp}.json`, summary);
    res.json({
      ok: true,
      uploaded: true,
      file,
      table_count: tables.length,
      upload_file_count: uploadFiles.length,
      total_upload_bytes: totalUploadBytes,
      note: 'Backup run summary uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive backup run summary upload failed.'
    });
  }
});


function getSimpleMimeType(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

app.post('/admin/google-drive/uploads-batch', auth('admin'), async (_req, res) => {
  try {
    const path = require('path');
    const { drive, folderId } = await getGoogleDriveClient();
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const maxFiles = 25;
    const maxBytes = 25 * 1024 * 1024;
    const files = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];

    const selected = [];
    let totalBytes = 0;
    for (const file of files) {
      if (selected.length >= maxFiles) break;
      if (totalBytes + (file.size_bytes || 0) > maxBytes) continue;
      selected.push(file);
      totalBytes += file.size_bytes || 0;
    }

    const uploaded = [];
    const failed = [];
    for (const file of selected) {
      try {
        const fullPath = path.join(uploadDir, file.path);
        const safeName = String(file.path).replace(/[\\/]+/g, '__').replace(/[^a-zA-Z0-9._-]/g, '_');
        const result = await drive.files.create({
          requestBody: {
            name: `prizetown-upload-${safeTimestamp}-${safeName}`,
            parents: [folderId],
            mimeType: getSimpleMimeType(file.path)
          },
          media: {
            mimeType: getSimpleMimeType(file.path),
            body: fs.createReadStream(fullPath)
          },
          fields: 'id,name,mimeType,size,webViewLink,createdTime'
        });
        uploaded.push({
          source_path: file.path,
          source_size_bytes: file.size_bytes,
          drive_file: result.data
        });
      } catch (err) {
        failed.push({
          source_path: file.path,
          error: err.message || 'Upload failed'
        });
      }
    }

    res.json({
      ok: failed.length === 0,
      uploaded_count: uploaded.length,
      failed_count: failed.length,
      skipped_count: Math.max(0, files.length - selected.length),
      max_files: maxFiles,
      max_bytes: maxBytes,
      selected_bytes: totalBytes,
      uploaded,
      failed,
      note: 'Limited safety upload: max 25 files and 25MB total per run.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive uploads batch failed.'
    });
  }
});

app.get('/admin/google-drive/folder-inventory', auth('admin'), async (_req, res) => {
  try {
    const { drive, folderId } = await getGoogleDriveClient();
    const safeFolderId = String(folderId).replace(/'/g, "\\'");
    const result = await drive.files.list({
      q: `'${safeFolderId}' in parents and trashed = false`,
      pageSize: 50,
      orderBy: 'createdTime desc',
      fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink)'
    });
    const files = result.data.files || [];
    res.json({
      ok: true,
      folder_id_configured: Boolean(folderId),
      file_count_returned: files.length,
      files,
      note: 'Shows the latest 50 non-trashed files in the configured Google Drive backup folder.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive folder inventory failed.'
    });
  }
});


function classifyGoogleDriveBackupFile(name) {
  const value = String(name || '').toLowerCase();
  if (value.includes('database-snapshot')) return 'database_snapshot';
  if (value.includes('uploads-index')) return 'uploads_index';
  if (value.includes('backup-run-summary')) return 'run_summary';
  if (value.includes('backup-manifest')) return 'backup_manifest';
  if (value.includes('prizetown-upload-')) return 'upload_file';
  if (value.includes('test-upload')) return 'test_upload';
  return 'other';
}

async function listGoogleDriveBackupFolderFiles(pageSize = 100) {
  const { drive, folderId } = await getGoogleDriveClient();
  const safeFolderId = String(folderId).replace(/'/g, "\\'");
  const result = await drive.files.list({
    q: `'${safeFolderId}' in parents and trashed = false`,
    pageSize,
    orderBy: 'createdTime desc',
    fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink)'
  });
  return result.data.files || [];
}

app.post('/admin/google-drive/backup-pack', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const dbTables = await collectDatabaseSnapshot(1000);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const totalUploadBytes = uploadFiles.reduce((sum, file) => sum + (file.size_bytes || 0), 0);

    const summary = {
      app: 'Prizetown',
      manifest_type: 'google_drive_backup_pack_summary',
      created_at: createdAt,
      api_version: 'v291',
      database: {
        table_count: dbTables.length,
        max_rows_per_table: 1000,
        tables: dbTables.map((table) => ({
          table: table.table,
          count: table.count,
          exported_count: table.exported_count,
          truncated: table.truncated
        }))
      },
      uploads: {
        upload_dir_configured: Boolean(uploadDir),
        upload_dir_exists: Boolean(uploadDir && fs.existsSync(uploadDir)),
        file_count: uploadFiles.length,
        total_bytes: totalUploadBytes
      },
      pack_files: [
        'backup pack summary',
        'database snapshot capped at 1000 rows per table',
        'uploads index'
      ],
      notes: [
        'This creates a small backup evidence pack in Google Drive.',
        'It does not replace full PostgreSQL dumps or full uploads copy jobs.',
        'Use the uploads batch button for limited real file uploads.'
      ]
    };

    const dbSnapshot = {
      app: 'Prizetown',
      manifest_type: 'google_drive_backup_pack_database_snapshot',
      created_at: createdAt,
      api_version: 'v291',
      max_rows_per_table: 1000,
      table_count: dbTables.length,
      tables: dbTables
    };

    const uploadsIndex = {
      app: 'Prizetown',
      manifest_type: 'google_drive_backup_pack_uploads_index',
      created_at: createdAt,
      api_version: 'v291',
      file_count: uploadFiles.length,
      total_bytes: totalUploadBytes,
      files: uploadFiles
    };

    const uploaded = [];
    uploaded.push(await uploadJsonToGoogleDrive(`prizetown-backup-pack-summary-${safeTimestamp}.json`, summary));
    uploaded.push(await uploadJsonToGoogleDrive(`prizetown-backup-pack-db-snapshot-${safeTimestamp}.json`, dbSnapshot));
    uploaded.push(await uploadJsonToGoogleDrive(`prizetown-backup-pack-uploads-index-${safeTimestamp}.json`, uploadsIndex));

    res.json({
      ok: true,
      uploaded: true,
      uploaded_count: uploaded.length,
      files: uploaded,
      table_count: dbTables.length,
      upload_file_count: uploadFiles.length,
      total_upload_bytes: totalUploadBytes,
      note: 'Backup pack uploaded: summary, capped DB snapshot and uploads index.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive backup pack upload failed.'
    });
  }
});

app.get('/admin/google-drive/backup-health', auth('admin'), async (_req, res) => {
  try {
    const files = await listGoogleDriveBackupFolderFiles(100);
    const byType = {};
    for (const file of files) {
      const type = classifyGoogleDriveBackupFile(file.name);
      if (!byType[type]) byType[type] = { count: 0, latest: null };
      byType[type].count += 1;
      if (!byType[type].latest || new Date(file.createdTime) > new Date(byType[type].latest.createdTime)) {
        byType[type].latest = file;
      }
    }

    const requiredTypes = ['backup_manifest', 'uploads_index', 'database_snapshot', 'run_summary'];
    const missingTypes = requiredTypes.filter((type) => !byType[type]?.count);

    res.json({
      ok: missingTypes.length === 0,
      checked_at: new Date().toISOString(),
      file_count_checked: files.length,
      missing_types: missingTypes,
      by_type: byType,
      latest_file: files[0] || null,
      note: missingTypes.length === 0
        ? 'Backup folder has the main backup evidence file types.'
        : 'Some backup evidence file types were not found in the latest 100 folder files.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive backup health check failed.'
    });
  }
});


function buildGoogleDriveLatestBackupReport(files) {
  const byType = {};
  for (const file of files) {
    const type = classifyGoogleDriveBackupFile(file.name);
    if (!byType[type]) byType[type] = { count: 0, latest: null, files: [] };
    byType[type].count += 1;
    byType[type].files.push(file);
    if (!byType[type].latest || new Date(file.createdTime) > new Date(byType[type].latest.createdTime)) {
      byType[type].latest = file;
    }
  }

  const requiredTypes = ['backup_manifest', 'uploads_index', 'database_snapshot', 'run_summary'];
  const missingTypes = requiredTypes.filter((type) => !byType[type]?.count);

  return {
    checked_at: new Date().toISOString(),
    file_count_checked: files.length,
    latest_file: files[0] || null,
    by_type: byType,
    required_types: requiredTypes,
    missing_types: missingTypes,
    ready: missingTypes.length === 0
  };
}

app.get('/admin/google-drive/latest-backup-report', auth('admin'), async (_req, res) => {
  try {
    const files = await listGoogleDriveBackupFolderFiles(100);
    const report = buildGoogleDriveLatestBackupReport(files);
    res.json({
      ok: true,
      report,
      note: 'Latest backup report built from the newest 100 files in the Google Drive backup folder.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive latest backup report failed.'
    });
  }
});

app.post('/admin/google-drive/restore-check-report', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const totalUploadBytes = uploadFiles.reduce((sum, file) => sum + (file.size_bytes || 0), 0);

    const restoreReport = {
      app: 'Prizetown',
      manifest_type: 'google_drive_restore_check_report',
      created_at: createdAt,
      api_version: 'v291',
      latest_backup_report: latestReport,
      local_uploads_snapshot: {
        upload_dir_configured: Boolean(uploadDir),
        upload_dir_exists: Boolean(uploadDir && fs.existsSync(uploadDir)),
        file_count: uploadFiles.length,
        total_bytes: totalUploadBytes
      },
      restore_checklist: [
        'Restore database from the selected PostgreSQL dump or snapshot.',
        'Restore uploads folder from TrueNAS or Google Drive uploaded files.',
        'Deploy matching API and web image tags.',
        'Confirm /health returns the expected version.',
        'Log in to Admin.',
        'Check competitions, orders, entries, winners and uploaded images.',
        'Run Google Drive backup health again after restore.'
      ],
      notes: [
        'This file is recovery evidence and a checklist.',
        'It does not perform a restore.',
        'Keep it with backup manifests and snapshots.'
      ]
    };

    const file = await uploadJsonToGoogleDrive(`prizetown-restore-check-report-${safeTimestamp}.json`, restoreReport);
    res.json({
      ok: true,
      uploaded: true,
      file,
      ready: latestReport.ready,
      missing_types: latestReport.missing_types,
      local_upload_file_count: uploadFiles.length,
      note: 'Restore check report uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive restore check report upload failed.'
    });
  }
});


function buildBackupTimeline(files) {
  return files.map((file) => ({
    id: file.id,
    name: file.name,
    type: classifyGoogleDriveBackupFile(file.name),
    mimeType: file.mimeType,
    size: file.size || null,
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
    webViewLink: file.webViewLink || null
  }));
}

function calculateBackupReadinessScore(latestReport, uploadFiles) {
  const required = latestReport.required_types || ['backup_manifest', 'uploads_index', 'database_snapshot', 'run_summary'];
  const missing = latestReport.missing_types || [];
  const presentCount = Math.max(0, required.length - missing.length);
  const evidenceScore = required.length ? Math.round((presentCount / required.length) * 70) : 0;
  const uploadsScore = uploadFiles.length > 0 ? 15 : 5;
  const latestFileScore = latestReport.latest_file ? 15 : 0;
  const score = Math.max(0, Math.min(100, evidenceScore + uploadsScore + latestFileScore));
  return {
    score,
    status: score >= 85 ? 'good' : score >= 60 ? 'partial' : 'needs_attention',
    present_required_types: presentCount,
    total_required_types: required.length,
    missing_types: missing,
    upload_file_count: uploadFiles.length
  };
}

app.get('/admin/google-drive/backup-timeline', auth('admin'), async (_req, res) => {
  try {
    const files = await listGoogleDriveBackupFolderFiles(100);
    const timeline = buildBackupTimeline(files);
    const byType = {};
    for (const item of timeline) {
      byType[item.type] = (byType[item.type] || 0) + 1;
    }
    res.json({
      ok: true,
      checked_at: new Date().toISOString(),
      file_count: timeline.length,
      by_type: byType,
      timeline,
      note: 'Timeline is based on the latest 100 files in the Google Drive backup folder.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive backup timeline failed.'
    });
  }
});

app.get('/admin/google-drive/readiness-score', auth('admin'), async (_req, res) => {
  try {
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    res.json({
      ok: true,
      checked_at: new Date().toISOString(),
      readiness,
      latest_backup_report: latestReport,
      note: 'Readiness score is a simple admin guide, not a guarantee of restore success.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive readiness score failed.'
    });
  }
});

app.post('/admin/google-drive/backup-audit-report', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const files = await listGoogleDriveBackupFolderFiles(100);
    const timeline = buildBackupTimeline(files);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const { folderId, serviceAccountJson, credentialsFile } = getGoogleDriveBackupConfig();

    const audit = {
      app: 'Prizetown',
      manifest_type: 'google_drive_backup_audit_report',
      created_at: createdAt,
      api_version: 'v291',
      google_drive: {
        folder_id_configured: Boolean(folderId),
        credentials_configured: Boolean(serviceAccountJson || credentialsFile),
        credential_source: serviceAccountJson ? 'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON' : credentialsFile ? 'credentials file path' : null
      },
      readiness,
      latest_backup_report: latestReport,
      backup_timeline: timeline.slice(0, 50),
      local_uploads: {
        upload_dir_configured: Boolean(uploadDir),
        upload_dir_exists: Boolean(uploadDir && fs.existsSync(uploadDir)),
        file_count: uploadFiles.length,
        total_bytes: uploadFiles.reduce((sum, file) => sum + (file.size_bytes || 0), 0)
      },
      audit_notes: [
        'Generated by admin from Backup Readiness.',
        'Use this report as evidence of backup visibility and restore readiness.',
        'Still keep separate PostgreSQL dumps and TrueNAS snapshots for full recovery.'
      ]
    };

    const file = await uploadJsonToGoogleDrive(`prizetown-backup-audit-report-${safeTimestamp}.json`, audit);
    res.json({
      ok: true,
      uploaded: true,
      file,
      readiness,
      timeline_count: timeline.length,
      local_upload_file_count: uploadFiles.length,
      note: 'Backup audit report uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive backup audit report upload failed.'
    });
  }
});


function parseDriveFileSize(file) {
  const value = Number(file.size || 0);
  return Number.isFinite(value) ? value : 0;
}

function buildDriveSizeReport(files) {
  const byType = {};
  let totalBytes = 0;
  for (const file of files) {
    const type = classifyGoogleDriveBackupFile(file.name);
    const size = parseDriveFileSize(file);
    totalBytes += size;
    if (!byType[type]) byType[type] = { count: 0, total_bytes: 0, latest: null };
    byType[type].count += 1;
    byType[type].total_bytes += size;
    if (!byType[type].latest || new Date(file.createdTime) > new Date(byType[type].latest.createdTime)) {
      byType[type].latest = file;
    }
  }
  return {
    checked_at: new Date().toISOString(),
    file_count: files.length,
    total_bytes: totalBytes,
    by_type: byType,
    largest_files: [...files]
      .sort((a, b) => parseDriveFileSize(b) - parseDriveFileSize(a))
      .slice(0, 10)
      .map((file) => ({
        id: file.id,
        name: file.name,
        type: classifyGoogleDriveBackupFile(file.name),
        size: parseDriveFileSize(file),
        createdTime: file.createdTime
      }))
  };
}

function buildDriveRetentionReport(files) {
  const now = Date.now();
  const retentionDays = 30;
  const keepRecentPerType = 5;
  const grouped = {};
  const oldCandidates = [];

  for (const file of files) {
    const type = classifyGoogleDriveBackupFile(file.name);
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(file);
  }

  for (const [type, items] of Object.entries(grouped)) {
    const sorted = [...items].sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
    sorted.forEach((file, index) => {
      const ageDays = Math.floor((now - new Date(file.createdTime).getTime()) / 86400000);
      if (ageDays > retentionDays && index >= keepRecentPerType) {
        oldCandidates.push({
          id: file.id,
          name: file.name,
          type,
          age_days: ageDays,
          createdTime: file.createdTime,
          size: parseDriveFileSize(file),
          action: 'review_only_no_delete'
        });
      }
    });
  }

  return {
    checked_at: new Date().toISOString(),
    retention_days: retentionDays,
    keep_recent_per_type: keepRecentPerType,
    file_count_checked: files.length,
    old_candidate_count: oldCandidates.length,
    old_candidates: oldCandidates.slice(0, 50),
    note: 'Review only. No files are deleted by this report.'
  };
}

app.get('/admin/google-drive/backup-size-report', auth('admin'), async (_req, res) => {
  try {
    const files = await listGoogleDriveBackupFolderFiles(100);
    const report = buildDriveSizeReport(files);
    res.json({
      ok: true,
      report,
      note: 'Size report uses the latest 100 files in the Google Drive backup folder.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive backup size report failed.'
    });
  }
});

app.get('/admin/google-drive/retention-report', auth('admin'), async (_req, res) => {
  try {
    const files = await listGoogleDriveBackupFolderFiles(100);
    const report = buildDriveRetentionReport(files);
    res.json({
      ok: true,
      report,
      note: 'Retention report is review-only and does not delete files.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive retention report failed.'
    });
  }
});

app.post('/admin/google-drive/retention-policy-report', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const files = await listGoogleDriveBackupFolderFiles(100);
    const sizeReport = buildDriveSizeReport(files);
    const retentionReport = buildDriveRetentionReport(files);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const { folderId, serviceAccountJson, credentialsFile } = getGoogleDriveBackupConfig();

    const policyReport = {
      app: 'Prizetown',
      manifest_type: 'google_drive_retention_policy_report',
      created_at: createdAt,
      api_version: 'v291',
      google_drive: {
        folder_id_configured: Boolean(folderId),
        credentials_configured: Boolean(serviceAccountJson || credentialsFile),
        credential_source: serviceAccountJson ? 'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON' : credentialsFile ? 'credentials file path' : null
      },
      size_report: sizeReport,
      retention_report: retentionReport,
      latest_backup_report: latestReport,
      policy_notes: [
        'Review-only retention evidence. This report never deletes files.',
        'Suggested starter policy: keep at least 5 recent files per backup evidence type and review files older than 30 days.',
        'Before deleting anything, confirm separate PostgreSQL dumps, uploads backups and TrueNAS snapshots exist.'
      ]
    };

    const file = await uploadJsonToGoogleDrive(`prizetown-retention-policy-report-${safeTimestamp}.json`, policyReport);
    res.json({
      ok: true,
      uploaded: true,
      file,
      total_bytes: sizeReport.total_bytes,
      old_candidate_count: retentionReport.old_candidate_count,
      note: 'Retention policy report uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive retention policy report upload failed.'
    });
  }
});


function buildBackupVerificationMatrix(latestReport, readiness, sizeReport, retentionReport) {
  return [
    {
      area: 'Drive credentials',
      status: latestReport ? 'ok' : 'needs_attention',
      detail: latestReport ? 'Google Drive folder can be read.' : 'Google Drive folder could not be read.'
    },
    {
      area: 'Backup evidence types',
      status: (latestReport?.missing_types || []).length === 0 ? 'ok' : 'needs_attention',
      detail: (latestReport?.missing_types || []).length === 0
        ? 'Core evidence file types are present.'
        : `Missing: ${(latestReport?.missing_types || []).join(', ')}`
    },
    {
      area: 'Readiness score',
      status: readiness?.score >= 85 ? 'ok' : readiness?.score >= 60 ? 'warning' : 'needs_attention',
      detail: `${readiness?.score ?? 0}/100 - ${readiness?.status || 'unknown'}`
    },
    {
      area: 'Drive storage visibility',
      status: sizeReport?.file_count > 0 ? 'ok' : 'warning',
      detail: `${sizeReport?.file_count ?? 0} files, ${sizeReport?.total_bytes ?? 0} bytes checked.`
    },
    {
      area: 'Retention review',
      status: (retentionReport?.old_candidate_count || 0) === 0 ? 'ok' : 'warning',
      detail: `${retentionReport?.old_candidate_count ?? 0} old review candidates. No delete action is performed.`
    }
  ];
}

app.get('/admin/google-drive/verification-matrix', auth('admin'), async (_req, res) => {
  try {
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const sizeReport = buildDriveSizeReport(files);
    const retentionReport = buildDriveRetentionReport(files);
    const matrix = buildBackupVerificationMatrix(latestReport, readiness, sizeReport, retentionReport);

    res.json({
      ok: true,
      checked_at: new Date().toISOString(),
      matrix,
      readiness,
      note: 'Verification matrix is a quick admin checklist. It does not restore or delete anything.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive verification matrix failed.'
    });
  }
});

app.post('/admin/google-drive/restore-drill-evidence', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const matrix = buildBackupVerificationMatrix(
      latestReport,
      readiness,
      buildDriveSizeReport(files),
      buildDriveRetentionReport(files)
    );

    const evidence = {
      app: 'Prizetown',
      manifest_type: 'google_drive_restore_drill_evidence',
      created_at: createdAt,
      api_version: 'v291',
      readiness,
      verification_matrix: matrix,
      latest_backup_report: latestReport,
      drill_steps: [
        'Choose a safe restore target or staging environment.',
        'Record current deployed API/web image tags.',
        'Confirm Google Drive backup evidence files are visible.',
        'Restore database from the selected dump/snapshot.',
        'Restore uploads folder from selected backup source.',
        'Start app and confirm /health version.',
        'Check admin login, competitions, entries, orders, winners and uploaded images.',
        'Record outcome and any missing files/data.'
      ],
      outcome_fields_to_complete_manually: [
        'drill_started_at',
        'drill_completed_at',
        'restore_target',
        'database_source_used',
        'uploads_source_used',
        'admin_result',
        'public_site_result',
        'notes'
      ],
      note: 'Evidence template only. This does not run a restore.'
    };

    const file = await uploadJsonToGoogleDrive(`prizetown-restore-drill-evidence-${safeTimestamp}.json`, evidence);
    res.json({
      ok: true,
      uploaded: true,
      file,
      readiness,
      matrix_items: matrix.length,
      note: 'Restore drill evidence template uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive restore drill evidence upload failed.'
    });
  }
});

app.post('/admin/google-drive/operator-handover-report', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const { folderId, serviceAccountJson, credentialsFile } = getGoogleDriveBackupConfig();

    const handover = {
      app: 'Prizetown',
      manifest_type: 'google_drive_operator_handover_report',
      created_at: createdAt,
      api_version: 'v291',
      current_expected_tags: {
        api: 'ghcr.io/christianrobertson36/prizetown-api:v291',
        web: 'ghcr.io/christianrobertson36/prizetown-web:v291'
      },
      google_drive: {
        folder_id_configured: Boolean(folderId),
        credentials_configured: Boolean(serviceAccountJson || credentialsFile),
        credential_source: serviceAccountJson ? 'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON' : credentialsFile ? 'credentials file path' : null
      },
      readiness,
      latest_backup_report: latestReport,
      operator_steps: [
        'Before making changes, confirm /health returns the expected version.',
        'Run Backup Readiness > Check readiness score.',
        'Run Backup Readiness > Upload backup pack before risky changes.',
        'After changes, run Backup Readiness > Upload audit report.',
        'Keep TrueNAS YAML, PostgreSQL dumps and uploads backups separate from Drive evidence reports.',
        'Do not delete Drive backup files unless a separate restore-tested backup exists.'
      ],
      emergency_notes: [
        'If public site is broken, check API /health first.',
        'If API is broken, rollback TrueNAS image tags to last known good versions.',
        'If data is missing, stop writes and restore from database/uploads backups.'
      ]
    };

    const file = await uploadJsonToGoogleDrive(`prizetown-operator-handover-${safeTimestamp}.json`, handover);
    res.json({
      ok: true,
      uploaded: true,
      file,
      readiness,
      note: 'Operator handover report uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Google Drive operator handover upload failed.'
    });
  }
});


function buildBackupSchedulePlan(readiness) {
  const readyEnough = Number(readiness?.score || 0) >= 85;
  return {
    mode: readyEnough ? 'ready_for_scheduled_backup_setup' : 'prepare_before_scheduling',
    recommended_schedule: [
      { cadence: 'Daily', time: '02:00 Europe/London', action: 'Database dump plus backup evidence pack.' },
      { cadence: 'Daily', time: '02:15 Europe/London', action: 'Uploads folder copy or limited uploads batch.' },
      { cadence: 'Weekly', time: 'Sunday 03:00 Europe/London', action: 'Full audit report and restore drill evidence template.' },
      { cadence: 'Monthly', time: 'First Sunday 04:00 Europe/London', action: 'Manual restore drill into a safe target.' }
    ],
    preflight_checks: [
      'Google Drive status is configured and readable.',
      'Latest backup report shows no missing core evidence types.',
      'Readiness score is at least 85/100.',
      'TrueNAS snapshots or separate PostgreSQL dump jobs exist.',
      'Restore drill evidence file has been generated before launch.'
    ],
    warnings: readyEnough
      ? ['Scheduling can be planned, but do not delete older files until a restore drill has passed.']
      : ['Improve missing backup evidence before relying on automated schedules.']
  };
}

function buildDatabaseDumpGuide() {
  return {
    title: 'Prizetown PostgreSQL dump guide',
    purpose: 'Create a real PostgreSQL dump outside the app before risky updates or launch.',
    command_notes: [
      'Run database dump commands on the TrueNAS host or from the correct database container context.',
      'Do not paste example output as a command.',
      'Store dumps outside the live database volume and copy them to a backup destination.',
      'Test restoring a dump into a safe/staging database before trusting it.'
    ],
    example_commands: [
      'docker exec -t <postgres_container_name> pg_dump -U <db_user> -d <db_name> > prizetown-backup-YYYY-MM-DD.sql',
      'docker exec -t <postgres_container_name> pg_dump -U <db_user> -d <db_name> | gzip > prizetown-backup-YYYY-MM-DD.sql.gz',
      'docker exec -i <postgres_container_name> psql -U <db_user> -d <restore_db_name> < prizetown-backup-YYYY-MM-DD.sql'
    ],
    restore_warning: 'Never restore over production until you have stopped writes, taken a fresh backup, and confirmed the target database.'
  };
}

function buildUploadsBackupPlan(uploadFiles) {
  const totalBytes = uploadFiles.reduce((sum, file) => sum + (file.size_bytes || 0), 0);
  return {
    upload_dir_configured: Boolean(uploadDir),
    upload_dir_exists: Boolean(uploadDir && fs.existsSync(uploadDir)),
    file_count: uploadFiles.length,
    total_bytes: totalBytes,
    suggested_batch_size: uploadFiles.length > 100 ? 25 : 10,
    recommended_steps: [
      'Keep TrueNAS uploads volume backed up separately from the app container.',
      'Use Google Drive uploads batch for small emergency copies only.',
      'For full backup, copy the complete uploads folder from the TrueNAS dataset.',
      'After restore, check competition images and uploaded files from the public site and admin.'
    ],
    largest_local_files: [...uploadFiles]
      .sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0))
      .slice(0, 10)
  };
}

app.get('/admin/google-drive/backup-schedule-plan', auth('admin'), async (_req, res) => {
  try {
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const plan = buildBackupSchedulePlan(readiness);
    res.json({
      ok: true,
      checked_at: new Date().toISOString(),
      readiness,
      plan,
      note: 'Schedule plan is guidance only. It does not create a scheduled job.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Backup schedule plan failed.'
    });
  }
});

app.post('/admin/google-drive/database-dump-guide', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const guide = {
      app: 'Prizetown',
      manifest_type: 'database_dump_command_guide',
      created_at: createdAt,
      api_version: 'v291',
      guide: buildDatabaseDumpGuide(),
      environment: {
        database_url_configured: Boolean(process.env.DATABASE_URL),
        public_api_url_configured: Boolean(process.env.PUBLIC_API_URL)
      },
      note: 'This uploads guidance only. It does not run pg_dump.'
    };

    const file = await uploadJsonToGoogleDrive(`prizetown-database-dump-guide-${safeTimestamp}.json`, guide);
    res.json({
      ok: true,
      uploaded: true,
      file,
      note: 'Database dump guide uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Database dump guide upload failed.'
    });
  }
});

app.post('/admin/google-drive/uploads-backup-plan', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const plan = buildUploadsBackupPlan(uploadFiles);

    const report = {
      app: 'Prizetown',
      manifest_type: 'uploads_backup_plan',
      created_at: createdAt,
      api_version: 'v291',
      plan,
      note: 'This uploads planning evidence only. It does not copy all files.'
    };

    const file = await uploadJsonToGoogleDrive(`prizetown-uploads-backup-plan-${safeTimestamp}.json`, report);
    res.json({
      ok: true,
      uploaded: true,
      file,
      upload_file_count: plan.file_count,
      total_upload_bytes: plan.total_bytes,
      suggested_batch_size: plan.suggested_batch_size,
      note: 'Uploads backup plan uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Uploads backup plan upload failed.'
    });
  }
});


function buildBackupPreflightReport(latestReport, readiness, sizeReport, retentionReport, schedulePlan) {
  const checks = [
    {
      name: 'Google Drive readable',
      ok: Boolean(latestReport),
      detail: latestReport ? 'Drive backup folder can be read.' : 'Drive backup folder could not be read.'
    },
    {
      name: 'Core backup evidence present',
      ok: (latestReport?.missing_types || []).length === 0,
      detail: (latestReport?.missing_types || []).length === 0
        ? 'No core evidence types missing.'
        : `Missing: ${(latestReport?.missing_types || []).join(', ')}`
    },
    {
      name: 'Readiness score',
      ok: Number(readiness?.score || 0) >= 85,
      detail: `${readiness?.score ?? 0}/100 - ${readiness?.status || 'unknown'}`
    },
    {
      name: 'Backup files visible',
      ok: Number(sizeReport?.file_count || 0) > 0,
      detail: `${sizeReport?.file_count ?? 0} Drive files checked.`
    },
    {
      name: 'Retention is review-only',
      ok: true,
      detail: `${retentionReport?.old_candidate_count ?? 0} review candidates; no delete action is enabled.`
    },
    {
      name: 'Schedule plan available',
      ok: Boolean(schedulePlan?.recommended_schedule?.length),
      detail: `${schedulePlan?.recommended_schedule?.length ?? 0} recommended cadences.`
    }
  ];

  const failed = checks.filter((check) => !check.ok);
  return {
    checked_at: new Date().toISOString(),
    ready: failed.length === 0,
    failed_count: failed.length,
    checks,
    next_actions: failed.length === 0
      ? ['Proceed with cautious launch operations, but keep manual restore checks.']
      : failed.map((check) => check.detail)
  };
}

function buildTrueNasBackupRunbook(readiness) {
  return {
    title: 'TrueNAS backup runbook',
    api_version: 'v291',
    readiness_score: readiness?.score ?? 0,
    goal: 'Keep database, uploads and deployed image references recoverable outside the running app.',
    routine: [
      'Confirm API health returns the expected version before changes.',
      'Export or snapshot PostgreSQL data before risky changes.',
      'Back up the uploads dataset separately from the container image.',
      'Record current API and web image tags before updates.',
      'Upload backup evidence reports to Google Drive after backup actions.',
      'Keep at least one known-good rollback tag pair documented.'
    ],
    truenas_items_to_check: [
      'App/container image tags are fixed versions, never latest.',
      'Database dataset/volume is included in TrueNAS snapshots.',
      'Uploads dataset/volume is included in TrueNAS snapshots.',
      'Snapshots are retained long enough to recover from accidental deletion.',
      'A restore test has been run on a safe target.'
    ],
    suggested_manual_commands: [
      'Record current compose/YAML before changing image tags.',
      'Run a PostgreSQL dump from the database container or host context.',
      'Copy uploads dataset or confirm snapshot exists.',
      'Deploy new fixed tags only after backup evidence is created.'
    ],
    warning: 'This runbook is guidance only. It does not create snapshots or run commands.'
  };
}

function buildEmergencyRollbackRunbook(readiness) {
  return {
    title: 'Emergency rollback runbook',
    api_version: 'v291',
    readiness_score: readiness?.score ?? 0,
    first_steps: [
      'Do not make multiple changes at once during an outage.',
      'Check API /health first.',
      'Check whether public web, API, database or uploads are affected.',
      'If a new version broke the app, rollback API and web image tags to the last known working pair.',
      'If data is missing, stop writes before restoring database/uploads.'
    ],
    rollback_order: [
      'Rollback web image tag if only frontend/admin UI is broken.',
      'Rollback API image tag if endpoints or login are broken.',
      'Rollback both tags together if version mismatch is suspected.',
      'Only restore database/uploads after taking a fresh emergency copy.'
    ],
    current_expected_tags: {
      api: 'ghcr.io/christianrobertson36/prizetown-api:v291',
      web: 'ghcr.io/christianrobertson36/prizetown-web:v291'
    },
    checks_after_rollback: [
      'Confirm /health returns the rollback version.',
      'Log in to Admin.',
      'Check competitions, entries, orders and winners.',
      'Check uploaded images/files.',
      'Run Backup Readiness > Check verification matrix.'
    ],
    warning: 'This is guidance only. It does not rollback anything automatically.'
  };
}

app.get('/admin/google-drive/backup-preflight', auth('admin'), async (_req, res) => {
  try {
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const sizeReport = buildDriveSizeReport(files);
    const retentionReport = buildDriveRetentionReport(files);
    const schedulePlan = buildBackupSchedulePlan(readiness);
    const preflight = buildBackupPreflightReport(latestReport, readiness, sizeReport, retentionReport, schedulePlan);

    res.json({
      ok: true,
      preflight,
      readiness,
      note: 'Preflight is a launch/backup readiness check. It does not change data.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Backup preflight failed.'
    });
  }
});

app.post('/admin/google-drive/backup-preflight-report', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const sizeReport = buildDriveSizeReport(files);
    const retentionReport = buildDriveRetentionReport(files);
    const schedulePlan = buildBackupSchedulePlan(readiness);
    const preflight = buildBackupPreflightReport(latestReport, readiness, sizeReport, retentionReport, schedulePlan);

    const report = {
      app: 'Prizetown',
      manifest_type: 'backup_preflight_report',
      created_at: createdAt,
      api_version: 'v291',
      preflight,
      readiness,
      latest_backup_report: latestReport,
      schedule_plan: schedulePlan,
      note: 'Uploaded by admin before launch/change operations.'
    };

    const file = await uploadJsonToGoogleDrive(`prizetown-backup-preflight-report-${safeTimestamp}.json`, report);
    res.json({
      ok: true,
      uploaded: true,
      file,
      ready: preflight.ready,
      failed_count: preflight.failed_count,
      readiness,
      note: 'Backup preflight report uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Backup preflight report upload failed.'
    });
  }
});

app.post('/admin/google-drive/truenas-backup-runbook', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const runbook = buildTrueNasBackupRunbook(readiness);

    const file = await uploadJsonToGoogleDrive(`prizetown-truenas-backup-runbook-${safeTimestamp}.json`, {
      app: 'Prizetown',
      manifest_type: 'truenas_backup_runbook',
      created_at: createdAt,
      api_version: 'v291',
      runbook
    });

    res.json({
      ok: true,
      uploaded: true,
      file,
      readiness,
      note: 'TrueNAS backup runbook uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'TrueNAS backup runbook upload failed.'
    });
  }
});

app.post('/admin/google-drive/emergency-rollback-runbook', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const runbook = buildEmergencyRollbackRunbook(readiness);

    const file = await uploadJsonToGoogleDrive(`prizetown-emergency-rollback-runbook-${safeTimestamp}.json`, {
      app: 'Prizetown',
      manifest_type: 'emergency_rollback_runbook',
      created_at: createdAt,
      api_version: 'v291',
      runbook
    });

    res.json({
      ok: true,
      uploaded: true,
      file,
      readiness,
      note: 'Emergency rollback runbook uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Emergency rollback runbook upload failed.'
    });
  }
});


function buildScheduledBackupReadiness(preflight, readiness, schedulePlan, uploadFiles) {
  const checks = [
    {
      name: 'Preflight passed',
      ok: Boolean(preflight?.ready),
      detail: preflight?.ready ? 'Preflight checks are ready.' : `${preflight?.failed_count ?? 0} preflight checks need attention.`
    },
    {
      name: 'Readiness score high enough',
      ok: Number(readiness?.score || 0) >= 85,
      detail: `${readiness?.score ?? 0}/100`
    },
    {
      name: 'Schedule plan exists',
      ok: Boolean(schedulePlan?.recommended_schedule?.length),
      detail: `${schedulePlan?.recommended_schedule?.length ?? 0} planned cadences.`
    },
    {
      name: 'Uploads visible locally',
      ok: uploadFiles.length >= 0,
      detail: `${uploadFiles.length} uploads currently counted.`
    },
    {
      name: 'Manual restore drill still required',
      ok: false,
      detail: 'Run at least one safe restore drill before trusting scheduled backups fully.'
    }
  ];

  const blocking = checks.filter((check) => !check.ok && check.name !== 'Manual restore drill still required');
  return {
    ready_for_scheduler_setup: blocking.length === 0,
    blocking_count: blocking.length,
    checks,
    suggested_next_step: blocking.length === 0
      ? 'Create scheduler outside the app using TrueNAS/cron/system task and keep fixed Docker tags.'
      : 'Fix blocking checks before creating a scheduled backup job.'
  };
}

function buildScheduledBackupSpec(readiness) {
  return {
    app: 'Prizetown',
    api_version: 'v291',
    spec_type: 'scheduled_backup_job_spec',
    timezone: 'Europe/London',
    jobs: [
      {
        name: 'daily-database-backup',
        cadence: 'daily',
        suggested_time: '02:00',
        action: 'Run pg_dump or TrueNAS database backup job.',
        output: 'PostgreSQL dump copied to protected backup storage.'
      },
      {
        name: 'daily-uploads-backup',
        cadence: 'daily',
        suggested_time: '02:15',
        action: 'Copy/snapshot uploads dataset.',
        output: 'Uploads folder backup or dataset snapshot.'
      },
      {
        name: 'daily-google-drive-evidence',
        cadence: 'daily',
        suggested_time: '02:30',
        action: 'Upload backup evidence pack/audit reports to Google Drive.',
        output: 'JSON evidence files in the configured Google Drive backup folder.'
      },
      {
        name: 'weekly-restore-drill-template',
        cadence: 'weekly',
        suggested_time: 'Sunday 03:00',
        action: 'Upload restore drill evidence template and review backup health.',
        output: 'Restore drill evidence file.'
      }
    ],
    readiness_score_at_creation: readiness?.score ?? 0,
    notes: [
      'This is a job specification only; it does not create scheduled jobs.',
      'Keep scheduled jobs outside the app on TrueNAS or another trusted host.',
      'Never use latest Docker tags for scheduled rollback or deployment tasks.'
    ]
  };
}

function buildEnvironmentChecklist() {
  const { folderId, serviceAccountJson, credentialsFile } = getGoogleDriveBackupConfig();
  return {
    app: 'Prizetown',
    api_version: 'v291',
    checklist_type: 'environment_backup_checklist',
    checks: [
      { name: 'DATABASE_URL configured', ok: Boolean(process.env.DATABASE_URL) },
      { name: 'PUBLIC_API_URL configured', ok: Boolean(process.env.PUBLIC_API_URL) },
      { name: 'Google Drive folder ID configured', ok: Boolean(folderId) },
      { name: 'Google Drive credentials configured', ok: Boolean(serviceAccountJson || credentialsFile) },
      { name: 'Uploads directory configured', ok: Boolean(uploadDir) },
      { name: 'Uploads directory exists', ok: Boolean(uploadDir && fs.existsSync(uploadDir)) },
      { name: 'Fixed API tag expected', ok: true, expected: 'ghcr.io/christianrobertson36/prizetown-api:v291' },
      { name: 'Fixed web tag expected', ok: true, expected: 'ghcr.io/christianrobertson36/prizetown-web:v291' }
    ],
    secret_policy: [
      'This checklist does not include secret values.',
      'Store service account JSON and database passwords only in protected TrueNAS/app settings.',
      'Do not commit secrets into GitHub.'
    ]
  };
}

function buildLaunchGoNoGo(preflight, scheduledReadiness, envChecklist, readiness) {
  const envFailed = (envChecklist.checks || []).filter((check) => !check.ok);
  const go = Boolean(preflight?.ready) && Boolean(scheduledReadiness?.ready_for_scheduler_setup) && envFailed.length === 0 && Number(readiness?.score || 0) >= 85;
  return {
    decision: go ? 'GO_WITH_CAUTION' : 'NO_GO_FIX_ITEMS_FIRST',
    generated_at: new Date().toISOString(),
    readiness_score: readiness?.score ?? 0,
    preflight_ready: Boolean(preflight?.ready),
    scheduler_ready: Boolean(scheduledReadiness?.ready_for_scheduler_setup),
    environment_failed_count: envFailed.length,
    required_before_go_live: go ? [] : [
      ...(preflight?.ready ? [] : ['Fix backup preflight failed checks.']),
      ...(scheduledReadiness?.ready_for_scheduler_setup ? [] : ['Fix scheduled backup readiness blockers.']),
      ...(envFailed.length ? ['Fix missing environment/config checks.'] : []),
      ...(Number(readiness?.score || 0) >= 85 ? [] : ['Raise backup readiness score to at least 85.'])
    ],
    notes: [
      'GO still means launch cautiously and keep manual monitoring.',
      'NO_GO means do not rely on backups/launch readiness until listed items are fixed.',
      'This report does not make any live changes.'
    ]
  };
}

app.get('/admin/google-drive/scheduled-backup-readiness', auth('admin'), async (_req, res) => {
  try {
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const sizeReport = buildDriveSizeReport(files);
    const retentionReport = buildDriveRetentionReport(files);
    const schedulePlan = buildBackupSchedulePlan(readiness);
    const preflight = buildBackupPreflightReport(latestReport, readiness, sizeReport, retentionReport, schedulePlan);
    const scheduledReadiness = buildScheduledBackupReadiness(preflight, readiness, schedulePlan, uploadFiles);

    res.json({
      ok: true,
      scheduled_readiness: scheduledReadiness,
      readiness,
      note: 'Readiness only. This does not create scheduled jobs.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Scheduled backup readiness check failed.'
    });
  }
});

app.post('/admin/google-drive/scheduled-backup-spec', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const spec = buildScheduledBackupSpec(readiness);

    const file = await uploadJsonToGoogleDrive(`prizetown-scheduled-backup-spec-${safeTimestamp}.json`, {
      app: 'Prizetown',
      manifest_type: 'scheduled_backup_spec',
      created_at: createdAt,
      api_version: 'v291',
      spec
    });

    res.json({
      ok: true,
      uploaded: true,
      file,
      job_count: spec.jobs.length,
      readiness,
      note: 'Scheduled backup specification uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Scheduled backup spec upload failed.'
    });
  }
});

app.post('/admin/google-drive/environment-checklist-report', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const checklist = buildEnvironmentChecklist();
    const failed = checklist.checks.filter((check) => !check.ok);

    const file = await uploadJsonToGoogleDrive(`prizetown-environment-checklist-${safeTimestamp}.json`, {
      app: 'Prizetown',
      manifest_type: 'environment_checklist_report',
      created_at: createdAt,
      api_version: 'v291',
      checklist
    });

    res.json({
      ok: true,
      uploaded: true,
      file,
      failed_count: failed.length,
      check_count: checklist.checks.length,
      note: 'Environment checklist uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Environment checklist upload failed.'
    });
  }
});

app.post('/admin/google-drive/launch-go-no-go-report', auth('admin'), async (_req, res) => {
  try {
    const createdAt = new Date().toISOString();
    const safeTimestamp = createdAt.replace(/[:.]/g, '-');
    const files = await listGoogleDriveBackupFolderFiles(100);
    const latestReport = buildGoogleDriveLatestBackupReport(files);
    const uploadFiles = typeof listUploadFilesForManifest === 'function' ? listUploadFilesForManifest(uploadDir) : [];
    const readiness = calculateBackupReadinessScore(latestReport, uploadFiles);
    const sizeReport = buildDriveSizeReport(files);
    const retentionReport = buildDriveRetentionReport(files);
    const schedulePlan = buildBackupSchedulePlan(readiness);
    const preflight = buildBackupPreflightReport(latestReport, readiness, sizeReport, retentionReport, schedulePlan);
    const scheduledReadiness = buildScheduledBackupReadiness(preflight, readiness, schedulePlan, uploadFiles);
    const envChecklist = buildEnvironmentChecklist();
    const goNoGo = buildLaunchGoNoGo(preflight, scheduledReadiness, envChecklist, readiness);

    const file = await uploadJsonToGoogleDrive(`prizetown-launch-go-no-go-${safeTimestamp}.json`, {
      app: 'Prizetown',
      manifest_type: 'launch_go_no_go_report',
      created_at: createdAt,
      api_version: 'v291',
      go_no_go: goNoGo,
      readiness,
      preflight,
      scheduled_readiness: scheduledReadiness,
      environment_checklist: envChecklist
    });

    res.json({
      ok: true,
      uploaded: true,
      file,
      decision: goNoGo.decision,
      readiness,
      required_count: goNoGo.required_before_go_live.length,
      note: 'Launch go/no-go report uploaded to Google Drive.'
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Launch go/no-go report upload failed.'
    });
  }
});

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

  // v275: launch security hardening checks
  const adminEmail = process.env.ADMIN_EMAIL || '';
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const jwtSecret = process.env.JWT_SECRET || '';
  const publicApiUrl = process.env.PUBLIC_API_URL || '';
  const defaultAdminEmail = adminEmail.trim().toLowerCase() === 'admin@prizetown.local';
  const weakAdminPassword = !adminPassword || ['admin123', 'password', 'password123', 'changeme', 'change_this_password'].includes(adminPassword.trim().toLowerCase()) || adminPassword.length < 12;
  const weakJwtSecret = !jwtSecret || jwtSecret.length < 32 || /change_this|changeme|secret|password|default/i.test(jwtSecret);
  const publicApiNotHttps = publicApiUrl && !publicApiUrl.toLowerCase().startsWith('https://');

  add(defaultAdminEmail ? 'warning' : 'ok', 'Security: admin email', defaultAdminEmail ? 'Default admin email is still configured. Change this before public launch.' : 'Admin email does not look like the default demo value.');
  add(weakAdminPassword ? 'warning' : 'ok', 'Security: admin password', weakAdminPassword ? 'Admin password appears default, missing or too short. Use a strong unique password before launch.' : 'Admin password is configured and does not match common demo values.');
  add(weakJwtSecret ? 'warning' : 'ok', 'Security: JWT secret', weakJwtSecret ? 'JWT_SECRET is missing, too short or looks like a placeholder. Use a long random secret before launch.' : 'JWT_SECRET is configured and does not look like a common placeholder.');
  add(publicApiNotHttps ? 'warning' : 'ok', 'Security: public API HTTPS', publicApiNotHttps ? 'PUBLIC_API_URL is not HTTPS. Public launch should use HTTPS only.' : (publicApiUrl ? 'PUBLIC_API_URL uses HTTPS.' : 'PUBLIC_API_URL is not set.'));
  add('ok', 'Security: headers and login rate limit', 'Basic security headers are enabled and login-style POST requests have a lightweight in-memory rate limit.', { login_limit_max: v276LoginLimitMax, login_limit_window_minutes: Math.round(v276LoginLimitWindowMs / 60000) });
  add('ok', 'Security: CORS origin allowlist', 'Browser-origin allowlist is enabled for public site, admin/Tailscale and local testing origins.', { allowed_origins: Array.from(v278AllowedOrigins) });
  add('ok', 'Security: event log', 'Recent blocked security events are kept in memory for admin review.', { recent_events: v279SecurityEvents.length, max_events: v279SecurityEventMax });

  add('ok', 'API version', 'Prizetown API is running.', { version: 'v291' });
  add('ok', 'Configured public API URL', process.env.PUBLIC_API_URL || 'Not set.');
  add(resendApiKey ? 'ok' : 'warning', 'Transactional email', resendApiKey ? `Configured from ${emailFrom} with reply-to ${emailReplyTo}.` : 'RESEND_API_KEY is not configured yet.');
  add(resendApiKey && emailFrom ? 'ok' : 'warning', 'Email: readiness tools', resendApiKey && emailFrom ? 'Email provider settings look configured. Send a test email before enabling automatic customer emails.' : 'Email readiness tools are available, but provider settings are incomplete.', buildEmailReadinessV281());
  add('ok', 'Email: manual workflow centre', 'Manual email template preview/send tools are available for admin use. Automatic customer emails remain disabled until payment webhook safety is ready.', { templates: Object.keys(buildEmailTemplatesV282()) });
  add('ok', 'Email: manual sender UI', 'Admin manual email sender UI is available with typed SEND_EMAIL confirmation. Automatic customer emails remain disabled.', { requires_confirmation: 'SEND_EMAIL' });
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
    version: 'v291',
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
  .then(() => app.listen(port, () => console.log(`Prizetown API running on ${port} (v286 visible spinner gallery)`)))
  .catch((err) => {
    console.error('Failed to start API', err);
    process.exit(1);
  });



