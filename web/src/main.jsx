import React, { useEffect, useMemo, useState } from 'react';
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
  const text = `${c?.title || ''} ${c?.description || ''}`.toLowerCase();
  if (/car|bmw|audi|mercedes|vw|volkswagen|ford|range rover|vehicle/.test(text)) return { key: 'car', label: 'Car', emoji: '🚗' };
  if (/cash|£|pound|money|voucher|prize pot/.test(text)) return { key: 'cash', label: 'Cash', emoji: '💷' };
  if (/holiday|trip|travel|flight|hotel|disney|dubai|cruise/.test(text)) return { key: 'holiday', label: 'Holiday', emoji: '✈️' };
  if (/iphone|ipad|phone|ps5|playstation|xbox|nintendo|switch|laptop|macbook|tech|console|tv/.test(text)) return { key: 'tech', label: 'Tech', emoji: '📱' };
  if (/garden|kitchen|sofa|furniture|home|appliance/.test(text)) return { key: 'home', label: 'Home', emoji: '🏠' };
  return { key: 'prize', label: 'Prize', emoji: '🎁' };
}
function shortPrizeLabel(c) {
  const title = String(c?.title || 'Featured Prize').replace(/\s+/g, ' ').trim();
  return title.length > 28 ? `${title.slice(0, 28)}…` : title;
}

const defaultSettings = {
  site_name: 'Prizetown', support_email: 'support@prizetown.local', hero_eyebrow: 'Custom competition platform',
  hero_title: 'Win big prizes with Prizetown', hero_text: 'Browse live competitions, add tickets to your basket, answer the entry question, and checkout to receive ticket numbers.',
  footer_text: 'Please play responsibly. Free entry routes and terms should be checked before public launch.', free_entry_global: 'Postal/free entry route details can be added here from Admin Settings.',
  terms_text: 'Add your competition terms, eligibility rules, draw process, free entry route and privacy/contact wording here before going public.', responsible_play_text: '18+ only. Please enter responsibly. Do not spend more than you can afford.',
  age_confirmation_text: 'I confirm I am 18 or over and I agree to the competition rules and free-entry terms.'
};
function initialPage() { const p = window.location.pathname.toLowerCase(); if (p.includes('/admin')) return 'admin'; if (p.includes('/account')) return 'account'; if (p.includes('/cart')) return 'cart'; if (p.includes('/winners')) return 'winners'; return 'home'; }

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
  const [message, setMessage] = useState('');
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem('prizetown_cart') || '[]'));
  const [selected, setSelected] = useState(null);

  function setPage(next) { setPageState(next); window.history.replaceState(null, '', next === 'home' ? '/' : `/${next}`); }
  function saveCart(next) { setCart(next); localStorage.setItem('prizetown_cart', JSON.stringify(next)); }
  async function load() {
    const [comps, wins, siteSettings, iw] = await Promise.all([api('/competitions'), api('/winners'), api('/settings'), api('/instant-winners')]);
    setCompetitions(comps); setWinners(wins); setSettings({ ...defaultSettings, ...siteSettings }); setInstantWinners(iw);
  }
  async function loadAccount() { if (!user) return; const [myEntries, myOrders] = await Promise.all([api('/me/entries'), api('/me/orders')]); setEntries(myEntries); setOrders(myOrders); }
  async function loadAdminData() { if (user?.role !== 'admin') return; const [rows, orderRows, auditRows, iw] = await Promise.all([api('/admin/entries'), api('/admin/orders'), api('/admin/audit-logs'), api('/admin/instant-wins')]); setAdminEntries(rows); setAdminOrders(orderRows); setAdminAudit(auditRows); setAdminInstantWins(iw); }
  useEffect(() => { load().catch(err => setMessage(err.message)); }, []);
  useEffect(() => { if (user) loadAccount().catch(() => {}); }, [user]);
  useEffect(() => { if (user?.role === 'admin') loadAdminData().catch(() => {}); }, [user]);
  function logout() { localStorage.removeItem('prizetown_token'); localStorage.removeItem('prizetown_user'); setUser(null); setEntries([]); setOrders([]); setPage('home'); }
  const active = competitions.filter(c => c.status === 'active');
  const cartCount = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  return <div>
    <div className="welcome-marquee" aria-label="Welcome message"><div className="marquee-track"><span>Welcome to {settings.site_name || 'Prizetown'}!</span><span>New competitions added regularly</span><span>Instant wins and final draw prizes</span><span>Enter responsibly and good luck</span><span>Welcome to {settings.site_name || 'Prizetown'}!</span><span>New competitions added regularly</span><span>Instant wins and final draw prizes</span><span>Enter responsibly and good luck</span></div></div>
    <header className="topbar"><button className="brand" onClick={() => setPage('home')}><Gift /> {settings.site_name || 'Prizetown'}</button><nav>
      <button onClick={() => setPage('home')}>Competitions</button><button onClick={() => setPage('winners')}>Winners</button>
      {user && <button onClick={() => { setPage('account'); loadAccount().catch(err => setMessage(err.message)); }}><ClipboardList size={16} /> My entries</button>}
      <button onClick={() => setPage('cart')}><ShoppingCart size={16} /> Basket {cartCount > 0 ? `(${cartCount})` : ''}</button>
      {user?.role === 'admin' && <button onClick={() => { setPage('admin'); loadAdminData().catch(err => setMessage(err.message)); }}><Shield size={16} /> Admin</button>}
      {user ? <button onClick={logout}><LogOut size={16} /> Logout</button> : <button onClick={() => setPage('login')}><User size={16} /> Login</button>}
    </nav></header>
    {message && <div className="notice">{message}<button onClick={() => setMessage('')}>Dismiss</button></div>}
    {page === 'home' && <Home settings={settings} competitions={active} instantWinners={instantWinners} user={user} setPage={setPage} cart={cart} saveCart={saveCart} setMessage={setMessage} selected={selected} setSelected={setSelected} />}
    {page === 'login' && <Login setUser={setUser} setPage={setPage} setMessage={setMessage} />}
    {page === 'winners' && <Winners winners={winners} instantWinners={instantWinners} />}
    {page === 'cart' && <Cart settings={settings} user={user} setPage={setPage} cart={cart} saveCart={saveCart} reload={load} reloadAccount={loadAccount} setMessage={setMessage} />}
    {page === 'account' && <Account user={user} entries={entries} orders={orders} setPage={setPage} reload={loadAccount} />}
    {page === 'admin' && user?.role === 'admin' && <Admin settings={settings} setSettings={setSettings} competitions={competitions} entries={adminEntries} orders={adminOrders} auditLogs={adminAudit} instantWins={adminInstantWins} reload={async () => { await load(); await loadAdminData(); }} setMessage={setMessage} />}
    {page === 'admin' && user?.role !== 'admin' && <Login setUser={setUser} setPage={setPage} setMessage={setMessage} />}
  </div>;
}

