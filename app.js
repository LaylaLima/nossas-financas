import { authPassword, deriveKEK, inviteKey, importDataKey, encryptBytes, decryptBytes, encryptJSON, decryptJSON, randomBytes, newSalt, b64url, unb64url } from './crypto.js';
import { createBackend } from './backend.js';
import { MESES, MESES_LONGOS, WISH_LISTS, EXTRA_COLORS, templateItems, val, isPaid, r2, monthStats, yearStats, parsePlanilha } from './data.js';
import { brl, donut, hbars, timeChart, gauge } from './charts.js';
import { analyze, parseQuick, incomeStats } from './insights.js';
import { BUY_CATS, catOf, categorize, parseItems, parcelIn, parcelIdx, monthsOf, isoToday } from './buys.js';
import { ETAPAS, OBRA_KINDS, kindOf, PAYS, payLabel, guessKind, guessEtapa, parseObra, obraStats, terrenoParcelas } from './obra.js';

/* ================= utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const nowMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const shiftMonth = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const mLabel = (m) => { const [y, mo] = m.split('-').map(Number); return `${MESES_LONGOS[mo - 1]} ${y}`; };
const mShort = (m) => { const [y, mo] = m.split('-').map(Number); return `${MESES[mo - 1]}/${String(y).slice(2)}`; };
const num = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseMoney = (s) => {
  s = String(s ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 120.000 = cento e vinte mil
  const n = Number(s); return Number.isFinite(n) ? r2(n) : NaN;
};
const pct = (a, b) => (b ? Math.round((a - b) / Math.abs(b) * 100) : null);
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};
function toast(msg, ms = 2800) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.l = btn.textContent; btn.textContent = label || 'Aguarde…'; } else if (btn.dataset.l) btn.textContent = btn.dataset.l;
  btn.disabled = on;
}
function errMsg(e) {
  const m = e?.message || String(e);
  if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/already registered/i.test(m)) return 'Esse e-mail já tem conta. Use "Entrar".';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que chegou na sua caixa de entrada.';
  if (/row-level security|violates/i.test(m)) return 'Esse cofre já tem 2 pessoas ou o convite está errado.';
  if (/foreign key|invalid input syntax/i.test(m)) return 'Convite não encontrado.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão com o servidor.';
  return m;
}

/* ================= estado ================= */
const S = {
  be: null, user: null, mem: null, hid: null, dk: null, dkRaw: null, pw: null,
  items: new Map(), tab: ({ casamento: 'casa' })[LS.get('tab')] || LS.get('tab') || 'painel', casaSeg: LS.get('casaSeg') || 'obra', month: nowMonth(), edit: false,
  unsub: null, live: false, online: [], pending: false, flash: new Set(), cardView: null, prefill: null
};
const chartPref = (k, def) => LS.get('chart_' + k) || def;

const model = {
  get groups() { return [...S.items.values()].filter(i => i.type === 'group').sort((a, b) => a.order - b.order); },
  linesOf(gid) { return [...S.items.values()].filter(i => i.type === 'line' && i.group === gid).sort((a, b) => a.order - b.order || String(a.name).localeCompare(b.name)); },
  get cardGroup() { return this.groups.find(g => g.kind === 'cartao'); },
  get cards() { const g = this.cardGroup; return g ? this.linesOf(g.id) : []; },
  allLines() { return [...S.items.values()].filter(i => i.type === 'line'); },
  groupOf(l) { return S.items.get(l.group); },
  get etapas() { return [...S.items.values()].filter(i => i.type === 'etapa').sort((a, b) => a.order - b.order); },
  get obra() { return [...S.items.values()].filter(i => i.type === 'obra').sort((a, b) => (b._at || 0) - (a._at || 0))[0] || null; },
  get obraBuys() { return this.allBuys().filter(b => b.obra); },
  sysLine(k) { return [...S.items.values()].find(i => i.type === 'line' && i.sys === k) || null; },
  allBuys() { return [...S.items.values()].filter(i => i.type === 'buy'); },
  buysOf(cid) { return this.allBuys().filter(b => b.card === cid); },
  allWishes() { return [...S.items.values()].filter(i => i.type === 'wish'); },
  wishes(list) { return [...S.items.values()].filter(i => i.type === 'wish' && i.list === list).sort((a, b) => a.order - b.order); },
  get settings() {
    const s = [...S.items.values()].filter(i => i.type === 'settings').sort((a, b) => String(b._u).localeCompare(String(a._u)))[0];
    return { p1: s?.p1 || 'Pessoa 1', p2: s?.p2 || 'Pessoa 2', id: s?.id, people: s?.people || {}, raw: s };
  }
};

/* ================= criptografia dos itens ================= */
const aadItem = (id) => `item:${S.hid}:${id}`;
const aadDK = (hid, uid) => `dk:${hid}:${uid}`;

async function load() {
  const rows = await S.be.listItems(S.hid);
  const next = new Map();
  await Promise.all(rows.map(async r => {
    try { next.set(r.id, { ...(await decryptJSON(S.dk, r, aadItem(r.id))), id: r.id, _u: r.updated_at }); } catch { /* ignorado: inválido */ }
  }));
  S.items = next;
}
async function saveMany(objs, what) {
  const at = Date.now();
  const boxes = await Promise.all(objs.map(async o => {
    const id = o.id || crypto.randomUUID();
    const { id: _i, _u, ...clean } = o;
    clean._by = S.user.id; clean._at = at;
    if (what) clean._what = what; else delete clean._what;
    return { id, clean, ...(await encryptJSON(S.dk, clean, aadItem(id))) };
  }));
  await S.be.upsertItems(S.hid, boxes.map(({ id, iv, data }) => ({ id, iv, data })));
  const now = new Date().toISOString();
  boxes.forEach(b => S.items.set(b.id, { ...b.clean, id: b.id, _u: now }));
}
const save = (o, what) => saveMany([o], what);
async function removeMany(ids) { if (!ids.length) return; await S.be.deleteItems(ids); ids.forEach(id => S.items.delete(id)); }

/* ================= fluxo de acesso ================= */
async function start() {
  try { S.be = await createBackend(window.APP_CONFIG || {}); }
  catch (e) { app.innerHTML = `<section class="card narrow"><h2>Não consegui carregar</h2><p>${esc(errMsg(e))}</p></section>`; return; }
  $('#mode').textContent = S.be.remote ? '🔒 criptografado' : 'modo teste · só neste aparelho';
  $('#mode').classList.toggle('warn', !S.be.remote);
  try { await route(); }
  catch (e) { app.innerHTML = `<section class="card narrow center"><h2>Não consegui conectar</h2><p class="muted">${esc(errMsg(e))}</p><button class="btn" id="retry">Tentar de novo</button></section>`; $('#retry').addEventListener('click', () => location.reload()); }
}

async function route() {
  S.user = await S.be.getUser();
  if (!S.user) return viewAuth();
  if (!S.dk) {
    S.mem = await S.be.myMembership();
    if (!S.mem || !S.mem.wrapped_key) return viewHousehold();
    return viewUnlock();
  }
  viewMain();
}

async function unlock(pw) {
  try {
    const kek = await deriveKEK(pw, S.mem.kek_salt);
    const raw = await decryptBytes(kek, JSON.parse(S.mem.wrapped_key), aadDK(S.mem.household_id, S.user.id));
    S.dkRaw = raw; S.dk = await importDataKey(raw); S.hid = S.mem.household_id;
    return true;
  } catch { return false; }
}
async function wrapForMe(hid, raw, pw) {
  const salt = newSalt(), kek = await deriveKEK(pw, salt);
  return { kek_salt: salt, wrapped_key: JSON.stringify(await encryptBytes(kek, raw, aadDK(hid, S.user.id))) };
}

function viewAuth() {
  app.innerHTML = `
  <section class="card narrow hero-auth">
    <div class="lockicon">🔐</div>
    <h2>Entrar</h2>
    <p class="muted">Cada um de vocês tem o próprio e-mail e a própria senha.</p>
    <form id="f-auth" autocomplete="on">
      <label>E-mail<input name="email" type="email" autocomplete="username" required></label>
      <label>Senha<input name="pw" type="password" autocomplete="current-password" minlength="8" required></label>
      <button class="btn full" data-act="in">Entrar</button>
      <button class="btn ghost full" data-act="up">Criar minha conta</button>
    </form>
    <p class="muted small">Sua senha nunca sai do aparelho: ela é usada para destrancar os dados criptografados.
    <b>Não existe "esqueci a senha"</b> — se um esquecer, o outro consegue enviar um novo convite.</p>
  </section>`;
  const f = $('#f-auth');
  $$('button', f).forEach(b => b.addEventListener('click', async (ev) => {
    ev.preventDefault();
    if (!f.reportValidity()) return;
    const email = f.email.value.trim(), pw = f.pw.value;
    busy(b, true, 'Protegendo…');
    try {
      const apw = await authPassword(email, pw);
      if (b.dataset.act === 'in') await S.be.signIn(email, apw);
      else if (!(await S.be.signUp(email, apw))) { toast('Conta criada! Confirme pelo link no seu e-mail e depois entre.', 7000); busy(b, false); return; }
      S.user = await S.be.getUser();
      S.mem = await S.be.myMembership();
      if (S.mem?.wrapped_key) {
        if (!(await unlock(pw))) { busy(b, false); return toast('Não consegui destrancar o cofre com essa senha.'); }
        await load(); startSync(); return viewMain();
      }
      S.pw = pw; viewHousehold();
    } catch (e) { toast(errMsg(e)); busy(b, false); }
  }));
}

function viewHousehold() {
  const needPw = !S.pw;
  const pwField = needPw ? '<label>Sua senha<input name="pw" type="password" autocomplete="current-password" required></label>' : '';
  app.innerHTML = `
  <section class="card narrow">
    <h2>Criar nosso cofre</h2>
    <p class="muted">Faça isso só uma vez, em um de vocês. O outro entra pelo convite.</p>
    <form id="f-new">
      <label>Seu nome<input name="me" maxlength="30" required></label>
      <label>Nome do seu par<input name="par" maxlength="30" required></label>
      ${pwField}
      <button class="btn full">Criar cofre</button>
    </form>
  </section>
  <section class="card narrow">
    <h2>Recebi um convite</h2>
    <form id="f-join">
      <label>Código do convite<input name="code" required autocomplete="off" placeholder="cole aqui o código"></label>
      ${pwField}
      <button class="btn ghost full">Entrar no cofre</button>
    </form>
  </section>
  <p class="center"><button class="link" id="logout">Sair</button></p>`;
  $('#logout').addEventListener('click', logout);
  const getPw = (f) => S.pw || f.pw.value;

  $('#f-new').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target, b = $('button', f); busy(b, true, 'Criando…');
    try {
      const hid = crypto.randomUUID(), raw = randomBytes(32);
      const mine = await wrapForMe(hid, raw, getPw(f));
      await S.be.createHousehold(hid, mine);
      S.mem = { household_id: hid, ...mine };
      S.hid = hid; S.dkRaw = raw; S.dk = await importDataKey(raw); S.pw = null;
      const p1 = f.me.value.trim(), p2 = f.par.value.trim();
      await saveMany([{ type: 'settings', p1, p2, people: { [S.user.id]: p1 } }, ...templateItems(p1, p2)], 'criou o cofre');
      startSync();
      S.tab = 'ajustes'; viewMain();
      toast('Cofre criado! Agora gere o convite para seu par.', 5000);
    } catch (e) { toast(errMsg(e)); busy(b, false); }
  });

  $('#f-join').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target, b = $('button', f); busy(b, true, 'Entrando…');
    try {
      const [hid, secret] = f.code.value.trim().split('.');
      if (!hid || !secret) throw new Error('Código do convite incompleto.');
      const box = await S.be.joinHousehold(hid);
      if (!box) throw new Error('Convite já usado ou cancelado. Peça um novo.');
      let raw;
      try { raw = await decryptBytes(await inviteKey(secret, hid), JSON.parse(box), 'invite:' + hid); }
      catch { throw new Error('Código do convite inválido.'); }
      const mine = await wrapForMe(hid, raw, getPw(f));
      await S.be.setMyKey(hid, mine.kek_salt, mine.wrapped_key);
      S.mem = { household_id: hid, ...mine };
      await S.be.setInvite(hid, null);
      S.hid = hid; S.dkRaw = raw; S.dk = await importDataKey(raw); S.pw = null;
      await load();
      const st = model.settings;
      if (st.raw) await save({ ...st.raw, people: { ...st.people, [S.user.id]: st.p2 } }, 'entrou no cofre');
      startSync(); S.tab = 'painel'; viewMain(); toast('Pronto! Vocês estão no mesmo cofre. 💚');
    } catch (e) { toast(errMsg(e)); busy(b, false); }
  });
}

function viewUnlock() {
  app.innerHTML = `
  <section class="card narrow hero-auth">
    <div class="lockicon">🔒</div>
    <h2>Cofre trancado</h2>
    <p class="muted">${esc(S.user?.email || '')}</p>
    <form id="f-unlock">
      <label>Sua senha<input name="pw" type="password" autocomplete="current-password" required autofocus></label>
      <button class="btn full">Destrancar</button>
    </form>
    <p class="center"><button class="link" id="logout">Entrar com outra conta</button></p>
  </section>`;
  $('#logout').addEventListener('click', logout);
  $('#f-unlock').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const b = $('button', ev.target); busy(b, true, 'Destrancando…');
    if (!(await unlock(ev.target.pw.value))) { busy(b, false); return toast('Senha incorreta.'); }
    try { await load(); } catch (e) { toast(errMsg(e)); }
    startSync(); viewMain();
  });
}

function lock() { stopSync(); S.dk = null; S.dkRaw = null; S.items.clear(); route(); }
async function logout() { stopSync(); S.dk = null; S.dkRaw = null; S.items.clear(); S.pw = null; await S.be.signOut(); route(); }

