
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
        ['launch-centre', 'Launch centre', ListChecks],
        ['error-pages', 'Error pages', ListChecks],
        ['tools-overview', 'Tools overview', ListChecks],
        ['help-guide', 'Help guide', ListChecks],
        ['social-integrations', 'Social Integrations', ListChecks],
        ['security-readiness', 'Security Readiness', Shield],
        ['backup-readiness', 'Backup Readiness', Shield],
        ['support-readiness', 'Support Readiness', Shield],
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
        {activeTab === 'launch-checklist' && <LaunchChecklistPanel
          competitions={competitions}
          settingsForm={settingsForm}
          modulePostcodes={modulePostcodes}
          moduleInstantWins={moduleInstantWins}
          moduleLiveDraw={moduleLiveDraw}
        />}

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

        {activeTab === 'error-pages' && <div className="panel list-panel">
          <h1>Error pages</h1>
          <p className="muted">Preview the friendly Arnold pages used for 404, maintenance and offline states. Direct .html URLs are currently caught by the app fallback, so the previews below are shown safely inside admin.</p>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Routing note</h2>
            <p className="muted">Admin previews work here now. Real public use of <code>/404.html</code>, <code>/maintenance.html</code> and <code>/offline.html</code> still needs a future hosting, nginx/Traefik routing rule or maintenance-mode switch so those URLs are served before the React app fallback.</p>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Future maintenance mode plan</h2>
            <ul className="muted">
              <li>Add an admin-only maintenance toggle later.</li>
              <li>Public visitors should see the Arnold maintenance page while maintenance is on.</li>
              <li>Admin should stay reachable over Tailscale so you can turn maintenance back off.</li>
              <li>API health should stay available so deployment checks still work.</li>
            </ul>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Maintenance mode checklist</h2>
            <ul className="muted">
              <li>Confirm you can access admin over Tailscale before enabling maintenance.</li>
              <li>Check API health and System check before and after any maintenance window.</li>
              <li>Pause public launch/marketing posts until the site is live again.</li>
              <li>Check Orders, Support Readiness and Audit log after maintenance ends.</li>
            </ul>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Maintenance quick actions</h2>
            <div className="tools-shortcut-row">
              <button type="button" onClick={() => setActiveTab('system-check')}>Open System check</button>
              <button type="button" onClick={() => setActiveTab('support-readiness')}>Open Support Readiness</button>
              <button type="button" onClick={() => setActiveTab('orders')}>Open Orders</button>
              <button type="button" onClick={() => setActiveTab('audit-log')}>Open Audit log</button>
            </div>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Maintenance flow</h2>
            <div className="backup-notes-grid">
              <article>
                <strong>Before</strong>
                <p>Check System check, confirm admin access over Tailscale, and avoid posting public marketing links while work is planned.</p>
              </article>
              <article>
                <strong>During</strong>
                <p>Keep admin open, leave API health reachable, and use the Arnold maintenance message if the public site needs a friendly pause.</p>
              </article>
              <article>
                <strong>After</strong>
                <p>Recheck Orders, Support Readiness and Audit log, then confirm the public homepage and checkout still load cleanly.</p>
              </article>
            </div>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Public recovery checklist</h2>
            <ul className="muted">
              <li>Open the public homepage and confirm competitions load.</li>
              <li>Open a competition page and confirm the basket/checkout path still starts correctly.</li>
              <li>Check My entries, Winners and Support links after a deploy or maintenance window.</li>
              <li>Confirm no new errors appear in Audit log after the site is live again.</li>
            </ul>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Public recovery quick links</h2>
            <div className="tools-shortcut-row">
              <a className="button-like" href="https://prizetown.co.uk" target="_blank" rel="noreferrer">Open public homepage</a>
              <a className="button-like" href="https://prizetown.co.uk/my-entries" target="_blank" rel="noreferrer">Open My entries</a>
              <a className="button-like" href="https://prizetown.co.uk/winners" target="_blank" rel="noreferrer">Open Winners</a>
              <a className="button-like" href="https://prizetown.co.uk/support" target="_blank" rel="noreferrer">Open Support</a>
            </div>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Customer-facing message checklist</h2>
            <ul className="muted">
              <li>Keep maintenance messages calm, short and clear.</li>
              <li>Say whether entries/orders are paused or still safe.</li>
              <li>Give visitors the Support link if they need help.</li>
              <li>Remove or update the message as soon as the site is back.</li>
            </ul>
          </div>
          <div className="backup-notes-grid">
            <article>
              <strong>404 page</strong>
              <p>Use when a visitor lands on a page that does not exist.</p>
            </article>
            <article>
              <strong>Maintenance page</strong>
              <p>Use when Prizetown is intentionally being serviced or updated.</p>
            </article>
            <article>
              <strong>Offline page</strong>
              <p>Use when the site or connection needs a friendly temporary offline message.</p>
            </article>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Arnold preview artwork</h2>
            <img src="/arnold-server-repair-404.png" alt="Arnold fixing tangled server wires" style={{ width: '100%', maxWidth: 760, borderRadius: 18, display: 'block' }} />
          </div>
          <div className="backup-notes-grid" style={{ marginTop: 16 }}>
            <article>
              <strong>404 preview</strong>
              <p><strong>Arnold is fixing the wires</strong></p>
              <p>This page has wandered into the cable cupboard. Try heading back home while Arnold checks the plugs.</p>
              <p className="muted"><strong>Status:</strong> Page not found</p>
            </article>
            <article>
              <strong>Maintenance preview</strong>
              <p><strong>Arnold is tuning the servers</strong></p>
              <p>Prizetown is having a quick service. Nothing dramatic — just a few wires, lights and a strong cup of tea.</p>
              <p className="muted"><strong>Status:</strong> Service in progress</p>
            </article>
            <article>
              <strong>Offline preview</strong>
              <p><strong>Arnold is reconnecting Prizetown</strong></p>
              <p>The connection is taking a breather. Arnold is checking the rack and we should be back once things settle.</p>
              <p className="muted"><strong>Status:</strong> Temporarily offline</p>
            </article>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Artwork</h2>
            <p className="muted">These previews use the Arnold server-rack artwork at <code>/arnold-server-repair-404.png</code>.</p>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>When to use each page</h2>
            <ul className="muted">
              <li><strong>404:</strong> use for broken, missing or old links.</li>
              <li><strong>Maintenance:</strong> use when updates are planned and temporary.</li>
              <li><strong>Offline:</strong> use when the site/API connection is unexpectedly unavailable.</li>
            </ul>
          </div>
        </div>}

        {activeTab === 'launch-centre' && <div className="panel list-panel">
          <h1>Launch centre</h1>
          <p className="muted">Use this as the fast route into the main areas you need before and during launch.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '14px 0 18px' }}>
            <button type="button" onClick={() => setActiveTab('launch-checklist')}>1 Launch checklist</button>
            <button type="button" onClick={() => setActiveTab('system-check')}>2 System check</button>
            <button type="button" onClick={() => setActiveTab('security-readiness')}>3 Security Readiness</button>
            <button type="button" onClick={() => setActiveTab('backup-readiness')}>4 Backup Readiness</button>
            <button type="button" onClick={() => setActiveTab('support-readiness')}>5 Support Readiness</button>
            <button type="button" onClick={() => setActiveTab('draw-control-room')}>Draw Control Room</button>
            <button type="button" onClick={() => setActiveTab('orders')}>Orders</button>
            <button type="button" onClick={() => setActiveTab('winners')}>Winners</button>
            <button type="button" onClick={() => setActiveTab('error-pages')}>Error pages</button>
          </div>
          <div className="backup-notes-grid">
            <article><strong>Before launch</strong><p>Start with Launch checklist, then confirm System check, Security Readiness and Backup Readiness.</p></article>
            <article><strong>During launch</strong><p>Keep Orders, Winners and Draw Control Room close so customer activity and draw readiness are easy to monitor.</p></article>
            <article><strong>After issues</strong><p>Use Support Readiness and Audit log when checking customer queries, refunds, complaints or admin changes.</p></article>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Daily admin flow</h2>
            <p className="muted">A simple order for opening Prizetown each day: check app health, review orders, review support, confirm draw readiness, then check winners/audit if anything changed.</p>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Emergency route</h2>
            <p className="muted">If something looks wrong: open System check first, then Support Readiness, Backup Readiness and Audit log before changing live competitions or draw settings.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              <button type="button" onClick={() => setActiveTab('system-check')}>System check</button>
              <button type="button" onClick={() => setActiveTab('support-readiness')}>Support Readiness</button>
              <button type="button" onClick={() => setActiveTab('backup-readiness')}>Backup Readiness</button>
              <button type="button" onClick={() => setActiveTab('audit-log')}>Audit log</button>
              <button type="button" onClick={() => setActiveTab('error-pages')}>Error pages</button>
            </div>
          </div>
          <div className="panel subtle-panel" style={{ marginTop: 16 }}>
            <h2>Visitor fallback pages</h2>
            <p className="muted">Use Error pages to preview the Arnold 404, maintenance and offline pages before linking them from hosting, redirects or future maintenance controls.</p>
          </div>
        </div>}

        {activeTab === 'tools-overview' && <div className="panel list-panel">
          <h1>Tools overview</h1>
          <p className="muted">Use this page as the quick route map for the admin Tools section.</p>
          <p className="muted"><strong>Open the most-used launch and safety tools quickly:</strong></p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '14px 0 18px' }}>
            <button type="button" onClick={() => setActiveTab('launch-checklist')}>1 Launch checklist</button>
            <button type="button" onClick={() => setActiveTab('system-check')}>2 System check</button>
            <button type="button" onClick={() => setActiveTab('security-readiness')}>3 Security Readiness</button>
            <button type="button" onClick={() => setActiveTab('backup-readiness')}>4 Backup Readiness</button>
            <button type="button" onClick={() => setActiveTab('support-readiness')}>5 Support Readiness</button>
            <button type="button" onClick={() => setActiveTab('help-guide')}>6 Help guide</button>
          </div>
          <div className="backup-notes-grid">
            <article><strong>Start before launch</strong><p>Open Launch checklist first, then System check, Security Readiness, Backup Readiness and Support Readiness.</p></article>
            <article><strong>Check app health</strong><p>Use System check for API version, email setup, uploads path, environment notes and key warnings.</p></article>
            <article><strong>Handle customer support</strong><p>Use Support Readiness for customer messages, missing tickets, winner handling, refunds, complaints and daily support checks.</p></article>
            <article><strong>Protect data</strong><p>Use Backup Readiness before launch and after major changes so database, uploads, compose/YAML and restore notes are covered.</p></article>
            <article><strong>Explain admin areas</strong><p>Use Help guide as the plain-English manual for what each admin tab does and what new features mean.</p></article>
            <article><strong>Review changes</strong><p>Use Audit log when checking what changed, who handled support/draw actions or when something needs reviewing.</p></article>
          </div>
        </div>}

        {activeTab === 'help-guide' && <div className="panel list-panel help-guide-panel">
          <h1>Admin Help Guide</h1>
          <p className="muted">Simple notes for anyone helping manage Prizetown. Update this guide whenever a new admin feature is added or changed.</p>

          {[
            ['Admin Quick Start', 'Recommended order: check Overview, open Launch checklist, review Competitions, check Orders & entries, confirm Legal Text and Site settings, then use System check before launch.'],
            ['Common Admin Jobs', 'Create a competition: Competitions → Add competition. Check sales: Orders & entries. Add postal/free entries: Free entries. Change homepage text: Site settings. Change logo/colours: Branding. Check launch safety: Launch checklist and System check.'],
            ['Common Troubleshooting', 'Text not changing: save in Site settings, then refresh the homepage. Email issue: use Email test. Draw issue: check Final draw and Automation status. Admin access issue: use the Tailscale admin URL, not public /admin.'],
            ['Launch Checks', 'Before sending real customers to the site, check Launch checklist, System check, Legal Text, payment setup, email setup, competition rules, free-entry wording, draw dates and branding.'],
            ['Launch Checklist Groups', 'The Launch checklist is grouped into Legal, Payments, Security, Draw trust, Email/support and Content/branding so admins can review launch readiness in a clearer order.'],
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
            ['Security Readiness', 'Use Security Readiness to track launch hardening work such as admin password, JWT secret, admin-only access, rate limiting, upload checks, backups, HTTPS and Cloudflare protection.'],
            ['Backup Readiness', 'Use Backup Readiness to track the backup plan before launch: TrueNAS snapshots, PostgreSQL database dumps, uploads backup, Google Drive/off-site copy, saved compose/YAML and a tested restore.'],
            ['Backup Export Notes', 'Backup Readiness now includes manual export notes for PostgreSQL dumps, uploads, compose/YAML, image tags and Google Drive/off-site copies. These are planning notes only until backup automation is added.'],
            ['Backup System Checks', 'System Check now includes backup warnings for TrueNAS snapshots, PostgreSQL dumps, uploads, Google Drive/off-site copy and restore testing.'],
            ['Backup Launch Guidance', 'Before real payments, keep a local TrueNAS backup plus a Google Drive/off-site copy, save compose/YAML and image tags, and complete a restore test.'],
            ['Restore Test Checklist', 'Backup Readiness now includes a simple restore-test checklist so backups are not trusted until login, orders, entries, winners and uploads are checked on a safe temporary restore.'],
            ['Support Readiness', 'Use Support Readiness before launch to check support email, refund/help process, winner contact process, free-entry support and complaint/escalation notes.'],
            ['Customer Support Notes', 'Support Readiness now includes simple notes for checking orders, entries, ticket numbers, winner proof, free-entry questions and refunds before replying to customers.'],
            ['Winner Contact Checklist', 'Support Readiness now includes winner-contact guidance for checking draw proof, ticket number, contact details, prize fulfilment notes and safe public/private data handling.'],
            ['Support Message Templates', 'Support Readiness now includes simple starter reply templates for order questions, free-entry questions, winner contact, refund queries and escalations.'],
            ['Support Workflow Checklist', 'Support Readiness now includes a simple step-by-step workflow for checking support requests before replying to customers.'],
            ['Admin Handover Checklist', 'Support Readiness now includes an admin handover checklist so another trusted admin can understand support, orders, draws, backups and launch safety checks.'],
            ['Launch Support Summary', 'Support Readiness now includes a simple launch support summary to remind admins what must be ready before public paid competitions.'],
            ['Customer FAQ Checklist', 'Support Readiness now includes a simple customer FAQ checklist for common questions about entering, tickets, free entry, draws, winners and refunds.'],
            ['Support Contact Visibility', 'Support Readiness now includes checks for making the support email and customer help routes easy to find before launch.'],
            ['Support Escalation Checklist', 'Support Readiness now includes clear escalation triggers for refunds, chargebacks, winner disputes, identity checks, legal complaints and data/privacy issues.'],
            ['Support Daily Review', 'Support Readiness now includes a daily review checklist for checking new orders, support messages, failed payments, free entries, winner follow-ups and audit notes.'],
            ['Support Issue Log Guidance', 'Support Readiness now includes simple guidance for recording customer issues, follow-ups, escalations and outcomes during launch.'],
            ['Support Response Safety', 'Support Readiness now includes response safety reminders so admins avoid sharing private data, promising outcomes too early or replying before records are checked.'],
            ['Support Launch Sign-off', 'Support Readiness now includes a final support sign-off checklist before wider public marketing or paid competition launch.'],
            ['Support Handover Summary', 'Support Readiness now includes a short handover summary for new admins covering what to check first and where support evidence lives.'],
            ['Support Readiness Sections', 'Support Readiness now includes a quick section guide so admins can understand the support page without reading every card first.'],
            ['Support Compact Index', 'Support Readiness now includes a compact index that tells admins which support checklist to use for common customer situations.'],
            ['Support Page Complete Note', 'Support Readiness now includes a clear top note saying the support page is a reference manual and admins should use the compact index first.'],
            ['Admin Tools Overview', 'Tools now has a dedicated Tools overview tab explaining which admin tool to open first for launch checks, system checks, support, backups and audit review.'],
            ['Tools Overview Shortcuts', 'Tools overview now includes quick shortcut buttons for Launch checklist, System check, Security Readiness, Backup Readiness, Support Readiness and Help guide.'],
            ['Tools Shortcut Helper', 'Tools overview now includes a short helper line above the shortcut buttons so admins know these are the most-used launch and safety tools.'],
            ['Tools Shortcut Order', 'Tools overview shortcut buttons are now numbered so admins can follow the recommended pre-launch check order.'],
            ['Admin Launch Centre', 'Tools now includes a Launch centre tab with fast links to launch checks, system checks, safety readiness, support, draws, orders and winners.'],
            ['Launch Centre Daily Flow', 'Launch centre now includes a compact daily admin flow so admins know what to check first when opening Prizetown.'],
            ['Launch Centre Emergency Route', 'Launch centre now includes an emergency route for checking system health, support, backups and audit logs before changing live settings.'],
            ['Arnold Error Pages', 'Static public pages are available at /404.html, /maintenance.html and /offline.html using the Arnold server-rack artwork for friendly error, maintenance and offline states.'],
            ['Error Pages Admin Preview', 'Tools now includes an Error pages tab so admins can quickly open and check the Arnold 404, maintenance and offline pages.'],
            ['Launch Centre Error Page Shortcuts', 'Launch centre now links directly to Error pages from the main shortcut row and emergency route so Arnold fallback pages are easier to find.'],
            ['Error Pages Usage Notes', 'Error pages now explains when to use the 404, maintenance and offline Arnold fallback pages.'],
            ['Error Page Inline Previews', 'Error pages now shows the Arnold 404, maintenance and offline previews directly inside admin because direct .html URLs are caught by the app fallback.'],
            ['Error Page Routing Note', 'Error pages now explains that admin previews work, but real public .html fallback pages need future hosting, nginx/Traefik routing or a maintenance-mode switch.'],
            ['Maintenance Mode Plan', 'Error pages now includes a future maintenance mode plan covering an admin toggle, Arnold public page, admin access over Tailscale and API health checks.'],
            ['Maintenance Mode Checklist', 'Error pages now includes a compact checklist for admin access, API checks, marketing pauses and post-maintenance reviews.'],
            ['Maintenance Quick Actions', 'Error pages now includes quick buttons to System check, Support Readiness, Orders and Audit log for maintenance checks.'],
            ['Maintenance Flow', 'Error pages now includes a before, during and after maintenance flow so admins know what to check around a maintenance window.'],
            ['Public Recovery Checklist', 'Error pages now includes a post-maintenance public recovery checklist for homepage, checkout, entries, winners, support and audit checks.'],
            ['Public Recovery Quick Links', 'Error pages now includes quick links to the public homepage, My entries, Winners and Support for post-maintenance checks.'],
            ['Customer Message Checklist', 'Error pages now includes a customer-facing message checklist for clear, calm maintenance/offline wording.'],
            ['Backup Recovery Flow', 'Backup Readiness now includes a before, rollback and after-recovery flow for safer updates and restores.'],
            ['Backup Rollback Checklist', 'Backup Readiness now includes rollback steps for pausing changes, using fixed image tags, checking health, checking data and recording the outcome.'],
            ['Admin Readability Contrast', 'Admin light cards and grey helper text now use stronger contrast so checklist and note wording is easier to read.'],
            ['Admin Card Text Contrast', 'Admin note cards now force darker paragraph and list text inside light grey cards so longer guidance is easier to read.'],
            ['Backup Evidence Checklist', 'Backup Readiness now includes evidence to record before/after risky updates, including image tags, DB dump, uploads path and restore test notes.'],
            ['Restore Drill Checklist', 'Backup Readiness now includes a safe restore drill checklist for testing backup confidence without changing live data first.'],
            ['Backup Schedule Guide', 'Backup Readiness now includes simple daily, weekly, before-update and before-launch backup schedule guidance.'],
            ['Backup Command Notes', 'Backup Readiness now includes simple notes for what to record before updates, including health, image tags, database path, uploads path and YAML copy.'],
            ['Backup Readiness Summary', 'Backup Readiness now includes a quick summary of the minimum proof needed before risky updates.'],
            ['Backup Emergency Notes', 'Backup Readiness now includes emergency restore notes for owner/contact, last stable tags, backup locations and go/no-go decisions.'],
            ['Backup Launch Gate', 'Backup Readiness now includes a final launch gate checklist for backup confidence before real traffic or payments.'],
            ['Backup Do and Do Not', 'Backup Readiness now includes simple safe rules for what to do and avoid before updates or restores.'],
            ['Backup Export Reminder', 'Backup Readiness now reminds admins what to copy into an outside record before major updates or launch work.'],
            ['After Restore Checks', 'Backup Readiness now includes a compact checklist of screens and data to verify after any restore or rollback.'],
            ['Google Drive Backup Guide', 'Backup Readiness now includes Google Drive folder, naming, sharing and upload guidance for off-site backup copies.'],
            ['Google Drive Status Integration', 'Backup Readiness now has a backend Google Drive status endpoint that checks folder and credential environment configuration without exposing secrets.'],
            ['Google Drive Status Button', 'Backup Readiness now includes an admin button to check Google Drive folder and credential configuration from the UI.'],
            ['Google Drive Test Upload', 'Backup Readiness now includes an admin-only test upload button to prove Google Drive folder and credentials can create files.'],
            ['Google Drive Backup Manifest', 'Backup Readiness now includes an admin button to upload a timestamped backup manifest JSON file to Google Drive.'],
            ['Google Drive Uploads Index', 'Backup Readiness now includes an admin button to upload a JSON index of uploaded files to Google Drive for restore checking.'],
            ['Google Drive Database Snapshot', 'Backup Readiness now includes an admin button to upload a capped JSON database snapshot to Google Drive.'],
            ['Google Drive Backup Run Summary', 'Backup Readiness now includes an admin button to upload one summary file covering Drive config, database counts and uploads counts.'],
            ['Google Drive Uploads Batch', 'Backup Readiness now includes a limited admin button to upload actual uploaded files to Google Drive in small safe batches.'],
            ['Google Drive Folder Inventory', 'Backup Readiness now includes a button to list the latest files already in the configured Google Drive backup folder.'],
            ['Google Drive Backup Pack', 'Backup Readiness now includes a one-click backup evidence pack upload: summary, capped database snapshot and uploads index.'],
            ['Google Drive Backup Health', 'Backup Readiness now includes a health check that scans the Drive backup folder for expected backup evidence file types.'],
            ['Google Drive Latest Backup Report', 'Backup Readiness now includes a button to summarise the latest backup files by type from Google Drive.'],
            ['Google Drive Restore Check Report', 'Backup Readiness now includes a button to upload a restore checklist/report JSON file to Google Drive.'],
            ['Google Drive Backup Timeline', 'Backup Readiness now includes a button to list recent backup files in timeline form.'],
            ['Google Drive Readiness Score', 'Backup Readiness now includes a simple score based on backup evidence files and local uploads visibility.'],
            ['Google Drive Backup Audit Report', 'Backup Readiness now includes a button to upload a combined audit report with timeline and readiness evidence.'],
            ['Google Drive Backup Size Report', 'Backup Readiness now includes a button to total Google Drive backup storage by file type.'],
            ['Google Drive Retention Report', 'Backup Readiness now includes a review-only retention report for older backup files.'],
            ['Google Drive Retention Policy Report', 'Backup Readiness now includes a button to upload a combined size and retention policy report to Drive.'],
            ['Google Drive Verification Matrix', 'Backup Readiness now includes a quick matrix showing backup evidence, readiness, size and retention status.'],
            ['Google Drive Restore Drill Evidence', 'Backup Readiness now includes a button to upload a restore drill evidence template to Drive.'],
            ['Google Drive Operator Handover', 'Backup Readiness now includes a button to upload a handover report for another admin/operator.'],
            ['Backup Schedule Plan', 'Backup Readiness now includes a non-destructive schedule plan for daily, weekly and monthly backup routines.'],
            ['Database Dump Guide', 'Backup Readiness now includes a button to upload pg_dump command guidance to Google Drive.'],
            ['Uploads Backup Plan', 'Backup Readiness now includes a button to upload a local uploads backup plan and file count report.'],
            ['Backup Preflight Check', 'Backup Readiness now includes a launch/change preflight check across Drive evidence, score, schedule, size and retention status.'],
            ['Backup Preflight Report', 'Backup Readiness now includes a button to upload the preflight report to Google Drive.'],
            ['TrueNAS Backup Runbook', 'Backup Readiness now includes a button to upload a TrueNAS backup runbook to Drive.'],
            ['Emergency Rollback Runbook', 'Backup Readiness now includes a button to upload rollback instructions and current expected tags to Drive.'],
            ['Scheduled Backup Readiness', 'Backup Readiness now includes a check for whether the app is ready to move backup routines into scheduled jobs.'],
            ['Scheduled Backup Spec', 'Backup Readiness now includes a button to upload a suggested scheduled backup job specification to Drive.'],
            ['Environment Checklist Report', 'Backup Readiness now includes a button to upload a no-secrets environment/config checklist to Drive.'],
            ['Launch Go/No-Go Report', 'Backup Readiness now includes a button to upload a launch readiness decision report to Drive.'],
            ['Backup Tools Cleanup', 'Backup Readiness now has a fast-path workflow panel, grouped button labels and clearer guidance so admins do not need to guess which backup button to use first.'],
            ['Backup Fast Path', 'Use the recommended path first: status, preflight, backup pack, go/no-go. Use the other report buttons only when you need evidence or handover files.'],
            ['Admin Navigation Polish', 'Admin screens now get clearer button spacing, grouped action rows, sticky section helpers and a small back-to-top helper for faster movement around long admin pages.'],
            ['Admin Button Layout', 'Action buttons across admin areas are easier to scan on desktop and mobile, with section labels and consistent wrapping.'],
            ['Admin Quick Navigation', 'Admin pages now show a compact quick navigation helper so operators can jump to the most-used admin areas faster.'],
            ['Public Trust Blocks', 'The public homepage now includes clearer how-it-works, draw transparency, free-entry and winner proof guidance to improve customer trust.'],
            ['Live Activity Polish', 'The public Live Activity area now removes the extra competitions link and makes the next draw date/time easier to read.'],
            ['Automation Control Centre', 'Admin now has a safe automation overview panel with quick links, status tiles and refreshable system signals.'],
            ['Automation Safety Warnings', 'Automation now highlights common launch risks such as payment hardening, email setup and backup checks without running risky actions automatically.'],
            ['Live Activity Safe Zone', 'The public Live Activity next draw card now keeps the date and time inside the card on desktop and mobile.'],
            ['Live Activity Font Polish', 'The public Live Activity next draw card now uses smaller, cleaner date/time text so it does not look squeezed.'],
            ['Automation Timeline', 'Automation Control Centre now shows a small recent activity timeline for refreshes, checks and admin navigation actions without changing live data.'],
            ['Automation Panel Placement', 'Automation Control Centre is scoped to the admin content area so it does not appear above the public navigation/header.'],
            ['Automation Wording Polish', 'Automation buttons now use clearer wording: real draw controls keep the Run due auto draws label, while the overview uses safer shortcut wording.'],
            ['Automation Panel Size', 'Automation Control Centre is displayed as a compact admin helper so it does not dominate the top of the dashboard.'],
            ['Floating Automation Panel Disabled', 'The experimental injected Automation Control Centre panel is disabled so it cannot appear above the public header. Automation controls remain available in their normal admin sections.'],
            ['Payment Readiness Centre', 'Admin now has a payment launch-readiness panel showing why live payments should wait until provider keys, webhooks, idempotency and paid-order checks are complete.'],
            ['Security Readiness Centre', 'Admin now has a launch security checklist covering admin credentials, secrets, HTTPS, uploads, rate limits, backups and audit logging before public launch.'],
            ['Floating Readiness Panels Disabled', 'The experimental injected Payment and Security readiness panels are disabled so they cannot appear above the public header. They should be re-added later as proper Admin Tools sections.'],
            ['System Check Security Hardening', 'System Check now warns about default admin credentials, weak JWT secrets and non-HTTPS public API settings before launch.'],
            ['Security Headers and Login Rate Limit', 'The API now adds basic browser safety headers and a lightweight in-memory rate limit around login-style requests.'],
            ['Upload Hardening Guards', 'Upload requests now have safer size/type checks, with SVG/HTML/JavaScript-style files blocked before public launch.'],
            ['CORS Origin Allowlist', 'The API now has a configurable browser-origin allowlist so only approved public, admin and local testing origins can call it from browsers.'],
            ['Security Event Log', 'Admin can now review recent in-memory security events such as blocked origins, rate-limit blocks and blocked uploads.'],
            ['Security Events Viewer', 'Admin now has a compact viewer for recent blocked origins, upload blocks and login rate-limit security events.'],
            ['Demo Posters', 'Starter/demo competitions use SVG poster artwork from web/public/demo-posters. Replace those files or edit competition image URLs when changing sample prize types.'],
            ['Image URLs', 'Built-in site assets such as demo posters, logo, favicon and Arnold images load from the public web app. Uploaded files use the API uploads path.'],
            ['Spinner Style', 'Use Final Draw > Spinner style to switch between Classic and Ticket squares. Classic is the current spinner and is kept so you can revert instantly.'],
            ['Mobile Preview', 'Use Draws > Mobile Preview to test the live draw page inside phone-sized frames before changing public mobile draw CSS. Check spinner visibility, Arnold overlap, text wrapping and sideways scrolling.'],
            ['Important Rule', 'Whenever a new admin feature is added or changed, add a short plain-English note here so future admins understand what it is for.']
          ].map(([title, text]) => <div className="list-row entry-row" key={title}><div><strong>{title}</strong><p>{text}</p></div></div>)}
        </div>}

        {activeTab === 'security-readiness' && <SecurityReadinessPanel />}

        {activeTab === 'backup-readiness' && <BackupReadinessPanel />}

        {activeTab === 'support-readiness' && <SupportReadinessPanel />}

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