function Home({ settings, competitions, instantWinners, user, setPage, cart, saveCart, setMessage, selected, setSelected }) {
  return <main>
    <section className="hero compact-hero"><div><p className="eyebrow"><Sparkles size={16} /> {settings.hero_eyebrow}</p><h1>{settings.hero_title}</h1><p>{settings.hero_text}</p>{!user && <button className="primary" onClick={() => setPage('login')}>Create account / login</button>}</div><div className="hero-card"><Zap size={40} /><h3>Pick a competition</h3><p>Use the scrolling competition posts below to jump straight into prize details, ticket choices, entry lists and instant-win prizes without cluttering the homepage.</p></div></section>
    <CompetitionScroller competitions={competitions} setSelected={setSelected} />
    {selected && <CompetitionDetail c={selected} cart={cart} saveCart={saveCart} setMessage={setMessage} setPage={setPage} close={() => setSelected(null)} />}
    <section className="ticker winners-ticker"><strong>Latest instant winners</strong>{instantWinners.length === 0 ? <span>No instant winners yet — demo instant prizes are ready to trigger.</span> : instantWinners.slice(0, 10).map(w => <span key={w.id}>{w.winner_name || 'Customer'} won {w.prize_title} on {w.competition_title}</span>)}</section>
    <section className="panel info-panel"><h2>Free entry and terms</h2><p>{settings.free_entry_global}</p><p className="muted">{settings.responsible_play_text}</p><details><summary>Site terms / legal text</summary><p>{settings.terms_text}</p></details><p className="muted">{settings.footer_text}</p></section>
  </main>;
}

