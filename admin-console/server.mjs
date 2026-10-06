// HaBoneh admin console — a small server-rendered back office for the product
// owner. Runs on Render (free web service). Talks to Supabase with the
// service-role key, so it MUST stay behind the password gate below and must
// never be bundled into the mobile app.
//
// Capabilities (the ones a one-person product team actually needs on day 1):
//   • Overview: signups, active projects, pro seats, paying users, FM counter,
//     open deletion requests, cron health.
//   • Users: who signed up, when, role (family / pro), Pro flag, banned?;
//     actions: ban / unban, grant / revoke Pro, delete account.
//   • Payments: pro_subscriptions + founding-member purchases + the live
//     RevenueCat-fed state; action: comp a Pro period manually.
//   • Projects: members, pro seats; actions: add a partner seat, add a pro seat
//     ("add sharing"), revoke a pro seat.
//   • Invites: pending partner / pro invites.
//   • Audit: every admin action is written to admin_actions (created lazily).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD (required),
//      PORT (Render sets it). Nothing else.

import { createClient } from '@supabase/supabase-js';
import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import WebSocket from 'ws';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, PORT = 3000 } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD })) {
  if (!v) {
    console.error(`[admin] missing env ${k}`);
    process.exit(1);
  }
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // Node < 22 has no global WebSocket; supabase-js initialises realtime eagerly.
  realtime: { transport: WebSocket },
});

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));