function LaunchChecklistPanel({ competitions, settingsForm, modulePostcodes, moduleInstantWins, moduleLiveDraw }) {
  const activeCompetitions = competitions.filter(c => c.status === 'active');

  const groups = [
    {
      title: 'Legal / compliance',
      intro: 'Check legal wording, free-entry wording and postal-entry details before public launch.',
      items: [
        ['Competition rules', activeCompetitions.every(c => !!(c.rules_text || '').trim()), 'Every active competition should have visible rules.'],
        ['Free entry wording', activeCompetitions.every(c => !!(c.free_entry_text || '').trim()), 'Every active competition should explain the free-entry route.'],
        ['Global legal/free entry text', !!(settingsForm.terms_text || '').trim() && !!(settingsForm.free_entry_global || '').trim(), 'Legal pages and global free-entry text should be filled in.'],
        ['Postal entry address', !!(settingsForm.postal_entry_address || '').trim() && !(settingsForm.postal_entry_address || '').includes('Add postal entry address'), 'Add a real postal entry address before launch.']
      ]
    },
    {
      title: 'Payments',
      intro: 'Do not take real payments until provider/webhook handling is fully hardened.',
      items: [
        ['Payment readiness', false, 'Connect a provider safely, verify webhooks, handle pending/paid/failed/refunded/chargeback statuses and only allocate paid tickets after confirmed payment.'],
        ['Payment launch mode', false, 'Current checkout should be treated as paid_test until real payment hardening is complete.']
      ]
    },
    {
      title: 'Security',
      intro: 'Security hardening should be finished before real users or real-money competitions.',
      items: [
        ['Security readiness', false, 'Change default credentials/secrets, protect admin access, add rate limits, harden uploads and confirm backups/restore.'],
        ['System check reviewed', true, 'Run Tools → System check and review warnings before launch.']
      ]
    },
    {
      title: 'Draw trust',
      intro: 'Confirm competitions, draw dates and public proof tools are ready.',
      items: [
        ['Active competitions', activeCompetitions.length > 0, 'At least one competition should be active.'],
        ['Competition draw dates', activeCompetitions.every(c => !!c.draw_at), 'Every active competition should have a draw date.'],
        ['Live draw checked', true, moduleLiveDraw ? 'Live draw / OBS is enabled.' : 'Live draw / OBS is off.'],
        ['Instant wins checked', true, moduleInstantWins ? 'Instant wins are enabled.' : 'Instant wins are off.']
      ]
    },
    {
      title: 'Email / support',
      intro: 'Customers need a support route and transactional emails need testing.',
      items: [
        ['Support email', !!(settingsForm.support_email || '').trim(), 'Set a customer support email.'],
        ['Email test', true, 'Use Tools → Email test to confirm transactional emails before launch.']
      ]
    },
    {
      title: 'Content / branding',
      intro: 'Check the public homepage and feature modules before sharing the site.',
      items: [
        ['Branding', !!(settingsForm.site_name || '').trim() && !!(settingsForm.hero_title || '').trim(), 'Check site name, homepage title, logo and colours.'],
        ['Homepage content', !!(settingsForm.hero_title || '').trim() && !!(settingsForm.hero_text || '').trim(), 'Homepage title and intro text should be filled in before launch.'],
        ['Top scrolling ticker', !!(settingsForm.welcome_marquee_text || '').trim(), 'Set the editable top ticker text in Site settings.'],
        ['Postcode module checked', true, modulePostcodes ? 'Postcode competitions are enabled.' : 'Postcode module is off; site behaves more like a national competition site.'],
        ['Launch readiness warning', true, 'Admin Overview shows the prototype/payment/security/legal reminder.']
      ]
    }
  ];

  const flatItems = groups.flatMap(group => group.items);
  const okCount = flatItems.filter(([, ok]) => ok).length;
  const warnCount = flatItems.length - okCount;

  return <div className="panel list-panel launch-checklist-panel">
    <div className="draw-room-head">
      <div>
        <h1>Launch checklist</h1>
        <p className="muted">Use this before sending real customers to the site. Review each group in order.</p>
      </div>
      <div className="launch-checklist-score">
        <strong>{okCount}/{flatItems.length}</strong>
        <span>{warnCount} warning(s)</span>
      </div>
    </div>

    <div className="launch-checklist-groups">
      {groups.map(group => <section className="launch-checklist-group" key={group.title}>
        <h2>{group.title}</h2>
        <p className="muted">{group.intro}</p>
        {group.items.map(([title, ok, help]) => <div className="list-row entry-row" key={title}>
          <div><strong>{ok ? '✅' : '⚠️'} {title}</strong><p>{help}</p></div>
        </div>)}
      </section>)}
    </div>
  </div>;
}


