// Camada de dados. O servidor só recebe textos já criptografados.
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export async function createBackend(cfg) {
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) return supabaseBackend(cfg);
  return localBackend();
}

async function supabaseBackend(cfg) {
  const { createClient } = await import(SUPABASE_JS);
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const chk = ({ data, error }) => { if (error) throw error; return data; };
  let uid = null;

  return {
    remote: true,
    async getUser() {
      const { data } = await sb.auth.getSession();
      const u = data?.session?.user || null; uid = u?.id || null; return u;
    },
    async signIn(email, pw) { chk(await sb.auth.signInWithPassword({ email, password: pw })); },
    async signUp(email, pw) { const d = chk(await sb.auth.signUp({ email, password: pw })); return !!d.session; },
    async signOut() { await sb.auth.signOut(); uid = null; },
    async updatePassword(pw) { chk(await sb.auth.updateUser({ password: pw })); },

    async myMembership() {
      const rows = chk(await sb.from('members').select('household_id,kek_salt,wrapped_key').eq('user_id', uid).limit(1));
      return rows[0] || null;
    },
    async createHousehold(hid, mine) {
      chk(await sb.from('households').insert({ id: hid }));
      chk(await sb.from('members').insert({ household_id: hid, kek_salt: mine.kek_salt, wrapped_key: mine.wrapped_key }));
    },
    async joinHousehold(hid) {
      const { error } = await sb.from('members').insert({ household_id: hid });
      if (error && error.code !== '23505') throw error;
      const h = chk(await sb.from('households').select('invite_wrap').eq('id', hid).maybeSingle());
      return h?.invite_wrap || null;
    },
    async setMyKey(hid, kek_salt, wrapped_key) {
      chk(await sb.from('members').update({ kek_salt, wrapped_key }).eq('household_id', hid).eq('user_id', uid));
    },
    async setInvite(hid, invite_wrap) {
      chk(await sb.from('households').update({ invite_wrap }).eq('id', hid));
    },
    async householdInfo(hid) {
      const h = chk(await sb.from('households').select('invite_wrap').eq('id', hid).maybeSingle());
      const m = chk(await sb.from('members').select('user_id').eq('household_id', hid));
      return { members: m.length, invitePending: !!h?.invite_wrap };
    },

    async listItems(hid) { return chk(await sb.from('items').select('id,iv,data,updated_at').eq('household_id', hid)); },
    async upsertItems(hid, list) {
      const now = new Date().toISOString();
      for (let i = 0; i < list.length; i += 200) {
        chk(await sb.from('items').upsert(list.slice(i, i + 200).map(it => ({ id: it.id, household_id: hid, iv: it.iv, data: it.data, updated_at: now }))));
      }
    },
    async deleteItems(ids) {
      for (let i = 0; i < ids.length; i += 200) chk(await sb.from('items').delete().in('id', ids.slice(i, i + 200)));
    },
    // Tempo real: avisa na hora quando o outro muda algo e quem está online
    subscribe(hid, { onRow, onDelete, onPresence, onStatus }) {
      const ch = sb.channel('hh-' + hid, { config: { presence: { key: uid } } })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'items', filter: `household_id=eq.${hid}` }, (p) => onRow(p.new))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items', filter: `household_id=eq.${hid}` }, (p) => onRow(p.new))
        // exclusões não aceitam filtro no Supabase: chega só o id, e o app ignora ids que não são do cofre
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'items' }, (p) => onDelete(p.old?.id))
        .on('presence', { event: 'sync' }, () => onPresence(Object.keys(ch.presenceState())))
        .subscribe(async (status) => {
          onStatus?.(status === 'SUBSCRIBED');
          if (status === 'SUBSCRIBED') await ch.track({ at: Date.now() });
        });
      return () => sb.removeChannel(ch);
    }
  };
}

