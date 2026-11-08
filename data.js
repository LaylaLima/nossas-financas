// Estrutura do orçamento (igual à planilha), cálculos e importação.
import { readXlsx, numToCol } from './xlsx.js';

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const TEMPLATE = [
  { key: 'renda', name: 'Renda da família', kind: 'renda', color: '#6B7B45', lines: ['Salário {p1}', 'Salário {p2}', 'Freelas', 'Gratificações', 'Premiações', 'Juros de investimentos', 'Outros'] },
  { key: 'cartoes', name: 'Cartões', kind: 'cartao', color: '#B8954A', lines: ['Cartão 1', 'Cartão 2'] },
  { key: 'pessoal', name: 'Pessoal', kind: 'despesa', color: '#8C7AA0', lines: ['Plano de celular {p1}', 'Plano de celular {p2}', 'Internet', 'Detran', 'Habilitação'] },
  { key: 'impostos', name: 'Impostos', kind: 'despesa', color: '#9A9480', lines: ['IR', 'INSS'] },
  { key: 'transporte', name: 'Carro / Moto / Transporte', kind: 'despesa', color: '#C07A3E', lines: ['Prestação', 'Seguro', 'Combustível', 'Lava jato', 'IPVA', 'Revisão/Consertos', 'Multas', 'Uber'] },
  { key: 'despesas', name: 'Despesas pessoais', kind: 'despesa', color: '#C48A8A', lines: ['Cosméticos + Higiene', 'Cabeleireiro', 'Roupas + Sapatos', 'Lavanderia', 'Academia', 'Cursos', 'Outros'] },
  { key: 'lazer', name: 'Lazer', kind: 'despesa', color: '#6E9A8C', lines: ['Restaurantes', 'Café/Bar/Sorveteria', 'Viagens', 'Hotel', 'Passeios', 'Outros'] },
  { key: 'invest', name: 'Investimentos', kind: 'despesa', color: '#8FA35A', lines: ['{p1}', '{p2}'] },
  { key: 'dependentes', name: 'Dependentes', kind: 'despesa', color: '#D4B26A', lines: ['Escola/Faculdade', 'Cursos extras', 'Material escolar', 'Esportes/Uniformes', 'Mesada', 'Passeios/Férias', 'Vestuário', 'Saúde/Medicamentos', 'Outros'] }
];
export const EXTRA_COLORS = ['#A88B5A', '#7A8FA0', '#B5655A', '#6E8B5E', '#C9A25A', '#9C7A9A', '#5E7A6E'];

export const WISH_LISTS = [
  { key: 'eletro', name: 'Eletrodomésticos' },
  { key: 'itens', name: 'Itens da casa (enxoval)' },
  { key: 'festa', name: 'Festa (para depois)' }
];

export function templateItems(p1, p2) {
  const out = [];
  TEMPLATE.forEach((g, gi) => {
    const gid = crypto.randomUUID();
    out.push({ id: gid, type: 'group', key: g.key, name: g.name, kind: g.kind, color: g.color, order: gi });
    g.lines.forEach((l, li) => out.push({ id: crypto.randomUUID(), type: 'line', group: gid, name: l.replace('{p1}', p1).replace('{p2}', p2), order: li, vals: {} }));
  });
  return out;
}

/* ---------- Cálculos ---------- */
export const val = (line, m) => Number(line?.vals?.[m]?.v) || 0;
export const isPaid = (line, m) => !!line?.vals?.[m]?.p;
export const r2 = (n) => Math.round(n * 100) / 100;

// Limite do cartão: "usado" = tudo que ainda não foi pago (faturas em aberto + parcelas futuras).
// Marcar a fatura como paga libera o limite. limAdj = ajuste para bater com o app do banco.
export function cardUse(c) {
  const lim = Number(c?.limit) || 0;
  let raw = 0;
  for (const x of Object.values(c?.vals || {})) if (x && !x.p && Number(x.v) > 0) raw += Number(x.v);
  const used = r2(Math.max(0, raw - (Number(c?.limAdj) || 0)));
  return { lim, raw: r2(raw), used, avail: r2(lim - used), pct: lim ? used / lim : 0 };
}

export function monthStats(model, m) {
  const byGroup = model.groups.map(g => {
    const lines = model.linesOf(g.id);
    return { g, total: r2(lines.reduce((s, l) => s + val(l, m), 0)), paid: r2(lines.reduce((s, l) => s + (isPaid(l, m) ? val(l, m) : 0), 0)) };
  });
  const renda = r2(byGroup.filter(x => x.g.kind === 'renda').reduce((s, x) => s + x.total, 0));
  const desp = byGroup.filter(x => x.g.kind !== 'renda');
  const despesas = r2(desp.reduce((s, x) => s + x.total, 0));
  const pago = r2(desp.reduce((s, x) => s + x.paid, 0));
  return { m, renda, despesas, saldo: r2(renda - despesas), pago, falta: r2(despesas - pago), byGroup };
}
export function yearStats(model, year) {
  let acc = 0;
  return MESES.map((_, i) => {
    const st = monthStats(model, `${year}-${String(i + 1).padStart(2, '0')}`);
    acc = r2(acc + st.saldo); st.acumulado = acc; return st;
  });
}