function GoogleDriveStatusButton() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [manifestResult, setManifestResult] = useState(null);
  const [uploadsIndexLoading, setUploadsIndexLoading] = useState(false);
  const [uploadsIndexResult, setUploadsIndexResult] = useState(null);
  const [dbSnapshotLoading, setDbSnapshotLoading] = useState(false);
  const [dbSnapshotResult, setDbSnapshotResult] = useState(null);
  const [runSummaryLoading, setRunSummaryLoading] = useState(false);
  const [runSummaryResult, setRunSummaryResult] = useState(null);
  const [uploadsBatchLoading, setUploadsBatchLoading] = useState(false);
  const [uploadsBatchResult, setUploadsBatchResult] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryResult, setInventoryResult] = useState(null);
  const [backupPackLoading, setBackupPackLoading] = useState(false);
  const [backupPackResult, setBackupPackResult] = useState(null);
  const [backupHealthLoading, setBackupHealthLoading] = useState(false);
  const [backupHealthResult, setBackupHealthResult] = useState(null);
  const [latestReportLoading, setLatestReportLoading] = useState(false);
  const [latestReportResult, setLatestReportResult] = useState(null);
  const [restoreReportLoading, setRestoreReportLoading] = useState(false);
  const [restoreReportResult, setRestoreReportResult] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineResult, setTimelineResult] = useState(null);
  const [readinessScoreLoading, setReadinessScoreLoading] = useState(false);
  const [readinessScoreResult, setReadinessScoreResult] = useState(null);
  const [auditReportLoading, setAuditReportLoading] = useState(false);
  const [auditReportResult, setAuditReportResult] = useState(null);
  const [sizeReportLoading, setSizeReportLoading] = useState(false);
  const [sizeReportResult, setSizeReportResult] = useState(null);
  const [retentionReportLoading, setRetentionReportLoading] = useState(false);
  const [retentionReportResult, setRetentionReportResult] = useState(null);
  const [policyReportLoading, setPolicyReportLoading] = useState(false);
  const [policyReportResult, setPolicyReportResult] = useState(null);
  const [verificationMatrixLoading, setVerificationMatrixLoading] = useState(false);
  const [verificationMatrixResult, setVerificationMatrixResult] = useState(null);
  const [restoreDrillLoading, setRestoreDrillLoading] = useState(false);
  const [restoreDrillResult, setRestoreDrillResult] = useState(null);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverResult, setHandoverResult] = useState(null);
  const [schedulePlanLoading, setSchedulePlanLoading] = useState(false);
  const [schedulePlanResult, setSchedulePlanResult] = useState(null);
  const [dumpGuideLoading, setDumpGuideLoading] = useState(false);
  const [dumpGuideResult, setDumpGuideResult] = useState(null);
  const [uploadsPlanLoading, setUploadsPlanLoading] = useState(false);
  const [uploadsPlanResult, setUploadsPlanResult] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState(null);
  const [preflightReportLoading, setPreflightReportLoading] = useState(false);
  const [preflightReportResult, setPreflightReportResult] = useState(null);
  const [truenasRunbookLoading, setTruenasRunbookLoading] = useState(false);
  const [truenasRunbookResult, setTruenasRunbookResult] = useState(null);
  const [rollbackRunbookLoading, setRollbackRunbookLoading] = useState(false);
  const [rollbackRunbookResult, setRollbackRunbookResult] = useState(null);
  const [scheduledReadinessLoading, setScheduledReadinessLoading] = useState(false);
  const [scheduledReadinessResult, setScheduledReadinessResult] = useState(null);
  const [scheduledSpecLoading, setScheduledSpecLoading] = useState(false);
  const [scheduledSpecResult, setScheduledSpecResult] = useState(null);
  const [envChecklistLoading, setEnvChecklistLoading] = useState(false);
  const [envChecklistResult, setEnvChecklistResult] = useState(null);
  const [goNoGoLoading, setGoNoGoLoading] = useState(false);
  const [goNoGoResult, setGoNoGoResult] = useState(null);
  const [error, setError] = useState('');

  async function checkStatus() {
    setLoading(true);
    setError('');
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/status`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Status check failed (${res.status})`);
      setStatus(data);
    } catch (err) {
      setError(err.message || 'Could not check Google Drive status.');
    } finally {
      setLoading(false);
    }
  }

  async function runTestUpload() {
    setTestLoading(true);
    setError('');
    setTestResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/test-upload`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Test upload failed (${res.status})`);
      setTestResult(data);
    } catch (err) {
      setError(err.message || 'Could not run Google Drive test upload.');
    } finally {
      setTestLoading(false);
    }
  }

  async function uploadManifest() {
    setManifestLoading(true);
    setError('');
    setManifestResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/backup-manifest`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Manifest upload failed (${res.status})`);
      setManifestResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload Google Drive backup manifest.');
    } finally {
      setManifestLoading(false);
    }
  }

  async function uploadUploadsIndex() {
    setUploadsIndexLoading(true);
    setError('');
    setUploadsIndexResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/uploads-index`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Uploads index upload failed (${res.status})`);
      setUploadsIndexResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload Google Drive uploads index.');
    } finally {
      setUploadsIndexLoading(false);
    }
  }

  async function uploadDatabaseSnapshot() {
    setDbSnapshotLoading(true);
    setError('');
    setDbSnapshotResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/database-snapshot`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Database snapshot upload failed (${res.status})`);
      setDbSnapshotResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload Google Drive database snapshot.');
    } finally {
      setDbSnapshotLoading(false);
    }
  }

  async function uploadBackupRunSummary() {
    setRunSummaryLoading(true);
    setError('');
    setRunSummaryResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/backup-run-summary`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Backup run summary upload failed (${res.status})`);
      setRunSummaryResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload Google Drive backup run summary.');
    } finally {
      setRunSummaryLoading(false);
    }
  }

  async function uploadUploadsBatch() {
    setUploadsBatchLoading(true);
    setError('');
    setUploadsBatchResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/uploads-batch`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok && !data) throw new Error(`Uploads batch failed (${res.status})`);
      setUploadsBatchResult(data);
      if (!res.ok) throw new Error((data && data.error) || 'Uploads batch completed with errors.');
    } catch (err) {
      setError(err.message || 'Could not upload Google Drive uploads batch.');
    } finally {
      setUploadsBatchLoading(false);
    }
  }

  async function checkFolderInventory() {
    setInventoryLoading(true);
    setError('');
    setInventoryResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/folder-inventory`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Folder inventory failed (${res.status})`);
      setInventoryResult(data);
    } catch (err) {
      setError(err.message || 'Could not check Google Drive folder inventory.');
    } finally {
      setInventoryLoading(false);
    }
  }

  async function uploadBackupPack() {
    setBackupPackLoading(true);
    setError('');
    setBackupPackResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/backup-pack`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Backup pack upload failed (${res.status})`);
      setBackupPackResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload Google Drive backup pack.');
    } finally {
      setBackupPackLoading(false);
    }
  }

  async function checkBackupHealth() {
    setBackupHealthLoading(true);
    setError('');
    setBackupHealthResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/backup-health`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Backup health check failed (${res.status})`);
      setBackupHealthResult(data);
    } catch (err) {
      setError(err.message || 'Could not check Google Drive backup health.');
    } finally {
      setBackupHealthLoading(false);
    }
  }

  async function checkLatestBackupReport() {
    setLatestReportLoading(true);
    setError('');
    setLatestReportResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/latest-backup-report`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Latest backup report failed (${res.status})`);
      setLatestReportResult(data);
    } catch (err) {
      setError(err.message || 'Could not load Google Drive latest backup report.');
    } finally {
      setLatestReportLoading(false);
    }
  }

  async function uploadRestoreCheckReport() {
    setRestoreReportLoading(true);
    setError('');
    setRestoreReportResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/restore-check-report`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Restore check report upload failed (${res.status})`);
      setRestoreReportResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload Google Drive restore check report.');
    } finally {
      setRestoreReportLoading(false);
    }
  }

  async function checkBackupTimeline() {
    setTimelineLoading(true);
    setError('');
    setTimelineResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/backup-timeline`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Backup timeline failed (${res.status})`);
      setTimelineResult(data);
    } catch (err) {
      setError(err.message || 'Could not load Google Drive backup timeline.');
    } finally {
      setTimelineLoading(false);
    }
  }

  async function checkReadinessScore() {
    setReadinessScoreLoading(true);
    setError('');
    setReadinessScoreResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/readiness-score`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Readiness score failed (${res.status})`);
      setReadinessScoreResult(data);
    } catch (err) {
      setError(err.message || 'Could not load Google Drive readiness score.');
    } finally {
      setReadinessScoreLoading(false);
    }
  }

  async function uploadBackupAuditReport() {
    setAuditReportLoading(true);
    setError('');
    setAuditReportResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/backup-audit-report`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Backup audit report upload failed (${res.status})`);
      setAuditReportResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload Google Drive backup audit report.');
    } finally {
      setAuditReportLoading(false);
    }
  }

  async function checkBackupSizeReport() {
    setSizeReportLoading(true);
    setError('');
    setSizeReportResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/backup-size-report`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Backup size report failed (${res.status})`);
      setSizeReportResult(data);
    } catch (err) {
      setError(err.message || 'Could not load Google Drive backup size report.');
    } finally {
      setSizeReportLoading(false);
    }
  }

  async function checkRetentionReport() {
    setRetentionReportLoading(true);
    setError('');
    setRetentionReportResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/retention-report`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Retention report failed (${res.status})`);
      setRetentionReportResult(data);
    } catch (err) {
      setError(err.message || 'Could not load Google Drive retention report.');
    } finally {
      setRetentionReportLoading(false);
    }
  }

  async function uploadRetentionPolicyReport() {
    setPolicyReportLoading(true);
    setError('');
    setPolicyReportResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/retention-policy-report`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Retention policy report upload failed (${res.status})`);
      setPolicyReportResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload Google Drive retention policy report.');
    } finally {
      setPolicyReportLoading(false);
    }
  }

  async function checkVerificationMatrix() {
    setVerificationMatrixLoading(true);
    setError('');
    setVerificationMatrixResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/verification-matrix`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Verification matrix failed (${res.status})`);
      setVerificationMatrixResult(data);
    } catch (err) {
      setError(err.message || 'Could not load Google Drive verification matrix.');
    } finally {
      setVerificationMatrixLoading(false);
    }
  }

  async function uploadRestoreDrillEvidence() {
    setRestoreDrillLoading(true);
    setError('');
    setRestoreDrillResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/restore-drill-evidence`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Restore drill evidence upload failed (${res.status})`);
      setRestoreDrillResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload Google Drive restore drill evidence.');
    } finally {
      setRestoreDrillLoading(false);
    }
  }

  async function uploadOperatorHandover() {
    setHandoverLoading(true);
    setError('');
    setHandoverResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/operator-handover-report`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Operator handover upload failed (${res.status})`);
      setHandoverResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload Google Drive operator handover report.');
    } finally {
      setHandoverLoading(false);
    }
  }

  async function checkSchedulePlan() {
    setSchedulePlanLoading(true);
    setError('');
    setSchedulePlanResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/backup-schedule-plan`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Schedule plan failed (${res.status})`);
      setSchedulePlanResult(data);
    } catch (err) {
      setError(err.message || 'Could not load backup schedule plan.');
    } finally {
      setSchedulePlanLoading(false);
    }
  }

  async function uploadDatabaseDumpGuide() {
    setDumpGuideLoading(true);
    setError('');
    setDumpGuideResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/database-dump-guide`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Database dump guide upload failed (${res.status})`);
      setDumpGuideResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload database dump guide.');
    } finally {
      setDumpGuideLoading(false);
    }
  }

  async function uploadUploadsBackupPlan() {
    setUploadsPlanLoading(true);
    setError('');
    setUploadsPlanResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/uploads-backup-plan`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Uploads backup plan upload failed (${res.status})`);
      setUploadsPlanResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload uploads backup plan.');
    } finally {
      setUploadsPlanLoading(false);
    }
  }

  async function checkBackupPreflight() {
    setPreflightLoading(true);
    setError('');
    setPreflightResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/backup-preflight`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Backup preflight failed (${res.status})`);
      setPreflightResult(data);
    } catch (err) {
      setError(err.message || 'Could not run backup preflight.');
    } finally {
      setPreflightLoading(false);
    }
  }

  async function uploadBackupPreflightReport() {
    setPreflightReportLoading(true);
    setError('');
    setPreflightReportResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/backup-preflight-report`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Backup preflight report upload failed (${res.status})`);
      setPreflightReportResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload backup preflight report.');
    } finally {
      setPreflightReportLoading(false);
    }
  }

  async function uploadTrueNasRunbook() {
    setTruenasRunbookLoading(true);
    setError('');
    setTruenasRunbookResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/truenas-backup-runbook`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `TrueNAS backup runbook upload failed (${res.status})`);
      setTruenasRunbookResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload TrueNAS backup runbook.');
    } finally {
      setTruenasRunbookLoading(false);
    }
  }

  async function uploadEmergencyRollbackRunbook() {
    setRollbackRunbookLoading(true);
    setError('');
    setRollbackRunbookResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/emergency-rollback-runbook`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Emergency rollback runbook upload failed (${res.status})`);
      setRollbackRunbookResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload emergency rollback runbook.');
    } finally {
      setRollbackRunbookLoading(false);
    }
  }

  async function checkScheduledBackupReadiness() {
    setScheduledReadinessLoading(true);
    setError('');
    setScheduledReadinessResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/scheduled-backup-readiness`, { headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Scheduled backup readiness failed (${res.status})`);
      setScheduledReadinessResult(data);
    } catch (err) {
      setError(err.message || 'Could not check scheduled backup readiness.');
    } finally {
      setScheduledReadinessLoading(false);
    }
  }

  async function uploadScheduledBackupSpec() {
    setScheduledSpecLoading(true);
    setError('');
    setScheduledSpecResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/scheduled-backup-spec`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Scheduled backup spec upload failed (${res.status})`);
      setScheduledSpecResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload scheduled backup spec.');
    } finally {
      setScheduledSpecLoading(false);
    }
  }

  async function uploadEnvironmentChecklist() {
    setEnvChecklistLoading(true);
    setError('');
    setEnvChecklistResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/environment-checklist-report`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Environment checklist upload failed (${res.status})`);
      setEnvChecklistResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload environment checklist.');
    } finally {
      setEnvChecklistLoading(false);
    }
  }

  async function uploadLaunchGoNoGo() {
    setGoNoGoLoading(true);
    setError('');
    setGoNoGoResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${apiBase}/admin/google-drive/launch-go-no-go-report`, { method: 'POST', headers });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || `Launch go/no-go upload failed (${res.status})`);
      setGoNoGoResult(data);
    } catch (err) {
      setError(err.message || 'Could not upload launch go/no-go report.');
    } finally {
      setGoNoGoLoading(false);
    }
  }

  return <div className="backup-manual-notes">
    <h2>Google Drive live status</h2>
    <p className="muted">Check whether the API can see the Google Drive folder and credentials environment settings. Secret values are never shown.</p>
    <div className="backup-notes-grid">
      <article><strong>Recommended fast path</strong><p>1. Status → 2. Preflight → 3. Backup pack → 4. Go/no-go.</p></article>
      <article><strong>Daily quick check</strong><p>Status, latest report, readiness score, then daily ops checklist if needed.</p></article>
      <article><strong>Before risky changes</strong><p>Upload backup pack, preflight report, audit report and rollback runbook.</p></article>
      <article><strong>Advanced reports</strong><p>Use the extra report buttons for evidence, handover and launch paperwork only.</p></article>
    </div>
    <div className="admin-actions">
      <span className="backup-tool-section">1. Quick checks</span>
      <button type="button" onClick={checkStatus} disabled={loading}>{loading ? 'Checking...' : 'Check Google Drive status'}</button>
      <button type="button" onClick={runTestUpload} disabled={testLoading}>{testLoading ? 'Uploading...' : 'Run test upload'}</button>
      <button type="button" onClick={uploadManifest} disabled={manifestLoading}>{manifestLoading ? 'Uploading manifest...' : 'Upload backup manifest'}</button>
      <button type="button" onClick={uploadUploadsIndex} disabled={uploadsIndexLoading}>{uploadsIndexLoading ? 'Uploading index...' : 'Upload uploads index'}</button>
      <button type="button" onClick={uploadDatabaseSnapshot} disabled={dbSnapshotLoading}>{dbSnapshotLoading ? 'Uploading DB snapshot...' : 'Upload DB snapshot'}</button>
      <button type="button" onClick={uploadBackupRunSummary} disabled={runSummaryLoading}>{runSummaryLoading ? 'Uploading summary...' : 'Upload run summary'}</button>
      <button type="button" onClick={uploadUploadsBatch} disabled={uploadsBatchLoading}>{uploadsBatchLoading ? 'Uploading files...' : 'Upload uploads batch'}</button>
      <button type="button" onClick={checkFolderInventory} disabled={inventoryLoading}>{inventoryLoading ? 'Checking folder...' : 'Check Drive folder inventory'}</button>
      <span className="backup-tool-section">2. Core evidence uploads</span>
      <button type="button" onClick={uploadBackupPack} disabled={backupPackLoading}>{backupPackLoading ? 'Uploading pack...' : 'Upload backup pack'}</button>
      <button type="button" onClick={checkBackupHealth} disabled={backupHealthLoading}>{backupHealthLoading ? 'Checking health...' : 'Check backup health'}</button>
      <button type="button" onClick={checkLatestBackupReport} disabled={latestReportLoading}>{latestReportLoading ? 'Loading report...' : 'Check latest backup report'}</button>
      <button type="button" onClick={uploadRestoreCheckReport} disabled={restoreReportLoading}>{restoreReportLoading ? 'Uploading restore report...' : 'Upload restore check report'}</button>
      <button type="button" onClick={checkBackupTimeline} disabled={timelineLoading}>{timelineLoading ? 'Loading timeline...' : 'Check backup timeline'}</button>
      <button type="button" onClick={checkReadinessScore} disabled={readinessScoreLoading}>{readinessScoreLoading ? 'Scoring...' : 'Check readiness score'}</button>
      <button type="button" onClick={uploadBackupAuditReport} disabled={auditReportLoading}>{auditReportLoading ? 'Uploading audit...' : 'Upload audit report'}</button>
      <button type="button" onClick={checkBackupSizeReport} disabled={sizeReportLoading}>{sizeReportLoading ? 'Calculating size...' : 'Check backup size report'}</button>
      <button type="button" onClick={checkRetentionReport} disabled={retentionReportLoading}>{retentionReportLoading ? 'Checking retention...' : 'Check retention report'}</button>
      <button type="button" onClick={uploadRetentionPolicyReport} disabled={policyReportLoading}>{policyReportLoading ? 'Uploading policy...' : 'Upload retention policy report'}</button>
      <button type="button" onClick={checkVerificationMatrix} disabled={verificationMatrixLoading}>{verificationMatrixLoading ? 'Checking matrix...' : 'Check verification matrix'}</button>
      <span className="backup-tool-section">3. Restore / handover evidence</span>
      <button type="button" onClick={uploadRestoreDrillEvidence} disabled={restoreDrillLoading}>{restoreDrillLoading ? 'Uploading drill...' : 'Upload restore drill evidence'}</button>
      <button type="button" onClick={uploadOperatorHandover} disabled={handoverLoading}>{handoverLoading ? 'Uploading handover...' : 'Upload operator handover'}</button>
      <span className="backup-tool-section">4. Planning / runbooks</span>
      <button type="button" onClick={checkSchedulePlan} disabled={schedulePlanLoading}>{schedulePlanLoading ? 'Planning schedule...' : 'Check backup schedule plan'}</button>
      <button type="button" onClick={uploadDatabaseDumpGuide} disabled={dumpGuideLoading}>{dumpGuideLoading ? 'Uploading guide...' : 'Upload DB dump guide'}</button>
      <button type="button" onClick={uploadUploadsBackupPlan} disabled={uploadsPlanLoading}>{uploadsPlanLoading ? 'Uploading uploads plan...' : 'Upload uploads backup plan'}</button>
      <button type="button" onClick={checkBackupPreflight} disabled={preflightLoading}>{preflightLoading ? 'Running preflight...' : 'Check backup preflight'}</button>
      <button type="button" onClick={uploadBackupPreflightReport} disabled={preflightReportLoading}>{preflightReportLoading ? 'Uploading preflight...' : 'Upload preflight report'}</button>
      <button type="button" onClick={uploadTrueNasRunbook} disabled={truenasRunbookLoading}>{truenasRunbookLoading ? 'Uploading TrueNAS runbook...' : 'Upload TrueNAS runbook'}</button>
      <button type="button" onClick={uploadEmergencyRollbackRunbook} disabled={rollbackRunbookLoading}>{rollbackRunbookLoading ? 'Uploading rollback...' : 'Upload rollback runbook'}</button>
      <span className="backup-tool-section">5. Launch gate</span>
      <button type="button" onClick={checkScheduledBackupReadiness} disabled={scheduledReadinessLoading}>{scheduledReadinessLoading ? 'Checking scheduler...' : 'Check scheduled backup readiness'}</button>
      <button type="button" onClick={uploadScheduledBackupSpec} disabled={scheduledSpecLoading}>{scheduledSpecLoading ? 'Uploading spec...' : 'Upload scheduled backup spec'}</button>
      <button type="button" onClick={uploadEnvironmentChecklist} disabled={envChecklistLoading}>{envChecklistLoading ? 'Uploading checklist...' : 'Upload environment checklist'}</button>
      <button type="button" onClick={uploadLaunchGoNoGo} disabled={goNoGoLoading}>{goNoGoLoading ? 'Uploading decision...' : 'Upload launch go/no-go report'}</button>
    </div>
    <p className="muted">Most days you only need the first section. Use evidence uploads before risky changes, and use launch-gate reports before public launch or major releases.</p>
    <p className="admin-nav-polish-note">Buttons are now grouped into sections. Start at the top, then only use the advanced/report buttons when you need proof, handover notes or launch paperwork.</p>
    {error && <p className="notice error">{error}</p>}
    {status && <div className="backup-notes-grid">
      <article><strong>Overall</strong><p>{status.configured ? 'Configured' : 'Not fully configured yet'}</p></article>
      <article><strong>Folder ID</strong><p>{status.folder_id_configured ? 'Configured' : 'Missing'}</p></article>
      <article><strong>Credentials</strong><p>{status.credentials_configured ? 'Configured' : 'Missing'}</p></article>
      <article><strong>Credential source</strong><p>{status.credential_source || 'Not set'}</p></article>
    </div>}
    {testResult && <div className="backup-notes-grid">
      <article><strong>Test upload</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{testResult.file?.name || 'Created test file'}</p></article>
      <article><strong>Drive file ID</strong><p>{testResult.file?.id || 'Not returned'}</p></article>
      <article><strong>Next step</strong><p>Confirm the file appears in Google Drive, then delete the test file if you do not need it.</p></article>
    </div>}
    {manifestResult && <div className="backup-notes-grid">
      <article><strong>Backup manifest</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{manifestResult.file?.name || 'Created manifest file'}</p></article>
      <article><strong>Drive file ID</strong><p>{manifestResult.file?.id || 'Not returned'}</p></article>
      <article><strong>Counts</strong><p>{Object.entries(manifestResult.manifest?.counts || {}).map(([k, v]) => `${k}: ${v ?? 'unknown'}`).join(', ') || 'No counts returned'}</p></article>
    </div>}
    {uploadsIndexResult && <div className="backup-notes-grid">
      <article><strong>Uploads index</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{uploadsIndexResult.file?.name || 'Created uploads index'}</p></article>
      <article><strong>Files recorded</strong><p>{uploadsIndexResult.file_count ?? 0}</p></article>
      <article><strong>Total size</strong><p>{uploadsIndexResult.total_bytes ?? 0} bytes</p></article>
    </div>}
    {dbSnapshotResult && <div className="backup-notes-grid">
      <article><strong>Database snapshot</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{dbSnapshotResult.file?.name || 'Created database snapshot'}</p></article>
      <article><strong>Tables exported</strong><p>{dbSnapshotResult.table_count ?? 0}</p></article>
      <article><strong>Drive file ID</strong><p>{dbSnapshotResult.file?.id || 'Not returned'}</p></article>
    </div>}
    {runSummaryResult && <div className="backup-notes-grid">
      <article><strong>Run summary</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{runSummaryResult.file?.name || 'Created backup run summary'}</p></article>
      <article><strong>Tables counted</strong><p>{runSummaryResult.table_count ?? 0}</p></article>
      <article><strong>Uploads counted</strong><p>{runSummaryResult.upload_file_count ?? 0}</p></article>
    </div>}
    {uploadsBatchResult && <div className="backup-notes-grid">
      <article><strong>Uploads batch</strong><p>{uploadsBatchResult.failed_count ? 'Completed with errors' : 'Uploaded successfully'}</p></article>
      <article><strong>Uploaded</strong><p>{uploadsBatchResult.uploaded_count ?? 0} files</p></article>
      <article><strong>Failed</strong><p>{uploadsBatchResult.failed_count ?? 0} files</p></article>
      <article><strong>Skipped</strong><p>{uploadsBatchResult.skipped_count ?? 0} files</p></article>
    </div>}
    {inventoryResult && <div className="backup-notes-grid">
      <article><strong>Drive inventory</strong><p>Loaded successfully</p></article>
      <article><strong>Files shown</strong><p>{inventoryResult.file_count_returned ?? 0}</p></article>
      <article><strong>Latest file</strong><p>{inventoryResult.files?.[0]?.name || 'No files returned'}</p></article>
      <article><strong>Folder</strong><p>{inventoryResult.folder_id_configured ? 'Configured' : 'Missing'}</p></article>
    </div>}
    {backupPackResult && <div className="backup-notes-grid">
      <article><strong>Backup pack</strong><p>Uploaded successfully</p></article>
      <article><strong>Files uploaded</strong><p>{backupPackResult.uploaded_count ?? 0}</p></article>
      <article><strong>Tables counted</strong><p>{backupPackResult.table_count ?? 0}</p></article>
      <article><strong>Uploads counted</strong><p>{backupPackResult.upload_file_count ?? 0}</p></article>
    </div>}
    {backupHealthResult && <div className="backup-notes-grid">
      <article><strong>Backup health</strong><p>{backupHealthResult.ok ? 'Looks good' : 'Needs attention'}</p></article>
      <article><strong>Files checked</strong><p>{backupHealthResult.file_count_checked ?? 0}</p></article>
      <article><strong>Missing types</strong><p>{(backupHealthResult.missing_types || []).join(', ') || 'None'}</p></article>
      <article><strong>Latest file</strong><p>{backupHealthResult.latest_file?.name || 'No file returned'}</p></article>
    </div>}
    {latestReportResult && <div className="backup-notes-grid">
      <article><strong>Latest report</strong><p>{latestReportResult.report?.ready ? 'Looks ready' : 'Needs attention'}</p></article>
      <article><strong>Files checked</strong><p>{latestReportResult.report?.file_count_checked ?? 0}</p></article>
      <article><strong>Missing types</strong><p>{(latestReportResult.report?.missing_types || []).join(', ') || 'None'}</p></article>
      <article><strong>Latest file</strong><p>{latestReportResult.report?.latest_file?.name || 'No file returned'}</p></article>
    </div>}
    {restoreReportResult && <div className="backup-notes-grid">
      <article><strong>Restore report</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{restoreReportResult.file?.name || 'Created restore report'}</p></article>
      <article><strong>Ready</strong><p>{restoreReportResult.ready ? 'Yes' : 'Needs attention'}</p></article>
      <article><strong>Local uploads</strong><p>{restoreReportResult.local_upload_file_count ?? 0} files</p></article>
    </div>}
    {timelineResult && <div className="backup-notes-grid">
      <article><strong>Backup timeline</strong><p>Loaded successfully</p></article>
      <article><strong>Files listed</strong><p>{timelineResult.file_count ?? 0}</p></article>
      <article><strong>Latest type counts</strong><p>{Object.entries(timelineResult.by_type || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None'}</p></article>
      <article><strong>Latest file</strong><p>{timelineResult.timeline?.[0]?.name || 'No file returned'}</p></article>
    </div>}
    {readinessScoreResult && <div className="backup-notes-grid">
      <article><strong>Readiness score</strong><p>{readinessScoreResult.readiness?.score ?? 0}/100</p></article>
      <article><strong>Status</strong><p>{readinessScoreResult.readiness?.status || 'Unknown'}</p></article>
      <article><strong>Missing types</strong><p>{(readinessScoreResult.readiness?.missing_types || []).join(', ') || 'None'}</p></article>
      <article><strong>Local uploads</strong><p>{readinessScoreResult.readiness?.upload_file_count ?? 0} files</p></article>
    </div>}
    {auditReportResult && <div className="backup-notes-grid">
      <article><strong>Audit report</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{auditReportResult.file?.name || 'Created audit report'}</p></article>
      <article><strong>Score</strong><p>{auditReportResult.readiness?.score ?? 0}/100</p></article>
      <article><strong>Timeline files</strong><p>{auditReportResult.timeline_count ?? 0}</p></article>
    </div>}
    {sizeReportResult && <div className="backup-notes-grid">
      <article><strong>Size report</strong><p>Loaded successfully</p></article>
      <article><strong>Files counted</strong><p>{sizeReportResult.report?.file_count ?? 0}</p></article>
      <article><strong>Total size</strong><p>{sizeReportResult.report?.total_bytes ?? 0} bytes</p></article>
      <article><strong>Largest file</strong><p>{sizeReportResult.report?.largest_files?.[0]?.name || 'No file returned'}</p></article>
    </div>}
    {retentionReportResult && <div className="backup-notes-grid">
      <article><strong>Retention report</strong><p>Review only</p></article>
      <article><strong>Files checked</strong><p>{retentionReportResult.report?.file_count_checked ?? 0}</p></article>
      <article><strong>Old candidates</strong><p>{retentionReportResult.report?.old_candidate_count ?? 0}</p></article>
      <article><strong>Policy</strong><p>{retentionReportResult.report?.retention_days ?? 30} days, keep {retentionReportResult.report?.keep_recent_per_type ?? 5} per type</p></article>
    </div>}
    {policyReportResult && <div className="backup-notes-grid">
      <article><strong>Policy report</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{policyReportResult.file?.name || 'Created policy report'}</p></article>
      <article><strong>Total size</strong><p>{policyReportResult.total_bytes ?? 0} bytes</p></article>
      <article><strong>Review candidates</strong><p>{policyReportResult.old_candidate_count ?? 0}</p></article>
    </div>}
    {verificationMatrixResult && <div className="backup-notes-grid">
      <article><strong>Verification matrix</strong><p>Loaded successfully</p></article>
      <article><strong>Items</strong><p>{verificationMatrixResult.matrix?.length ?? 0}</p></article>
      <article><strong>Score</strong><p>{verificationMatrixResult.readiness?.score ?? 0}/100</p></article>
      <article><strong>Warnings</strong><p>{(verificationMatrixResult.matrix || []).filter((item) => item.status !== 'ok').length}</p></article>
    </div>}
    {restoreDrillResult && <div className="backup-notes-grid">
      <article><strong>Restore drill</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{restoreDrillResult.file?.name || 'Created restore drill evidence'}</p></article>
      <article><strong>Score</strong><p>{restoreDrillResult.readiness?.score ?? 0}/100</p></article>
      <article><strong>Matrix items</strong><p>{restoreDrillResult.matrix_items ?? 0}</p></article>
    </div>}
    {handoverResult && <div className="backup-notes-grid">
      <article><strong>Operator handover</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{handoverResult.file?.name || 'Created handover report'}</p></article>
      <article><strong>Score</strong><p>{handoverResult.readiness?.score ?? 0}/100</p></article>
      <article><strong>Next</strong><p>Share this with the admin/operator who may need to restore or maintain the app.</p></article>
    </div>}
    {schedulePlanResult && <div className="backup-notes-grid">
      <article><strong>Schedule plan</strong><p>{schedulePlanResult.plan?.mode || 'Loaded'}</p></article>
      <article><strong>Score</strong><p>{schedulePlanResult.readiness?.score ?? 0}/100</p></article>
      <article><strong>Cadences</strong><p>{schedulePlanResult.plan?.recommended_schedule?.length ?? 0}</p></article>
      <article><strong>Warnings</strong><p>{(schedulePlanResult.plan?.warnings || []).join(' ') || 'None'}</p></article>
    </div>}
    {dumpGuideResult && <div className="backup-notes-grid">
      <article><strong>DB dump guide</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{dumpGuideResult.file?.name || 'Created guide'}</p></article>
      <article><strong>Action</strong><p>Use on TrueNAS/db container context</p></article>
      <article><strong>Note</strong><p>Guide only, does not run pg_dump</p></article>
    </div>}
    {uploadsPlanResult && <div className="backup-notes-grid">
      <article><strong>Uploads plan</strong><p>Uploaded successfully</p></article>
      <article><strong>Files counted</strong><p>{uploadsPlanResult.upload_file_count ?? 0}</p></article>
      <article><strong>Total bytes</strong><p>{uploadsPlanResult.total_upload_bytes ?? 0}</p></article>
      <article><strong>Batch size</strong><p>{uploadsPlanResult.suggested_batch_size ?? 10}</p></article>
    </div>}
    {preflightResult && <div className="backup-notes-grid">
      <article><strong>Preflight</strong><p>{preflightResult.preflight?.ready ? 'Ready' : 'Needs attention'}</p></article>
      <article><strong>Failed checks</strong><p>{preflightResult.preflight?.failed_count ?? 0}</p></article>
      <article><strong>Score</strong><p>{preflightResult.readiness?.score ?? 0}/100</p></article>
      <article><strong>Checks</strong><p>{preflightResult.preflight?.checks?.length ?? 0}</p></article>
    </div>}
    {preflightReportResult && <div className="backup-notes-grid">
      <article><strong>Preflight report</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{preflightReportResult.file?.name || 'Created preflight report'}</p></article>
      <article><strong>Ready</strong><p>{preflightReportResult.ready ? 'Yes' : 'Needs attention'}</p></article>
      <article><strong>Failed checks</strong><p>{preflightReportResult.failed_count ?? 0}</p></article>
    </div>}
    {truenasRunbookResult && <div className="backup-notes-grid">
      <article><strong>TrueNAS runbook</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{truenasRunbookResult.file?.name || 'Created TrueNAS runbook'}</p></article>
      <article><strong>Score</strong><p>{truenasRunbookResult.readiness?.score ?? 0}/100</p></article>
      <article><strong>Use</strong><p>Keep with backup/operator docs</p></article>
    </div>}
    {rollbackRunbookResult && <div className="backup-notes-grid">
      <article><strong>Rollback runbook</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{rollbackRunbookResult.file?.name || 'Created rollback runbook'}</p></article>
      <article><strong>Score</strong><p>{rollbackRunbookResult.readiness?.score ?? 0}/100</p></article>
      <article><strong>Use</strong><p>Use during outage/change rollback</p></article>
    </div>}
    {scheduledReadinessResult && <div className="backup-notes-grid">
      <article><strong>Scheduled readiness</strong><p>{scheduledReadinessResult.scheduled_readiness?.ready_for_scheduler_setup ? 'Ready for setup' : 'Needs attention'}</p></article>
      <article><strong>Blocking</strong><p>{scheduledReadinessResult.scheduled_readiness?.blocking_count ?? 0}</p></article>
      <article><strong>Score</strong><p>{scheduledReadinessResult.readiness?.score ?? 0}/100</p></article>
      <article><strong>Next</strong><p>{scheduledReadinessResult.scheduled_readiness?.suggested_next_step || 'Review scheduler setup'}</p></article>
    </div>}
    {scheduledSpecResult && <div className="backup-notes-grid">
      <article><strong>Scheduled spec</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{scheduledSpecResult.file?.name || 'Created scheduled spec'}</p></article>
      <article><strong>Jobs</strong><p>{scheduledSpecResult.job_count ?? 0}</p></article>
      <article><strong>Score</strong><p>{scheduledSpecResult.readiness?.score ?? 0}/100</p></article>
    </div>}
    {envChecklistResult && <div className="backup-notes-grid">
      <article><strong>Environment checklist</strong><p>Uploaded successfully</p></article>
      <article><strong>File name</strong><p>{envChecklistResult.file?.name || 'Created checklist'}</p></article>
      <article><strong>Checks</strong><p>{envChecklistResult.check_count ?? 0}</p></article>
      <article><strong>Failed</strong><p>{envChecklistResult.failed_count ?? 0}</p></article>
    </div>}
    {goNoGoResult && <div className="backup-notes-grid">
      <article><strong>Launch decision</strong><p>{goNoGoResult.decision || 'Created'}</p></article>
      <article><strong>File name</strong><p>{goNoGoResult.file?.name || 'Created go/no-go report'}</p></article>
      <article><strong>Required items</strong><p>{goNoGoResult.required_count ?? 0}</p></article>
      <article><strong>Score</strong><p>{goNoGoResult.readiness?.score ?? 0}/100</p></article>
    </div>}
  </div>;
}

function BackupReadinessPanel() {
  const checks = [
    ['TrueNAS local snapshot', false, 'Set up a local TrueNAS snapshot or backup for the Prizetown app dataset before launch.'],
    ['PostgreSQL database dump', false, 'Schedule a regular pg_dump of the Prizetown database so orders, entries, winners and settings can be restored.'],
    ['Uploads folder backup', false, 'Include uploaded images/files from the uploads volume in the backup plan.'],
    ['Google Drive off-site copy', false, 'Copy database dumps, uploads backup and release notes to Google Drive or another off-site location.'],
    ['Compose/YAML saved', false, 'Keep the current compose/YAML, image tags and important environment notes with the backup set.'],
    ['Restore test completed', false, 'Test restoring to a safe temporary location before trusting backups for real-money launch.'],
    ['Before-payment backup', false, 'Take a fresh backup before enabling any real payment provider or running paid public competitions.']
  ];

  return <div className="panel list-panel backup-readiness-panel">
    <div className="draw-room-head">
      <div>
        <h1>Backup Readiness</h1>
        <p className="muted">Use this to plan safe Prizetown backups. This panel is a checklist only and does not create backups yet.</p>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Backup recovery flow</h2>
      <p className="muted">Use this simple order before risky updates, rollbacks or restore checks.</p>
      <div className="backup-notes-grid">
        <article><strong>Before changes</strong><p>Confirm the latest known good app version, database backup location and upload folder path before risky updates.</p></article>
        <article><strong>If something breaks</strong><p>Rollback to the last stable fixed image tags first, then check API health and System check before making more changes.</p></article>
        <article><strong>After recovery</strong><p>Check public homepage, checkout, Orders, Winners, Support and Audit log so the site is safe for visitors again.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Rollback checklist</h2>
      <p className="muted">Use this when a new deploy, setting change or restore attempt causes problems.</p>
      <div className="backup-notes-grid">
        <article><strong>1. Pause changes</strong><p>Stop applying new patches until the current issue is understood.</p></article>
        <article><strong>2. Use fixed tags</strong><p>Switch TrueNAS back to the last confirmed stable API and web image tags.</p></article>
        <article><strong>3. Check health</strong><p>Run the API health check, then open System check in admin.</p></article>
        <article><strong>4. Check data</strong><p>Confirm competitions, orders, entries, winners and uploads still appear.</p></article>
        <article><strong>5. Record outcome</strong><p>Write down which version was rolled back from, which version restored service, and what still needs fixing.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Backup evidence checklist</h2>
      <p className="muted">Use this to record proof that a backup exists before risky updates or public launch changes.</p>
      <div className="backup-notes-grid">
        <article><strong>Stable image tags</strong><p>Write down the current working API and web image tags before changing TrueNAS.</p></article>
        <article><strong>Database dump</strong><p>Record the database backup filename, location and the time it was created.</p></article>
        <article><strong>Uploads folder</strong><p>Confirm the uploads folder path and where the copy or snapshot is stored.</p></article>
        <article><strong>Compose/YAML copy</strong><p>Save the exact TrueNAS app YAML or compose settings used by the stable version.</p></article>
        <article><strong>Restore proof</strong><p>After a restore test, note the health result and whether competitions, orders, entries, winners and uploads loaded correctly.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Restore drill checklist</h2>
      <p className="muted">Use this for a planned test restore. Do not run a restore on the live app until the backup evidence is recorded.</p>
      <div className="backup-notes-grid">
        <article><strong>1. Pick test window</strong><p>Choose a quiet time and tell admins not to make changes during the drill.</p></article>
        <article><strong>2. Confirm rollback tags</strong><p>Write down the current stable API and web tags before touching TrueNAS settings.</p></article>
        <article><strong>3. Verify backup files</strong><p>Check the database dump, uploads copy and YAML/compose copy are all present.</p></article>
        <article><strong>4. Restore in a safe place</strong><p>Prefer a test app, clone or isolated database before trying anything on live production data.</p></article>
        <article><strong>5. Check core screens</strong><p>Open Admin, Competitions, Orders, Entries, Winners, uploads/images and API health.</p></article>
        <article><strong>6. Record result</strong><p>Write down what worked, what failed, how long it took and what needs fixing before launch.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Backup schedule guide</h2>
      <p className="muted">Use this as a simple rhythm for keeping Prizetown recoverable. This is guidance only and does not run backups automatically yet.</p>
      <div className="backup-notes-grid">
        <article><strong>Daily</strong><p>Back up the PostgreSQL database and keep at least the latest few days available.</p></article>
        <article><strong>Weekly</strong><p>Copy uploads/images and save a fresh TrueNAS app YAML or compose record.</p></article>
        <article><strong>Before updates</strong><p>Record stable image tags, create a DB backup and confirm the uploads folder path before applying patches.</p></article>
        <article><strong>Before launch</strong><p>Do a restore drill, confirm off-site backup exists and record the last successful health check.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Backup command notes</h2>
      <p className="muted">Use these notes as a quick copy/check list before a risky update. They are reminders only and do not run commands.</p>
      <div className="backup-notes-grid">
        <article><strong>Health check</strong><p>Record the current API health version before changing image tags.</p></article>
        <article><strong>TrueNAS image tags</strong><p>Write down the exact API and web image tags currently deployed.</p></article>
        <article><strong>Database location</strong><p>Record the PostgreSQL data path or backup dump location used by the app.</p></article>
        <article><strong>Uploads location</strong><p>Record the uploads volume path so competition images and attachments are not missed.</p></article>
        <article><strong>YAML/compose copy</strong><p>Save the current TrueNAS custom app YAML or compose settings before editing them.</p></article>
        <article><strong>After update</strong><p>Record the new health version, then check admin pages, public homepage, orders, entries and winners.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Backup readiness summary</h2>
      <p className="muted">Before risky updates, these five things should be true.</p>
      <div className="backup-notes-grid">
        <article><strong>Stable version known</strong><p>The current working API and web tags are written down.</p></article>
        <article><strong>Database protected</strong><p>A recent database backup or dump exists and its location is recorded.</p></article>
        <article><strong>Uploads protected</strong><p>The uploads/images folder path is known and copied or snapshotted.</p></article>
        <article><strong>Config protected</strong><p>The current TrueNAS YAML or compose settings are saved somewhere safe.</p></article>
        <article><strong>Rollback route known</strong><p>You know which tags to restore and which checks prove the app is healthy again.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Backup emergency notes</h2>
      <p className="muted">Keep these details written down outside the app as well, so you still have them if the site is unavailable.</p>
      <div className="backup-notes-grid">
        <article><strong>Owner/contact</strong><p>Record who can access TrueNAS, GitHub, domain/DNS and the database backup location.</p></article>
        <article><strong>Last stable tags</strong><p>Write down the latest confirmed working API and web image tags after each good deploy.</p></article>
        <article><strong>Backup locations</strong><p>Record where database dumps, uploads copies, snapshots and YAML/compose files are stored.</p></article>
        <article><strong>Emergency decision</strong><p>If a deploy breaks public pages, stop changes, restore fixed tags first, then investigate after service is back.</p></article>
        <article><strong>Proof after restore</strong><p>Confirm health, admin login, competitions, orders, entries, winners and images before calling it recovered.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Backup launch gate</h2>
      <p className="muted">Use this as a final yes/no backup check before public launch, heavy traffic or real-payment changes.</p>
      <div className="backup-notes-grid">
        <article><strong>Can we restore?</strong><p>A restore drill has been completed or a safe rollback route is documented.</p></article>
        <article><strong>Do we know stable tags?</strong><p>The last confirmed API and web image tags are recorded outside the app.</p></article>
        <article><strong>Is data protected?</strong><p>Database backup and uploads backup locations are known and recently checked.</p></article>
        <article><strong>Is config protected?</strong><p>TrueNAS YAML/compose, domain/DNS notes and environment settings are saved.</p></article>
        <article><strong>Is the decision clear?</strong><p>If any answer is no, pause launch/update until the missing backup proof is fixed.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Backup do and do not</h2>
      <p className="muted">Simple safety rules for updates, restores and public-launch changes.</p>
      <div className="backup-notes-grid">
        <article><strong>Do: save stable tags</strong><p>Record the currently working API and web tags before changing TrueNAS.</p></article>
        <article><strong>Do: protect data first</strong><p>Confirm database and uploads backups exist before risky patches or setting changes.</p></article>
        <article><strong>Do: test after deploy</strong><p>Check health, admin login, public homepage, competitions, orders, entries, winners and images.</p></article>
        <article><strong>Do not: use latest</strong><p>Never switch production images to latest. Keep fixed version tags only.</p></article>
        <article><strong>Do not: keep patching a broken deploy</strong><p>If public pages break, rollback first, then investigate from a stable state.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Backup export reminder</h2>
      <p className="muted">Before major updates, copy these details into an outside note, password manager, shared admin document or printed launch folder.</p>
      <div className="backup-notes-grid">
        <article><strong>Current version</strong><p>API tag, web tag, health output and deploy date.</p></article>
        <article><strong>Data backup</strong><p>Database dump/snapshot name, path, time created and who checked it.</p></article>
        <article><strong>Uploads backup</strong><p>Uploads path, copy/snapshot location and last checked time.</p></article>
        <article><strong>App config</strong><p>TrueNAS YAML/compose, env notes, domain/DNS notes and any rollback instructions.</p></article>
        <article><strong>Final sign-off</strong><p>Write who approved the update and what screens were checked after deploy.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>After restore checks</h2>
      <p className="muted">Use this immediately after a restore, rollback or emergency tag change.</p>
      <div className="backup-notes-grid">
        <article><strong>API and admin</strong><p>Health returns the expected version and admin login works.</p></article>
        <article><strong>Public pages</strong><p>Homepage, competition pages, winners and support pages open correctly.</p></article>
        <article><strong>Core data</strong><p>Competitions, orders, entries, winners, customers and audit logs still look correct.</p></article>
        <article><strong>Uploads/images</strong><p>Prize images, Arnold images, logos and uploaded files still load.</p></article>
        <article><strong>Final record</strong><p>Write down restore time, restored version, checks passed and any follow-up fixes needed.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Google Drive backup guide</h2>
      <p className="muted">Use Google Drive as an off-site copy for backup evidence. This panel is guidance only and does not connect to Google Drive yet.</p>
      <div className="backup-notes-grid">
        <article><strong>Folder structure</strong><p>Create a Prizetown Backups folder with subfolders for Database, Uploads, TrueNAS YAML, Restore Drills and Launch Records.</p></article>
        <article><strong>File naming</strong><p>Use clear names such as prizetown-db-YYYY-MM-DD-v246.dump and uploads-YYYY-MM-DD.zip.</p></article>
        <article><strong>What to upload</strong><p>Upload database dumps, uploads copies, TrueNAS YAML/compose files, env notes without secrets, and restore drill notes.</p></article>
        <article><strong>Sharing rule</strong><p>Keep the folder private and only share with trusted admins who genuinely need restore access.</p></article>
        <article><strong>Monthly check</strong><p>Open the Drive folder monthly and confirm the newest database, uploads and config copies are present.</p></article>
      </div>
    </div>

    <GoogleDriveStatusButton />

    <div className="backup-manual-notes">
      <h2>Google Drive integration status</h2>
      <p className="muted">First live integration step: the API can now check whether Google Drive backup settings are configured, without exposing secrets.</p>
      <div className="backup-notes-grid">
        <article><strong>Status endpoint</strong><p>Admin API route: /admin/google-drive/status</p></article>
        <article><strong>Folder env</strong><p>Set GOOGLE_DRIVE_BACKUP_FOLDER_ID or GOOGLE_DRIVE_FOLDER_ID to the Drive backup folder ID.</p></article>
        <article><strong>Credentials env</strong><p>Set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS for service-account/JWT access.</p></article>
        <article><strong>Safe response</strong><p>The endpoint only returns true/false configuration status, not private keys or secret values.</p></article>
        <article><strong>Next integration step</strong><p>After env is configured, add a test upload action and then a real backup upload action.</p></article>
      </div>
    </div>

    <div className="backup-readiness-grid">
      <article><strong>1. Local</strong><span>TrueNAS snapshot/backup</span></article>
      <article><strong>2. Off-site</strong><span>Google Drive copy</span></article>
      <article><strong>3. Restore</strong><span>Test before launch</span></article>
    </div>

    <div className="backup-warning-box">
      <strong>Recommended backup rule</strong>
      <p>Keep at least one local TrueNAS backup and one off-site Google Drive copy. A backup is only trusted after a successful restore test.</p>
    </div>



    <div className="backup-manual-notes">
      <h2>Manual backup notes</h2>
      <p className="muted">Use these as the basic backup set until automated exports are added.</p>
      <div className="backup-notes-grid">
        <article><strong>PostgreSQL dump</strong><p>Export the database so competitions, orders, entries, winners, settings and audit records can be restored.</p></article>
        <article><strong>Uploads folder</strong><p>Back up the API uploads volume so prize images and uploaded files are not lost.</p></article>
        <article><strong>Compose / YAML</strong><p>Save the TrueNAS compose/YAML and important environment notes, but keep secrets private.</p></article>
        <article><strong>Image tags</strong><p>Record current fixed image tags, for example API/web v190, so rollback and restore are simpler.</p></article>
        <article><strong>Google Drive copy</strong><p>Keep an off-site copy of database dumps, uploads backup and release notes in Google Drive.</p></article>
        <article><strong>Restore test</strong><p>Test a restore to a safe temporary app before trusting the backup for real payments.</p></article>
      </div>
    </div>


    <div className="backup-manual-notes">
      <h2>Restore test checklist</h2>
      <p className="muted">Use a safe temporary restore. Do not overwrite the live app or live database.</p>
      <div className="backup-notes-grid">
        <article><strong>1. Create safe test area</strong><p>Use a temporary database/app location so the live Prizetown data is not touched.</p></article>
        <article><strong>2. Restore database dump</strong><p>Import the PostgreSQL dump and confirm competitions, orders, entries, winners and settings appear.</p></article>
        <article><strong>3. Restore uploads</strong><p>Copy the uploads backup and confirm prize images and uploaded files load correctly.</p></article>
        <article><strong>4. Check admin login</strong><p>Confirm admin login works and key admin screens open without errors.</p></article>
        <article><strong>5. Check public pages</strong><p>Confirm competitions, winners/proof pages and draw pages still load from the restored data.</p></article>
        <article><strong>6. Record test date</strong><p>Write down the restore test date, backup source and result before trusting backups for real payments.</p></article>
      </div>
    </div>

    {checks.map(([title, ok, help]) => <div className="list-row entry-row" key={title}>
      <div><strong>{ok ? '✅' : '⚠️'} {title}</strong><p>{help}</p></div>
    </div>)}
  </div>;
}

function SupportReadinessPanel() {
  const checks = [
    ['Support email set', false, 'Confirm the customer support email is visible and monitored before launch.'],
    ['Refund/help process', false, 'Write down how refunds, mistaken entries, failed payments and customer questions will be handled.'],
    ['Winner contact process', false, 'Prepare a clear process for contacting winners, verifying details and recording prize fulfilment notes.'],
    ['Free-entry support', false, 'Make sure postal/free-entry questions can be answered fairly and consistently.'],
    ['Complaint escalation notes', false, 'Keep simple notes for complaints, disputes, chargebacks and legal/escalation situations.'],
    ['Admin handover notes', false, 'Make sure another trusted admin can understand the Help Guide and key launch checks.']
  ];

  return <div className="panel list-panel support-readiness-panel">
    <h1>Support Readiness</h1>
    <p className="muted">Use this before public launch so customer support is clear before real payments or live competitions.</p>

    <div className="security-warning-box">
      <strong>Launch support warning</strong>
      <p>Do not launch paid public competitions until support email, refund handling, winner contact, free-entry support and complaint notes are ready.</p>
    </div>

    <div className="backup-manual-notes">
      <h2>Customer support notes</h2>
      <p className="muted">Use these before replying to customers. Check records first and avoid promising refunds, prizes or outcomes without verification.</p>
      <div className="backup-notes-grid">
        <article><strong>Order questions</strong><p>Check Sales → Orders & entries for the customer order, ticket allocation and payment/test status.</p></article>
        <article><strong>Ticket questions</strong><p>Check ticket numbers in Orders & entries and compare with Public Entry Lists where needed.</p></article>
        <article><strong>Winner questions</strong><p>Check Winners, Draw Proof and public winner proof before confirming a result to a customer.</p></article>
        <article><strong>Free-entry questions</strong><p>Use Free entries and the free-entry legal text to answer postal/free-entry questions consistently.</p></article>
        <article><strong>Refund questions</strong><p>Do not promise refunds until payment records, competition status and refund policy wording have been checked.</p></article>
        <article><strong>Escalations</strong><p>Record disputes, complaints, chargebacks or legal concerns and escalate before replying if unsure.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Winner contact checklist</h2>
      <p className="muted">Use this before contacting a winner or publishing extra winner details.</p>
      <div className="backup-notes-grid">
        <article><strong>Verify winner record</strong><p>Check Winners and Draw Proof first. Confirm the saved winner record matches the competition.</p></article>
        <article><strong>Check ticket number</strong><p>Confirm the winning ticket number exists in Orders & entries or the public entry list.</p></article>
        <article><strong>Confirm contact details</strong><p>Use the customer/order record to confirm email, name and any contact details before sending winner messages.</p></article>
        <article><strong>Record fulfilment notes</strong><p>Write down when the winner was contacted, what was agreed and any prize delivery/collection notes.</p></article>
        <article><strong>Protect private data</strong><p>Only publish approved public winner information. Keep phone, email, address and private notes out of public posts.</p></article>
        <article><strong>Escalate uncertainty</strong><p>If ticket records, identity, payment status or eligibility are unclear, pause and escalate before confirming the prize.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support message templates</h2>
      <p className="muted">Starter wording only. Check records first, then edit before sending.</p>
      <div className="backup-notes-grid">
        <article><strong>Order question</strong><p>Thanks for your message. I am checking your order and ticket records now. I will confirm the order status and ticket numbers once I have verified them.</p></article>
        <article><strong>Ticket number question</strong><p>I will check your allocated ticket numbers against the order record and entry list before confirming anything back to you.</p></article>
        <article><strong>Free-entry question</strong><p>Free postal entries are handled according to the competition rules and deadlines. I will check the free-entry record and confirm the current status.</p></article>
        <article><strong>Winner contact</strong><p>Congratulations. I am contacting you about a Prizetown winner record. Before confirming prize fulfilment, I need to verify the draw record and your contact details.</p></article>
        <article><strong>Refund query</strong><p>Thanks for raising this. I need to check the payment/order record, competition status and refund wording before confirming whether any refund or other remedy applies.</p></article>
        <article><strong>Escalation</strong><p>I am going to pause and escalate this for review so we can check the records properly before giving you a final answer.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support workflow checklist</h2>
      <p className="muted">Use this order when handling customer messages so replies stay consistent and evidence-based.</p>
      <div className="backup-notes-grid">
        <article><strong>1. Identify the customer</strong><p>Search by email, name, order details or ticket number before replying.</p></article>
        <article><strong>2. Check the order</strong><p>Confirm order status, payment/test status, competition title and allocated ticket numbers.</p></article>
        <article><strong>3. Check draw/winner records</strong><p>For result questions, compare Winners, Draw Proof, public winner proof and entry lists.</p></article>
        <article><strong>4. Check legal/support wording</strong><p>Review Terms, Free Entry, Refunds and Site settings before answering policy questions.</p></article>
        <article><strong>5. Reply carefully</strong><p>Use the starter templates, edit the wording, and avoid promising outcomes until records are verified.</p></article>
        <article><strong>6. Record follow-up notes</strong><p>Keep notes for complaints, refunds, winner fulfilment, chargebacks and anything escalated.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Admin handover checklist</h2>
      <p className="muted">Use this before letting another trusted person help run Prizetown.</p>
      <div className="backup-notes-grid">
        <article><strong>Admin access route</strong><p>Explain that admin should use the protected Tailscale/admin route, not public /admin.</p></article>
        <article><strong>Daily checks</strong><p>Show Overview, Launch checklist, Orders & entries, System check, Support Readiness and Audit log.</p></article>
        <article><strong>Order support</strong><p>Explain how to find customers, orders, entries, ticket numbers and public entry lists.</p></article>
        <article><strong>Draw support</strong><p>Explain Draw Control Room, Final draw, Draw Proof, Winners and OBS broadcast basics.</p></article>
        <article><strong>Backup safety</strong><p>Show Backup Readiness and explain snapshots, database dumps, uploads backup and restore testing.</p></article>
        <article><strong>Escalation rule</strong><p>If money, legal, winner, refund, chargeback or identity details are unclear, pause and escalate before replying.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Launch support summary</h2>
      <p className="muted">Quick final reminder before paid public competitions or wider marketing.</p>
      <div className="backup-notes-grid">
        <article><strong>Support inbox</strong><p>Support email is visible, monitored and someone knows who replies.</p></article>
        <article><strong>Records first</strong><p>Orders, entries, payments, winners and free-entry records are checked before replying.</p></article>
        <article><strong>Templates ready</strong><p>Starter replies are available but must be edited for each customer.</p></article>
        <article><strong>Winner process</strong><p>Winner contact, verification and fulfilment notes are agreed before any draw promotion.</p></article>
        <article><strong>Escalation path</strong><p>Refund, complaint, chargeback, legal and identity issues have a pause-and-escalate rule.</p></article>
        <article><strong>Admin backup</strong><p>Another trusted admin can follow the Help Guide, Support Readiness and Backup Readiness panels.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Customer FAQ checklist</h2>
      <p className="muted">Use this to prepare clear answers before customers start asking the same questions.</p>
      <div className="backup-notes-grid">
        <article><strong>How do I enter?</strong><p>Point customers to the competition page, entry question, basket and checkout flow.</p></article>
        <article><strong>Where are my tickets?</strong><p>Explain that ticket numbers should be checked in My entries, Orders & entries or Public Entry Lists.</p></article>
        <article><strong>Is free entry available?</strong><p>Point to the Free Entry page and competition-specific rules/deadlines before answering.</p></article>
        <article><strong>When is the draw?</strong><p>Check the competition draw date, status, Draw Control Room and public competition page.</p></article>
        <article><strong>Who won?</strong><p>Point to Winners and public winner proof after the draw result has been saved.</p></article>
        <article><strong>Can I get a refund?</strong><p>Check order/payment records, competition status, Refunds page and support notes before replying.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support contact visibility</h2>
      <p className="muted">Check customers can find help before they enter or ask about tickets.</p>
      <div className="backup-notes-grid">
        <article><strong>Footer support email</strong><p>Confirm the public footer shows the correct support email from Site settings.</p></article>
        <article><strong>Legal page contact</strong><p>Check Terms, Privacy, Free Entry, Cookies and Refunds pages show usable contact details.</p></article>
        <article><strong>Checkout confidence</strong><p>Make sure customers can find support before entering payment or basket details.</p></article>
        <article><strong>Winner help route</strong><p>Winners should know how they will be contacted and how to ask questions safely.</p></article>
        <article><strong>Free-entry help</strong><p>Free-entry questions should point customers to the Free Entry page and support email.</p></article>
        <article><strong>Admin owner</strong><p>Decide who checks support messages daily and who handles escalations.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support escalation checklist</h2>
      <p className="muted">Pause and escalate these before giving a final customer answer.</p>
      <div className="backup-notes-grid">
        <article><strong>Refund dispute</strong><p>Escalate when a customer challenges a refund decision, payment status or cancellation outcome.</p></article>
        <article><strong>Chargeback/payment issue</strong><p>Escalate failed payments, duplicate payments, chargebacks or anything involving the payment provider.</p></article>
        <article><strong>Winner dispute</strong><p>Escalate if the winner, ticket number, eligibility, identity or draw proof is questioned.</p></article>
        <article><strong>Identity/privacy issue</strong><p>Escalate address, age, identity, data deletion/export or private contact-detail requests.</p></article>
        <article><strong>Legal complaint</strong><p>Escalate legal threats, regulator questions, formal complaints or competition fairness challenges.</p></article>
        <article><strong>Public/social issue</strong><p>Escalate public posts, reviews or social comments before replying if records are not fully checked.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support daily review</h2>
      <p className="muted">Use this once a day during launch/testing so customer issues are not missed.</p>
      <div className="backup-notes-grid">
        <article><strong>New support messages</strong><p>Check the support inbox and decide which messages need records checked before reply.</p></article>
        <article><strong>New orders</strong><p>Review new orders, ticket allocation and any unusual paid/test/payment statuses.</p></article>
        <article><strong>Free-entry requests</strong><p>Check postal/free-entry requests and record valid entries fairly and consistently.</p></article>
        <article><strong>Winner follow-ups</strong><p>Check whether any winners need contact, verification, fulfilment notes or public proof updates.</p></article>
        <article><strong>Escalations</strong><p>Review refunds, complaints, chargebacks, identity/privacy issues or legal concerns before replying.</p></article>
        <article><strong>Audit notes</strong><p>Check Audit log and Help Guide notes if another admin has made changes or handled support.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support issue log guidance</h2>
      <p className="muted">Use this as a simple record-keeping habit until a full support ticket system is added.</p>
      <div className="backup-notes-grid">
        <article><strong>Customer reference</strong><p>Record customer name/email, order ID, ticket number or competition title where relevant.</p></article>
        <article><strong>Issue type</strong><p>Mark whether it is order, ticket, free-entry, winner, refund, payment, complaint or technical support.</p></article>
        <article><strong>Evidence checked</strong><p>Note which records were checked before replying: orders, entries, winners, draw proof, payment status or legal text.</p></article>
        <article><strong>Reply sent</strong><p>Record the date/time and a short summary of what was sent back to the customer.</p></article>
        <article><strong>Follow-up owner</strong><p>Assign who owns the next step and when it should be checked again.</p></article>
        <article><strong>Final outcome</strong><p>Close with a clear outcome such as answered, refunded, escalated, fulfilled, duplicate, invalid or awaiting customer.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support response safety</h2>
      <p className="muted">Use these reminders before sending customer replies, public comments or winner messages.</p>
      <div className="backup-notes-grid">
        <article><strong>Check records first</strong><p>Do not answer order, ticket, draw, winner or refund questions until the matching records have been checked.</p></article>
        <article><strong>No private data</strong><p>Do not share email, phone, address, payment details, private notes or identity documents in public replies.</p></article>
        <article><strong>No early promises</strong><p>Do not promise refunds, prizes, eligibility, compensation or draw outcomes until verified and approved.</p></article>
        <article><strong>Use plain wording</strong><p>Reply clearly and politely. Avoid legal-sounding claims unless they match the published terms/support policy.</p></article>
        <article><strong>Pause risky replies</strong><p>Escalate complaints, chargebacks, identity/privacy requests, legal threats and winner disputes before replying.</p></article>
        <article><strong>Record the reply</strong><p>Log what was checked, what was sent, who owns follow-up and the final outcome.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support page complete note</h2>
      <p className="muted">This page is now a reference manual, not something you need to read top-to-bottom every day.</p>
      <div className="backup-notes-grid">
        <article><strong>Use the compact index first</strong><p>Start with the compact index below and jump mentally to the right support checklist.</p></article>
        <article><strong>Daily use stays simple</strong><p>For normal days, use Daily Review, Issue Log Guidance and Response Safety only.</p></article>
        <article><strong>Escalate the risky stuff</strong><p>Refunds, complaints, chargebacks, private data and winner disputes should still be paused and escalated.</p></article>
        <article><strong>Keep the rest as reference</strong><p>The remaining support blocks are there for launch, training, handover and unusual customer issues.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support compact index</h2>
      <p className="muted">Fast route to the right checklist without reading the whole page.</p>
      <div className="backup-notes-grid">
        <article><strong>Customer asks “where are my tickets?”</strong><p>Use Customer FAQ, Orders & entries, Issue Log Guidance and Response Safety.</p></article>
        <article><strong>Customer asks about free entry</strong><p>Use Customer FAQ, Daily Review, Free-entry records and Support Response Safety.</p></article>
        <article><strong>Winner needs help</strong><p>Use Winner Contact Checklist, Winners, Draw Proof and Handover Summary.</p></article>
        <article><strong>Refund or complaint arrives</strong><p>Use Escalation Checklist first, then record the issue before replying.</p></article>
        <article><strong>New admin is helping</strong><p>Use Admin Handover, Support Handover Summary, Help Guide and Backup Readiness.</p></article>
        <article><strong>End-of-day support check</strong><p>Use Daily Review, Issue Log Guidance, Audit log and final outcome notes.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support readiness sections</h2>
      <p className="muted">Quick guide for this page now it contains a lot of launch support checks.</p>
      <div className="backup-notes-grid">
        <article><strong>Launch basics</strong><p>Use Launch Support Summary, Support Launch Sign-off and Support Contact Visibility first.</p></article>
        <article><strong>Daily handling</strong><p>Use Support Daily Review, Workflow Checklist and Issue Log Guidance during normal support work.</p></article>
        <article><strong>Customer replies</strong><p>Use Message Templates, Customer FAQ Checklist and Support Response Safety before replying.</p></article>
        <article><strong>Risk/escalation</strong><p>Use Escalation Checklist for refunds, chargebacks, complaints, privacy, identity and winner disputes.</p></article>
        <article><strong>Winner support</strong><p>Use Winner Contact Checklist and Handover Summary when handling prize fulfilment or winner proof.</p></article>
        <article><strong>Admin backup</strong><p>Use Admin Handover Checklist, Help Guide and Backup Readiness if another trusted admin is helping.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support launch sign-off</h2>
      <p className="muted">Final support checks before wider marketing, live draws or real paid competitions.</p>
      <div className="backup-notes-grid">
        <article><strong>Support owner confirmed</strong><p>One person is responsible for checking messages daily and escalating issues.</p></article>
        <article><strong>Support email tested</strong><p>Support email is visible, monitored and tested from the public site/legal pages.</p></article>
        <article><strong>Order lookup ready</strong><p>Admins know how to find orders, customers, ticket numbers, entries and public entry lists.</p></article>
        <article><strong>Winner process ready</strong><p>Admins know how to verify winner proof, contact winners and record fulfilment notes.</p></article>
        <article><strong>Escalation path ready</strong><p>Refunds, chargebacks, complaints, identity/privacy and legal issues have a clear pause-and-escalate route.</p></article>
        <article><strong>Backup admin ready</strong><p>A trusted backup admin can follow the Help Guide, Support Readiness and Backup Readiness panels.</p></article>
      </div>
    </div>

    <div className="backup-manual-notes">
      <h2>Support handover summary</h2>
      <p className="muted">A quick map for any trusted admin helping with customer support.</p>
      <div className="backup-notes-grid">
        <article><strong>Start here</strong><p>Open Support Readiness, Help Guide and Launch checklist before replying to customers.</p></article>
        <article><strong>Customer evidence</strong><p>Use Orders & entries, Customers, Free entries, Winners, Draw Proof and Audit log to verify records.</p></article>
        <article><strong>Public evidence</strong><p>Use Public Entry Lists, Winners and Fair draws pages when explaining transparency to customers.</p></article>
        <article><strong>Unsafe replies</strong><p>Pause if the message involves refunds, chargebacks, legal complaints, private data, identity or winner disputes.</p></article>
        <article><strong>Daily rhythm</strong><p>Check support inbox, new orders, free-entry requests, winner follow-ups and escalations once per day.</p></article>
        <article><strong>After replying</strong><p>Record what was checked, what was sent, who owns follow-up and the final outcome.</p></article>
      </div>
    </div>

    {checks.map(([title, ok, help]) => <div className="list-row entry-row" key={title}>
      <div><strong>{ok ? '✅' : '⚠️'} {title}</strong><p>{help}</p></div>
    </div>)}
  </div>;
}

function SecurityReadinessPanel() {
  const checks = [
    ['Admin password', false, 'Change the default admin password before any public or real-payment launch.'],
    ['JWT secret', false, 'Use a long random JWT_SECRET in production. Never keep the development fallback secret.'],
    ['Admin access', true, 'Keep admin access protected through Tailscale/Cloudflare rules and avoid exposing public /admin.'],
    ['Rate limiting', false, 'Add rate limits for login, checkout, free-entry, admin actions and uploads before larger traffic.'],
    ['Upload safety', false, 'Restrict upload file types, size and SVG/script risks before public user uploads.'],
    ['Database backup', false, 'Set daily backups, store them safely and test a restore before launch.'],
    ['HTTPS / Cloudflare', true, 'Public site/API should stay HTTPS-only with Cloudflare protection and locked-down CORS.'],
    ['Audit trail', true, 'Audit logging and draw proof are already in place for admin/result transparency.']
  ];

  return <div className="panel list-panel security-readiness-panel">
    <h1>Security Readiness</h1>
    <p className="muted">Use this before a public launch or real payments. This panel is a checklist only and does not change security behaviour yet.</p>

    <div className="security-readiness-grid">
      <article><strong>Private demo</strong><span>Good for controlled testing</span></article>
      <article><strong>Public beta</strong><span>Needs hardening first</span></article>
      <article><strong>Real payments</strong><span>Wait for security + payment checks</span></article>
    </div>

    <div className="security-warning-box">
      <strong>Launch warning</strong>
      <p>Do not run real-money competitions at scale until admin credentials, secrets, rate limits, upload rules, backups, HTTPS/CORS and payment webhooks are hardened and tested.</p>
    </div>

    {checks.map(([title, ok, help]) => <div className="list-row entry-row" key={title}>
      <div><strong>{ok ? '✅' : '⚠️'} {title}</strong><p>{help}</p></div>
    </div>)}
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



function PublicTrustBlocks() {
  return <section className="public-trust-blocks">
    <div className="trust-card">
      <strong>How it works</strong>
      <p>Choose a competition, enter securely, then watch for the live draw or winner update.</p>
    </div>
    <div className="trust-card">
      <strong>Transparent draws</strong>
      <p>Final draws are designed to be recorded, shown clearly and saved with winner details.</p>
    </div>
    <div className="trust-card">
      <strong>Free entry route</strong>
      <p>Free postal entry information is available from the legal/free-entry pages before you enter.</p>
    </div>
    <div className="trust-card">
      <strong>Winner proof</strong>
      <p>Winners and draw outcomes can be shown publicly so customers can see real results over time.</p>
    </div>
  </section>;
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

window.__PRIZETOWN_BUILD__ = 'Prizetown web build v280';
if (!document.getElementById('prizetown-admin-nav-polish-v263')) {
  const style = document.createElement('style');
  style.id = 'prizetown-admin-nav-polish-v263';
  style.textContent = `
    .admin-actions,
    .admin-tabs,
    .admin-menu,
    .admin-nav,
    .admin-toolbar,
    .admin-shortcuts,
    .admin-button-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }

    .admin-actions {
      padding: 10px 0;
    }

    .admin-actions button,
    .admin-tabs button,
    .admin-menu button,
    .admin-nav button,
    .admin-toolbar button,
    .admin-shortcuts button,
    .admin-button-row button,
    .admin-actions a,
    .admin-tabs a,
    .admin-menu a,
    .admin-nav a,
    .admin-toolbar a,
    .admin-shortcuts a {
      min-height: 38px;
      line-height: 1.2;
      white-space: normal;
      text-align: center;
      border-radius: 12px;
    }

    .admin-actions button,
    .admin-toolbar button,
    .admin-button-row button {
      flex: 0 1 auto;
    }

    .backup-tool-section,
    .admin-tool-section {
      flex: 1 0 100%;
      display: block;
      margin-top: 12px;
      padding: 8px 10px;
      border-radius: 12px;
      font-weight: 800;
      letter-spacing: .01em;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.12);
    }

    .admin-card,
    .admin-panel,
    .admin-section,
    .backup-manual-notes {
      scroll-margin-top: 90px;
    }

    .admin-card h2,
    .admin-panel h2,
    .admin-section h2,
    .backup-manual-notes h2 {
      scroll-margin-top: 90px;
    }

    .admin-actions:has(.backup-tool-section),
    .backup-manual-notes .admin-actions {
      align-items: stretch;
    }

    .backup-manual-notes .admin-actions button {
      min-width: 180px;
    }

    .backup-manual-notes .backup-notes-grid {
      margin-bottom: 12px;
    }

    .admin-nav-polish-note {
      margin: 10px 0 14px;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.12);
      font-size: .94rem;
    }

    .admin-scroll-top {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 60;
      border: 0;
      border-radius: 999px;
      padding: 10px 13px;
      font-weight: 900;
      box-shadow: 0 10px 30px rgba(0,0,0,.24);
      cursor: pointer;
      opacity: .92;
    }

    .admin-scroll-top:hover {
      opacity: 1;
      transform: translateY(-1px);
    }

    @media (max-width: 760px) {
      .admin-actions,
      .admin-tabs,
      .admin-menu,
      .admin-nav,
      .admin-toolbar,
      .admin-shortcuts,
      .admin-button-row {
        gap: 8px;
      }

      .admin-actions button,
      .admin-tabs button,
      .admin-menu button,
      .admin-nav button,
      .admin-toolbar button,
      .admin-shortcuts button,
      .admin-button-row button,
      .admin-actions a,
      .admin-tabs a,
      .admin-menu a,
      .admin-nav a,
      .admin-toolbar a,
      .admin-shortcuts a {
        flex: 1 1 calc(50% - 8px);
        min-width: 138px;
        padding-left: 10px;
        padding-right: 10px;
      }

      .backup-manual-notes .admin-actions button {
        min-width: 138px;
      }

      .admin-scroll-top {
        right: 12px;
        bottom: 12px;
      }
    }

    @media (max-width: 430px) {
      .admin-actions button,
      .admin-tabs button,
      .admin-menu button,
      .admin-nav button,
      .admin-toolbar button,
      .admin-shortcuts button,
      .admin-button-row button,
      .admin-actions a,
      .admin-tabs a,
      .admin-menu a,
      .admin-nav a,
      .admin-toolbar a,
      .admin-shortcuts a {
        flex-basis: 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

if (!document.getElementById('admin-scroll-top-v263')) {
  const button = document.createElement('button');
  button.id = 'admin-scroll-top-v263';
  button.className = 'admin-scroll-top';
  button.type = 'button';
  button.textContent = '↑ Top';
  button.setAttribute('aria-label', 'Back to top');
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(button);
}

if (!document.getElementById('prizetown-public-trust-v264')) {
  const style = document.createElement('style');
  style.id = 'prizetown-public-trust-v264';
  style.textContent = `
    .admin-quick-nav-v264 {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
    }

    .public-trust-blocks {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin: 22px auto;
      width: min(1120px, calc(100% - 28px));
    }

    .public-trust-blocks .trust-card {
      padding: 16px;
      border-radius: 18px;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 12px 30px rgba(0,0,0,.18);
    }

    .public-trust-blocks .trust-card strong {
      display: block;
      font-size: 1.02rem;
      margin-bottom: 7px;
    }

    .public-trust-blocks .trust-card p {
      margin: 0;
      opacity: .88;
      line-height: 1.45;
    }

    @media (max-width: 900px) {
      .public-trust-blocks {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 540px) {
      .public-trust-blocks {
        grid-template-columns: 1fr;
        width: min(100% - 20px, 1120px);
        margin-top: 16px;
      }
    }
  `;
  document.head.appendChild(style);
}

if (!document.getElementById('prizetown-live-activity-polish-v265')) {
  const style = document.createElement('style');
  style.id = 'prizetown-live-activity-polish-v265';
  style.textContent = `
    .live-activity-next-draw-card,
    .next-draw-polished-card {
      min-width: 220px;
    }

    .live-activity-next-draw-date,
    .next-draw-polished-date {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 42px;
      padding: 6px 10px;
      border-radius: 14px;
      font-size: clamp(1.1rem, 2vw, 1.55rem);
      font-weight: 900;
      line-height: 1.12;
      white-space: nowrap;
      letter-spacing: -0.02em;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.12);
    }

    .live-activity-next-draw-card small,
    .next-draw-polished-card small {
      display: block;
      margin-top: 6px;
    }

    @media (max-width: 520px) {
      .live-activity-next-draw-date,
      .next-draw-polished-date {
        white-space: normal;
        text-align: center;
        font-size: 1.08rem;
      }
    }
  `;
  document.head.appendChild(style);
}

const polishLiveActivityV265 = () => {
  const interactive = Array.from(document.querySelectorAll('a, button'));
  interactive.forEach((el) => {
    const text = (el.textContent || '').trim().toLowerCase();
    if (text === 'view live competitions') {
      el.remove();
    }
  });

  const labels = Array.from(document.querySelectorAll('strong, span, p, small, div, article'));
  labels.forEach((el) => {
    const text = (el.textContent || '').trim().toLowerCase();
    if (text !== 'next draw') return;

    const card = el.closest('article, .card, .stat-card, .metric-card, .live-card, div');
    if (card) card.classList.add('live-activity-next-draw-card', 'next-draw-polished-card');

    const prev = el.previousElementSibling;
    if (prev && (prev.textContent || '').match(/\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\d{1,2}:\d{2}|no draw|soon/i)) {
      prev.classList.add('live-activity-next-draw-date', 'next-draw-polished-date');
    }

    const next = el.nextElementSibling;
    if (next && (next.textContent || '').match(/\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\d{1,2}:\d{2}|no draw|soon/i)) {
      next.classList.add('live-activity-next-draw-date', 'next-draw-polished-date');
    }
  });
};

polishLiveActivityV265();
setTimeout(polishLiveActivityV265, 250);
setTimeout(polishLiveActivityV265, 900);
window.addEventListener('hashchange', polishLiveActivityV265);
window.addEventListener('popstate', polishLiveActivityV265);

if (!document.getElementById('prizetown-automation-centre-v266-style')) {
  const style = document.createElement('style');
  style.id = 'prizetown-automation-centre-v266-style';
  style.textContent = `
    .automation-centre-v266 {
      width: min(1120px, calc(100% - 24px));
      margin: 12px auto 18px;
      padding: 16px;
      border-radius: 22px;
      background: rgba(255,255,255,.08);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 16px 40px rgba(0,0,0,.20);
    }

    .automation-centre-v266 header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .automation-centre-v266 h2 {
      margin: 0 0 5px;
      font-size: clamp(1.25rem, 2vw, 1.65rem);
    }

    .automation-centre-v266 p {
      margin: 0;
      opacity: .88;
      line-height: 1.45;
    }

    .automation-grid-v266 {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin: 12px 0;
    }

    .automation-tile-v266 {
      padding: 12px;
      border-radius: 16px;
      background: rgba(0,0,0,.14);
      border: 1px solid rgba(255,255,255,.12);
    }

    .automation-tile-v266 strong {
      display: block;
      font-size: .9rem;
      opacity: .78;
      margin-bottom: 5px;
    }

    .automation-tile-v266 span {
      display: block;
      font-size: 1.25rem;
      font-weight: 900;
    }

    .automation-warning-list-v266 {
      display: grid;
      gap: 8px;
      margin: 12px 0;
    }

    .automation-warning-v266 {
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(255, 198, 75, .12);
      border: 1px solid rgba(255, 198, 75, .32);
    }

    .automation-ok-v266 {
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(75, 255, 169, .10);
      border: 1px solid rgba(75, 255, 169, .25);
    }

    .automation-actions-v266 {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
      margin-top: 12px;
    }

    .automation-actions-v266 button {
      min-height: 38px;
      border-radius: 12px;
      font-weight: 800;
      cursor: pointer;
    }

    @media (max-width: 850px) {
      .automation-grid-v266 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 520px) {
      .automation-grid-v266 {
        grid-template-columns: 1fr;
      }
      .automation-actions-v266 button {
        flex: 1 1 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

const automationCentreV266State = {
  lastData: null,
  loading: false
};

const isAdminPageV266 = () => false; // v271: disabled injected floating automation panel

const findAdminTargetV266 = () => {
  return document.querySelector('main.admin, .admin-page, .admin-shell, main');
};

const getAdminTokenV266 = () => {
  return localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('prizetown_token') || '';
};

const clickAdminThingV266 = (labels) => {
  const items = Array.from(document.querySelectorAll('button, a'));
  const found = items.find((item) => {
    const text = (item.textContent || '').trim().toLowerCase();
    return labels.some((label) => text.includes(label.toLowerCase()));
  });
  if (found) {
    found.click();
    return true;
  }
  return false;
};

const deriveAutomationWarningsV266 = (data) => {
  const warnings = [];
  const checks = Array.isArray(data?.checks) ? data.checks : [];
  const lowerChecks = checks.map((check) => ({
    title: String(check.title || check.name || '').toLowerCase(),
    status: String(check.status || check.level || '').toLowerCase(),
    message: String(check.message || check.detail || '').toLowerCase()
  }));

  const hasWarning = (needle) => lowerChecks.some((check) =>
    check.title.includes(needle) || check.message.includes(needle)
  );

  if (data && data.ok === false) warnings.push('System Check currently reports blockers. Review Launch Centre before public launch.');
  if (hasWarning('payment')) warnings.push('Payment/webhook hardening still needs attention before real-money launch.');
  if (hasWarning('email') || hasWarning('resend')) warnings.push('Transactional email may not be fully configured yet.');
  if (hasWarning('backup') || hasWarning('drive')) warnings.push('Backup/Google Drive readiness should be checked before major changes.');
  warnings.push('Auto-running risky jobs is intentionally disabled here. Use manual buttons until timeline/logging is added.');

  return [...new Set(warnings)];
};

const renderAutomationCentreV266 = () => {
  let panel = document.getElementById('prizetown-automation-centre-v266');

  if (!isAdminPageV266()) {
    if (panel) panel.remove();
    return;
  }

  const target = findAdminTargetV266();
  if (!target) return;

  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'prizetown-automation-centre-v266';
    panel.className = 'automation-centre-v266';
    target.insertBefore(panel, target.firstChild);
  }

  const data = automationCentreV266State.lastData;
  const totals = data?.totals || {};
  const checks = Array.isArray(data?.checks) ? data.checks : [];
  const warnings = data ? deriveAutomationWarningsV266(data) : ['Press refresh to load live admin system signals.'];

  panel.innerHTML = `
    <header>
      <div>
        <h2>Automation Control Centre</h2>
        <p>Safe overview only. This panel shows launch/automation signals and quick links without changing live data.</p>
      </div>
      <div class="automation-actions-v266">
        <button type="button" data-action="refresh">Refresh status</button>
        <button type="button" data-action="due-draws">Open due draw controls</button>
      </div>
    </header>

    <div class="automation-grid-v266">
      <div class="automation-tile-v266"><strong>System status</strong><span>${data ? (data.ok ? 'OK' : 'Needs review') : 'Not loaded'}</span></div>
      <div class="automation-tile-v266"><strong>Competitions</strong><span>${totals.competitions ?? '-'}</span></div>
      <div class="automation-tile-v266"><strong>Orders</strong><span>${totals.orders ?? '-'}</span></div>
      <div class="automation-tile-v266"><strong>Checks</strong><span>${checks.length || '-'}</span></div>
    </div>

    <div class="automation-warning-list-v266">
      ${warnings.length ? warnings.map((warning) => `<div class="automation-warning-v266">${warning}</div>`).join('') : '<div class="automation-ok-v266">No automation warnings found from the current system check.</div>'}
    </div>

    <div class="automation-actions-v266">
      <button type="button" data-action="draw-room">Open Draw Control Room</button>
      <button type="button" data-action="backup">Open Backup Readiness</button>
      <button type="button" data-action="launch">Open Launch Centre</button>
      <button type="button" data-action="system">Open System Check</button>
      <button type="button" data-action="top">↑ Top</button>
    </div>
  `;

  panel.querySelector('[data-action="refresh"]')?.addEventListener('click', fetchAutomationCentreV266);
  panel.querySelector('[data-action="due-draws"]')?.addEventListener('click', () => {
    const ok = clickAdminThingV266(['run due auto draws now', 'run due auto draws']);
    if (!ok) alert('Could not find the existing due auto draw controls on this admin view.');
  });
  panel.querySelector('[data-action="draw-room"]')?.addEventListener('click', () => clickAdminThingV266(['draw control room', 'draws']));
  panel.querySelector('[data-action="backup"]')?.addEventListener('click', () => clickAdminThingV266(['backup readiness', 'google drive live status', 'backup']));
  panel.querySelector('[data-action="launch"]')?.addEventListener('click', () => clickAdminThingV266(['launch centre', 'launch']));
  panel.querySelector('[data-action="system"]')?.addEventListener('click', () => clickAdminThingV266(['system check', 'system']));
  panel.querySelector('[data-action="top"]')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
};

const fetchAutomationCentreV266 = async () => {
  if (automationCentreV266State.loading) return;
  automationCentreV266State.loading = true;
  renderAutomationCentreV266();

  try {
    const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const token = getAdminTokenV266();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(`${apiBase}/admin/system-check`, { headers });
    const data = await response.json().catch(() => null);
    automationCentreV266State.lastData = data || { ok: false, checks: [{ title: 'System Check', status: 'warning', message: 'Could not read system check response.' }] };
  } catch (err) {
    automationCentreV266State.lastData = {
      ok: false,
      checks: [{ title: 'System Check', status: 'warning', message: err.message || 'Could not load automation signals.' }]
    };
  } finally {
    automationCentreV266State.loading = false;
    renderAutomationCentreV266();
  }
};

const mountAutomationCentreV266 = () => {
  renderAutomationCentreV266();
  if (isAdminPageV266() && !automationCentreV266State.lastData) fetchAutomationCentreV266();
};

// v271 disabled: mountAutomationCentreV266();
// v271 disabled: setTimeout(mountAutomationCentreV266, 350);
// v271 disabled: setTimeout(mountAutomationCentreV266, 1000);
// v271 disabled: window.addEventListener('hashchange', mountAutomationCentreV266);
// v271 disabled: window.addEventListener('popstate', mountAutomationCentreV266);

if (!document.getElementById('prizetown-live-activity-safe-zone-v267')) {
  const style = document.createElement('style');
  style.id = 'prizetown-live-activity-safe-zone-v267';
  style.textContent = `
    .live-activity-next-draw-card,
    .next-draw-polished-card {
      min-width: 0 !important;
      max-width: 100% !important;
      overflow: hidden !important;
    }

    .live-activity-next-draw-date,
    .next-draw-polished-date,
    .next-draw-safe-value-v267 {
      display: flex !important;
      flex-direction: column !important;
      align-items: flex-start !important;
      justify-content: center !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box !important;
      white-space: normal !important;
      overflow-wrap: anywhere !important;
      word-break: normal !important;
      line-height: 1.08 !important;
      gap: 2px !important;
      padding: 6px 8px !important;
      border-radius: 14px !important;
      background: rgba(255,255,255,.08) !important;
      border: 1px solid rgba(255,255,255,.12) !important;
    }

    .next-draw-safe-date-v267 {
      display: block;
      max-width: 100%;
      font-size: clamp(1.05rem, 1.7vw, 1.32rem);
      font-weight: 900;
      color: #ffe94a;
      line-height: 1.05;
    }

    .next-draw-safe-time-v267 {
      display: block;
      max-width: 100%;
      font-size: clamp(.92rem, 1.35vw, 1.05rem);
      font-weight: 800;
      opacity: .95;
      line-height: 1.05;
    }

    @media (max-width: 760px) {
      .live-activity-next-draw-date,
      .next-draw-polished-date,
      .next-draw-safe-value-v267 {
        align-items: center !important;
        text-align: center !important;
      }
    }
  `;
  document.head.appendChild(style);
}

const safeZoneLiveActivityV267 = () => {
  const labels = Array.from(document.querySelectorAll('strong, span, p, small, div, article'));
  labels.forEach((el) => {
    const text = (el.textContent || '').trim().toLowerCase();
    if (text !== 'next draw') return;

    const card = el.closest('article, .card, .stat-card, .metric-card, .live-card, div');
    if (card) card.classList.add('live-activity-next-draw-card', 'next-draw-polished-card');

    const candidates = [el.previousElementSibling, el.nextElementSibling].filter(Boolean);
    candidates.forEach((valueEl) => {
      const original = (valueEl.textContent || '').trim();
      if (!original || valueEl.dataset.safeZoneV267 === '1') return;
      if (!original.match(/\d{1,2}\s+[A-Za-z]{3}\s+\d{4}|\d{1,2}:\d{2}|no draw|soon/i)) return;

      valueEl.dataset.safeZoneV267 = '1';
      valueEl.classList.add('next-draw-safe-value-v267');

      const match = original.match(/^(.*?\d{4})\s*,?\s*(\d{1,2}:\d{2}.*)$/);
      if (match) {
        valueEl.innerHTML = `<span class="next-draw-safe-date-v267">${match[1]}</span><span class="next-draw-safe-time-v267">${match[2]}</span>`;
      }
    });
  });
};

safeZoneLiveActivityV267();
setTimeout(safeZoneLiveActivityV267, 250);
setTimeout(safeZoneLiveActivityV267, 900);
window.addEventListener('hashchange', safeZoneLiveActivityV267);
window.addEventListener('popstate', safeZoneLiveActivityV267);

if (!document.getElementById('prizetown-live-font-automation-timeline-v268')) {
  const style = document.createElement('style');
  style.id = 'prizetown-live-font-automation-timeline-v268';
  style.textContent = `
    .live-activity-next-draw-date,
    .next-draw-polished-date,
    .next-draw-safe-value-v267 {
      min-height: 34px !important;
      padding: 5px 7px !important;
      gap: 1px !important;
      line-height: 1.05 !important;
    }

    .next-draw-safe-date-v267 {
      font-size: clamp(.86rem, 1.1vw, 1.02rem) !important;
      line-height: 1.02 !important;
      letter-spacing: -0.015em !important;
    }

    .next-draw-safe-time-v267 {
      font-size: clamp(.76rem, .95vw, .9rem) !important;
      line-height: 1.02 !important;
      opacity: .9 !important;
    }

    .live-activity-next-draw-card,
    .next-draw-polished-card {
      min-width: 0 !important;
    }

    .automation-timeline-v268 {
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(255,255,255,.14);
    }

    .automation-timeline-v268 h3 {
      margin: 0 0 9px;
      font-size: 1rem;
    }

    .automation-timeline-list-v268 {
      display: grid;
      gap: 7px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .automation-timeline-list-v268 li {
      display: grid;
      grid-template-columns: 92px 1fr;
      gap: 10px;
      align-items: start;
      padding: 9px 10px;
      border-radius: 13px;
      background: rgba(0,0,0,.14);
      border: 1px solid rgba(255,255,255,.10);
    }

    .automation-timeline-time-v268 {
      font-weight: 900;
      opacity: .82;
      font-size: .82rem;
      white-space: nowrap;
    }

    .automation-timeline-text-v268 {
      line-height: 1.35;
      opacity: .94;
    }

    @media (max-width: 560px) {
      .automation-timeline-list-v268 li {
        grid-template-columns: 1fr;
        gap: 3px;
      }
    }
  `;
  document.head.appendChild(style);
}

const automationTimelineV268 = {
  events: []
};

const addAutomationEventV268 = (text) => {
  const now = new Date();
  const stamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  automationTimelineV268.events.unshift({ stamp, text });
  automationTimelineV268.events = automationTimelineV268.events.slice(0, 6);
  renderAutomationTimelineV268();
};

const renderAutomationTimelineV268 = () => {
  const centre = document.getElementById('prizetown-automation-centre-v266');
  if (!centre) return;

  let panel = centre.querySelector('.automation-timeline-v268');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'automation-timeline-v268';
    centre.appendChild(panel);
  }

  const events = automationTimelineV268.events.length
    ? automationTimelineV268.events
    : [{ stamp: '--:--', text: 'Timeline ready. Refresh Automation Control Centre to record the next admin check.' }];

  panel.innerHTML = `
    <h3>Automation timeline</h3>
    <ul class="automation-timeline-list-v268">
      ${events.map((event) => `<li><span class="automation-timeline-time-v268">${event.stamp}</span><span class="automation-timeline-text-v268">${event.text}</span></li>`).join('')}
    </ul>
  `;
};

const hookAutomationTimelineV268 = () => {
  const centre = document.getElementById('prizetown-automation-centre-v266');
  if (!centre) return;

  renderAutomationTimelineV268();

  centre.querySelectorAll('button').forEach((button) => {
    if (button.dataset.timelineHookV268 === '1') return;
    button.dataset.timelineHookV268 = '1';
    button.addEventListener('click', () => {
      const label = (button.textContent || 'Automation action').trim();
      if (label.toLowerCase().includes('refresh')) addAutomationEventV268('Automation status refreshed.');
      else if (label.toLowerCase().includes('draw')) addAutomationEventV268('Draw automation shortcut opened or checked.');
      else if (label.toLowerCase().includes('backup')) addAutomationEventV268('Backup readiness shortcut opened.');
      else if (label.toLowerCase().includes('launch')) addAutomationEventV268('Launch Centre shortcut opened.');
      else if (label.toLowerCase().includes('system')) addAutomationEventV268('System Check shortcut opened.');
      else addAutomationEventV268(label + ' clicked.');
    });
  });
};

const watchAutomationTimelineV268 = () => {
  hookAutomationTimelineV268();
  setTimeout(hookAutomationTimelineV268, 350);
  setTimeout(hookAutomationTimelineV268, 1000);
};

// v271 disabled: watchAutomationTimelineV268();
// v271 disabled: window.addEventListener('hashchange', watchAutomationTimelineV268);
// v271 disabled: window.addEventListener('popstate', watchAutomationTimelineV268);

if (!document.getElementById('prizetown-automation-placement-fix-v269')) {
  const style = document.createElement('style');
  style.id = 'prizetown-automation-placement-fix-v269';
  style.textContent = `
    body > .automation-centre-v266 {
      display: none !important;
    }

    main .automation-centre-v266,
    .admin-page .automation-centre-v266,
    .admin-shell .automation-centre-v266 {
      display: block !important;
    }
  `;
  document.head.appendChild(style);
}

const fixAutomationPanelPlacementV269 = () => {
  const root = document.getElementById('root');
  const panels = Array.from(document.querySelectorAll('#prizetown-automation-centre-v266'));

  panels.forEach((panel) => {
    if (panel.parentElement === document.body || (root && panel.nextElementSibling === root)) {
      panel.remove();
    }
  });

  const target = document.querySelector('main.admin, .admin-page, .admin-shell, main');
  const panel = document.getElementById('prizetown-automation-centre-v266');
  if (target && panel && !target.contains(panel)) {
    target.insertBefore(panel, target.firstChild);
  }
};

fixAutomationPanelPlacementV269();
setTimeout(fixAutomationPanelPlacementV269, 250);
setTimeout(fixAutomationPanelPlacementV269, 1000);
window.addEventListener('hashchange', fixAutomationPanelPlacementV269);
window.addEventListener('popstate', fixAutomationPanelPlacementV269);

if (!document.getElementById('prizetown-automation-compact-v270')) {
  const style = document.createElement('style');
  style.id = 'prizetown-automation-compact-v270';
  style.textContent = `
    .automation-centre-v266 {
      width: min(920px, calc(100% - 24px)) !important;
      margin: 12px auto 16px !important;
      padding: 13px 14px !important;
      border-radius: 18px !important;
    }

    .automation-centre-v266 header {
      margin-bottom: 8px !important;
    }

    .automation-centre-v266 h2 {
      font-size: clamp(1.08rem, 1.5vw, 1.35rem) !important;
      margin-bottom: 3px !important;
    }

    .automation-centre-v266 p {
      font-size: .88rem !important;
    }

    .automation-grid-v266 {
      grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      gap: 8px !important;
      margin: 9px 0 !important;
    }

    .automation-tile-v266 {
      padding: 9px 10px !important;
      border-radius: 13px !important;
    }

    .automation-tile-v266 strong {
      font-size: .78rem !important;
      margin-bottom: 3px !important;
    }

    .automation-tile-v266 span {
      font-size: 1rem !important;
    }

    .automation-warning-list-v266 {
      gap: 6px !important;
      margin: 8px 0 !important;
    }

    .automation-warning-v266,
    .automation-ok-v266 {
      padding: 8px 10px !important;
      border-radius: 12px !important;
      font-size: .84rem !important;
    }

    .automation-actions-v266 {
      gap: 7px !important;
      margin-top: 8px !important;
    }

    .automation-actions-v266 button {
      min-height: 32px !important;
      padding: 6px 9px !important;
      font-size: .82rem !important;
    }

    .automation-timeline-v268 {
      margin-top: 9px !important;
      padding-top: 9px !important;
    }

    .automation-timeline-v268 h3 {
      font-size: .9rem !important;
      margin-bottom: 6px !important;
    }

    .automation-timeline-list-v268 li {
      padding: 7px 9px !important;
      border-radius: 11px !important;
      font-size: .82rem !important;
    }

    @media (max-width: 850px) {
      .automation-grid-v266 {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
    }

    @media (max-width: 520px) {
      .automation-grid-v266 {
        grid-template-columns: 1fr !important;
      }

      .automation-actions-v266 button {
        flex: 1 1 100% !important;
      }
    }
  `;
  document.head.appendChild(style);
}

if (!document.getElementById('prizetown-disable-floating-automation-v271')) {
  const style = document.createElement('style');
  style.id = 'prizetown-disable-floating-automation-v271';
  style.textContent = `
    #prizetown-automation-centre-v266,
    .automation-centre-v266 {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

const removeFloatingAutomationV271 = () => {
  document.querySelectorAll('#prizetown-automation-centre-v266, .automation-centre-v266').forEach((el) => el.remove());
};

removeFloatingAutomationV271();
setTimeout(removeFloatingAutomationV271, 100);
setTimeout(removeFloatingAutomationV271, 500);
setTimeout(removeFloatingAutomationV271, 1500);
window.addEventListener('hashchange', removeFloatingAutomationV271);
window.addEventListener('popstate', removeFloatingAutomationV271);

if (!document.getElementById('prizetown-payment-readiness-v272')) {
  const style = document.createElement('style');
  style.id = 'prizetown-payment-readiness-v272';
  style.textContent = `
    .payment-readiness-v272 {
      width: min(980px, calc(100% - 24px));
      margin: 14px auto 18px;
      padding: 16px;
      border-radius: 20px;
      background: linear-gradient(135deg, rgba(255,226,89,.15), rgba(255,255,255,.06));
      border: 1px solid rgba(255,226,89,.35);
      box-shadow: 0 18px 45px rgba(0,0,0,.16);
    }

    .payment-readiness-v272 header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .payment-readiness-v272 h2 {
      margin: 0 0 4px;
      font-size: clamp(1.15rem, 1.7vw, 1.55rem);
    }

    .payment-readiness-v272 p {
      margin: 0;
      opacity: .88;
      line-height: 1.45;
    }

    .payment-status-pill-v272 {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 10px;
      border-radius: 999px;
      font-weight: 900;
      font-size: .82rem;
      background: rgba(255,90,90,.17);
      border: 1px solid rgba(255,120,120,.45);
      white-space: nowrap;
    }

    .payment-readiness-grid-v272 {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 9px;
      margin: 12px 0;
    }

    .payment-readiness-grid-v272 article {
      padding: 11px 12px;
      border-radius: 15px;
      background: rgba(0,0,0,.16);
      border: 1px solid rgba(255,255,255,.12);
    }

    .payment-readiness-grid-v272 strong {
      display: block;
      font-size: .8rem;
      opacity: .75;
      margin-bottom: 5px;
    }

    .payment-readiness-grid-v272 span {
      display: block;
      font-weight: 900;
      font-size: .98rem;
      line-height: 1.2;
    }

    .payment-checks-v272 {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .payment-checks-v272 div {
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 9px;
      align-items: start;
      padding: 10px 11px;
      border-radius: 14px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.10);
      line-height: 1.35;
    }

    .payment-checks-v272 b {
      display: block;
      margin-bottom: 2px;
    }

    .payment-actions-v272 {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 13px;
    }

    .payment-actions-v272 button {
      border: 0;
      border-radius: 999px;
      padding: 8px 12px;
      font-weight: 900;
      cursor: pointer;
      background: rgba(255,255,255,.92);
      color: #111827;
    }

    .payment-actions-v272 button.secondary {
      background: rgba(255,255,255,.12);
      color: inherit;
      border: 1px solid rgba(255,255,255,.18);
    }

    @media (max-width: 820px) {
      .payment-readiness-grid-v272 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .payment-readiness-v272 header {
        display: grid;
      }
    }

    @media (max-width: 520px) {
      .payment-readiness-grid-v272 {
        grid-template-columns: 1fr;
      }

      .payment-actions-v272 button {
        flex: 1 1 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

const isAdminPaymentPageV272 = () => false; // v274: disabled injected floating payment readiness panel

const mountPaymentReadinessV272 = () => {
  if (!isAdminPaymentPageV272()) {
    document.getElementById('prizetown-payment-readiness-panel-v272')?.remove();
    return;
  }

  const target = document.querySelector('main.admin, .admin-page, .admin-shell, main');
  if (!target) return;

  let panel = document.getElementById('prizetown-payment-readiness-panel-v272');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'prizetown-payment-readiness-panel-v272';
    panel.className = 'payment-readiness-v272';
    target.insertBefore(panel, target.firstChild);
  }

  panel.innerHTML = `
    <header>
      <div>
        <h2>Payment readiness centre</h2>
        <p>Safe launch reminder: paid entries should stay in test mode until provider keys, webhooks, idempotency and paid-order checks are confirmed.</p>
      </div>
      <span class="payment-status-pill-v272">Not ready for live payments</span>
    </header>

    <div class="payment-readiness-grid-v272">
      <article><strong>Provider keys</strong><span>Needs confirmation</span></article>
      <article><strong>Webhooks</strong><span>Not verified</span></article>
      <article><strong>Paid ticket allocation</strong><span>Needs backend proof</span></article>
      <article><strong>Refund/failed states</strong><span>Needs review</span></article>
    </div>

    <div class="payment-checks-v272">
      <div><span>⚠️</span><span><b>Do not rely on frontend-only payment state.</b> Tickets should only be marked paid/allocated after a trusted backend confirmation.</span></div>
      <div><span>⚠️</span><span><b>Webhook verification is required before public paid launch.</b> The provider webhook secret should be checked server-side and duplicate events must not create duplicate entries.</span></div>
      <div><span>⚠️</span><span><b>Orders need clear states.</b> Keep pending, paid, failed, refunded and chargeback states separate before accepting real money.</span></div>
      <div><span>✅</span><span><b>This panel is guidance only.</b> It does not change checkout, payment provider settings, orders or draw logic.</span></div>
    </div>

    <div class="payment-actions-v272">
      <button type="button" data-payment-action="system">Open System Check</button>
      <button type="button" class="secondary" data-payment-action="launch">Open Launch Centre</button>
      <button type="button" class="secondary" data-payment-action="orders">Open Orders</button>
      <button type="button" class="secondary" data-payment-action="hide">Hide for this session</button>
    </div>
  `;

  panel.querySelector('[data-payment-action="hide"]')?.addEventListener('click', () => panel.remove());
  panel.querySelector('[data-payment-action="system"]')?.addEventListener('click', () => clickPaymentAdminThingV272(['system check', 'tools']));
  panel.querySelector('[data-payment-action="launch"]')?.addEventListener('click', () => clickPaymentAdminThingV272(['launch centre', 'launch']));
  panel.querySelector('[data-payment-action="orders"]')?.addEventListener('click', () => clickPaymentAdminThingV272(['orders']));
};

const clickPaymentAdminThingV272 = (labels) => {
  const buttons = Array.from(document.querySelectorAll('button, a'));
  const target = buttons.find((button) => {
    const text = (button.textContent || '').trim().toLowerCase();
    return labels.some((label) => text.includes(label));
  });
  if (target) {
    target.click();
    return true;
  }
  alert('Could not find that admin shortcut on this view.');
  return false;
};

// v274 disabled: mountPaymentReadinessV272();
// v274 disabled: setTimeout(mountPaymentReadinessV272, 300);
// v274 disabled: setTimeout(mountPaymentReadinessV272, 1000);
// v274 disabled: window.addEventListener('hashchange', mountPaymentReadinessV272);
// v274 disabled: window.addEventListener('popstate', mountPaymentReadinessV272);

if (!document.getElementById('prizetown-security-readiness-v273')) {
  const style = document.createElement('style');
  style.id = 'prizetown-security-readiness-v273';
  style.textContent = `
    .security-readiness-v273 {
      width: min(980px, calc(100% - 24px));
      margin: 12px auto 18px;
      padding: 15px;
      border-radius: 20px;
      background: linear-gradient(135deg, rgba(59,130,246,.16), rgba(255,255,255,.06));
      border: 1px solid rgba(96,165,250,.35);
      box-shadow: 0 18px 45px rgba(0,0,0,.15);
    }

    .security-readiness-v273 header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 11px;
    }

    .security-readiness-v273 h2 {
      margin: 0 0 4px;
      font-size: clamp(1.12rem, 1.65vw, 1.5rem);
    }

    .security-readiness-v273 p {
      margin: 0;
      opacity: .88;
      line-height: 1.45;
    }

    .security-status-pill-v273 {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 10px;
      border-radius: 999px;
      font-weight: 900;
      font-size: .82rem;
      background: rgba(251,191,36,.18);
      border: 1px solid rgba(251,191,36,.45);
      white-space: nowrap;
    }

    .security-grid-v273 {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 9px;
      margin: 12px 0;
    }

    .security-grid-v273 article {
      padding: 10px 11px;
      border-radius: 15px;
      background: rgba(0,0,0,.15);
      border: 1px solid rgba(255,255,255,.12);
    }

    .security-grid-v273 strong {
      display: block;
      font-size: .78rem;
      opacity: .75;
      margin-bottom: 5px;
    }

    .security-grid-v273 span {
      display: block;
      font-weight: 900;
      font-size: .95rem;
      line-height: 1.2;
    }

    .security-checks-v273 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .security-checks-v273 div {
      display: grid;
      grid-template-columns: 26px 1fr;
      gap: 9px;
      align-items: start;
      padding: 9px 10px;
      border-radius: 14px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.10);
      line-height: 1.34;
      font-size: .9rem;
    }

    .security-checks-v273 b {
      display: block;
      margin-bottom: 2px;
    }

    .security-actions-v273 {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 13px;
    }

    .security-actions-v273 button {
      border: 0;
      border-radius: 999px;
      padding: 8px 12px;
      font-weight: 900;
      cursor: pointer;
      background: rgba(255,255,255,.92);
      color: #111827;
    }

    .security-actions-v273 button.secondary {
      background: rgba(255,255,255,.12);
      color: inherit;
      border: 1px solid rgba(255,255,255,.18);
    }

    @media (max-width: 880px) {
      .security-grid-v273 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .security-checks-v273 {
        grid-template-columns: 1fr;
      }

      .security-readiness-v273 header {
        display: grid;
      }
    }

    @media (max-width: 520px) {
      .security-grid-v273 {
        grid-template-columns: 1fr;
      }

      .security-actions-v273 button {
        flex: 1 1 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

const isAdminSecurityPageV273 = () => false; // v274: disabled injected floating security readiness panel

const mountSecurityReadinessV273 = () => {
  if (!isAdminSecurityPageV273()) {
    document.getElementById('prizetown-security-readiness-panel-v273')?.remove();
    return;
  }

  const target = document.querySelector('main.admin, .admin-page, .admin-shell, main');
  if (!target) return;

  let panel = document.getElementById('prizetown-security-readiness-panel-v273');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'prizetown-security-readiness-panel-v273';
    panel.className = 'security-readiness-v273';

    const paymentPanel = document.getElementById('prizetown-payment-readiness-panel-v272');
    if (paymentPanel && paymentPanel.parentElement === target) {
      paymentPanel.insertAdjacentElement('afterend', panel);
    } else {
      target.insertBefore(panel, target.firstChild);
    }
  }

  panel.innerHTML = `
    <header>
      <div>
        <h2>Security readiness centre</h2>
        <p>Public launch reminder: harden admin access, secrets, uploads, rate limits, HTTPS and backups before taking real users or payments.</p>
      </div>
      <span class="security-status-pill-v273">Needs hardening before launch</span>
    </header>

    <div class="security-grid-v273">
      <article><strong>Admin login</strong><span>Change defaults</span></article>
      <article><strong>JWT / secrets</strong><span>Use strong values</span></article>
      <article><strong>Uploads</strong><span>Limit and verify</span></article>
      <article><strong>Rate limits</strong><span>Required</span></article>
    </div>

    <div class="security-checks-v273">
      <div><span>⚠</span><span><b>Admin credentials must be changed.</b> Default demo login details should not be used for public launch.</span></div>
      <div><span>⚠</span><span><b>JWT_SECRET must be long and private.</b> Never use placeholder secrets on public deployments.</span></div>
      <div><span>⚠</span><span><b>Uploads need hard limits.</b> Confirm file size, file type, random names and safe public serving before launch.</span></div>
      <div><span>⚠</span><span><b>Rate limits and lockouts matter.</b> Login, checkout, free entry, upload and contact routes should be protected from abuse.</span></div>
      <div><span>✅</span><span><b>HTTPS and backups are launch gates.</b> Keep public traffic on HTTPS and verify database/uploads restore before launch.</span></div>
      <div><span>✅</span><span><b>This panel is guidance only.</b> It does not change auth, passwords, secrets or route behaviour.</span></div>
    </div>

    <div class="security-actions-v273">
      <button type="button" data-security-action="system">Open System Check</button>
      <button type="button" class="secondary" data-security-action="launch">Open Launch Centre</button>
      <button type="button" class="secondary" data-security-action="backup">Open Backup Readiness</button>
      <button type="button" class="secondary" data-security-action="hide">Hide for this session</button>
    </div>
  `;

  panel.querySelector('[data-security-action="hide"]')?.addEventListener('click', () => panel.remove());
  panel.querySelector('[data-security-action="system"]')?.addEventListener('click', () => clickSecurityAdminThingV273(['system check', 'tools']));
  panel.querySelector('[data-security-action="launch"]')?.addEventListener('click', () => clickSecurityAdminThingV273(['launch centre', 'launch']));
  panel.querySelector('[data-security-action="backup"]')?.addEventListener('click', () => clickSecurityAdminThingV273(['backup readiness', 'google drive live status', 'backup']));
};

const clickSecurityAdminThingV273 = (labels) => {
  const buttons = Array.from(document.querySelectorAll('button, a'));
  const target = buttons.find((button) => {
    const text = (button.textContent || '').trim().toLowerCase();
    return labels.some((label) => text.includes(label));
  });
  if (target) {
    target.click();
    return true;
  }
  alert('Could not find that admin shortcut on this view.');
  return false;
};

// v274 disabled: mountSecurityReadinessV273();
// v274 disabled: setTimeout(mountSecurityReadinessV273, 300);
// v274 disabled: setTimeout(mountSecurityReadinessV273, 1000);
// v274 disabled: window.addEventListener('hashchange', mountSecurityReadinessV273);
// v274 disabled: window.addEventListener('popstate', mountSecurityReadinessV273);

if (!document.getElementById('prizetown-disable-floating-readiness-v274')) {
  const style = document.createElement('style');
  style.id = 'prizetown-disable-floating-readiness-v274';
  style.textContent = `
    #prizetown-payment-readiness-panel-v272,
    #prizetown-security-readiness-panel-v273,
    .payment-readiness-v272,
    .security-readiness-v273 {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

const removeFloatingReadinessV274 = () => {
  document.querySelectorAll('#prizetown-payment-readiness-panel-v272, #prizetown-security-readiness-panel-v273, .payment-readiness-v272, .security-readiness-v273').forEach((el) => el.remove());
};

removeFloatingReadinessV274();
setTimeout(removeFloatingReadinessV274, 100);
setTimeout(removeFloatingReadinessV274, 500);
setTimeout(removeFloatingReadinessV274, 1500);
window.addEventListener('hashchange', removeFloatingReadinessV274);
window.addEventListener('popstate', removeFloatingReadinessV274);


if (!document.getElementById('prizetown-security-events-viewer-v280-style')) {
  const style = document.createElement('style');
  style.id = 'prizetown-security-events-viewer-v280-style';
  style.textContent = `
    #prizetown-security-events-viewer-v280 {
      width: min(980px, calc(100% - 24px));
      margin: 18px auto 28px;
      padding: 14px;
      border-radius: 18px;
      border: 1px solid rgba(148,163,184,.32);
      background: rgba(15,23,42,.72);
      color: #f8fafc;
      box-shadow: 0 18px 45px rgba(0,0,0,.16);
    }
    #prizetown-security-events-viewer-v280 header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    #prizetown-security-events-viewer-v280 h2 {
      margin: 0 0 4px;
      font-size: 1.18rem;
    }
    #prizetown-security-events-viewer-v280 p {
      margin: 0;
      opacity: .82;
      line-height: 1.4;
    }
    .security-events-actions-v280 {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0;
    }
    .security-events-actions-v280 button {
      border: 0;
      border-radius: 999px;
      padding: 8px 11px;
      font-weight: 900;
      cursor: pointer;
      background: rgba(255,255,255,.92);
      color: #111827;
    }
    .security-events-status-v280 {
      display: inline-flex;
      padding: 6px 9px;
      border-radius: 999px;
      background: rgba(59,130,246,.18);
      border: 1px solid rgba(96,165,250,.38);
      font-weight: 900;
      white-space: nowrap;
    }
    .security-events-list-v280 {
      display: grid;
      gap: 7px;
      margin-top: 10px;
    }
    .security-event-row-v280 {
      display: grid;
      grid-template-columns: 150px 150px 1fr;
      gap: 8px;
      align-items: start;
      padding: 9px 10px;
      border-radius: 13px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.09);
      font-size: .88rem;
      line-height: 1.35;
    }
    .security-event-row-v280 b {
      display: block;
      color: #bfdbfe;
    }
    .security-event-row-v280 code {
      white-space: pre-wrap;
      word-break: break-word;
      color: inherit;
    }
    @media (max-width: 760px) {
      #prizetown-security-events-viewer-v280 header {
        display: grid;
      }
      .security-event-row-v280 {
        grid-template-columns: 1fr;
      }
      .security-events-actions-v280 button {
        flex: 1 1 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

const isAdminSecurityEventsPageV280 = () => window.location.pathname.toLowerCase().includes('/admin');

async function loadSecurityEventsV280(panel) {
  const list = panel.querySelector('[data-security-events-list]');
  const status = panel.querySelector('[data-security-events-status]');
  if (!list || !status) return;

  status.textContent = 'Loading...';
  list.innerHTML = '<p>Loading recent security events...</p>';

  try {
    const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || '';
    const response = await fetch('/admin/security/events', {
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    });

    if (!response.ok) throw new Error('Security events request failed: ' + response.status);
    const data = await response.json();
    const events = Array.isArray(data.events) ? data.events : [];

    status.textContent = String(data.count || events.length || 0) + ' recent';

    if (!events.length) {
      list.innerHTML = '<p>No blocked security events recorded since the API last restarted.</p>';
      return;
    }

    list.innerHTML = events.slice(0, 12).map((event) => {
      const details = event.details ? JSON.stringify(event.details, null, 2) : '';
      return '<div class="security-event-row-v280">' +
        '<span><b>' + String(event.type || 'event') + '</b>' + String(event.at || '') + '</span>' +
        '<span><b>IP / origin</b>' + String(event.ip || 'unknown') + '<br>' + String(event.origin || '') + '</span>' +
        '<span><b>Path / details</b>' + String(event.method || '') + ' ' + String(event.path || '') + '<br><code>' + details.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])) + '</code></span>' +
      '</div>';
    }).join('');
  } catch (err) {
    status.textContent = 'Error';
    list.innerHTML = '<p>Could not load security events. Check you are logged in as admin and API v279/v280 is deployed.</p>';
  }
}

function mountSecurityEventsViewerV280() {
  if (!isAdminSecurityEventsPageV280()) {
    document.getElementById('prizetown-security-events-viewer-v280')?.remove();
    return;
  }

  const target = document.querySelector('main.admin, .admin-page, .admin-shell, main');
  if (!target) return;

  let panel = document.getElementById('prizetown-security-events-viewer-v280');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'prizetown-security-events-viewer-v280';
    panel.innerHTML = `
      <header>
        <div>
          <h2>Security events</h2>
          <p>Recent blocked origins, upload blocks and login rate-limit events. This is in-memory and clears when the API restarts.</p>
        </div>
        <span class="security-events-status-v280" data-security-events-status>Not loaded</span>
      </header>
      <div class="security-events-actions-v280">
        <button type="button" data-security-events-refresh>Refresh security events</button>
      </div>
      <div class="security-events-list-v280" data-security-events-list>
        <p>Click refresh to load recent security events.</p>
      </div>
    `;

    target.appendChild(panel);
    panel.querySelector('[data-security-events-refresh]')?.addEventListener('click', () => loadSecurityEventsV280(panel));
    setTimeout(() => loadSecurityEventsV280(panel), 250);
  }
}