function CompetitionScroller({ competitions, setSelected }) {
  if (competitions.length === 0) return <section className="panel info-panel"><h2>Live competitions</h2><p className="muted">No active competitions yet. Use Admin → Seed demo competitions to fill this page.</p></section>;
  const scrolling = competitions.length > 1 ? [...competitions, ...competitions] : competitions;
  function openCompetition(c) { setSelected(c); setTimeout(() => window.scrollTo({ top: 180, behavior: 'smooth' }), 0); }
  return <section className="competition-scroll-section"><div className="section-head"><div><p className="eyebrow"><Ticket size={16} /> Live competitions</p><h2>Tap a prize post to enter</h2></div><span className="muted">Hover or touch to pause the scroll</span></div><div className="competition-marquee"><div className="competition-track">{scrolling.map((c, idx) => <CompetitionPost key={`${c.id}-${idx}`} c={c} onOpen={() => openCompetition(c)} />)}</div></div></section>;
}

function CompetitionPost({ c, onOpen }) {
  const percent = Math.min(100, Math.round(((c.entries_sold || 0) / c.max_tickets) * 100));
  const remaining = Math.max(0, c.max_tickets - (c.entries_sold || 0));
  const theme = competitionTheme(c);
  return <button className="competition-post" onClick={onOpen} title={`Open ${c.title}`}>
    <div className="post-visual-wrap">
      {c.image_url ? <img src={imageUrl(c.image_url)} alt="" /> : <div className={`post-placeholder theme-${theme.key}`}><span className="visual-badge">{theme.label}</span><div className="visual-icon" aria-hidden="true">{theme.emoji}</div><strong>{shortPrizeLabel(c)}</strong></div>}
      <span className="post-corner-badge">{theme.label}</span>
    </div>
    <div className="post-copy"><span className="badge">{daysLeft(c.closes_at) === 'Closed' ? 'Closed' : 'Live now'}</span><strong>{c.title}</strong><small>{money(c.ticket_price_pence)} per entry · {percent}% sold</small><small>{remaining} tickets remaining</small>{Number(c.instant_win_total || 0) > 0 && <em><Zap size={13} /> {c.instant_win_claimed || 0}/{c.instant_win_total} instant wins found</em>}</div></button>;
}

function CompetitionCard({ c, cart, saveCart, setMessage, setPage, setSelected }) {
  const percent = Math.min(100, Math.round(((c.entries_sold || 0) / c.max_tickets) * 100)); const remaining = Math.max(0, c.max_tickets - (c.entries_sold || 0));
  return <article className="card comp-card">{c.image_url ? <img src={imageUrl(c.image_url)} alt="" /> : <div className="placeholder prize-bg"><Gift size={36} /></div>}<div className="card-body"><div className="tag-row"><span className="badge">{daysLeft(c.closes_at) === 'Closed' ? 'Closed' : 'ENDS SOON'}</span>{Number(c.instant_win_total || 0) > 0 && <span className="badge hot"><Zap size={13} /> Instant wins</span>}</div><div className="row"><h3>{c.title}</h3><span>{money(c.ticket_price_pence)} Per Entry</span></div><p>{c.description}</p><p className="muted"><Clock size={14} /> Draw on {fmtDate(c.draw_at)}</p><div className="progress"><span style={{ width: `${percent}%` }} /></div><p className="muted"><strong>{percent}% SOLD</strong> · {c.entries_sold || 0} / {c.max_tickets} · {remaining} tickets remaining</p>{Number(c.instant_win_total || 0) > 0 && <p className="instant-count"><Zap size={15} /> {c.instant_win_claimed || 0}/{c.instant_win_total} instant wins found</p>}<button className="primary full" onClick={() => setSelected(c)}>Enter now</button><button className="secondary full" onClick={() => setSelected(c)}>View details</button></div></article>;
}

