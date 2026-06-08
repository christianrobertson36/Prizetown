import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Gift, Trophy, User, Shield, LogOut, Plus, Trash2, Pencil, Ticket, Sparkles, ShoppingCart, ClipboardList } from 'lucide-react';
import { api, imageUrl } from './api';
import './styles.css';

function money(pence) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((pence || 0) / 100);
}

function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const defaultSettings = {
  site_name: 'Prizetown',
  support_email: 'support@prizetown.local',
  hero_eyebrow: 'Custom competition platform',
  hero_title: 'Win big prizes with Prizetown',
  hero_text: 'Browse live competitions, add tickets to your basket, answer the entry question, and checkout to receive ticket numbers.',
  footer_text: 'Please play responsibly. Free entry routes and terms should be checked before public launch.',
  free_entry_global: 'Postal/free entry route details can be added here from Admin Settings.',
  terms_text: 'Add your competition terms, eligibility rules, draw process, free entry route and privacy/contact wording here before going public.',
  responsible_play_text: '18+ only. Please enter responsibly. Do not spend more than you can afford.',
  age_confirmation_text: 'I confirm I am 18 or over and I agree to the competition rules and free-entry terms.'
};

function initialPage() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('/admin')) return 'admin';
  if (path.includes('/account')) return 'account';
  if (path.includes('/cart')) return 'cart';
  if (path.includes('/winners')) return 'winners';
  return 'home';
}

function App() {
  const [page, setPageState] = useState(initialPage());
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('prizetown_user') || 'null'));
  const [competitions, setCompetitions] = useState([]);
  const [winners, setWinners] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [entries, setEntries] = useState([]);
  const [orders, setOrders] = useState([]);
  const [adminEntries, setAdminEntries] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);
  const [adminAudit, setAdminAudit] = useState([]);
  const [message, setMessage] = useState('');
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem('prizetown_cart') || '[]'));

  function setPage(next) {
    setPageState(next);
    const path = next === 'home' ? '/' : `/${next}`;
    window.history.replaceState(null, '', path);
  }

  function saveCart(next) {
    setCart(next);
    localStorage.setItem('prizetown_cart', JSON.stringify(next));
  }

  async function load() {
    const [comps, wins, siteSettings] = await Promise.all([api('/competitions'), api('/winners'), api('/settings')]);
    setCompetitions(comps);
    setWinners(wins);
    setSettings({ ...defaultSettings, ...siteSettings });
  }

  async function loadAccount() {
    if (!user) return;
    const [myEntries, myOrders] = await Promise.all([api('/me/entries'), api('/me/orders')]);
    setEntries(myEntries);
    setOrders(myOrders);
  }

  async function loadAdminData() {
    if (user?.role !== 'admin') return;
    const [rows, orderRows, auditRows] = await Promise.all([api('/admin/entries'), api('/admin/orders'), api('/admin/audit-logs')]);
    setAdminEntries(rows);
    setAdminOrders(orderRows);
    setAdminAudit(auditRows);
  }

  useEffect(() => { load().catch(err => setMessage(err.message)); }, []);
  useEffect(() => { if (user) loadAccount().catch(() => {}); }, [user]);
  useEffect(() => { if (user?.role === 'admin') loadAdminData().catch(() => {}); }, [user]);

  function logout() {
    localStorage.removeItem('prizetown_token');
    localStorage.removeItem('prizetown_user');
    setUser(null);
    setEntries([]);
    setOrders([]);
    setPage('home');
  }

  const active = competitions.filter(c => c.status === 'active');
  const cartCount = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return (
    <div>
      <header className="topbar">
        <button className="brand" onClick={() => setPage('home')}><Gift /> {settings.site_name || 'Prizetown'}</button>
        <nav>
          <button onClick={() => setPage('home')}>Competitions</button>
          <button onClick={() => setPage('winners')}>Winners</button>
          {user && <button onClick={() => { setPage('account'); loadAccount().catch(err => setMessage(err.message)); }}><ClipboardList size={16} /> My entries</button>}
          <button onClick={() => setPage('cart')}><ShoppingCart size={16} /> Basket {cartCount > 0 ? `(${cartCount})` : ''}</button>
          {user?.role === 'admin' && <button onClick={() => { setPage('admin'); loadAdminData().catch(err => setMessage(err.message)); }}><Shield size={16} /> Admin</button>}
          {user ? <button onClick={logout}><LogOut size={16} /> Logout</button> : <button onClick={() => setPage('login')}><User size={16} /> Login</button>}
        </nav>
      </header>

      {message && <div className="notice">{message}<button onClick={() => setMessage('')}>Dismiss</button></div>}

      {page === 'home' && <Home settings={settings} competitions={active} user={user} setPage={setPage} cart={cart} saveCart={saveCart} setMessage={setMessage} />}
      {page === 'login' && <Login setUser={setUser} setPage={setPage} setMessage={setMessage} />}
      {page === 'winners' && <Winners winners={winners} />}
      {page === 'cart' && <Cart settings={settings} user={user} setPage={setPage} cart={cart} saveCart={saveCart} reload={load} reloadAccount={loadAccount} setMessage={setMessage} />}
      {page === 'account' && <Account user={user} entries={entries} orders={orders} setPage={setPage} reload={loadAccount} />}
      {page === 'admin' && user?.role === 'admin' && <Admin settings={settings} setSettings={setSettings} competitions={competitions} entries={adminEntries} orders={adminOrders} auditLogs={adminAudit} reload={async () => { await load(); await loadAdminData(); }} setMessage={setMessage} />}
      {page === 'admin' && user?.role !== 'admin' && <Login setUser={setUser} setPage={setPage} setMessage={setMessage} />}
    </div>
  );
}