mountSecurityEventsViewerV280();
setTimeout(mountSecurityEventsViewerV280, 500);
setTimeout(mountSecurityEventsViewerV280, 1500);
window.addEventListener('hashchange', mountSecurityEventsViewerV280);
window.addEventListener('popstate', mountSecurityEventsViewerV280);

createRoot(document.getElementById('root')).render(<AppErrorBoundary><App /></AppErrorBoundary>);

if (!document.getElementById('public-trust-dom-mount-v264')) {
  const mountPublicTrustBlocks = () => {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const shouldShow = path === '/' || path === '/competitions';
    const existing = document.getElementById('public-trust-dom-mount-v264');

    if (!shouldShow) {
      if (existing) existing.remove();
      return;
    }

    if (existing) return;

    const root = document.getElementById('root');
    const section = document.createElement('section');
    section.id = 'public-trust-dom-mount-v264';
    section.className = 'public-trust-blocks';
    section.innerHTML = `
      <div class="trust-card"><strong>How it works</strong><p>Choose a competition, enter securely, then watch for the live draw or winner update.</p></div>
      <div class="trust-card"><strong>Transparent draws</strong><p>Final draws are designed to be recorded, shown clearly and saved with winner details.</p></div>
      <div class="trust-card"><strong>Free entry route</strong><p>Free postal entry information is available from the legal/free-entry pages before you enter.</p></div>
      <div class="trust-card"><strong>Winner proof</strong><p>Winners and draw outcomes can be shown publicly so customers can see real results over time.</p></div>
    `;

    if (root && root.parentNode) {
      root.parentNode.insertBefore(section, root.nextSibling);
    } else {
      document.body.appendChild(section);
    }
  };

  mountPublicTrustBlocks();
  window.addEventListener('popstate', mountPublicTrustBlocks);
  window.addEventListener('hashchange', mountPublicTrustBlocks);
  setTimeout(mountPublicTrustBlocks, 350);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
