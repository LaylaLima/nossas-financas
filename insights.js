// "Inteligência" do app: análises automáticas feitas no próprio aparelho (os dados nunca saem descriptografados).
import { val, isPaid, r2, monthStats, MESES_LONGOS } from './data.js';
import { brl } from './charts.js';

const shift = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const mName = (m) => MESES_LONGOS[Number(m.slice(5)) - 1].toLowerCase();
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Linha recorrente = teve valor em pelo menos 2 dos 3 meses anteriores
export function recurring(model, m) {
  const prev = [1, 2, 3].map(k => shift(m, -k));
  return [...model.allLines()].map(l => {
    const vs = prev.map(p => val(l, p)).filter(v => v > 0);
    return { l, n: vs.length, est: r2(avg(vs)), last: val(l, prev[0]) };
  }).filter(x => x.n >= 2);
}

// Renda variável: olha os últimos 6 meses com renda e mede o mês mais fraco, a média e o mais forte
export function incomeStats(model, m, n = 6) {
  const months = Array.from({ length: n }, (_, k) => shift(m, -(k + 1)));
  const vals = months.map(x => monthStats(model, x).renda).filter(v => v > 0);
  if (!vals.length) return null;
  const mn = Math.min(...vals), mx = Math.max(...vals), a = avg(vals);
  const sd = Math.sqrt(avg(vals.map(v => (v - a) ** 2)));
  return { min: r2(mn), max: r2(mx), avg: r2(a), n: vals.length, variable: vals.length >= 2 && sd / a > 0.08 };
}

export function forecast(model, m) {
  const rec = recurring(model, m);
  const kindOf = (l) => model.groupOf(l)?.kind;
  const despesas = r2(rec.filter(x => kindOf(x.l) !== 'renda').reduce((s, x) => s + x.est, 0));
  const inc = incomeStats(model, m);
  // previsão prudente: usa o mês mais fraco de renda dos últimos meses
  const renda = inc ? inc.min : r2(rec.filter(x => kindOf(x.l) === 'renda').reduce((s, x) => s + x.est, 0));
  return { renda, rendaMax: inc?.max ?? renda, rendaAvg: inc?.avg ?? renda, variable: !!inc?.variable, despesas, saldo: r2(renda - despesas), saldoMax: r2((inc?.max ?? renda) - despesas) };
}