/* ================= tempo real ================= */
const nameOf = (uid) => (uid === S.user?.id ? 'Você' : model.settings.people[uid] || 'Seu par');
function partnerName() { const st = model.settings; return Object.entries(st.people).find(([k]) => k !== S.user?.id)?.[1] || (st.people[S.user?.id] === st.p1 ? st.p2 : st.p1); }
function startSync() {
  stopSync();
  S.unsub = S.be.subscribe(S.hid, {
    onRow: async (r) => {
      try {
        const obj = await decryptJSON(S.dk, r, aadItem(r.id));
        const prev = S.items.get(r.id);
        if (prev && prev._at === obj._at && prev._by === obj._by) return; // já tenho
        S.items.set(r.id, { ...obj, id: r.id, _u: r.updated_at });
        if (obj._by && obj._by !== S.user.id) {
          notify(`${nameOf(obj._by)} ${obj._what || 'atualizou ' + (obj.name || 'um item')}`, obj._at);
          S.flash.add(r.id); scheduleRender();
        }
      } catch { /* inválido */ }
    },
    onDelete: (id) => { if (id && S.items.has(id)) { S.items.delete(id); notify(`${partnerName()} removeu um item`, 'del'); scheduleRender(); } },
    onPresence: (ids) => { S.online = ids.filter(i => i !== S.user.id); paintPresence(); },
    onStatus: (ok) => { S.live = ok; paintPresence(); }
  });
}
// junta avisos que chegam em sequência (ex.: importação de planilha) num aviso só
const N = { msgs: new Map(), t: null };
function notify(msg, key) {
  N.msgs.set(String(key ?? msg) + msg, msg);
  clearTimeout(N.t);
  N.t = setTimeout(() => {
    const list = [...new Set(N.msgs.values())]; N.msgs.clear();
    const main = [...list].reverse().find(x => !/removeu um item$/.test(x)) || list[list.length - 1];
    toast(`🔔 ${main}${list.length > 1 ? ` (+${list.length - 1} mudança${list.length > 2 ? 's' : ''})` : ''}`, 4500);
  }, 350);
}
function stopSync() { try { S.unsub?.(); } catch {} S.unsub = null; S.live = false; S.online = []; paintPresence(); }
function paintPresence() {
  const el = $('#mode'); if (!el) return;
  if (!S.dk) { el.textContent = S.be?.remote ? '🔒 criptografado' : 'modo teste · só neste aparelho'; el.classList.toggle('warn', !S.be?.remote); return; }
  el.classList.remove('warn');
  el.textContent = S.online.length ? `🟢 ${partnerName()} online` : S.live ? '🔒 ao vivo' : '🔒 criptografado';
}
const typing = () => { const a = document.activeElement; return a && app.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName); };
let renderT = null;
function scheduleRender() {
  if (!S.dk) return;
  clearTimeout(renderT);
  renderT = setTimeout(() => {
    if (!S.dk) return;
    if (typing()) { S.pending = true; return; }
    S.pending = false; const y = scrollY; viewMain(); scrollTo(0, y);
  }, 120);
}
document.addEventListener('focusout', () => setTimeout(() => { if (S.pending && !typing()) scheduleRender(); }, 250));
function applyFlash(root) {
  if (!S.flash.size) return;
  S.flash.forEach(id => $$(`[data-val="${CSS.escape(id)}"],[data-wprice="${CSS.escape(id)}"],[data-act-id="${CSS.escape(id)}"]`, root).forEach(el => {
    (el.closest('.ln,.ccard,li') || el).classList.add('flash');
  }));
  S.flash.clear();
}

/* ================= app principal ================= */
const TAB_ICONS = {'painel': `<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`, 'orcamento': `<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>`, 'cartoes': `<svg viewBox="0 0 24 24"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6 15h4"/></svg>`, 'casa': `<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>`, 'ajustes': `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>`};
const TABS = [['painel', 'Painel'], ['orcamento', 'Orçamento'], ['cartoes', 'Cartões'], ['casa', 'Casa'], ['ajustes', 'Ajustes']];

function viewMain() {
  LS.set('tab', S.tab);
  app.innerHTML = `<div id="tab"></div>
  <nav class="tabbar">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? 'on' : ''}" aria-label="${l}">${TAB_ICONS[k]}${l}</button>`).join('')}</nav>`;
  $$('.tabbar button').forEach(b => b.addEventListener('click', () => { S.tab = b.dataset.tab; S.edit = false; S.cardView = null; viewMain(); scrollTo(0, 0); }));
  ({ painel: tabPainel, orcamento: tabOrcamento, cartoes: tabCartoes, casa: tabCasa, ajustes: tabAjustes })[S.tab]($('#tab'));
  applyFlash(app); paintPresence();
}

function monthBar() {
  return `<div class="monthbar">
    <button class="icon" data-m="-1" aria-label="Mês anterior">‹</button>
    <b>${mLabel(S.month)}</b>
    <button class="icon" data-m="1" aria-label="Próximo mês">›</button>
    ${S.month !== nowMonth() ? '<button class="link small" data-m="0">hoje</button>' : ''}
  </div>`;
}
function bindMonth(root) {
  $$('[data-m]', root).forEach(b => b.addEventListener('click', () => {
    S.month = b.dataset.m === '0' ? nowMonth() : shiftMonth(S.month, Number(b.dataset.m)); viewMain();
  }));
}
function chartToggle(key, opts, cur) {
  return `<div class="seg-mini" data-chart="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}
function bindToggles(root) {
  $$('[data-chart]', root).forEach(el => $$('button', el).forEach(b => b.addEventListener('click', () => { LS.set('chart_' + el.dataset.chart, b.dataset.v); viewMain(); })));
}

/* ---------- PAINEL ---------- */
function tabPainel(root) {
  const st = monthStats(model, S.month);
  const prev = monthStats(model, shiftMonth(S.month, -1));
  const year = S.month.slice(0, 4);
  const ys = yearStats(model, year);
  const acum = ys[Number(S.month.slice(5)) - 1].acumulado;
  const despGroups = st.byGroup.filter(x => x.g.kind !== 'renda' && x.total > 0).sort((a, b) => b.total - a.total);
  const top = despGroups[0];
  const cards = model.cards.map(c => ({ c, v: val(c, S.month), pv: val(c, shiftMonth(S.month, -1)), paid: isPaid(c, S.month) }));
  const cardTotal = r2(cards.reduce((s, x) => s + x.v, 0));
  const cardPrev = r2(cards.reduce((s, x) => s + x.pv, 0));
  const ok = st.saldo >= 0;
  const dpct = pct(st.despesas, prev.despesas);

  const pOnde = chartPref('onde', 'rosca'), pAno = chartPref('ano', 'bar'), pCard = chartPref('cards', 'barras');
  const ondeData = despGroups.map(x => ({ label: x.g.name, value: x.total, color: x.g.color }));
  const cardColors = ['#5B6B3A', '#B8954A', '#8C7AA0', '#6E9A8C', '#C07A3E', '#C48A8A', '#9A9480', '#D4B26A', '#3F4A26', '#A88B5A'];
  const cardData = cards.map((x, i) => ({
    label: x.c.name + (x.paid ? ' ✓' : ''), value: x.v, color: cardColors[i % cardColors.length], max: x.c.limit || 0,
    extra: [x.c.limit ? `${Math.round(x.v / x.c.limit * 100)}% do limite de ${brl(x.c.limit)}` : '', x.pv ? `${x.v >= x.pv ? '▲' : '▼'} ${brl(Math.abs(x.v - x.pv))} vs mês anterior` : ''].filter(Boolean).join(' · ')
  }));
  const labels = MESES.map(m => m[0].toUpperCase() + m.slice(1));
  const wishAll = WISH_LISTS.flatMap(l => model.wishes(l.key));
  const wTotal = r2(wishAll.reduce((s, w) => s + (Number(w.price) || 0), 0));
  const wDone = r2(wishAll.filter(w => w.done).reduce((s, w) => s + (Number(w.price) || 0), 0));

  const ai = analyze(model, S.month);
  const mBuys = model.allBuys().filter(b => parcelIn(b, S.month) > 0);
  const bCat = {}; mBuys.forEach(b => bCat[b.cat] = r2((bCat[b.cat] || 0) + parcelIn(b, S.month)));
  const bData = Object.entries(bCat).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: `${catOf(k).i} ${catOf(k).n}`, value: v, color: catOf(k).c }));
  const bTot = r2(bData.reduce((s, x) => s + x.value, 0));
  if (bData.length) ai.items.push({ level: 'info', icon: catOf(Object.keys(bCat).sort((x, y) => bCat[y] - bCat[x])[0]).i, text: `Nos gastos detalhados dos cartões, o que mais pesou foi <b>${esc(bData[0].label.replace(/^\S+\s/, ''))}</b> (${brl(bData[0].value)}, ${Math.round(bData[0].value / bTot * 100)}%).` });
  const fut = r2(model.allBuys().reduce((s, b) => s + monthsOf(b).filter(x => x > S.month).reduce((t, x) => t + parcelIn(b, x), 0), 0));
  if (fut) ai.items.push({ level: 'info', icon: '📆', text: `Já existem <b>${brl(fut)}</b> em parcelas marcadas para os próximos meses.` });
  if (model.obra && model.etapas.length) {
    const os = obraStats(model.etapas, model.obraBuys);
    if (os.bUsed != null && os.bUsed > os.bPct + 10) ai.items.unshift({ level: 'warn', icon: '🏗️', text: `Obra: nas etapas orçadas, <b>${os.bUsed}% do valor</b> já foi gasto, mas o avanço é de <b>${os.bPct}%</b>. Vale revisar os custos.` });
    model.etapas.forEach(e => { const sp = os.spentBy[e.id] || 0; if (e.budget && sp > e.budget) ai.items.unshift({ level: 'warn', icon: '🧱', text: `A etapa <b>${esc(e.name)}</b> passou do orçado em ${brl(sp - e.budget)}.` }); });
    const obM = r2(model.obraBuys.reduce((s, b) => s + parcelIn(b, S.month), 0));
    if (obM) ai.items.push({ level: 'info', icon: '🏗️', text: `A obra pesa <b>${brl(obM)}</b> neste mês (${st.despesas ? Math.round(obM / st.despesas * 100) : 0}% das despesas).` });
    const t = model.obra.terreno, tl = model.sysLine('terreno');
    if (t?.dia && S.month === nowMonth() && val(tl, S.month) && !isPaid(tl, S.month)) {
      const d = Number(t.dia) - new Date().getDate();
      if (d < 0) ai.items.unshift({ level: 'bad', icon: '📍', text: `A parcela do terreno (${brl(val(tl, S.month))}) venceu dia ${t.dia} e não está marcada como paga.` });
      else if (d <= 5) ai.items.unshift({ level: 'warn', icon: '📍', text: `A parcela do terreno (${brl(val(tl, S.month))}) vence ${d === 0 ? '<b>hoje</b>' : `em <b>${d} dia${d > 1 ? 's' : ''}</b>`}.` });
    }
  }
  const acts = [...S.items.values()].filter(i => i._at && i._what).sort((a, b) => b._at - a._at).slice(0, 6);
  root.innerHTML = `
  ${monthBar()}
  <form id="quick" class="quick" autocomplete="off">
    <input name="q" placeholder="⚡ Lance rápido: ex. bradesco 1250" aria-label="Lançamento rápido">
    <button class="btn small">OK</button>
  </form>
  <div id="quick-res"></div>
  <section class="hero ${ok ? 'good' : 'bad'}">
    <small>${ok ? 'Sobra este mês' : 'Falta este mês'}</small>
    <div class="hero-v">${brl(Math.abs(st.saldo))}</div>
    <div class="hero-sub">${ok ? '✅ As contas cabem na renda' : '⚠️ As despesas passaram da renda'}</div>
    <div class="hero-split"><span>Entrou <b>${brl(st.renda)}</b></span><span>Saiu <b>${brl(st.despesas)}</b></span></div>
  </section>

  ${ai.items.length ? `<section class="card ai">
    <div class="card-h"><h3>🧠 O que o app percebeu</h3>${ai.label ? `<span class="score ${ai.label[1]}">Saúde ${ai.score} · ${ai.label[0]}</span>` : ''}</div>
    <ul class="ai-list">${ai.items.map((x, i) => `<li class="${x.level}"><span>${x.icon}</span><div>${x.text}${x.action === 'fill' ? `<br><button class="btn small ghost" data-ai="${i}">🪄 Preencher com os valores do mês passado</button>` : ''}</div></li>`).join('')}</ul>
  </section>` : ''}

  <div class="kpis">
    <div class="kpi"><small>💳 Cartões</small><b>${brl(cardTotal)}</b>${cardPrev ? `<em class="${cardTotal > cardPrev ? 'neg' : 'pos'}">${cardTotal > cardPrev ? '▲' : '▼'} ${Math.abs(pct(cardTotal, cardPrev))}%</em>` : ''}</div>
    <div class="kpi"><small>📈 Saldo no ano</small><b class="${acum >= 0 ? 'pos' : 'neg'}">${brl(acum)}</b></div>
    <div class="kpi"><small>🧾 Despesas vs mês anterior</small><b>${dpct == null ? '—' : (dpct > 0 ? '▲ ' : dpct < 0 ? '▼ ' : '') + Math.abs(dpct) + '%'}</b></div>
    <div class="kpi"><small>🏆 Maior gasto</small><b class="ell">${top ? esc(top.g.name) : '—'}</b>${top ? `<em>${brl(top.total)}</em>` : ''}</div>
  </div>

  <section class="card">
    <div class="card-h"><h3>Contas do mês</h3><span class="muted small">${brl(st.pago)} pagos de ${brl(st.despesas)}</span></div>
    <div class="pay">
      ${gauge(st.despesas ? st.pago / st.despesas : 0)}
      <div><p class="big ${st.falta > 0 ? 'neg' : 'pos'}">${st.falta > 0 ? `Falta pagar ${brl(st.falta)}` : st.despesas ? 'Tudo pago! 🎉' : 'Nada lançado'}</p>
      <p class="muted small">Marque "pago" no Orçamento ou nos Cartões.</p></div>
    </div>
  </section>

  <div class="ornament">o nosso mês</div>
  <section class="card">
    <div class="card-h"><h3>Para onde vai o dinheiro</h3>${chartToggle('onde', [['rosca', 'Rosca'], ['barras', 'Barras']], pOnde)}</div>
    ${pOnde === 'rosca' ? donut(ondeData, brl(st.despesas).replace(',00', ''), 'despesas') : hbars(ondeData)}
  </section>

  <section class="card">
    <div class="card-h"><h3>Cartões em ${mShort(S.month)}</h3>${chartToggle('cards', [['barras', 'Barras'], ['rosca', 'Rosca']], pCard)}</div>
    ${cards.length ? (pCard === 'rosca' ? donut(cardData, brl(cardTotal).replace(',00', ''), 'nos cartões') : hbars(cardData, { showZero: true })) : '<p class="muted">Nenhum cartão cadastrado.</p>'}
  </section>

  ${bData.length ? `<section class="card">
    <div class="card-h"><h3>🛍️ No que gastamos nos cartões</h3><span class="muted small">${brl(bTot)} detalhados</span></div>
    ${chartPref('bcat', 'rosca') === 'rosca' ? donut(bData, brl(bTot).replace(',00', ''), 'detalhado') : hbars(bData)}
    ${chartToggle('bcat', [['rosca', 'Rosca'], ['barras', 'Barras']], chartPref('bcat', 'rosca'))}
  </section>` : ''}

  ${(() => { const inc = incomeStats(model, S.month, 12); if (!inc || inc.n < 2) return '';
    const ms = Array.from({ length: 12 }, (_, i) => shiftMonth(S.month, i - 11)).filter(x => monthStats(model, x).renda > 0 || x === S.month);
    const vs = ms.map(x => monthStats(model, x).renda);
    return `<section class="card">
    <div class="card-h"><h3>Como a renda variou</h3><span class="muted small">${inc.variable ? 'renda variável' : 'renda estável'}</span></div>
    <div class="kpis three"><div class="kpi"><small>Mês mais fraco</small><b>${brl(inc.min)}</b></div><div class="kpi"><small>Média</small><b>${brl(inc.avg)}</b></div><div class="kpi"><small>Mês mais forte</small><b>${brl(inc.max)}</b></div></div>
    ${timeChart(ms.map(mShort), [{ name: 'Renda', color: '#6B7B45', values: vs }], 'line', { name: 'Média', color: '#B8954A', values: ms.map(() => inc.avg) })}
    <p class="muted small">Dica: planejem as contas fixas pelo mês mais fraco. O que entrar acima disso vai para a reserva ou para a obra.</p>
  </section>`; })()}

  <section class="card">
    <div class="card-h"><h3>Ano ${year}: entrou x saiu</h3>${chartToggle('ano', [['bar', 'Colunas'], ['line', 'Linhas']], pAno)}</div>
    ${timeChart(labels, [{ name: 'Renda', color: '#6B7B45', values: ys.map(s => s.renda) }, { name: 'Despesas', color: '#B5714E', values: ys.map(s => s.despesas) }], pAno, { name: 'Saldo acumulado', color: '#B8954A', values: ys.map(s => s.acumulado) })}
  </section>

  ${model.obra && model.etapas.length ? (() => { const os = obraStats(model.etapas, model.obraBuys); const t = model.obra.terreno; return `<section class="card casa-sum" data-go="casa">
    <div class="card-h"><h3>🏡 Nossa casa</h3><span class="muted small">ver detalhes ›</span></div>
    <div class="kpis two"><div class="kpi"><small>🏗️ Obra</small><b>${os.pct}% pronta</b><em>${brl(os.spent)} gastos</em></div>
    <div class="kpi"><small>📍 Terreno</small><b>${t?.valor ? brl(t.valor) : '—'}</b><em>${t?.parcelas ? `${t.parcelas} parcelas de ${brl(t.valorParcela)}` : t?.valor ? 'à vista' : 'cadastre em Casa'}</em></div></div>
    <div class="prog"><i style="width:${os.pct}%"></i></div></section>`; })() : ''}

  ${wishAll.length ? `<section class="card">
    <div class="card-h"><h3>🛋️ Compras da casa</h3><span class="muted small">${wishAll.filter(w => w.done).length} de ${wishAll.length} itens</span></div>
    <div class="prog"><i style="width:${wTotal ? (wDone / wTotal * 100).toFixed(1) : 0}%"></i></div>
    <p class="small">${brl(wDone)} comprados de ${brl(wTotal)} · <b>faltam ${brl(wTotal - wDone)}</b></p>
  </section>` : ''}

  ${acts.length ? `<section class="card">
    <h3>🕑 Últimas mudanças</h3>
    <ul class="acts">${acts.map(x => `<li><b>${esc(nameOf(x._by))}</b> ${esc(x._what)} <small class="muted">${ago(x._at)}</small></li>`).join('')}</ul>
  </section>` : ''}`;
  bindMonth(root); bindToggles(root);

  $$('[data-ai]', root).forEach(b => b.addEventListener('click', async () => {
    const it = ai.items[Number(b.dataset.ai)];
    busy(b, true, 'Preenchendo…');
    try {
      await saveMany(it.fill.map(f => { const l = S.items.get(f.id); return { ...l, vals: { ...l.vals, [S.month]: { v: f.v, p: false } } }; }), `preencheu ${it.fill.length} contas fixas de ${mShort(S.month)}`);
      toast('Contas fixas preenchidas! Confira no Orçamento.'); viewMain();
    } catch (e) { toast(errMsg(e)); busy(b, false); }
  }));
  bindQuick(root);
  $$('[data-go]', root).forEach(el => el.addEventListener('click', () => { S.tab = el.dataset.go; viewMain(); scrollTo(0, 0); }));
}

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function bindQuick(root) {
  const f = $('#quick', root), out = $('#quick-res', root);
  const lines = model.allLines().map(l => ({ ...l, _group: model.groupOf(l)?.kind }));
  const show = (q) => {
    const r = parseQuick(q, lines);
    if (!r.matches.length) { out.innerHTML = `<p class="quick-msg">Não achei nenhuma conta parecida com "${esc(r.words.join(' ') || q)}". Tente o nome do cartão ou da linha do Orçamento.</p>`; return; }
    if (r.amount == null) { out.innerHTML = `<p class="quick-msg">Faltou o valor. Ex.: "${esc(r.matches[0].name.toLowerCase())} 150".</p>`; return; }
    const pick = (l) => {
      const cur = val(l, S.month), g = model.groupOf(l);
      out.innerHTML = `<div class="quick-card">
        <div><b>${esc(l.name)}</b> <small class="muted">${esc(g?.name || '')} · ${mShort(S.month)}</small><br>
        <small class="muted">Hoje: ${brl(cur)}${r.paid ? ' · vai marcar como pago' : ''}</small></div>
        <div class="row wrap">
          ${cur ? `<button class="btn small" data-q="add">Somar ${brl(r.amount)} → ${brl(r2(cur + r.amount))}</button>` : ''}
          <button class="btn small ${cur ? 'ghost' : ''}" data-q="set">${cur ? 'Trocar para' : 'Lançar'} ${brl(r.amount)}</button>
        </div>
        ${g?.kind === 'cartao' ? `<button class="btn small ghost" data-q="detail">🧾 Registrar como gasto detalhado no ${esc(l.name)}</button>` : ''}
        ${r.matches.length > 1 ? `<small class="muted">Não é essa? ${r.matches.filter(m => m.id !== l.id).map(m => `<button class="chip" data-alt="${esc(m.id)}">${esc(m.name)}</button>`).join(' ')}</small>` : ''}
      </div>`;
      $$('[data-q]', out).forEach(b => b.addEventListener('click', async () => {
        if (b.dataset.q === 'detail') { S.tab = 'cartoes'; S.cardView = l.id; S.prefill = q; viewMain(); scrollTo(0, 0); return; }
        const v = b.dataset.q === 'add' ? r2(cur + r.amount) : r.amount;
        try { await setVal(l.id, S.month, r.paid ? { v, p: true } : { v }); toast(`✔ ${l.name}: ${brl(v)}`); S.flash.add(l.id); viewMain(); }
        catch (e) { toast(errMsg(e)); }
      }));
      $$('[data-alt]', out).forEach(b => b.addEventListener('click', () => pick(lines.find(x => x.id === b.dataset.alt))));
    };
    pick(r.matches[0]);
  };
  f.addEventListener('submit', (ev) => { ev.preventDefault(); if (f.q.value.trim()) show(f.q.value); });
}