function Home({ settings, competitions, user, setPage, cart, saveCart, setMessage }) {
  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow"><Sparkles size={16} /> {settings.hero_eyebrow}</p>
          <h1>{settings.hero_title}</h1>
          <p>{settings.hero_text}</p>
          {!user && <button className="primary" onClick={() => setPage('login')}>Create account / login</button>}
        </div>
        <div className="hero-card">
          <Trophy size={40} />
          <h3>v8 compliance foundation</h3>
          <p>Age confirmation, rules, closing dates, free-entry recording and audit logs are now built in. Payment provider approval still comes next.</p>
        </div>
      </section>

      <section className="grid-section">
        <h2>Live competitions</h2>
        {competitions.length === 0 && <p className="muted">No active competitions yet. Add one from the admin panel.</p>}
        <div className="cards">
          {competitions.map(c => <CompetitionCard key={c.id} c={c} cart={cart} saveCart={saveCart} setMessage={setMessage} setPage={setPage} />)}
        </div>
      </section>

      <section className="panel info-panel">
        <h2>Free entry and terms</h2>
        <p>{settings.free_entry_global}</p>
        <p className="muted">{settings.responsible_play_text}</p>
        <details><summary>Site terms / legal text</summary><p>{settings.terms_text}</p></details>
        <p className="muted">{settings.footer_text}</p>
      </section>
    </main>
  );
}

