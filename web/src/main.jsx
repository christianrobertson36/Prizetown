
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

function TrustedWheelDraw({ mode = 'idle', winner = null, tickets = [], rotation = 0, label = 'PRIZETOWN FINAL DRAW' }) {
  const rows = safeArray(tickets);
  const isSpinning = mode === 'spinning';
  const isWinner = mode === 'winner' && winner;
  const segments = rows.length ? rows : Array.from({ length: 24 }, (_, i) => ({ label: `#${i + 1}`, from: i + 1, to: i + 1 }));
  const slice = 360 / Math.max(1, segments.length);
  const colours = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#2563eb', '#7c3aed', '#db2777'];
  const showLabels = segments.length <= 100;

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
        <circle cx="250" cy="250" r="108" className="trusted-wheel-centre" />
        <circle cx="250" cy="250" r="66" className="trusted-wheel-logo-ring" />
        <image href="/prizetown-logo.png" x="192" y="192" width="116" height="116" preserveAspectRatio="xMidYMid meet" clipPath="url(#trustedWheelLogoClip)" className="trusted-wheel-centre-logo" />
        <text x="250" y="336" textAnchor="middle" className="trusted-wheel-centre-sub">{isWinner ? 'WINNER CONFIRMED' : isSpinning ? 'DRAWING LIVE' : 'READY TO DRAW'}</text>
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
        <h3>{segments.length} wheel segments ready</h3>
      </>}
    </div>
    <p className="trusted-wheel-note">The wheel display is generated from eligible entries. Large draws use grouped ticket ranges, with the exact winning ticket shown in the reveal.</p>
  </div>;
}