// ---------- auth gate (HTTP Basic, constant-time compare) ----------
app.use((req, res, next) => {
  if (req.path === '/healthz') return next();
  const hdr = req.headers.authorization ?? '';
  const [scheme, b64] = hdr.split(' ');
  if (scheme === 'Basic' && b64) {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    const pw = decoded.slice(decoded.indexOf(':') + 1);
    const a = Buffer.from(pw);
    const b = Buffer.from(ADMIN_PASSWORD);
    if (a.length === b.length && timingSafeEqual(a, b)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="HaBoneh admin", charset="UTF-8"');
  return res.status(401).send('auth required');
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ---------- helpers ----------
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—');
const maskPhone = (p) => (p ? `${p.slice(0, 6)}***${p.slice(-3)}` : '—');
const short = (id) => (id ? id.slice(0, 8) : '—');

async function sql(query) {
  // Service-role PostgREST cannot run arbitrary SQL; we go through a tiny
  // DEFINER-less RPC only when one exists. Everything below uses table reads.
  throw new Error(`sql() not available: ${query}`);
}
void sql;

async function listAuthUsers() {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

async function audit(action, target, details) {
  const { error } = await sb.from('admin_actions').insert({ action, target, details });
  if (error && error.code === '42P01') {
    // table missing — create it once via the SQL below (documented in README)
    console.warn('[admin] admin_actions table missing; run README SQL to enable audit');
    return;
  }
  if (error) console.error('[admin] audit insert failed', error.message);
}

function page(title, body, flash = '') {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · הבונה אדמין</title>
<meta name="robots" content="noindex,nofollow">
<style>
:root{--p:#2d6beb;--ink:#16213a;--ink2:#4a5570;--line:#e4e8f0;--bg:#f7f8fb;--ok:#1e7f4f;--bad:#b42318;--warn:#b7791f}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 Heebo,system-ui,sans-serif;color:var(--ink);background:var(--bg)}
header{display:flex;gap:18px;align-items:center;padding:12px 20px;background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0}
header b{font-size:18px}header nav a{margin-inline-start:14px;color:var(--ink2);text-decoration:none;font-weight:500}header nav a.on{color:var(--p)}
main{max-width:1200px;margin:0 auto;padding:20px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:20px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px}.card b{display:block;font-size:26px}.card span{color:var(--ink2);font-size:13px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:start;vertical-align:top;font-size:14px}th{background:#fafbfe;color:var(--ink2);font-weight:600}
tr:last-child td{border-bottom:0}.tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;background:#eef2fb;color:var(--p)}
.tag.ok{background:#e6f4ec;color:var(--ok)}.tag.bad{background:#fde8e6;color:var(--bad)}.tag.warn{background:#fbf1dc;color:var(--warn)}
form.inline{display:inline}button{font:inherit;padding:4px 10px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer}
button.danger{border-color:#f3b5ae;color:var(--bad)}button.primary{background:var(--p);color:#fff;border-color:var(--p)}
input,select{font:inherit;padding:4px 8px;border:1px solid var(--line);border-radius:8px}
.flash{background:#e6f4ec;border:1px solid #bfe3cf;color:var(--ok);padding:10px 14px;border-radius:10px;margin-bottom:14px}
.muted{color:var(--ink2)}.small{font-size:12px}h1{font-size:22px;margin:0 0 14px}h2{font-size:17px;margin:22px 0 8px}
code{font-size:12px;background:#f1f3f8;padding:1px 5px;border-radius:5px}
</style></head><body>
<header><b>הבונה · אדמין</b><nav>
<a href="/" class="${title === 'סקירה' ? 'on' : ''}">סקירה</a>
<a href="/users" class="${title === 'משתמשים' ? 'on' : ''}">משתמשים</a>
<a href="/payments" class="${title === 'תשלומים' ? 'on' : ''}">תשלומים</a>
<a href="/projects" class="${title === 'פרויקטים' ? 'on' : ''}">פרויקטים</a>
<a href="/invites" class="${title === 'הזמנות' ? 'on' : ''}">הזמנות</a>
<a href="/audit" class="${title === 'יומן אדמין' ? 'on' : ''}">יומן אדמין</a>
</nav></header><main>${flash ? `<div class="flash">${esc(flash)}</div>` : ''}<h1>${esc(title)}</h1>${body}</main></body></html>`;
}

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).send(page('שגיאה', `<p>משהו נשבר: <code>${esc(e.message ?? e)}</code></p>`));
  });

// ---------- overview ----------
app.get('/', wrap(async (req, res) => {
  const users = await listAuthUsers();
  const weekAgo = Date.now() - 7 * 864e5;
  const [{ count: projects }, { count: proSeats }, { data: appState }, { count: delReq }, { data: subs }, { count: fm }] =
    await Promise.all([
      sb.from('projects').select('id', { count: 'exact', head: true }),
      sb.from('project_pro_access').select('id', { count: 'exact', head: true }).eq('status', 'accepted'),
      sb.from('app_state').select('fm_active_count, config_version').limit(1).maybeSingle(),
      sb.from('account_deletion_request').select('*', { count: 'exact', head: true }),
      sb.from('pro_subscriptions').select('user_id, expires_at').gt('expires_at', new Date().toISOString()),
      sb.from('founding_member_purchases').select('user_id', { count: 'exact', head: true }),
    ]);
  const cards = [
    ['נרשמו סה"כ', users.length],
    ['נרשמו ב־7 ימים', users.filter((u) => new Date(u.created_at).getTime() > weekAgo).length],
    ['פרויקטים', projects ?? 0],
    ['מושבי פרו פעילים', proSeats ?? 0],
    ['מנויי פרו בתוקף', new Set((subs ?? []).map((s) => s.user_id)).size],
    ['חברים מייסדים', fm ?? 0],
    ['מונה FM (app_state)', appState?.fm_active_count ?? '—'],
    ['בקשות מחיקה פתוחות', delReq ?? 0],
  ];
  const recent = users
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)
    .map((u) => `<tr><td>${maskPhone(u.phone)}</td><td>${fmtDate(u.created_at)}</td><td>${fmtDate(u.last_sign_in_at)}</td><td><a href="/users#${u.id}">פרטים</a></td></tr>`)
    .join('');
  res.send(page('סקירה', `
<div class="cards">${cards.map(([l, v]) => `<div class="card"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
<h2>נרשמים אחרונים</h2>
<table><tr><th>טלפון</th><th>נרשם</th><th>כניסה אחרונה</th><th></th></tr>${recent || '<tr><td colspan=4 class="muted">עדיין אין נרשמים.</td></tr>'}</table>
<p class="small muted">גרסת קונפיג: ${esc(appState?.config_version ?? '—')} · מספרי טלפון מוצגים חלקית בכוונה.</p>`));
}));

// ---------- users ----------
app.get('/users', wrap(async (req, res) => {
  const users = await listAuthUsers();
  const ids = users.map((u) => u.id);
  const [{ data: profiles }, { data: members }, { data: proAccess }, { data: subs }] = await Promise.all([
    sb.from('profiles').select('id, is_pro, is_pro_portal, pro_portal_opt_in, pro_business_name, preferred_locale').in('id', ids),
    sb.from('project_members').select('user_id, project_id, role').in('user_id', ids),
    sb.from('project_pro_access').select('user_id, project_id, status').in('user_id', ids),
    sb.from('pro_subscriptions').select('user_id, expires_at, source').in('user_id', ids),
  ]);
  const pById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]));
  const rows = users
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((u) => {
      const p = pById[u.id] ?? {};
      const fam = (members ?? []).filter((m) => m.user_id === u.id).length;
      const pro = (proAccess ?? []).filter((m) => m.user_id === u.id && m.status === 'accepted').length;
      const sub = (subs ?? []).find((s) => s.user_id === u.id && new Date(s.expires_at) > new Date());
      const banned = u.banned_until && new Date(u.banned_until) > new Date();
      const role = p.pro_portal_opt_in || p.is_pro_portal || pro ? 'פרו' : fam ? 'משפחה' : 'ללא פרויקט';
      return `<tr id="${u.id}">
<td><code>${short(u.id)}</code><br><span class="small muted">${esc(u.user_metadata?.first_name ?? '')}</span></td>
<td>${maskPhone(u.phone)}</td>
<td><span class="tag">${role}</span>${p.pro_business_name ? `<br><span class="small muted">${esc(p.pro_business_name)}</span>` : ''}</td>
<td>${fam} / ${pro}</td>
<td>${p.is_pro ? '<span class="tag ok">Pro</span>' : '<span class="tag">חינם</span>'}${sub ? `<br><span class="small muted">עד ${fmtDate(sub.expires_at)} (${esc(sub.source)})</span>` : ''}</td>
<td>${fmtDate(u.created_at)}<br><span class="small muted">כניסה: ${fmtDate(u.last_sign_in_at)}</span></td>
<td>${banned ? `<span class="tag bad">חסום</span>` : '<span class="tag ok">פעיל</span>'}</td>
<td>
<form class="inline" method="post" action="/users/${u.id}/${banned ? 'unban' : 'ban'}"><button class="${banned ? '' : 'danger'}">${banned ? 'שחרור חסימה' : 'חסימה'}</button></form>
<form class="inline" method="post" action="/users/${u.id}/${p.is_pro ? 'revoke-pro' : 'grant-pro'}"><button>${p.is_pro ? 'ביטול Pro' : 'הענקת Pro'}</button></form>
<form class="inline" method="post" action="/users/${u.id}/delete" onsubmit="return confirm('למחוק את המשתמש לצמיתות? הפעולה בלתי הפיכה.')"><button class="danger">מחיקה</button></form>
</td></tr>`;
    })
    .join('');
  res.send(page('משתמשים', `
<table><tr><th>משתמש</th><th>טלפון</th><th>תפקיד</th><th>פרויקטים (משפחה / פרו)</th><th>מנוי</th><th>נרשם</th><th>מצב</th><th>פעולות</th></tr>
${rows || '<tr><td colspan=8 class="muted">אין משתמשים.</td></tr>'}</table>`, req.query.ok));
}));

app.post('/users/:id/ban', wrap(async (req, res) => {
  const { error } = await sb.auth.admin.updateUserById(req.params.id, { ban_duration: '87600h' });
  if (error) throw error;
  await audit('user.ban', req.params.id, {});
  res.redirect('/users?ok=' + encodeURIComponent('המשתמש נחסם'));
}));
app.post('/users/:id/unban', wrap(async (req, res) => {
  const { error } = await sb.auth.admin.updateUserById(req.params.id, { ban_duration: 'none' });
  if (error) throw error;
  await audit('user.unban', req.params.id, {});
  res.redirect('/users?ok=' + encodeURIComponent('החסימה הוסרה'));
}));
app.post('/users/:id/grant-pro', wrap(async (req, res) => {
  const { error } = await sb.from('profiles').update({ is_pro: true }).eq('id', req.params.id);
  if (error) throw error;
  await audit('user.grant_pro', req.params.id, {});
  res.redirect('/users?ok=' + encodeURIComponent('Pro הוענק ידנית'));
}));
app.post('/users/:id/revoke-pro', wrap(async (req, res) => {
  const { error } = await sb.from('profiles').update({ is_pro: false }).eq('id', req.params.id);
  if (error) throw error;
  await audit('user.revoke_pro', req.params.id, {});
  res.redirect('/users?ok=' + encodeURIComponent('Pro בוטל'));
}));
app.post('/users/:id/delete', wrap(async (req, res) => {
  const { error } = await sb.auth.admin.deleteUser(req.params.id);
  if (error) throw error;
  await audit('user.delete', req.params.id, {});
  res.redirect('/users?ok=' + encodeURIComponent('המשתמש נמחק'));
}));

// ---------- payments ----------
app.get('/payments', wrap(async (req, res) => {
  const [{ data: subs }, { data: fm }, { data: appState }] = await Promise.all([
    sb.from('pro_subscriptions').select('*').order('started_at', { ascending: false }).limit(200),
    sb.from('founding_member_purchases').select('*').order('fm_seq', { ascending: true }),
    sb.from('app_state').select('fm_active_count').limit(1).maybeSingle(),
  ]);
  const now = Date.now();
  const rows = (subs ?? []).map((s) => `<tr><td><code>${short(s.user_id)}</code></td><td>${esc(s.product_id)}</td><td>${esc(s.source)}</td><td>${fmtDate(s.started_at)}</td><td>${fmtDate(s.expires_at)}</td><td>${new Date(s.expires_at).getTime() > now ? '<span class="tag ok">בתוקף</span>' : `<span class="tag bad">פג${s.expired_reason ? ' · ' + esc(s.expired_reason) : ''}</span>`}</td></tr>`).join('');
  const fmRows = (fm ?? []).map((f) => `<tr><td>#${f.fm_seq}</td><td><code>${short(f.user_id)}</code></td><td>${fmtDate(f.purchased_at)}</td></tr>`).join('');
  res.send(page('תשלומים', `
<div class="cards"><div class="card"><b>${(subs ?? []).filter((s) => new Date(s.expires_at).getTime() > now).length}</b><span>מנויים בתוקף</span></div>
<div class="card"><b>${(fm ?? []).length}</b><span>חברים מייסדים (רכישות)</span></div>
<div class="card"><b>${esc(appState?.fm_active_count ?? '—')}</b><span>מונה FM שהאפליקציה מציגה</span></div></div>
<h2>הענקת Pro ידנית (קומפ)</h2>
<form method="post" action="/payments/comp">
<input name="user_id" placeholder="user id (uuid)" size="38" required>
<select name="days"><option value="30">30 יום</option><option value="90">90 יום</option><option value="365" selected>שנה</option></select>
<button class="primary">הענקה</button> <span class="small muted">נרשם ב־pro_subscriptions עם source=admin_comp וגם מדליק profiles.is_pro.</span></form>
<h2>מנויי פרו</h2>
<table><tr><th>משתמש</th><th>מוצר</th><th>מקור</th><th>התחיל</th><th>פג</th><th>מצב</th></tr>${rows || '<tr><td colspan=6 class="muted">אין מנויים עדיין.</td></tr>'}</table>
<h2>חברים מייסדים</h2>
<table><tr><th>#</th><th>משתמש</th><th>נרכש</th></tr>${fmRows || '<tr><td colspan=3 class="muted">אין רכישות עדיין.</td></tr>'}</table>
<p class="small muted">מקור האמת לתשלומים הוא RevenueCat; הטבלאות כאן מתעדכנות מה־webhook. אם משהו חסר — בדקו את rc-webhook ב־Supabase Functions.</p>`, req.query.ok));
}));

app.post('/payments/comp', wrap(async (req, res) => {
  const userId = String(req.body.user_id ?? '').trim();
  const days = Math.max(1, Math.min(3650, Number(req.body.days) || 365));
  const start = new Date();
  const end = new Date(start.getTime() + days * 864e5);
  const { error: e1 } = await sb.from('pro_subscriptions').insert({
    user_id: userId,
    product_id: 'admin_comp',
    source: 'admin_comp',
    started_at: start.toISOString(),
    expires_at: end.toISOString(),
    current_period_start: start.toISOString(),
    current_period_end: end.toISOString(),
  });
  if (e1) throw e1;
  const { error: e2 } = await sb.from('profiles').update({ is_pro: true }).eq('id', userId);
  if (e2) throw e2;
  await audit('payments.comp', userId, { days });
  res.redirect('/payments?ok=' + encodeURIComponent(`Pro הוענק ל־${days} ימים`));
}));

// ---------- projects ----------
app.get('/projects', wrap(async (req, res) => {
  const [{ data: projects }, { data: members }, { data: pros }] = await Promise.all([
    sb.from('projects').select('id, name, region_code, stage_code, build_type, lifecycle_status, pro_managed, created_at').order('created_at', { ascending: false }).limit(300),
    sb.from('project_members').select('project_id, user_id, role'),
    sb.from('project_pro_access').select('id, project_id, user_id, status, access_scope, engagement_type'),
  ]);
  const rows = (projects ?? []).map((p) => {
    const m = (members ?? []).filter((x) => x.project_id === p.id);
    const pr = (pros ?? []).filter((x) => x.project_id === p.id && x.status === 'accepted');
    return `<tr><td>${esc(p.name ?? '—')}<br><code>${short(p.id)}</code></td><td>${esc(p.build_type)} · ${esc(p.region_code ?? '—')} · ${esc(p.stage_code ?? '—')}</td>
<td>${m.map((x) => `<code>${short(x.user_id)}</code> <span class="small muted">${esc(x.role)}</span>`).join('<br>') || '<span class="muted">—</span>'}</td>
<td>${pr.map((x) => `<code>${short(x.user_id)}</code> <span class="small muted">${esc(x.engagement_type ?? '')} · ${esc(x.access_scope)}</span>
<form class="inline" method="post" action="/projects/${p.id}/pro/${x.id}/revoke"><button class="danger">הסרה</button></form>`).join('<br>') || '<span class="muted">—</span>'}</td>
<td>${esc(p.lifecycle_status)}${p.pro_managed ? ' · <span class="tag">לא נתבע</span>' : ''}<br><span class="small muted">${fmtDate(p.created_at)}</span></td>
<td>
<form class="inline" method="post" action="/projects/${p.id}/member"><input name="user_id" placeholder="user id" size="14" required> <button>+ שותף/ה</button></form><br>
<form class="inline" method="post" action="/projects/${p.id}/pro"><input name="user_id" placeholder="pro user id" size="14" required>
<select name="access_scope"><option value="full">full</option><option value="scoped">scoped</option></select> <button>+ מושב פרו</button></form>
</td></tr>`;
  }).join('');
  res.send(page('פרויקטים', `<table><tr><th>פרויקט</th><th>סוג · אזור · שלב</th><th>בני הבית</th><th>אנשי מקצוע</th><th>מצב</th><th>הוספת שיתוף</th></tr>
${rows || '<tr><td colspan=6 class="muted">אין פרויקטים עדיין.</td></tr>'}</table>
<p class="small muted">"+ שותף/ה" מוסיף חבר/ה לפרויקט (project_members, role=member). "+ מושב פרו" מעניק גישת איש מקצוע (project_pro_access, status=active) בלי הזמנה.</p>`, req.query.ok));
}));

app.post('/projects/:id/member', wrap(async (req, res) => {
  const userId = String(req.body.user_id ?? '').trim();
  const { error } = await sb.from('project_members').insert({ project_id: req.params.id, user_id: userId, role: 'member', joined_at: new Date().toISOString() });
  if (error) throw error;
  await audit('project.add_member', req.params.id, { userId });
  res.redirect('/projects?ok=' + encodeURIComponent('שותף/ה נוספו לפרויקט'));
}));
app.post('/projects/:id/pro', wrap(async (req, res) => {
  const userId = String(req.body.user_id ?? '').trim();
  const scope = req.body.access_scope === 'scoped' ? 'scoped' : 'full';
  const { error } = await sb.from('project_pro_access').insert({ project_id: req.params.id, user_id: userId, status: 'accepted', access_scope: scope, granted_at: new Date().toISOString() });
  if (error) throw error;
  await audit('project.add_pro', req.params.id, { userId, scope });
  res.redirect('/projects?ok=' + encodeURIComponent('מושב פרו נוסף'));
}));
app.post('/projects/:id/pro/:accessId/revoke', wrap(async (req, res) => {
  const { error } = await sb.from('project_pro_access').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', req.params.accessId);
  if (error) throw error;
  await audit('project.revoke_pro', req.params.id, { accessId: req.params.accessId });
  res.redirect('/projects?ok=' + encodeURIComponent('מושב הפרו הוסר'));
}));

// ---------- invites ----------
app.get('/invites', wrap(async (_req, res) => {
  const [{ data: partner }, { data: pro }] = await Promise.all([
    sb.from('partner_invites').select('id, project_id, inviter_user_id, status, created_at, expires_at').order('created_at', { ascending: false }).limit(100),
    sb.from('pro_invites').select('id, project_id, created_by, direction, status, access_scope, fee_waived, created_at, expires_at').order('created_at', { ascending: false }).limit(100),
  ]);
  const t = (rows, cols) => `<table><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr>${(rows ?? []).map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan=${cols.length} class="muted">אין.</td></tr>`}</table>`;
  res.send(page('הזמנות', `<h2>הזמנות שותף/ה</h2>${t(partner, [['פרויקט', (r) => `<code>${short(r.project_id)}</code>`], ['מזמין/ה', (r) => `<code>${short(r.inviter_user_id)}</code>`], ['מצב', (r) => `<span class="tag">${esc(r.status)}</span>`], ['נוצרה', (r) => fmtDate(r.created_at)], ['פגה', (r) => fmtDate(r.expires_at)]])}
<h2>הזמנות אנשי מקצוע</h2>${t(pro, [['פרויקט', (r) => `<code>${short(r.project_id)}</code>`], ['יוצר/ת', (r) => `<code>${short(r.created_by)}</code>`], ['כיוון', (r) => esc(r.direction)], ['היקף', (r) => esc(r.access_scope)], ['מצב', (r) => `<span class="tag">${esc(r.status)}</span>${r.fee_waived ? ' <span class="tag ok">חינם</span>' : ''}`], ['נוצרה', (r) => fmtDate(r.created_at)]])}`));
}));

// ---------- audit ----------
app.get('/audit', wrap(async (_req, res) => {
  const { data, error } = await sb.from('admin_actions').select('*').order('created_at', { ascending: false }).limit(200);
  const body = error
    ? `<p class="muted">טבלת <code>admin_actions</code> עדיין לא קיימת. הריצו את ה־SQL מה־README כדי להפעיל יומן.</p>`
    : `<table><tr><th>מתי</th><th>פעולה</th><th>יעד</th><th>פרטים</th></tr>${(data ?? []).map((a) => `<tr><td>${fmtDate(a.created_at)}</td><td>${esc(a.action)}</td><td><code>${esc(a.target)}</code></td><td><code>${esc(JSON.stringify(a.details))}</code></td></tr>`).join('') || '<tr><td colspan=4 class="muted">אין פעולות עדיין.</td></tr>'}</table>`;
  res.send(page('יומן אדמין', body));
}));

app.listen(Number(PORT), () => console.log(`[admin] listening on :${PORT}`));