/* ---------- ORÇAMENTO ---------- */
function moneyInput(line, m, cls = '') {
  const v = line.vals?.[m]?.v;
  return `<input class="money ${cls}" inputmode="decimal" data-val="${esc(line.id)}" value="${v ? num(v) : ''}" placeholder="0,00" aria-label="Valor de ${esc(line.name)}">`;
}
async function setVal(lineId, m, patch) {
  const l = S.items.get(lineId); if (!l) return;
  const vals = { ...(l.vals || {}) };
  const cur = { ...(vals[m] || {}) , ...patch };
  if ('v' in patch && !patch.auto) delete cur.auto; // valor digitado à mão
  if (!cur.v && !cur.p) delete vals[m]; else vals[m] = cur;
  const what = 'v' in patch ? `mudou ${l.name} (${mShort(m)}) para ${brl(cur.v || 0)}` : `marcou ${l.name} como ${cur.p ? 'pago ✅' : 'não pago'}`;
  await save({ ...l, vals }, what);
}
// Recalcula a fatura pela soma dos gastos detalhados (só se a fatura estiver vazia ou já for automática)
function cardWithSums(card, months, buys) { return lineWithSums(card, months, buys.filter(b => b.card === card.id)); }
function lineWithSums(card, months, buys) {
  const vals = { ...(card.vals || {}) };
  for (const m of new Set(months)) {
    const sum = r2(buys.reduce((s, b) => s + parcelIn(b, m), 0));
    const cur = vals[m];
    if (!cur || cur.auto || !cur.v) {
      if (sum) vals[m] = { ...(cur || {}), v: sum, auto: true };
      else if (cur?.auto) { const { v, auto, ...rest } = cur; if (rest.p) vals[m] = rest; else delete vals[m]; }
    }
  }
  return { ...card, vals };
}
const fmtD = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';

function bindValueInputs(root, after) {
  $$('[data-val]', root).forEach(inp => {
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    inp.addEventListener('change', async () => {
      const v = parseMoney(inp.value);
      if (Number.isNaN(v) || v < 0) { toast('Valor inválido.'); return; }
      inp.value = v ? num(v) : '';
      try { await setVal(inp.dataset.val, S.month, { v }); after?.(); inp.classList.add('saved'); setTimeout(() => inp.classList.remove('saved'), 900); }
      catch (e) { toast(errMsg(e)); }
    });
  });
  $$('[data-paid]', root).forEach(cb => cb.addEventListener('change', async () => {
    try { await setVal(cb.dataset.paid, S.month, { p: cb.checked }); after?.(); } catch (e) { toast(errMsg(e)); cb.checked = !cb.checked; }
  }));
}

