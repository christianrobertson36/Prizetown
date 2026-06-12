
function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.rows)) return value.rows;
  if (value && Array.isArray(value.items)) return value.items;
  if (value && Array.isArray(value.data)) return value.data;
  if (value && Array.isArray(value.competitions)) return value.competitions;
  if (value && Array.isArray(value.entries)) return value.entries;
  return [];
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Gift, Trophy, User, Shield, LogOut, Plus, Trash2, Pencil, Ticket, Sparkles, ShoppingCart, ClipboardList, Zap, Clock, ListChecks } from 'lucide-react';
import { api, imageUrl } from './api';
import './styles.css';

function money(pence) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((pence || 0) / 100);
}
function slugify(value) { return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function fmtDate(value) { return value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'TBC'; }
function daysLeft(value) {
  if (!value) return 'TBC';
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return 'Closed';
  const d = Math.floor(ms / 86400000); const h = Math.floor((ms % 86400000) / 3600000); const m = Math.floor((ms % 3600000) / 60000);
  return `${d} Days ${h} Hrs ${m} Mins`;
}


function competitionTheme(c) {
  const t = `${c?.title || ''} ${c?.description || ''}`.toLowerCase();
  if (/car|bmw|audi|mercedes|vw|volkswagen|ford|range rover|vehicle/.test(t)) return { key: 'car', label: 'MOTOR' };
  if (/cash|£|pound|money|voucher|prize pot/.test(t)) return { key: 'cash', label: 'CASH' };
  if (/holiday|trip|travel|flight|hotel|disney|dubai|cruise/.test(t)) return { key: 'holiday', label: 'HOLIDAY' };
  if (/iphone|ipad|phone|ps5|playstation|xbox|nintendo|switch|laptop|macbook|tech|console|tv/.test(t)) return { key: 'tech', label: 'TECH' };
  if (/garden|kitchen|sofa|furniture|home|appliance/.test(t)) return { key: 'home', label: 'HOME' };
  return { key: 'prize', label: 'PRIZE' };
}
function shortPrizeLabel(c) {
  const title = String(c?.title || 'Featured Prize').replace(/\s+/g, ' ').trim();
  return title.length > 34 ? `${title.slice(0, 34)}…` : title;
}
function fallbackPosterUrl(c) {
  return `/demo-posters/${competitionTheme(c).key}.svg`;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const angle = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + (r * Math.cos(angle)), y: cy + (r * Math.sin(angle)) };
}

function wheelSlicePath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

function WheelNumberLabels() {
  return null;
}

function buildWheelTickets(rows = [], winner = null) {
  const safeRows = safeArray(rows)
    .filter(e => Number(e?.ticket_number || e?.ticket || 0) > 0)
    .sort((a, b) => Number(a.ticket_number || a.ticket) - Number(b.ticket_number || b.ticket));

  if (safeRows.length === 0) {
    return Array.from({ length: 24 }, (_, i) => ({ label: `#${i + 1}`, from: i + 1, to: i + 1, ticket_number: i + 1 }));
  }

  const maxSegments = safeRows.length <= 100 ? safeRows.length : safeRows.length <= 250 ? 120 : safeRows.length <= 500 ? 160 : 200;

  if (safeRows.length <= maxSegments) {
    return safeRows.map(e => {
      const n = Number(e.ticket_number || e.ticket);
      return { ticket_number: n, from: n, to: n, label: `#${n}`, customer_name: e.customer_name || e.name || '' };
    });
  }

  const groups = [];
  const groupSize = Math.ceil(safeRows.length / maxSegments);
  for (let i = 0; i < safeRows.length; i += groupSize) {
    const chunk = safeRows.slice(i, i + groupSize);
    const first = Number(chunk[0].ticket_number || chunk[0].ticket);
    const last = Number(chunk[chunk.length - 1].ticket_number || chunk[chunk.length - 1].ticket);
    groups.push({
      from: first,
      to: last,
      ticket_number: first,
      label: first === last ? `#${first}` : `#${first}–#${last}`,
      customer_name: ''
    });
  }
  return groups;
}

function wheelRotationForWinner(tickets = [], winnerTicket, currentRotation = 0) {
  const rows = safeArray(tickets);
  const total = Math.max(1, rows.length);
  const index = Math.max(0, rows.findIndex(seg => {
    const n = Number(winnerTicket || 0);
    return n >= Number(seg.from || seg.ticket_number || 0) && n <= Number(seg.to || seg.ticket_number || 0);
  }));
  const slice = 360 / total;
  const winningAngle = index * slice;
  const currentNormalised = ((Number(currentRotation || 0) % 360) + 360) % 360;
  const correction = (360 - ((currentNormalised + winningAngle) % 360)) % 360;
  return Number(currentRotation || 0) + (360 * 9) + correction;
}

function TrustedWheelDraw({ mode = 'idle', winner = null, tickets = [], rotation = 0, label = 'PRIZETOWN FINAL DRAW', spinnerStyle = 'classic', showTicketLabels = true }) {
  const rows = safeArray(tickets);
  const isSpinning = mode === 'spinning';
  const isWinner = mode === 'winner' && winner;
  const segments = rows.length ? rows : Array.from({ length: 24 }, (_, i) => ({ label: `#${i + 1}`, from: i + 1, to: i + 1 }));
  const slice = 360 / Math.max(1, segments.length);
  const colours = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#2563eb', '#7c3aed', '#db2777'];
  const showLabels = showTicketLabels && segments.length <= 100;
  const useTicketSquares = spinnerStyle === 'ticket-squares';
  const ticketNumbers = segments.map(seg => Number(seg.ticket_number || seg.from || 0)).filter(Boolean);
  const [shuffleNumber, setShuffleNumber] = useState(ticketNumbers[0] || 1);

  useEffect(() => {
    if (isWinner && winner?.ticket_number) {
      setShuffleNumber(Number(winner.ticket_number));
      return;
    }
    if (!isSpinning) {
      setShuffleNumber(ticketNumbers[0] || 1);
      return;
    }
    const timer = setInterval(() => {
      const picked = ticketNumbers[Math.floor(Math.random() * ticketNumbers.length)] || Math.ceil(Math.random() * 999);
      setShuffleNumber(picked);
    }, 75);
    return () => clearInterval(timer);
  }, [isSpinning, isWinner, winner?.ticket_number, tickets.length]);

  return <div className={`trusted-wheel-draw ${isSpinning ? 'is-spinning' : ''} ${isWinner ? 'has-winner' : ''}`}>
    <div className="trusted-wheel-wrap">
      <div className="trusted-wheel-pointer" aria-label="Stop point"></div>
      <svg className="trusted-wheel-svg" viewBox="0 0 500 500" role="img" aria-label="Prizetown draw wheel">
        <defs>
          <clipPath id="trustedWheelLogoClip">
            <circle cx="250" cy="250" r="58" />
          </clipPath>
        </defs>
        <g className="trusted-wheel-rotor" style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '250px 250px' }}>
          {segments.map((seg, i) => {
            const start = -slice / 2 + i * slice;
            const end = start + slice;
            const mid = i * slice;
            const textPoint = polarToCartesian(250, 250, 202, mid);
            const isWinningSegment = winner && Number(winner.ticket_number || 0) >= Number(seg.from || seg.ticket_number || 0) && Number(winner.ticket_number || 0) <= Number(seg.to || seg.ticket_number || 0);
            if (useTicketSquares) {
              const totalSquares = Math.max(1, segments.length);
              const goldenAngle = Math.PI * (3 - Math.sqrt(5));
              const t = totalSquares <= 1 ? 0 : i / (totalSquares - 1);
              const radius = Math.sqrt(t) * 205;
              const angle = i * goldenAngle;
              const x = 250 + Math.cos(angle) * radius;
              const y = 250 + Math.sin(angle) * radius;
              const size = totalSquares > 1200 ? 3 : totalSquares > 700 ? 4 : totalSquares > 300 ? 5 : 7;
              return <rect
                key={'ticket-square-' + (seg.label || seg.ticket_number || i) + '-' + i}
                className={isWinningSegment ? 'ticket-square winning-segment' : 'ticket-square'}
                x={x - size / 2}
                y={y - size / 2}
                width={size}
                height={size}
                rx={Math.max(1, size / 4)}
                fill={colours[i % colours.length]}
              />;
            }
            return <g key={`${seg.label || seg.ticket_number || i}-${i}`} className={isWinningSegment ? 'winning-segment' : ''}>
              <path d={wheelSlicePath(250, 250, 230, start, end)} fill={colours[i % colours.length]} />
              {showLabels && <text
                x={textPoint.x}
                y={textPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="trusted-wheel-label trusted-wheel-label-oriented"
                transform={`rotate(${mid > 90 && mid < 270 ? mid + 180 : mid}, ${textPoint.x}, ${textPoint.y})`}
              >{seg.label || `#${seg.ticket_number || i + 1}`}</text>}
            </g>;
          })}
        </g>
        <circle cx="250" cy="250" r="112" className="trusted-wheel-centre trusted-wheel-centre-number-bg" />
        <text x="250" y="255" textAnchor="middle" className="trusted-wheel-centre-number">#{shuffleNumber}</text>
        <text x="250" y="303" textAnchor="middle" className="trusted-wheel-centre-sub">{isWinner ? 'WINNER CONFIRMED' : isSpinning ? 'DRAWING LIVE' : 'READY TO DRAW'}</text>
      </svg>
    </div>
    <div className="trusted-wheel-result">
      {isWinner ? <>
        <p className="reveal-kicker">Winner selected</p>
        <h2>Ticket #{winner.ticket_number}</h2>
        <h3>{winner.customer_name || winner.name || 'Customer'}</h3>
      </> : isSpinning ? <>
        <p className="reveal-kicker">Drawing live</p>
        <h2>Wheel spinning...</h2>
        <h3>The winner will reveal when the wheel stops</h3>
      </> : <>
        <p className="reveal-kicker">Ready</p>
        <h2>{label}</h2>
        <h3>Draw preview ready</h3>
      </>}
    </div>
    <p className="trusted-wheel-note">The wheel display is generated from eligible entries. Large draws use grouped ticket ranges, with the exact winning ticket shown in the reveal.</p>
  </div>;
}


const defaultSettings = {
  site_name: 'Prizetown',
  support_email: 'support@prizetown.local',
  logo_url: '/prizetown-logo.png',
  favicon_url: '',
  brand_primary_color: '#facc15',
  brand_accent_color: '#f97316',
  brand_background_color: '#08101f',
  brand_button_text_color: '#08101f',
  brand_footer_credit: 'Website by Neotech Designs',
  brand_footer_link_url: 'https://ctec-shop.co.uk',
  brand_footer_link_label: 'ctec-shop.co.uk',
  hero_eyebrow: 'Postcode prize competitions',
  hero_title: 'Win big prizes with Prizetown',
  hero_text: 'Browse live postcode prize competitions, add tickets to your basket, answer the entry question and receive your ticket numbers securely.',
  footer_text: 'Prizetown runs postcode-based prize competitions with clear entry limits, responsible play guidance and transparent draw information.',
  social_facebook_url: '',
  social_instagram_url: '',
  social_tiktok_url: '',
  social_x_url: '',
  social_youtube_url: '',
  youtube_live_url: '',
  spinner_style: 'classic',
  welcome_marquee_text: 'Welcome to Prizetown! | New competitions added regularly | Instant wins and final draw prizes | Enter responsibly and good luck',
  free_entry_global: `Free Postal Entry Route

Where a competition offers free postal entry, postal entries must be submitted before the stated deadline and must include the required details clearly and legibly.

Unless the individual competition page says otherwise, include:
- Full name
- Date of birth
- Email address
- Contact telephone number
- Full postal address and postcode
- Competition name
- The answer to the competition question, where required

Each postal entry must be sent separately. Bulk, automated, mechanically reproduced, incomplete, illegible or late entries may be rejected. Valid free entries are given the same chance of winning as paid entries and are entered into the same draw.

The postal address and any competition-specific deadline should be shown on the competition page or in Admin settings before launch.`,
  terms_text: `Prizetown Terms and Conditions

1. About Prizetown
Prizetown operates postcode-based prize competitions. Each competition page explains the prize, ticket price, closing date, maximum tickets, maximum entries per user, eligibility rules, draw method and any free-entry route.

2. Eligibility
Unless stated otherwise on a competition page, entries are open to UK residents aged 18 or over. You must provide accurate account and contact details. We may ask a winner to provide proof of identity, age, address and eligibility before a prize is awarded.

3. How to enter
You can enter online by selecting tickets, answering the competition question and completing checkout. Where a free postal entry route is offered, free entries are treated fairly and entered into the same draw as paid entries, subject to the competition rules and deadlines.

4. Competition questions
Competitions may require a question or skill element. Incorrect, incomplete, automated, bulk, fraudulent or duplicate entries may be rejected.

5. Ticket numbers and limits
Ticket numbers are allocated after a valid entry is accepted. Each competition may have a maximum number of tickets, a maximum number per user and postcode availability rules. We may refuse or cancel entries that breach these limits.

6. Draws and winner selection
Final draws are made from valid entries after the closing date or when the competition sells out, depending on the competition rules. Instant-win prizes, where offered, are awarded when a valid ticket matches a configured winning ticket number. Draw records may be kept for audit and transparency.

7. Prizes
Prizes are as described on the competition page. Prizes are non-transferable unless we agree otherwise. We may substitute a prize of equal or greater value if the advertised prize becomes unavailable for reasons outside our reasonable control.

8. Winner contact and publication
Winners will be contacted using the details on their account or entry. Winner names, initials, town/county and prize details may be published for transparency unless a lawful objection applies.

9. Refunds, cancellations and changes
We may cancel, extend, amend or withdraw a competition where necessary for technical, legal, operational or fairness reasons. If a competition is cancelled, eligible paid entries may be refunded or handled as stated on the competition page.

10. Fair use and fraud prevention
We may suspend accounts, void entries or withhold prizes where we reasonably suspect fraud, abuse, automated entry, payment issues, chargebacks, false information, multiple-account abuse or breach of the rules.

11. Liability
Prizetown is not responsible for losses caused by incorrect details provided by entrants, internet failures, email delivery issues, third-party payment problems or events outside our reasonable control, except where the law says liability cannot be limited.

12. Responsible play
Only enter what you can afford. Prizetown is intended as entertainment, not a way to make money. If entering competitions stops being fun, take a break.

13. Governing law
These terms are intended for use in the United Kingdom and are governed by the laws of England and Wales unless mandatory local laws apply.

14. Contact
For support, contact us using the support email shown on the website.`,
  privacy_text: `Prizetown Privacy Notice

1. Who we are
Prizetown collects and uses personal information to operate postcode-based prize competitions, customer accounts, entries, orders, free-entry processing, winner contact and website administration.

2. Information we collect
We may collect your name, email address, password hash, postcode, contact details, entry details, ticket numbers, order details, payment references, IP/device information, support messages, free-entry details and winner verification information.

3. Why we use your information
We use personal information to create accounts, process entries, allocate tickets, run draws, contact winners, prevent fraud, manage refunds or chargebacks, provide support, keep audit records, comply with legal obligations and improve the website.

4. Lawful bases
Depending on the activity, we may rely on contract, legal obligation, legitimate interests and consent. For example, we need some details to provide competition entry services and may need to keep records for accounting, fraud prevention and compliance.

5. Sharing information
We may share information with service providers such as hosting providers, payment processors, email providers, professional advisers, fraud-prevention services or regulators where necessary. We do not sell personal information.

6. Winner publication
For transparency, winner details such as name, initials, general location and prize won may be published where lawful. You can contact us if you have a concern about winner publication.

7. How long we keep information
We keep information only as long as needed for competition administration, customer support, accounting, legal, fraud-prevention and audit purposes.

8. Your rights
You may have rights to access, correct, delete, restrict or object to use of your personal information, and to complain to the Information Commissioner's Office if you are unhappy with how your data is handled.

9. Security
We use reasonable technical and organisational measures to protect account, entry and order information.

10. Contact
For privacy questions, contact the support email shown on the website.`,
  cookie_text: `Cookie Notice

Prizetown may use essential cookies or local storage to keep you logged in, remember your basket and operate the website securely. These are needed for the site to work.

If analytics, advertising pixels or optional tracking tools are added later, the cookie notice should be updated and a consent banner should be used where required.

You can control cookies through your browser settings, but blocking essential cookies may stop account, basket or checkout features working correctly.`,
  refund_text: `Refunds and Cancellations

Entries are normally final once ticket numbers are allocated, unless the law requires otherwise or Prizetown agrees a refund.

We may refund or cancel entries where:
- A competition is cancelled
- A payment error occurs
- Duplicate or incorrect entries are identified
- A customer breaches entry limits
- Fraud, chargeback or abuse is suspected
- A technical issue affects fairness

If a competition is cancelled, Prizetown may refund eligible paid entries or offer another fair remedy. Free entries do not create a cash refund entitlement.`,
  winner_publication_text: 'Winner names, initials, general location and prize details may be published for transparency unless a lawful objection applies.',
  responsible_play_text: '18+ only. Please enter responsibly. Do not spend more than you can afford.',
  age_confirmation_text: 'I confirm I am 18 or over and I agree to the competition rules, terms, privacy notice and free-entry terms.',
  promoter_text: 'Promoter details can be edited in Admin → Legal Text. Add your trading name, address and company details before full public launch.',
  postal_entry_address: 'Add postal entry address in Admin → Legal Text.',
  cookie_banner_text: 'We use essential cookies/local storage to keep the basket, login and security features working. Optional analytics or marketing cookies will only be used if you accept them.',
  legal_disclaimer_text: 'Prizetown is for UK residents aged 18+. Please enter responsibly and only spend what you can afford. Free postal entry is available where offered, and all entries are subject to the competition rules, terms and privacy notice.',
  popup_terms_label: 'I am 18 or over and understand Prizetown is a prize competition platform, not a guaranteed way to make money.',
  module_postcodes_enabled: 'true',
  module_instant_wins_enabled: 'true',
  module_live_draw_enabled: 'true',
  module_arnold_enabled: 'true',
  module_wheel_demo_enabled: 'true',
  module_profit_planner_enabled: 'true',
  module_cookie_legal_enabled: 'true'
};

function featureEnabled(settings, key) {
  return String((settings || {})[key] ?? 'true') !== 'false';
}


function siteLogo(settings) {
  return imageUrl((settings || {}).logo_url || '/prizetown-logo.png');
}
function brandStyle(settings = {}) {
  return {
    '--brand-primary': settings.brand_primary_color || '#facc15',
    '--brand-accent': settings.brand_accent_color || '#f97316',
    '--brand-bg': settings.brand_background_color || '#08101f',
    '--brand-button-text': settings.brand_button_text_color || '#08101f'
  };
}

function initialPage() { const p = window.location.pathname.toLowerCase(); if (p.includes('/draw-live') || p.includes('/draw-broadcast')) return 'draw-broadcast'; if (p.includes('/admin')) return 'admin'; if (p.includes('/account')) return 'account'; if (p.includes('/cart')) return 'cart'; if (p.includes('/about')) return 'about'; if (p.includes('/fair-draws')) return 'fair-draws'; if (p.includes('/how-it-works')) return 'how-it-works'; if (p.includes('/entry-lists')) return 'entry-lists'; if (p.includes('/winners')) return 'winners'; if (p.includes('/privacy')) return 'privacy'; if (p.includes('/terms')) return 'terms'; if (p.includes('/free-entry')) return 'free-entry'; if (p.includes('/cookies')) return 'cookies'; if (p.includes('/refunds')) return 'refunds'; return 'home'; }


class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong' };
  }

  componentDidCatch(error, info) {
    console.error('Prizetown screen error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <main>
        <section className="panel checkout-error">
          <h1>Screen error</h1>
          <p>{this.state.message}</p>
          <button className="primary" onClick={() => window.location.reload()}>Reload Prizetown</button>
        </section>
      </main>;
    }

    return this.props.children;
  }
}