function CompetitionDetail({ c, cart, saveCart, setMessage, setPage, close }) {
  const [quantity, setQuantity] = useState(1); const [answer, setAnswer] = useState(''); const [instantWins, setInstantWins] = useState([]); const [entryList, setEntryList] = useState([]);
  const percent = Math.min(100, Math.round(((c.entries_sold || 0) / c.max_tickets) * 100)); const remaining = Math.max(0, c.max_tickets - (c.entries_sold || 0));
  useEffect(() => { api(`/competitions/${c.id}/instant-wins`).then(setInstantWins).catch(() => setInstantWins([])); api(`/competitions/${c.id}/entries`).then(setEntryList).catch(() => setEntryList([])); }, [c.id]);
  function add(qtyOverride) { const qty = Math.max(1, Math.min(Number(qtyOverride || quantity || 1), remaining, c.max_per_user)); if (c.question && !answer.trim()) return setMessage('Please answer the entry question before adding to basket.'); const existing = cart.find(item => item.competition_id === c.id); const next = existing ? cart.map(item => item.competition_id === c.id ? { ...item, quantity: Math.min(c.max_per_user, item.quantity + qty), answer } : item) : [...cart, { competition_id: c.id, title: c.title, unit_price_pence: c.ticket_price_pence, quantity: qty, answer, question: c.question, image_url: c.image_url }]; saveCart(next); setMessage(`${qty} ticket(s) added to basket.`); }
  return <section className="detail panel"><button className="link" onClick={close}>Close details</button><div className="detail-grid"><div>{c.image_url ? <img className="detail-img" src={imageUrl(c.image_url)} alt="" /> : <div className="placeholder detail-img"><Gift size={60} /></div>}<div className="share-row"><span>Share:</span><button>Facebook</button><button>Instagram</button><button>TikTok</button></div></div><div><h1>{c.title}</h1><p className="price-big">{money(c.ticket_price_pence)} Per Entry</p><div className="countdown"><div>{daysLeft(c.closes_at)}</div><small>Draw on {fmtDate(c.draw_at)}</small></div><div className="progress"><span style={{ width: `${percent}%` }} /></div><p><strong>{percent}% Sold</strong> · {c.entries_sold || 0}/{c.max_tickets} · {remaining} tickets remaining · max {c.max_per_user} per user</p>{c.question && <label>Entry question<input value={answer} onChange={e => setAnswer(e.target.value)} placeholder={c.question} /></label>}<div className="quick-picks"><button onClick={() => add(1)}>+1</button><button onClick={() => add(5)}>+5</button><button onClick={() => add(10)}>+10</button><button onClick={() => add(25)}>+25</button></div><div className="two compact"><label>Tickets<input type="number" min="1" max={Math.min(c.max_per_user, remaining)} value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Total<input readOnly value={money((Number(quantity || 1)) * c.ticket_price_pence)} /></label></div><button className="primary full" onClick={() => add()}><ShoppingCart size={16} /> Add to basket</button><button className="secondary full" onClick={() => setPage('cart')}>Checkout</button></div></div><div className="detail-tabs"><details open><summary>Prize Description</summary><p>{c.description}</p></details><details open><summary>Instant Wins</summary>{instantWins.length === 0 ? <p className="muted">No instant wins on this competition.</p> : <div className="instant-grid">{instantWins.map(w => <div className={`instant-prize ${w.public_status}`} key={w.id}><strong>{w.prize_title}</strong><span>{w.prize_value_pence ? money(w.prize_value_pence) : 'Bonus'}</span><small>{w.public_status === 'claimed' ? `Won by ${w.winner_name || 'Customer'} · ticket #${w.winning_ticket_number}` : 'Available'}</small></div>)}</div>}<p className="muted">If any allocated ticket number matches a pre-set instant-win ticket, the prize is marked as won automatically.</p></details><details><summary>Entry List</summary>{entryList.length === 0 ? <p className="muted">No entries yet.</p> : <div className="entry-chip-list">{entryList.slice(0, 500).map(e => <span key={e.ticket_number}>#{e.ticket_number}</span>)}</div>}</details><details><summary>Free Entry Route</summary><p>{c.free_entry_text || 'Add free-entry text in admin before going public.'}</p></details><details><summary>Competition Rules</summary><p>{c.rules_text || 'Add competition rules in admin before going public.'}</p></details></div></section>;
}

function Login({ setUser, setPage, setMessage }) { const [mode, setMode] = useState('login'); const [form, setForm] = useState({ name: '', email: '', password: '' }); async function submit(e) { e.preventDefault(); try { const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: JSON.stringify(form) }); localStorage.setItem('prizetown_token', data.token); localStorage.setItem('prizetown_user', JSON.stringify(data.user)); setUser(data.user); setMessage(`Logged in as ${data.user.email}`); setPage(data.user.role === 'admin' ? 'admin' : 'home'); } catch (err) { setMessage(err.message); } } return <main className="narrow"><form className="panel" onSubmit={submit}><h2>{mode === 'login' ? 'Login' : 'Create account'}</h2>{mode === 'register' && <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>}<label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label><label>Password<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></label><button className="primary full">{mode === 'login' ? 'Login' : 'Register'}</button><button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Need an account?' : 'Already registered?'}</button></form></main>; }

function Cart({ settings, user, setPage, cart, saveCart, reload, reloadAccount, setMessage }) { const [busy, setBusy] = useState(false); const [ageConfirmed, setAgeConfirmed] = useState(false); const total = cart.reduce((sum, item) => sum + item.quantity * item.unit_price_pence, 0); function updateQty(id, quantity) { saveCart(cart.map(item => item.competition_id === id ? { ...item, quantity: Math.max(1, Number(quantity || 1)) } : item)); } function updateAnswer(id, answer) { saveCart(cart.map(item => item.competition_id === id ? { ...item, answer } : item)); } function remove(id) { saveCart(cart.filter(item => item.competition_id !== id)); } async function checkout() { if (!user) return setPage('login'); if (cart.length === 0) return setMessage('Basket is empty.'); try { setBusy(true); const data = await api('/orders', { method: 'POST', body: JSON.stringify({ items: cart, age_confirmed: ageConfirmed }) }); saveCart([]); const instant = data.entries.filter(e => e.instant_win).map(e => e.instant_win.prize_title); setMessage(`Order #${data.order.id} created. Tickets: ${data.entries.map(e => e.ticket_number).join(', ')}${instant.length ? ` Instant win: ${instant.join(', ')}` : ''}`); await reload(); await reloadAccount(); setPage('account'); } catch (err) { setMessage(err.message); } finally { setBusy(false); } } return <main><section className="panel"><h1>Basket</h1><p className="muted">This is still test checkout. Payment provider approval/integration comes later.</p>{cart.length === 0 && <p>Your basket is empty.</p>}{cart.map(item => <div className="basket-row" key={item.competition_id}>{item.image_url ? <img src={imageUrl(item.image_url)} alt="" /> : <div className="mini-placeholder"><Gift /></div>}<div><strong>{item.title}</strong><p>{money(item.unit_price_pence)} each</p>{item.question && <label>Answer<input value={item.answer || ''} onChange={e => updateAnswer(item.competition_id, e.target.value)} placeholder={item.question} /></label>}</div><label>Qty<input type="number" min="1" value={item.quantity} onChange={e => updateQty(item.competition_id, e.target.value)} /></label><strong>{money(item.quantity * item.unit_price_pence)}</strong><button className="danger" onClick={() => remove(item.competition_id)}><Trash2 size={16} /></button></div>)}<div className="checkout-bar"><h2>Total: {money(total)}</h2><button className="secondary" onClick={() => setPage('home')}>Continue browsing</button><div className="checkout-compliance"><label className="check-row"><input type="checkbox" checked={ageConfirmed} onChange={e => setAgeConfirmed(e.target.checked)} /> <span>{settings.age_confirmation_text}</span></label><p className="muted">{settings.responsible_play_text}</p></div><button className="primary" disabled={busy || cart.length === 0} onClick={checkout}><Ticket size={16} /> {busy ? 'Creating order...' : 'Checkout and allocate tickets'}</button></div></section></main>; }

function Account({ user, entries, orders, setPage, reload }) { if (!user) return <main className="narrow"><div className="panel"><h2>Please login</h2><button className="primary" onClick={() => setPage('login')}>Login</button></div></main>; return <main><section className="admin-layout"><div className="panel list-panel"><div className="row"><h2>My entries</h2><button className="secondary" onClick={reload}>Refresh</button></div>{entries.length === 0 && <p className="muted">No entries yet.</p>}{entries.map(e => <div className="list-row entry-row" key={e.id}><div><strong>{e.competition_title}</strong><p>Ticket #{e.ticket_number} · {e.payment_status}</p></div></div>)}</div><div className="panel list-panel"><h2>My orders</h2>{orders.length === 0 && <p className="muted">No orders yet.</p>}{orders.map(o => <div className="list-row entry-row" key={o.id}><div><strong>Order #{o.id}</strong><p>{money(o.total_pence)} · {o.entry_count} entries · {o.status}</p></div></div>)}</div></section></main>; }

function Admin({ settings, setSettings, competitions, entries, orders, auditLogs, instantWins, reload, setMessage }) {
  const empty = { title: '', slug: '', description: '', question: '', answer: '', free_entry_text: '', rules_text: '', closes_at: '', min_age: 18, age_restricted: true, ticket_price_pence: 199, max_tickets: 100, max_per_user: 10, draw_at: '', status: 'draft', image_url: '' };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [settingsForm, setSettingsForm] = useState({ ...defaultSettings, ...settings });
  const [freeForm, setFreeForm] = useState({ competition_id: '', customer_name: '', customer_email: '', postal_reference: '', notes: '' });
  const [iwForm, setIwForm] = useState({ competition_id: '', prize_title: '', prize_value_pence: 10000, winning_ticket_number: '' });
  useEffect(() => { setSettingsForm({ ...defaultSettings, ...settings }); }, [settings]);

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
  async function seedDemo() { await api('/admin/seed-demo', { method: 'POST' }); setMessage('Demo competitions added.'); reload(); }

  const tabs = [
    ['overview', 'Overview', ClipboardList], ['competitions', 'Competitions', Trophy], ['competition-form', editing ? 'Edit competition' : 'Add competition', Plus],
    ['instant-wins', 'Instant wins', Zap], ['free-entries', 'Free entries', Ticket], ['settings', 'Site settings', Shield], ['audit', 'Audit log', ListChecks]
  ];

  return <main className="admin-main">
    <section className="admin-shell">
      <aside className="admin-menu panel">
        <h2>Admin</h2><p className="muted">Use the menu buttons to manage one area at a time.</p>
        <div className="admin-tabs">{tabs.map(([key, label, Icon]) => <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}><Icon size={17} /> {label}</button>)}</div>
        <button type="button" className="secondary full" onClick={seedDemo}>Seed demo competitions</button>
      </aside>

      <section className="admin-content">
        {activeTab === 'overview' && <div className="panel"><h1>Dashboard overview</h1><div className="stat-grid"><div><strong>{competitions.length}</strong><span>Total competitions</span></div><div><strong>{liveCount}</strong><span>Live competitions</span></div><div><strong>{totalTickets}</strong><span>Tickets allocated</span></div><div><strong>{money(revenue)}</strong><span>Test order value</span></div><div><strong>{instantClaimed}/{instantWins.length}</strong><span>Instant wins claimed</span></div></div><div className="admin-split"><div><h2>Recent orders</h2>{orders.slice(0, 8).map(o => <div className="list-row entry-row" key={o.id}><div><strong>Order #{o.id}</strong><p>{o.customer_email} · {money(o.total_pence)} · {o.entry_count} entries · {o.status}</p></div></div>)}</div><div><h2>Recent entries</h2>{entries.slice(0, 8).map(e => <div className="list-row entry-row" key={e.id}><div><strong>{e.competition_title}</strong><p>{e.customer_email} · ticket #{e.ticket_number} · {e.payment_status}</p></div></div>)}</div></div></div>}

        {activeTab === 'competitions' && <div className="panel list-panel"><div className="row"><h1>Competitions</h1><button className="primary" onClick={() => { setEditing(null); setForm(empty); setActiveTab('competition-form'); }}><Plus size={16} /> Add competition</button></div>{competitions.length === 0 && <p className="muted">No competitions yet. Use Seed demo competitions or add your first competition.</p>}{competitions.map(c => <div className="list-row competition-admin-row" key={c.id}><div><strong>{c.title}</strong><p>{c.status} · {c.entries_sold || 0}/{c.max_tickets} tickets · instant {c.instant_win_claimed || 0}/{c.instant_win_total || 0} · closes {fmtDate(c.closes_at)}</p></div><button onClick={() => edit(c)}><Pencil size={16} /> Edit</button><button className="danger" onClick={() => remove(c.id)}><Trash2 size={16} /> Delete</button></div>)}</div>}

        {activeTab === 'competition-form' && <form className="panel" onSubmit={save}><div className="row"><h1>{editing ? 'Edit competition' : 'Add competition'}</h1>{editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setForm(empty); }}>Cancel edit</button>}</div><label>Title<input value={form.title} onChange={e => updateField('title', e.target.value)} required /></label><label>Slug<input value={form.slug} onChange={e => updateField('slug', e.target.value)} required /></label><label>Description<textarea value={form.description} onChange={e => updateField('description', e.target.value)} /></label><div className="two"><label>Price pence<input type="number" value={form.ticket_price_pence} onChange={e => updateField('ticket_price_pence', Number(e.target.value))} /></label><label>Max tickets<input type="number" value={form.max_tickets} onChange={e => updateField('max_tickets', Number(e.target.value))} /></label></div><div className="two"><label>Max per user<input type="number" value={form.max_per_user} onChange={e => updateField('max_per_user', Number(e.target.value))} /></label><label>Status<select value={form.status} onChange={e => updateField('status', e.target.value)}><option>draft</option><option>active</option><option>closed</option></select></label></div><div className="two"><label>Closing date<input type="datetime-local" value={form.closes_at || ''} onChange={e => updateField('closes_at', e.target.value)} /></label><label>Draw date<input type="datetime-local" value={form.draw_at || ''} onChange={e => updateField('draw_at', e.target.value)} /></label></div><div className="two"><label>Minimum age<input type="number" value={form.min_age || 18} onChange={e => updateField('min_age', Number(e.target.value))} /></label><label className="check-row"><input type="checkbox" checked={form.age_restricted !== false} onChange={e => updateField('age_restricted', e.target.checked)} /> <span>Age restricted</span></label></div><label>Question<input value={form.question} onChange={e => updateField('question', e.target.value)} placeholder="Example: What colour is the sky?" /></label><label>Correct answer<input value={form.answer} onChange={e => updateField('answer', e.target.value)} /></label><label>Free entry route<textarea value={form.free_entry_text} onChange={e => updateField('free_entry_text', e.target.value)} /></label><label>Competition rules<textarea value={form.rules_text || ''} onChange={e => updateField('rules_text', e.target.value)} /></label><label>Prize image<input type="file" accept="image/*" onChange={uploadFile} /></label>{form.image_url && <img className="preview" src={imageUrl(form.image_url)} alt="Preview" />}<button className="primary full"><Plus size={16} /> {editing ? 'Save changes' : 'Add competition'}</button></form>}

        {activeTab === 'instant-wins' && <div className="admin-split"><form className="panel" onSubmit={saveInstantWin}><h1>Add instant win prize</h1><label>Competition<select value={iwForm.competition_id} onChange={e => setIwForm({ ...iwForm, competition_id: e.target.value })} required><option value="">Choose competition</option>{competitions.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><div className="two"><label>Prize title<input value={iwForm.prize_title} onChange={e => setIwForm({ ...iwForm, prize_title: e.target.value })} placeholder="£100 Instant Win" required /></label><label>Prize value pence<input type="number" value={iwForm.prize_value_pence} onChange={e => setIwForm({ ...iwForm, prize_value_pence: Number(e.target.value) })} /></label></div><label>Winning ticket number<input type="number" value={iwForm.winning_ticket_number} onChange={e => setIwForm({ ...iwForm, winning_ticket_number: e.target.value })} required /></label><button className="primary full"><Zap size={16} /> Add instant win</button></form><div className="panel list-panel"><h1>Instant wins</h1>{instantWins.length === 0 && <p className="muted">No instant wins added yet.</p>}{instantWins.map(w => <div className="list-row entry-row" key={w.id}><div><strong>{w.prize_title}</strong><p>{w.competition_title} · ticket #{w.winning_ticket_number} · {w.status}</p></div>{w.status !== 'claimed' && <button className="danger" onClick={() => deleteInstant(w.id)}><Trash2 size={16} /></button>}</div>)}</div></div>}

        {activeTab === 'free-entries' && <div className="admin-split"><form className="panel" onSubmit={saveFreeEntry}><h1>Record manual/free entry</h1><label>Competition<select value={freeForm.competition_id} onChange={e => setFreeForm({ ...freeForm, competition_id: e.target.value })} required><option value="">Choose competition</option>{competitions.filter(c => c.status === 'active').map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label><div className="two"><label>Customer name<input value={freeForm.customer_name} onChange={e => setFreeForm({ ...freeForm, customer_name: e.target.value })} required /></label><label>Customer email<input type="email" value={freeForm.customer_email} onChange={e => setFreeForm({ ...freeForm, customer_email: e.target.value })} required /></label></div><label>Postal/free-entry reference<input value={freeForm.postal_reference} onChange={e => setFreeForm({ ...freeForm, postal_reference: e.target.value })} /></label><label>Notes<textarea value={freeForm.notes} onChange={e => setFreeForm({ ...freeForm, notes: e.target.value })} /></label><button className="primary full">Record free entry</button></form><div className="panel list-panel"><h1>Recent entries</h1>{entries.slice(0, 20).map(e => <div className="list-row entry-row" key={e.id}><div><strong>{e.competition_title}</strong><p>{e.customer_email} · ticket #{e.ticket_number} · {e.payment_status}</p></div></div>)}</div></div>}

        {activeTab === 'settings' && <form className="panel settings-panel" onSubmit={saveSettings}><h1>Site settings</h1><div className="two"><label>Site name<input value={settingsForm.site_name || ''} onChange={e => setSettingsForm({ ...settingsForm, site_name: e.target.value })} /></label><label>Support email<input type="email" value={settingsForm.support_email || ''} onChange={e => setSettingsForm({ ...settingsForm, support_email: e.target.value })} /></label></div><label>Hero title<input value={settingsForm.hero_title || ''} onChange={e => setSettingsForm({ ...settingsForm, hero_title: e.target.value })} /></label><label>Hero text<textarea value={settingsForm.hero_text || ''} onChange={e => setSettingsForm({ ...settingsForm, hero_text: e.target.value })} /></label><label>Global free entry route<textarea value={settingsForm.free_entry_global || ''} onChange={e => setSettingsForm({ ...settingsForm, free_entry_global: e.target.value })} /></label><label>Terms / legal text<textarea value={settingsForm.terms_text || ''} onChange={e => setSettingsForm({ ...settingsForm, terms_text: e.target.value })} /></label><label>Responsible play text<textarea value={settingsForm.responsible_play_text || ''} onChange={e => setSettingsForm({ ...settingsForm, responsible_play_text: e.target.value })} /></label><button className="primary full">Save site settings</button></form>}

        {activeTab === 'audit' && <div className="panel list-panel"><h1>Audit log</h1>{(auditLogs || []).length === 0 && <p className="muted">No audit log entries yet.</p>}{(auditLogs || []).map(a => <div className="list-row entry-row" key={a.id}><div><strong>{a.action}</strong><p>{a.user_email} · {a.details} · {new Date(a.created_at).toLocaleString()}</p></div></div>)}</div>}
      </section>
    </section>
  </main>;
}

function Winners({ winners, instantWinners }) { return <main><section className="grid-section"><h1>Winners</h1><h2>Latest instant winners</h2>{instantWinners.length === 0 && <p className="muted">No instant winners yet.</p>}<div className="cards">{instantWinners.map(w => <article className="card" key={w.id}><div className="placeholder"><Zap /></div><div className="card-body"><h3>{w.winner_name || 'Customer'}</h3><p>Won {w.prize_title}</p><p className="muted">{w.competition_title} · Ticket #{w.winning_ticket_number}</p></div></article>)}</div><h2>Final draw winners</h2>{winners.length === 0 && <p className="muted">No final draw winners announced yet.</p>}<div className="cards">{winners.map(w => <article className="card" key={w.id}>{w.image_url ? <img src={imageUrl(w.image_url)} alt="" /> : <div className="placeholder"><Trophy /></div>}<div className="card-body"><h3>{w.winner_name}</h3><p>{w.prize_title}</p><p className="muted">{w.competition_title}</p></div></article>)}</div></section></main>; }

createRoot(document.getElementById('root')).render(<App />);