/* ---------- Importação da planilha ---------- */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const GROUP_MATCH = [
  ['renda', /renda|receita|rendiment/], ['cartoes', /cart/], ['pessoal', /^pessoal/], ['impostos', /impost/],
  ['transporte', /carro|moto|transporte/], ['despesas', /despesas pessoais/], ['lazer', /lazer/],
  ['invest', /invest/], ['dependentes', /dependent/]
];

export async function parsePlanilha(buf, year, curMonthKey) {
  const book = await readXlsx(buf);
  const sheetNames = Object.keys(book);
  const orc = book[sheetNames.find(n => /or.amento/i.test(norm(n))) || sheetNames[0]];
  const get = (c) => orc[c]?.v;

  // 1) acha a linha dos meses e as colunas de cada mês
  const monthCols = {};
  for (let r = 1; r <= 30 && Object.keys(monthCols).length < 12; r++) {
    for (let c = 1; c <= 40; c++) {
      const v = norm(get(numToCol(c) + r));
      const idx = MESES_LONGOS.findIndex(x => norm(x) === v);
      if (idx >= 0) { monthCols[idx] = numToCol(c); monthCols._row = r; }
    }
  }
  if (Object.keys(monthCols).length < 13) throw new Error('Não encontrei a linha com os meses (JANEIRO… DEZEMBRO) na aba Orçamento.');
  const mk = (i) => `${year}-${String(i + 1).padStart(2, '0')}`;
  const firstCol = monthCols[0];

  const items = [], warnings = [];
  let pendingHead = [];
  const flushHead = () => {
    if (!card) return;
    pendingHead.forEach(([i, v]) => { const s = card.vals[mk(i)]?.v || 0; if (Math.abs(s - v) > 0.009) warnings.push(`${card.name} / ${MESES_LONGOS[i]}: o total do cartão estava digitado (${v.toLocaleString('pt-BR')}), mas os lançamentos abaixo somam ${s.toLocaleString('pt-BR')}. Usei a soma.`); });
    pendingHead = [];
  };
  let group = null, card = null, order = 0, lineOrder = 0;
  const groupsByKey = {};
  const newGroup = (name) => {
    const n = norm(name);
    const m = GROUP_MATCH.find(([, re]) => re.test(n));
    const tpl = TEMPLATE.find(t => t.key === m?.[0]);
    const key = tpl?.key || 'extra-' + order;
    if (groupsByKey[key]) return groupsByKey[key];
    const g = { id: crypto.randomUUID(), type: 'group', key, name: tpl?.name || String(name).trim(), kind: tpl?.kind || 'despesa', color: tpl?.color || EXTRA_COLORS[order % EXTRA_COLORS.length], order: order++ };
    items.push(g); groupsByKey[key] = g; lineOrder = 0; return g;
  };
  const newLine = (name) => { const l = { id: crypto.randomUUID(), type: 'line', group: group.id, name: String(name).trim(), order: lineOrder++, vals: {} }; items.push(l); return l; };
  const addVals = (line, r) => {
    for (let i = 0; i < 12; i++) {
      const c = orc[monthCols[i] + r];
      if (c && !c.f && typeof c.v === 'number' && c.v !== 0) {
        const m = mk(i), prev = line.vals[m]?.v || 0;
        line.vals[m] = { v: Math.round((prev + c.v) * 100) / 100, p: group.kind !== 'renda' && m < curMonthKey };
      }
    }
  };

  for (let r = monthCols._row + 1; r <= 400; r++) {
    const A = get('A' + r), B = get('B' + r);
    if (norm(B) === 'totais' || norm(A) === 'totais') { flushHead(); break; }
    if (typeof A === 'string' && A.trim()) { flushHead(); group = newGroup(A); card = null; continue; }
    if (!group || typeof B !== 'string' || !B.trim()) continue;
    if (group.kind === 'cartao') {
      const head = orc[firstCol + r];
      if (head?.f) {
        flushHead(); card = newLine(B); pendingHead = [];
        for (let i = 0; i < 12; i++) {
          const c = orc[monthCols[i] + r];
          if (c && !c.f && typeof c.v === 'number') pendingHead.push([i, c.v]);
        }
        continue;
      }
      if (!card) card = newLine(B);
      addVals(card, r);
    } else {
      addVals(newLine(B), r);
    }
  }

  // 2) aba Casamento
  const wishes = [];
  const cas = book[sheetNames.find(n => /casamento/i.test(norm(n)))];
  if (cas) {
    const blocks = [['eletro', 'A', 'B', 'C'], ['itens', 'D', 'E', 'F'], ['festa', 'G', null, null]];
    for (const [list, cn, cp, cl] of blocks) {
      let o = 0;
      for (let r = 2; r <= 300; r++) {
        const name = cas[cn + r]?.v;
        if (typeof name !== 'string' || !name.trim() || /^\.+$/.test(name.trim()) || /^total/i.test(name.trim())) continue;
        const price = cp ? cas[cp + r]?.v : null, extra = cl ? cas[cl + r]?.v : null;
        const ex = typeof extra === 'string' ? extra.trim() : '';
        wishes.push({
          id: crypto.randomUUID(), type: 'wish', list, name: name.trim(), order: o++,
          price: typeof price === 'number' ? price : null,
          link: /^https?:\/\//i.test(ex) ? ex : '',
          note: ex && !/^https?:\/\//i.test(ex) && norm(ex) !== 'ok' ? ex : '',
          done: norm(ex) === 'ok'
        });
      }
    }
  }
  return { items, wishes, warnings };
}