export function analyze(model, m, today = new Date()) {
  const out = [];
  const st = monthStats(model, m), prevSt = monthStats(model, shift(m, -1));
  const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const isCurrent = m === curMonth;
  let score = 100;

  // 1) Saldo do mês
  if (st.renda > 0 && st.despesas && st.saldo < 0) {
    const top = st.byGroup.filter(x => x.g.kind !== 'renda' && x.total > 0).sort((a, b) => b.total - a.total).slice(0, 2).map(x => esc(x.g.name)).join(' e ');
    out.push({ level: 'bad', icon: '🚨', text: `As despesas passam a renda em <b>${brl(-st.saldo)}</b>. Os maiores pesos são ${top}.` });
    score -= 40;
  } else if (st.renda && st.saldo / st.renda < 0.05 && st.despesas) {
    out.push({ level: 'warn', icon: '⚠️', text: `Sobra só <b>${brl(st.saldo)}</b> (${Math.round(st.saldo / st.renda * 100)}% da renda). Qualquer imprevisto aperta.` });
    score -= 15;
  } else if (st.renda && st.saldo > 0) {
    const p = Math.round(st.saldo / st.renda * 100);
    out.push({ level: 'good', icon: '💚', text: `Vocês estão guardando <b>${p}% da renda</b>. Sugestão: separar <b>${brl(Math.floor(st.saldo / 2 / 10) * 10)}</b> (metade da sobra) para a casa ou investimentos assim que o salário cair.` });
  }

  // 2) Renda não lançada / renda variável
  const inc = incomeStats(model, m);
  if (!st.renda && prevSt.renda && st.despesas) {
    out.push({ level: 'info', icon: '💰', text: `A renda de ${mName(m)} ainda não foi lançada${inc?.variable ? ` (nos últimos meses variou de ${brl(inc.min)} a ${brl(inc.max)})` : ` (no mês passado foi ${brl(prevSt.renda)})`}.` });
  }
  if (inc?.variable) {
    const fixas = r2(recurring(model, m).filter(x => model.groupOf(x.l)?.kind !== 'renda').reduce((s, x) => s + x.est, 0));
    const folga = r2(inc.min - fixas);
    out.push({ level: folga < 0 ? 'warn' : 'info', icon: '〰️', text: `A renda de vocês varia: de <b>${brl(inc.min)}</b> (mês mais fraco) a <b>${brl(inc.max)}</b> nos últimos ${inc.n} meses (média ${brl(inc.avg)}). ` +
      (folga >= 0 ? `Mesmo no mês mais fraco, as contas que se repetem (~${brl(fixas)}) cabem. O que vier acima de ${brl(inc.min)} pode ir direto para a reserva ou para a obra.`
                  : `No mês mais fraco, as contas que se repetem (~${brl(fixas)}) passariam a renda em ${brl(-folga)}. Vale ter uma reserva de pelo menos esse valor.`) });
    if (st.renda && st.renda < inc.avg * 0.85) out.push({ level: 'warn', icon: '📉', text: `A renda de ${mName(m)} (${brl(st.renda)}) está <b>${Math.round((1 - st.renda / inc.avg) * 100)}% abaixo</b> da média dos últimos meses.` });
    if (st.renda && st.renda > inc.avg * 1.15) out.push({ level: 'good', icon: '📈', text: `A renda de ${mName(m)} (${brl(st.renda)}) veio <b>${Math.round((st.renda / inc.avg - 1) * 100)}% acima</b> da média. Boa hora para reforçar a reserva.` });
  }

  // 3) Cartões: vencimento, limite e aumento fora do normal
  for (const c of model.cards) {
    const v = val(c, m); if (!v) continue;
    const paid = isPaid(c, m);
    if (isCurrent && c.due && !paid) {
      const days = Number(c.due) - today.getDate();
      if (days < 0) { out.push({ level: 'bad', icon: '⏰', text: `A fatura do <b>${esc(c.name)}</b> (${brl(v)}) venceu dia ${c.due} e não está marcada como paga.` }); score -= 20; }
      else if (days <= 5) { out.push({ level: 'warn', icon: '📅', text: `A fatura do <b>${esc(c.name)}</b> (${brl(v)}) vence ${days === 0 ? '<b>hoje</b>' : `em <b>${days} dia${days > 1 ? 's' : ''}</b>`}.` }); score -= 5; }
    }
    if (c.limit && v / c.limit >= 0.8) { out.push({ level: 'warn', icon: '💳', text: `O <b>${esc(c.name)}</b> está com <b>${Math.round(v / c.limit * 100)}% do limite</b> usado.` }); score -= 10; }
    const hist = [1, 2, 3].map(k => val(c, shift(m, -k))).filter(x => x > 0);
    const a = avg(hist);
    if (hist.length >= 2 && v > a * 1.25 && v - a > 100) {
      out.push({ level: 'warn', icon: '📈', text: `A fatura do <b>${esc(c.name)}</b> está <b>${Math.round((v / a - 1) * 100)}% acima</b> da média dos últimos meses (+${brl(v - a)}).` });
      score -= 5;
    }
  }

  // 4) Categorias acima do normal
  for (const x of st.byGroup) {
    if (x.g.kind === 'renda' || x.g.kind === 'cartao' || !x.total) continue;
    const hist = [1, 2, 3].map(k => monthStats(model, shift(m, -k)).byGroup.find(y => y.g.id === x.g.id)?.total || 0).filter(v => v > 0);
    const a = avg(hist);
    if (hist.length >= 2 && x.total > a * 1.2 && x.total - a > 150) out.push({ level: 'info', icon: '🔎', text: `<b>${esc(x.g.name)}</b> está ${Math.round((x.total / a - 1) * 100)}% acima do normal (${brl(x.total)} contra média de ${brl(a)}).` });
  }

  // 5) Contas fixas ainda não lançadas no mês
  // a renda fica de fora: ela varia e só se lança quando cair
  const missing = recurring(model, m).filter(x => !val(x.l, m) && x.last > 0 && model.groupOf(x.l)?.kind !== 'renda');
  if (missing.length) {
    out.push({
      level: 'info', icon: '🪄', action: 'fill',
      text: `${missing.length} conta${missing.length > 1 ? 's' : ''} que se repete${missing.length > 1 ? 'm' : ''} todo mês ainda não ${missing.length > 1 ? 'estão' : 'está'} em ${mName(m)} (${missing.slice(0, 3).map(x => esc(x.l.name)).join(', ')}${missing.length > 3 ? '…' : ''}).`,
      fill: missing.map(x => ({ id: x.l.id, v: x.last }))
    });
  }

  // 6) Pagamentos
  if (st.despesas && st.falta <= 0) out.push({ level: 'good', icon: '✅', text: 'Todas as contas do mês estão pagas.' });
  else if (st.despesas) score -= Math.round(15 * (st.falta / st.despesas));

  // 7) Previsão do próximo mês
  const fc = forecast(model, shift(m, 1));
  if (fc.renda || fc.despesas) {
    out.push({ level: fc.saldo >= 0 ? 'info' : 'warn', icon: '🔮', text: fc.variable && fc.rendaMax > fc.renda
      ? `Previsão para ${mName(shift(m, 1))}: despesas ~${brl(fc.despesas)}. Com a renda variando entre ${brl(fc.renda)} e ${brl(fc.rendaMax)}, deve ${fc.saldo >= 0 ? 'sobrar' : 'ficar entre faltar'} <b>${fc.saldo >= 0 ? `de ${brl(fc.saldo)} a ${brl(fc.saldoMax)}` : `${brl(-fc.saldo)} e ${fc.saldoMax >= 0 ? `sobrar ${brl(fc.saldoMax)}` : `faltar ${brl(-fc.saldoMax)}`}`}</b>.`
      : `Previsão para ${mName(shift(m, 1))} (pelas contas que se repetem): renda ~${brl(fc.renda)}, despesas ~${brl(fc.despesas)} → ${fc.saldo >= 0 ? 'sobra' : 'falta'} <b>~${brl(Math.abs(fc.saldo))}</b>.` });
  }

  // 8) Casamento: em quanto tempo dá para comprar o que falta
  const wishes = model.allWishes();
  const falta = r2(wishes.filter(w => !w.done).reduce((s, w) => s + (Number(w.price) || 0), 0));
  const saldos = [0, 1, 2].map(k => monthStats(model, shift(m, -k)).saldo).filter(s => s > 0);
  if (falta > 0 && saldos.length) {
    const ritmo = avg(saldos), meses = Math.ceil(falta / ritmo);
    const d = shift(m, meses);
    out.push({ level: 'info', icon: '🛋️', text: `Faltam ${brl(falta)} da lista de compras da casa. No ritmo atual de sobra (~${brl(ritmo)}/mês), dá para completar em <b>${meses} ${meses > 1 ? 'meses' : 'mês'}</b> (${mName(d)}/${d.slice(2, 4)}).` });
  }

  score = Math.max(0, Math.min(100, score));
  const label = !st.despesas && !st.renda ? null : score >= 80 ? ['Ótima', 'good'] : score >= 60 ? ['Boa', 'good'] : score >= 40 ? ['Atenção', 'warn'] : ['Crítica', 'bad'];
  const order = { bad: 0, warn: 1, info: 2, good: 3 };
  return { score, label, items: out.sort((a, b) => order[a.level] - order[b.level]) };
}

