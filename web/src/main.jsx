import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Gift, Trophy, User, Shield, LogOut, Plus, Trash2, Pencil, Ticket, Sparkles } from 'lucide-react';
import { api, imageUrl } from './api';
import './styles.css';

function money(pence) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((pence || 0) / 100);
}

function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function App() {
  const [page, setPage] = useState('home');
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('prizetown_user') || 'null'));
  const [competitions, setCompetitions] = useState([]);
  const [winners, setWinners] = useState([]);
  const [message, setMessage] = useState('');

  async function load() {
    const [comps, wins] = await Promise.all([api('/competitions'), api('/winners')]);
    setCompetitions(comps);
    setWinners(wins);
  }

  useEffect(() => { load().catch(err => setMessage(err.message)); }, []);

  function logout() {
    localStorage.removeItem('prizetown_token');
    localStorage.removeItem('prizetown_user');
    setUser(null);
    setPage('home');
  }

  const active = competitions.filter(c => c.status === 'active');

  return (
    <div>
      <header className="topbar">
        <button className="brand" onClick={() => setPage('home')}><Gift /> Prizetown</button>
        <nav>
          <button onClick={() => setPage('home')}>Competitions</button>
          <button onClick={() => setPage('winners')}>Winners</button>
          {user?.role === 'admin' && <button onClick={() => setPage('admin')}><Shield size={16} /> Admin</button>}
          {user ? <button onClick={logout}><LogOut size={16} /> Logout</button> : <button onClick={() => setPage('login')}><User size={16} /> Login</button>}
        </nav>
      </header>

      {message && <div className="notice">{message}</div>}

      {page === 'home' && <Home competitions={active} setPage={setPage} user={user} reload={load} setMessage={setMessage} />}
      {page === 'login' && <Login setUser={setUser} setPage={setPage} setMessage={setMessage} />}
      {page === 'winners' && <Winners winners={winners} />}
      {page === 'admin' && user?.role === 'admin' && <Admin competitions={competitions} reload={load} setMessage={setMessage} />}
    </div>
  );
}

function Home({ competitions, user, setPage, reload, setMessage }) {
  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow"><Sparkles size={16} /> Custom competition platform</p>
          <h1>Win big prizes with Prizetown</h1>
          <p>Browse live competitions, answer the entry question, and claim your ticket number.</p>
          {!user && <button className="primary" onClick={() => setPage('login')}>Create account / login</button>}
        </div>
        <div className="hero-card">
          <Trophy size={40} />
          <h3>Built for transparent draws</h3>
          <p>Entries, winners and competition history are stored in PostgreSQL.</p>
        </div>
      </section>

      <section className="grid-section">
        <h2>Live competitions</h2>
        {competitions.length === 0 && <p className="muted">No active competitions yet. Add one from the admin panel.</p>}
        <div className="cards">
          {competitions.map(c => <CompetitionCard key={c.id} c={c} user={user} setPage={setPage} reload={reload} setMessage={setMessage} />)}
        </div>
      </section>
    </main>
  );
}

function CompetitionCard({ c, user, setPage, reload, setMessage }) {
  const [answer, setAnswer] = useState('');
  const percent = Math.min(100, Math.round(((c.entries_sold || 0) / c.max_tickets) * 100));

  async function enterFree() {
    if (!user) return setPage('login');
    try {
      const entry = await api(`/competitions/${c.id}/entries/free`, { method: 'POST', body: JSON.stringify({ answer }) });
      setMessage(`Entry confirmed. Your ticket number is ${entry.ticket_number}.`);
      setAnswer('');
      reload();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <article className="card">
      {c.image_url ? <img src={imageUrl(c.image_url)} alt="" /> : <div className="placeholder"><Gift size={36} /></div>}
      <div className="card-body">
        <div className="row"><h3>{c.title}</h3><span>{money(c.ticket_price_pence)}</span></div>
        <p>{c.description}</p>
        <div className="progress"><span style={{ width: `${percent}%` }} /></div>
        <p className="muted">{c.entries_sold || 0} / {c.max_tickets} tickets sold</p>
        {c.question && <label>Question<input value={answer} onChange={e => setAnswer(e.target.value)} placeholder={c.question} /></label>}
        <button className="primary full" onClick={enterFree}><Ticket size={16} /> Enter test/free route</button>
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

function Admin({ competitions, reload, setMessage }) {
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
          {winners.map(w => <article className="card" key={w.id}>{w.image_url ? <img src={imageUrl(w.image_url)} /> : <div className="placeholder"><Trophy /></div>}<div className="card-body"><h3>{w.winner_name}</h3><p>{w.prize_title}</p><p className="muted">{w.competition_title}</p></div></article>)}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