function tabOrcamento(root) {
  const st = monthStats(model, S.month);
  const open = new Set(JSON.parse(LS.get('open_groups') || '[]'));
  root.innerHTML = `
  ${monthBar()}
  <div class="sumbar">
    <div><small>Renda</small><b class="pos" id="s-r">${brl(st.renda)}</b></div>
    <div><small>Despesas</small><b class="neg" id="s-d">${brl(st.despesas)}</b></div>
    <div><small>Saldo</small><b id="s-s" class="${st.saldo >= 0 ? 'pos' : 'neg'}">${brl(st.saldo)}</b></div>
  </div>
  <div class="row wrap toolbar">
    <button class="btn small ghost" id="copyprev">⤵ Copiar valores de ${mShort(shiftMonth(S.month, -1))}</button>
    <button class="btn small ${S.edit ? '' : 'ghost'}" id="edit">${S.edit ? '✓ Concluir edição' : '✏️ Editar categorias'}</button>
  </div>
  ${model.groups.map(g => {
    const tot = st.byGroup.find(x => x.g.id === g.id);
    const lines = model.linesOf(g.id);
    return `<details class="grp" data-g="${esc(g.id)}" ${open.has(g.id) || S.edit ? 'open' : ''}>
      <summary><span class="dot" style="background:${g.color}"></span>
        ${S.edit ? `<input class="gname" data-gname="${esc(g.id)}" value="${esc(g.name)}" maxlength="40">` : `<span class="gn">${esc(g.name)}</span>`}
        <b class="gt" data-gt="${esc(g.id)}">${brl(tot?.total)}</b></summary>
      ${g.kind === 'renda' ? (() => { const inc = incomeStats(model, S.month); const rec = r2(lines.reduce((s, l) => s + (isPaid(l, S.month) ? val(l, S.month) : 0), 0));
        return `<p class="muted small inc-note">${tot?.total ? `Já recebido: <b>${brl(rec)}</b> de ${brl(tot.total)}. ` : ''}${inc?.variable ? `Nos últimos ${inc.n} meses a renda foi de ${brl(inc.min)} a ${brl(inc.max)} (média ${brl(inc.avg)}).` : ''} Lance o valor quando o dinheiro cair; renda variável não é copiada automaticamente.</p>`; })() : ''}
      <div class="lines">
      ${lines.map(l => `<div class="ln">
          ${S.edit ? `<input class="lname" data-lname="${esc(l.id)}" value="${esc(l.name)}" maxlength="50">` : `<span class="ln-n">${esc(l.name)}</span>`}
          ${moneyInput(l, S.month)}
          <label class="paid" title="${g.kind === 'renda' ? 'Recebido' : 'Pago'}"><input type="checkbox" data-paid="${esc(l.id)}" ${isPaid(l, S.month) ? 'checked' : ''}><span>${g.kind === 'renda' ? 'recebido' : 'pago'}</span></label>
          ${S.edit ? `<button class="icon del" data-ldel="${esc(l.id)}" aria-label="Excluir linha">✕</button>` : ''}
        </div>`).join('')}
      ${S.edit ? `<form class="addline row" data-addline="${esc(g.id)}"><input name="n" placeholder="+ nova linha em ${esc(g.name)}" maxlength="50" required><button class="btn small">Adicionar</button></form>
        <p class="right"><button class="link small danger" data-gdel="${esc(g.id)}">Excluir categoria inteira</button></p>` : ''}
      </div></details>`;
  }).join('')}
  ${S.edit ? `<form id="f-addgroup" class="card row"><input name="n" placeholder="+ nova categoria (ex.: Casa, Pets)" maxlength="40" required><button class="btn small">Criar</button></form>` : ''}`;
  bindMonth(root);

  $$('details.grp', root).forEach(d => d.addEventListener('toggle', () => {
    if (S.edit) return;
    const s = new Set(JSON.parse(LS.get('open_groups') || '[]'));
    d.open ? s.add(d.dataset.g) : s.delete(d.dataset.g); LS.set('open_groups', JSON.stringify([...s]));
  }));
  const refreshTotals = () => {
    const s = monthStats(model, S.month);
    $('#s-r', root).textContent = brl(s.renda); $('#s-d', root).textContent = brl(s.despesas);
    const ss = $('#s-s', root); ss.textContent = brl(s.saldo); ss.className = s.saldo >= 0 ? 'pos' : 'neg';
    s.byGroup.forEach(x => { const el = $(`[data-gt="${CSS.escape(x.g.id)}"]`, root); if (el) el.textContent = brl(x.total); });
  };
  bindValueInputs(root, refreshTotals);

  $('#edit', root).addEventListener('click', () => { S.edit = !S.edit; viewMain(); });
  $('#copyprev', root).addEventListener('click', async () => {
    const pm = shiftMonth(S.month, -1);
    const lines = [...S.items.values()].filter(i => i.type === 'line' && val(i, pm) && !val(i, S.month) && model.groupOf(i)?.kind !== 'renda');
    if (!lines.length) return toast(`Nada para copiar (os valores de ${mShort(pm)} já estão aqui ou estão vazios).`);
    if (!confirm(`Copiar ${lines.length} valor(es) de ${mShort(pm)} para ${mShort(S.month)}? (Só preenche o que está vazio, sem marcar como pago. A renda não é copiada, porque varia.)`)) return;
    try { await saveMany(lines.map(l => ({ ...l, vals: { ...l.vals, [S.month]: { v: val(l, pm), p: false } } })), `copiou os valores de ${mShort(pm)} para ${mShort(S.month)}`); viewMain(); toast('Valores copiados!'); }
    catch (e) { toast(errMsg(e)); }
  });

  if (!S.edit) return;
  $$('[data-gname]', root).forEach(inp => {
    inp.addEventListener('click', e => e.preventDefault());
    inp.addEventListener('keydown', e => { if (e.key === ' ') e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    inp.addEventListener('change', async () => { const g = S.items.get(inp.dataset.gname); if (inp.value.trim()) await save({ ...g, name: inp.value.trim() }).catch(e => toast(errMsg(e))); });
  });
  $$('[data-lname]', root).forEach(inp => inp.addEventListener('change', async () => {
    const l = S.items.get(inp.dataset.lname); if (inp.value.trim()) await save({ ...l, name: inp.value.trim() }).catch(e => toast(errMsg(e)));
  }));
  $$('[data-ldel]', root).forEach(b => b.addEventListener('click', async () => {
    const l = S.items.get(b.dataset.ldel);
    if (!confirm(`Excluir a linha "${l.name}" e todos os valores dela (todos os meses)?`)) return;
    await removeMany([l.id]).catch(e => toast(errMsg(e))); viewMain();
  }));
  $$('[data-addline]', root).forEach(f => f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const gid = f.dataset.addline, n = model.linesOf(gid).length;
    await save({ type: 'line', group: gid, name: f.n.value.trim(), order: n, vals: {} }).catch(e => toast(errMsg(e))); viewMain();
  }));
  $$('[data-gdel]', root).forEach(b => b.addEventListener('click', async () => {
    const g = S.items.get(b.dataset.gdel);
    if (!confirm(`Excluir a categoria "${g.name}" com todas as linhas e valores?`)) return;
    await removeMany([g.id, ...model.linesOf(g.id).map(l => l.id)]).catch(e => toast(errMsg(e))); viewMain();
  }));
  $('#f-addgroup', root).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const n = model.groups.length;
    await save({ type: 'group', key: 'extra-' + Date.now(), name: ev.target.n.value.trim(), kind: 'despesa', color: EXTRA_COLORS[n % EXTRA_COLORS.length], order: n }).catch(e => toast(errMsg(e)));
    viewMain();
  });
}

/* ---------- CARTÕES ---------- */
function tabCartoes(root) {
  if (S.cardView && S.items.get(S.cardView)) return tabCardDetail(root, S.items.get(S.cardView));
  S.cardView = null;
  let g = model.cardGroup;
  const cards = model.cards;
  const pm = shiftMonth(S.month, -1);
  const total = r2(cards.reduce((s, c) => s + val(c, S.month), 0));
  const totalPrev = r2(cards.reduce((s, c) => s + val(c, pm), 0));
  const paid = r2(cards.reduce((s, c) => s + (isPaid(c, S.month) ? val(c, S.month) : 0), 0));
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(S.month, i - 5));
  const d = pct(total, totalPrev);

  root.innerHTML = `
  ${monthBar()}
  <section class="hero cards-hero">
    <small>Total nos cartões</small>
    <div class="hero-v" id="c-tot">${brl(total)}</div>
    <div class="hero-sub">${d == null ? '' : `${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${Math.abs(d)}% vs ${mShort(pm)} (${brl(totalPrev)})`}</div>
    <div class="hero-split"><span>Pago <b id="c-pago">${brl(paid)}</b></span><span>A pagar <b id="c-falta">${brl(total - paid)}</b></span></div>
  </section>
  <p class="muted small center">Toque no valor para alterar. Os dois veem a mudança na hora.</p>
  <div class="cardgrid">
  ${cards.map(c => {
    const v = val(c, S.month), lim = Number(c.limit) || 0, pv = val(c, pm);
    return `<section class="ccard ${isPaid(c, S.month) ? 'is-paid' : ''}">
      <div class="cc-h"><input class="cc-name" data-cname="${esc(c.id)}" value="${esc(c.name)}" maxlength="30" aria-label="Nome do cartão">
        <button class="icon del" data-cdel="${esc(c.id)}" aria-label="Excluir cartão">✕</button></div>
      <label class="cc-val">Fatura de ${mShort(S.month)}<span class="money-wrap">R$ ${moneyInput(c, S.month, 'big')}</span></label>
      ${pv ? `<small class="muted">Mês anterior: ${brl(pv)}</small>` : ''}
      ${lim ? `<div class="limit"><div class="prog small ${v / lim > .8 ? 'warn' : ''}"><i style="width:${Math.min(100, v / lim * 100).toFixed(1)}%"></i></div><small>${Math.round(v / lim * 100)}% do limite (${brl(lim)})</small></div>` : ''}
      ${(() => { const bs = model.buysOf(c.id).filter(b => parcelIn(b, S.month) > 0); const det = r2(bs.reduce((s, b) => s + parcelIn(b, S.month), 0));
        return `<button class="btn small ghost full gastos-btn" data-cview="${esc(c.id)}">🧾 ${bs.length ? `${bs.length} gasto${bs.length > 1 ? 's' : ''} detalhado${bs.length > 1 ? 's' : ''} · ${brl(det)}` : 'Detalhar gastos desta fatura'} ›</button>
        ${bs.length && v && Math.abs(v - det) > 0.009 ? `<small class="muted">${v > det ? `${brl(v - det)} ainda sem detalhe` : `detalhado passa a fatura em ${brl(det - v)}`}</small>` : ''}`; })()}
      <div class="cc-f">
        <label class="paid"><input type="checkbox" data-paid="${esc(c.id)}" ${isPaid(c, S.month) ? 'checked' : ''}><span>fatura paga</span></label>
        <label class="lim">Limite <input inputmode="decimal" data-climit="${esc(c.id)}" value="${lim ? num(lim) : ''}" placeholder="opcional"></label>
        <label class="lim">Vence dia <input class="due" type="number" min="1" max="31" inputmode="numeric" data-cdue="${esc(c.id)}" value="${esc(c.due || '')}" placeholder="—"></label>
      </div>
    </section>`;
  }).join('')}
  </div>
  <form id="f-card" class="card row"><input name="n" placeholder="+ nome do novo cartão" maxlength="30" required><button class="btn small">Adicionar cartão</button></form>
  <section class="card">
    <h3>Faturas dos últimos 6 meses</h3>
    ${timeChart(months.map(mShort), [{ name: 'Total cartões', color: '#B8954A', values: months.map(m => r2(cards.reduce((s, c) => s + val(c, m), 0))) }], chartPref('cardhist', 'bar'))}
    ${chartToggle('cardhist', [['bar', 'Colunas'], ['line', 'Linha']], chartPref('cardhist', 'bar'))}
  </section>`;
  bindMonth(root); bindToggles(root);
  const refresh = () => {
    const t = r2(model.cards.reduce((s, c) => s + val(c, S.month), 0));
    const p = r2(model.cards.reduce((s, c) => s + (isPaid(c, S.month) ? val(c, S.month) : 0), 0));
    $('#c-tot', root).textContent = brl(t); $('#c-pago', root).textContent = brl(p); $('#c-falta', root).textContent = brl(t - p);
    $$('[data-paid]', root).forEach(cb => cb.closest('.ccard').classList.toggle('is-paid', cb.checked));
  };
  bindValueInputs(root, refresh);
  $$('[data-cview]', root).forEach(b => b.addEventListener('click', () => { S.cardView = b.dataset.cview; viewMain(); scrollTo(0, 0); }));
  $$('[data-cname]', root).forEach(inp => inp.addEventListener('change', async () => {
    const c = S.items.get(inp.dataset.cname); if (inp.value.trim()) await save({ ...c, name: inp.value.trim() }).catch(e => toast(errMsg(e)));
  }));
  $$('[data-climit]', root).forEach(inp => inp.addEventListener('change', async () => {
    const v = parseMoney(inp.value); if (Number.isNaN(v)) return toast('Valor inválido.');
    const c = S.items.get(inp.dataset.climit); await save({ ...c, limit: v || null }).catch(e => toast(errMsg(e))); viewMain();
  }));
  $$('[data-cdue]', root).forEach(inp => inp.addEventListener('change', async () => {
    const d = Number(inp.value); if (inp.value && !(d >= 1 && d <= 31)) return toast('Dia inválido (1 a 31).');
    const c = S.items.get(inp.dataset.cdue); await save({ ...c, due: d || null }, `definiu o vencimento do ${c.name} para dia ${d}`).catch(e => toast(errMsg(e)));
  }));
  $$('[data-cdel]', root).forEach(b => b.addEventListener('click', async () => {
    const c = S.items.get(b.dataset.cdel);
    if (!confirm(`Excluir o cartão "${c.name}" e as faturas de todos os meses?`)) return;
    await removeMany([c.id]).catch(e => toast(errMsg(e))); viewMain();
  }));
  $('#f-card', root).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      if (!g) { g = { id: crypto.randomUUID(), type: 'group', key: 'cartoes', name: 'Cartões', kind: 'cartao', color: '#B8954A', order: 1 }; await save(g); }
      await save({ type: 'line', group: g.id, name: ev.target.n.value.trim(), order: model.cards.length, vals: {} }, `adicionou o cartão ${ev.target.n.value.trim()}`); viewMain();
    } catch (e) { toast(errMsg(e)); }
  });
}

/* ---------- GASTOS DETALHADOS DE UM CARTÃO ---------- */
function catOptions(sel) { return BUY_CATS.map(c => `<option value="${c.k}" ${c.k === sel ? 'selected' : ''}>${c.i} ${esc(c.n)}</option>`).join(''); }