function App() {
  const [page, setPageState] = useState(initialPage());
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('prizetown_user') || 'null'));
  const [competitions, setCompetitions] = useState([]);
  const [winners, setWinners] = useState([]);
  const [instantWinners, setInstantWinners] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [entries, setEntries] = useState([]);
  const [orders, setOrders] = useState([]);
  const [adminEntries, setAdminEntries] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);
  const [adminAudit, setAdminAudit] = useState([]);
  const [adminInstantWins, setAdminInstantWins] = useState([]);
  const [adminPostcodeZones, setAdminPostcodeZones] = useState([]);
  const [adminPostcodeAssignments, setAdminPostcodeAssignments] = useState([]);
  const [message, setMessage] = useState('');
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem('prizetown_cart') || '[]'));
  const [selected, setSelected] = useState(null);
  const [cookieChoice, setCookieChoice] = useState(() => localStorage.getItem('prizetown_cookie_choice') || '');
  const [showCookiePrefs, setShowCookiePrefs] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(() => localStorage.getItem('prizetown_legal_disclaimer_v1') === 'accepted');

  function setPage(next) { setPageState(next); window.history.replaceState(null, '', next === 'home' ? '/' : `/${next}`); }
  function saveCart(next) { setCart(next); localStorage.setItem('prizetown_cart', JSON.stringify(next)); }
  function saveCookieChoice(choice) {
    localStorage.setItem('prizetown_cookie_choice', choice);
    setCookieChoice(choice);
    setShowCookiePrefs(false);
  }
  function resetCookieChoice() {
    localStorage.removeItem('prizetown_cookie_choice');
    setCookieChoice('');
    setShowCookiePrefs(true);
  }
  function acceptLegalDisclaimer() {
    localStorage.setItem('prizetown_legal_disclaimer_v1', 'accepted');
    setLegalAccepted(true);
  }
  function goHomeCompetitions() {
    setPage('home');
    setTimeout(() => {
      document.getElementById('competitions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }
  async function load() {
    const [comps, wins, siteSettings, iw] = await Promise.all([api('/competitions'), api('/winners'), api('/settings'), api('/instant-winners')]);
    setCompetitions(comps); setWinners(wins); setSettings({ ...defaultSettings, ...siteSettings }); setInstantWinners(iw);
  }
  async function loadAccount() { if (!user) return; const [myEntries, myOrders] = await Promise.all([api('/me/entries'), api('/me/orders')]); setEntries(myEntries); setOrders(myOrders); }
  async function loadAdminData() { if (user?.role !== 'admin') return; const [rows, orderRows, auditRows, iw, zones, assignments] = await Promise.all([api('/admin/entries'), api('/admin/orders'), api('/admin/audit-logs'), api('/admin/instant-wins'), api('/admin/postcode-zones'), api('/admin/competition-postcode-assignments')]); setAdminEntries(rows); setAdminOrders(orderRows); setAdminAudit(auditRows); setAdminInstantWins(iw); setAdminPostcodeZones(zones); setAdminPostcodeAssignments(assignments); }
  useEffect(() => { load().catch(err => setMessage(err.message)); }, []);
  useEffect(() => {
    if (!settings.favicon_url) return;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = imageUrl(settings.favicon_url);
  }, [settings.favicon_url]);

  useEffect(() => { if (user) loadAccount().catch(() => {}); }, [user]);
  useEffect(() => { if (user?.role === 'admin') loadAdminData().catch(() => {}); }, [user]);
  function logout() { localStorage.removeItem('prizetown_token'); localStorage.removeItem('prizetown_user'); setUser(null); setEntries([]); setOrders([]); setPage('home'); }
  const active = competitions.filter(c => c.status === 'active');
  const homepageCompetitions = active.length > 0 ? active : competitions;
  const cartCount = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (page === 'draw-broadcast') {
    return <DrawBroadcastPage setPage={setPage} />;
  }

  const welcomeMarqueeText = settings.welcome_marquee_text || defaultSettings.welcome_marquee_text;
  const welcomeMarqueeItems = String(welcomeMarqueeText || '')
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);
  const welcomeMarqueeLoop = welcomeMarqueeItems.length ? [...welcomeMarqueeItems, ...welcomeMarqueeItems, ...welcomeMarqueeItems] : [];

  return <div style={brandStyle(settings)}>
    <div className="welcome-marquee" aria-label="Welcome message"><div className="marquee-track">{welcomeMarqueeLoop.map((item, index) => <span key={index}>{item}</span>)}</div></div>
    <header className="topbar"><button className="brand logo-brand" onClick={() => setPage('home')}><img src={siteLogo(settings)} alt={settings.site_name || 'Prizetown'} /><span>{settings.site_name || 'Prizetown'}</span></button><nav>
      <button type="button" onClick={() => { setPage('home'); setTimeout(() => document.getElementById('competitions')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); }}>Competitions</button><button onClick={() => setPage('how-it-works')}>How it works</button><button onClick={() => setPage('about')}>About</button><button onClick={() => setPage('fair-draws')}>Fair draws</button><button onClick={() => setPage('entry-lists')}>Entry Lists</button><button onClick={() => setPage('winners')}>Winners</button><button onClick={() => setPage('terms')}>Terms</button>
      {user && <button onClick={() => { setPage('account'); loadAccount().catch(err => setMessage(err.message)); }}><ClipboardList size={16} /> My entries</button>}
      <button onClick={() => setPage('cart')}><ShoppingCart size={16} /> Basket {cartCount > 0 ? `(${cartCount})` : ''}</button>
      {user?.role === 'admin' && <button onClick={() => { setPage('admin'); loadAdminData().catch(err => setMessage(err.message)); }}><Shield size={16} /> Admin</button>}
      {user ? <button onClick={logout}><LogOut size={16} /> Logout</button> : <button onClick={() => setPage('login')}><User size={16} /> Login</button>}
    </nav></header>
    {message && <div className="notice">{message}<button onClick={() => setMessage('')}>Dismiss</button></div>}
    {featureEnabled(settings, 'module_cookie_legal_enabled') && !cookieChoice && <CookieConsent settings={settings} setPage={setPage} onChoice={saveCookieChoice} showPrefs={showCookiePrefs} setShowPrefs={setShowCookiePrefs} />}
    {featureEnabled(settings, 'module_cookie_legal_enabled') && !legalAccepted && <LegalDisclaimer settings={settings} setPage={setPage} onAccept={acceptLegalDisclaimer} />}
    {page === 'home' && <Home settings={settings} resetCookieChoice={resetCookieChoice} competitions={homepageCompetitions} instantWinners={instantWinners} user={user} setPage={setPage} cart={cart} saveCart={saveCart} setMessage={setMessage} selected={selected} setSelected={setSelected} />}
    {page === 'login' && <Login setUser={setUser} setPage={setPage} setMessage={setMessage} settings={settings} />}
    {page === 'how-it-works' && <HowItWorks setPage={setPage} settings={settings} />}
    {page === 'about' && <AboutPage setPage={setPage} settings={settings} />}
    {page === 'fair-draws' && <FairDrawsPage setPage={setPage} settings={settings} />}
    {page === 'entry-lists' && <EntryLists competitions={competitions} />}
    {page === 'winners' && <Winners winners={winners} instantWinners={instantWinners} />}
    {page === 'terms' && <LegalPage title="Terms and Conditions" text={settings.terms_text || defaultSettings.terms_text} settings={settings} setPage={setPage} />}
    {page === 'privacy' && <LegalPage title="Privacy Notice" text={settings.privacy_text || defaultSettings.privacy_text} settings={settings} setPage={setPage} />}
    {page === 'free-entry' && <LegalPage title="Free Entry Route" text={settings.free_entry_global || defaultSettings.free_entry_global} settings={settings} setPage={setPage} />}
    {page === 'cookies' && <LegalPage title="Cookie Notice" text={settings.cookie_text || defaultSettings.cookie_text} settings={settings} setPage={setPage} />}
    {page === 'refunds' && <LegalPage title="Refunds and Cancellations" text={settings.refund_text || defaultSettings.refund_text} settings={settings} setPage={setPage} />}
    {page === 'cart' && <Cart settings={settings} user={user} setPage={setPage} cart={cart} saveCart={saveCart} reload={load} reloadAccount={loadAccount} setMessage={setMessage} />}
    {page === 'account' && <Account user={user} entries={entries} orders={orders} setPage={setPage} reload={loadAccount} />}
    {page === 'admin' && user?.role === 'admin' && <Admin settings={settings} setSettings={setSettings} competitions={competitions} entries={adminEntries} orders={adminOrders} auditLogs={adminAudit} instantWins={adminInstantWins} postcodeZones={adminPostcodeZones} postcodeAssignments={adminPostcodeAssignments} reload={async () => { await load(); await loadAdminData(); }} setMessage={setMessage} setPage={setPage} />}
    {page === 'admin' && user?.role !== 'admin' && <Login setUser={setUser} setPage={setPage} setMessage={setMessage} settings={settings} />}
  </div>;
}


function ArnoldHost({ stage = 'idle', caption, compact = false }) {
  const stageText = {
    idle: 'Arnold is ready.',
    welcome: 'Arnold Blackndeckka welcomes you to Prizetown.',
    tickets: 'Tickets loaded. We are ready for the draw.',
    ready: 'Final checks complete. Time to spin.',
    spinning: 'The wheel is spinning. Good luck everyone!',
    suspense: 'Hold tight… Arnold is watching the wheel.',
    winner: 'We have a winner!',
    celebration: 'Congratulations from Arnold Blackndeckka!'
  };

  return <div className={`arnold-host ${compact ? 'compact' : ''} ${stage}`}>
    <div className="arnold-image-wrap">
      <img src="/arnold-blackndeckka.jpg" alt="Arnold Blackndeckka mascot" />
    </div>
    <div className="arnold-speech">
      <strong>Arnold Blackndeckka</strong>
      <p>{caption || stageText[stage] || stageText.idle}</p>
    </div>
  </div>;
}

function ArnoldBroadcastHost({ mode = 'idle', winner }) {
  const caption = mode === 'winner'
    ? `Winner selected: ticket #${winner?.ticket_number || '—'}`
    : mode === 'spinning'
      ? 'The live draw is spinning now!'
      : mode === 'ready'
        ? 'Tickets are loaded. We are ready to draw.'
        : 'Waiting for the live draw to begin.';

  return <div className={`arnold-broadcast-host ${mode} no-caption`}>
    <img src="/arnold-blackndeckka.jpg" alt="Arnold Blackndeckka" />
  </div>;
}

function Home({ settings, resetCookieChoice, competitions, instantWinners, user, setPage, cart, saveCart, setMessage, selected, setSelected }) {
  function openCompetition(c) {
    setSelected(c);
    setTimeout(() => {
      document.getElementById('competition-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  const postcodesEnabled = featureEnabled(settings, 'module_postcodes_enabled');
  const wheelDemoEnabled = featureEnabled(settings, 'module_wheel_demo_enabled');
  const arnoldEnabled = featureEnabled(settings, 'module_arnold_enabled');
  const instantWinsEnabled = featureEnabled(settings, 'module_instant_wins_enabled');

  const homepageEyebrow = postcodesEnabled ? settings.hero_eyebrow : (settings.hero_eyebrow || 'Online prize competitions').replace(/postcode/ig, 'online');
  const homepageTitle = settings.hero_title || 'Win big prizes';
  const homepageText = postcodesEnabled
    ? settings.hero_text
    : (settings.hero_text || 'Browse live prize competitions, add tickets to your basket, answer the entry question and receive your ticket numbers securely.').replace(/postcode /ig, '').replace(/local /ig, '');


  const liveCompetitions = safeArray(competitions).filter(c => c.status === 'active');
  const nextDrawCompetition = liveCompetitions
    .filter(c => c.draw_at)
    .sort((a, b) => new Date(a.draw_at).getTime() - new Date(b.draw_at).getTime())[0];
  const liveActivityStats = [
    ['Live competitions', liveCompetitions.length || 0],
    ['Tickets allocated', liveCompetitions.reduce((sum, c) => sum + Number(c.entries_sold || 0), 0)],
    ['Instant wins claimed', safeArray(instantWinners).length || 0],
    ['Next draw', nextDrawCompetition ? fmtDate(nextDrawCompetition.draw_at) : 'Coming soon']
  ];
  const instantWinnerHighlights = safeArray(instantWinners).slice(0, 6);
  const instantWinnerTickerRows = instantWinnerHighlights.length
    ? [...instantWinnerHighlights, ...instantWinnerHighlights]
    : [];

  const demoBaseTickets = useMemo(() => [
    { ticket_number: 1, customer_name: 'Alex' },
    { ticket_number: 2, customer_name: 'Sam' },
    { ticket_number: 3, customer_name: 'Taylor' },
    { ticket_number: 4, customer_name: 'Jordan' },
    { ticket_number: 5, customer_name: 'Casey' },
    { ticket_number: 6, customer_name: 'Morgan' },
    { ticket_number: 7, customer_name: 'Jamie' },
    { ticket_number: 8, customer_name: 'Riley' },
    { ticket_number: 9, customer_name: 'Charlie' },
    { ticket_number: 10, customer_name: 'Drew' },
    { ticket_number: 11, customer_name: 'Sky' },
    { ticket_number: 12, customer_name: 'Bailey' }
  ], []);
  const [demoTickets, setDemoTickets] = useState(() => buildWheelTickets(demoBaseTickets));
  const [demoWinner, setDemoWinner] = useState(null);
  const [demoMode, setDemoMode] = useState('idle');
  const [demoRotation, setDemoRotation] = useState(0);
  const [demoSpinnerStyle, setDemoSpinnerStyle] = useState(() => localStorage.getItem('prizetown_demo_spinner_style') || settings.spinner_style || 'classic');
  const [demoNames, setDemoNames] = useState('Alex, Sam, Taylor, Jordan, Casey, Morgan, Jamie, Riley, Charlie, Drew, Sky, Bailey');

  function refreshDemoNames() {
    const names = demoNames.split(',').map(n => n.trim()).filter(Boolean).slice(0, 60);
    const rows = (names.length ? names : ['Alex', 'Sam', 'Taylor', 'Jordan']).map((name, i) => ({
      ticket_number: i + 1,
      customer_name: name
    }));
    setDemoTickets(buildWheelTickets(rows));
    setDemoWinner(null);
    setDemoMode('idle');
    setDemoRotation(0);
    setMessage('Demo Wheel of Luck names updated.');
  }

  function spinDemoWheel() {
    if (demoMode === 'spinning') return;
    const rows = safeArray(demoTickets);
    const picked = rows[Math.floor(Math.random() * rows.length)] || { ticket_number: 1, customer_name: 'Demo winner' };
    const finalWinner = {
      ticket_number: picked.ticket_number || picked.from || 1,
      customer_name: picked.customer_name || `Demo ticket ${picked.ticket_number || picked.from || 1}`
    };
    const nextRotation = wheelRotationForWinner(rows, finalWinner.ticket_number, demoRotation);
    setDemoWinner(null);
    setDemoMode('spinning');
    setDemoRotation(nextRotation);
    setTimeout(() => {
      setDemoWinner(finalWinner);
      setDemoMode('winner');
    }, 6200);
  }

return <main>
    <section className="hero compact-hero northern-hero">
      <div>
        <p className="eyebrow"><Sparkles size={16} /> {homepageEyebrow}</p>
        <h1>{homepageTitle}</h1>
        <p>{homepageText}</p>
        {!user && <button className="primary" onClick={() => setPage('login')}>Create account / login</button>}

        {postcodesEnabled && <div className="postcode-hero-note">
          <strong>Your postcode unlocks your local prize board.</strong>
          <p>Create an account with your UK postcode and Prizetown will be able to show area-based competitions, small starter prizes and limited-ticket local draws.</p>
        </div>}


        <div className="hero-prize-board">
          <div className="hero-prize-head">
            <span>Featured lifestyle</span>
            <strong>Pick the prize. Watch the draw. Live the moment.</strong>
          </div>
          <div className="hero-prize-grid">
            <button type="button" onClick={() => document.getElementById('competitions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="hero-prize-tile car">
              <img src="/arnold-supercar-nightlife.png" alt="" />
              <span>Cars</span>
            </button>
            <button type="button" onClick={() => document.getElementById('competitions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="hero-prize-tile cash">
              <img src="/arnold-rooftop-celebration.png" alt="" />
              <span>Cash & wins</span>
            </button>
            <button type="button" onClick={() => document.getElementById('competitions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="hero-prize-tile luxury">
              <img src="/arnold-yacht-golden-hour.png" alt="" />
              <span>Luxury</span>
            </button>
            <button type="button" onClick={() => document.getElementById('competitions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="hero-prize-tile travel">
              <img src="/arnold-private-jet.png" alt="" />
              <span>Travel</span>
            </button>
          </div>
          <div className="hero-trust-row">
            <span>Transparent ticket numbers</span>
            <span>Live final draws</span>
            <span>Instant win moments</span>
          </div>

          <div className="launch-trust-strip" aria-label="Launch trust badges">
            <button type="button" onClick={() => setPage('how-it-works')}>How it works</button><button type="button" onClick={() => setPage('about')}>About Prizetown</button><button type="button" onClick={() => setPage('fair-draws')}>Fair draws</button>
            <button type="button" onClick={() => setPage('entry-lists')}>Public entry lists</button>
            <button type="button" onClick={() => setPage('winners')}>Winners & results</button><a className="live-draw-hero-button" href="/draw-broadcast">Watch live draws</a>
            <button type="button" onClick={() => setPage('free-entry')}>Free entry route</button>
            <span>18+ responsible entry</span><span>Built around public proof</span>
          </div>
        </div>
      </div>
      <div className="hero-card draw-card pick-poster-card">
        <img className="pick-poster-logo" src={siteLogo(settings)} alt={settings.site_name || 'Prizetown'} />
        <img className="pick-poster-arnold" src="/arnold-highlife-poster.png" alt="Arnold Blackndeckka living the high life" />
        <div className="pick-poster-copy">
          <p className="eyebrow"><Sparkles size={16} /> Hosted by Arnold</p>
          <h3>Pick a poster</h3>
          <p>Tap a scrolling competition poster below to open the full prize page, ticket choices, entry list and instant wins.</p>
        </div>
      </div>
    </section>

    <section className="start-here-strip" aria-label="Start here">
      <div>
        <p className="eyebrow"><Sparkles size={16} /> Start here</p>
        <h2>New to Prizetown?</h2>
        <p>Pick a live competition, check how entries work, then follow public entry lists and winner results.</p>
      </div>
      <div className="start-here-actions">
        <button type="button" className="primary" onClick={() => document.getElementById('competitions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Browse competitions</button>
        <button type="button" className="secondary" onClick={() => setPage('how-it-works')}>How it works</button>
        <button type="button" className="secondary" onClick={() => setPage('entry-lists')}>Entry lists</button>
        <button type="button" className="secondary" onClick={() => setPage('winners')}>Winners</button>
      </div>
    </section>

    {arnoldEnabled && <section className="homepage-arnold panel">
      <ArnoldHost stage="welcome" caption="I’m Arnold Blackndeckka, your Prizetown host. I’ll keep an eye on the draws, winners and big-ticket moments." />
    </section>}

    {wheelDemoEnabled && (
      <>
      <section className="wheel-of-luck-section panel"><div className="wheel-of-luck-copy">
        <p className="eyebrow"><Trophy size={16} /> Wheel of Luck</p>
        <h2>Try the Prizetown Wheel of Luck</h2>
        <p>Want to see how a draw feels before you enter? Spin the demo wheel and watch a sample ticket reveal. Official final draws use the live draw screen so customers can follow the result as it happens.</p>
        <div className="wheel-trust-grid">
          <span>Live visual draw</span>
          <span>Winner reveal on screen</span>
          <span>Ticket number shown clearly</span>
          <span>Demo spins are for illustration only</span>
        </div>
        <div className="demo-name-editor">
          <label>Demo names
            <textarea value={demoNames} onChange={e => setDemoNames(e.target.value)} rows={3} />
          </label>
          <div className="demo-wheel-actions">
            <button type="button" className="secondary" onClick={refreshDemoNames}>Update demo names</button>
            <button type="button" className="primary" onClick={spinDemoWheel} disabled={demoMode === 'spinning'}>{demoMode === 'spinning' ? 'Spinning...' : 'Try the wheel'}</button>
            
          </div>
          <div className="demo-wheel-actions demo-style-actions">
            <button type="button" className={demoSpinnerStyle === 'classic' ? 'primary' : 'secondary'} onClick={() => { setDemoSpinnerStyle('classic'); localStorage.setItem('prizetown_demo_spinner_style', 'classic'); }}>Classic style</button>
            <button type="button" className={demoSpinnerStyle === 'ticket-squares' ? 'primary' : 'secondary'} onClick={() => { setDemoSpinnerStyle('ticket-squares'); localStorage.setItem('prizetown_demo_spinner_style', 'ticket-squares'); }}>Ticket squares style</button>
          </div>
          <small>Demo only. This does not enter you into a live competition and does not affect official draw results.</small>
        </div>
      </div>
      <div className="wheel-of-luck-demo">
        <TrustedWheelDraw mode={demoMode} winner={demoWinner} tickets={demoTickets} rotation={demoRotation} label="DEMO WHEEL OF LUCK" spinnerStyle={demoSpinnerStyle} showTicketLabels={false} />
      </div>
    </section>

    <section className="trust-explainer-strip">
      <article>
        <strong>1. Enter</strong>
        <span>Choose a competition and receive your ticket numbers.</span>
      </article>
      <article>
        <strong>2. Watch</strong>
        <span>Live final draws use the Prizetown draw screen.</span>
      </article>
      <article>
        <strong>3. Reveal</strong>
        <span>The winning ticket and winner name are shown clearly.</span>
      </article>
    </section>


    <section className="highlife-showcase">
      <div className="highlife-lead">
        <p className="eyebrow"><Sparkles size={16} /> Live the high life</p>
        <h2>Prizes with proper dream-big energy</h2>
        <p>Cars, cash, tech and luxury lifestyle moments — Arnold brings the VIP feeling while the competition posters do the selling.</p>
        <div className="highlife-points">
          <span>Live draws</span>
          <span>Instant wins</span>
          <span>Big prize nights</span>
          <span>Winner moments</span>
        </div>
      </div>
      <div className="highlife-grid">
        <article className="highlife-card feature">
          <img src="/arnold-rooftop-celebration.png" alt="Arnold celebrating a winner on a luxury rooftop" />
          <div><strong>Winner night</strong><span>Big reveal energy for draws and results</span></div>
        </article>
        <article className="highlife-card">
          <img src="/arnold-supercar-nightlife.png" alt="Arnold beside a luxury car" />
          <div><strong>Dream cars</strong><span>Hero visuals for car competitions</span></div>
        </article>
        <article className="highlife-card">
          <img src="/arnold-yacht-golden-hour.png" alt="Arnold on a luxury yacht" />
          <div><strong>Luxury lifestyle</strong><span>VIP prizes, experiences and cash vibes</span></div>
        </article>
        <article className="highlife-card">
          <img src="/arnold-private-jet.png" alt="Arnold in a private jet" />
          <div><strong>Premium travel</strong><span>High-end campaign imagery</span></div>
        </article>
      </div>
    </section>
      </>
    )}

    <section className="community-proof-section">
      <div className="community-proof-copy">
        <p className="eyebrow"><Sparkles size={16} /> Local trust</p>
        <h2>Built for local prize nights, clear entries and fair draws.</h2>
        <p>Prizetown is designed around postcode-aware competitions, visible ticket numbers, public entry lists and winner results customers can check before and after each draw.</p>
        <div className="community-proof-actions">
          <button type="button" className="primary" onClick={() => setPage('entry-lists')}>View entry lists</button>
          <button type="button" className="secondary" onClick={() => setPage('winners')}>View winners</button>
          <button type="button" className="secondary" onClick={() => setPage('free-entry')}>Free entry route</button>
        </div>
      </div>
      <div className="community-proof-grid">
        <article>
          <strong>Postcode focus</strong>
          <span>{postcodesEnabled ? 'Competitions can be limited by postcode zones for local launches.' : 'Postcode tools can be switched on when local competitions are needed.'}</span>
        </article>
        <article>
          <strong>Public ticket lists</strong>
          <span>Customers can check allocated ticket numbers before a final draw.</span>
        </article>
        <article>
          <strong>Responsible entry</strong>
          <span>18+ only. Enter for entertainment and never spend more than you can afford.</span>
        </article>
        <article>
          <strong>Free postal route</strong>
          <span>Free-entry wording is visible and editable before public launch.</span>
        </article>
      </div>
    </section>

    <section className="live-activity-strip">
      <div className="live-activity-head">
        <p className="eyebrow"><Ticket size={16} /> Live activity</p>
        <h2>Prizetown is moving</h2>
        <span>Recent activity and draw signals update as competitions grow.</span>
      </div>
      <div className="live-activity-grid">
        {liveActivityStats.map(([label, value]) => <article key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </article>)}
      </div>
      <button type="button" className="secondary" onClick={() => document.getElementById('competitions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>View live competitions</button>
    </section>

    <section id="competitions" className="competitions-anchor"><CompetitionScroller competitions={competitions} setSelected={openCompetition} /></section>

    {selected && <div id="competition-details"><CompetitionDetail c={selected} cart={cart} saveCart={saveCart} setMessage={setMessage} setPage={setPage} close={() => setSelected(null)} /></div>}

    <section className="ticker winners-ticker"><strong>Latest instant winners</strong>{instantWinners.length === 0 ? <span>No instant winners yet — instant-win prizes will appear here as they are claimed.</span> : instantWinners.slice(0, 10).map(w => <span key={w.id}>{w.winner_name || 'Customer'} won {w.prize_title} on {w.competition_title}</span>)}</section>


    <section className="instant-winner-showcase">
      <div className="section-head">
        <div>
          <p className="eyebrow"><Zap size={16} /> Instant winner feed</p>
          <h2>Recent instant-win moments</h2>
        </div>
        <button type="button" className="secondary" onClick={() => setPage('winners')}>View all winners</button>
      </div>

      {instantWinnerTickerRows.length > 0 ? <div className="instant-winner-marquee" aria-label="Recent instant winners">
        <div className="instant-winner-track">
          {instantWinnerTickerRows.map((w, idx) => <span key={`${w.id || idx}-ticker-${idx}`}>
            <strong>{w.customer_name || w.winner_name || 'Customer'}</strong>
            won {w.prize_title || 'an instant prize'}
            <em>Ticket #{w.ticket_number || w.winning_ticket_number || '-'}</em>
          </span>)}
        </div>
      </div> : <div className="panel empty-winners">
        <h3>No instant winners yet</h3>
        <p>Instant-win prizes will appear here as soon as matching ticket numbers are claimed.</p>
      </div>}

      {instantWinnerHighlights.length > 0 && <div className="instant-winner-card-grid">
        {instantWinnerHighlights.map(w => <article className="instant-winner-card" key={w.id}>
          {w.prize_image_url ? <img src={imageUrl(w.prize_image_url)} alt="" /> : <div className="instant-winner-icon"><Zap size={24} /></div>}
          <div>
            <p className="winner-kicker">Instant win claimed</p>
            <h3>{w.customer_name || w.winner_name || 'Customer'}</h3>
            <p>Won <strong>{w.prize_title || 'Instant prize'}</strong></p>
            <div className="winner-meta">
              <span>{w.competition_title || 'Competition'}</span>
              <span>Ticket #{w.ticket_number || w.winning_ticket_number || '-'}</span>
              {w.claimed_at && <span>{fmtDate(w.claimed_at)}</span>}
            </div>
          </div>
        </article>)}
      </div>}
    </section>

    <section className="pwa-install-strip">
      <div>
        <p className="eyebrow"><Sparkles size={16} /> Save Prizetown</p>
        <h2>Add Prizetown to your home screen.</h2>
        <p>Open Prizetown like an app, keep your basket handy and jump back to live competitions, entry lists and winners.</p>
      </div>
      <div className="pwa-install-steps">
        <span>iPhone: Share → Add to Home Screen</span>
        <span>Android/Chrome: Menu → Install app</span>
      </div>
    </section>

    <section className="footer-pre-cta">
      <div>
        <p className="eyebrow"><Trophy size={16} /> Ready for the next winner?</p>
        <h2>Check the live competitions and pick your prize poster.</h2>
      </div>
      <button className="primary" onClick={() => document.getElementById('competitions')?.scrollIntoView({ behavior: 'smooth' })}>View competitions</button>
    </section>

    {typeof WebsiteFooter === 'function' ? <WebsiteFooter settings={settings} setPage={setPage} /> : <footer className="site-footer">
      <div className="footer-brand">
        <img src={siteLogo(settings)} alt={settings.site_name || 'Prizetown'} />
        <p>{settings.footer_text}</p>
        <p className="footer-credit">{settings.brand_footer_credit || 'Website by Neotech Designs'}  -  <a href={settings.brand_footer_link_url || 'https://ctec-shop.co.uk'} target="_blank" rel="noreferrer">{settings.brand_footer_link_label || 'ctec-shop.co.uk'}</a></p>
        <SocialLinks settings={settings} />
      </div>
      <div className="footer-column">
        <h3>Free entry</h3>
        <p>Postal/free entry route details are available on the Free entry page and can be edited from Admin.</p>
      </div>
      <div className="footer-column">
        <h3>Responsible play</h3>
        <p>{settings.responsible_play_text}</p>
      </div>
      <div className="footer-column">
        <h3>Transparency</h3>
        <p>Competition details, ticket limits, closing dates and draw information are shown clearly before entry.</p>
        <nav className="footer-links" aria-label="Footer legal links">
          <button type="button" onClick={() => setPage('how-it-works')}>How it works</button>
          <button type="button" onClick={() => setPage('terms')}>Terms</button>
          <button type="button" onClick={() => setPage('privacy')}>Privacy</button>
          <button type="button" onClick={() => setPage('free-entry')}>Free entry</button>
          <button type="button" onClick={() => setPage('cookies')}>Cookies</button>
          <button type="button" onClick={() => setPage('refunds')}>Refunds</button>
          <button type="button" onClick={resetCookieChoice}>Cookie settings</button>
        </nav>
      </div>
    </footer>}
  </main>;
}


function CompetitionScroller({ competitions, setSelected }) {
  if (competitions.length === 0) return <section className="panel info-panel"><h2>Live competitions</h2><p className="muted">No competitions are available right now. Please check back soon for the next Prizetown draw.</p></section>;
  const scrolling = competitions.length > 1 ? [...competitions, ...competitions] : competitions;
  return <section className="competition-scroll-section northern-competition-section">
    <div className="section-head">
      <div><p className="eyebrow"><Ticket size={16} /> Live competitions</p><h2>Tap a poster to enter</h2></div>
      <span className="muted">Poster strip pauses on hover</span>
    </div>
    <div className="competition-marquee poster-marquee"><div className="competition-track poster-track">{scrolling.map((c, idx) => <CompetitionPost key={`${c.id}-${idx}`} c={c} onOpen={() => setSelected(c)} />)}</div></div>
  </section>;
}

function CompetitionPost({ c, onOpen }) {
  const percent = Math.min(100, Math.round(((c.entries_sold || 0) / c.max_tickets) * 100));
  const remaining = Math.max(0, c.max_tickets - (c.entries_sold || 0));
  const theme = competitionTheme(c);
  return <button type="button" className="competition-poster" onClick={onOpen} title={`Open ${c.title}`}>
    <div className={`poster-image theme-${theme.key}`}>
      <img src={c.image_url ? imageUrl(c.image_url) : fallbackPosterUrl(c)} alt="" />
      <span className="poster-status">{daysLeft(c.closes_at) === 'Closed' ? 'Closed' : 'Live Now'}</span>
    </div>
    <div className="poster-body">
      <strong>{c.title}</strong>
      <small>Draw On {fmtDate(c.draw_at)}</small>
      <div className="poster-countdown">{daysLeft(c.closes_at)}</div>
      <div className="progress"><span style={{ width: `${percent}%` }} /></div>
      <small><b>{percent}% SOLD</b>  -  {c.entries_sold || 0}/{c.max_tickets}</small>
      <small>{remaining} Tickets Remaining</small>
      <span className="poster-price">{money(c.ticket_price_pence)} Per Entry</span>
      {Number(c.instant_win_total || 0) > 0 && <em><Zap size={13} /> {c.instant_win_claimed || 0}/{c.instant_win_total} instant wins found</em>}
      <span className="poster-enter">Enter Now</span>
    </div>
  </button>;
}


function CompetitionCard({ c, cart, saveCart, setMessage, setPage, setSelected }) {
  const percent = Math.min(100, Math.round(((c.entries_sold || 0) / c.max_tickets) * 100)); const remaining = Math.max(0, c.max_tickets - (c.entries_sold || 0));
  return <article className="card comp-card"><img src={c.image_url ? imageUrl(c.image_url) : fallbackPosterUrl(c)} alt="" /><div className="card-body"><div className="tag-row"><span className="badge">{daysLeft(c.closes_at) === 'Closed' ? 'Closed' : 'ENDS SOON'}</span>{Number(c.instant_win_total || 0) > 0 && <span className="badge hot"><Zap size={13} /> Instant wins</span>}</div><div className="row"><h3>{c.title}</h3><span>{money(c.ticket_price_pence)} Per Entry</span></div><p>{c.description}</p><p className="muted"><Clock size={14} /> Draw on {fmtDate(c.draw_at)}</p><div className="progress"><span style={{ width: `${percent}%` }} /></div><p className="muted"><strong>{percent}% SOLD</strong>  -  {c.entries_sold || 0} / {c.max_tickets}  -  {remaining} tickets remaining</p>{Number(c.instant_win_total || 0) > 0 && <p className="instant-count"><Zap size={15} /> {c.instant_win_claimed || 0}/{c.instant_win_total} instant wins found</p>}<button className="primary full" onClick={() => setSelected(c)}>Enter now</button><button className="secondary full" onClick={() => setSelected(c)}>View details</button></div></article>;
}

function CompetitionDetail({ c, cart, saveCart, setMessage, setPage, close }) {
  const [quantity, setQuantity] = useState(1); const [answer, setAnswer] = useState(''); const [instantWins, setInstantWins] = useState([]); const [entryList, setEntryList] = useState([]); const [localNotice, setLocalNotice] = useState('');
  const percent = Math.min(100, Math.round(((c.entries_sold || 0) / c.max_tickets) * 100)); const remaining = Math.max(0, c.max_tickets - (c.entries_sold || 0));
  useEffect(() => { api(`/competitions/${c.id}/instant-wins`).then(setInstantWins).catch(() => setInstantWins([])); api(`/competitions/${c.id}/entries`).then(setEntryList).catch(() => setEntryList([])); }, [c.id]);
  function add(qtyOverride) {
    const safeMaxPerUser = Math.max(1, Number(c.max_per_user || 1));
    const safeRemaining = Math.max(0, Number(remaining || 0));
    if (safeRemaining < 1) { setLocalNotice('This competition has sold out.'); return setMessage('This competition has sold out.'); }
    if (c.question && !String(answer || '').trim()) { setLocalNotice('Please answer the entry question first.'); return setMessage('Please answer the entry question before adding to basket.'); }
    const wantedQty = Math.max(1, Number(qtyOverride || quantity || 1));
    const qty = Math.min(wantedQty, safeRemaining, safeMaxPerUser);
    const existing = cart.find(item => item.competition_id === c.id);
    const currentQty = existing ? Number(existing.quantity || 0) : 0;
    const finalQty = Math.min(safeMaxPerUser, currentQty + qty);
    const next = existing ? cart.map(item => item.competition_id === c.id ? { ...item, quantity: finalQty, answer } : item) : [...cart, { competition_id: c.id, title: c.title, unit_price_pence: c.ticket_price_pence, quantity: qty, answer, question: c.question, image_url: c.image_url }];
    saveCart(next);
    setLocalNotice(`${qty} ticket(s) added to basket. Basket now has ${finalQty} for this competition.`);
    setMessage(`${qty} ticket(s) added to basket.`);
  }
  async function shareCompetition(channel = 'copy') {
    const origin = window.location.origin || 'https://prizetown.co.uk';
    const url = c.slug ? `${origin}/competitions/${c.slug}` : `${origin}/#competition-${c.id}`;
    const text = `Check out ${c.title} on Prizetown - tickets from ${money(c.ticket_price_pence)}. ${url}`;

    try {
      if (channel === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener,noreferrer');
        setLocalNotice('Facebook share opened.');
        return setMessage('Facebook share opened.');
      }

      if (navigator.share && channel === 'native') {
        await navigator.share({ title: c.title, text, url });
        setLocalNotice('Competition shared.');
        return setMessage('Competition shared.');
      }

      await navigator.clipboard.writeText(text);
      const label = channel === 'instagram' ? 'Instagram promo text copied.' : channel === 'tiktok' ? 'TikTok promo text copied.' : 'Competition link copied.';
      setLocalNotice(label);
      setMessage(label);
    } catch {
      setLocalNotice('Could not share automatically. Copy the page link from your browser.');
      setMessage('Could not share automatically. Copy the page link from your browser.');
    }
  }

  return <section className="detail panel"><button className="link" onClick={close}>Close details</button><div className="detail-grid"><div><img className="detail-img" src={c.image_url ? imageUrl(c.image_url) : fallbackPosterUrl(c)} alt="" /><div className="share-row"><span>Share:</span><button type="button" onClick={() => shareCompetition('native')}>Share</button><button type="button" onClick={() => shareCompetition('facebook')}>Facebook</button><button type="button" onClick={() => shareCompetition('instagram')}>Instagram</button><button type="button" onClick={() => shareCompetition('tiktok')}>TikTok</button></div></div><div><h1>{c.title}</h1><p className="price-big">{money(c.ticket_price_pence)} Per Entry</p><div className="countdown"><div>{daysLeft(c.closes_at)}</div><small>Draw on {fmtDate(c.draw_at)}</small></div><div className="progress"><span style={{ width: `${percent}%` }} /></div><p><strong>{percent}% Sold</strong>  -  {c.entries_sold || 0}/{c.max_tickets}  -  {remaining} tickets remaining  -  max {c.max_per_user} per user</p>{c.question && <label>Entry question<input value={answer} onChange={e => setAnswer(e.target.value)} placeholder={c.question} /></label>}<div className="quick-picks"><button type="button" onClick={() => setQuantity(1)}>1 ticket</button><button type="button" onClick={() => setQuantity(5)}>5 tickets</button><button type="button" onClick={() => setQuantity(10)}>10 tickets</button><button type="button" onClick={() => setQuantity(25)}>25 tickets</button></div><p className="muted small-help">Choose how many tickets, then press Add to basket. If a competition is limited to 1 per user, admin can raise Max per user on the competition.</p><div className="two compact"><label>Tickets<input type="number" min="1" max={Math.min(c.max_per_user, remaining)} value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Total<input readOnly value={money((Number(quantity || 1)) * c.ticket_price_pence)} /></label></div>{localNotice && <p className="basket-notice">{localNotice}</p>}<button type="button" className="primary full" onClick={() => add()}><ShoppingCart size={16} /> Add to basket</button><button type="button" className="secondary full" onClick={() => setPage('cart')}>Go to basket / Checkout</button></div></div><div className="detail-tabs"><details open><summary>Prize Description</summary><p>{c.description}</p></details><details open><summary>Instant Wins</summary>{instantWins.length === 0 ? <p className="muted">No instant wins on this competition.</p> : <div className="instant-grid">{instantWins.map(w => <div className={`instant-prize ${w.public_status}`} key={w.id}><strong>{w.prize_title}</strong><span>{w.prize_value_pence ? money(w.prize_value_pence) : 'Bonus'}</span><small>{w.public_status === 'claimed' ? `Won by ${w.winner_name || 'Customer'}  -  ticket #${w.winning_ticket_number}` : 'Available'}</small></div>)}</div>}<p className="muted">If any allocated ticket number matches a pre-set instant-win ticket, the prize is marked as won automatically.</p></details><details><summary>Entry List</summary>{entryList.length === 0 ? <p className="muted">No entries yet.</p> : <div className="entry-chip-list">{entryList.slice(0, 500).map(e => <span key={e.ticket_number}>#{e.ticket_number}</span>)}</div>}</details><details><summary>Free Entry Route</summary><p>{c.free_entry_text || 'Add free-entry text in admin before going public.'}</p></details><details><summary>Competition Rules</summary><p>{c.rules_text || 'Add competition rules in admin before going public.'}</p></details></div></section>;
}

function SocialLinks({ settings = {} }) {
  const links = [
    ['Facebook', settings.social_facebook_url],
    ['Instagram', settings.social_instagram_url],
    ['TikTok', settings.social_tiktok_url],
    ['X', settings.social_x_url],
    ['YouTube', settings.social_youtube_url]
  ].filter(([, url]) => String(url || '').trim());

  if (links.length === 0) return null;

  return <div className="social-links" aria-label="Social links">
    {links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer">{label}</a>)}
  </div>;
}

function Login({ setUser, setPage, setMessage, settings = {} }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', postcode: '' });
  const postcodesEnabled = featureEnabled(settings, 'module_postcodes_enabled');

  async function submit(e) {
    e.preventDefault();
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: JSON.stringify(form) });
      localStorage.setItem('prizetown_token', data.token);
      localStorage.setItem('prizetown_user', JSON.stringify(data.user));
      setUser(data.user);
      setMessage(data.user.postcode_full ? `Logged in for ${data.user.postcode_full}` : `Logged in as ${data.user.email}`);
      setPage(data.user.role === 'admin' ? 'admin' : 'home');
    } catch (err) {
      setMessage(err.message);
    }
  }

  return <main className="narrow"><form className="panel" onSubmit={submit}>
    <h2>{mode === 'login' ? 'Login' : 'Create account'}</h2>
    {mode === 'register' && <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>}
    <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label>
    <label>Password<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></label>
    {mode === 'register' && <label>{postcodesEnabled ? 'Your postcode' : 'Postcode (optional)'}<input value={form.postcode} onChange={e => setForm({ ...form, postcode: e.target.value.toUpperCase() })} placeholder="BB1 2AB" required={postcodesEnabled} />{postcodesEnabled ? <small className="muted">We use this to show competitions available in your postcode area.</small> : <small className="muted">Optional when postcode competitions are switched off.</small>}</label>}
    <button className="primary full">{mode === 'login' ? 'Login' : 'Register'}</button>
    <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Need an account?' : 'Already registered?'}</button>
  </form></main>;
}

function Cart({ settings, user, setPage, cart, saveCart, reload, reloadAccount, setMessage }) {
  const [busy, setBusy] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const total = cart.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price_pence || 0), 0);

  function updateQty(id, quantity) {
    setCheckoutError('');
    saveCart(cart.map(item => item.competition_id === id ? { ...item, quantity: Math.max(1, Number(quantity || 1)) } : item));
  }

  function updateAnswer(id, answer) {
    setCheckoutError('');
    saveCart(cart.map(item => item.competition_id === id ? { ...item, answer } : item));
  }

  function remove(id) {
    setCheckoutError('');
    saveCart(cart.filter(item => item.competition_id !== id));
  }

  function clearBasket() {
    setCheckoutError('');
    saveCart([]);
    setMessage('Basket cleared.');
  }

  async function checkout() {
    setCheckoutError('');
    if (!user) {
      setMessage('Please login or register before checkout.');
      return setPage('login');
    }
    if (cart.length === 0) {
      setCheckoutError('Basket is empty.');
      return setMessage('Basket is empty.');
    }
    if (!ageConfirmed) {
      setCheckoutError('Please tick the age/rules confirmation before completing the order.');
      return setMessage('Please confirm your age and acceptance of the competition rules.');
    }

    const missingAnswer = cart.find(item => item.question && !String(item.answer || '').trim());
    if (missingAnswer) {
      const msg = `Please answer the entry question for ${missingAnswer.title}.`;
      setCheckoutError(msg);
      return setMessage(msg);
    }

    const cleanedItems = cart.map(item => ({
      competition_id: item.competition_id || item.id || item.competitionId,
      title: item.title,
      unit_price_pence: Number(item.unit_price_pence || 0),
      quantity: Math.max(1, Number(item.quantity || 1)),
      answer: String(item.answer || '').trim(),
      question: item.question || '',
      image_url: item.image_url || ''
    }));

    try {
      setBusy(true);
      const data = await api('/orders', { method: 'POST', body: JSON.stringify({ items: cleanedItems, age_confirmed: true }) });
      saveCart([]);
      const instant = (data.entries || []).flatMap(e => e.instant_wins || e.instant_win ? [e.instant_win?.prize_title].filter(Boolean) : []);
      setMessage(`Order #${data.order.id} created. Tickets: ${(data.entries || []).map(e => e.ticket_number).join(', ')}${instant.length ? ` Instant win: ${instant.join(', ')}` : ''}`);
      await reload();
      await reloadAccount();
      setPage('account');
    } catch (err) {
      const msg = err.message || 'Checkout failed.';
      setCheckoutError(msg);
      setMessage(msg);
    } finally {
      setBusy(false);
    }
  }

  return <main><section className="panel"><h1>Basket</h1>
    <p className="muted">Review your basket, confirm your details and complete your entry.</p>
    {checkoutError && <div className="checkout-error"><strong>Checkout problem:</strong><p>{checkoutError}</p></div>}
    {cart.length === 0 && <p>Your basket is empty.</p>}
    {cart.map(item => <div className="basket-row" key={item.competition_id}>
      <img src={item.image_url ? imageUrl(item.image_url) : fallbackPosterUrl(item)} alt="" />
      <div>
        <strong>{item.title}</strong>
        <p>{money(item.unit_price_pence)} each</p>
        {item.question && <label>Answer<input value={item.answer || ''} onChange={e => updateAnswer(item.competition_id, e.target.value)} placeholder={item.question} /></label>}
      </div>
      <label>Qty<input type="number" min="1" value={item.quantity} onChange={e => updateQty(item.competition_id, e.target.value)} /></label>
      <strong>{money(item.quantity * item.unit_price_pence)}</strong>
      <button className="danger" onClick={() => remove(item.competition_id)}><Trash2 size={16} /></button>
    </div>)}
    <div className="checkout-bar">
      <h2>Total: {money(total)}</h2>
      <button className="secondary" onClick={() => setPage('home')}>Continue browsing</button>
      <button className="secondary" onClick={clearBasket} disabled={cart.length === 0}>Clear basket</button>
      <div className="checkout-compliance">
        <label className="check-row important-check"><input type="checkbox" checked={ageConfirmed} onChange={e => { setAgeConfirmed(e.target.checked); setCheckoutError(''); }} /> <span>{settings.age_confirmation_text}</span></label>
        <p className="muted">{settings.responsible_play_text}</p>
      </div>
      <button className="primary" disabled={busy || cart.length === 0} onClick={checkout}><Ticket size={16} /> {busy ? 'Creating order...' : 'Complete entry and allocate tickets'}</button>
    </div>
  </section></main>;
}

function Account({ user, entries, orders, setPage, reload }) { if (!user) return <main className="narrow"><div className="panel"><h2>Please login</h2><button className="primary" onClick={() => setPage('login')}>Login</button></div></main>; return <main><section className="admin-layout"><div className="panel list-panel"><div className="row"><h2>My entries</h2><button className="secondary" onClick={reload}>Refresh</button></div>{entries.length === 0 && <p className="muted">No entries yet.</p>}{entries.map(e => <div className="list-row entry-row" key={e.id}><div><strong>{e.competition_title}</strong><p>Ticket #{e.ticket_number}  -  {e.payment_status}</p></div></div>)}</div><div className="panel list-panel"><h2>My orders</h2>{orders.length === 0 && <p className="muted">No orders yet.</p>}{orders.map(o => <div className="list-row entry-row" key={o.id}><div><strong>Order #{o.id}</strong><p>{money(o.total_pence)}  -  {o.entry_count} entries  -  {o.status}</p></div></div>)}</div></section></main>; }




function BroadcastMenuPanel({ setPage, settings = {} }) {
  return <section className="panel broadcast-menu-panel">
    <h1>OBS Draw Screen</h1>
    <p className="muted">Use this page for live broadcasts. Add the broadcast URL to OBS as a Browser Source, or open it in a separate window. Arnold appears as the built-in draw host.</p>
    <div className="broadcast-menu-grid">
      <button className="primary" onClick={() => setPage('draw-broadcast')}>Open broadcast screen in this browser</button>
      <button className="secondary" onClick={() => window.open('/draw-broadcast', 'prizetown_draw_broadcast')}>Open broadcast screen in new window</button>
      <button className="secondary" onClick={() => window.open('/draw-broadcast?transparent=1', 'prizetown_draw_broadcast_overlay')}>Open transparent OBS overlay</button>
    </div>
    <div className="obs-url-box">
      <strong>OBS Browser Source URL</strong>
      <code>http://192.168.1.177:3100/draw-broadcast</code>
      <strong>Transparent overlay URL</strong>
      <code>http://192.168.1.177:3100/draw-broadcast?transparent=1</code>
    </div>
    <p className="muted">Recommended OBS browser source size: 1920 x 1080.</p>
  </section>;
}


function DrawBroadcastPage({ setPage }) {
  const [state, setState] = useState(null);
  const [now, setNow] = useState(new Date());
  const [rotation, setRotation] = useState(0);
  const [lastSpinKey, setLastSpinKey] = useState('');
  
    const [serverSync, setServerSync] = useState({ serverNowMs: 0, localReceivedMs: 0, timeZone: 'Europe/London', source: 'Prizetown server' });
const introBroadcastAudioRef = useRef(null);
  const spinBroadcastAudioRef = useRef(null);
  const winnerBroadcastAudioRef = useRef(null);
  const lastBroadcastSoundKeyRef = useRef('');
const params = new URLSearchParams(window.location.search);
  const transparent = params.get('transparent') === '1';
  const compact = params.get('compact') !== '0';
  const safeObs = params.get('safe') !== '0';

  useEffect(() => {
    document.body.classList.add('broadcast-body');
    if (transparent) document.body.classList.add('broadcast-transparent');
    return () => {
      document.body.classList.remove('broadcast-body');
      document.body.classList.remove('broadcast-transparent');
    };
  }, [transparent]);

  useEffect(() => {
    let active = true;
    async function loadState() {
      try {
        const data = await api('/draw/broadcast-state');
        if (!active) return;
        setState(data);
                if (data.server_now) {
          setServerSync({
            serverNowMs: new Date(data.server_now).getTime(),
            localReceivedMs: Date.now(),
            timeZone: data.server_time_zone || 'Europe/London',
            source: data.time_source || 'Prizetown server'
          });
        }
const spinKey = data.spin_id || `${data.competition_id || ''}-${data.updated_at || ''}`;
        if (data.mode === 'spinning' && spinKey !== lastSpinKey) {
          setLastSpinKey(spinKey);
          setRotation(Number(data.target_rotation || 0));
        }
        if (data.mode === 'winner' && Number.isFinite(Number(data.target_rotation))) {
          setRotation(Number(data.target_rotation || 0));
        }
      } catch {
        if (active) setState(s => s || { mode: 'offline', visual_tickets: [] });
      }
    }
    loadState();
    const poll = setInterval(loadState, 1000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [lastSpinKey]);

  useEffect(() => {
    function key(e) {
      if (e.key === 'Escape') setPage('admin');
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [setPage]);

  const tickets = state?.visual_tickets || [];
  const spinnerStyle = state?.spinner_style || 'classic';
  const winner = state?.winner;
  const revealAt = state?.reveal_at ? new Date(state.reveal_at).getTime() : 0;
  const winnerReady = Boolean(winner) && (state?.mode === 'winner' || (revealAt > 0 && Date.now() >= revealAt));
  const displayWinner = winnerReady ? winner : null;
  useEffect(() => {
    const currentMode = state?.mode || 'idle';
    const soundKey = `${state?.spin_id || ''}:${currentMode}`;
    if (!state || lastBroadcastSoundKeyRef.current === soundKey) return;
    lastBroadcastSoundKeyRef.current = soundKey;

    const introAudio = introBroadcastAudioRef.current;
    const spinAudio = spinBroadcastAudioRef.current;
    const winnerAudio = winnerBroadcastAudioRef.current;

    function stopAudio(audio) {
      if (!audio) return;
      try { audio.pause(); audio.currentTime = 0; } catch {}
    }

    async function playAudio(audio, loop = false) {
      if (!audio || !audio.src) return;
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.loop = loop;
        await audio.play();
      } catch (err) {
        console.warn('Broadcast sound could not autoplay. In OBS, enable browser source audio/interact once if needed.', err);
      }
    }

    if (currentMode === 'intro') {
      stopAudio(spinAudio); stopAudio(winnerAudio); playAudio(introAudio, false);
    } else if (currentMode === 'spinning') {
      stopAudio(introAudio); stopAudio(winnerAudio); playAudio(spinAudio, true);
    } else if (currentMode === 'winner') {
      stopAudio(introAudio); stopAudio(spinAudio); playAudio(winnerAudio, false);
    } else {
      stopAudio(introAudio); stopAudio(spinAudio); stopAudio(winnerAudio);
    }
  }, [state?.mode, state?.spin_id, state?.intro_sound_url, state?.spin_sound_url, state?.winner_sound_url]);

  const mode = winnerReady ? 'winner' : (state?.mode || 'idle');
    const trustedNow = serverSync.serverNowMs ? new Date(serverSync.serverNowMs + Math.max(0, now.getTime() - serverSync.localReceivedMs)) : now;
  const syncAgeSeconds = serverSync.localReceivedMs ? Math.max(0, Math.floor((now.getTime() - serverSync.localReceivedMs) / 1000)) : null;
  const syncStale = syncAgeSeconds !== null && syncAgeSeconds > 15;
  const syncStatusText = syncAgeSeconds === null ? 'Waiting for server sync' : syncStale ? `Sync delayed - last server sync ${syncAgeSeconds}s ago` : `Server synced ${syncAgeSeconds}s ago`;
const title = state?.competition_title || 'Waiting for competition';
  const competitionNumber = state?.competition_number || '—';
  const eligible = state?.eligible_count || 0;
  const capacity = state?.ticket_capacity || 0;
  const drawDateText = state?.draw_date ? new Date(state.draw_date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : 'Draw date not set';
  const drawTimeText = state?.draw_date ? new Date(state.draw_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Time not set';
  const liveDateText = trustedNow.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: serverSync.timeZone || 'Europe/London' });
  const liveTimeText = trustedNow.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: serverSync.timeZone || 'Europe/London' });
  const drawAtMs = state?.draw_date ? new Date(state.draw_date).getTime() : 0;
  const countdownMs = drawAtMs ? Math.max(0, drawAtMs - trustedNow.getTime()) : 0;
  const countdownHours = Math.floor(countdownMs / 3600000);
  const countdownMinutes = Math.floor((countdownMs % 3600000) / 60000);
  const countdownSeconds = Math.floor((countdownMs % 60000) / 1000);
  const countdownText = drawAtMs ? `${String(countdownHours).padStart(2, '0')}:${String(countdownMinutes).padStart(2, '0')}:${String(countdownSeconds).padStart(2, '0')}` : 'Waiting for schedule';
  const holdingTitle = mode === 'spinning' ? 'Draw spinning now' : mode === 'ready' ? 'Entries locked' : 'Draw starting soon';

  return <main className={`broadcast-page ${transparent ? 'transparent' : ''} ${compact ? 'compact' : ''} ${safeObs ? 'safe-obs' : ''}`}>
    <section className="broadcast-stage">
      <header className="broadcast-header">
        <img src={siteLogo(state || {})} alt="Prizetown" />
        <div>
          <h1>{title}</h1>
          <p>Competition {competitionNumber}  -  Draw {state?.draw_date ? fmtDate(state.draw_date) : 'date not set'}</p>
        </div>
        <div className="broadcast-clock broadcast-clock-rich">
          <div>
            <span>Live time</span>
            <strong>{liveTimeText}</strong>
            <small>{liveDateText}</small>
          </div>
          <div>
            <span>Draw scheduled</span>
            <strong>{drawTimeText}</strong>
            <small>{drawDateText}</small>
          </div>
        </div>
      </header>

      <audio ref={introBroadcastAudioRef} src={state?.intro_sound_url || undefined} preload="auto" />
      <audio ref={spinBroadcastAudioRef} src={state?.spin_sound_url || undefined} preload="auto" />
      <audio ref={winnerBroadcastAudioRef} src={state?.winner_sound_url || undefined} preload="auto" />
      <div className="broadcast-main">
        {state?.show_arnold !== false && <ArnoldBroadcastHost mode={mode} winner={displayWinner} />}
        <div className="broadcast-wheel-wrap reveal-machine-wrap">
          <div className="broadcast-datetime-strip">
            <span><strong>Draw:</strong> {drawDateText}</span>
            <span><strong>Time:</strong> {drawTimeText}</span>
            <span><strong>Live:</strong> {liveTimeText}</span>
          </div>
          {mode === 'intro' ? <div className="broadcast-draw-intro">
            <p className="eyebrow">Prizetown live draw</p>
            <h2>{title}</h2>
            <div className="broadcast-intro-grid">
              <span><strong>Competition</strong>{competitionNumber}</span>
              <span><strong>Draw mode</strong>{state?.draw_mode || 'Official draw'}</span>
              <span><strong>Postcode / zone</strong>{state?.postcode_zone_label || state?.postcode_zone || state?.postcode_mode || 'Open competition'}</span>
              <span><strong>Eligible tickets</strong>{eligible}</span>
            </div>
            <p className="broadcast-intro-note">The wheel will start shortly. Good luck everyone.</p>
          </div> : <TrustedWheelDraw mode={mode} winner={displayWinner} tickets={tickets} rotation={rotation} label="PRIZETOWN FINAL DRAW" spinnerStyle={spinnerStyle} />}
        </div>

        <aside className="broadcast-info">
          <div className={`broadcast-status ${mode}`}>
            {mode === 'spinning' ? 'SPINNING NOW' : mode === 'winner' ? 'WINNER SELECTED' : mode === 'ready' ? 'READY TO DRAW' : 'WAITING'}
          </div>
          <div className="broadcast-stat"><span>Eligible tickets</span><strong>{eligible}</strong></div>
          <div className="broadcast-stat"><span>Ticket capacity</span><strong>{capacity}</strong></div>
          <div className="broadcast-stat"><span>Visual slices</span><strong>{tickets.length}</strong></div>

          {displayWinner ? <div className="broadcast-winner">
            <h2>Winner</h2>
            <p className="winning-ticket">Ticket #{displayWinner.ticket_number}</p>
            <p className="winner-name">{displayWinner.customer_name || displayWinner.name || 'Customer'}</p>
            <p className="muted">Final draw winner confirmed</p>
          </div> : <div className="broadcast-waiting broadcast-holding-screen">
            <h2>Awaiting spin</h2>
            <p>Draw date and live clock are shown on this broadcast screen for OBS. The draw animation is visual only; the confirmed winner appears here after the locked draw completes.</p>
          </div>}
        </aside>
      </div>

      <footer className="broadcast-footer">
        <span>Official Prizetown live draw</span>
        <span><strong>Live:</strong> {liveTimeText}</span>
        <span><strong>Time source:</strong> {serverSync.source} · {serverSync.timeZone}</span>
        <span className={syncStale ? 'sync-warning' : ''}>{syncStatusText}</span>
      </footer>
    </section>
  </main>;
}





function BrandingPanel({ settingsForm, setSettingsForm, saveSettings, setMessage }) {
  async function uploadBrandImage(e, field) {
    const file = e.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    try {
      const data = await api('/admin/upload', { method: 'POST', body });
      setSettingsForm({ ...settingsForm, [field]: data.url });
      setMessage(field === 'logo_url' ? 'Logo uploaded. Save branding to apply it.' : 'Favicon uploaded. Save branding to apply it.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  function applyThemePreset(name) {
    const presets = {
      gold: { brand_primary_color: '#facc15', brand_accent_color: '#f97316', brand_background_color: '#08101f', brand_button_text_color: '#08101f' },
      blue: { brand_primary_color: '#38bdf8', brand_accent_color: '#2563eb', brand_background_color: '#07111f', brand_button_text_color: '#06101f' },
      green: { brand_primary_color: '#86efac', brand_accent_color: '#22c55e', brand_background_color: '#071a12', brand_button_text_color: '#052e16' },
      pink: { brand_primary_color: '#f9a8d4', brand_accent_color: '#db2777', brand_background_color: '#190713', brand_button_text_color: '#260617' },
      dark: { brand_primary_color: '#e5e7eb', brand_accent_color: '#64748b', brand_background_color: '#020617', brand_button_text_color: '#020617' }
    };
    setSettingsForm({ ...settingsForm, ...(presets[name] || presets.gold) });
    setMessage(`Theme preset applied: ${name}. Save branding to publish it.`);
  }

  return <form className="panel branding-panel" onSubmit={saveSettings}>
    <h1>Branding</h1>
    <p className="muted">Change Prizetown into your own competition brand without editing code.</p>

    <div className="branding-preview" style={brandStyle(settingsForm)}>
      <img src={siteLogo(settingsForm)} alt={settingsForm.site_name || 'Site logo'} />
      <div>
        <strong>{settingsForm.site_name || 'Your competition site'}</strong>
        <span>{settingsForm.hero_title || 'Win big prizes'}</span>
      </div>
      <button type="button" className="primary">Sample button</button>
    </div>

    <div className="theme-preset-panel">
      <strong>Quick theme presets</strong>
      <div className="theme-preset-buttons">
        <button type="button" className="theme-preset gold" onClick={() => applyThemePreset('gold')}>Gold</button>
        <button type="button" className="theme-preset blue" onClick={() => applyThemePreset('blue')}>Blue</button>
        <button type="button" className="theme-preset green" onClick={() => applyThemePreset('green')}>Green</button>
        <button type="button" className="theme-preset pink" onClick={() => applyThemePreset('pink')}>Pink</button>
        <button type="button" className="theme-preset dark" onClick={() => applyThemePreset('dark')}>Dark</button>
      </div>
      <p className="muted">Preset colours are only applied after you press <strong>Save branding</strong>.</p>
    </div>

    <div className="two">
      <label>Site name<input value={settingsForm.site_name || ''} onChange={e => setSettingsForm({ ...settingsForm, site_name: e.target.value })} /></label>
      <label>Support email<input type="email" value={settingsForm.support_email || ''} onChange={e => setSettingsForm({ ...settingsForm, support_email: e.target.value })} /></label>
    </div>

    <div className="two">
      <label>Logo URL<input value={settingsForm.logo_url || ''} onChange={e => setSettingsForm({ ...settingsForm, logo_url: e.target.value })} placeholder="/prizetown-logo.png" /></label>
      <label className="file-button">Upload logo<input type="file" accept="image/*" onChange={e => uploadBrandImage(e, 'logo_url')} /></label>
    </div>

    <div className="two">
      <label>Favicon URL<input value={settingsForm.favicon_url || ''} onChange={e => setSettingsForm({ ...settingsForm, favicon_url: e.target.value })} placeholder="/favicon.ico" /></label>
      <label className="file-button">Upload favicon<input type="file" accept="image/*" onChange={e => uploadBrandImage(e, 'favicon_url')} /></label>
    </div>

    <div className="four colour-grid">
      <label>Primary colour<input type="color" value={settingsForm.brand_primary_color || '#facc15'} onChange={e => setSettingsForm({ ...settingsForm, brand_primary_color: e.target.value })} /></label>
      <label>Accent colour<input type="color" value={settingsForm.brand_accent_color || '#f97316'} onChange={e => setSettingsForm({ ...settingsForm, brand_accent_color: e.target.value })} /></label>
      <label>Background<input type="color" value={settingsForm.brand_background_color || '#08101f'} onChange={e => setSettingsForm({ ...settingsForm, brand_background_color: e.target.value })} /></label>
      <label>Button text<input type="color" value={settingsForm.brand_button_text_color || '#08101f'} onChange={e => setSettingsForm({ ...settingsForm, brand_button_text_color: e.target.value })} /></label>
    </div>

    <label>Homepage eyebrow<input value={settingsForm.hero_eyebrow || ''} onChange={e => setSettingsForm({ ...settingsForm, hero_eyebrow: e.target.value })} /></label>
    <label>Homepage title<input value={settingsForm.hero_title || ''} onChange={e => setSettingsForm({ ...settingsForm, hero_title: e.target.value })} /></label>
    <label>Homepage text<textarea value={settingsForm.hero_text || ''} onChange={e => setSettingsForm({ ...settingsForm, hero_text: e.target.value })} /></label>
    <label>Footer text<textarea rows="4" value={settingsForm.footer_text || ''} onChange={e => setSettingsForm({ ...settingsForm, footer_text: e.target.value })} /></label>

    <div className="two">
      <label>Footer credit<input value={settingsForm.brand_footer_credit || ''} onChange={e => setSettingsForm({ ...settingsForm, brand_footer_credit: e.target.value })} /></label>
      <label>Footer link label<input value={settingsForm.brand_footer_link_label || ''} onChange={e => setSettingsForm({ ...settingsForm, brand_footer_link_label: e.target.value })} /></label>
    </div>
    <label>Footer link URL<input value={settingsForm.brand_footer_link_url || ''} onChange={e => setSettingsForm({ ...settingsForm, brand_footer_link_url: e.target.value })} /></label>

    <button className="primary full">Save branding</button>
  </form>;
}

function SocialIntegrationsPanel({ settingsForm, setSettingsForm, saveSettings }) {
  return <form className="panel settings-panel social-integrations-panel" onSubmit={saveSettings}>
    <h1>Social Integrations</h1>
    <p className="muted">Add your public social profile links. Links only show in the website footer when a URL is filled in.</p>
    <div className="admin-grid two">
      <label>Facebook URL<input value={settingsForm.social_facebook_url || ''} onChange={e => setSettingsForm({ ...settingsForm, social_facebook_url: e.target.value })} placeholder="https://facebook.com/yourpage" /></label>
      <label>Instagram URL<input value={settingsForm.social_instagram_url || ''} onChange={e => setSettingsForm({ ...settingsForm, social_instagram_url: e.target.value })} placeholder="https://instagram.com/yourpage" /></label>
      <label>TikTok URL<input value={settingsForm.social_tiktok_url || ''} onChange={e => setSettingsForm({ ...settingsForm, social_tiktok_url: e.target.value })} placeholder="https://tiktok.com/@yourpage" /></label>
      <label>X / Twitter URL<input value={settingsForm.social_x_url || ''} onChange={e => setSettingsForm({ ...settingsForm, social_x_url: e.target.value })} placeholder="https://x.com/yourpage" /></label>
      <label>YouTube URL<input value={settingsForm.social_youtube_url || ''} onChange={e => setSettingsForm({ ...settingsForm, social_youtube_url: e.target.value })} placeholder="https://youtube.com/@yourpage" /></label>
    </div>
    <button className="primary full">Save social links</button>
  </form>;
}

function MobilePreviewPanel() {
  const [device, setDevice] = useState('samsung');
  const [path, setPath] = useState('/draw-broadcast?mobilePreview=1');
  const devices = {
    small: { label: 'Small Android', width: 360, height: 740 },
    samsung: { label: 'Samsung / Android', width: 412, height: 915 },
    iphone: { label: 'iPhone', width: 390, height: 844 },
    large: { label: 'Large phone', width: 430, height: 932 }
  };
  const selected = devices[device] || devices.samsung;
  const previewUrl = window.location.origin + path;

  return <div className="panel mobile-preview-panel">
    <h1>Mobile Preview</h1>
    <p className="muted">Use this before changing mobile draw screens. It shows the public live draw page inside phone-sized frames so layout problems are easier to spot.</p>
    <div className="mobile-preview-controls">
      {Object.entries(devices).map(([key, item]) => <button type="button" key={key} className={device === key ? 'primary' : 'secondary'} onClick={() => setDevice(key)}>{item.label}</button>)}
      <button type="button" className="secondary" onClick={() => setPath('/draw-broadcast?mobilePreview=1')}>Live draw</button>
      <button type="button" className="secondary" onClick={() => setPath('/draw-broadcast?transparent=1&mobilePreview=1')}>Transparent overlay</button>
      <button type="button" className="secondary" onClick={() => window.open(previewUrl, 'prizetown_mobile_preview')}>Open preview</button>
    </div>
    <div className="mobile-preview-layout">
      <div className="mobile-preview-frame-wrap">
        <div className="mobile-preview-phone" style={{ width: selected.width, maxWidth: '100%' }}>
          <div className="mobile-preview-phone-top">{selected.label} - {selected.width} x {selected.height}</div>
          <iframe title="Prizetown mobile preview" src={previewUrl} style={{ height: selected.height }} />
        </div>
      </div>
      <div className="mobile-preview-checklist">
        <h2>What to check</h2>
        <ul>
          <li>Spinner is visible and centred.</li>
          <li>No vertical squeezed text.</li>
          <li>Arnold does not cover the wheel on mobile.</li>
          <li>Live time, draw date and competition title remain readable.</li>
          <li>Winner ticket number is readable after the draw finishes.</li>
          <li>No sideways scrolling.</li>
        </ul>
        <p className="muted">Use this page to compare phone sizes before changing the public draw CSS again.</p>
      </div>
    </div>
  </div>;
}

function StreamHelperPanel({ settingsForm, setSettingsForm, saveSettings, setMessage }) {
  const youtubeUrl = settingsForm.youtube_live_url || settingsForm.social_youtube_url || '';
  const channelUrl = settingsForm.social_youtube_url || '';
  const obsUrl = window.location.origin + '/draw-broadcast';
  const obsTransparentUrl = window.location.origin + '/draw-broadcast?transparent=1';
  const youtubeOpenUrl = youtubeUrl
    ? (youtubeUrl.trim().startsWith('http://') || youtubeUrl.trim().startsWith('https://') ? youtubeUrl.trim() : 'https://' + youtubeUrl.trim().replace(/^\/+/, ''))
    : '';
  const youtubeChannelOpenUrl = channelUrl
    ? (channelUrl.trim().startsWith('http://') || channelUrl.trim().startsWith('https://') ? channelUrl.trim() : 'https://' + channelUrl.trim().replace(/^\/+/, ''))
    : '';

  function copyText(label, text) {
    navigator.clipboard?.writeText(text);
    setMessage(label + ' copied.');
  }

  const description = [
    settingsForm.site_name || 'Prizetown',
    'Official live prize draw.',
    '',
    'Watch the draw live and check winner results on the website.',
    channelUrl ? 'YouTube channel: ' + channelUrl : '',
    '',
    'Please play responsibly. Full terms, free entry route and winner information are available on the Prizetown website.'
  ].filter(Boolean).join(String.fromCharCode(10));

  const checklist = [
    'Prizetown OBS setup checklist',
    '1. Add Browser Source: ' + obsUrl,
    '2. Set width 1920 and height 1080.',
    '3. Enable refresh browser when scene becomes active.',
    '4. Keep Prizetown admin open separately via Tailscale/admin.',
    '5. Use Draw Control Room before going live.',
    '6. Use Final Draw for the official wheel and winner reveal.',
    'Transparent overlay URL: ' + obsTransparentUrl
  ].join(String.fromCharCode(10));

  return <form className="panel stream-helper-panel" onSubmit={saveSettings}>
    <h1>YouTube / OBS Stream Helper</h1>
    <p className="muted">Save your YouTube links and copy ready-made stream text/checklists for live prize draws.</p>
    <div className="form-grid">
      <label>YouTube live URL<input value={settingsForm.youtube_live_url || ''} onChange={e => setSettingsForm({ ...settingsForm, youtube_live_url: e.target.value })} placeholder="https://youtube.com/live/..." /></label>
      <label>YouTube channel URL<input value={settingsForm.social_youtube_url || ''} onChange={e => setSettingsForm({ ...settingsForm, social_youtube_url: e.target.value })} placeholder="https://youtube.com/@prizetown" /></label>
    </div>
    <div className="stream-helper-actions">
      <button type="submit" className="primary">Save stream settings</button>
      <button type="button" className="secondary" onClick={() => copyText('YouTube description', description)}>Copy YouTube description</button>
      <button type="button" className="secondary" onClick={() => copyText('OBS checklist', checklist)}>Copy OBS checklist</button>
      {youtubeOpenUrl && <a className="button secondary" href={youtubeOpenUrl} target="_blank" rel="noopener noreferrer">Open YouTube live</a>}
      {youtubeChannelOpenUrl && <a className="button secondary" href={youtubeChannelOpenUrl} target="_blank" rel="noopener noreferrer">Open YouTube channel</a>}
    </div>
    <div className="stream-helper-cards">
      <article><strong>OBS Browser Source</strong><span>{obsUrl}</span></article>
      <article><strong>Transparent Overlay</strong><span>{obsTransparentUrl}</span></article>
      <article><strong>YouTube Live</strong><span>{youtubeUrl || 'Not set yet'}</span></article>
    </div>
  </form>;
}
function ModulesPanel({ settingsForm, setSettingsForm, saveSettings }) {
  const modules = [
    ['module_postcodes_enabled', 'Postcode competitions', 'Show postcode signup, postcode zones, and competition postcode assignment tools. Turn off for a simple national competition site.'],
    ['module_instant_wins_enabled', 'Instant wins', 'Enable instant-win prize tools and instant-win admin menu sections.'],
    ['module_live_draw_enabled', 'Live draw / OBS', 'Enable the built-in live draw wheel and OBS-ready broadcast screen.'],
    ['module_arnold_enabled', 'Arnold host', 'Show Arnold host mode on homepage, admin draw preview and live draw screen.'],
    ['module_wheel_demo_enabled', 'Wheel of Luck demo', 'Show the customer-facing demo wheel on the homepage.'],
    ['module_profit_planner_enabled', 'Profit planner', 'Enable competition profit planning tools and margin warnings.'],
    ['module_cookie_legal_enabled', 'Cookie/legal popups', 'Enable cookie consent and first-visit legal disclaimer popups.']
  ];

  function setModule(key, enabled) {
    setSettingsForm({ ...settingsForm, [key]: enabled ? 'true' : 'false' });
  }

  return <form className="panel modules-panel" onSubmit={saveSettings}>
    <h1>Modules</h1>
    <p className="muted">Switch Prizetown features on or off. This makes the app usable as a simple national competition site or a fuller postcode/live-draw platform.</p>
    <div className="modules-grid">
      {modules.map(([key, title, description]) => {
        const enabled = featureEnabled(settingsForm, key);
        return <article className={`module-card ${enabled ? 'enabled' : 'disabled'}`} key={key}>
          <div>
            <strong>{title}</strong>
            <p>{description}</p>
          </div>
          <button type="button" className={enabled ? 'primary' : 'secondary'} onClick={() => setModule(key, !enabled)}>
            {enabled ? 'ON' : 'OFF'}
          </button>
        </article>;
      })}
    </div>
    <button className="primary full">Save module settings</button>
  </form>;
}

function SystemCheckPanel({ setMessage }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);

  async function runCheck() {
    try {
      setLoading(true);
      const result = await api('/admin/system-check');
      setReport(result);
      setMessage(result.summary || 'System check completed.');
    } catch (err) {
      setMessage(err.message);
      setReport({
        ok: false,
        summary: `System check failed: ${err.message}`,
        checks: [{ status: 'error', title: 'System check request', detail: err.message }]
      });
    } finally {
      setLoading(false);
    }
  }

  async function copyReport() {
    const text = JSON.stringify(report || {}, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setMessage('System check report copied.');
    } catch {
      setMessage('Could not copy report. Select and copy the report manually.');
    }
  }

  const checks = safeArray(report?.checks);
  const grouped = {
    error: checks.filter(c => c.status === 'error'),
    warning: checks.filter(c => c.status === 'warning'),
    ok: checks.filter(c => c.status === 'ok')
  };

  return <section className="panel system-check-panel">
    <div className="draw-room-head">
      <div>
        <h2>System Check / AI Debug</h2>
        <p className="muted">Runs a smart diagnostic across API, database, uploads, draw state, settings and key records. This is rule-based for reliability and works without an external AI key.</p>
      </div>
      <button className="primary" onClick={runCheck} disabled={loading}>{loading ? 'Checking...' : 'Run Smart Debug'}</button>
    </div>

    {report && <div className={`system-summary ${report.ok ? 'ok' : 'warn'}`}>
      <strong>{report.ok ? 'System looks healthy' : 'Review recommended'}</strong>
      <p>{report.summary}</p>
      {report.totals && <div className="system-totals">
        <span>Competitions: {report.totals.competitions}</span>
        <span>Orders: {report.totals.orders}</span>
        <span>Entries: {report.totals.entries}</span>
        <span>Winners: {report.totals.winners}</span>
        <span>Warnings: {report.totals.warnings}</span>
        <span>Errors: {report.totals.errors}</span>
      </div>}
      <button className="secondary" onClick={copyReport}>Copy debug report</button>
    </div>}

    {report && <div className="system-check-grid">
      {['error','warning','ok'].map(group => grouped[group].length > 0 && <div className={`system-check-column ${group}`} key={group}>
        <h3>{group === 'ok' ? 'OK' : group === 'warning' ? 'Warnings' : 'Needs fixing'}</h3>
        {grouped[group].map((item, idx) => <article className={`system-check-card ${item.status}`} key={`${group}-${idx}`}>
          <strong>{item.status === 'ok' ? '✅' : item.status === 'warning' ? '⚠️' : '❌'} {item.title}</strong>
          <p>{item.detail}</p>
        </article>)}
      </div>)}
    </div>}

    {!report && <div className="empty-state">
      <p>Click <strong>Run Smart Debug</strong> to check Prizetown before going live or before a draw.</p>
    </div>}
  </section>;
}

function DrawProofPanel({ drawResults = [], setMessage }) {
  const rows = safeArray(drawResults).slice().sort((a, b) => new Date(b.created_at || b.draw_date || 0) - new Date(a.created_at || a.draw_date || 0));

  function copySummary(r) {
    const text = [
      'Prizetown official final draw result',
      'Competition: ' + (r.competition_title || r.title || 'Competition'),
      'Winner: ' + (r.winner_name || 'Customer'),
      'Ticket: #' + (r.ticket_number || 'N/A'),
      'Draw method: ' + (r.draw_method || r.method || 'secure final draw'),
      'Recorded: ' + (r.created_at ? fmtDate(r.created_at) : 'saved in Prizetown')
    ].join(String.fromCharCode(10));
    navigator.clipboard?.writeText(text);
    setMessage('Draw proof summary copied.');
  }

  return <div className="panel draw-proof-panel">
    <h1>Draw Proof / Audit</h1>
    <p className="muted">Use this after a live draw to check the saved winner record and copy a simple public result summary for YouTube, Facebook or customer updates.</p>
    <div className="draw-proof-summary">
      <article><strong>{rows.length}</strong><span>Saved final draw records</span></article>
      <article><strong>{rows.filter(r => r.ticket_number).length}</strong><span>Winner tickets recorded</span></article>
      <article><strong>{rows[0]?.created_at ? fmtDate(rows[0].created_at) : 'No result yet'}</strong><span>Latest result</span></article>
    </div>
    {rows.length === 0 ? <div className="empty-state"><h3>No draw results saved yet</h3><p>Run a final draw first. The saved result will appear here for proof and admin audit checks.</p></div> : <div className="draw-proof-list">
      {rows.map(r => <article className="draw-proof-card" key={r.id || String(r.competition_id || '') + '-' + String(r.ticket_number || '')}>
        <div>
          <h3>{r.competition_title || r.title || 'Competition'}</h3>
          <p className="muted">Recorded: {r.created_at ? fmtDate(r.created_at) : 'saved'} - Method: {r.draw_method || r.method || 'secure final draw'}</p>
          <div className="draw-proof-grid">
            <span><b>Winner</b>{r.winner_name || 'Customer'}</span>
            <span><b>Ticket</b>#{r.ticket_number || 'N/A'}</span>
            <span><b>Entry ID</b>{r.entry_id || 'N/A'}</span>
            <span><b>Competition ID</b>{r.competition_id || 'N/A'}</span>
          </div>
          {r.notes && <p className="draw-proof-notes">{r.notes}</p>}
        </div>
        <button type="button" className="secondary" onClick={() => copySummary(r)}>Copy summary</button>
      </article>)}
    </div>}
  </div>;
}
function DrawControlRoom({ competitions = [], setPage, setMessage, reload }) {
  const now = Date.now();
  const rows = safeArray(competitions).filter(c => c.draw_at || c.auto_draw_enabled || c.status === 'closed').sort((a, b) => new Date(a.draw_at || 0) - new Date(b.draw_at || 0));
  const dueRows = rows.filter(c => {
    const drawDue = c.draw_at && new Date(c.draw_at).getTime() <= now;
    const soldOut = Number(c.entries_sold || 0) >= Number(c.max_tickets || 0);
    const closed = c.status === 'closed';
    return c.auto_draw_enabled === true && drawDue && (soldOut || closed) && !c.winner_entry_id;
  });

  async function runDueDraws() {
    try {
      const r = await api('/admin/draw/run-due-auto', { method: 'POST' });
      setMessage(`Auto draw check complete: ${safeArray(r.completed).length} completed.`);
      if (reload) await reload();
    } catch (err) {
      setMessage(err.message);
    }
  }

  function copyUrl(path) {
    const url = window.location.origin + path;
    navigator.clipboard?.writeText(url);
    setMessage('OBS URL copied: ' + url);
  }

  return <div className="panel draw-control-room">
    <h1>Draw Control Room</h1>
    <p className="muted">Use this before going live on OBS/YouTube. It shows draw readiness, quick OBS links and safe controls for scheduled auto draws.</p>
    <div className="draw-control-actions">
      <button type="button" className="primary" onClick={() => setPage('draw-broadcast')}>Open broadcast screen</button>
      <button type="button" className="secondary" onClick={() => window.open('/draw-broadcast', 'prizetown_draw_broadcast')}>Open OBS window</button>
      <button type="button" className="secondary" onClick={() => copyUrl('/draw-broadcast')}>Copy OBS URL</button>
      <button type="button" className="secondary" onClick={() => copyUrl('/draw-broadcast?transparent=1')}>Copy transparent overlay URL</button>
      <button type="button" className="primary" onClick={runDueDraws}>Run due auto draws now</button>
    </div>
    <div className="draw-control-summary">
      <article><strong>{rows.length}</strong><span>Draw-related competitions</span></article>
      <article><strong>{dueRows.length}</strong><span>Due auto draws</span></article>
      <article><strong>{rows.filter(c => c.winner_entry_id).length}</strong><span>Winner recorded</span></article>
    </div>
    <div className="draw-control-list">
      {rows.length === 0 ? <p className="muted">No draw competitions found yet.</p> : rows.map(c => {
        const drawDue = c.draw_at && new Date(c.draw_at).getTime() <= now;
        const soldOut = Number(c.entries_sold || 0) >= Number(c.max_tickets || 0);
        const closed = c.status === 'closed';
        const ready = drawDue && (soldOut || closed) && !c.winner_entry_id;
        const status = c.winner_entry_id ? 'Winner recorded' : ready ? 'Ready for draw' : drawDue ? 'Draw time reached' : 'Waiting';
        return <article className="draw-control-card" key={c.id}>
          <div>
            <h3>{c.title}</h3>
            <p className="muted">Draw: {fmtDate(c.draw_at)} · Status: {c.status || 'draft'} · Sold: {c.entries_sold || 0}/{c.max_tickets || 0}</p>
          </div>
          <span className={`draw-status-pill ${ready ? 'ready' : c.winner_entry_id ? 'done' : 'waiting'}`}>{status}</span>
        </article>;
      })}
    </div>
  </div>;
}

function BuiltInDrawWheel({ competitions, setMessage, settings = {} }) {
  const [competitionId, setCompetitionId] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [winner, setWinner] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [drawTime, setDrawTime] = useState(new Date());
  const [spinSoundUrl, setSpinSoundUrl] = useState(localStorage.getItem('prizetownSpinSoundUrl') || '');
  const [introSoundUrl, setIntroSoundUrl] = useState(localStorage.getItem('prizetownIntroSoundUrl') || '');
  const [winnerSoundUrl, setWinnerSoundUrl] = useState(localStorage.getItem('prizetownWinnerSoundUrl') || '');
  const [drawIntroEnabled, setDrawIntroEnabled] = useState(() => localStorage.getItem('prizetownDrawIntroEnabled') !== 'false');
  const [winnerSoundEnabled, setWinnerSoundEnabled] = useState(() => localStorage.getItem('prizetownWinnerSoundEnabled') !== 'false');
  const [introDurationSeconds, setIntroDurationSeconds] = useState(() => localStorage.getItem('prizetownIntroDurationSeconds') || '6');
  const arnoldModuleEnabled = featureEnabled(settings, 'module_arnold_enabled');
  const [showArnold, setShowArnold] = useState(() => {
    const saved = localStorage.getItem('prizetown_draw_show_arnold');
    return saved === null ? true : saved !== 'false';
  });
  const [spinSpeed, setSpinSpeed] = useState(() => localStorage.getItem('prizetown_draw_spin_speed') || 'standard');
  const [spinnerStyle, setSpinnerStyle] = useState(() => localStorage.getItem('prizetown_spinner_style') || settings.spinner_style || 'classic');
  const spinAudioRef = useRef(null);
  const introAudioRef = useRef(null);
  const winnerAudioRef = useRef(null);

  const competitionList = safeArray(competitions);
  const entryList = safeArray(entries);
  const competition = competitionList.find(c => String(c.id) === String(competitionId));
  const visualEntries = buildWheelTickets(entryList, winner);

  useEffect(() => {
    const t = setInterval(() => setDrawTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  async function publishBroadcastState(nextState) {
    try {
      await api('/admin/draw/broadcast-state', { method: 'POST', body: JSON.stringify(nextState || {}) });
      return true;
    } catch (err) {
      console.warn('Broadcast sync failed', err);
      setMessage(`Tickets loaded, but OBS broadcast sync failed: ${err.message}`);
      return false;
    }
  }

  function visualTicketSample(rows, picked = winner) {
    return buildWheelTickets(rows, picked);
  }

  function speedMs() {
    if (spinSpeed === 'fast') return 6000;
    if (spinSpeed === 'showcase') return 14000;
    return 10000;
  }

  function setSpeedPreset(next) {
    setSpinSpeed(next);
    localStorage.setItem('prizetown_draw_spin_speed', next);
    setMessage('Spin speed set to ' + next + '.');
  }

  function setSpinnerStylePreset(next) {
    setSpinnerStyle(next);
    localStorage.setItem('prizetown_spinner_style', next);
    setMessage(next === 'ticket-squares' ? 'Spinner style set to ticket squares. Renderer patch comes next.' : 'Spinner style set to classic.');
  }

  function createTestEntries(count = 100) {
    const demoNames = ['Alex Brown', 'Sam Roberts', 'Jamie Khan', 'Taylor Morgan', 'Jordan Smith', 'Casey Jones', 'Riley Walker', 'Charlie Lee'];
    const pool = Array.from({ length: Math.max(count * 3, count + 50) }, (_, i) => i + 1);
    const picked = [];
    for (let i = 0; i < count; i += 1) {
      const index = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(index, 1)[0]);
    }
    return picked.sort((a, b) => a - b).map((ticketNumber, i) => ({
      ticket_number: ticketNumber,
      customer_name: demoNames[i % demoNames.length],
      email: `test${ticketNumber}@prizetown.local`,
      order_id: `TEST-${String(ticketNumber).padStart(4, '0')}`,
      payment_status: 'paid'
    }));
  }

  function loadTestEntries(count = 100) {
    const rows = createTestEntries(count);
    setCompetitionId('');
    setEntries(rows);
    setWinner(null);
    setSpinning(false);
    setTestMode(true);
    setRotation(0);
    setMessage(`${rows.length} test tickets loaded for draw preview. Test mode does not record an official winner, so you can spin repeatedly.`);
    publishBroadcastState({
      ...broadcastBase(rows, 'ready', null, {
        competition_id: 'TEST',
        competition_title: `Test draw preview (${count} tickets)`,
        competition_number: '#TEST',
        draw_date: new Date().toISOString(),
        ticket_capacity: count,
        draw_method: 'test_preview_local_random'
      }),
      visual_tickets: visualTicketSample(rows, null)
    });
  }

  function broadcastBase(rows = entries, mode = 'ready', picked = winner, extra = {}) {
    const safeRows = safeArray(rows);
    const c = competition || competitions.find(x => String(x.id) === String(competitionId)) || {};
    return {
      mode,
      competition_id: c.id || competitionId || null,
      competition_title: c.title || '',
      logo_url: settings.logo_url || '/prizetown-logo.png',
      competition_number: c.id ? `#${c.id}` : '',
      draw_date: c.draw_at || '',
      ticket_capacity: Number(c.max_tickets || 0),
      eligible_count: safeRows.length,
      visual_tickets: visualTicketSample(safeRows, picked),
      winner: picked ? {
        ticket_number: picked?.ticket_number ?? '',
        customer_name: picked?.customer_name || picked?.name || 'Customer',
        email: picked?.email || picked?.customer_email || ''
      } : null,
      show_arnold: arnoldModuleEnabled && showArnold,
      spinner_style: spinnerStyle,
      ...extra
    };
  }

  function openBroadcastScreen() {
    const live = window.open('/draw-live?obs=1&v=98', 'prizetown_live_draw', 'width=1280,height=900,menubar=no,toolbar=no,location=no,status=no');
    try { live?.focus?.(); } catch {}
    return live;
  }

  async function resetBroadcast() {
    try {
      await api('/admin/draw/broadcast-reset', { method: 'POST' });
      setWinner(null);
      setMessage('Broadcast draw screen reset.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function sendObsTest() {
    const nowIso = new Date().toISOString();
    const testTickets = Array.from({ length: 36 }, (_, i) => ({
      ticket_number: i + 1,
      customer_name: ['Alex B', 'Sam R', 'Jamie K', 'Taylor M'][i % 4]
    }));
    const testWinner = { ticket_number: 17, customer_name: 'Test Winner', email: 'winner@example.com' };
    try {
      await api('/admin/draw/broadcast-state', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'winner',
          competition_id: 'TEST',
          competition_title: 'OBS Broadcast Test Draw',
          competition_number: '#TEST',
          draw_date: nowIso,
          ticket_capacity: 100,
          eligible_count: 100,
          visual_tickets: testTickets,
          winner: testWinner,
          show_arnold: showArnold
        })
      });
      setWinner(testWinner);
      setMessage('OBS test sent. Open /draw-live?obs=1&v=98 or refresh the OBS Browser Source.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function clearObsTest() {
    try {
      await api('/admin/draw/broadcast-state', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'idle',
          competition_id: null,
          competition_title: 'Waiting for competition',
          competition_number: '',
          draw_date: '',
          ticket_capacity: 0,
          eligible_count: 0,
          visual_tickets: [],
          winner: null,
          reveal_at: '',
          spin_id: '',
          locked_ticket_number: '',
          show_arnold: showArnold
        })
      });
      setWinner(null);
      setMessage('OBS test switched off. Broadcast screen returned to waiting mode.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  function toggleArnold() {
    const next = !showArnold;
    setShowArnold(next);
    localStorage.setItem('prizetown_draw_show_arnold', String(next));
    publishBroadcastState({ ...broadcastBase(entryList, winner ? 'winner' : entryList.length ? 'ready' : 'idle', winner), show_arnold: next });
    setMessage(next ? 'Arnold host shown on draw screen.' : 'Arnold host hidden for cleaner text/overlay.');
  }

  async function uploadDrawSound(e, setter, storageKey, label) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setMessage('Please choose an audio file such as MP3, WAV, M4A or OGG.');
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setter(localUrl);
    localStorage.setItem(storageKey, localUrl);
    setMessage(`${label} selected: ${file.name}`);

    try {
      const body = new FormData();
      body.append('file', file);
      const uploaded = await api('/admin/upload', { method: 'POST', body });
      if (uploaded?.url) {
        const finalUrl = imageUrl(uploaded.url);
        setter(finalUrl);
        localStorage.setItem(storageKey, finalUrl);
        setMessage(`${label} uploaded: ${file.name}`);
      }
    } catch (err) {
      console.warn(label + ' upload not available, using local browser sound for this device', err);
    }
  }

  async function playOneShotAudio(ref, url, label) {
    const audio = ref.current;
    if (!audio || !url) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.loop = false;
      await audio.play();
    } catch (err) {
      console.warn(label + ' could not auto-play', err);
    }
  }

  async function uploadSpinSound(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setMessage('Please choose an audio file such as MP3, WAV, M4A or OGG.');
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setSpinSoundUrl(localUrl);
    localStorage.setItem('prizetownSpinSoundUrl', localUrl);
    setMessage(`Spin sound selected: ${file.name}`);

    // Try server upload as well, if the current API allows audio uploads.
    try {
      const body = new FormData();
      body.append('file', file);
      const uploaded = await api('/admin/upload', { method: 'POST', body });
      if (uploaded?.url) {
        const finalUrl = imageUrl(uploaded.url);
        setSpinSoundUrl(finalUrl);
        localStorage.setItem('prizetownSpinSoundUrl', finalUrl);
        setMessage(`Spin sound uploaded: ${file.name}`);
      }
    } catch (err) {
      console.warn('Audio upload not available, using local browser sound for this device', err);
    }
  }

  function stopSpinSound() {
    const audio = spinAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  async function playSpinSound() {
    const audio = spinAudioRef.current;
    if (!audio || !spinSoundUrl) return;
    try {
      audio.currentTime = 0;
      audio.loop = true;
      await audio.play();
    } catch (err) {
      console.warn('Spin sound could not auto-play', err);
      setMessage('Spin started. Browser blocked sound autoplay; click the page once then spin again if you need audio.');
    }
  }

  async function loadEntries() {
    if (!competitionId) return setMessage('Choose a competition first.');
    try {
      setLoading(true);
      setWinner(null);
      const result = await api(`/admin/competitions/${competitionId}/draw-entries`);
      const rows = safeArray(result.entries || result);
      setTestMode(false);
      setEntries(rows);
      setMessage(`${rows.length} eligible draw tickets loaded for official secure draw.`);
      publishBroadcastState(broadcastBase(rows, 'ready', null, { draw_method: 'official_secure_server_ready' }));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function spinDraw() {
    if (entryList.length === 0) return setMessage('Load entries before spinning.');
    if (spinning) return;

    openBroadcastScreen();

    let picked;
    let officialRows = entryList;
    let secureMethod = 'demo_local_preview_only';

    if (competitionId && !testMode) {
      try {
        const secure = await api(`/admin/competitions/${competitionId}/secure-draw`, { method: 'POST' });
        picked = secure.winner;
        officialRows = safeArray(secure.entries || entryList);
        secureMethod = secure.method || 'secure_server_crypto_randomInt';
        setEntries(officialRows);
      } catch (err) {
        setMessage(err.message);
        return;
      }
    } else {
      picked = entryList[Math.floor(Math.random() * entryList.length)];
      secureMethod = testMode ? 'test_preview_local_random_repeatable' : 'demo_local_preview_only';
    }

    const finalWinner = {
      ticket_number: picked.ticket_number,
      customer_name: picked.customer_name || picked.name || 'Customer',
      email: picked.email || picked.customer_email || ''
    };
    const wheelTickets = buildWheelTickets(officialRows, finalWinner);
    const targetRotation = wheelRotationForWinner(wheelTickets, picked.ticket_number, rotation);
    const spinMs = speedMs();
    const spinId = `${testMode ? 'test' : (competitionId || 'demo')}-${Date.now()}-${picked.ticket_number}`;
    const revealAt = new Date(Date.now() + spinMs + 700).toISOString();
    const introMs = drawIntroEnabled ? Math.max(3, Math.min(12, Number(introDurationSeconds) || 6)) * 1000 : 0;
    const drawModeLabel = testMode ? 'Test draw' : competition?.auto_draw_enabled ? 'Automatic scheduled draw' : 'Official manual draw';
    const postcodeLabel = competition?.postcode_zone_label || competition?.postcode_zone || competition?.postcode_mode || competition?.zone_codes || 'Open competition';

    if (introMs > 0) {
      await publishBroadcastState({
        ...broadcastBase(wheelTickets, 'intro', null, {
          winner: null,
          locked_ticket_number: '',
          target_rotation: 0,
          draw_method: secureMethod,
          draw_mode: drawModeLabel,
          postcode_zone_label: postcodeLabel,
          intro_sound_url: introSoundUrl,
          spin_sound_url: spinSoundUrl,
          winner_sound_url: winnerSoundUrl
        }),
        eligible_count: officialRows.length,
        visual_tickets: wheelTickets
      });
      await playOneShotAudio(introAudioRef, introSoundUrl, 'Intro sound');
      setMessage(`Draw intro started: ${competition?.title || 'competition'} (${drawModeLabel}).`);
      await new Promise(resolve => setTimeout(resolve, introMs));
    }

    setWinner(null);
    setSpinning(true);
    playSpinSound();
    setRotation(targetRotation);

    publishBroadcastState({
      ...broadcastBase(wheelTickets, 'spinning', finalWinner, {
        spin_id: spinId,
        reveal_at: revealAt,
        locked_ticket_number: picked.ticket_number,
        target_rotation: targetRotation,
        draw_method: secureMethod,
        draw_mode: drawModeLabel,
        postcode_zone_label: postcodeLabel,
        intro_sound_url: introSoundUrl,
        spin_sound_url: spinSoundUrl,
        winner_sound_url: winnerSoundUrl
      }),
      eligible_count: officialRows.length,
      visual_tickets: wheelTickets
    });

    setTimeout(() => {
      setWinner(finalWinner);
      setSpinning(false);
      publishBroadcastState({
        ...broadcastBase(wheelTickets, 'winner', finalWinner, {
          spin_id: spinId,
          reveal_at: new Date(Date.now() - 1000).toISOString(),
          locked_ticket_number: picked.ticket_number,
          target_rotation: targetRotation,
        draw_method: secureMethod,
        draw_mode: drawModeLabel,
        postcode_zone_label: postcodeLabel,
        intro_sound_url: introSoundUrl,
        spin_sound_url: spinSoundUrl,
        winner_sound_url: winnerSoundUrl
        }),
        eligible_count: officialRows.length,
        visual_tickets: wheelTickets
      });
      setMessage(`${testMode ? 'Test spin complete' : 'Winner selected securely'}: ticket #${picked.ticket_number} - ${finalWinner.customer_name || finalWinner.email || 'Customer'} (${spinSpeed} speed).`);
      stopSpinSound();
      if (winnerSoundEnabled) playOneShotAudio(winnerAudioRef, winnerSoundUrl, 'Winner sound');
    }, spinMs + 700);
  }

  function csvDownload() {
    if (entryList.length === 0) return setMessage('Load entries first.');
    const header = ['competition_id','competition_title','ticket_number','customer_name','customer_email','order_id','payment_status','created_at'];
    const rows = entries.map(e => [
      competitionId,
      competition?.title || '',
      e.ticket_number,
      e.customer_name || '',
      e.email || e.customer_email || '',
      e.order_id || '',
      e.payment_status || '',
      e.created_at || ''
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join(String.fromCharCode(10));
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prizetown-draw-${competitionId || 'competition'}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return <section className="panel draw-room">
    <audio ref={introAudioRef} src={introSoundUrl || undefined} preload="auto" />
    <audio ref={spinAudioRef} src={spinSoundUrl || undefined} preload="auto" />
    <audio ref={winnerAudioRef} src={winnerSoundUrl || undefined} preload="auto" />
    {arnoldModuleEnabled && showArnold && <div className="draw-arnold-row">
      <ArnoldHost
        stage={spinning ? 'spinning' : winner ? 'winner' : entryList.length > 0 ? 'ready' : 'idle'}
        caption={spinning ? 'The wheel is spinning now!' : winner ? `Winning ticket #${winner.ticket_number} — ${winner.customer_name || winner.name || 'Customer'}!` : entryList.length > 0 ? `${entryList.length} tickets loaded. Arnold is ready to host the draw.` : 'Choose a competition and load tickets to start the final draw.'}
      />
    </div>}
    <div className="draw-room-head">
      <div>
        <h2>Built-in Final Draw Wheel</h2><p className="muted">Arnold is back on the admin preview and the OBS/live draw screen.</p><p className="draw-official-note"><strong>Official Prizetown draw tool:</strong> this replaces the old external wheel link and runs directly inside the site.</p>
        <p className="muted">Runs inside Prizetown. Suitable for large draws: the winner is picked from the full eligible ticket list. The wheel now spins for around 10 seconds and can play your uploaded spin sound.</p>
      </div>
      <div className="draw-clock">
        <strong>{drawTime.toLocaleDateString()}</strong>
        <span>{drawTime.toLocaleTimeString()}</span>
      </div>
    </div>

    <div className="two">
      <label>Competition
        <select value={competitionId} onChange={e => { setCompetitionId(e.target.value); setEntries([]); setWinner(null); setTestMode(false); }}>
          <option value="">Choose competition</option>
          {competitionList.map(c => <option key={c.id} value={c.id}>#{c.id} - {c.title}</option>)}
        </select>
      </label>
      <label>Competition number / ID
        <input readOnly value={competition ? `#${competition.id}` : ''} />
      </label>
    </div>

    {competition && <div className="draw-meta">
      <span><strong>Competition:</strong> #{competition.id} {competition.title}</span>
      <span><strong>Draw date:</strong> {fmtDate(competition.draw_at)}</span>
      <span><strong>Tickets sold:</strong> {competition.entries_sold || 0}/{competition.max_tickets}</span>
      <span><strong>Capacity:</strong> {competition.max_tickets}</span>
    </div>}

    <div className="draw-actions draw-actions-clean">
      <button className="secondary" onClick={loadEntries} disabled={loading}>{loading ? 'Loading...' : 'Load eligible tickets'}</button>
      <button className="primary live-draw-start" onClick={spinDraw} disabled={spinning || entryList.length === 0}>{spinning ? 'Live draw running...' : testMode ? 'Spin Test Tickets Again' : 'Start Official Live Draw'}</button>
      <button className="secondary" onClick={openBroadcastScreen}>Open Live Draw Window</button>
      {arnoldModuleEnabled && <button className={showArnold ? 'primary arnold-toggle-on' : 'secondary'} type="button" onClick={toggleArnold}>{showArnold ? 'Arnold On' : 'Arnold Off'}</button>}
      <button className="secondary" onClick={csvDownload} disabled={entryList.length === 0}>Download entries CSV</button>
      <label className="sound-upload-button">Upload intro sound<input type="file" accept="audio/*" onChange={e => uploadDrawSound(e, setIntroSoundUrl, 'prizetownIntroSoundUrl', 'Intro sound')} /></label>
      <label className="sound-upload-button">Upload spin sound<input type="file" accept="audio/*" onChange={uploadSpinSound} /></label>
      <label className="sound-upload-button">Upload winner sound<input type="file" accept="audio/*" onChange={e => uploadDrawSound(e, setWinnerSoundUrl, 'prizetownWinnerSoundUrl', 'Winner sound')} /></label>
      {spinSoundUrl && <button className="secondary" type="button" onClick={() => { stopSpinSound(); setSpinSoundUrl(''); localStorage.removeItem('prizetownSpinSoundUrl'); setMessage('Spin sound removed.'); }}>Remove spin sound</button>}
    </div>

    <div className="draw-sound-options">
      <label><input type="checkbox" checked={drawIntroEnabled} onChange={e => { setDrawIntroEnabled(e.target.checked); localStorage.setItem('prizetownDrawIntroEnabled', String(e.target.checked)); }} /> Show intro before draw</label>
      <label><input type="checkbox" checked={winnerSoundEnabled} onChange={e => { setWinnerSoundEnabled(e.target.checked); localStorage.setItem('prizetownWinnerSoundEnabled', String(e.target.checked)); }} /> Play winner sound after spin</label>
      <label>Intro seconds<input type="number" min="3" max="12" value={introDurationSeconds} onChange={e => { setIntroDurationSeconds(e.target.value); localStorage.setItem('prizetownIntroDurationSeconds', e.target.value); }} /></label>
      <div className="draw-sound-status">
        <span>Intro: {introSoundUrl ? 'set' : 'not set'}</span>
        <span>Spin: {spinSoundUrl ? 'set' : 'not set'}</span>
        <span>Winner: {winnerSoundUrl ? 'set' : 'not set'}</span>
      </div>
    </div>

    <details className="draw-testing-tools">
      <summary>Testing tools / broadcast reset</summary>
      <div className="draw-testing-actions">
        <button className="primary" type="button" onClick={sendObsTest}>Send OBS Test</button>
        <button className="secondary obs-test-off" type="button" onClick={clearObsTest}>OBS Test Off</button>
        {arnoldModuleEnabled && <button className="secondary" type="button" onClick={toggleArnold}>{showArnold ? 'Hide Arnold' : 'Show Arnold'}</button>}
        <button className="danger" type="button" onClick={resetBroadcast}>Reset Broadcast</button>
      </div>
    </details>

    <div className="draw-extra-controls">
      <div className="draw-speed-controls">
        <span className="control-label">Spin speed</span>
        <div className="segmented-buttons">
          <button type="button" className={spinSpeed === 'fast' ? 'primary' : 'secondary'} onClick={() => setSpeedPreset('fast')}>Fast</button>
          <button type="button" className={spinSpeed === 'standard' ? 'primary' : 'secondary'} onClick={() => setSpeedPreset('standard')}>Standard</button>
          <button type="button" className={spinSpeed === 'showcase' ? 'primary' : 'secondary'} onClick={() => setSpeedPreset('showcase')}>Showcase</button>
        </div>
      </div>
      <div className="draw-speed-controls">
        <span className="control-label">Spinner style</span>
        <div className="segmented-buttons">
          <button type="button" className={spinnerStyle === 'classic' ? 'primary' : 'secondary'} onClick={() => setSpinnerStylePreset('classic')}>Classic</button>
          <button type="button" className={spinnerStyle === 'ticket-squares' ? 'primary' : 'secondary'} onClick={() => setSpinnerStylePreset('ticket-squares')}>Ticket squares</button>
        </div>
      </div>

      <div className="draw-speed-controls">
        <span className="control-label">Quick test ticket loads</span>
        <div className="segmented-buttons">
          <button type="button" className="secondary" onClick={() => loadTestEntries(50)}>50</button>
          <button type="button" className="secondary" onClick={() => loadTestEntries(150)}>150</button>
          <button type="button" className="secondary" onClick={() => loadTestEntries(500)}>500</button>
        </div>
      </div>
    </div>

    <div className="draw-stats">
      <div><strong>{entryList.length}</strong><span>eligible tickets loaded</span></div>
      <div><strong>{entryList.length ? 'ON' : 'OFF'}</strong><span>visual draw animation</span></div>
      <div><strong>{competition?.max_tickets || (testMode ? entryList.length : 0)}</strong><span>ticket capacity</span></div>
      <div><strong>{testMode ? 'TEST' : 'OFFICIAL'}</strong><span>draw mode</span></div>
    </div>
    <p className="muted draw-sync-note">{testMode ? 'Test mode: spins are local previews only and can be repeated. They do not record an official winner.' : 'Official mode: Start Official Live Draw opens the live draw window and records one secure server-side winner. Once recorded, the same competition cannot be officially drawn again.'}</p>

    <div className="wheel-stage reveal-machine-wrap admin-reveal-machine-wrap">
      <TrustedWheelDraw mode={spinning ? 'spinning' : winner ? 'winner' : 'idle'} winner={winner} tickets={visualEntries} rotation={rotation} label="ADMIN DRAW PREVIEW" spinnerStyle={spinnerStyle} />
    </div>

    {winner && <div className="winner-card">
      <h2>Winner selected</h2>
      <p><strong>Competition:</strong> #{competition?.id} {competition?.title}</p>
      <p><strong>Winning ticket:</strong> #{winner.ticket_number}</p>
      <p className="winner-big-name"><strong>Winner:</strong> {winner.customer_name || winner.name || 'Customer'}</p>
      <p><strong>Email:</strong> {winner.email || winner.customer_email || 'Not shown'}</p>
      <p><strong>Draw timestamp:</strong> {new Date().toLocaleString()}</p>
    </div>}

    <details>
      <summary>Loaded ticket list preview</summary>
      {entryList.length === 0 ? <p className="muted">No entries loaded.</p> : <div className="entry-chip-list">{entryList.slice(0, 1000).map(e => <span key={e.ticket_number}>#{e.ticket_number}</span>)}</div>}
      {entryList.length > 1000 && <p className="muted">Showing first 1000 tickets only. The draw still uses all {entryList.length} loaded tickets.</p>}
    </details>
  </section>;
}




function DrawTestLab({ setMessage }) {
  const [ticketCount, setTicketCount] = useState(250);
  const [queueCount, setQueueCount] = useState(3);
  const [pauseSeconds, setPauseSeconds] = useState(5);
  const [sameDayDraws, setSameDayDraws] = useState(true);
  const [postcodeLabel, setPostcodeLabel] = useState('BB1 / Blackburn sample zone');
  const [competitionTitle, setCompetitionTitle] = useState('TEST LAB - Postcode Sample Draw');
  const [introSeconds, setIntroSeconds] = useState(5);
  const [spinSeconds, setSpinSeconds] = useState(14);
  const [running, setRunning] = useState(false);
  const [lastWinner, setLastWinner] = useState(null);
  const [queueStatus, setQueueStatus] = useState('Idle');
  const stopQueueRef = useRef(false);

  const sampleNames = ['Alex B','Sam R','Jamie K','Taylor M','Morgan W','Casey L','Jordan P','Riley S','Charlie H','Harper G','Bailey T','Avery M','Cameron D','Finley R','Rowan C','Quinn A'];
  const sampleZones = ['BB1 / Blackburn sample zone','BB2 / Blackburn south sample zone','BB3 / Darwen sample zone','BB4 / Rossendale sample zone','Open competition sample'];

  function soundUrls() {
    return {
      intro_sound_url: localStorage.getItem('prizetownIntroSoundUrl') || localStorage.getItem('prizetown_intro_sound_url') || '',
      spin_sound_url: localStorage.getItem('prizetownSpinSoundUrl') || localStorage.getItem('prizetown_spin_sound_url') || '',
      winner_sound_url: localStorage.getItem('prizetownWinnerSoundUrl') || localStorage.getItem('prizetown_winner_sound_url') || ''
    };
  }

  function makeTickets(count = ticketCount, zone = postcodeLabel) {
    const total = Math.max(1, Math.min(5000, Number(count) || 250));
    return Array.from({ length: total }, (_, index) => {
      const n = index + 1;
      return {
        ticket_number: n,
        customer_name: sampleNames[index % sampleNames.length],
        email: `test${n}@prizetown.local`,
        postcode_zone: zone,
        payment_status: 'test'
      };
    });
  }

  function pickWinner(rows) {
    return rows[Math.floor(Math.random() * rows.length)] || rows[0];
  }

  function openBroadcast() {
    const win = window.open('/draw-broadcast?testLab=1', 'prizetown_test_lab_broadcast', 'width=1280,height=900,menubar=no,toolbar=no,location=no,status=no');
    try { win?.focus?.(); } catch {}
  }

  async function publish(payload) {
    await api('/admin/draw/broadcast-state', { method: 'POST', body: JSON.stringify(payload) });
  }

  async function waitMs(ms) {
    const step = 250;
    let waited = 0;
    while (waited < ms) {
      if (stopQueueRef.current) return;
      await new Promise(resolve => setTimeout(resolve, Math.min(step, ms - waited)));
      waited += step;
    }
  }

  async function runOneTestDraw(drawIndex = 1, totalDraws = 1) {
    const zone = totalDraws > 1 ? sampleZones[(drawIndex - 1) % sampleZones.length] : postcodeLabel;
    const rows = makeTickets(ticketCount, zone);
    const winner = pickWinner(rows);
    const visualTickets = buildWheelTickets(rows, winner);
    const targetRotation = wheelRotationForWinner(visualTickets, winner.ticket_number, 0);
    const drawBaseTime = new Date();
    if (!sameDayDraws) drawBaseTime.setDate(drawBaseTime.getDate() + drawIndex - 1);
    const nowIso = drawBaseTime.toISOString();
    const spinId = `test-lab-${Date.now()}-${drawIndex}-${winner.ticket_number}`;
    const safeIntroSeconds = Math.max(2, Math.min(15, Number(introSeconds) || 5));
    const safeSpinSeconds = Math.max(5, Math.min(25, Number(spinSeconds) || 14));
    const winnerPayload = { ticket_number: winner.ticket_number, customer_name: winner.customer_name, email: winner.email };
    const title = totalDraws > 1 ? `${competitionTitle || 'TEST LAB DRAW'} ${drawIndex} of ${totalDraws}` : (competitionTitle || 'TEST LAB DRAW');

    const base = {
      competition_id: `TEST-LAB-${drawIndex}`,
      competition_title: title,
      competition_number: `#TEST-LAB-${drawIndex}`,
      draw_date: nowIso,
      ticket_capacity: rows.length,
      eligible_count: rows.length,
      visual_tickets: visualTickets,
      spin_id: spinId,
      draw_method: 'test_lab_queue_preview_only_no_real_winner_saved',
      draw_mode: totalDraws > 1 ? `TEST LAB QUEUE - draw ${drawIndex} of ${totalDraws}` : 'TEST LAB - not a real draw',
      postcode_zone_label: zone,
      show_arnold: false,
      spinner_style: localStorage.getItem('prizetown_spinner_style') || 'classic',
      queue_current: drawIndex,
      queue_total: totalDraws,
      queue_next_title: drawIndex < totalDraws ? `${competitionTitle || 'TEST LAB DRAW'} ${drawIndex + 1} of ${totalDraws}` : '',
      ...soundUrls()
    };

    await publish({ ...base, mode: 'intro', winner: null, reveal_at: '', locked_ticket_number: '', target_rotation: 0 });
    setQueueStatus(`Intro: draw ${drawIndex} of ${totalDraws}`);
    setMessage(`Test Lab queue intro sent: draw ${drawIndex} of ${totalDraws}.`);
    await waitMs(safeIntroSeconds * 1000);
    if (stopQueueRef.current) return winner;

    await publish({ ...base, mode: 'spinning', winner: winnerPayload, reveal_at: new Date(Date.now() + safeSpinSeconds * 1000).toISOString(), locked_ticket_number: winner.ticket_number, target_rotation: targetRotation });
    setQueueStatus(`Spinning: draw ${drawIndex} of ${totalDraws}`);
    await waitMs(safeSpinSeconds * 1000 + 700);
    if (stopQueueRef.current) return winner;

    await publish({ ...base, mode: 'winner', winner: winnerPayload, reveal_at: new Date().toISOString(), locked_ticket_number: winner.ticket_number, target_rotation: targetRotation });
    setLastWinner(winner);
    setQueueStatus(`Winner: draw ${drawIndex} of ${totalDraws} - ticket #${winner.ticket_number}`);
    setMessage(`Test Lab draw ${drawIndex} complete: sample ticket #${winner.ticket_number} - ${winner.customer_name}. No real winner was saved.`);
    return winner;
  }

  async function runTestLab() {
    if (running) return;
    setRunning(true);
    stopQueueRef.current = false;
    setLastWinner(null);
    try {
      openBroadcast();
      await runOneTestDraw(1, 1);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function runQueue() {
    if (running) return;
    setRunning(true);
    stopQueueRef.current = false;
    setLastWinner(null);

    try {
      openBroadcast();
      const total = Math.max(1, Math.min(10, Number(queueCount) || 3));
      const pauseMs = Math.max(0, Math.min(30, Number(pauseSeconds) || 5)) * 1000;

      for (let i = 1; i <= total; i += 1) {
        if (stopQueueRef.current) break;
        await runOneTestDraw(i, total);
        if (i < total && !stopQueueRef.current) {
          setQueueStatus(`Pause before draw ${i + 1} of ${total}`);
          await waitMs(pauseMs);
        }
      }

      if (stopQueueRef.current) {
        setMessage('Test Lab queue stopped after the current step.');
        setQueueStatus('Queue stopped');
      } else {
        setMessage(`Test Lab queue finished. ${total} fake draws were previewed only.`);
        setQueueStatus('Queue finished');
      }
    } catch (err) {
      setMessage(err.message);
      setQueueStatus('Queue stopped with error');
    } finally {
      setRunning(false);
    }
  }

  async function resetTestLab() {
    try {
      stopQueueRef.current = true;
      await publish({
        mode: 'idle',
        competition_id: null,
        competition_title: 'Waiting for competition',
        competition_number: '',
        draw_date: '',
        ticket_capacity: 0,
        eligible_count: 0,
        visual_tickets: [],
        winner: null,
        reveal_at: '',
        spin_id: '',
        locked_ticket_number: '',
        target_rotation: 0,
        draw_method: 'test_lab_reset',
        draw_mode: '',
        postcode_zone_label: '',
        show_arnold: false
      });
      setLastWinner(null);
      setQueueStatus('Reset');
      setMessage('Test Lab broadcast reset.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  return <div className="panel draw-test-lab-panel">
    <h1>Draw Test Lab</h1>
    <p className="muted">Safely test the live draw screen with fake tickets, fake users, postcode labels, sounds and queued draws. This does not create orders, entries or real winners.</p>
    <div className="test-lab-warning">TEST MODE ONLY - no real winner is saved and no customer/order data is created.</div>

    <div className="admin-grid two">
      <label>Base competition title<input value={competitionTitle} onChange={e => setCompetitionTitle(e.target.value)} /></label>
      <label>Single draw postcode / zone<input value={postcodeLabel} onChange={e => setPostcodeLabel(e.target.value)} /></label>
      <label>Sample tickets<select value={ticketCount} onChange={e => setTicketCount(Number(e.target.value))}><option value={50}>50 tickets</option><option value={250}>250 tickets</option><option value={1000}>1,000 tickets</option><option value={2500}>2,500 tickets</option><option value={5000}>5,000 tickets</option></select></label>
      <label>Intro seconds<input type="number" min="2" max="15" value={introSeconds} onChange={e => setIntroSeconds(e.target.value)} /></label>
      <label>Spin seconds<input type="number" min="5" max="25" value={spinSeconds} onChange={e => setSpinSeconds(e.target.value)} /></label>
      <label>Queue draws<select value={queueCount} onChange={e => setQueueCount(Number(e.target.value))}><option value={1}>1 draw</option><option value={3}>3 draws</option><option value={5}>5 draws</option><option value={10}>10 draws</option></select></label>
      <label>Pause between queued draws<input type="number" min="0" max="30" value={pauseSeconds} onChange={e => setPauseSeconds(e.target.value)} /></label>
      <label className="checkbox-row"><input type="checkbox" checked={sameDayDraws} onChange={e => setSameDayDraws(e.target.checked)} /> Put queued draws on the same day</label>
    </div>

    <div className="test-lab-actions">
      <button type="button" className="primary" onClick={runTestLab} disabled={running}>{running ? 'Running...' : 'Run one test draw'}</button>
      <button type="button" className="primary" onClick={runQueue} disabled={running}>{running ? 'Queue running...' : 'Run queued test draws'}</button>
      <button type="button" className="secondary" onClick={() => { stopQueueRef.current = true; setQueueStatus('Stop requested after current step'); }}>Stop queue</button>
      <button type="button" className="secondary" onClick={openBroadcast}>Open broadcast screen</button>
      <button type="button" className="secondary" onClick={resetTestLab}>Reset test broadcast</button>
    </div>

    <div className="test-lab-summary">
      <article><strong>{ticketCount}</strong><span>sample tickets per draw</span></article>
      <article><strong>{queueCount}</strong><span>queued draws</span></article>
      <article><strong>{queueStatus}</strong><span>queue status</span></article>
      <article><strong>{sameDayDraws ? 'Same day' : 'Sequential days'}</strong><span>draw dates</span></article>
      <article><strong>{lastWinner ? '#' + lastWinner.ticket_number : 'None yet'}</strong><span>last test winner</span></article>
      <article><strong>{soundUrls().spin_sound_url ? 'Set' : 'Not set'}</strong><span>broadcast spin sound</span></article>
    </div>

    <p className="muted">Broadcast sounds use the intro, spin and winner sounds uploaded in Final draw. In OBS, make sure the browser source has audio enabled.</p>
  </div>;
}


function Admin({ settings, setSettings, competitions, entries, orders, auditLogs, instantWins, postcodeZones = [], postcodeAssignments = [], reload, setMessage, setPage }) {
  const empty = { title: '', slug: '', description: '', question: '', answer: '', free_entry_text: '', rules_text: '', closes_at: '', min_age: 18, age_restricted: true, ticket_price_pence: 199, max_tickets: 100, max_per_user: 10, draw_at: '', status: 'draft', image_url: '', postcode_mode: 'all', prize_cost_pence: 0, marketing_budget_pence: 0, other_buffer_pence: 0, payment_fee_percent: 4, vat_enabled: false, auto_draw_enabled: false };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailTo, setEmailTo] = useState('christian.robertson36@gmail.com');
  const [emailSending, setEmailSending] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [settingsForm, setSettingsForm] = useState({ ...defaultSettings, ...settings });
  const [freeForm, setFreeForm] = useState({ competition_id: '', customer_name: '', customer_email: '', postal_reference: '', notes: '' });
  const [iwForm, setIwForm] = useState({ competition_id: '', prize_title: '', prize_value_pence: 10000, winning_ticket_number: '' });
  const [drawCompetitionId, setDrawCompetitionId] = useState('');
  const [drawData, setDrawData] = useState(null);
  const [drawWinnerEntryId, setDrawWinnerEntryId] = useState('');
  const [drawNotes, setDrawNotes] = useState('');
  const [drawResults, setDrawResults] = useState([]);
  const [postcodeForm, setPostcodeForm] = useState({ code: '', label: '', estimated_population: 0, estimated_households: 0, launch_priority: 'normal', notes: '', active: true });
  const [assignForm, setAssignForm] = useState({ competition_ids: [], mode: 'all', zone_ids: [] });
  const [profitForm, setProfitForm] = useState({ ticket_price_pence: 199, max_tickets: 500, prize_cost_pence: 25000, marketing_budget_pence: 10000, other_buffer_pence: 5000, payment_fee_percent: 4, vat_enabled: false });
  const [profitPlan, setProfitPlan] = useState(null);
  useEffect(() => { setSettingsForm({ ...defaultSettings, ...settings }); }, [settings]);

  const modulePostcodes = featureEnabled(settingsForm, 'module_postcodes_enabled');
  const moduleInstantWins = featureEnabled(settingsForm, 'module_instant_wins_enabled');
  const moduleLiveDraw = featureEnabled(settingsForm, 'module_live_draw_enabled');
  const moduleArnold = featureEnabled(settingsForm, 'module_arnold_enabled');
  const moduleWheelDemo = featureEnabled(settingsForm, 'module_wheel_demo_enabled');
  const moduleProfitPlanner = featureEnabled(settingsForm, 'module_profit_planner_enabled');
  const moduleCookieLegal = featureEnabled(settingsForm, 'module_cookie_legal_enabled');

  function openAdminTab(key) {
    setActiveTab(key);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }


  const liveCount = competitions.filter(c => c.status === 'active').length;
  const totalTickets = entries.length;
  const revenue = orders.reduce((sum, o) => sum + Number(o.total_pence || 0), 0);

  const customerMap = new Map();
  function rememberCustomer(email, name, patch = {}) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return;
    const existing = customerMap.get(key) || { email: key, name: name || 'Customer', order_count: 0, entry_count: 0, free_entry_count: 0, total_pence: 0, last_activity: '' };
    existing.name = existing.name === 'Customer' && name ? name : existing.name;
    Object.assign(existing, patch);
    customerMap.set(key, existing);
  }
  orders.forEach(o => {
    const email = o.customer_email || '';
    const existing = customerMap.get(String(email).toLowerCase()) || {};
    rememberCustomer(email, o.customer_name || existing.name, {
      order_count: Number(existing.order_count || 0) + 1,
      total_pence: Number(existing.total_pence || 0) + Number(o.total_pence || 0),
      last_activity: [existing.last_activity, o.created_at].filter(Boolean).sort().pop() || ''
    });
  });
  entries.forEach(e => {
    const email = e.customer_email || '';
    const existing = customerMap.get(String(email).toLowerCase()) || {};
    const isFree = String(e.payment_status || '').includes('free');
    rememberCustomer(email, e.customer_name || existing.name, {
      entry_count: Number(existing.entry_count || 0) + 1,
      free_entry_count: Number(existing.free_entry_count || 0) + (isFree ? 1 : 0),
      last_activity: [existing.last_activity, e.created_at].filter(Boolean).sort().pop() || ''
    });
  });
  const customerRows = Array.from(customerMap.values()).sort((a, b) => String(b.last_activity || '').localeCompare(String(a.last_activity || '')));
  const filteredCustomerRows = customerRows.filter(c => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return true;
    return String(c.name || '').toLowerCase().includes(q) || String(c.email || '').toLowerCase().includes(q);
  });
  const instantClaimed = instantWins.filter(w => w.status === 'claimed').length;

  function updateField(key, value) { const next = { ...form, [key]: value }; if (key === 'title' && !editing) next.slug = slugify(value); setForm(next); }
  async function save(e) { e.preventDefault(); try { await api(editing ? `/admin/competitions/${editing}` : '/admin/competitions', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(form) }); setMessage(editing ? 'Competition updated.' : 'Competition added.'); setForm(empty); setEditing(null); openAdminTab('competitions'); reload(); } catch (err) { setMessage(err.message); } }
  async function uploadFile(e) { const file = e.target.files?.[0]; if (!file) return; const body = new FormData(); body.append('file', file); try { const data = await api('/admin/upload', { method: 'POST', body }); setForm({ ...form, image_url: data.url }); } catch (err) { setMessage(err.message); } }
  async function remove(id) { if (!confirm('Delete this competition?')) return; await api(`/admin/competitions/${id}`, { method: 'DELETE' }); setMessage('Competition deleted.'); reload(); }
  function edit(c) { setEditing(c.id); setForm({ ...c, draw_at: c.draw_at ? c.draw_at.slice(0, 16) : '', closes_at: c.closes_at ? c.closes_at.slice(0, 16) : '' }); openAdminTab('competition-form'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function saveSettings(e) { e.preventDefault(); try { const saved = await api('/admin/settings', { method: 'PATCH', body: JSON.stringify(settingsForm) }); setSettings({ ...defaultSettings, ...saved }); setMessage('Site settings saved.'); } catch (err) { setMessage(err.message); } }

  async function loadEmailStatus() {
    try {
      const status = await api('/admin/email/status');
      setEmailStatus(status);
      setMessage(status.configured ? 'Email is configured.' : 'Email is not configured yet.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function sendAdminTestEmail(e) {
    e.preventDefault();
    setEmailSending(true);
    try {
      const result = await api('/admin/email/test', { method: 'POST', body: JSON.stringify({ to: emailTo }) });
      setMessage('Test email sent.');
      await loadEmailStatus();
      return result;
    } catch (err) {
      setMessage(err.message);
    } finally {
      setEmailSending(false);
    }
  }
  async function saveFreeEntry(e) { e.preventDefault(); try { const saved = await api('/admin/free-entry', { method: 'POST', body: JSON.stringify(freeForm) }); const emailMsg = saved.email_result?.ok ? ' Confirmation email sent.' : saved.email_result?.error ? ` Email not sent: ${saved.email_result.error}` : ''; setMessage(`Manual/free entry recorded. Ticket #${saved.entry.ticket_number}.${emailMsg}`); setFreeForm({ competition_id: '', customer_name: '', customer_email: '', postal_reference: '', notes: '' }); reload(); } catch (err) { setMessage(err.message); } }
  async function saveInstantWin(e) { e.preventDefault(); try { const saved = await api('/admin/instant-wins', { method: 'POST', body: JSON.stringify(iwForm) }); setMessage(`Instant win added on ticket #${saved.winning_ticket_number}`); setIwForm({ competition_id: '', prize_title: '', prize_value_pence: 10000, winning_ticket_number: '' }); reload(); } catch (err) { setMessage(err.message); } }
  async function deleteInstant(id) { await api(`/admin/instant-wins/${id}`, { method: 'DELETE' }); setMessage('Instant win deleted.'); reload(); }
  async function seedDemo() {
    const daysFromNow = days => new Date(Date.now() + days * 86400000).toISOString();
    const samples = [
      {
        title: 'Cash Blast £500',
        description: 'Win a £500 cash prize. A simple high-impact starter competition for testing tickets, checkout and draw flow.',
        ticket_price_pence: 199,
        max_tickets: 500,
        max_per_user: 25,
        status: 'active',
        image_url: '/demo-posters/cash.svg',
        closes_at: daysFromNow(14),
        draw_at: daysFromNow(15),
        question: 'What colour is the Prizetown logo?',
        correct_answer: 'Gold',
        free_entry_text: 'Postal entry route available. See the Free Entry page for details.',
        rules_text: 'Sample competition for testing only.'
      },
      {
        title: 'Tech Bundle',
        description: 'A bold tech-style prize bundle sample for testing product-style competition posters and checkout.',
        ticket_price_pence: 249,
        max_tickets: 750,
        max_per_user: 20,
        status: 'active',
        image_url: '/demo-posters/tech.svg',
        closes_at: daysFromNow(18),
        draw_at: daysFromNow(19),
        question: 'What is 2 + 2?',
        correct_answer: '4',
        free_entry_text: 'Postal entry route available. See the Free Entry page for details.',
        rules_text: 'Sample competition for testing only.'
      },
      {
        title: 'Luxury Night Away',
        description: 'A polished hotel/night-away sample competition for testing premium poster display.',
        ticket_price_pence: 199,
        max_tickets: 600,
        max_per_user: 20,
        status: 'active',
        image_url: '/demo-posters/luxury.svg',
        closes_at: daysFromNow(21),
        draw_at: daysFromNow(22),
        question: 'What town is Prizetown for?',
        correct_answer: 'Prizetown',
        free_entry_text: 'Postal entry route available. See the Free Entry page for details.',
        rules_text: 'Sample competition for testing only.'
      },
      {
        title: 'Family Fun Hamper',
        description: 'A bright family-prize sample competition for checking softer prize artwork and poster scrolling.',
        ticket_price_pence: 99,
        max_tickets: 300,
        max_per_user: 15,
        status: 'active',
        image_url: '/demo-posters/family.svg',
        closes_at: daysFromNow(10),
        draw_at: daysFromNow(11),
        question: 'What do you use to enter?',
        correct_answer: 'Ticket',
        free_entry_text: 'Postal entry route available. See the Free Entry page for details.',
        rules_text: 'Sample competition for testing only.'
      }
    ];

    let added = 0;
    for (const sample of samples) {
      const exists = competitions.some(c => String(c.title || '').toLowerCase() === sample.title.toLowerCase());
      if (exists) continue;
      const payload = {
        ...sample,
        slug: sample.slug || slugify(sample.title),
        answer: sample.answer || sample.correct_answer || 'Gold'
      };
      try {
        await api('/admin/competitions', { method: 'POST', body: JSON.stringify(payload) });
        added++;
      } catch (err) {
        setMessage(`Starter sample failed: ${sample.title}: ${err.message}`);
        return;
      }
    }
    setMessage(added ? `Added ${added} starter competition(s).` : 'Starter competitions already exist.');
    reload();
  }
  async function removeStarterCompetitions() {
    const demoMatches = competitions.filter(c => {
      const text = `${c.title || ''} ${c.slug || ''} ${c.description || ''}`.toLowerCase();
      return text.includes('starter') || text.includes('sample') || text.includes('demo') || text.includes('test') || text.includes('cash') || text.includes('iphone') || text.includes('ps5') || text.includes('holiday') || text.includes('tesla') || text.includes('tech bundle') || text.includes('luxury night') || text.includes('family fun');
    });
    if (demoMatches.length === 0) return setMessage('No obvious starter/sample competitions found.');
    if (!confirm(`Remove ${demoMatches.length} starter/sample competition(s)? This will not touch competitions that do not look like samples.`)) return;
    for (const c of demoMatches) {
      await api(`/admin/competitions/${c.id}`, { method: 'DELETE' });
    }
    setMessage(`Removed ${demoMatches.length} starter/sample competition(s).`);
    reload();
  }
  function downloadPostcodeTemplate() {
    const headers = ['code','label','type','active','estimated_population','estimated_households','launch_priority','notes'];
    const sampleRows = [
      ['BB','Blackburn postcode area','area','TRUE','', '', 'high','Fill population/household estimates from Nomis or ONS data'],
      ['BB1','BB1 launch outcode','outcode','TRUE','42000','17000','high','Example local starter zone'],
      ['PR7','PR7 outcode','outcode','TRUE','','','normal','Example future zone']
    ];
    const csv = [headers, ...sampleRows].map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join(String.fromCharCode(10));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prizetown-postcode-zones-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importPostcodeCsv(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    try {
      const result = await api('/admin/postcode-zones/import-csv', { method: 'POST', body });
      setMessage(`Postcode CSV imported: ${result.imported} saved, ${result.skipped} skipped.`);
      e.target.value = '';
      reload();
    } catch (err) {
      setMessage(err.message);
    }
  }

  function poundsToPence(value) {
    return Math.round(Number(value || 0) * 100);
  }
  function penceToPounds(value) {
    return (Number(value || 0) / 100).toFixed(2);
  }
  function money(value) {
    return `£${(Number(value || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function localProfitPlan(input) {
    const ticketPricePence = Number(input.ticket_price_pence || 0);
    const maxTickets = Number(input.max_tickets || 0);
    const prizeCostPence = Number(input.prize_cost_pence || 0);
    const marketingBudgetPence = Number(input.marketing_budget_pence || 0);
    const otherBufferPence = Number(input.other_buffer_pence || 0);
    const feePercent = Number(input.payment_fee_percent || 0);
    const maxRevenuePence = ticketPricePence * maxTickets;
    const paymentFeesPence = Math.round(maxRevenuePence * (feePercent / 100));
    const vatPence = input.vat_enabled ? Math.round(maxRevenuePence / 6) : 0;
    const estimatedProfitPence = maxRevenuePence - prizeCostPence - marketingBudgetPence - otherBufferPence - paymentFeesPence - vatPence;
    const profitMarginPercent = maxRevenuePence > 0 ? estimatedProfitPence / maxRevenuePence * 100 : 0;
    const prizePercent = maxRevenuePence > 0 ? prizeCostPence / maxRevenuePence * 100 : 0;
    let status = 'unknown';
    let warning = 'Add ticket price and max tickets to calculate profit.';
    if (maxRevenuePence > 0) {
      if (estimatedProfitPence < 0) { status = 'loss'; warning = 'Loss-making: costs are higher than maximum revenue.'; }
      else if (profitMarginPercent < 15) { status = 'risky'; warning = 'Risky: margin is below 15%.'; }
      else if (profitMarginPercent < 25) { status = 'caution'; warning = 'Caution: margin is below the built-in 25% target.'; }
      else { status = 'good'; warning = 'Good: estimated margin meets the 25% minimum target.'; }
    }
    return { target_margin_percent: 25, max_revenue_pence: maxRevenuePence, prize_percent: Number(prizePercent.toFixed(1)), payment_fees_pence: paymentFeesPence, vat_pence: vatPence, estimated_profit_pence: estimatedProfitPence, profit_margin_percent: Number(profitMarginPercent.toFixed(1)), target_profit_pence: Math.round(maxRevenuePence * .25), status, warning };
  }
  function updateProfitField(field, value) {
    const next = { ...profitForm, [field]: value };
    setProfitForm(next);
    setProfitPlan(localProfitPlan(next));
  }
  function loadCompetitionIntoPlanner(c) {
    const next = {
      ticket_price_pence: Number(c.ticket_price_pence || 0),
      max_tickets: Number(c.max_tickets || 0),
      prize_cost_pence: Number(c.prize_cost_pence || 0),
      marketing_budget_pence: Number(c.marketing_budget_pence || 0),
      other_buffer_pence: Number(c.other_buffer_pence || 0),
      payment_fee_percent: Number(c.payment_fee_percent || 4),
      vat_enabled: c.vat_enabled === true
    };
    setProfitForm(next);
    setProfitPlan(localProfitPlan(next));
    openAdminTab('profit-planner');
  }

  async function savePostcodeZone(e) {
    e.preventDefault();
    try {
      const saved = await api('/admin/postcode-zones', { method: 'POST', body: JSON.stringify(postcodeForm) });
      setMessage(`Postcode zone saved: ${saved.code}`);
      setPostcodeForm({ code: '', label: '', estimated_population: 0, estimated_households: 0, launch_priority: 'normal', notes: '', active: true });
      reload();
    } catch (err) {
      setMessage(err.message);
    }
  }
  async function togglePostcodeZone(zone) {
    const saved = await api(`/admin/postcode-zones/${zone.id}`, { method: 'PATCH', body: JSON.stringify({ ...zone, active: !zone.active }) });
    setMessage(`${saved.code} is now ${saved.active ? 'active' : 'inactive'}`);
    reload();
  }
  async function deletePostcodeZone(id) {
    if (!confirm('Delete this postcode zone?')) return;
    await api(`/admin/postcode-zones/${id}`, { method: 'DELETE' });
    setMessage('Postcode zone deleted.');
    reload();
  }
  function toggleAssignCompetition(id) {
    const current = assignForm.competition_ids || [];
    setAssignForm({ ...assignForm, competition_ids: current.includes(id) ? current.filter(v => v !== id) : [...current, id] });
  }
  function toggleAssignZone(id) {
    const current = assignForm.zone_ids || [];
    setAssignForm({ ...assignForm, zone_ids: current.includes(id) ? current.filter(v => v !== id) : [...current, id] });
  }
  async function saveBulkPostcodeAssignment(e) {
    e.preventDefault();
    try {
      const result = await api('/admin/competition-postcode-bulk', { method: 'POST', body: JSON.stringify(assignForm) });
      setMessage(`Postcode assignment updated for ${result.updated} competitions.`);
      setAssignForm({ competition_ids: [], mode: 'all', zone_ids: [] });
      reload();
    } catch (err) {
      setMessage(err.message);
    }
  }
  function assignmentLabel(competitionId) {
    const found = (postcodeAssignments || []).find(a => Number(a.competition_id) === Number(competitionId));
    if (!found || found.postcode_mode !== 'selected') return 'All postcodes';
    const zones = safeArray(found.zones);
    return zones.length ? zones.map(z => z.code).join(', ') : 'Selected zones not set';
  }
  async function loadDraw() {
    if (!drawCompetitionId) return setMessage('Choose a competition first.');
    const data = await api(`/admin/competitions/${drawCompetitionId}/draw-entries`);
    setDrawData(data); setDrawWinnerEntryId(''); setDrawNotes('');
    try { setDrawResults(await api('/admin/draw-results')); } catch {}
    setMessage(`Loaded ${data.entries.length} eligible draw entries.`);
  }
  function drawText() { return (drawData?.wheel_entries || []).join(String.fromCharCode(10)); }
  function downloadCustomersCsv() {
    if (filteredCustomerRows.length === 0) return setMessage('No customers to export.');
    const header = ['name','email','order_count','entry_count','free_entry_count','total_pence','last_activity'];
    const lines = filteredCustomerRows.map(c => [
      c.name || 'Customer',
      c.email || '',
      c.order_count || 0,
      c.entry_count || 0,
      c.free_entry_count || 0,
      c.total_pence || 0,
      c.last_activity || ''
    ].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prizetown-customers-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyDrawList() { await navigator.clipboard.writeText(drawText()); setMessage('Draw list copied. Paste it into built-in Prizetown draw wheel if needed.'); }

  function downloadDrawCsv() {
    if (!drawData) return setMessage('Load a draw list first.');
    const header = 'ticket_number,customer_name,customer_email,payment_status\n';
    const lines = drawData.entries.map(e => [e.ticket_number, e.customer_name, e.customer_email, e.payment_status].map(v => `"${String(v || '').replaceAll('"', '""')}"`).join(',')).join(String.fromCharCode(10));
    const blob = new Blob([header + lines], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${slugify(drawData.competition.title)}-draw-entries.csv`; a.click(); URL.revokeObjectURL(url);
  }
  async function recordDrawWinner(e) {
    e.preventDefault();
    if (!drawWinnerEntryId) return setMessage('Choose the winning ticket first.');
    const saved = await api('/admin/draw-results', { method: 'POST', body: JSON.stringify({ competition_id: drawCompetitionId, entry_id: drawWinnerEntryId, notes: drawNotes }) });
    setMessage(`Final draw winner recorded: ticket #${saved.draw_result.ticket_number}`);
    await reload(); await loadDraw();
  }

  const menuGroups = [
    {
      title: 'Core',
      items: [
        ['overview', 'Overview', ClipboardList],
        ['test-tools', 'Test tools', Sparkles],
        ['launch-checklist', 'Launch checklist', Shield],
        ['automation-status', 'Automation status', Shield],
        ['customers', 'Customers', User],
        ['competitions', 'Competitions', Trophy],
        ['competition-form', editing ? 'Edit competition' : 'Add competition', Plus]
      ]
    },
    {
      title: 'Sales',
      items: [
        ['orders-entries', 'Orders & entries', Ticket],
        ['payment-readiness', 'Payments / Readiness', Shield],
        ['free-entries', 'Free entries', Ticket]
      ]
    },
    {
      title: 'Draws',
      items: [
        moduleLiveDraw && ['draw-control', 'Draw Control Room', ListChecks],
        moduleLiveDraw && ['draw-proof', 'Draw Proof', ListChecks],
        moduleLiveDraw && ['stream-helper', 'Stream Helper', ListChecks],
        moduleLiveDraw && ['mobile-preview', 'Mobile Preview', ListChecks],
        moduleLiveDraw && ['draw-test-lab', 'Test Lab', ListChecks],
        moduleLiveDraw && ['draws', 'Final draw', ListChecks],
        moduleInstantWins && ['instant-wins', 'Instant wins', Zap]
      ].filter(Boolean)
    },
    {
      title: 'Growth',
      items: [
        modulePostcodes && ['postcode-zones', 'Postcode Zones', Shield],
        modulePostcodes && ['postcode-assign', 'Assign Postcodes', Ticket],
        moduleProfitPlanner && ['profit-planner', 'Profit Planner', Ticket]
      ].filter(Boolean)
    },
    {
      title: 'Site',
      items: [
        ['branding', 'Branding', Sparkles],
        ['modules', 'Modules', Shield],
        ['legal-text', 'Legal Text', Shield],
        ['settings', 'Site settings', Shield]
      ]
    },
    {
      title: 'Tools',
      items: [
        ['help-guide', 'Help guide', ListChecks],
        ['social-integrations', 'Social Integrations', ListChecks],
        ['system-check', 'System check', Shield],
        ['email-test', 'Email test', Shield],
        ['audit', 'Audit log', ListChecks]
      ]
    }
  ].filter(group => group.items.length > 0);

  return <main className="admin-main">
    <section className="admin-shell">
      <aside className="admin-menu panel">
        <h2>Admin</h2><p className="muted">Grouped controls keep the dashboard easier to manage.</p>
        <div className="admin-menu-groups">
          {menuGroups.map(group => <details className="admin-menu-group" key={group.title} open>
            <summary>{group.title}</summary>
            <div className="admin-tabs">
              {group.items.map(([key, label, Icon]) => <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => openAdminTab(key)}><Icon size={17} /> {label}</button>)}
            </div>
          </details>)}
        </div>
        
      </aside>

      <section className="admin-content">
        {activeTab === 'test-tools' && <div className="panel list-panel"><h1>Test tools</h1><p className="muted">Use these while building and testing Prizetown. Starter competitions use the built-in demo poster images and can be removed later.</p><div className="admin-split"><div className="panel"><h2>Sample competitions</h2><p className="muted">Adds Cash Blast, Tech Bundle, Luxury Night Away and Family Fun Hamper sample competitions.</p><button type="button" className="primary full" onClick={seedDemo}>Add starter sample competitions</button><button type="button" className="danger full" onClick={removeStarterCompetitions}>Remove starter sample competitions</button></div><div className="panel"><h2>What this tests</h2><p>Poster strip, competition detail pages, basket, checkout, ticket allocation and draw preview.</p><p className="muted">After adding samples, open the homepage and check the scrolling poster strip.</p></div></div></div>}

        {activeTab === 'overview' && <section className="panel launch-warning-card">
          <div>
            <p className="eyebrow">Launch readiness</p>
            <h1>Prototype mode: do final checks before real payments</h1>
            <p className="muted">Prizetown is looking strong for testing, but before a public real-money launch you still need payment hardening, security hardening, legal checks and production secrets changed.</p>
          </div>
          <div className="launch-warning-grid">
            <span>Change admin password</span>
            <span>Set strong JWT secret</span>
            <span>Verify payment webhooks</span>
            <span>Legal wording checked</span>
          </div>
        </section>}

        {activeTab === 'overview' && <div className="panel"><h1>Dashboard overview</h1><div className="stat-grid"><div><strong>{competitions.length}</strong><span>Total competitions</span></div><div><strong>{liveCount}</strong><span>Live competitions</span></div><div><strong>{totalTickets}</strong><span>Tickets allocated</span></div><div><strong>{money(revenue)}</strong><span>Test order value</span></div><div><strong>{instantClaimed}/{instantWins.length}</strong><span>Instant wins claimed</span></div></div><div className="admin-split"><div><h2>Recent orders</h2>{orders.slice(0, 8).map(o => <div className="list-row entry-row" key={o.id}><div><strong>Order #{o.id}</strong><p>{o.customer_email}  -  {money(o.total_pence)}  -  {o.entry_count} entries  -  {o.status}</p></div></div>)}</div><div><h2>Recent entries</h2>{entries.slice(0, 8).map(e => <div className="list-row entry-row" key={e.id}><div><strong>{e.competition_title}</strong><p>{e.customer_email}  -  ticket #{e.ticket_number}  -  {e.payment_status}</p></div></div>)}</div></div></div>}

        {activeTab === 'competitions' && <div className="panel list-panel"><div className="row"><h1>Competitions</h1><button className="primary" onClick={() => { setEditing(null); setForm(empty); openAdminTab('competition-form'); }}><Plus size={16} /> Add competition</button></div>{competitions.length === 0 && <p className="muted">No competitions yet. Use Add starter competitions or add your first competition.</p>}{competitions.map(c => <div className="list-row competition-admin-row" key={c.id}><div><strong>{c.title}</strong><p>{c.status}  -  {c.entries_sold || 0}/{c.max_tickets} tickets  -  postcode: {assignmentLabel(c.id)}  -  instant {c.instant_win_claimed || 0}/{c.instant_win_total || 0}  -  closes {fmtDate(c.closes_at)}</p></div><button onClick={() => edit(c)}><Pencil size={16} /> Edit</button><button className="danger" onClick={() => remove(c.id)}><Trash2 size={16} /> Delete</button></div>)}</div>}

        {activeTab === 'competition-form' && <form className="panel" onSubmit={save}><div className="row"><h1>{editing ? 'Edit competition' : 'Add competition'}</h1>{editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setForm(empty); }}>Cancel edit</button>}</div><label>Title<input value={form.title} onChange={e => updateField('title', e.target.value)} required /></label><label>Slug<input value={form.slug} onChange={e => updateField('slug', e.target.value)} required /></label><label>Description<textarea value={form.description} onChange={e => updateField('description', e.target.value)} /></label><div className="two"><label>Price pence<input type="number" value={form.ticket_price_pence} onChange={e => updateField('ticket_price_pence', Number(e.target.value))} /></label><label>Max tickets<input type="number" value={form.max_tickets} onChange={e => updateField('max_tickets', Number(e.target.value))} /></label></div><div className="two"><label>Max per user<input type="number" value={form.max_per_user} onChange={e => updateField('max_per_user', Number(e.target.value))} /></label><label>Status<select value={form.status} onChange={e => updateField('status', e.target.value)}><option>draft</option><option>active</option><option>closed</option></select></label></div><label>Postcode availability<select value={form.postcode_mode || 'all'} onChange={e => updateField('postcode_mode', e.target.value)}><option value="all">All postcodes</option><option value="selected">Selected postcode zones</option></select><small className="muted">Use Assign Postcodes for selecting the exact zones.</small></label>
            <div className="planner-inline">
              <h2>Profit planner inputs</h2>
              <p className="muted">These figures feed the 25% margin planner and warnings.</p>
              <div className="three">
                <label>Prize cost £<input type="number" step="0.01" value={penceToPounds(form.prize_cost_pence || 0)} onChange={e => updateField('prize_cost_pence', poundsToPence(e.target.value))} /></label>
                <label>Marketing £<input type="number" step="0.01" value={penceToPounds(form.marketing_budget_pence || 0)} onChange={e => updateField('marketing_budget_pence', poundsToPence(e.target.value))} /></label>
                <label>Other buffer £<input type="number" step="0.01" value={penceToPounds(form.other_buffer_pence || 0)} onChange={e => updateField('other_buffer_pence', poundsToPence(e.target.value))} /></label>
              </div>
              <div className="two">
                <label>Payment fee %<input type="number" step="0.1" value={form.payment_fee_percent || 4} onChange={e => updateField('payment_fee_percent', Number(e.target.value))} /></label>
                <label className="check-row"><input type="checkbox" checked={form.vat_enabled === true} onChange={e => updateField('vat_enabled', e.target.checked)} /> Include VAT estimate</label>
              </div>
            </div><div className="two"><label>Closing date<input type="datetime-local" value={form.closes_at || ''} onChange={e => updateField('closes_at', e.target.value)} /></label><label>Draw date<input type="datetime-local" value={form.draw_at || ''} onChange={e => updateField('draw_at', e.target.value)} /><small className="muted">Used for scheduled final draws.</small></label></div><label className="check-row important-check"><input type="checkbox" checked={form.auto_draw_enabled === true} onChange={e => updateField('auto_draw_enabled', e.target.checked)} /> <span>Auto-run final draw at scheduled draw date/time once sold out or closed</span></label><div className="two"><label>Minimum age<input type="number" value={form.min_age || 18} onChange={e => updateField('min_age', Number(e.target.value))} /></label><label className="check-row"><input type="checkbox" checked={form.age_restricted !== false} onChange={e => updateField('age_restricted', e.target.checked)} /> <span>Age restricted</span></label></div><label>Question<input value={form.question} onChange={e => updateField('question', e.target.value)} placeholder="Example: What colour is the sky?" /></label><label>Correct answer<input value={form.answer} onChange={e => updateField('answer', e.target.value)} /></label><label>Free entry route<textarea value={form.free_entry_text} onChange={e => updateField('free_entry_text', e.target.value)} /></label><label>Competition rules<textarea value={form.rules_text || ''} onChange={e => updateField('rules_text', e.target.value)} /></label><label>Prize image<input type="file" accept="image/*" onChange={uploadFile} /></label>{form.image_url && <img className="preview" src={imageUrl(form.image_url)} alt="Preview" />}<button className="primary full"><Plus size={16} /> {editing ? 'Save changes' : 'Add competition'}</button></form>}

        {activeTab === 'customers' && <div className="panel list-panel"><div className="row"><h1>Customers</h1><span className="muted">{filteredCustomerRows.length}/{customerRows.length} stored customer(s)</span><button type="button" className="secondary" onClick={downloadCustomersCsv}>Export CSV</button></div><label>Search customers<input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Search name or email" /></label>{customerRows.length === 0 && <p className="muted">No customers yet. Customers appear here after orders, entries or free/manual entries.</p>}{customerRows.length > 0 && filteredCustomerRows.length === 0 && <p className="muted">No customers match that search.</p>}{filteredCustomerRows.map(c => <div className="list-row entry-row" key={c.email}><div><strong>{c.name || 'Customer'}</strong><p>{c.email}  -  orders: {c.order_count}  -  entries: {c.entry_count}  -  free/manual: {c.free_entry_count}  -  total: {money(c.total_pence || 0)}  -  last: {c.last_activity ? new Date(c.last_activity).toLocaleString() : 'n/a'}</p></div></div>)}</div>}

        {activeTab === 'orders-entries' && <div className="admin-split">
          <div className="panel list-panel">
            <h1>Recent orders</h1>
            {orders.length === 0 && <p className="muted">No orders yet.</p>}
            {orders.slice(0, 60).map(o => <div className="list-row entry-row" key={o.id}><div><strong>Order #{o.id}</strong><p>{o.customer_email}  -  {money(o.total_pence)}  -  {o.entry_count} entries  -  {o.status}</p></div></div>)}
          </div>
          <div className="panel list-panel">
            <h1>Recent entries</h1>
            {entries.length === 0 && <p className="muted">No entries yet.</p>}
            {entries.slice(0, 60).map(e => <div className="list-row entry-row" key={e.id}><div><strong>{e.competition_title}</strong><p>{e.customer_email}  -  ticket #{e.ticket_number}  -  {e.payment_status}</p></div></div>)}
          </div>
        </div>}

        {activeTab === 'instant-wins' && <div className="admin-split"><form className="panel" onSubmit={saveInstantWin}><h1>Add instant win prize</h1><label>Competition<select value={iwForm.competition_id} onChange={e => setIwForm({ ...iwForm, competition_id: e.target.value })} required><option value="">Choose competition</option>{competitions.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><div className="two"><label>Prize title<input value={iwForm.prize_title} onChange={e => setIwForm({ ...iwForm, prize_title: e.target.value })} placeholder="£100 Instant Win" required /></label><label>Prize value pence<input type="number" value={iwForm.prize_value_pence} onChange={e => setIwForm({ ...iwForm, prize_value_pence: Number(e.target.value) })} /></label></div><label>Winning ticket number<input type="number" value={iwForm.winning_ticket_number} onChange={e => setIwForm({ ...iwForm, winning_ticket_number: e.target.value })} required /></label><button className="primary full"><Zap size={16} /> Add instant win</button></form><div className="panel list-panel"><h1>Instant wins</h1>{instantWins.length === 0 && <p className="muted">No instant wins added yet.</p>}{instantWins.map(w => <div className="list-row entry-row" key={w.id}><div><strong>{w.prize_title}</strong><p>{w.competition_title}  -  ticket #{w.winning_ticket_number}  -  {w.status}</p></div>{w.status !== 'claimed' && <button className="danger" onClick={() => deleteInstant(w.id)}><Trash2 size={16} /></button>}</div>)}</div></div>}

        {activeTab === 'draw-control' && <DrawControlRoom competitions={competitions} setPage={setPage} setMessage={setMessage} reload={reload} />}
        {activeTab === 'draw-proof' && <DrawProofPanel drawResults={drawResults} setMessage={setMessage} />}
        {activeTab === 'stream-helper' && <StreamHelperPanel settingsForm={settingsForm} setSettingsForm={setSettingsForm} saveSettings={saveSettings} setMessage={setMessage} />}

        {activeTab === 'draw-test-lab' && <DrawTestLab setMessage={setMessage} />}

        {activeTab === 'draws' && <div className="final-draw-only">
          <div className="panel auto-draw-note">
            <h1>Scheduled Auto Draws</h1><p className="muted"><strong>This is separate from quick test spins.</strong> Test ticket loads below do not trigger scheduled or official draw records.</p>
            <p className="muted">For each competition, set a draw date/time and enable auto draw in Add/Edit Competition. When the competition is sold out or closed and the draw time arrives, Prizetown safely records the winner once and updates the OBS broadcast screen.</p>
            <button type="button" className="secondary" onClick={async () => { const r = await api('/admin/draw/run-due-auto', { method: 'POST' }); setMessage(`Auto draw check complete: ${safeArray(r.completed).length} completed.`); reload(); }}>Run due auto draws now</button>
          </div>
          <BuiltInDrawWheel competitions={competitions} setMessage={setMessage} settings={settingsForm} />
          <BroadcastMenuPanel setPage={setPage} settings={settingsForm} />
        </div>}

        {activeTab === 'branding' && <BrandingPanel settingsForm={settingsForm} setSettingsForm={setSettingsForm} saveSettings={saveSettings} setMessage={setMessage} />}

        {activeTab === 'modules' && <ModulesPanel settingsForm={settingsForm} setSettingsForm={setSettingsForm} saveSettings={saveSettings} />}

        {activeTab === 'launch-checklist' && <div className="panel list-panel"><h1>Launch checklist</h1><p className="muted">Use this before sending real customers to the site.</p>{[
          ['Active competitions', competitions.filter(c => c.status === 'active').length > 0, 'At least one competition should be active.'],
          ['Competition draw dates', competitions.filter(c => c.status === 'active').every(c => !!c.draw_at), 'Every active competition should have a draw date.'],
          ['Free entry wording', competitions.filter(c => c.status === 'active').every(c => !!(c.free_entry_text || '').trim()), 'Every active competition should explain the free-entry route.'],
          ['Competition rules', competitions.filter(c => c.status === 'active').every(c => !!(c.rules_text || '').trim()), 'Every active competition should have visible rules.'],
          ['Support email', !!(settingsForm.support_email || '').trim(), 'Set a customer support email.'],
          ['Global legal/free entry text', !!(settingsForm.terms_text || '').trim() && !!(settingsForm.free_entry_global || '').trim(), 'Legal pages and global free-entry text should be filled in.'],
          ['Payment readiness', false, 'Before real payments, connect a provider safely, verify webhooks, handle pending/paid/failed/refunded/chargeback statuses and only allocate paid tickets after confirmed payment.'],
          ['Postal entry address', !!(settingsForm.postal_entry_address || '').trim() && !(settingsForm.postal_entry_address || '').includes('Add postal entry address'), 'Add a real postal entry address before launch.'],
          ['Branding', !!(settingsForm.site_name || '').trim() && !!(settingsForm.hero_title || '').trim(), 'Check site name, homepage title, logo and colours.'],
          ['Homepage content', !!(settingsForm.hero_title || '').trim() && !!(settingsForm.hero_text || '').trim(), 'Homepage title and intro text should be filled in before launch.'],
          ['Top scrolling ticker', !!(settingsForm.welcome_marquee_text || '').trim(), 'Set the editable top ticker text in Site settings.'],
          ['Launch readiness warning', true, 'Admin Overview shows the prototype/payment/security/legal reminder.'],
          ['Postcode module checked', true, modulePostcodes ? 'Postcode competitions are enabled.' : 'Postcode module is off; site behaves more like a national competition site.'],
          ['Instant wins checked', true, moduleInstantWins ? 'Instant wins are enabled.' : 'Instant wins are off.'],
          ['Live draw checked', true, moduleLiveDraw ? 'Live draw / OBS is enabled.' : 'Live draw / OBS is off.']
        ].map(([title, ok, help]) => <div className="list-row entry-row" key={title}><div><strong>{ok ? '✅' : '⚠️'} {title}</strong><p>{help}</p></div></div>)}</div>}

        {activeTab === 'automation-status' && <div className="panel list-panel"><h1>Automation status</h1><p className="muted">Display-only for now. This shows what Prizetown can already handle automatically and what still needs admin setup.</p>{[
          ['Active competitions', competitions.filter(c => c.status === 'active').length > 0, competitions.filter(c => c.status === 'active').length + ' active competition(s).'],
          ['Missing draw dates', competitions.filter(c => c.status === 'active' && !c.draw_at).length === 0, competitions.filter(c => c.status === 'active' && !c.draw_at).length + ' active competition(s) missing draw dates.'],
          ['Auto draw enabled', competitions.filter(c => c.auto_draw_enabled === true).length > 0, competitions.filter(c => c.auto_draw_enabled === true).length + ' competition(s) have auto draw enabled.'],
          ['Closed competitions ready for draw', competitions.filter(c => c.status === 'closed' && !c.winner_entry_id).length === 0, competitions.filter(c => c.status === 'closed' && !c.winner_entry_id).length + ' closed competition(s) may need a final draw.'],
          ['Free-entry setup', competitions.filter(c => c.status === 'active').every(c => !!(c.free_entry_text || '').trim()), 'Active competitions should include free-entry wording.'],
          ['Rules setup', competitions.filter(c => c.status === 'active').every(c => !!(c.rules_text || '').trim()), 'Active competitions should include rules text.'],
          ['Email automation', true, 'Order, free-entry and test transactional emails are available when Resend is configured.'],
          ['Payment provider safety', false, 'Live payment provider/webhook confirmation is not connected yet. Current online checkout should be treated as paid_test until payment hardening is complete.'],
          ['Winner publishing', true, 'Winner records and public winner pages are available after final draws.']
        ].map(([title, ok, help]) => <div className="list-row entry-row" key={title}><div><strong>{ok ? '✅' : '⚠️'} {title}</strong><p>{help}</p></div></div>)}</div>}

        {activeTab === 'payment-readiness' && <PaymentReadinessPanel orders={orders} />}

        {activeTab === 'help-guide' && <div className="panel list-panel help-guide-panel">
          <h1>Admin Help Guide</h1>
          <p className="muted">Simple notes for anyone helping manage Prizetown. Update this guide whenever a new admin feature is added or changed.</p>

          {[
            ['Admin Quick Start', 'Recommended order: check Overview, open Launch checklist, review Competitions, check Orders & entries, confirm Legal Text and Site settings, then use System check before launch.'],
            ['Common Admin Jobs', 'Create a competition: Competitions → Add competition. Check sales: Orders & entries. Add postal/free entries: Free entries. Change homepage text: Site settings. Change logo/colours: Branding. Check launch safety: Launch checklist and System check.'],
            ['Common Troubleshooting', 'Text not changing: save in Site settings, then refresh the homepage. Email issue: use Email test. Draw issue: check Final draw and Automation status. Admin access issue: use the Tailscale admin URL, not public /admin.'],
            ['Launch Checks', 'Before sending real customers to the site, check Launch checklist, System check, Legal Text, payment setup, email setup, competition rules, free-entry wording, draw dates and branding.'],
            ['Competition Setup', 'Use Competitions to view existing competitions. Use Add competition or Edit competition to set title, image, price, ticket limits, question, answer, rules, free-entry wording, draw date, status and postcode mode.'],
            ['Orders & Entries', 'Use Orders & entries to check customer purchases, ticket numbers and draw eligibility. This is the main place to investigate customer order questions.'],
            ['Free Entries', 'Use Free entries to manually add valid postal/free-entry requests. Free entries should be handled fairly and treated like paid entries for draw eligibility.'],
            ['Draws / OBS', 'Use Draw Control Room before going live on OBS/YouTube. Use Stream Helper to save YouTube links and copy OBS setup notes. Use Draw Proof after a draw to review the saved winner record and copy a public result summary.'],
            ['Draw Intro & Sounds', 'Use Final draw to upload intro, spin and winner sounds. The intro screen identifies the competition, postcode zone and draw mode before the spinner starts, which helps when running several automatic draws one after another.'],
            ['Draw Test Lab', 'Use Draws > Test Lab to generate fake sample tickets and run a safe test intro, spin and winner reveal on the broadcast screen. It can also queue multiple same-day fake competitions to test OBS, sounds and back-to-back draw performance. It does not create real orders, entries or winners.'],
            ['Trusted Draw Time', 'The live draw broadcast uses Prizetown server time in the Europe/London timezone, not the viewer device clock. The footer shows the time source and sync age so viewers can see the clock is server-backed.'],
            ['Public Winner Proof', 'The public Winners page shows final draw proof details including winning ticket number, eligible entry count, draw method, recorded time and trusted server-time source where available.'],
            ['Public Trust Pages', 'The public About and Fair draws pages explain who Prizetown is for, how entries work, how free entry is handled, how server-backed draw time helps trust, and where winner proof can be checked.'],
            ['Payments / Readiness', 'Use the Payments readiness panel before connecting real payments. Live launch should wait until provider webhooks, idempotency, paid/failed/refunded/chargeback states and ticket allocation-after-confirmed-payment are properly tested.'],
            ['Instant Wins', 'Use Instant wins to manage instant-win prizes and winning ticket numbers. Check instant-win setup before making a competition active.'],
            ['Customers', 'Use Customers for read-only customer lookup, search and CSV export. Useful for support checks and customer history.'],
            ['Postcode Tools', 'Use Postcode Zones to create local areas, then Assign Postcodes to link competitions to selected zones. If postcode mode is off, competitions behave more like national competitions.'],
            ['Profit Planner', 'Use Profit Planner to estimate ticket revenue, prize cost, fees, marketing budget, VAT impact and likely margin before launching a competition.'],
            ['Branding', 'Use Branding to change logo, favicon, colours, site name and homepage visual style. Save branding after applying presets or uploads.'],
            ['Modules', 'Use Modules to switch major features on/off, including postcode competitions, instant wins, live draw/OBS, Arnold, demo wheel, profit planner and legal popups.'],
            ['Legal Text', 'Use Legal Text to edit terms, privacy notice, free-entry route, refunds, cookies, responsible play and popup wording. This is starter text only and should be checked before real-money launch.'],
            ['Site Settings', 'Use Site settings for homepage title, intro text, support email, footer text and the top scrolling ticker. Separate ticker messages with a vertical bar: |'],
            ['Social Integrations', 'Use Social Integrations to add Facebook, Instagram, TikTok, X/Twitter and YouTube profile links. Filled-in links appear as buttons in the public website footer.'],
            ['System Check', 'Use System check to spot common setup problems. It is a helper, not a replacement for manual legal, payment and security checks.'],
            ['Email Test', 'Use Email test to confirm Resend transactional emails are configured and working. If emails fail, check the Resend API key and sender domain setup.'],
            ['Audit Log', 'Use Audit log to review important admin/system actions. Useful for checking what changed and when.'],
            ['Security Reminder', 'Before real payments, change default admin credentials, use a strong JWT secret, protect admin access, verify payment webhooks, keep database backups and test restore.'],
            ['Demo Posters', 'Starter/demo competitions use SVG poster artwork from web/public/demo-posters. Replace those files or edit competition image URLs when changing sample prize types.'],
            ['Image URLs', 'Built-in site assets such as demo posters, logo, favicon and Arnold images load from the public web app. Uploaded files use the API uploads path.'],
            ['Spinner Style', 'Use Final Draw > Spinner style to switch between Classic and Ticket squares. Classic is the current spinner and is kept so you can revert instantly.'],
            ['Mobile Preview', 'Use Draws > Mobile Preview to test the live draw page inside phone-sized frames before changing public mobile draw CSS. Check spinner visibility, Arnold overlap, text wrapping and sideways scrolling.'],
            ['Important Rule', 'Whenever a new admin feature is added or changed, add a short plain-English note here so future admins understand what it is for.']
          ].map(([title, text]) => <div className="list-row entry-row" key={title}><div><strong>{title}</strong><p>{text}</p></div></div>)}
        </div>}

        {activeTab === 'system-check' && <SystemCheckPanel setMessage={setMessage} />}

        {activeTab === 'mobile-preview' && <MobilePreviewPanel />}

        {activeTab === 'social-integrations' && <SocialIntegrationsPanel settingsForm={settingsForm} setSettingsForm={setSettingsForm} saveSettings={saveSettings} />}

        {activeTab === 'email-test' && <div className="panel settings-panel">
          <h1>Email Status / Test</h1>
          <p className="muted">Send a test transactional email through Resend using the configured no-reply sender.</p>
          <div className="admin-split">
            <form className="panel" onSubmit={sendAdminTestEmail}>
              <h2>Send test email</h2>
              <label>Recipient email<input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} required /></label>
              <button className="primary full" disabled={emailSending}>{emailSending ? 'Sending...' : 'Send test email'}</button>
              <button type="button" className="secondary full" onClick={loadEmailStatus}>Refresh email status</button>
            </form>
            <div className="panel list-panel">
              <h2>Status</h2>
              {!emailStatus && <p className="muted">Click Refresh email status to load the current email configuration.</p>}
              {emailStatus && <div>
                <p><strong>Configured:</strong> {emailStatus.configured ? 'Yes' : 'No'}</p>
                <p><strong>Provider:</strong> {emailStatus.provider}</p>
                <p><strong>From:</strong> {emailStatus.from}</p>
                <p><strong>Reply-to:</strong> {emailStatus.reply_to}</p>
                <h3>Recent email log</h3>
                {(emailStatus.recent || []).length === 0 && <p className="muted">No email log entries yet.</p>}
                {(emailStatus.recent || []).slice(0, 10).map(log => <div className="list-row entry-row" key={log.id}><div><strong>{log.event}  -  {log.status}</strong><p>{log.recipient}  -  {log.subject}  -  {log.error || 'No error'}</p></div></div>)}
              </div>}
            </div>
          </div>
        </div>}

        {activeTab === 'free-entries' && <div className="admin-split"><form className="panel" onSubmit={saveFreeEntry}><h1>Record postal/free entry</h1><p className="muted">Use this only for valid postal entries received by post. One entry per postcard/envelope. No bulk or hand-delivered entries. The competition must be active and the postal entry must be received before the close date.</p><label>Competition<select value={freeForm.competition_id} onChange={e => setFreeForm({ ...freeForm, competition_id: e.target.value })} required><option value="">Choose active competition</option>{competitions.filter(c => c.status === 'active').map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>{competitions.filter(c => c.status === 'active').length === 0 && <p className="basket-notice">No active competitions found. Go to Competitions, edit one, and set Status to active.</p>}<div className="two"><label>Customer name<input value={freeForm.customer_name} onChange={e => setFreeForm({ ...freeForm, customer_name: e.target.value })} required /></label><label>Customer email<input type="email" value={freeForm.customer_email} onChange={e => setFreeForm({ ...freeForm, customer_email: e.target.value })} required /></label></div><label>Postal reference<input value={freeForm.postal_reference} onChange={e => setFreeForm({ ...freeForm, postal_reference: e.target.value })} placeholder="Example: envelope date, initials, postcode, or internal ref" /></label><label>Notes<textarea value={freeForm.notes} onChange={e => setFreeForm({ ...freeForm, notes: e.target.value })} /></label><button className="primary full" disabled={!freeForm.competition_id || !freeForm.customer_name || !freeForm.customer_email}>Record free entry</button></form><div className="panel list-panel"><h1>Recent entries</h1>{entries.slice(0, 20).map(e => <div className="list-row entry-row" key={e.id}><div><strong>{e.competition_title}</strong><p>{e.customer_email}  -  ticket #{e.ticket_number}  -  {e.payment_status}</p></div></div>)}</div></div>}


        {activeTab === 'postcode-zones' && <div className="admin-split postcode-admin">
          <form className="panel" onSubmit={savePostcodeZone}>
            <h1>Postcode Zones</h1>
            <p className="muted">Add areas like <strong>BB</strong> or outcodes like <strong>BB1</strong>. Later, competitions can be assigned to all zones or selected zones.</p>
            <div className="postcode-import-box">
              <h2>CSV import</h2>
              <p className="muted">Upload columns: code, label, type, active, estimated_population, estimated_households, launch_priority, notes.</p>
              <div className="row">
                <label className="file-button">Import CSV<input type="file" accept=".csv,text/csv" onChange={importPostcodeCsv} /></label>
                <button type="button" className="secondary" onClick={downloadPostcodeTemplate}>Download template</button>
              </div>
            </div>
            <label>Area or outcode<input value={postcodeForm.code} onChange={e => setPostcodeForm({ ...postcodeForm, code: e.target.value.toUpperCase() })} placeholder="BB or BB1" required /></label>
            <label>Display label<input value={postcodeForm.label} onChange={e => setPostcodeForm({ ...postcodeForm, label: e.target.value })} placeholder="Blackburn area" /></label>
            <div className="two">
              <label>Estimated population<input type="number" value={postcodeForm.estimated_population || 0} onChange={e => setPostcodeForm({ ...postcodeForm, estimated_population: Number(e.target.value) })} /></label>
              <label>Estimated households<input type="number" value={postcodeForm.estimated_households || 0} onChange={e => setPostcodeForm({ ...postcodeForm, estimated_households: Number(e.target.value) })} /></label>
            </div>
            <label>Launch priority<select value={postcodeForm.launch_priority || 'normal'} onChange={e => setPostcodeForm({ ...postcodeForm, launch_priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
            <label>Notes<textarea value={postcodeForm.notes} onChange={e => setPostcodeForm({ ...postcodeForm, notes: e.target.value })} placeholder="Starter local draw area, launch area, etc." /></label>
            <label className="check-row"><input type="checkbox" checked={postcodeForm.active !== false} onChange={e => setPostcodeForm({ ...postcodeForm, active: e.target.checked })} /> <span>Active zone</span></label>
            <button className="primary full">Save postcode zone</button>
          </form>
          <div className="panel list-panel">
            <h1>Listed zones</h1>
            {postcodeZones.length === 0 && <p className="muted">No postcode zones yet. Add your first postcode area or outcode.</p>}
            {postcodeZones.map(z => <div className="list-row postcode-zone-row rich-zone-row" key={z.id}>
              <div>
                <strong>{z.code}</strong>
                <p>{z.label || (z.type === 'area' ? 'Postcode area' : 'Postcode outcode')}  -  {z.type}  -  {z.active ? 'active' : 'inactive'}  -  priority {z.launch_priority || 'normal'}</p>
                <div className="zone-metrics">
                  <span>Population: {Number(z.estimated_population || 0).toLocaleString()}</span>
                  <span>Households: {Number(z.estimated_households || 0).toLocaleString()}</span>
                  <span className={`zone-band ${z.recommendation?.band || 'unknown'}`}>{z.recommendation?.band || 'unknown'}</span>
                </div>
                <div className="zone-recommendation">
                  <b>Suggested:</b> {z.recommendation?.suggested_prize || 'Add population data'}  -  max tickets {z.recommendation?.suggested_max_tickets || 100}
                  <small>{z.recommendation?.guidance || ''}</small>
                </div>
                {z.notes && <p className="muted">{z.notes}</p>}
              </div>
              <button type="button" onClick={() => togglePostcodeZone(z)}>{z.active ? 'Deactivate' : 'Activate'}</button>
              <button type="button" className="danger" onClick={() => deletePostcodeZone(z.id)}><Trash2 size={16} /></button>
            </div>)}
          </div>
        </div>}


        {activeTab === 'postcode-assign' && <div className="admin-split postcode-assign-admin">
          <form className="panel" onSubmit={saveBulkPostcodeAssignment}>
            <h1>Assign competitions to postcodes</h1>
            <p className="muted">Choose one or more competitions, then make them available to all postcodes or selected postcode zones.</p>

            <h2>1. Choose competitions</h2>
            <div className="checkbox-stack">
              {competitions.map(c => <label className="check-row" key={c.id}>
                <input type="checkbox" checked={(assignForm.competition_ids || []).includes(c.id)} onChange={() => toggleAssignCompetition(c.id)} />
                <span>{c.title} <em>({c.status})</em></span>
              </label>)}
            </div>

            <h2>2. Choose coverage</h2>
            <label>Availability<select value={assignForm.mode} onChange={e => setAssignForm({ ...assignForm, mode: e.target.value })}><option value="all">All postcodes</option><option value="selected">Selected postcode zones only</option></select></label>

            {assignForm.mode === 'selected' && <div className="postcode-zone-picker">
              <h2>3. Select zones</h2>
              {postcodeZones.filter(z => z.active).length === 0 && <p className="muted">No active postcode zones yet. Add zones in Postcode Zones first.</p>}
              {postcodeZones.filter(z => z.active).map(z => <label className="check-row" key={z.id}>
                <input type="checkbox" checked={(assignForm.zone_ids || []).includes(z.id)} onChange={() => toggleAssignZone(z.id)} />
                <span><strong>{z.code}</strong> {z.label ? `— ${z.label}` : ''} <em>({z.type})</em></span>
              </label>)}
            </div>}

            <button className="primary full">Apply postcode assignment</button>
          </form>

          <div className="panel list-panel">
            <h1>Current coverage</h1>
            {competitions.map(c => <div className="list-row postcode-assignment-row" key={c.id}>
              <div><strong>{c.title}</strong><p>{assignmentLabel(c.id)}</p></div>
              <button type="button" onClick={() => setAssignForm({ competition_ids: [c.id], mode: 'all', zone_ids: [] })}>Set all</button>
              <button type="button" onClick={() => setAssignForm({ competition_ids: [c.id], mode: 'selected', zone_ids: safeArray((postcodeAssignments || []).find(a => Number(a.competition_id) === Number(c.id))?.zones).map(z => z.id) })}>Edit zones</button>
            </div>)}
          </div>
        </div>}


        {activeTab === 'profit-planner' && <div className="admin-split profit-planner-admin">
          <form className="panel" onSubmit={e => { e.preventDefault(); setProfitPlan(localProfitPlan(profitForm)); }}>
            <h1>Competition Profit Planner</h1>
            <p className="muted">Built-in target: at least <strong>25% estimated profit margin</strong> after prize, payment fees, marketing, buffer and optional VAT.</p>

            <div className="two">
              <label>Ticket price £<input type="number" step="0.01" value={penceToPounds(profitForm.ticket_price_pence)} onChange={e => updateProfitField('ticket_price_pence', poundsToPence(e.target.value))} /></label>
              <label>Max tickets<input type="number" value={profitForm.max_tickets} onChange={e => updateProfitField('max_tickets', Number(e.target.value))} /></label>
            </div>
            <div className="three">
              <label>Prize cost £<input type="number" step="0.01" value={penceToPounds(profitForm.prize_cost_pence)} onChange={e => updateProfitField('prize_cost_pence', poundsToPence(e.target.value))} /></label>
              <label>Marketing budget £<input type="number" step="0.01" value={penceToPounds(profitForm.marketing_budget_pence)} onChange={e => updateProfitField('marketing_budget_pence', poundsToPence(e.target.value))} /></label>
              <label>Other buffer £<input type="number" step="0.01" value={penceToPounds(profitForm.other_buffer_pence)} onChange={e => updateProfitField('other_buffer_pence', poundsToPence(e.target.value))} /></label>
            </div>
            <div className="two">
              <label>Payment fee %<input type="number" step="0.1" value={profitForm.payment_fee_percent} onChange={e => updateProfitField('payment_fee_percent', Number(e.target.value))} /></label>
              <label className="check-row"><input type="checkbox" checked={profitForm.vat_enabled === true} onChange={e => updateProfitField('vat_enabled', e.target.checked)} /> Include VAT estimate</label>
            </div>
            <button className="primary full">Calculate margin</button>
          </form>

          <div className="panel profit-result-panel">
            <h1>Result</h1>
            {(() => {
              const plan = profitPlan || localProfitPlan(profitForm);
              return <div className={`profit-result ${plan.status}`}>
                <div className="profit-status">{plan.status.toUpperCase()}</div>
                <p>{plan.warning}</p>
                <div className="profit-grid">
                  <span>Max revenue <strong>{money(plan.max_revenue_pence)}</strong></span>
                  <span>Target profit 25% <strong>{money(plan.target_profit_pence)}</strong></span>
                  <span>Prize % <strong>{plan.prize_percent}%</strong></span>
                  <span>Payment fees <strong>{money(plan.payment_fees_pence)}</strong></span>
                  <span>VAT estimate <strong>{money(plan.vat_pence)}</strong></span>
                  <span>Estimated profit <strong>{money(plan.estimated_profit_pence)}</strong></span>
                  <span>Profit margin <strong>{plan.profit_margin_percent}%</strong></span>
                </div>
                <p className="muted">Suggested rule: keep profit margin at 25%+ before launching. Use caution below 25%, and avoid loss-making competitions.</p>
              </div>;
            })()}

            <h2>Load existing competition</h2>
            <div className="mini-list">
              {competitions.map(c => <button type="button" key={c.id} onClick={() => loadCompetitionIntoPlanner(c)}>{c.title}</button>)}
            </div>
          </div>
        </div>}
        {activeTab === 'legal-text' && <form className="panel settings-panel legal-editor" onSubmit={saveSettings}>
          <h1>Legal Text</h1>
          <p className="muted">Edit the customer-facing legal pages. This is starter wording only — have it checked by a UK solicitor/accountant before taking large volumes of paid entries.</p>
          <div className="two">
            <label>Support email<input type="email" value={settingsForm.support_email || ''} onChange={e => setSettingsForm({ ...settingsForm, support_email: e.target.value })} /></label>
            <label>Postal entry address<input value={settingsForm.postal_entry_address || ''} onChange={e => setSettingsForm({ ...settingsForm, postal_entry_address: e.target.value })} /></label>
          </div>
          <label>Promoter / company details<textarea rows="4" value={settingsForm.promoter_text || ''} onChange={e => setSettingsForm({ ...settingsForm, promoter_text: e.target.value })} /></label>
          <label>Terms and Conditions<textarea rows="14" value={settingsForm.terms_text || ''} onChange={e => setSettingsForm({ ...settingsForm, terms_text: e.target.value })} /></label>
          <label>Privacy Notice<textarea rows="14" value={settingsForm.privacy_text || ''} onChange={e => setSettingsForm({ ...settingsForm, privacy_text: e.target.value })} /></label>
          <label>Free Entry Route<textarea rows="10" value={settingsForm.free_entry_global || ''} onChange={e => setSettingsForm({ ...settingsForm, free_entry_global: e.target.value })} /></label>
          <label>Cookie Notice<textarea rows="8" value={settingsForm.cookie_text || ''} onChange={e => setSettingsForm({ ...settingsForm, cookie_text: e.target.value })} /></label>
          <label>Refunds and Cancellations<textarea rows="8" value={settingsForm.refund_text || ''} onChange={e => setSettingsForm({ ...settingsForm, refund_text: e.target.value })} /></label>
          <label>Winner publication text<textarea rows="5" value={settingsForm.winner_publication_text || ''} onChange={e => setSettingsForm({ ...settingsForm, winner_publication_text: e.target.value })} /></label>
          <label>Responsible play text<textarea rows="5" value={settingsForm.responsible_play_text || ''} onChange={e => setSettingsForm({ ...settingsForm, responsible_play_text: e.target.value })} /></label>
          <label>Age confirmation text<textarea rows="4" value={settingsForm.age_confirmation_text || ''} onChange={e => setSettingsForm({ ...settingsForm, age_confirmation_text: e.target.value })} /></label>
          <label>Cookie popup text<textarea rows="5" value={settingsForm.cookie_banner_text || ''} onChange={e => setSettingsForm({ ...settingsForm, cookie_banner_text: e.target.value })} /></label>
          <label>First-visit legal disclaimer popup<textarea rows="6" value={settingsForm.legal_disclaimer_text || ''} onChange={e => setSettingsForm({ ...settingsForm, legal_disclaimer_text: e.target.value })} /></label>
          <label>Popup checkbox wording<textarea rows="4" value={settingsForm.popup_terms_label || ''} onChange={e => setSettingsForm({ ...settingsForm, popup_terms_label: e.target.value })} /></label>
          <button className="primary full">Save legal text</button>
        </form>}

        {activeTab === 'settings' && <form className="panel settings-panel" onSubmit={saveSettings}>
          <h1>Site settings</h1><p className="muted">Edit public homepage wording, support email, footer text and the top scrolling ticker here. For logo and colours use Admin → Branding.</p>
          <div className="two">
            <label>Site name<input value={settingsForm.site_name || ''} onChange={e => setSettingsForm({ ...settingsForm, site_name: e.target.value })} /></label>
            <label>Support email<input type="email" value={settingsForm.support_email || ''} onChange={e => setSettingsForm({ ...settingsForm, support_email: e.target.value })} /></label>
          </div>
          <label>Homepage title<input value={settingsForm.hero_title || ''} onChange={e => setSettingsForm({ ...settingsForm, hero_title: e.target.value })} /></label>
          <label>Homepage intro text<textarea rows="4" value={settingsForm.hero_text || ''} onChange={e => setSettingsForm({ ...settingsForm, hero_text: e.target.value })} /></label>
          <label>Top scrolling ticker<textarea rows="3" value={settingsForm.welcome_marquee_text || ''} onChange={e => setSettingsForm({ ...settingsForm, welcome_marquee_text: e.target.value })} placeholder="Welcome to Prizetown! | New competitions added regularly | Enter responsibly" /></label>
          <p className="muted">Separate ticker messages with a vertical bar: |</p>
          <label>Footer text<textarea rows="4" value={settingsForm.footer_text || ''} onChange={e => setSettingsForm({ ...settingsForm, footer_text: e.target.value })} /></label>
          <button className="primary full">Save site settings</button>
        </form>}

        {activeTab === 'audit' && <div className="panel list-panel"><h1>Audit log</h1>{(auditLogs || []).length === 0 && <p className="muted">No audit log entries yet.</p>}{(auditLogs || []).map(a => <div className="list-row entry-row" key={a.id}><div><strong>{a.action}</strong><p>{a.user_email}  -  {a.details}  -  {new Date(a.created_at).toLocaleString()}</p></div></div>)}</div>}
      </section>
    </section>
  </main>;
}



function CookieConsent({ settings, setPage, onChoice, showPrefs, setShowPrefs }) {
  return <div className="cookie-banner" role="dialog" aria-label="Cookie notice">
    <div>
      <strong>Cookie choices</strong>
      <p>{settings.cookie_banner_text || defaultSettings.cookie_banner_text}</p>
      {showPrefs && <div className="cookie-prefs">
        <label className="check-row"><input type="checkbox" checked readOnly /> Essential cookies/local storage — required for login, basket and security</label>
        <label className="check-row"><input type="checkbox" disabled /> Analytics cookies — not active yet</label>
        <label className="check-row"><input type="checkbox" disabled /> Marketing cookies — not active yet</label>
      </div>}
      <button type="button" className="footer-text-link" onClick={() => setPage('cookies')}>Read cookie notice</button>
    </div>
    <div className="cookie-actions">
      <button type="button" onClick={() => setShowPrefs(!showPrefs)}>{showPrefs ? 'Hide options' : 'Manage options'}</button>
      <button type="button" className="secondary" onClick={() => onChoice('essential')}>Essential only</button>
      <button type="button" className="primary" onClick={() => onChoice('all')}>Accept all</button>
    </div>
  </div>;
}

function LegalDisclaimer({ settings, setPage, onAccept }) {
  return <div className="modal-backdrop legal-disclaimer-backdrop">
    <section className="panel legal-disclaimer-modal" role="dialog" aria-label="Important Prizetown notice">
      <h1>Important notice</h1>
      <p>{settings.legal_disclaimer_text || defaultSettings.legal_disclaimer_text}</p>
      <label className="check-row important-check">
        <input type="checkbox" onChange={e => { if (e.target.checked) onAccept(); }} />
        <span>{settings.popup_terms_label || defaultSettings.popup_terms_label}</span>
      </label>
      <div className="legal-modal-links">
        <button type="button" className="footer-text-link" onClick={() => setPage('terms')}>Terms</button>
        <button type="button" className="footer-text-link" onClick={() => setPage('privacy')}>Privacy</button>
        <button type="button" className="footer-text-link" onClick={() => setPage('free-entry')}>Free entry</button>
        <button type="button" className="footer-text-link" onClick={() => setPage('cookies')}>Cookies</button>
      </div>
      <button type="button" className="primary full" onClick={onAccept}>I understand</button>
    </section>
  </div>;
}


function PaymentReadinessPanel({ orders = [] }) {
  const orderRows = safeArray(orders);
  const paidTest = orderRows.filter(o => String(o.status || '').toLowerCase() === 'paid_test').length;
  const paid = orderRows.filter(o => String(o.status || '').toLowerCase() === 'paid').length;
  const pending = orderRows.filter(o => String(o.status || '').toLowerCase() === 'pending').length;
  const failed = orderRows.filter(o => String(o.status || '').toLowerCase() === 'failed').length;
  const refunded = orderRows.filter(o => String(o.status || '').toLowerCase() === 'refunded').length;
  const chargeback = orderRows.filter(o => String(o.status || '').toLowerCase() === 'chargeback').length;

  const readiness = [
    ['Real payment provider', false, 'Stripe/Square/other live payment provider is not connected yet. Keep real-money launch paused.'],
    ['Webhook verification', false, 'Before real payments, verify provider webhooks and only trust signed payment events.'],
    ['Ticket allocation rule', false, 'Paid tickets should only be allocated after confirmed paid status. Current online checkout creates paid_test entries for testing.'],
    ['Refund/chargeback handling', false, 'Refund, failed-payment and chargeback states need a safe admin workflow before public paid launch.'],
    ['Free-entry fairness', true, 'Free and manual free entries are already tracked separately and included in eligible draw logic.'],
    ['Winner/draw proof', true, 'Winner proof and server-backed draw time are now visible for trust after draws.']
  ];

  return <div className="panel list-panel payment-readiness-panel">
    <h1>Payments / Readiness</h1>
    <p className="muted">This is a safety checklist before connecting real payments. It does not change checkout or enable live payments.</p>

    <div className="payment-readiness-grid">
      <article><strong>{orderRows.length}</strong><span>Total orders</span></article>
      <article><strong>{paidTest}</strong><span>Test paid orders</span></article>
      <article><strong>{paid}</strong><span>Live paid orders</span></article>
      <article><strong>{pending}</strong><span>Pending orders</span></article>
      <article><strong>{failed}</strong><span>Failed orders</span></article>
      <article><strong>{refunded + chargeback}</strong><span>Refund/chargeback records</span></article>
    </div>

    <div className="payment-warning-box">
      <strong>Launch warning</strong>
      <p>Do not take real payments until webhook verification, idempotency, paid/failed/refunded/chargeback statuses and ticket allocation rules are hardened and tested.</p>
    </div>

    {readiness.map(([title, ok, help]) => <div className="list-row entry-row" key={title}>
      <div><strong>{ok ? '✅' : '⚠️'} {title}</strong><p>{help}</p></div>
    </div>)}
  </div>;
}

function LegalPage({ title, text, settings, setPage }) {
  return <main className="legal-main">
    <section className="panel legal-panel">
      <button type="button" className="link" onClick={() => setPage('home')}>Back to competitions</button>
      <h1>{title}</h1>
      <div className="legal-copy">{String(text || '').split('\n').map((line, index) => line.trim() === '' ? <br key={index} /> : <p key={index}>{line}</p>)}</div>
      <div className="legal-contact">
        <strong>Contact</strong>
        <p>Questions? Email {settings.support_email || defaultSettings.support_email}.</p>
      </div>
    </section>
  </main>;
}


function AboutPage({ setPage, settings }) {
  return <main className="trust-page about-page">
    <section className="trust-hero panel">
      <p className="eyebrow">About Prizetown</p>
      <h1>Postcode prize competitions built around trust, local excitement and clear public results.</h1>
      <p>{settings?.site_name || 'Prizetown'} is designed for UK prize competitions where customers can see how entries work, check public ticket lists, follow live draws and review winner proof after results are published.</p>
      <div className="trust-action-row">
        <button type="button" className="primary" onClick={() => setPage('how-it-works')}>How it works</button>
        <button type="button" className="secondary" onClick={() => setPage('fair-draws')}>Fair draws</button>
        <button type="button" className="secondary" onClick={() => setPage('winners')}>Winner proof</button>
      </div>
    </section>

    <section className="trust-grid four">
      <article><strong>Local-first competitions</strong><span>Postcode tools help Prizetown start with believable local competitions before scaling wider.</span></article>
      <article><strong>Visible ticket numbers</strong><span>Entry lists and account tickets help customers check their allocated numbers.</span></article>
      <article><strong>Live draw moments</strong><span>Final draws can be shown on the live broadcast screen with clear winner reveal.</span></article>
      <article><strong>Public proof</strong><span>The Winners page shows final draw proof details such as ticket number, eligible count and recorded time where available.</span></article>
    </section>

    <section className="panel trust-copy-panel">
      <h2>Our trust promise</h2>
      <p>Prizetown should feel simple, transparent and responsible. Each competition should explain the prize, price, ticket limit, entry limits, draw date, rules and free-entry route before customers enter.</p>
      <p>Customers should be able to follow the journey from competition page, to ticket allocation, to public entry lists, to live draw and winner proof.</p>
    </section>
  </main>;
}

function FairDrawsPage({ setPage }) {
  return <main className="trust-page fair-draws-page">
    <section className="trust-hero panel">
      <p className="eyebrow">Fair draws</p>
      <h1>Clear entries, trusted timing and public winner proof.</h1>
      <p>Prizetown final draws are designed to be easy to explain: eligible entries are loaded, the live draw screen shows the draw, and the result can be published with proof details.</p>
      <div className="trust-action-row">
        <button type="button" className="primary" onClick={() => setPage('entry-lists')}>View entry lists</button>
        <button type="button" className="secondary" onClick={() => setPage('winners')}>View winners</button>
        <button type="button" className="secondary" onClick={() => setPage('free-entry')}>Free entry route</button>
      </div>
    </section>

    <section className="trust-grid four">
      <article><strong>1. Entry accepted</strong><span>Valid paid and free entries receive ticket numbers for the relevant competition.</span></article>
      <article><strong>2. Eligible list checked</strong><span>Final draws use eligible entries, and entry lists can be checked before the draw.</span></article>
      <article><strong>3. Server-backed time</strong><span>The live broadcast footer uses Prizetown server time in the Europe/London timezone.</span></article>
      <article><strong>4. Result published</strong><span>Winner proof can show ticket number, draw method, eligible count, recorded time and time source.</span></article>
    </section>

    <section className="panel trust-copy-panel">
      <h2>Free entry and responsible play</h2>
      <p>Where a competition offers a free postal entry route, free entries should be handled fairly and entered into the same draw as valid paid entries, subject to the competition rules and deadlines.</p>
      <p>Prizetown is for UK residents aged 18+ only. Enter for entertainment and never spend more than you can afford.</p>
    </section>
  </main>;
}

function HowItWorks({ setPage, settings }) {
  const faqs = [
    ['How do I enter?', 'Choose a live competition, answer the entry question where shown, add tickets to your basket and complete checkout. Ticket numbers are allocated after a valid entry is accepted.'],
    ['Can I check my ticket numbers?', 'Yes. Use My entries for your own tickets, and Public Entry Lists to see allocated ticket numbers for competitions before the draw.'],
    ['How do instant wins work?', 'Some competitions can include instant-win prizes. If your allocated ticket matches a configured instant-win ticket number, the prize is marked as claimed.'],
    ['Is there a free entry route?', 'Where offered, the free postal entry route is shown on the Free Entry page and competition details. Valid free entries are treated fairly and entered into the same draw.'],
    ['How are winners shown?', 'Final draw winners and instant-win claims are shown on the Winners page so customers can check results after draws are completed.'],
    ['Is Prizetown for responsible play?', settings?.responsible_play_text || '18+ only. Please enter responsibly. Do not spend more than you can afford.']
  ];

  return <main className="how-page">
    <section className="how-hero panel">
      <p className="eyebrow"><ListChecks size={16} /> How it works</p>
      <h1>Clear steps from entry to winner reveal.</h1>
      <p>Prizetown is built to make competitions easy to understand: choose a prize, get ticket numbers, check entry lists and follow winners after instant wins or final draws.</p>
      <div className="how-actions">
        <button type="button" className="primary" onClick={() => setPage('home')}>View competitions</button>
        <button type="button" className="secondary" onClick={() => setPage('entry-lists')}>Check entry lists</button>
        <button type="button" className="secondary" onClick={() => setPage('winners')}>View winners</button>
      </div>
    </section>

    <section className="how-steps-grid">
      {[
        ['1', 'Choose a competition', 'Browse live prizes, ticket price, closing date, limits and entry question before entering.'],
        ['2', 'Answer and checkout', 'Answer the question where required, confirm you are 18+ and complete your entry.'],
        ['3', 'Receive ticket numbers', 'Your allocated tickets appear in your account and can be checked before the draw.'],
        ['4', 'Watch results', 'Instant wins and final draw winners are saved and shown publicly for transparency.']
      ].map(([number, title, copy]) => <article className="how-step-card panel" key={number}>
        <strong>{number}</strong>
        <h2>{title}</h2>
        <p>{copy}</p>
      </article>)}
    </section>

    <section className="how-faq panel">
      <div className="section-head">
        <div>
          <p className="eyebrow"><Shield size={16} /> FAQ</p>
          <h2>Questions customers may ask before entering</h2>
        </div>
      </div>
      <div className="how-faq-list">
        {faqs.map(([q, a]) => <details key={q} open>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>)}
      </div>
    </section>
  </main>;
}

function EntryLists({ competitions }) {
  const liveCompetitions = safeArray(competitions).filter(c => ['active', 'sold_out', 'closed'].includes(String(c.status || '').toLowerCase()));
  const [competitionId, setCompetitionId] = useState(liveCompetitions[0]?.id || '');
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const selectedCompetition = liveCompetitions.find(c => String(c.id) === String(competitionId));

  async function loadEntryList(id = competitionId) {
    if (!id) return;
    setLoading(true);
    try {
      const rows = await api(`/competitions/${id}/entries`);
      setEntries(safeArray(rows));
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (competitionId) loadEntryList(competitionId);
  }, [competitionId]);

  const filteredEntries = safeArray(entries).filter(e => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return String(e.ticket_number || '').includes(q) || String(e.customer_name || '').toLowerCase().includes(q);
  });

  return <main className="entry-lists-page">
    <section className="entry-lists-hero panel">
      <p className="eyebrow"><Ticket size={16} /> Public entry lists</p>
      <h1>Check allocated ticket numbers before the draw.</h1>
      <p>Entry lists help customers see that tickets have been allocated and that final draws are made from eligible paid and valid free entries.</p>
      <div className="entry-list-controls">
        <label>Competition
          <select value={competitionId} onChange={e => setCompetitionId(e.target.value)}>
            {liveCompetitions.length === 0 && <option value="">No competitions yet</option>}
            {liveCompetitions.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label>Search ticket/name
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Example: 25 or Chris" />
        </label>
        <button type="button" className="secondary" onClick={() => loadEntryList()}>Refresh list</button>
      </div>
    </section>

    <section className="panel entry-list-summary">
      <div>
        <p className="eyebrow"><Trophy size={16} /> Draw transparency</p>
        <h2>{selectedCompetition?.title || 'Choose a competition'}</h2>
        <p className="muted">{loading ? 'Loading entries...' : `${entries.length} allocated ticket(s) found. Showing ${filteredEntries.length}.`}</p>
      </div>
      {selectedCompetition && <div className="entry-list-stats">
        <article><strong>{selectedCompetition.entries_sold || entries.length}</strong><span>Tickets allocated</span></article>
        <article><strong>{selectedCompetition.max_tickets || '-'}</strong><span>Max tickets</span></article>
        <article><strong>{fmtDate(selectedCompetition.draw_at)}</strong><span>Draw date</span></article>
      </div>}
    </section>

    <section className="panel">
      {filteredEntries.length === 0 ? <div className="empty-entry-list">
        <h3>No entries to show yet</h3>
        <p>Ticket numbers will appear here after valid checkout or approved free postal entries.</p>
      </div> : <div className="public-entry-grid">
        {filteredEntries.slice(0, 1000).map(e => <article className="public-entry-card" key={e.ticket_number}>
          <strong>#{e.ticket_number}</strong>
          <span>{e.customer_name || 'Customer'}</span>
        </article>)}
      </div>}
    </section>

    <section className="entry-list-trust panel">
      <h2>Why entry lists matter</h2>
      <div className="winner-trust-grid">
        <article><strong>Visible ticket numbers</strong><span>Customers can check allocated tickets before the draw.</span></article>
        <article><strong>Eligible entries only</strong><span>Lists use paid, test-paid, free and approved manual free-entry records.</span></article>
        <article><strong>Draw-ready record</strong><span>The same ticket numbers feed the draw and winner reveal workflow.</span></article>
      </div>
    </section>
  </main>;
}


function Winners({ winners, instantWinners }) {
  const finalWinners = safeArray(winners);
  const instantRows = safeArray(instantWinners);
  const totalWinners = finalWinners.length + instantRows.length;
  const latestFinal = finalWinners[0];
  const latestInstant = instantRows[0];

  function methodLabel(value = '') {
    return String(value || 'official_final_draw').replaceAll('_', ' ').replace(/\b\w/g, ch => ch.toUpperCase());
  }

  function proofText(w) {
    return [
      'Prizetown public draw proof',
      'Competition: ' + (w.competition_title || w.prize_title || 'Competition'),
      'Winner: ' + (w.winner_name || 'Customer'),
      'Winning ticket: #' + (w.ticket_number || 'Pending proof'),
      'Eligible entries: ' + (w.eligible_count || 'Recorded by Prizetown'),
      'Draw method: ' + methodLabel(w.draw_method),
      'Draw time: ' + (w.draw_at ? fmtDate(w.draw_at) : 'Published result'),
      'Recorded: ' + (w.draw_recorded_at ? fmtDate(w.draw_recorded_at) : fmtDate(w.announced_at)),
      'Time source: ' + (w.time_source || 'Prizetown server') + ' - ' + (w.server_time_zone || 'Europe/London')
    ].join(String.fromCharCode(10));
  }

  function copyProof(w) {
    navigator.clipboard?.writeText(proofText(w));
  }

  return <main className="winners-page">
    <section className="winners-hero panel">
      <p className="eyebrow"><Trophy size={16} /> Winners & public proof</p>
      <h1>Real tickets. Real draws. Clear public proof.</h1>
      <p>Final draw results show the winning ticket number, draw method, eligible entry count, recorded time and trusted server-time source where available.</p>
      <div className="winner-proof-grid">
        <article><strong>{totalWinners}</strong><span>Total winner records</span></article>
        <article><strong>{instantRows.length}</strong><span>Instant wins claimed</span></article>
        <article><strong>{finalWinners.length}</strong><span>Final draw winners</span></article>
        <article><strong>{latestFinal?.competition_title || latestInstant?.competition_title || 'Coming soon'}</strong><span>Latest result</span></article>
      </div>
    </section>

    <section className="winners-section">
      <div className="section-head">
        <div>
          <p className="eyebrow"><Zap size={16} /> Instant wins</p>
          <h2>Latest instant winners</h2>
        </div>
        <span className="muted">Instant wins are triggered by matching configured winning ticket numbers.</span>
      </div>
      {instantRows.length === 0 && <div className="panel empty-winners"><h3>No instant winners yet</h3><p>Instant-win prizes will appear here as soon as they are claimed.</p></div>}
      <div className="winner-card-grid">
        {instantRows.map(w => <article className="winner-result-card instant" key={w.id}>
          <div className="winner-result-icon"><Zap size={26} /></div>
          <div>
            <p className="winner-kicker">Instant win</p>
            <h3>{w.winner_name || w.customer_name || 'Customer'}</h3>
            <p>Won <strong>{w.prize_title || 'Instant prize'}</strong></p>
            <div className="winner-meta">
              <span>{w.competition_title || 'Competition'}</span>
              <span>Ticket #{w.winning_ticket_number || '-'}</span>
            </div>
          </div>
        </article>)}
      </div>
    </section>

    <section className="winners-section">
      <div className="section-head">
        <div>
          <p className="eyebrow"><Trophy size={16} /> Final draws</p>
          <h2>Final draw winners</h2>
        </div>
        <span className="muted">Each proof card is based on the saved final draw record.</span>
      </div>
      {finalWinners.length === 0 && <div className="panel empty-winners"><h3>No final draw winners announced yet</h3><p>When a competition closes and the final draw is run, the result and proof details will be shown here.</p></div>}
      <div className="winner-card-grid">
        {finalWinners.map(w => <article className="winner-result-card final public-proof-card" key={w.id}>
          {w.image_url ? <img src={imageUrl(w.image_url)} alt="" /> : <div className="winner-result-icon"><Trophy size={26} /></div>}
          <div>
            <p className="winner-kicker">Official final draw</p>
            <h3>{w.winner_name || 'Winner'}</h3>
            <p>{w.prize_title || w.competition_title || 'Prize winner'}</p>
            <div className="winner-proof-details">
              <span><strong>Winning ticket</strong>#{w.ticket_number || 'Pending'}</span>
              <span><strong>Eligible entries</strong>{w.eligible_count || 'Recorded'}</span>
              <span><strong>Draw method</strong>{methodLabel(w.draw_method)}</span>
              <span><strong>Draw time</strong>{w.draw_at ? fmtDate(w.draw_at) : 'Published result'}</span>
              <span><strong>Recorded</strong>{w.draw_recorded_at ? fmtDate(w.draw_recorded_at) : fmtDate(w.announced_at)}</span>
              <span><strong>Time source</strong>{w.time_source || 'Prizetown server'} - {w.server_time_zone || 'Europe/London'}</span>
            </div>
            <button type="button" className="secondary" onClick={() => copyProof(w)}>Copy proof summary</button>
          </div>
        </article>)}
      </div>
    </section>

    <section className="winner-trust-panel panel">
      <h2>How Prizetown publishes results</h2>
      <div className="winner-trust-grid">
        <article><strong>Winning ticket shown</strong><span>Final draw results show the saved winning ticket number.</span></article>
        <article><strong>Eligible count shown</strong><span>Customers can see how many eligible entries were in the draw where available.</span></article>
        <article><strong>Server time source</strong><span>Draw proof uses Prizetown server records and Europe/London time.</span></article>
        <article><strong>Public result history</strong><span>Winner records remain visible after competitions finish.</span></article>
      </div>
    </section>
  </main>;
}

window.__PRIZETOWN_BUILD__ = 'Prizetown web build v185';
createRoot(document.getElementById('root')).render(<AppErrorBoundary><App /></AppErrorBoundary>);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