function CompetitionCard({ c, cart, saveCart, setMessage, setPage }) {
  const [quantity, setQuantity] = useState(1);
  const [answer, setAnswer] = useState('');
  const percent = Math.min(100, Math.round(((c.entries_sold || 0) / c.max_tickets) * 100));
  const remaining = Math.max(0, c.max_tickets - (c.entries_sold || 0));

  function addToBasket() {
    const qty = Math.max(1, Math.min(Number(quantity || 1), remaining, c.max_per_user));
    if (c.question && !answer.trim()) return setMessage('Please answer the entry question before adding to basket.');
    const existing = cart.find(item => item.competition_id === c.id);
    const next = existing
      ? cart.map(item => item.competition_id === c.id ? { ...item, quantity: Math.min(c.max_per_user, item.quantity + qty), answer } : item)
      : [...cart, { competition_id: c.id, title: c.title, unit_price_pence: c.ticket_price_pence, quantity: qty, answer, question: c.question, image_url: c.image_url }];
    saveCart(next);
    setMessage(`${c.title} added to basket.`);
  }

  return (
    <article className="card">
      {c.image_url ? <img src={imageUrl(c.image_url)} alt="" /> : <div className="placeholder"><Gift size={36} /></div>}
      <div className="card-body">
        <div className="row"><h3>{c.title}</h3><span>{money(c.ticket_price_pence)}</span></div>
        <p>{c.description}</p>
        <div className="progress"><span style={{ width: `${percent}%` }} /></div>
        <p className="muted">{c.entries_sold || 0} / {c.max_tickets} tickets sold · {remaining} left</p>
        {c.closes_at && <p className="muted">Closes: {new Date(c.closes_at).toLocaleString()}</p>}
        {c.age_restricted && <p className="badge">{c.min_age || 18}+ only</p>}
        {c.question && <label>Question<input value={answer} onChange={e => setAnswer(e.target.value)} placeholder={c.question} /></label>}
        <div className="two compact">
          <label>Tickets<input type="number" min="1" max={Math.min(c.max_per_user, remaining)} value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
          <label>Total<input readOnly value={money((Number(quantity || 1)) * c.ticket_price_pence)} /></label>
        </div>
        <button className="primary full" onClick={addToBasket}><ShoppingCart size={16} /> Add to basket</button>
        <button className="secondary full" onClick={() => setPage('cart')}>Go to basket</button>
        {c.free_entry_text && <details><summary>Free entry route</summary><p>{c.free_entry_text}</p></details>}
        {c.rules_text && <details><summary>Competition rules</summary><p>{c.rules_text}</p></details>}
      </div>
    </article>
  );
}

function Login({ setUser, setPage, setMessage }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  async function submit(e) {
    e.preventDefault();
    try {
      const data = await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: JSON.stringify(form) });
      localStorage.setItem('prizetown_token', data.token);
      localStorage.setItem('prizetown_user', JSON.stringify(data.user));
      setUser(data.user);
      setMessage(`Logged in as ${data.user.email}`);
      setPage(data.user.role === 'admin' ? 'admin' : 'home');
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <main className="narrow">
      <form className="panel" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Login' : 'Create account'}</h2>
        {mode === 'register' && <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>}
        <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Password<input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></label>
        <button className="primary full">{mode === 'login' ? 'Login' : 'Register'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account?' : 'Already registered?'}
        </button>
      </form>
    </main>
  );
}