// "Modo teste": simula servidor + contas no próprio navegador (dados também criptografados)
function localBackend() {
  const KEY = 'financas_demo_db_v2';
  const empty = () => ({ users: {}, households: {}, members: [], items: {}, session: null });
  const SKEY = 'financas_demo_session';
  const read = () => { let db; try { db = JSON.parse(localStorage.getItem(KEY)) || empty(); } catch { db = empty(); } try { db.session = sessionStorage.getItem(SKEY); } catch { db.session = null; } return db; };
  const write = (db) => { try { if (db.session) sessionStorage.setItem(SKEY, db.session); else sessionStorage.removeItem(SKEY); const { session, ...rest } = db; localStorage.setItem(KEY, JSON.stringify(rest)); } catch {} };
  const me = () => read().session;
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('financas-demo') : null;
  const post = (msg) => { try { bc?.postMessage(msg); } catch {} };

  return {
    remote: false,
    async getUser() { const db = read(); return db.session ? { id: db.session, email: db.users[Object.keys(db.users).find(e => db.users[e].id === db.session)]?.email } : null; },
    async signIn(email, pw) {
      const db = read(), u = db.users[email.toLowerCase()];
      if (!u || u.pw !== pw) throw new Error('Invalid login credentials');
      db.session = u.id; write(db);
    },
    async signUp(email, pw) {
      const db = read(), k = email.toLowerCase();
      if (db.users[k]) throw new Error('User already registered');
      db.users[k] = { id: crypto.randomUUID(), pw, email: k }; db.session = db.users[k].id; write(db); return true;
    },
    async signOut() { const db = read(); db.session = null; write(db); },
    async updatePassword(pw) { const db = read(); const u = Object.values(db.users).find(x => x.id === db.session); u.pw = pw; write(db); },
    async myMembership() { const db = read(); return db.members.find(m => m.user_id === db.session) || null; },
    async createHousehold(hid, mine) {
      const db = read(); db.households[hid] = { id: hid, invite_wrap: null };
      db.members.push({ household_id: hid, user_id: db.session, ...mine }); write(db);
    },
    async joinHousehold(hid) {
      const db = read(); if (!db.households[hid]) throw new Error('foreign key');
      if (!db.members.find(m => m.household_id === hid && m.user_id === db.session)) {
        if (db.members.filter(m => m.household_id === hid).length >= 2) throw new Error('row-level security');
        db.members.push({ household_id: hid, user_id: db.session, kek_salt: null, wrapped_key: null }); write(db);
      }
      return db.households[hid].invite_wrap;
    },
    async setMyKey(hid, kek_salt, wrapped_key) {
      const db = read(); const m = db.members.find(x => x.household_id === hid && x.user_id === db.session);
      Object.assign(m, { kek_salt, wrapped_key }); write(db);
    },
    async setInvite(hid, invite_wrap) { const db = read(); db.households[hid].invite_wrap = invite_wrap; write(db); },
    async householdInfo(hid) {
      const db = read(); return { members: db.members.filter(m => m.household_id === hid).length, invitePending: !!db.households[hid]?.invite_wrap };
    },
    async listItems(hid) { return Object.values(read().items).filter(i => i.household_id === hid); },
    async upsertItems(hid, list) {
      const db = read(), now = new Date().toISOString();
      list.forEach(it => db.items[it.id] = { ...it, household_id: hid, updated_at: now }); write(db);
      list.forEach(it => post({ t: 'row', row: db.items[it.id] }));
    },
    async deleteItems(ids) { const db = read(); ids.forEach(id => delete db.items[id]); write(db); ids.forEach(id => post({ t: 'del', id })); },
    subscribe(hid, { onRow, onDelete, onPresence, onStatus }) {
      if (!bc) return () => {};
      const others = new Map(), myId = me();
      const ping = () => post({ t: 'here', uid: myId, hid });
      const tick = () => { const now = Date.now(); for (const [k, v] of others) if (now - v > 6000) others.delete(k); onPresence([myId, ...others.keys()]); };
      const h = (e) => {
        const m = e.data || {};
        if (m.t === 'row' && m.row?.household_id === hid) onRow(m.row);
        else if (m.t === 'del') onDelete(m.id);
        else if (m.t === 'here' && m.hid === hid && m.uid !== myId) { const isNew = !others.has(m.uid); others.set(m.uid, Date.now()); if (isNew) { ping(); tick(); } }
      };
      bc.addEventListener('message', h);
      const iv = setInterval(() => { ping(); tick(); }, 2000);
      ping(); onStatus?.(true);
      return () => { bc.removeEventListener('message', h); clearInterval(iv); };
    },
    _me: me
  };
}