const defaultSettings = {
  site_name: 'Prizetown',
  support_email: 'support@prizetown.local',
  hero_eyebrow: 'Postcode prize competitions',
  hero_title: 'Win big prizes with Prizetown',
  hero_text: 'Browse live postcode prize competitions, add tickets to your basket, answer the entry question and receive your ticket numbers securely.',
  footer_text: 'Prizetown runs postcode-based prize competitions with clear entry limits, responsible play guidance and transparent draw information.',
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

function initialPage() { const p = window.location.pathname.toLowerCase(); if (p.includes('/draw-live') || p.includes('/draw-broadcast')) return 'draw-broadcast'; if (p.includes('/admin')) return 'admin'; if (p.includes('/account')) return 'account'; if (p.includes('/cart')) return 'cart'; if (p.includes('/winners')) return 'winners'; if (p.includes('/privacy')) return 'privacy'; if (p.includes('/terms')) return 'terms'; if (p.includes('/free-entry')) return 'free-entry'; if (p.includes('/cookies')) return 'cookies'; if (p.includes('/refunds')) return 'refunds'; return 'home'; }


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
  useEffect(() => { if (user) loadAccount().catch(() => {}); }, [user]);
  useEffect(() => { if (user?.role === 'admin') loadAdminData().catch(() => {}); }, [user]);
  function logout() { localStorage.removeItem('prizetown_token'); localStorage.removeItem('prizetown_user'); setUser(null); setEntries([]); setOrders([]); setPage('home'); }
  const active = competitions.filter(c => c.status === 'active');
  const homepageCompetitions = active.length > 0 ? active : competitions;
  const cartCount = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (page === 'draw-broadcast') {
    return <DrawBroadcastPage setPage={setPage} />;
  }

  return <div>
    <div className="welcome-marquee" aria-label="Welcome message"><div className="marquee-track"><span>Welcome to {settings.site_name || 'Prizetown'}!</span><span>New competitions added regularly</span><span>Instant wins and final draw prizes</span><span>Enter responsibly and good luck</span><span>Welcome to {settings.site_name || 'Prizetown'}!</span><span>New competitions added regularly</span><span>Instant wins and final draw prizes</span><span>Enter responsibly and good luck</span></div></div>
    <header className="topbar"><button className="brand logo-brand" onClick={() => setPage('home')}><img src="/prizetown-logo.png" alt={settings.site_name || 'Prizetown'} /><span>{settings.site_name || 'Prizetown'}</span></button><nav>
      <button type="button" onClick={() => document.getElementById('competitions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Competitions</button><button onClick={() => setPage('winners')}>Winners</button><button onClick={() => setPage('terms')}>Terms</button>
      {user && <button onClick={() => { setPage('account'); loadAccount().catch(err => setMessage(err.message)); }}><ClipboardList size={16} /> My entries</button>}
      <button onClick={() => setPage('cart')}><ShoppingCart size={16} /> Basket {cartCount > 0 ? `(${cartCount})` : ''}</button>
      {user?.role === 'admin' && <button onClick={() => { setPage('admin'); loadAdminData().catch(err => setMessage(err.message)); }}><Shield size={16} /> Admin</button>}
      {user ? <button onClick={logout}><LogOut size={16} /> Logout</button> : <button onClick={() => setPage('login')}><User size={16} /> Login</button>}
    </nav></header>
    {message && <div className="notice">{message}<button onClick={() => setMessage('')}>Dismiss</button></div>}
    {featureEnabled(settings, 'module_cookie_legal_enabled') && !cookieChoice && <CookieConsent settings={settings} setPage={setPage} onChoice={saveCookieChoice} showPrefs={showCookiePrefs} setShowPrefs={setShowCookiePrefs} />}
    {featureEnabled(settings, 'module_cookie_legal_enabled') && !legalAccepted && <LegalDisclaimer settings={settings} setPage={setPage} onAccept={acceptLegalDisclaimer} />}
    {page === 'home' && <Home settings={settings} resetCookieChoice={resetCookieChoice} competitions={homepageCompetitions} instantWinners={instantWinners} user={user} setPage={setPage} cart={cart} saveCart={saveCart} setMessage={setMessage} selected={selected} setSelected={setSelected} />}
    {page === 'login' && <Login setUser={setUser} setPage={setPage} setMessage={setMessage} />}
    {page === 'winners' && <Winners winners={winners} instantWinners={instantWinners} />}
    {page === 'terms' && <LegalPage title="Terms and Conditions" text={settings.terms_text || defaultSettings.terms_text} settings={settings} setPage={setPage} />}
    {page === 'privacy' && <LegalPage title="Privacy Notice" text={settings.privacy_text || defaultSettings.privacy_text} settings={settings} setPage={setPage} />}
    {page === 'free-entry' && <LegalPage title="Free Entry Route" text={settings.free_entry_global || defaultSettings.free_entry_global} settings={settings} setPage={setPage} />}
    {page === 'cookies' && <LegalPage title="Cookie Notice" text={settings.cookie_text || defaultSettings.cookie_text} settings={settings} setPage={setPage} />}
    {page === 'refunds' && <LegalPage title="Refunds and Cancellations" text={settings.refund_text || defaultSettings.refund_text} settings={settings} setPage={setPage} />}
    {page === 'cart' && <Cart settings={settings} user={user} setPage={setPage} cart={cart} saveCart={saveCart} reload={load} reloadAccount={loadAccount} setMessage={setMessage} />}
    {page === 'account' && <Account user={user} entries={entries} orders={orders} setPage={setPage} reload={loadAccount} />}
    {page === 'admin' && user?.role === 'admin' && <Admin settings={settings} setSettings={setSettings} competitions={competitions} entries={adminEntries} orders={adminOrders} auditLogs={adminAudit} instantWins={adminInstantWins} postcodeZones={adminPostcodeZones} postcodeAssignments={adminPostcodeAssignments} reload={async () => { await load(); await loadAdminData(); }} setMessage={setMessage} setPage={setPage} />}
    {page === 'admin' && user?.role !== 'admin' && <Login setUser={setUser} setPage={setPage} setMessage={setMessage} />}
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

  return <div className={`arnold-broadcast-host ${mode}`}>
    <img src="/arnold-blackndeckka.jpg" alt="Arnold Blackndeckka" />
    <div className="arnold-broadcast-bubble">
      <strong>Arnold says</strong>
      <span>{caption}</span>
    </div>
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
        <p className="eyebrow"><Sparkles size={16} /> {settings.hero_eyebrow}</p>
        <h1>{settings.hero_title}</h1>
        <p>{settings.hero_text}</p>
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
        </div>
      </div>
      <div className="hero-card draw-card pick-poster-card">
        <img className="pick-poster-logo" src="/prizetown-logo.png" alt="Prizetown" />
        <img className="pick-poster-arnold" src="/arnold-highlife-poster.png" alt="Arnold Blackndeckka living the high life" />
        <div className="pick-poster-copy">
          <p className="eyebrow"><Sparkles size={16} /> Hosted by Arnold</p>
          <h3>Pick a poster</h3>
          <p>Tap a scrolling competition poster below to open the full prize page, ticket choices, entry list and instant wins.</p>
        </div>
      </div>
    </section>

    <section className="homepage-arnold panel">
      <ArnoldHost stage="welcome" caption="I’m Arnold Blackndeckka, your Prizetown host. I’ll keep an eye on the draws, winners and big-ticket moments." />
    </section>

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
          <small>Demo only. This does not enter you into a live competition and does not affect official draw results.</small>
        </div>
      </div>
      <div className="wheel-of-luck-demo">
        <TrustedWheelDraw mode={demoMode} winner={demoWinner} tickets={demoTickets} rotation={demoRotation} label="DEMO WHEEL OF LUCK" />
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
        <p>Cars, cash, tech and luxury lifestyle moments — Arnold brings the VIP feeling while the competition posters do the selling.</p>
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

    <section id="competitions" className="competitions-anchor"><CompetitionScroller competitions={competitions} setSelected={openCompetition} /></section>

    {selected && <div id="competition-details"><CompetitionDetail c={selected} cart={cart} saveCart={saveCart} setMessage={setMessage} setPage={setPage} close={() => setSelected(null)} /></div>}

    <section className="ticker winners-ticker"><strong>Latest instant winners</strong>{instantWinners.length === 0 ? <span>No instant winners yet — instant-win prizes will appear here as they are claimed.</span> : instantWinners.slice(0, 10).map(w => <span key={w.id}>{w.winner_name || 'Customer'} won {w.prize_title} on {w.competition_title}</span>)}</section>


    <section className="footer-pre-cta">
      <div>
        <p className="eyebrow"><Trophy size={16} /> Ready for the next winner?</p>
        <h2>Check the live competitions and pick your prize poster.</h2>
      </div>
      <button className="primary" onClick={() => document.getElementById('competitions')?.scrollIntoView({ behavior: 'smooth' })}>View competitions</button>
    </section>

    {typeof WebsiteFooter === 'function' ? <WebsiteFooter settings={settings} setPage={setPage} /> : <footer className="site-footer">
      <div className="footer-brand">
        <img src="/prizetown-logo.png" alt="Prizetown" />
        <p>{settings.footer_text}</p>
        <p className="footer-credit">Website by <strong>Neotech Designs</strong> · <a href="https://ctec-shop.co.uk" target="_blank" rel="noreferrer">ctec-shop.co.uk</a></p>
      </div>
      <div className="footer-column">
        <h3>Free entry</h3>
        <p>{settings.free_entry_global}</p>
      </div>
      <div className="footer-column">
        <h3>Responsible play</h3>
        <p>{settings.responsible_play_text}</p>
      </div>
      <div className="footer-column">
        <h3>Transparency</h3>
        <p>Competition details, ticket limits, closing dates and draw information are shown clearly before entry.</p>
        <nav className="footer-links" aria-label="Footer legal links">
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
      <small><b>{percent}% SOLD</b> · {c.entries_sold || 0}/{c.max_tickets}</small>
      <small>{remaining} Tickets Remaining</small>
      <span className="poster-price">{money(c.ticket_price_pence)} Per Entry</span>
      {Number(c.instant_win_total || 0) > 0 && <em><Zap size={13} /> {c.instant_win_claimed || 0}/{c.instant_win_total} instant wins found</em>}
      <span className="poster-enter">Enter Now</span>
    </div>
  </button>;
}


function CompetitionCard({ c, cart, saveCart, setMessage, setPage, setSelected }) {
  const percent = Math.min(100, Math.round(((c.entries_sold || 0) / c.max_tickets) * 100)); const remaining = Math.max(0, c.max_tickets - (c.entries_sold || 0));
  return <article className="card comp-card"><img src={c.image_url ? imageUrl(c.image_url) : fallbackPosterUrl(c)} alt="" /><div className="card-body"><div className="tag-row"><span className="badge">{daysLeft(c.closes_at) === 'Closed' ? 'Closed' : 'ENDS SOON'}</span>{Number(c.instant_win_total || 0) > 0 && <span className="badge hot"><Zap size={13} /> Instant wins</span>}</div><div className="row"><h3>{c.title}</h3><span>{money(c.ticket_price_pence)} Per Entry</span></div><p>{c.description}</p><p className="muted"><Clock size={14} /> Draw on {fmtDate(c.draw_at)}</p><div className="progress"><span style={{ width: `${percent}%` }} /></div><p className="muted"><strong>{percent}% SOLD</strong> · {c.entries_sold || 0} / {c.max_tickets} · {remaining} tickets remaining</p>{Number(c.instant_win_total || 0) > 0 && <p className="instant-count"><Zap size={15} /> {c.instant_win_claimed || 0}/{c.instant_win_total} instant wins found</p>}<button className="primary full" onClick={() => setSelected(c)}>Enter now</button><button className="secondary full" onClick={() => setSelected(c)}>View details</button></div></article>;
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
  return <section className="detail panel"><button className="link" onClick={close}>Close details</button><div className="detail-grid"><div><img className="detail-img" src={c.image_url ? imageUrl(c.image_url) : fallbackPosterUrl(c)} alt="" /><div className="share-row"><span>Share:</span><button>Facebook</button><button>Instagram</button><button>TikTok</button></div></div><div><h1>{c.title}</h1><p className="price-big">{money(c.ticket_price_pence)} Per Entry</p><div className="countdown"><div>{daysLeft(c.closes_at)}</div><small>Draw on {fmtDate(c.draw_at)}</small></div><div className="progress"><span style={{ width: `${percent}%` }} /></div><p><strong>{percent}% Sold</strong> · {c.entries_sold || 0}/{c.max_tickets} · {remaining} tickets remaining · max {c.max_per_user} per user</p>{c.question && <label>Entry question<input value={answer} onChange={e => setAnswer(e.target.value)} placeholder={c.question} /></label>}<div className="quick-picks"><button type="button" onClick={() => setQuantity(1)}>1 ticket</button><button type="button" onClick={() => setQuantity(5)}>5 tickets</button><button type="button" onClick={() => setQuantity(10)}>10 tickets</button><button type="button" onClick={() => setQuantity(25)}>25 tickets</button></div><p className="muted small-help">Choose how many tickets, then press Add to basket. If a competition is limited to 1 per user, admin can raise Max per user on the competition.</p><div className="two compact"><label>Tickets<input type="number" min="1" max={Math.min(c.max_per_user, remaining)} value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Total<input readOnly value={money((Number(quantity || 1)) * c.ticket_price_pence)} /></label></div>{localNotice && <p className="basket-notice">{localNotice}</p>}<button type="button" className="primary full" onClick={() => add()}><ShoppingCart size={16} /> Add to basket</button><button type="button" className="secondary full" onClick={() => setPage('cart')}>Go to basket / Checkout</button></div></div><div className="detail-tabs"><details open><summary>Prize Description</summary><p>{c.description}</p></details><details open><summary>Instant Wins</summary>{instantWins.length === 0 ? <p className="muted">No instant wins on this competition.</p> : <div className="instant-grid">{instantWins.map(w => <div className={`instant-prize ${w.public_status}`} key={w.id}><strong>{w.prize_title}</strong><span>{w.prize_value_pence ? money(w.prize_value_pence) : 'Bonus'}</span><small>{w.public_status === 'claimed' ? `Won by ${w.winner_name || 'Customer'} · ticket #${w.winning_ticket_number}` : 'Available'}</small></div>)}</div>}<p className="muted">If any allocated ticket number matches a pre-set instant-win ticket, the prize is marked as won automatically.</p></details><details><summary>Entry List</summary>{entryList.length === 0 ? <p className="muted">No entries yet.</p> : <div className="entry-chip-list">{entryList.slice(0, 500).map(e => <span key={e.ticket_number}>#{e.ticket_number}</span>)}</div>}</details><details><summary>Free Entry Route</summary><p>{c.free_entry_text || 'Add free-entry text in admin before going public.'}</p></details><details><summary>Competition Rules</summary><p>{c.rules_text || 'Add competition rules in admin before going public.'}</p></details></div></section>;
}

function Login({ setUser, setPage, setMessage }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', postcode: '' });

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
    {mode === 'register' && <label>Your postcode<input value={form.postcode} onChange={e => setForm({ ...form, postcode: e.target.value.toUpperCase() })} placeholder="BB1 2AB" required /><small className="muted">We use this to show competitions available in your postcode area.</small></label>}
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

function Account({ user, entries, orders, setPage, reload }) { if (!user) return <main className="narrow"><div className="panel"><h2>Please login</h2><button className="primary" onClick={() => setPage('login')}>Login</button></div></main>; return <main><section className="admin-layout"><div className="panel list-panel"><div className="row"><h2>My entries</h2><button className="secondary" onClick={reload}>Refresh</button></div>{entryList.length === 0 && <p className="muted">No entries yet.</p>}{entries.map(e => <div className="list-row entry-row" key={e.id}><div><strong>{e.competition_title}</strong><p>Ticket #{e.ticket_number} · {e.payment_status}</p></div></div>)}</div><div className="panel list-panel"><h2>My orders</h2>{orders.length === 0 && <p className="muted">No orders yet.</p>}{orders.map(o => <div className="list-row entry-row" key={o.id}><div><strong>Order #{o.id}</strong><p>{money(o.total_pence)} · {o.entry_count} entries · {o.status}</p></div></div>)}</div></section></main>; }




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
  const winner = state?.winner;
  const revealAt = state?.reveal_at ? new Date(state.reveal_at).getTime() : 0;
  const winnerReady = Boolean(winner) && (state?.mode === 'winner' || (revealAt > 0 && Date.now() >= revealAt));
  const displayWinner = winnerReady ? winner : null;
  const mode = winnerReady ? 'winner' : (state?.mode || 'idle');
  const title = state?.competition_title || 'Waiting for competition';
  const competitionNumber = state?.competition_number || '—';
  const eligible = state?.eligible_count || 0;
  const capacity = state?.ticket_capacity || 0;
  const drawDateText = state?.draw_date ? new Date(state.draw_date).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : 'Draw date not set';
  const drawTimeText = state?.draw_date ? new Date(state.draw_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Time not set';
  const liveDateText = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const liveTimeText = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return <main className={`broadcast-page ${transparent ? 'transparent' : ''} ${compact ? 'compact' : ''} ${safeObs ? 'safe-obs' : ''}`}>
    <section className="broadcast-stage">
      <header className="broadcast-header">
        <img src="/prizetown-logo.png" alt="Prizetown" />
        <div>
          <h1>{title}</h1>
          <p>Competition {competitionNumber} · Draw {state?.draw_date ? fmtDate(state.draw_date) : 'date not set'}</p>
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

      <div className="broadcast-main">
        {state?.show_arnold !== false && <ArnoldBroadcastHost mode={mode} winner={displayWinner} />}
        <div className="broadcast-wheel-wrap reveal-machine-wrap">
          <div className="broadcast-datetime-strip">
            <span><strong>Draw:</strong> {drawDateText}</span>
            <span><strong>Time:</strong> {drawTimeText}</span>
            <span><strong>Live:</strong> {liveTimeText}</span>
          </div>
          <TrustedWheelDraw mode={mode} winner={displayWinner} tickets={tickets} rotation={rotation} label="PRIZETOWN FINAL DRAW" />
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
          </div> : <div className="broadcast-waiting">
            <h2>Awaiting spin</h2>
            <p>Draw date and live clock are shown on this broadcast screen for OBS. The draw animation is visual only; the confirmed winner appears here after the locked draw completes.</p>
          </div>}
        </aside>
      </div>

      <footer className="broadcast-footer">
        <span>Official Prizetown live draw</span>
        <span>{state?.updated_at ? `Last sync ${new Date(state.updated_at).toLocaleTimeString()}` : 'Waiting for sync'}</span>
      </footer>
    </section>
  </main>;
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

function BuiltInDrawWheel({ competitions, setMessage, settings = {} }) {
  const [competitionId, setCompetitionId] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [winner, setWinner] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [drawTime, setDrawTime] = useState(new Date());
  const [spinSoundUrl, setSpinSoundUrl] = useState(localStorage.getItem('prizetownSpinSoundUrl') || '');
  const arnoldModuleEnabled = featureEnabled(settings, 'module_arnold_enabled');
  const [showArnold, setShowArnold] = useState(() => {
    const saved = localStorage.getItem('prizetown_draw_show_arnold');
    return saved === null ? true : saved !== 'false';
  });
  const [spinSpeed, setSpinSpeed] = useState(() => localStorage.getItem('prizetown_draw_spin_speed') || 'standard');
  const spinAudioRef = useRef(null);

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
    setMessage(`Spin speed set to ${next}.`);
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
    setEntries(rows);
    setWinner(null);
    setSpinning(false);
    setRotation(0);
    setMessage(`${rows.length} test tickets loaded for draw preview.`);
    publishBroadcastState({
      ...broadcastBase(rows, 'ready', null, { ticket_capacity: count }),
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
      ...extra
    };
  }

  function openBroadcastScreen() {
    const live = window.open('/draw-live?obs=1&v=93', 'prizetown_live_draw', 'width=1280,height=900,menubar=no,toolbar=no,location=no,status=no');
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
      setMessage('OBS test sent. Open /draw-live?obs=1&v=93 or refresh the OBS Browser Source.');
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
      setEntries(rows);
      setMessage(`${rows.length} eligible draw tickets loaded.`);
      publishBroadcastState(broadcastBase(rows, 'ready', null));
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

    if (competitionId) {
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
    }

    const finalWinner = {
      ticket_number: picked.ticket_number,
      customer_name: picked.customer_name || picked.name || 'Customer',
      email: picked.email || picked.customer_email || ''
    };
    const wheelTickets = buildWheelTickets(officialRows, finalWinner);
    const targetRotation = wheelRotationForWinner(wheelTickets, picked.ticket_number, rotation);
    const spinMs = speedMs();
    const spinId = `${competitionId || 'demo'}-${Date.now()}-${picked.ticket_number}`;
    const revealAt = new Date(Date.now() + spinMs + 700).toISOString();

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
        draw_method: secureMethod
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
          draw_method: secureMethod
        }),
        eligible_count: officialRows.length,
        visual_tickets: wheelTickets
      });
      setMessage(`Winner selected securely: ticket #${picked.ticket_number} - ${finalWinner.customer_name || finalWinner.email || 'Customer'} (${spinSpeed} speed).`);
      stopSpinSound();
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
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prizetown-draw-${competitionId || 'competition'}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return <section className="panel draw-room"><audio ref={spinAudioRef} src={spinSoundUrl || undefined} preload="auto" />
    {arnoldModuleEnabled && showArnold && <div className="draw-arnold-row">
      <ArnoldHost
        stage={spinning ? 'spinning' : winner ? 'winner' : entryList.length > 0 ? 'ready' : 'idle'}
        caption={spinning ? 'Arnold says: the wheel is spinning now!' : winner ? `Arnold says: winning ticket #${winner.ticket_number} — ${winner.customer_name || winner.name || 'Customer'}!` : entryList.length > 0 ? `${entryList.length} tickets loaded. Arnold is ready to host the draw.` : 'Choose a competition and load tickets to start the final draw.'}
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
        <select value={competitionId} onChange={e => { setCompetitionId(e.target.value); setEntries([]); setWinner(null); }}>
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
      <button className="primary live-draw-start" onClick={spinDraw} disabled={spinning || entryList.length === 0}>{spinning ? 'Live draw running...' : 'Start Live Draw'}</button>
      <button className="secondary" onClick={openBroadcastScreen}>Open Live Draw Window</button>
      {arnoldModuleEnabled && <button className={showArnold ? 'primary arnold-toggle-on' : 'secondary'} type="button" onClick={toggleArnold}>{showArnold ? 'Arnold On' : 'Arnold Off'}</button>}
      <button className="secondary" onClick={csvDownload} disabled={entryList.length === 0}>Download entries CSV</button>
      <label className="sound-upload-button">Upload spin sound<input type="file" accept="audio/*" onChange={uploadSpinSound} /></label>
      {spinSoundUrl && <button className="secondary" type="button" onClick={() => { stopSpinSound(); setSpinSoundUrl(''); localStorage.removeItem('prizetownSpinSoundUrl'); setMessage('Spin sound removed.'); }}>Remove sound</button>}
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
      <div><strong>{competition?.max_tickets || 0}</strong><span>ticket capacity</span></div>
    </div>
    <p className="muted draw-sync-note">Use Start Live Draw to open the live draw window and run a secure server-side draw. The browser only displays the locked result selected by the API.</p>

    <div className="wheel-stage reveal-machine-wrap admin-reveal-machine-wrap">
      <TrustedWheelDraw mode={spinning ? 'spinning' : winner ? 'winner' : 'idle'} winner={winner} tickets={visualEntries} rotation={rotation} label="ADMIN DRAW PREVIEW" />
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


function Admin({ settings, setSettings, competitions, entries, orders, auditLogs, instantWins, postcodeZones = [], postcodeAssignments = [], reload, setMessage, setPage }) {
  const empty = { title: '', slug: '', description: '', question: '', answer: '', free_entry_text: '', rules_text: '', closes_at: '', min_age: 18, age_restricted: true, ticket_price_pence: 199, max_tickets: 100, max_per_user: 10, draw_at: '', status: 'draft', image_url: '', postcode_mode: 'all', prize_cost_pence: 0, marketing_budget_pence: 0, other_buffer_pence: 0, payment_fee_percent: 4, vat_enabled: false, auto_draw_enabled: false };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
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


  const liveCount = competitions.filter(c => c.status === 'active').length;
  const totalTickets = entries.length;
  const revenue = orders.reduce((sum, o) => sum + Number(o.total_pence || 0), 0);
  const instantClaimed = instantWins.filter(w => w.status === 'claimed').length;

  function updateField(key, value) { const next = { ...form, [key]: value }; if (key === 'title' && !editing) next.slug = slugify(value); setForm(next); }
  async function save(e) { e.preventDefault(); try { await api(editing ? `/admin/competitions/${editing}` : '/admin/competitions', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(form) }); setMessage(editing ? 'Competition updated.' : 'Competition added.'); setForm(empty); setEditing(null); setActiveTab('competitions'); reload(); } catch (err) { setMessage(err.message); } }
  async function uploadFile(e) { const file = e.target.files?.[0]; if (!file) return; const body = new FormData(); body.append('file', file); try { const data = await api('/admin/upload', { method: 'POST', body }); setForm({ ...form, image_url: data.url }); } catch (err) { setMessage(err.message); } }
  async function remove(id) { if (!confirm('Delete this competition?')) return; await api(`/admin/competitions/${id}`, { method: 'DELETE' }); setMessage('Competition deleted.'); reload(); }
  function edit(c) { setEditing(c.id); setForm({ ...c, draw_at: c.draw_at ? c.draw_at.slice(0, 16) : '', closes_at: c.closes_at ? c.closes_at.slice(0, 16) : '' }); setActiveTab('competition-form'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  async function saveSettings(e) { e.preventDefault(); try { const saved = await api('/admin/settings', { method: 'PATCH', body: JSON.stringify(settingsForm) }); setSettings({ ...defaultSettings, ...saved }); setMessage('Site settings saved.'); } catch (err) { setMessage(err.message); } }
  async function saveFreeEntry(e) { e.preventDefault(); try { const saved = await api('/admin/free-entry', { method: 'POST', body: JSON.stringify(freeForm) }); setMessage(`Manual/free entry recorded. Ticket #${saved.entry.ticket_number}`); setFreeForm({ competition_id: '', customer_name: '', customer_email: '', postal_reference: '', notes: '' }); reload(); } catch (err) { setMessage(err.message); } }
  async function saveInstantWin(e) { e.preventDefault(); try { const saved = await api('/admin/instant-wins', { method: 'POST', body: JSON.stringify(iwForm) }); setMessage(`Instant win added on ticket #${saved.winning_ticket_number}`); setIwForm({ competition_id: '', prize_title: '', prize_value_pence: 10000, winning_ticket_number: '' }); reload(); } catch (err) { setMessage(err.message); } }
  async function deleteInstant(id) { await api(`/admin/instant-wins/${id}`, { method: 'DELETE' }); setMessage('Instant win deleted.'); reload(); }
  async function seedDemo() { await api('/admin/seed-demo', { method: 'POST' }); setMessage('Starter competitions added.'); reload(); }
  function downloadPostcodeTemplate() {
    const headers = ['code','label','type','active','estimated_population','estimated_households','launch_priority','notes'];
    const sampleRows = [
      ['BB','Blackburn postcode area','area','TRUE','', '', 'high','Fill population/household estimates from Nomis or ONS data'],
      ['BB1','BB1 launch outcode','outcode','TRUE','42000','17000','high','Example local starter zone'],
      ['PR7','PR7 outcode','outcode','TRUE','','','normal','Example future zone']
    ];
    const csv = [headers, ...sampleRows].map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
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
    setActiveTab('profit-planner');
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
  function drawText() { return (drawData?.wheel_entries || []).join('\n'); }
  async function copyDrawList() { await navigator.clipboard.writeText(drawText()); setMessage('Draw list copied. Paste it into built-in Prizetown draw wheel if needed.'); }

  function downloadDrawCsv() {
    if (!drawData) return setMessage('Load a draw list first.');
    const header = 'ticket_number,customer_name,customer_email,payment_status\n';
    const lines = drawData.entries.map(e => [e.ticket_number, e.customer_name, e.customer_email, e.payment_status].map(v => `"${String(v || '').replaceAll('"', '""')}"`).join(',')).join('\n');
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

  const tabs = [
    ['overview', 'Overview', ClipboardList],
    ['competitions', 'Competitions', Trophy],
    ['competition-form', editing ? 'Edit competition' : 'Add competition', Plus],
    moduleInstantWins && ['instant-wins', 'Instant wins', Zap],
    moduleLiveDraw && ['draws', 'Final draw', ListChecks],
    ['free-entries', 'Free entries', Ticket],
    modulePostcodes && ['postcode-zones', 'Postcode Zones', Shield],
    modulePostcodes && ['postcode-assign', 'Assign Postcodes', Ticket],
    moduleProfitPlanner && ['profit-planner', 'Profit Planner', Ticket],
    ['modules', 'Modules', Shield],
    ['system-check', 'System Check', Shield],
    ['legal-text', 'Legal Text', Shield],
    ['settings', 'Site settings', Shield],
    ['audit', 'Audit log', ListChecks]
  ].filter(Boolean);

  return <main className="admin-main">
    <section className="admin-shell">
      <aside className="admin-menu panel">
        <h2>Admin</h2><p className="muted">Use the menu buttons to manage one area at a time.</p>
        <div className="admin-tabs">{tabs.map(([key, label, Icon]) => <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}><Icon size={17} /> {label}</button>)}</div>
        <button type="button" className="secondary full" onClick={seedDemo}>Add starter competitions</button>
      </aside>

      <section className="admin-content">
        {activeTab === 'overview' && <div className="panel"><h1>Dashboard overview</h1><div className="stat-grid"><div><strong>{competitions.length}</strong><span>Total competitions</span></div><div><strong>{liveCount}</strong><span>Live competitions</span></div><div><strong>{totalTickets}</strong><span>Tickets allocated</span></div><div><strong>{money(revenue)}</strong><span>Test order value</span></div><div><strong>{instantClaimed}/{instantWins.length}</strong><span>Instant wins claimed</span></div></div><div className="admin-split"><div><h2>Recent orders</h2>{orders.slice(0, 8).map(o => <div className="list-row entry-row" key={o.id}><div><strong>Order #{o.id}</strong><p>{o.customer_email} · {money(o.total_pence)} · {o.entry_count} entries · {o.status}</p></div></div>)}</div><div><h2>Recent entries</h2>{entries.slice(0, 8).map(e => <div className="list-row entry-row" key={e.id}><div><strong>{e.competition_title}</strong><p>{e.customer_email} · ticket #{e.ticket_number} · {e.payment_status}</p></div></div>)}</div></div></div>}

        {activeTab === 'competitions' && <div className="panel list-panel"><div className="row"><h1>Competitions</h1><button className="primary" onClick={() => { setEditing(null); setForm(empty); setActiveTab('competition-form'); }}><Plus size={16} /> Add competition</button></div>{competitions.length === 0 && <p className="muted">No competitions yet. Use Add starter competitions or add your first competition.</p>}{competitions.map(c => <div className="list-row competition-admin-row" key={c.id}><div><strong>{c.title}</strong><p>{c.status} · {c.entries_sold || 0}/{c.max_tickets} tickets · postcode: {assignmentLabel(c.id)} · instant {c.instant_win_claimed || 0}/{c.instant_win_total || 0} · closes {fmtDate(c.closes_at)}</p></div><button onClick={() => edit(c)}><Pencil size={16} /> Edit</button><button className="danger" onClick={() => remove(c.id)}><Trash2 size={16} /> Delete</button></div>)}</div>}

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

        {activeTab === 'instant-wins' && <div className="admin-split"><form className="panel" onSubmit={saveInstantWin}><h1>Add instant win prize</h1><label>Competition<select value={iwForm.competition_id} onChange={e => setIwForm({ ...iwForm, competition_id: e.target.value })} required><option value="">Choose competition</option>{competitions.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><div className="two"><label>Prize title<input value={iwForm.prize_title} onChange={e => setIwForm({ ...iwForm, prize_title: e.target.value })} placeholder="£100 Instant Win" required /></label><label>Prize value pence<input type="number" value={iwForm.prize_value_pence} onChange={e => setIwForm({ ...iwForm, prize_value_pence: Number(e.target.value) })} /></label></div><label>Winning ticket number<input type="number" value={iwForm.winning_ticket_number} onChange={e => setIwForm({ ...iwForm, winning_ticket_number: e.target.value })} required /></label><button className="primary full"><Zap size={16} /> Add instant win</button></form><div className="panel list-panel"><h1>Instant wins</h1>{instantWins.length === 0 && <p className="muted">No instant wins added yet.</p>}{instantWins.map(w => <div className="list-row entry-row" key={w.id}><div><strong>{w.prize_title}</strong><p>{w.competition_title} · ticket #{w.winning_ticket_number} · {w.status}</p></div>{w.status !== 'claimed' && <button className="danger" onClick={() => deleteInstant(w.id)}><Trash2 size={16} /></button>}</div>)}</div></div>}

        {activeTab === 'draws' && <div className="final-draw-only">
          <div className="panel auto-draw-note">
            <h1>Scheduled Auto Draws</h1>
            <p className="muted">For each competition, set a draw date/time and enable auto draw in Add/Edit Competition. When the competition is sold out or closed and the draw time arrives, Prizetown safely records the winner once and updates the OBS broadcast screen.</p>
            <button type="button" className="secondary" onClick={async () => { const r = await api('/admin/draw/run-due-auto', { method: 'POST' }); setMessage(`Auto draw check complete: ${safeArray(r.completed).length} completed.`); reload(); }}>Run due auto draws now</button>
          </div>
          <BuiltInDrawWheel competitions={competitions} setMessage={setMessage} settings={settingsForm} />
          <BroadcastMenuPanel setPage={setPage} settings={settingsForm} />
        </div>}

        {activeTab === 'modules' && <ModulesPanel settingsForm={settingsForm} setSettingsForm={setSettingsForm} saveSettings={saveSettings} />}

        {activeTab === 'system-check' && <SystemCheckPanel setMessage={setMessage} />}

        {activeTab === 'free-entries' && <div className="admin-split"><form className="panel" onSubmit={saveFreeEntry}><h1>Record manual/free entry</h1><label>Competition<select value={freeForm.competition_id} onChange={e => setFreeForm({ ...freeForm, competition_id: e.target.value })} required><option value="">Choose competition</option>{competitions.filter(c => c.status === 'active').map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><div className="two"><label>Customer name<input value={freeForm.customer_name} onChange={e => setFreeForm({ ...freeForm, customer_name: e.target.value })} required /></label><label>Customer email<input type="email" value={freeForm.customer_email} onChange={e => setFreeForm({ ...freeForm, customer_email: e.target.value })} required /></label></div><label>Postal/free-entry reference<input value={freeForm.postal_reference} onChange={e => setFreeForm({ ...freeForm, postal_reference: e.target.value })} /></label><label>Notes<textarea value={freeForm.notes} onChange={e => setFreeForm({ ...freeForm, notes: e.target.value })} /></label><button className="primary full">Record free entry</button></form><div className="panel list-panel"><h1>Recent entries</h1>{entries.slice(0, 20).map(e => <div className="list-row entry-row" key={e.id}><div><strong>{e.competition_title}</strong><p>{e.customer_email} · ticket #{e.ticket_number} · {e.payment_status}</p></div></div>)}</div></div>}


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
                <p>{z.label || (z.type === 'area' ? 'Postcode area' : 'Postcode outcode')} · {z.type} · {z.active ? 'active' : 'inactive'} · priority {z.launch_priority || 'normal'}</p>
                <div className="zone-metrics">
                  <span>Population: {Number(z.estimated_population || 0).toLocaleString()}</span>
                  <span>Households: {Number(z.estimated_households || 0).toLocaleString()}</span>
                  <span className={`zone-band ${z.recommendation?.band || 'unknown'}`}>{z.recommendation?.band || 'unknown'}</span>
                </div>
                <div className="zone-recommendation">
                  <b>Suggested:</b> {z.recommendation?.suggested_prize || 'Add population data'} · max tickets {z.recommendation?.suggested_max_tickets || 100}
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
                <span><strong>{z.code}</strong> {z.label ? `— ${z.label}` : ''} <em>({z.type})</em></span>
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
          <p className="muted">Edit the customer-facing legal pages. This is starter wording only — have it checked by a UK solicitor/accountant before taking large volumes of paid entries.</p>
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
          <h1>Site settings</h1>
          <div className="two">
            <label>Site name<input value={settingsForm.site_name || ''} onChange={e => setSettingsForm({ ...settingsForm, site_name: e.target.value })} /></label>
            <label>Support email<input type="email" value={settingsForm.support_email || ''} onChange={e => setSettingsForm({ ...settingsForm, support_email: e.target.value })} /></label>
          </div>
          <label>Hero title<input value={settingsForm.hero_title || ''} onChange={e => setSettingsForm({ ...settingsForm, hero_title: e.target.value })} /></label>
          <label>Hero text<textarea value={settingsForm.hero_text || ''} onChange={e => setSettingsForm({ ...settingsForm, hero_text: e.target.value })} /></label>
          <label>Footer text<textarea value={settingsForm.footer_text || ''} onChange={e => setSettingsForm({ ...settingsForm, footer_text: e.target.value })} /></label>
          <button className="primary full">Save site settings</button>
        </form>}

        {activeTab === 'audit' && <div className="panel list-panel"><h1>Audit log</h1>{(auditLogs || []).length === 0 && <p className="muted">No audit log entries yet.</p>}{(auditLogs || []).map(a => <div className="list-row entry-row" key={a.id}><div><strong>{a.action}</strong><p>{a.user_email} · {a.details} · {new Date(a.created_at).toLocaleString()}</p></div></div>)}</div>}
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
        <label className="check-row"><input type="checkbox" checked readOnly /> Essential cookies/local storage — required for login, basket and security</label>
        <label className="check-row"><input type="checkbox" disabled /> Analytics cookies — not active yet</label>
        <label className="check-row"><input type="checkbox" disabled /> Marketing cookies — not active yet</label>
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

function Winners({ winners, instantWinners }) { return <main><section className="grid-section"><h1>Winners</h1><h2>Latest instant winners</h2>{instantWinners.length === 0 && <p className="muted">No instant winners yet.</p>}<div className="cards">{instantWinners.map(w => <article className="card" key={w.id}><div className="placeholder"><Zap /></div><div className="card-body"><h3>{w.winner_name || 'Customer'}</h3><p>Won {w.prize_title}</p><p className="muted">{w.competition_title} · Ticket #{w.winning_ticket_number}</p></div></article>)}</div><h2>Final draw winners</h2>{winners.length === 0 && <p className="muted">No final draw winners announced yet.</p>}<div className="cards">{winners.map(w => <article className="card" key={w.id}>{w.image_url ? <img src={imageUrl(w.image_url)} alt="" /> : <div className="placeholder"><Trophy /></div>}<div className="card-body"><h3>{w.winner_name}</h3><p>{w.prize_title}</p><p className="muted">{w.competition_title}</p></div></article>)}</div></section></main>; }

window.__PRIZETOWN_BUILD__ = 'Prizetown web build v93';
createRoot(document.getElementById('root')).render(<AppErrorBoundary><App /></AppErrorBoundary>);