function tabCardDetail(root, c) {
  const m = S.month;
  const list = model.buysOf(c.id).filter(b => parcelIn(b, m) > 0).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b._at || 0) - (a._at || 0));
  const det = r2(list.reduce((s, b) => s + parcelIn(b, m), 0));
  const fat = val(c, m), auto = !!c.vals?.[m]?.auto;
  const future = r2(model.buysOf(c.id).reduce((s, b) => s + monthsOf(b).filter(x => x > m).reduce((t, x) => t + parcelIn(b, x), 0), 0));
  const byCat = {}; list.forEach(b => byCat[b.cat] = r2((byCat[b.cat] || 0) + parcelIn(b, m)));
  const catData = Object.entries(byCat).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ label: `${catOf(k).i} ${catOf(k).n}`, value: v, color: catOf(k).c }));

  root.innerHTML = `
  <button class="link back" id="back">‹ Voltar aos cartões</button>
  ${monthBar()}
  <section class="hero cards-hero">
    <small>${esc(c.name)} · fatura de ${mShort(m)}</small>
    <div class="hero-v">${brl(fat)}</div>
    <div class="hero-sub">${list.length ? `${list.length} gasto${list.length > 1 ? 's' : ''} detalhado${list.length > 1 ? 's' : ''} = ${brl(det)}` : 'Nenhum gasto detalhado ainda'}${auto ? ' · fatura somada automaticamente' : ''}</div>
    ${!auto && fat && list.length && Math.abs(fat - det) > 0.009 ? `<div class="hero-split"><span>${fat > det ? `Ainda sem detalhe: <b>${brl(fat - det)}</b>` : `O detalhado passa a fatura em <b>${brl(det - fat)}</b>`}</span></div>
      <button class="btn small light" id="usesum">Usar a soma dos gastos (${brl(det)}) como valor da fatura</button>` : ''}
    ${future ? `<div class="hero-sub">📆 Parcelas já marcadas para os próximos meses: <b>${brl(future)}</b></div>` : ''}
  </section>

  <section class="card">
    <h3>✍️ Adicionar gastos</h3>
    <p class="muted small">Escreva do seu jeito, que o app separa tudo. Ex.: <i>dia 03/11 500 paçoca, 700 2x calças, 400 pasta de dente</i> · <i>tv 1200 em 3x</i> · <i>ontem uber 35</i></p>
    <form id="f-smart">
      <textarea name="t" rows="3" placeholder="dia 03/11 500 paçoca 700 2x calças 400 pasta de dente"></textarea>
      <div class="row wrap"><button class="btn small">✨ Entender</button><button type="button" class="btn small ghost" id="blank">+ Adicionar um por um</button></div>
    </form>
    <div id="prev"></div>
  </section>

  <section class="card">
    <div class="card-h"><h3>Gastos da fatura</h3><span class="muted small">${brl(det)}</span></div>
    ${list.length ? `<ul class="buys">${list.map(b => {
      const ct = catOf(b.cat), n = b.n || 1;
      return `<li data-act-id="${esc(b.id)}">
        <span class="bcat" style="background:${ct.c}22">${ct.i}</span>
        <div class="b-m"><b>${esc(b.desc)}</b>
          <small class="muted">${fmtD(b.date)}${n > 1 ? ` · parcela ${parcelIdx(b, m)}/${n} de ${brl(b.total)}` : ''}</small>
          <select class="catsel" data-bcat="${esc(b.id)}" aria-label="Categoria">${catOptions(b.cat)}</select></div>
        <span class="val">${brl(parcelIn(b, m))}</span>
        <button class="icon del" data-bdel="${esc(b.id)}" aria-label="Excluir gasto">✕</button>
      </li>`;
    }).join('')}</ul>` : '<p class="muted">Use o campo acima para detalhar o que foi comprado nesta fatura.</p>'}
  </section>
  ${catData.length ? `<section class="card"><h3>No que foi gasto</h3>${donut(catData, brl(det).replace(',00', ''), 'detalhado')}</section>` : ''}`;
  bindMonth(root);
  $('#back', root).addEventListener('click', () => { S.cardView = null; viewMain(); });
  $('#usesum', root)?.addEventListener('click', async () => {
    try { await setVal(c.id, m, { v: det, auto: true }); viewMain(); } catch (e) { toast(errMsg(e)); }
  });
  $$('[data-bcat]', root).forEach(s => s.addEventListener('change', async () => {
    const b = S.items.get(s.dataset.bcat); await save({ ...b, cat: s.value }, `classificou "${b.desc}" como ${catOf(s.value).n}`).catch(e => toast(errMsg(e))); viewMain();
  }));
  $$('[data-bdel]', root).forEach(btn => btn.addEventListener('click', async () => {
    const b = S.items.get(btn.dataset.bdel);
    if (!confirm(`Excluir "${b.desc}" (${brl(b.total)})${(b.n || 1) > 1 ? ' e todas as parcelas' : ''}?`)) return;
    try {
      await removeMany([b.id]);
      await save(cardWithSums(S.items.get(c.id), monthsOf(b), model.buysOf(c.id)), `removeu "${b.desc}" do ${c.name}`);
      viewMain();
    } catch (e) { toast(errMsg(e)); }
  }));

  // prévia editável
  let rows = [], note = '';
  const fatOpts = [-1, 0, 1, 2].map(k => shiftMonth(m, k));
  let fatM = m;
  const history = model.allBuys();
  const renderPrev = () => {
    const box = $('#prev', root);
    if (!rows.length) { box.innerHTML = note ? `<p class="quick-msg">${note}</p>` : ''; return; }
    const sum = r2(rows.reduce((s, r) => s + (r.total || 0), 0));
    box.innerHTML = `
    <div class="prev">
      ${note ? `<p class="quick-msg">${note}</p>` : ''}
      ${rows.map((r, i) => `<div class="prow" data-i="${i}">
        <input type="date" data-f="date" value="${esc(r.date)}" aria-label="Data">
        <input data-f="desc" value="${esc(r.desc)}" placeholder="o que foi" maxlength="80" aria-label="Descrição">
        <select data-f="cat" aria-label="Categoria">${catOptions(r.cat)}</select>
        <input data-f="total" inputmode="decimal" value="${r.total ? num(r.total) : ''}" placeholder="R$" aria-label="Valor" class="pv">
        <label class="pn">em <input data-f="n" type="number" min="1" max="48" value="${r.n}" aria-label="Parcelas">x</label>
        <button type="button" class="icon del" data-rm="${i}" aria-label="Tirar">✕</button>
      </div>`).join('')}
      <div class="row wrap prev-f">
        <label class="lim">Entra na fatura de <select id="fatm">${fatOpts.map(x => `<option value="${x}" ${x === fatM ? 'selected' : ''}>${mShort(x)}</option>`).join('')}</select></label>
        <b>Total: ${brl(sum)}</b>
      </div>
      <div class="row wrap"><button type="button" class="btn small" id="savebuys">Salvar ${rows.length} gasto${rows.length > 1 ? 's' : ''}</button>
      <button type="button" class="btn small ghost" id="addrow">+ linha</button><button type="button" class="link small" id="cancel">cancelar</button></div>
    </div>`;
    $$('.prow', box).forEach(el => {
      const i = Number(el.dataset.i);
      $$('[data-f]', el).forEach(inp => inp.addEventListener('change', () => {
        const f = inp.dataset.f;
        if (f === 'total') { const v = parseMoney(inp.value); rows[i].total = Number.isNaN(v) ? 0 : v; renderPrev(); }
        else if (f === 'n') rows[i].n = Math.max(1, Math.min(48, Number(inp.value) || 1));
        else if (f === 'desc') { rows[i].desc = inp.value; if (!rows[i].catTouched) { rows[i].cat = categorize(inp.value, history); renderPrev(); } }
        else if (f === 'cat') { rows[i].cat = inp.value; rows[i].catTouched = true; }
        else rows[i][f] = inp.value;
      }));
    });
    $$('[data-rm]', box).forEach(b => b.addEventListener('click', () => { rows.splice(Number(b.dataset.rm), 1); renderPrev(); }));
    $('#fatm', box).addEventListener('change', (e) => { fatM = e.target.value; });
    $('#addrow', box).addEventListener('click', () => { rows.push(blankRow()); renderPrev(); });
    $('#cancel', box).addEventListener('click', () => { rows = []; note = ''; renderPrev(); });
    $('#savebuys', box).addEventListener('click', async (ev) => {
      const ok = rows.filter(r => r.desc.trim() && r.total > 0);
      if (!ok.length) return toast('Preencha o que foi e o valor.');
      busy(ev.target, true, 'Salvando…');
      try {
        const buys = ok.map((r, k) => ({ id: crypto.randomUUID(), type: 'buy', card: c.id, date: r.date || isoToday(), desc: r.desc.trim(), cat: r.cat, total: r2(r.total), n: r.n || 1, first: fatM, order: Date.now() + k }));
        const months = buys.flatMap(monthsOf);
        const updated = cardWithSums(S.items.get(c.id), months, [...model.buysOf(c.id), ...buys]);
        await saveMany([...buys, updated], `adicionou no ${c.name}: ${buys.map(b => `${b.desc} ${brl(b.total)}${b.n > 1 ? ` em ${b.n}x` : ''}`).join(', ')}`);
        toast(`✔ ${buys.length} gasto${buys.length > 1 ? 's' : ''} salvo${buys.length > 1 ? 's' : ''} no ${c.name}`);
        S.month = fatM; viewMain();
      } catch (e) { toast(errMsg(e)); busy(ev.target, false); }
    });
  };
  const defDate = () => (m === nowMonth() ? isoToday() : `${m}-01`);
  const blankRow = () => ({ date: defDate(), desc: '', cat: 'outros', total: 0, n: 1 });
  const understand = (text) => {
    const names = [c.name, ...c.name.split(/\s+/).filter(w => w.length >= 3)];
    const r = parseItems(text, names);
    if (!r.items.length) { rows = []; note = 'Não consegui separar os itens. Tente algo como: <i>500 paçoca, 700 calças</i>.'; return renderPrev(); }
    rows = r.items.map(it => ({ date: r.date || defDate(), desc: it.desc, cat: categorize(it.desc, history), total: it.total, n: it.n }));
    const sum = r2(rows.reduce((s, x) => s + x.total, 0));
    note = `Entendi <b>${rows.length} gasto${rows.length > 1 ? 's' : ''}</b>${r.date ? ` no dia ${fmtD(r.date)}` : ''}. Confira e salve.`;
    if (r.statedTotal != null && Math.abs(r.statedTotal - sum) > 0.009) {
      note += ` <br>⚠️ Você falou <b>${brl(r.statedTotal)}</b>, mas os itens somam <b>${brl(sum)}</b>${r.statedTotal > sum ? ` — faltam <b>${brl(r.statedTotal - sum)}</b>.` : '.'}`;
      if (r.statedTotal > sum) rows.push({ date: rows[0].date, desc: 'Outros (sem detalhe)', cat: 'outros', total: r2(r.statedTotal - sum), n: 1 });
    }
    renderPrev();
  };
  $('#f-smart', root).addEventListener('submit', (ev) => { ev.preventDefault(); const t = ev.target.t.value.trim(); if (t) understand(t); });
  $('#blank', root).addEventListener('click', () => { rows.push(blankRow()); note = ''; renderPrev(); });
  if (S.prefill) { const t = S.prefill; S.prefill = null; $('#f-smart', root).t.value = t; understand(t); }
}

/* ---------- CASA: OBRA, TERRENO E ENXOVAL ---------- */
const PAY_OPTS = () => [...PAYS.filter(p => p.k !== 'cartao').map(p => [p.k, `${p.i} ${p.n}`]), ...model.cards.map(c => ['card:' + c.id, `💳 ${c.name}`])];
const payValue = (b) => (b.card ? 'card:' + b.card : (b.pay || 'pix'));
const payLabelOf = (b) => payLabel(b, b.card ? S.items.get(b.card)?.name : null);

// Cria grupo "Terreno e obra" com as linhas automáticas e as etapas padrão
function obraSetupItems() {
  const out = [];
  let g = model.groups.find(x => x.key === 'obra');
  if (!g) { g = { id: crypto.randomUUID(), type: 'group', key: 'obra', name: 'Terreno e obra', kind: 'despesa', color: '#4F5D33', order: model.groups.length }; out.push(g); }
  if (!model.sysLine('obra')) out.push({ id: crypto.randomUUID(), type: 'line', group: g.id, sys: 'obra', name: 'Obra (PIX, dinheiro, boleto…)', order: 0, vals: {} });
  if (!model.sysLine('terreno')) out.push({ id: crypto.randomUUID(), type: 'line', group: g.id, sys: 'terreno', name: 'Parcela do terreno', order: 1, vals: {} });
  if (!model.etapas.length) ETAPAS.forEach(([name], i) => out.push({ id: crypto.randomUUID(), type: 'etapa', name, order: i, pct: 0, budget: null }));
  if (!model.obra) out.push({ id: crypto.randomUUID(), type: 'obra', started: true, terreno: null });
  return out;
}
// Recalcula a linha que recebe um gasto: o cartão (se pago no cartão) ou a linha "Obra" do orçamento
function affectedLines(buys, allBuys) {
  const out = [];
  const months = buys.flatMap(monthsOf);
  const cardIds = new Set(buys.filter(b => b.card).map(b => b.card));
  cardIds.forEach(id => { const c = S.items.get(id); if (c) out.push(cardWithSums(c, months, allBuys)); });
  if (buys.some(b => !b.card && b.obra)) { const l = model.sysLine('obra'); if (l) out.push(lineWithSums(l, months, allBuys.filter(b => b.obra && !b.card))); }
  return out;
}

function tabCasa(root) {
  const seg = S.casaSeg || 'obra';
  root.innerHTML = `<div class="segtabs">${[['obra', '🏗️ Obra'], ['terreno', '📍 Terreno'], ['enxoval', '🛋️ Enxoval']].map(([k, l]) => `<button data-seg="${k}" class="${seg === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="casa"></div>`;
  $$('[data-seg]', root).forEach(b => b.addEventListener('click', () => { S.casaSeg = b.dataset.seg; LS.set('casaSeg', S.casaSeg); viewMain(); }));
  const box = $('#casa', root);
  if (seg === 'terreno') return viewTerreno(box);
  if (seg === 'enxoval') return tabCasamento(box);
  return viewObra(box);
}

