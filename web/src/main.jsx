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
  const [entries, setEntries] = useState([]);
  const [orders, setOrders] = useState([]);
  const [adminEntries, setAdminEntries] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);
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
    const [comps, wins] = await Promise.all([api('/competitions'), api('/winners')]);
    setCompetitions(comps);
    setWinners(wins);
  }

  async function loadAccount() {
    if (!user) return;
    const [myEntries, myOrders] = await Promise.all([api('/me/entries'), api('/me/orders')]);
    setEntries(myEntries);
    setOrders(myOrders);
  }

  async function loadAdminData() {
    if (user?.role !== 'admin') return;
    const [rows, orderRows] = await Promise.all([api('/admin/entries'), api('/admin/orders')]);
    setAdminEntries(rows);
    setAdminOrders(orderRows);
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
        <button className="brand" onClick={() => setPage('home')}><Gift /> Prizetown</button>
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

      {page === 'home' && <Home competitions={active} user={user} setPage={setPage} cart={cart} saveCart={saveCart} setMessage={setMessage} />}
      {page === 'login' && <Login setUser={setUser} setPage={setPage} setMessage={setMessage} />}
      {page === 'winners' && <Winners winners={winners} />}
      {page === 'cart' && <Cart user={user} setPage={setPage} cart={cart} saveCart={saveCart} reload={load} reloadAccount={loadAccount} setMessage={setMessage} />}
      {page === 'account' && <Account user={user} entries={entries} orders={orders} setPage={setPage} reload={loadAccount} />}
      {page === 'admin' && user?.role === 'admin' && <Admin competitions={competitions} entries={adminEntries} orders={adminOrders} reload={async () => { await load(); await loadAdminData(); }} setMessage={setMessage} />}
      {page === 'admin' && user?.role !== 'admin' && <Login setUser={setUser} setPage={setPage} setMessage={setMessage} />}
    </div>
  );
}

function Home({ competitions, user, setPage, cart, saveCart, setMessage }) {
  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow"><Sparkles size={16} /> Custom competition platform</p>
          <h1>Win big prizes with Prizetown</h1>
          <p>Browse live competitions, add tickets to your basket, answer the entry question, and checkout to receive ticket numbers.</p>
          {!user && <button className="primary" onClick={() => setPage('login')}>Create account / login</button>}
        </div>
        <div className="hero-card">
          <Trophy size={40} />
          <h3>v6 basket and ticket allocation</h3>
          <p>Orders, customer entries and ticket numbers are stored in PostgreSQL. Stripe payment comes next.</p>
        </div>
      </section>

      <section className="grid-section">
        <h2>Live competitions</h2>
        {competitions.length === 0 && <p className="muted">No active competitions yet. Add one from the admin panel.</p>}
        <div className="cards">
          {competitions.map(c => <CompetitionCard key={c.id} c={c} cart={cart} saveCart={saveCart} setMessage={setMessage} setPage={setPage} />)}
        </div>
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
        {c.question && <label>Question<input value={answer} onChange={e => setAnswer(e.target.value)} placeholder={c.question} /></label>}
        <div className="two compact">
          <label>Tickets<input type="number" min="1" max={Math.min(c.max_per_user, remaining)} value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
          <label>Total<input readOnly value={money((Number(quantity || 1)) * c.ticket_price_pence)} /></label>
        </div>
        <button className="primary full" onClick={addToBasket}><ShoppingCart size={16} /> Add to basket</button>
        <button className="secondary full" onClick={() => setPage('cart')}>Go to basket</button>
        {c.free_entry_text && <details><summary>Free entry route</summary><p>{c.free_entry_text}</p></details>}
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

function Cart({ user, setPage, cart, saveCart, reload, reloadAccount, setMessage }) {
  const [busy, setBusy] = useState(false);
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
      const data = await api('/orders', { method: 'POST', body: JSON.stringify({ items: cart }) });
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

function Admin({ competitions, entries, orders, reload, setMessage }) {
  const empty = { title: '', slug: '', description: '', question: '', answer: '', free_entry_text: '', ticket_price_pence: 199, max_tickets: 100, max_per_user: 10, draw_at: '', status: 'draft', image_url: '' };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);

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
    setForm({ ...c, draw_at: c.draw_at ? c.draw_at.slice(0, 16) : '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
          <label>Draw date<input type="datetime-local" value={form.draw_at || ''} onChange={e => updateField('draw_at', e.target.value)} /></label>
          <label>Question<input value={form.question} onChange={e => updateField('question', e.target.value)} placeholder="Example: What colour is the sky?" /></label>
          <label>Correct answer<input value={form.answer} onChange={e => updateField('answer', e.target.value)} /></label>
          <label>Free entry route<textarea value={form.free_entry_text} onChange={e => updateField('free_entry_text', e.target.value)} /></label>
          <label>Prize image<input type="file" accept="image/*" onChange={uploadFile} /></label>
          {form.image_url && <img className="preview" src={imageUrl(form.image_url)} alt="Preview" />}
          <button className="primary full"><Plus size={16} /> {editing ? 'Save changes' : 'Add competition'}</button>
          {editing && <button type="button" className="link" onClick={() => { setEditing(null); setForm(empty); }}>Cancel edit</button>}
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