function Cart({ settings, user, setPage, cart, saveCart, reload, reloadAccount, setMessage }) {
  const [busy, setBusy] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const total = cart.reduce((sum, item) => sum + item.quantity * item.unit_price_pence, 0);

  function updateQty(id, quantity) {
    const qty = Math.max(1, Number(quantity || 1));
    saveCart(cart.map(item => item.competition_id === id ? { ...item, quantity: qty } : item));
  }

  function updateAnswer(id, answer) {
    saveCart(cart.map(item => item.competition_id === id ? { ...item, answer } : item));
  }

  function remove(id) {
    saveCart(cart.filter(item => item.competition_id !== id));
  }

  async function checkout() {
    if (!user) return setPage('login');
    if (cart.length === 0) return setMessage('Basket is empty.');
    try {
      setBusy(true);
      const data = await api('/orders', { method: 'POST', body: JSON.stringify({ items: cart, age_confirmed: ageConfirmed }) });
      saveCart([]);
      setMessage(`Order #${data.order.id} created. Ticket numbers: ${data.entries.map(e => e.ticket_number).join(', ')}`);
      await reload();
      await reloadAccount();
      setPage('account');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="panel">
        <h1>Basket</h1>
        <p className="muted">This v6 checkout is a test-paid order flow. Stripe/webhook payment will be added in the next payment patch.</p>
        {cart.length === 0 && <p>Your basket is empty.</p>}
        {cart.map(item => (
          <div className="basket-row" key={item.competition_id}>
            {item.image_url ? <img src={imageUrl(item.image_url)} alt="" /> : <div className="mini-placeholder"><Gift /></div>}
            <div>
              <strong>{item.title}</strong>
              <p>{money(item.unit_price_pence)} each</p>
              {item.question && <label>Answer<input value={item.answer || ''} onChange={e => updateAnswer(item.competition_id, e.target.value)} placeholder={item.question} /></label>}
            </div>
            <label>Qty<input type="number" min="1" value={item.quantity} onChange={e => updateQty(item.competition_id, e.target.value)} /></label>
            <strong>{money(item.quantity * item.unit_price_pence)}</strong>
            <button className="danger" onClick={() => remove(item.competition_id)}><Trash2 size={16} /></button>
          </div>
        ))}
        <div className="checkout-bar">
          <h2>Total: {money(total)}</h2>
          <button className="secondary" onClick={() => setPage('home')}>Continue browsing</button>
          <div className="checkout-compliance">
            <label className="check-row"><input type="checkbox" checked={ageConfirmed} onChange={e => setAgeConfirmed(e.target.checked)} /> <span>{settings.age_confirmation_text}</span></label>
            <p className="muted">{settings.responsible_play_text}</p>
          </div>
          <button className="primary" disabled={busy || cart.length === 0} onClick={checkout}><Ticket size={16} /> {busy ? 'Creating order...' : 'Checkout and allocate tickets'}</button>
        </div>
      </section>
    </main>
  );
}

function Account({ user, entries, orders, setPage, reload }) {
  if (!user) return <main className="narrow"><div className="panel"><h2>Please login</h2><button className="primary" onClick={() => setPage('login')}>Login</button></div></main>;
  return (
    <main>
      <section className="admin-layout">
        <div className="panel list-panel">
          <div className="row"><h2>My entries</h2><button className="secondary" onClick={reload}>Refresh</button></div>
          {entries.length === 0 && <p className="muted">No entries yet.</p>}
          {entries.map(e => (
            <div className="list-row entry-row" key={e.id}>
              <div><strong>{e.competition_title}</strong><p>Ticket #{e.ticket_number} · {e.payment_status}</p></div>
            </div>
          ))}
        </div>
        <div className="panel list-panel">
          <h2>My orders</h2>
          {orders.length === 0 && <p className="muted">No orders yet.</p>}
          {orders.map(o => (
            <div className="list-row entry-row" key={o.id}>
              <div><strong>Order #{o.id}</strong><p>{money(o.total_pence)} · {o.entry_count} entries · {o.status}</p></div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Admin({ settings, setSettings, competitions, entries, orders, auditLogs, reload, setMessage }) {
  const empty = { title: '', slug: '', description: '', question: '', answer: '', free_entry_text: '', rules_text: '', closes_at: '', min_age: 18, age_restricted: true, ticket_price_pence: 199, max_tickets: 100, max_per_user: 10, draw_at: '', status: 'draft', image_url: '' };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [settingsForm, setSettingsForm] = useState({ ...defaultSettings, ...settings });
  const [freeForm, setFreeForm] = useState({ competition_id: '', customer_name: '', customer_email: '', postal_reference: '', notes: '' });

  useEffect(() => {
    setSettingsForm({ ...defaultSettings, ...settings });
  }, [settings]);

  function updateField(key, value) {
    const next = { ...form, [key]: value };
    if (key === 'title' && !editing) next.slug = slugify(value);
    setForm(next);
  }

  async function save(e) {
    e.preventDefault();
    try {
      const path = editing ? `/admin/competitions/${editing}` : '/admin/competitions';
      const method = editing ? 'PATCH' : 'POST';
      await api(path, { method, body: JSON.stringify(form) });
      setMessage(editing ? 'Competition updated.' : 'Competition added.');
      setForm(empty);
      setEditing(null);
      reload();
    } catch (err) { setMessage(err.message); }
  }

  async function uploadFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    try {
      const data = await api('/admin/upload', { method: 'POST', body });
      setForm({ ...form, image_url: data.url });
    } catch (err) { setMessage(err.message); }
  }

  async function remove(id) {
    if (!confirm('Delete this competition?')) return;
    await api(`/admin/competitions/${id}`, { method: 'DELETE' });
    setMessage('Competition deleted.');
    reload();
  }

  function edit(c) {
    setEditing(c.id);
    setForm({ ...c, draw_at: c.draw_at ? c.draw_at.slice(0, 16) : '', closes_at: c.closes_at ? c.closes_at.slice(0, 16) : '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateSetting(key, value) {
    setSettingsForm({ ...settingsForm, [key]: value });
  }

  async function saveSettings(e) {
    e.preventDefault();
    try {
      const saved = await api('/admin/settings', { method: 'PATCH', body: JSON.stringify(settingsForm) });
      setSettings({ ...defaultSettings, ...saved });
      setMessage('Site settings saved.');
    } catch (err) { setMessage(err.message); }
  }


  async function saveFreeEntry(e) {
    e.preventDefault();
    try {
      const saved = await api('/admin/free-entry', { method: 'POST', body: JSON.stringify(freeForm) });
      setMessage(`Manual/free entry recorded. Ticket #${saved.entry.ticket_number}`);
      setFreeForm({ competition_id: '', customer_name: '', customer_email: '', postal_reference: '', notes: '' });
      reload();
    } catch (err) { setMessage(err.message); }
  }

  function updateFreeField(key, value) {
    setFreeForm({ ...freeForm, [key]: value });
  }

  return (
    <main>
      <section className="admin-layout">
        <form className="panel" onSubmit={save}>
          <h2>{editing ? 'Edit competition' : 'Add competition'}</h2>
          <label>Title<input value={form.title} onChange={e => updateField('title', e.target.value)} required /></label>
          <label>Slug<input value={form.slug} onChange={e => updateField('slug', e.target.value)} required /></label>
          <label>Description<textarea value={form.description} onChange={e => updateField('description', e.target.value)} /></label>
          <div className="two">
            <label>Price pence<input type="number" value={form.ticket_price_pence} onChange={e => updateField('ticket_price_pence', Number(e.target.value))} /></label>
            <label>Max tickets<input type="number" value={form.max_tickets} onChange={e => updateField('max_tickets', Number(e.target.value))} /></label>
          </div>
          <div className="two">
            <label>Max per user<input type="number" value={form.max_per_user} onChange={e => updateField('max_per_user', Number(e.target.value))} /></label>
            <label>Status<select value={form.status} onChange={e => updateField('status', e.target.value)}><option>draft</option><option>active</option><option>closed</option></select></label>
          </div>
          <div className="two">
            <label>Closing date<input type="datetime-local" value={form.closes_at || ''} onChange={e => updateField('closes_at', e.target.value)} /></label>
            <label>Draw date<input type="datetime-local" value={form.draw_at || ''} onChange={e => updateField('draw_at', e.target.value)} /></label>
          </div>
          <div className="two">
            <label>Minimum age<input type="number" value={form.min_age || 18} onChange={e => updateField('min_age', Number(e.target.value))} /></label>
            <label className="check-row"><input type="checkbox" checked={form.age_restricted !== false} onChange={e => updateField('age_restricted', e.target.checked)} /> <span>Age restricted</span></label>
          </div>
          <label>Question<input value={form.question} onChange={e => updateField('question', e.target.value)} placeholder="Example: What colour is the sky?" /></label>
          <label>Correct answer<input value={form.answer} onChange={e => updateField('answer', e.target.value)} /></label>
          <label>Free entry route<textarea value={form.free_entry_text} onChange={e => updateField('free_entry_text', e.target.value)} /></label>
          <label>Competition rules<textarea value={form.rules_text || ''} onChange={e => updateField('rules_text', e.target.value)} placeholder="Eligibility, entry limits, draw method, closing date and prize-specific rules" /></label>
          <label>Prize image<input type="file" accept="image/*" onChange={uploadFile} /></label>
          {form.image_url && <img className="preview" src={imageUrl(form.image_url)} alt="Preview" />}
          <button className="primary full"><Plus size={16} /> {editing ? 'Save changes' : 'Add competition'}</button>
          {editing && <button type="button" className="link" onClick={() => { setEditing(null); setForm(empty); }}>Cancel edit</button>}
        </form>

        <div>
          <form className="panel settings-panel" onSubmit={saveSettings}>
            <h2>Site settings</h2>
            <div className="two">
              <label>Site name<input value={settingsForm.site_name || ''} onChange={e => updateSetting('site_name', e.target.value)} /></label>
              <label>Support email<input type="email" value={settingsForm.support_email || ''} onChange={e => updateSetting('support_email', e.target.value)} /></label>
            </div>
            <label>Hero eyebrow<input value={settingsForm.hero_eyebrow || ''} onChange={e => updateSetting('hero_eyebrow', e.target.value)} /></label>
            <label>Hero title<input value={settingsForm.hero_title || ''} onChange={e => updateSetting('hero_title', e.target.value)} /></label>
            <label>Hero text<textarea value={settingsForm.hero_text || ''} onChange={e => updateSetting('hero_text', e.target.value)} /></label>
            <label>Global free entry route<textarea value={settingsForm.free_entry_global || ''} onChange={e => updateSetting('free_entry_global', e.target.value)} /></label>
            <label>Terms / legal text<textarea value={settingsForm.terms_text || ''} onChange={e => updateSetting('terms_text', e.target.value)} /></label>
            <label>Responsible play text<textarea value={settingsForm.responsible_play_text || ''} onChange={e => updateSetting('responsible_play_text', e.target.value)} /></label>
            <label>Age confirmation text<textarea value={settingsForm.age_confirmation_text || ''} onChange={e => updateSetting('age_confirmation_text', e.target.value)} /></label>
            <label>Footer text<textarea value={settingsForm.footer_text || ''} onChange={e => updateSetting('footer_text', e.target.value)} /></label>
            <button className="primary full">Save site settings</button>
          </form>

          <form className="panel" onSubmit={saveFreeEntry}>
            <h2>Record manual/free entry</h2>
            <label>Competition<select value={freeForm.competition_id} onChange={e => updateFreeField('competition_id', e.target.value)} required><option value="">Choose competition</option>{competitions.filter(c => c.status === 'active').map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
            <div className="two">
              <label>Customer name<input value={freeForm.customer_name} onChange={e => updateFreeField('customer_name', e.target.value)} required /></label>
              <label>Customer email<input type="email" value={freeForm.customer_email} onChange={e => updateFreeField('customer_email', e.target.value)} required /></label>
            </div>
            <label>Postal/free-entry reference<input value={freeForm.postal_reference} onChange={e => updateFreeField('postal_reference', e.target.value)} placeholder="Envelope ref, date received, or internal note" /></label>
            <label>Notes<textarea value={freeForm.notes} onChange={e => updateFreeField('notes', e.target.value)} /></label>
            <button className="primary full">Record free entry</button>
          </form>

          <div className="panel list-panel">
          <h2>Competitions</h2>
          {competitions.map(c => (
            <div className="list-row" key={c.id}>
              <div><strong>{c.title}</strong><p>{c.status} · {c.entries_sold || 0}/{c.max_tickets} tickets</p></div>
              <button onClick={() => edit(c)}><Pencil size={16} /></button>
              <button className="danger" onClick={() => remove(c.id)}><Trash2 size={16} /></button>
            </div>
          ))}
          <h2>Recent orders</h2>
          {orders.map(o => <div className="list-row entry-row" key={o.id}><div><strong>Order #{o.id}</strong><p>{o.customer_email} · {money(o.total_pence)} · {o.entry_count} entries · {o.status}</p></div></div>)}
          <h2>Recent entries</h2>
          {entries.slice(0, 10).map(e => <div className="list-row entry-row" key={e.id}><div><strong>{e.competition_title}</strong><p>{e.customer_email} · ticket #{e.ticket_number} · {e.payment_status}</p></div></div>)}
          <h2>Audit log</h2>
          {(auditLogs || []).slice(0, 10).map(a => <div className="list-row entry-row" key={a.id}><div><strong>{a.action}</strong><p>{a.user_email} · {a.details} · {new Date(a.created_at).toLocaleString()}</p></div></div>)}
          </div>
        </div>
      </section>
    </main>
  );
}

function Winners({ winners }) {
  return (
    <main>
      <section className="grid-section">
        <h1>Winners</h1>
        {winners.length === 0 && <p className="muted">No winners announced yet.</p>}
        <div className="cards">
          {winners.map(w => <article className="card" key={w.id}>{w.image_url ? <img src={imageUrl(w.image_url)} alt="" /> : <div className="placeholder"><Trophy /></div>}<div className="card-body"><h3>{w.winner_name}</h3><p>{w.prize_title}</p><p className="muted">{w.competition_title}</p></div></article>)}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