function viewObra(root) {
  if (!model.obra || !model.etapas.length) {
    root.innerHTML = `<section class="card center">
      <div class="lockicon">🏗️</div><h2>Acompanhar a obra</h2>
      <p class="muted">Vou criar as etapas comuns de uma obra (projeto, fundação, alvenaria, telhado, elétrica, hidráulica, pisos, pintura…). Depois vocês podem renomear, apagar ou criar outras.</p>
      <button class="btn" id="start">Começar</button></section>`;
    $('#start', root).addEventListener('click', async (ev) => { busy(ev.target, true); try { await saveMany(obraSetupItems(), 'começou o acompanhamento da obra'); viewMain(); } catch (e) { toast(errMsg(e)); busy(ev.target, false); } });
    return;
  }
  const etapas = model.etapas, buys = model.obraBuys, st = obraStats(etapas, buys);
  const finPct = st.bUsed;
  const projected = st.pct >= 10 && st.spent ? r2(st.spent / (st.pct / 100)) : null;
  const curEtapa = etapas.find(e => e.pct > 0 && e.pct < 100) || etapas.find(e => !e.pct);
  const doing = etapas.find(e => e.pct > 0 && e.pct < 100) || null;
  const recent = [...buys].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b._at || 0) - (a._at || 0));
  const kindData = OBRA_KINDS.map(k => ({ label: `${k.i} ${k.n}`, value: r2(buys.filter(b => (b.okind || 'material') === k.k).reduce((s, b) => s + b.total, 0)), color: k.c })).filter(x => x.value);
  const payMap = {}; buys.forEach(b => { const l = payLabelOf({ ...b, n: 1 }).replace(' · à vista', ''); payMap[l] = r2((payMap[l] || 0) + b.total); });
  const payColors = ['#5B6B3A', '#B8954A', '#6E9A8C', '#8C7AA0', '#C07A3E', '#C48A8A', '#9A9480'];
  const payData = Object.entries(payMap).sort((a, b) => b[1] - a[1]).map(([l, v], i) => ({ label: l, value: v, color: payColors[i % payColors.length] }));
  const etData = etapas.map((e, i) => ({ label: e.name, value: st.spentBy[e.id] || 0, color: '#A87B3A', max: Number(e.budget) || 0 })).filter(x => x.value);
  const months = Array.from({ length: 9 }, (_, i) => shiftMonth(nowMonth(), i - 5));
  const flow = months.map(m => r2(buys.reduce((s, b) => s + parcelIn(b, m), 0)));
  let acc = r2(buys.filter(b => b.first < months[0]).reduce((s, b) => s + monthsOf(b).filter(x => x < months[0]).reduce((t, x) => t + parcelIn(b, x), 0), 0));
  const accLine = flow.map(v => (acc = r2(acc + v)));

  root.innerHTML = `
  <section class="hero obra">
    <small>Evolução da obra</small>
    <div class="hero-v">${st.pct}% concluída</div>
    <div class="prog light"><i style="width:${st.pct}%"></i></div>
    <div class="hero-split"><span>Gasto <b>${brl(st.spent)}</b></span>${st.budget ? `<span>Orçado <b>${brl(st.budget)}</b>${st.nBudget < etapas.length ? ` (${st.nBudget} etapa${st.nBudget > 1 ? 's' : ''})` : ''} · ${finPct}% usado</span>` : '<span>Coloque o orçado das etapas para comparar</span>'}</div>
    ${curEtapa ? `<div class="hero-sub">🔨 Agora: <b>${esc(curEtapa.name)}</b> (${curEtapa.pct || 0}%)</div>` : ''}
  </section>
  ${finPct != null && finPct > st.bPct + 10 ? `<p class="alert warn">⚠️ O dinheiro está andando mais rápido que a obra: nas etapas orçadas, ${finPct}% do valor já foi gasto e o avanço é de ${st.bPct}%.</p>` : ''}
  ${projected ? `<p class="alert info">🔮 No ritmo atual, a obra deve custar <b>~${brl(projected)}</b> no total${st.budget ? ` (orçado: ${brl(st.budget)})` : ''}.</p>` : ''}

  <section class="card">
    <h3>✍️ Registrar compra da obra</h3>
    <p class="muted small">Escreva do seu jeito. Ex.: <i>hoje 30 sacos de cimento 1.150 no pix</i> · <i>pedreiro 2.000 dinheiro</i> · <i>porcelanato 4.800 no itau em 6x</i></p>
    <form id="f-obra"><textarea name="t" rows="2" placeholder="cimento 1150 pix, areia 600 pix"></textarea>
      <div class="row wrap"><button class="btn small">✨ Entender</button><button type="button" class="btn small ghost" id="oblank">+ Adicionar um por um</button></div></form>
    <div id="oprev"></div>
  </section>

  <div class="card-h etapas-h"><h3>Etapas</h3><button class="btn small ${S.edit ? '' : 'ghost'}" id="oedit">${S.edit ? '✓ Concluir' : '✏️ Editar etapas'}</button></div>
  ${etapas.map(e => {
    const sp = st.spentBy[e.id] || 0, bud = Number(e.budget) || 0, p = Number(e.pct) || 0;
    const eb = recent.filter(b => b.etapa === e.id);
    return `<section class="etapa ${p >= 100 ? 'done' : p > 0 ? 'doing' : ''}" data-act-id="${esc(e.id)}">
      <div class="et-h">
        ${S.edit ? `<input class="lname" data-ename="${esc(e.id)}" value="${esc(e.name)}" maxlength="50">` : `<b>${esc(e.name)}</b>`}
        <span class="chip-st">${p >= 100 ? '✅ Concluída' : p > 0 ? '🔨 Em andamento' : '⏳ Não iniciada'}</span>
        ${S.edit ? `<button class="icon del" data-edel="${esc(e.id)}" aria-label="Excluir etapa">✕</button>` : ''}
      </div>
      <div class="et-pct"><input type="range" min="0" max="100" step="5" value="${p}" style="--v:${p}%" data-epct="${esc(e.id)}" aria-label="Progresso de ${esc(e.name)}"><b data-epl="${esc(e.id)}">${p}%</b></div>
      <div class="et-m">
        <span>Gasto <b>${brl(sp)}</b></span>
        <label class="lim">Orçado <input inputmode="decimal" data-ebud="${esc(e.id)}" value="${bud ? num(bud) : ''}" placeholder="R$"></label>
      </div>
      ${bud ? `<div class="prog small ${sp > bud ? 'warn' : ''}"><i style="width:${Math.min(100, sp / bud * 100).toFixed(1)}%"></i></div>${sp > bud ? `<small class="neg">Passou do orçado em ${brl(sp - bud)}</small>` : ''}` : ''}
      ${eb.length ? `<details class="et-buys"><summary>${eb.length} compra${eb.length > 1 ? 's' : ''}</summary><ul class="buys">${eb.map(buyRow).join('')}</ul></details>` : ''}
    </section>`;
  }).join('')}
  ${S.edit ? `<form id="f-etapa" class="card row"><input name="n" placeholder="+ nova etapa" maxlength="50" required><button class="btn small">Criar</button></form>` : ''}

  ${buys.length ? `
  <section class="card"><div class="card-h"><h3>Para onde foi o dinheiro da obra</h3>${chartToggle('obraEt', [['barras', 'Etapas'], ['tipo', 'Tipo'], ['pag', 'Pagamento']], chartPref('obraEt', 'barras'))}</div>
    ${chartPref('obraEt', 'barras') === 'barras' ? hbars(etData) : chartPref('obraEt', 'barras') === 'tipo' ? donut(kindData, brlShortTxt(st.spent), 'na obra') : donut(payData, brlShortTxt(st.spent), 'na obra')}
  </section>
  <section class="card"><h3>Quanto sai do bolso por mês (com parcelas)</h3>
    ${timeChart(months.map(mShort), [{ name: 'Pago no mês', color: '#A87B3A', values: flow }], 'bar', { name: 'Acumulado', color: '#5B6B3A', values: accLine })}
  </section>
  <section class="card"><div class="card-h"><h3>Todas as compras</h3><span class="muted small">${buys.length} · ${brl(r2(buys.reduce((s, b) => s + b.total, 0)))}</span></div>
    <ul class="buys">${recent.slice(0, 40).map(buyRow).join('')}</ul></section>` : ''}`;

  // etapas
  $('#oedit', root).addEventListener('click', () => { S.edit = !S.edit; viewMain(); });
  $$('[data-epct]', root).forEach(r => {
    r.addEventListener('input', () => { $(`[data-epl="${CSS.escape(r.dataset.epct)}"]`, root).textContent = r.value + '%'; r.style.setProperty('--v', r.value + '%'); });
    r.addEventListener('change', async () => { const e = S.items.get(r.dataset.epct); await save({ ...e, pct: Number(r.value) }, `atualizou "${e.name}" para ${r.value}%`).catch(x => toast(errMsg(x))); r.blur(); viewMain(); });
  });
  $$('[data-ebud]', root).forEach(inp => inp.addEventListener('change', async () => {
    const v = parseMoney(inp.value); if (Number.isNaN(v)) return toast('Valor inválido.');
    const e = S.items.get(inp.dataset.ebud); await save({ ...e, budget: v || null }, `definiu o orçado de "${e.name}": ${brl(v)}`).catch(x => toast(errMsg(x))); viewMain();
  }));
  $$('[data-ename]', root).forEach(inp => inp.addEventListener('change', async () => { const e = S.items.get(inp.dataset.ename); if (inp.value.trim()) await save({ ...e, name: inp.value.trim() }).catch(x => toast(errMsg(x))); }));
  $$('[data-edel]', root).forEach(b => b.addEventListener('click', async () => {
    const e = S.items.get(b.dataset.edel); if (!confirm(`Excluir a etapa "${e.name}"? As compras dela ficam sem etapa.`)) return;
    try { await removeMany([e.id]); const orf = model.obraBuys.filter(x => x.etapa === e.id).map(x => ({ ...x, etapa: null })); if (orf.length) await saveMany(orf); viewMain(); } catch (x) { toast(errMsg(x)); }
  }));
  $('#f-etapa', root)?.addEventListener('submit', async (ev) => { ev.preventDefault(); await save({ type: 'etapa', name: ev.target.n.value.trim(), order: etapas.length, pct: 0, budget: null }, `criou a etapa "${ev.target.n.value.trim()}"`).catch(x => toast(errMsg(x))); viewMain(); });
  bindToggles(root); bindBuyDeletes(root);

  // registrar compras (prévia editável)
  let rows = [], note = '';
  const box = $('#oprev', root);
  const defPay = 'pix';
  const blank = () => ({ date: isoToday(), desc: '', total: 0, n: 1, etapa: doing?.id || null, okind: 'material', pay: defPay, loja: '' });
  const render = () => {
    if (!rows.length) { box.innerHTML = note ? `<p class="quick-msg">${note}</p>` : ''; return; }
    const sum = r2(rows.reduce((s, r) => s + (r.total || 0), 0));
    box.innerHTML = `<div class="prev">${note ? `<p class="quick-msg">${note}</p>` : ''}
      ${rows.map((r, i) => `<div class="orow" data-i="${i}">
        <input data-f="desc" value="${esc(r.desc)}" placeholder="o que foi" maxlength="80" class="o-desc">
        <button type="button" class="icon del o-del" data-rm="${i}" aria-label="Tirar">✕</button>
        <input data-f="total" inputmode="decimal" value="${r.total ? num(r.total) : ''}" placeholder="R$" class="o-val">
        <input type="date" data-f="date" value="${esc(r.date)}" class="o-date">
        <select data-f="pay" class="o-pay" aria-label="Forma de pagamento">${PAY_OPTS().map(([v, l]) => `<option value="${v}" ${v === r.pay ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <label class="pn o-n"><select data-f="n">${[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map(n => `<option value="${n}" ${n === r.n ? 'selected' : ''}>${n === 1 ? 'à vista' : n + 'x'}</option>`).join('')}${[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].includes(r.n) ? '' : `<option selected value="${r.n}">${r.n}x</option>`}</select></label>
        <select data-f="etapa" class="o-et" aria-label="Etapa"><option value="">— sem etapa —</option>${etapas.map(e => `<option value="${esc(e.id)}" ${e.id === r.etapa ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
        <select data-f="okind" class="o-kind" aria-label="Tipo">${OBRA_KINDS.map(k => `<option value="${k.k}" ${k.k === r.okind ? 'selected' : ''}>${k.i} ${k.n}</option>`).join('')}</select>
        <input data-f="loja" value="${esc(r.loja)}" placeholder="loja / profissional (opcional)" maxlength="60" class="o-loja">
        ${r.n > 1 ? `<small class="muted o-info">${rows[i].total ? `${r.n}x de ${brl(r2(r.total / r.n))}` : ''}${r.pay.startsWith('card:') ? ' nas próximas faturas' : ' nos próximos meses'}</small>` : ''}
      </div>`).join('')}
      <div class="row wrap prev-f"><b>Total: ${brl(sum)}</b></div>
      <div class="row wrap"><button type="button" class="btn small" id="osave">Salvar ${rows.length} compra${rows.length > 1 ? 's' : ''}</button>
      <button type="button" class="btn small ghost" id="oadd">+ linha</button><button type="button" class="link small" id="ocancel">cancelar</button></div></div>`;
    $$('.orow', box).forEach(el => {
      const i = Number(el.dataset.i);
      $$('[data-f]', el).forEach(inp => inp.addEventListener('change', () => {
        const f = inp.dataset.f, r = rows[i];
        if (f === 'total') { const v = parseMoney(inp.value); r.total = Number.isNaN(v) ? 0 : v; render(); }
        else if (f === 'n') { r.n = Number(inp.value) || 1; render(); }
        else if (f === 'desc') { r.desc = inp.value; if (!r.touched) { r.okind = guessKind(inp.value); r.etapa = guessEtapa(inp.value, etapas, r.etapa); render(); } }
        else { r[f] = inp.value; if (f === 'etapa' || f === 'okind') r.touched = true; if (f === 'pay') render(); }
      }));
    });
    $$('[data-rm]', box).forEach(b => b.addEventListener('click', () => { rows.splice(Number(b.dataset.rm), 1); render(); }));
    $('#oadd', box).addEventListener('click', () => { rows.push(blank()); render(); });
    $('#ocancel', box).addEventListener('click', () => { rows = []; note = ''; render(); });
    $('#osave', box).addEventListener('click', async (ev) => {
      const ok = rows.filter(r => r.desc.trim() && r.total > 0);
      if (!ok.length) return toast('Preencha o que foi e o valor.');
      busy(ev.target, true, 'Salvando…');
      try {
        const nb = ok.map((r, k) => {
          const card = r.pay.startsWith('card:') ? r.pay.slice(5) : null;
          const first = card ? (r.date || isoToday()).slice(0, 7) : (r.date || isoToday()).slice(0, 7);
          return { id: crypto.randomUUID(), type: 'buy', obra: true, card, pay: card ? 'cartao' : r.pay, date: r.date || isoToday(), desc: r.desc.trim(), cat: 'obra', okind: r.okind, etapa: r.etapa || null, loja: r.loja.trim(), total: r2(r.total), n: r.n || 1, first, order: Date.now() + k };
        });
        const all = [...model.allBuys(), ...nb];
        await saveMany([...nb, ...affectedLines(nb, all)], `registrou na obra: ${nb.map(b => `${b.desc} ${brl(b.total)} (${payLabelOf(b)})`).join(', ')}`);
        toast(`✔ ${nb.length} compra${nb.length > 1 ? 's' : ''} da obra salva${nb.length > 1 ? 's' : ''}`); viewMain();
      } catch (e) { toast(errMsg(e)); busy(ev.target, false); }
    });
  };
  const understand = (text) => {
    const r = parseObra(text, model.cards);
    if (!r.items.length) { rows = []; note = 'Não consegui separar as compras. Tente: <i>cimento 1150 pix, areia 600</i>.'; return render(); }
    const pay = r.card ? 'card:' + r.card : (r.pay && r.pay !== 'cartao' ? r.pay : defPay);
    rows = r.items.map(it => ({ date: r.date || isoToday(), desc: it.desc, total: it.total, n: it.n, okind: guessKind(it.desc), etapa: guessEtapa(it.desc, etapas, doing?.id), pay, loja: '' }));
    note = `Entendi <b>${rows.length} compra${rows.length > 1 ? 's' : ''}</b>${r.date ? ` no dia ${fmtD(r.date)}` : ''} · pagamento: <b>${esc(PAY_OPTS().find(p => p[0] === pay)?.[1] || '')}</b>${r.pay === 'cartao' && !r.card ? ' (qual cartão? escolha abaixo)' : ''}. Confira etapa e tipo e salve.`;
    render();
  };
  $('#f-obra', root).addEventListener('submit', (ev) => { ev.preventDefault(); const t = ev.target.t.value.trim(); if (t) understand(t); });
  $('#oblank', root).addEventListener('click', () => { rows.push(blank()); note = ''; render(); });
}

function buyRow(b) {
  const k = kindOf(b.okind), et = b.etapa ? S.items.get(b.etapa)?.name : '';
  return `<li data-act-id="${esc(b.id)}">
    <span class="bcat" style="background:${k.c}22">${k.i}</span>
    <div class="b-m"><b>${esc(b.desc)}</b>
      <small class="muted">${fmtD(b.date)} · ${esc(payLabelOf(b))}${et ? ` · ${esc(et)}` : ''}${b.loja ? ` · ${esc(b.loja)}` : ''}</small></div>
    <span class="val">${brl(b.total)}</span>
    <button class="icon del" data-obdel="${esc(b.id)}" aria-label="Excluir compra">✕</button>
  </li>`;
}
function bindBuyDeletes(root) {
  $$('[data-obdel]', root).forEach(btn => btn.addEventListener('click', async () => {
    const b = S.items.get(btn.dataset.obdel);
    if (!confirm(`Excluir "${b.desc}" (${brl(b.total)})${(b.n || 1) > 1 ? ' e todas as parcelas' : ''}?`)) return;
    try { await removeMany([b.id]); await saveMany(affectedLines([b], model.allBuys()), `removeu "${b.desc}" da obra`); viewMain(); } catch (e) { toast(errMsg(e)); }
  }));
}
const brlShortTxt = (v) => brl(v).replace(/,\d\d$/, '');

function viewTerreno(root) {
  const o = model.obra || {}, t = o.terreno || {};
  const tl = model.sysLine('terreno');
  const sched = terrenoParcelas(t);
  const cm = nowMonth();
  const pagas = sched.filter(([m]) => m < cm || isPaid(tl, m));
  const ent = Number(t.entrada) || 0, total = Number(t.valor) || 0;
  const pago = r2(ent + pagas.reduce((s, [, v]) => s + v, 0));
  const devedor = r2(Math.max(0, sched.reduce((s, [, v]) => s + v, 0) + ent - pago));
  const thisM = sched.find(([m]) => m === cm);
  const last = sched[sched.length - 1]?.[0];
  const obraSpent = obraStats(model.etapas, model.obraBuys).spent;
  const entBuy = t.entradaId ? S.items.get(t.entradaId) : null;

  root.innerHTML = `
  ${total ? `<section class="hero terreno">
    <small>${esc(t.nome || 'Nosso terreno')}</small>
    <div class="hero-v">${brl(pago)} pagos</div>
    <div class="hero-sub">de ${brl(total)}${sched.length ? ` · ${pagas.length} de ${sched.length} parcelas` : ''}</div>
    <div class="prog light"><i style="width:${total ? Math.min(100, pago / total * 100).toFixed(1) : 0}%"></i></div>
    <div class="hero-split"><span>Falta <b>${brl(devedor)}</b></span>${last ? `<span>Quita em <b>${mLabel(last).toLowerCase()}</b></span>` : ''}</div>
  </section>
  ${thisM ? `<section class="card row between"><div><b>Parcela de ${mShort(cm)}</b><br><span class="muted small">${brl(thisM[1])}${t.dia ? ` · vence dia ${t.dia}` : ''}</span></div>
    <label class="paid"><input type="checkbox" data-tpaid="1" ${isPaid(tl, cm) ? 'checked' : ''}><span>paga</span></label></section>` : ''}
  <section class="card"><h3>💰 Total investido na casa</h3>
    <div class="kpis two"><div class="kpi"><small>📍 Terreno (pago)</small><b>${brl(pago)}</b></div><div class="kpi"><small>🏗️ Obra (gasto)</small><b>${brl(obraSpent)}</b></div></div>
    <p class="big">${brl(r2(pago + obraSpent))}</p></section>` : ''}
  <section class="card">
    <h3>${total ? 'Dados do terreno' : '📍 Cadastrar o terreno'}</h3>
    <form id="f-ter" class="grid">
      <label class="full">Nome / local<input name="nome" maxlength="60" value="${esc(t.nome || '')}" placeholder="ex.: Lote 12 — Jardim das Flores"></label>
      <label>Valor total (R$)<input name="valor" inputmode="decimal" value="${t.valor ? num(t.valor) : ''}" required></label>
      <label>Entrada (R$)<input name="entrada" inputmode="decimal" value="${t.entrada ? num(t.entrada) : ''}" placeholder="0,00"></label>
      <label>Data da entrada<input name="entData" type="date" value="${esc(t.entData || isoToday())}"></label>
      <label>Entrada paga com<select name="entPay">${PAY_OPTS().map(([v, l]) => `<option value="${v}" ${v === (t.entPay || 'pix') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label>Nº de parcelas<input name="parcelas" type="number" min="0" max="480" value="${esc(t.parcelas || '')}" placeholder="0 = à vista"></label>
      <label>Valor da parcela (R$)<input name="valorParcela" inputmode="decimal" value="${t.valorParcela ? num(t.valorParcela) : ''}"></label>
      <label>1ª parcela em<input name="inicio" type="month" value="${esc(t.inicio || shiftMonth(cm, 1))}"></label>
      <label>Vence todo dia<input name="dia" type="number" min="1" max="31" value="${esc(t.dia || '')}"></label>
      <label class="full">Observações (correção, contrato…)<input name="obs" maxlength="120" value="${esc(t.obs || '')}"></label>
      <button class="btn small full">Salvar terreno</button>
    </form>
    <p class="muted small">As parcelas entram sozinhas no Orçamento (categoria "Terreno e obra"), e o app avisa quando estiverem para vencer. Escritura, ITBI e taxas podem ser lançadas como compras da obra (tipo "Projeto e taxas").</p>
  </section>`;
  $('[data-tpaid]', root)?.addEventListener('change', async (ev) => { try { await setVal(tl.id, cm, { p: ev.target.checked }); viewMain(); } catch (e) { toast(errMsg(e)); } });
  $('#f-ter', root).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target, b = $('button', f);
    const valor = parseMoney(f.valor.value), entrada = parseMoney(f.entrada.value), vp = parseMoney(f.valorParcela.value), np = Number(f.parcelas.value) || 0;
    if ([valor, entrada, vp].some(Number.isNaN) || !(valor > 0)) return toast('Confira os valores.');
    if (np && !(vp > 0)) return toast('Informe o valor da parcela.');
    busy(b, true, 'Salvando…');
    try {
      const setup = obraSetupItems(); if (setup.length) await saveMany(setup);
      const nt = { nome: f.nome.value.trim(), valor, entrada, entData: f.entData.value, entPay: f.entPay.value, parcelas: np, valorParcela: vp, inicio: f.inicio.value, dia: Number(f.dia.value) || null, obs: f.obs.value.trim(), entradaId: t.entradaId || null };
      const out = [];
      // entrada vira um gasto (entra no orçamento do mês ou na fatura do cartão)
      const oldEnt = nt.entradaId ? S.items.get(nt.entradaId) : null;
      let entB = null;
      if (entrada > 0) {
        const card = nt.entPay.startsWith('card:') ? nt.entPay.slice(5) : null;
        entB = { id: nt.entradaId || crypto.randomUUID(), type: 'buy', obra: true, okind: 'terreno', cat: 'obra', etapa: null, desc: 'Entrada do terreno', loja: nt.nome, card, pay: card ? 'cartao' : nt.entPay, date: nt.entData || isoToday(), total: entrada, n: 1, first: (nt.entData || isoToday()).slice(0, 7) };
        nt.entradaId = entB.id; out.push(entB);
      } else if (oldEnt) { await removeMany([oldEnt.id]); nt.entradaId = null; }
      const allBuys = [...model.allBuys().filter(x => x.id !== oldEnt?.id), ...(entB ? [entB] : [])];
      const touched = [...(oldEnt ? [oldEnt] : []), ...(entB ? [entB] : [])];
      out.push(...affectedLines(touched, allBuys));
      // parcelas → linha "Parcela do terreno"
      const line = model.sysLine('terreno');
      const vals = { ...(line.vals || {}) };
      Object.keys(vals).forEach(m => { if (vals[m].auto) { const { v, auto, ...rest } = vals[m]; if (rest.p) vals[m] = rest; else delete vals[m]; } });
      terrenoParcelas(nt).forEach(([m, v]) => { vals[m] = { ...(vals[m] || {}), v, auto: true }; });
      out.push({ ...line, vals });
      out.push({ ...model.obra, terreno: nt });
      await saveMany(out, `atualizou os dados do terreno (${brl(valor)})`);
      toast('Terreno salvo!'); viewMain();
    } catch (e) { toast(errMsg(e)); busy(b, false); }
  });
}

/* ---------- ENXOVAL (antiga aba Casamento) ---------- */
function tabCasamento(root) {
  const all = WISH_LISTS.flatMap(l => model.wishes(l.key));
  const sum = (a) => r2(a.reduce((s, w) => s + (Number(w.price) || 0), 0));
  const T = sum(all), D = sum(all.filter(w => w.done));
  root.innerHTML = `
  <section class="hero wed">
    <small>Compras da casa</small>
    <div class="hero-v">${brl(T - D)}</div>
    <div class="hero-sub">ainda faltam · ${all.filter(w => w.done).length} de ${all.length} itens resolvidos</div>
    <div class="prog light"><i style="width:${T ? (D / T * 100).toFixed(1) : 0}%"></i></div>
  </section>
  ${WISH_LISTS.map(L => {
    const ws = model.wishes(L.key), t = sum(ws), d = sum(ws.filter(w => w.done));
    return `<section class="card">
      <div class="card-h"><h3>${esc(L.name)}</h3><span class="muted small">${t ? `${brl(d)} de ${brl(t)}` : `${ws.filter(w => w.done).length}/${ws.length}`}</span></div>
      <ul class="wl">${ws.map(w => `<li class="${w.done ? 'done' : ''}">
        <label class="chk"><input type="checkbox" data-wdone="${esc(w.id)}" ${w.done ? 'checked' : ''}><span></span></label>
        <div class="wl-m"><span>${esc(w.name)}</span>${w.note ? `<small class="muted">${esc(w.note)}</small>` : ''}</div>
        ${/^https?:\/\//i.test(w.link || '') ? `<a href="${esc(w.link)}" target="_blank" rel="noopener noreferrer" class="wl-link" aria-label="Abrir link">🔗</a>` : ''}
        <input class="money sm" inputmode="decimal" data-wprice="${esc(w.id)}" value="${w.price ? num(w.price) : ''}" placeholder="R$">
        <button class="icon del" data-wdel="${esc(w.id)}" aria-label="Excluir">✕</button>
      </li>`).join('')}</ul>
      <form class="addwish" data-list="${L.key}">
        <input name="n" placeholder="+ adicionar item" maxlength="80" required>
        <input name="p" inputmode="decimal" placeholder="R$" class="sm">
        <input name="l" type="url" placeholder="link (opcional)">
        <button class="btn small">Adicionar</button>
      </form>
    </section>`;
  }).join('')}`;
  $$('[data-wdone]', root).forEach(cb => cb.addEventListener('change', async () => { const w = S.items.get(cb.dataset.wdone); await save({ ...w, done: cb.checked }, `marcou "${w.name}" como ${cb.checked ? 'comprado 🛍️' : 'não comprado'}`).catch(e => toast(errMsg(e))); viewMain(); }));
  $$('[data-wprice]', root).forEach(inp => inp.addEventListener('change', async () => {
    const v = parseMoney(inp.value); if (Number.isNaN(v)) return toast('Valor inválido.');
    const w = S.items.get(inp.dataset.wprice); await save({ ...w, price: v || null }, `mudou o preço de "${w.name}" para ${brl(v)}`).catch(e => toast(errMsg(e))); viewMain();
  }));
  $$('[data-wdel]', root).forEach(b => b.addEventListener('click', async () => {
    const w = S.items.get(b.dataset.wdel); if (!confirm(`Excluir "${w.name}"?`)) return;
    await removeMany([w.id]).catch(e => toast(errMsg(e))); viewMain();
  }));
  $$('.addwish', root).forEach(f => f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const p = parseMoney(f.p.value), link = f.l.value.trim();
    if (Number.isNaN(p)) return toast('Valor inválido.');
    if (link && !/^https?:\/\//i.test(link)) return toast('O link precisa começar com https://');
    await save({ type: 'wish', list: f.dataset.list, name: f.n.value.trim(), price: p || null, link, note: '', done: false, order: model.wishes(f.dataset.list).length }, `adicionou "${f.n.value.trim()}" à lista da casa`).catch(e => toast(errMsg(e)));
    viewMain();
  }));
}

/* ---------- AJUSTES ---------- */
async function tabAjustes(root) {
  const st = model.settings;
  root.innerHTML = `
  <section class="card">
    <h3>Nomes do casal</h3>
    <form id="f-names" class="grid">
      <label>Pessoa 1<input name="p1" maxlength="30" value="${esc(st.p1)}" required></label>
      <label>Pessoa 2<input name="p2" maxlength="30" value="${esc(st.p2)}" required></label>
      <button class="btn small full">Salvar nomes</button>
    </form>
  </section>
  <section class="card" id="invite-card"><h3>Convite para o seu par</h3><p class="muted">Carregando…</p></section>
  <section class="card">
    <h3>Importar da planilha</h3>
    <p class="muted small">Envie a planilha "Planejamento e Controle Financeiro" (.xlsx). Ela é lida aqui no aparelho e os dados são criptografados antes de salvar.</p>
    <form id="f-imp" class="grid">
      <label class="full">Arquivo .xlsx<input name="file" type="file" accept=".xlsx" required></label>
      <label>Ano da planilha<input name="year" type="number" min="2000" max="2100" value="${new Date().getFullYear()}" required></label>
      <div class="opts">
        <label class="paid"><input type="checkbox" name="orc" checked><span>Orçamento e cartões</span></label>
        <label class="paid"><input type="checkbox" name="cas" checked><span>Lista de compras (aba Casamento)</span></label>
      </div>
      <button class="btn small full">Importar</button>
    </form>
    <div id="imp-msg"></div>
  </section>
  <section class="card">
    <h3>Dados e segurança</h3>
    <div class="row wrap">
      <button class="btn small ghost" id="csv">Baixar planilha do ano (CSV)</button>
      <button class="btn small ghost" id="lock">🔒 Trancar agora</button>
      <button class="btn small ghost" id="logout">Sair</button>
    </div>
    <p class="muted small">Tranca sozinho após 10 min sem uso. O CSV baixado não é criptografado — guarde com cuidado.</p>
  </section>
  <section class="card">
    <h3>Backup criptografado</h3>
    <p class="muted small">Uma cópia de tudo (orçamento, cartões, gastos, obra, terreno, listas), protegida por uma senha de backup. Guardem o arquivo no Google Drive ou no e-mail, uma vez por mês. Se algo acontecer com o servidor, dá para restaurar tudo.</p>
    <form id="f-bkp" class="grid">
      <label class="full">Senha do backup (mín. 8)<input name="pw" type="password" minlength="8" autocomplete="new-password" required></label>
      <button class="btn small full">Baixar backup</button>
    </form>
    <details class="more"><summary>Restaurar um backup</summary>
      <form id="f-rst" class="grid">
        <label class="full">Arquivo de backup<input name="file" type="file" accept=".json,application/json" required></label>
        <label class="full">Senha do backup<input name="pw" type="password" autocomplete="off" required></label>
        <button class="btn small ghost full">Restaurar</button>
      </form>
    </details>
  </section>
  <section class="card">
    <h3>Trocar minha senha</h3>
    <form id="f-pw" class="grid">
      <label class="full">Senha atual<input name="cur" type="password" autocomplete="current-password" required></label>
      <label>Nova senha<input name="n1" type="password" minlength="8" autocomplete="new-password" required></label>
      <label>Repita a nova<input name="n2" type="password" minlength="8" autocomplete="new-password" required></label>
      <button class="btn small full">Trocar senha</button>
    </form>
    <p class="muted small">Troca só a sua senha. A do seu par continua a mesma.</p>
  </section>`;

  $('#f-bkp', root).addEventListener('submit', async (ev) => {
    ev.preventDefault(); const b = $('button', ev.target); busy(b, true, 'Criptografando…');
    try {
      const salt = newSalt(), key = await deriveKEK(ev.target.pw.value, salt);
      const items = [...S.items.values()].map(({ _u, ...x }) => x);
      const box = await encryptJSON(key, { items, at: Date.now() }, 'backup:nossas-financas');
      const blob = new Blob([JSON.stringify({ app: 'nossas-financas', v: 1, salt, ...box })], { type: 'application/json' });
      const d = new Date(), aEl = document.createElement('a');
      aEl.href = URL.createObjectURL(blob); aEl.download = `backup-nossas-financas-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`; aEl.click();
      setTimeout(() => URL.revokeObjectURL(aEl.href), 1000); ev.target.reset(); toast(`Backup gerado com ${items.length} itens.`);
    } catch (e) { toast(errMsg(e)); }
    busy(b, false);
  });
  $('#f-rst', root).addEventListener('submit', async (ev) => {
    ev.preventDefault(); const f = ev.target, b = $('button', f); busy(b, true, 'Lendo…');
    try {
      const j = JSON.parse(await f.file.files[0].text());
      if (j.app !== 'nossas-financas') throw new Error('Esse arquivo não é um backup do app.');
      let data; try { data = await decryptJSON(await deriveKEK(f.pw.value, j.salt), j, 'backup:nossas-financas'); } catch { throw new Error('Senha do backup incorreta.'); }
      if (!confirm(`Restaurar ${data.items.length} itens do backup de ${new Date(data.at).toLocaleDateString('pt-BR')}? Itens iguais são substituídos pela versão do backup; o que foi criado depois continua.`)) { busy(b, false); return; }
      busy(b, true, 'Restaurando…');
      await saveMany(data.items, 'restaurou um backup'); toast('Backup restaurado!'); viewMain();
    } catch (e) { toast(errMsg(e), 5000); busy(b, false); }
  });
  $('#f-pw', root).addEventListener('submit', async (ev) => {
    ev.preventDefault(); const f = ev.target, b = $('button', f);
    if (f.n1.value !== f.n2.value) return toast('As novas senhas não conferem.');
    busy(b, true, 'Trocando…');
    const old = { ...S.mem };
    try {
      // confere a senha atual
      const kek = await deriveKEK(f.cur.value, S.mem.kek_salt);
      await decryptBytes(kek, JSON.parse(S.mem.wrapped_key), aadDK(S.hid, S.user.id));
    } catch { busy(b, false); return toast('Senha atual incorreta.'); }
    try {
      const mine = await wrapForMe(S.hid, S.dkRaw, f.n1.value);
      await S.be.setMyKey(S.hid, mine.kek_salt, mine.wrapped_key);
      try { await S.be.updatePassword(await authPassword(S.user.email, f.n1.value)); }
      catch (e) { await S.be.setMyKey(S.hid, old.kek_salt, old.wrapped_key); throw e; } // desfaz se o login não trocou
      S.mem = { ...S.mem, ...mine }; f.reset(); toast('Senha trocada! Use a nova a partir de agora.', 5000);
    } catch (e) { toast(errMsg(e), 5000); }
    busy(b, false);
  });

  $('#f-names', root).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await save({ ...(st.raw || { type: 'settings' }), people: st.people, p1: ev.target.p1.value.trim(), p2: ev.target.p2.value.trim() }, 'atualizou os nomes'); toast('Nomes salvos!'); } catch (e) { toast(errMsg(e)); }
  });
  $('#lock', root).addEventListener('click', lock);
  $('#logout', root).addEventListener('click', logout);
  $('#csv', root).addEventListener('click', exportCSV);
  $('#f-imp', root).addEventListener('submit', (ev) => doImport(ev, root));
  renderInvite($('#invite-card', root));
}

async function renderInvite(box) {
  let info;
  try { info = await S.be.householdInfo(S.hid); } catch (e) { box.innerHTML = `<h3>Convite para o seu par</h3><p class="muted">${esc(errMsg(e))}</p>`; return; }
  if (info.members >= 2) {
    box.innerHTML = `<h3>Convite para o seu par</h3><p>✅ Vocês dois já estão no cofre. Cada um entra com o próprio e-mail e senha.</p>`;
    return;
  }
  box.innerHTML = `<h3>Convite para o seu par</h3>
    <p class="muted">Gere um código e mande para seu par (de preferência pessoalmente ou por mensagem que some). Ele cria a conta dele com a senha dele e cola o código. O código só funciona uma vez.</p>
    ${info.invitePending ? '<p class="small">⏳ Já existe um convite gerado e ainda não usado. Gerar outro cancela o anterior.</p>' : ''}
    <button class="btn small" id="gen">Gerar código de convite</button>
    <div id="code-out"></div>`;
  $('#gen', box).addEventListener('click', async (ev) => {
    busy(ev.target, true, 'Gerando…');
    try {
      const secret = b64url(randomBytes(18));
      const wrap = await encryptBytes(await inviteKey(secret, S.hid), S.dkRaw, 'invite:' + S.hid);
      await S.be.setInvite(S.hid, JSON.stringify(wrap));
      const code = `${S.hid}.${secret}`;
      $('#code-out', box).innerHTML = `<div class="row"><code>${esc(code)}</code><button class="btn small ghost" id="cp">Copiar</button></div>`;
      $('#cp', box).addEventListener('click', async () => { try { await navigator.clipboard.writeText(code); toast('Código copiado!'); } catch { toast('Selecione e copie o código.'); } });
    } catch (e) { toast(errMsg(e)); }
    busy(ev.target, false);
  });
}

async function doImport(ev, root) {
  ev.preventDefault();
  const f = ev.target, b = $('button', f), file = f.file.files[0];
  if (!file) return;
  busy(b, true, 'Lendo planilha…');
  try {
    const res = await parsePlanilha(await file.arrayBuffer(), Number(f.year.value), nowMonth());
    const lines = res.items.filter(i => i.type === 'line'), cards = res.items.filter(i => i.kind === 'cartao');
    const nCards = cards.length ? res.items.filter(i => i.type === 'line' && i.group === cards[0].id).length : 0;
    const parts = [];
    if (f.orc.checked) parts.push(`${res.items.length - lines.length} categorias, ${lines.length} linhas (${nCards} cartões)`);
    if (f.cas.checked) parts.push(`${res.wishes.length} itens da lista de compras`);
    if (!parts.length) { busy(b, false); return toast('Marque o que deseja importar.'); }
    if (!confirm(`Encontrei: ${parts.join(' e ')}.\n\nIsso SUBSTITUI o que está no app hoje nessas partes. Continuar?`)) { busy(b, false); return; }
    busy(b, true, 'Criptografando e salvando…');
    const keepObra = (i) => i.sys || (i.type === 'group' && i.key === 'obra');
    // Cartões que já existem no app continuam os mesmos (mantêm gastos detalhados, limite e vencimento)
    const keep = new Set();
    if (f.orc.checked) {
      const nn = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const ng = res.items.find(i => i.type === 'group' && i.kind === 'cartao');
      const oldCards = model.cards;
      if (ng) {
        const newCards = res.items.filter(i => i.type === 'line' && i.group === ng.id);
        newCards.forEach(l => { const o = oldCards.find(c => nn(c.name) === nn(l.name)); if (o) { l.id = o.id; l.limit = o.limit; l.due = o.due; keep.add(o.id); } });
        oldCards.filter(c => !keep.has(c.id) && model.buysOf(c.id).length).forEach(c => { res.items.push({ ...c, group: ng.id }); keep.add(c.id); });
        res.items.filter(i => i.type === 'line' && i.group === ng.id).forEach(l => { const bs = model.buysOf(l.id); if (bs.length) Object.assign(l, cardWithSums(l, bs.flatMap(monthsOf), bs)); });
      } else if (oldCards.length) { keep.add(model.cardGroup.id); oldCards.forEach(c => keep.add(c.id)); }
    }
    const neu = [...(f.orc.checked ? res.items : []), ...(f.cas.checked ? res.wishes : [])];
    const neuIds = new Set(neu.map(i => i.id));
    const old = [...S.items.values()].filter(i => (f.orc.checked && (i.type === 'group' || i.type === 'line') && !keepObra(i) && !keep.has(i.id)) || (f.cas.checked && i.type === 'wish')).map(i => i.id).filter(id => !neuIds.has(id));
    await saveMany(neu, 'importou a planilha');
    await removeMany(old);
    $('#imp-msg', root).innerHTML = `<p class="ok">✅ Importado! Meses anteriores a ${mLabel(nowMonth())} foram marcados como pagos — ajuste no Orçamento se precisar.</p>
      ${res.warnings.length ? `<details class="warnbox"><summary>⚠️ ${res.warnings.length} aviso(s) sobre os cartões</summary><ul>${res.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}`;
    toast('Planilha importada!');
  } catch (e) { toast(errMsg(e), 5000); }
  busy(b, false);
}

function exportCSV() {
  const year = S.month.slice(0, 4);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const ms = MESES.map((_, i) => `${year}-${pad(i + 1)}`);
  const rows = [['Categoria', 'Item', ...MESES_LONGOS, 'Total']];
  model.groups.forEach(g => model.linesOf(g.id).forEach(l => {
    const vs = ms.map(m => val(l, m));
    rows.push([g.name, l.name, ...vs.map(num), num(vs.reduce((a, b) => a + b, 0))]);
  }));
  const ys = yearStats(model, year);
  rows.push([]); rows.push(['TOTAIS', 'Renda', ...ys.map(s => num(s.renda))]); rows.push(['', 'Despesas', ...ys.map(s => num(s.despesas))]);
  rows.push(['', 'Saldo do mês', ...ys.map(s => num(s.saldo))]); rows.push(['', 'Saldo acumulado', ...ys.map(s => num(s.acumulado))]);
  const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `orcamento-${year}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================= auto-trancar e sincronizar ================= */
const AUTOLOCK_MS = 10 * 60 * 1000;
let lastActive = Date.now();
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => (lastActive = Date.now()), { passive: true }));
setInterval(() => { if (S.dk && Date.now() - lastActive > AUTOLOCK_MS) { lock(); toast('Cofre trancado por inatividade.'); } }, 20000);

async function refresh() {
  if (!S.dk || !S.be?.remote || S.live) return;
  const a = document.activeElement;
  if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return; // não atrapalha quem está digitando
  try { await load(); scheduleRender(); } catch {}
}
document.addEventListener('visibilitychange', async () => {
  // ao voltar para o app (ex.: celular estava bloqueado), garante que está tudo atualizado
  if (document.hidden || !S.dk || !S.be?.remote || typing()) return;
  try { await load(); scheduleRender(); } catch {}
});
setInterval(() => { if (!document.hidden) refresh(); }, 30000);

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

start();