/* ---------- Lançamento rápido: entende frases como "bradesco 1250" ou "uber 35 pago" ---------- */
const SYN = {
  gasolina: 'combustivel', posto: 'combustivel', alcool: 'combustivel', etanol: 'combustivel',
  salario: 'salario', pagamento: 'salario', freela: 'freelas', freelance: 'freelas', job: 'freelas',
  celular: 'celular', telefone: 'celular', wifi: 'internet', net: 'internet',
  restaurante: 'restaurantes', almoco: 'restaurantes', jantar: 'restaurantes', ifood: 'restaurantes', lanche: 'restaurantes',
  cafe: 'cafe', bar: 'bar', sorvete: 'sorveteria', viagem: 'viagens', hotel: 'hotel', passeio: 'passeios',
  roupa: 'roupas', sapato: 'sapatos', academia: 'academia', curso: 'cursos', cabelo: 'cabeleireiro',
  itau: 'itau', 'itaú': 'itau', nubank: 'nubank', bradesco: 'bradesco', imposto: 'ir', remedio: 'saude', farmacia: 'saude'
};
export function parseQuick(text, lines) {
  let t = norm(text);
  const paid = /\b(pago|paga|paguei|quitado)\b/.test(t);
  t = t.replace(/\b(pago|paga|paguei|quitado|reais|real|r\$)\b/g, ' ');
  const nums = t.match(/\d[\d.]*(,\d{1,2})?|\d+(\.\d{1,2})?/g) || [];
  let amount = null;
  if (nums.length) {
    let s = nums[nums.length - 1];
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    amount = Number(s);
    t = t.replace(nums[nums.length - 1], ' ');
  }
  const words = t.split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !/^(de|do|da|no|na|em|o|a|e|com|pra|para)$/.test(w)).map(w => SYN[w] || w);
  const scored = lines.map(l => {
    const name = norm(l.name), nw = name.split(/[^a-z0-9]+/);
    let s = 0;
    for (const w of words) {
      if (name === w) s += 10;
      else if (nw.includes(w)) s += 6;
      else if (nw.some(x => x.startsWith(w) || w.startsWith(x) && x.length >= 3)) s += 4;
      else if (name.includes(w)) s += 2;
    }
    if (s > 0 && l._group === 'cartao') s += 0.5; // empate: cartões são o mais usado
    return { l, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  return { amount: Number.isFinite(amount) ? amount : null, paid, matches: scored.slice(0, 4).map(x => x.l), words };
}
