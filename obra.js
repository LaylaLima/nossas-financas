// Terreno e obra: etapas, compras, formas de pagamento e cálculos.
import { parseItems, parcelIn, monthsOf, shiftM } from './buys.js';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const r2 = (n) => Math.round(n * 100) / 100;

export const ETAPAS = [
  ['Projeto e documentação', 'projeto arquiteto engenheiro alvara art rrt taxa prefeitura cartorio escritura itbi registro topografia sondagem aprovacao planta'],
  ['Limpeza e preparo do terreno', 'limpeza terraplanagem terraplenagem roçada rocada aterro retroescavadeira entulho cacamba caçamba gabarito'],
  ['Fundação', 'cimento areia brita pedra ferro vergalhao vergalhão aco aço estaca sapata baldrame concreto impermeabilizante arame forma tabua'],
  ['Estrutura (colunas, vigas, laje)', 'laje viga coluna pilar escora trelica treliça eps isopor'],
  ['Alvenaria', 'tijolo tijolos bloco blocos cal'],
  ['Cobertura / telhado', 'telha telhas telhado caibro ripa madeiramento calha rufo manta cumeeira'],
  ['Instalações elétricas', 'fio fios cabo cabos disjuntor quadro tomada tomadas interruptor eletroduto conduite eletrica eletricista lampada'],
  ['Instalações hidráulicas e esgoto', 'cano canos tubo tubos registro caixa dagua conexao conexoes joelho hidraulica encanador esgoto fossa'],
  ['Reboco e contrapiso', 'reboco emboço emboco chapisco contrapiso massa reboco'],
  ['Revestimentos e pisos', 'piso pisos porcelanato ceramica cerâmica revestimento azulejo rejunte argamassa ac2 ac3 rodape'],
  ['Esquadrias (portas e janelas)', 'porta portas janela janelas esquadria vidro vidros portao portão fechadura'],
  ['Pintura', 'tinta tintas massa corrida lixa selador rolo pincel textura grafiato pintor'],
  ['Louças, metais e acabamentos', 'vaso sanitario pia cuba torneira chuveiro louca louça metais bancada granito marmore luminaria espelho'],
  ['Área externa e muro', 'muro calçada calcada grama jardim garagem cerca']
];

export const OBRA_KINDS = [
  { k: 'material', n: 'Material', i: '🧱', c: '#A87B3A' },
  { k: 'mao', n: 'Mão de obra', i: '👷', c: '#5B6B3A' },
  { k: 'projeto', n: 'Projeto e taxas', i: '📐', c: '#8C7AA0' },
  { k: 'equip', n: 'Equipamentos e aluguel', i: '🚜', c: '#6E9A8C' },
  { k: 'terreno', n: 'Terreno', i: '📍', c: '#8A6A2E' },
  { k: 'outros', n: 'Outros', i: '📦', c: '#B3AA90' }
];
export const kindOf = (k) => OBRA_KINDS.find(x => x.k === k) || OBRA_KINDS[OBRA_KINDS.length - 1];

export const PAYS = [
  { k: 'pix', n: 'PIX', i: '⚡' },
  { k: 'dinheiro', n: 'Dinheiro', i: '💵' },
  { k: 'debito', n: 'Débito', i: '🏦' },
  { k: 'boleto', n: 'Boleto', i: '🧾' },
  { k: 'transferencia', n: 'Transferência', i: '🔁' },
  { k: 'cartao', n: 'Cartão de crédito', i: '💳' }
];
export const payOf = (k) => PAYS.find(p => p.k === k) || PAYS[0];

// texto curto da forma de pagamento: "💳 Itau 1 · 3x" / "⚡ PIX · à vista"
export function payLabel(b, cardName) {
  const n = b.n || 1;
  if (b.card) return `💳 ${cardName || 'Cartão'} · ${n > 1 ? `${n}x` : 'à vista'}`;
  const p = payOf(b.pay);
  return `${p.i} ${p.n} · ${n > 1 ? `${n}x` : 'à vista'}`;
}

const MAO = /\b(pedreiro|servente|ajudante|mao de obra|diaria|diarias|empreiteiro|empreitada|eletricista|encanador|pintor|mestre|azulejista|gesseiro|carpinteiro|serralheiro)\b/;
const PROJ = /\b(projeto|arquiteto|engenheiro|alvara|art|rrt|taxa|prefeitura|cartorio|escritura|itbi|registro de imovel|topografia|sondagem)\b/;
const EQUIP = /\b(aluguel|betoneira|andaime|cacamba|retroescavadeira|maquina|furadeira|serra)\b/;

export function guessKind(desc) {
  const d = norm(desc);
  if (MAO.test(d)) return 'mao';
  if (PROJ.test(d)) return 'projeto';
  if (EQUIP.test(d)) return 'equip';
  if (/\bterreno\b/.test(d)) return 'terreno';
  return 'material';
}
export function guessEtapa(desc, etapas, fallbackId) {
  const words = norm(desc).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  let best = null, bestScore = 0;
  for (const e of etapas) {
    const kw = norm((ETAPAS.find(x => x[0] === e.name)?.[1] || '') + ' ' + e.name).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
    let s = 0;
    for (const w of words) if (kw.some(k => k === w || (w.length >= 5 && (k.startsWith(w) || w.startsWith(k))))) s++;
    if (s > bestScore) { bestScore = s; best = e.id; }
  }
  return best || fallbackId || null;
}

// Entende forma de pagamento no texto: "pix", "dinheiro", "no itau em 3x", "à vista", "boleto 2x"
export function parseObra(text, cards) {
  const t = ' ' + norm(text) + ' ';
  let pay = null, card = null;
  if (/\bpix\b/.test(t)) pay = 'pix';
  else if (/\b(dinheiro|especie|cash)\b/.test(t)) pay = 'dinheiro';
  else if (/\bdebito\b/.test(t)) pay = 'debito';
  else if (/\bboleto\b/.test(t)) pay = 'boleto';
  else if (/\b(transferencia|ted|doc)\b/.test(t)) pay = 'transferencia';
  for (const c of cards) {
    const words = norm(c.name).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^\d+$/.test(w));
    const full = norm(c.name).trim();
    if (t.includes(' ' + full + ' ') || words.some(w => new RegExp(`\\b${w}\\b`).test(t))) {
      // se houver "itau 1" e "itau 2", prefere o nome completo
      if (!card || t.includes(' ' + full + ' ')) card = c.id;
    }
  }
  if (card || /\b(cartao|credito)\b/.test(t)) pay = 'cartao';
  const cleaned = String(text)
    .replace(/\b(no |na |pelo |pela |com o |com a )?(pix|dinheiro|d[eé]bito|boleto|transfer[eê]ncia|cart[aã]o( de cr[eé]dito)?|cr[eé]dito)\b/gi, ' ')
    .replace(/\b[àa] ?vista\b/gi, ' ');
  const r = parseItems(cleaned, cards.map(c => c.name));
  return { ...r, pay, card };
}

/* ---------- cálculos ---------- */
export function obraStats(etapas, buys) {
  const spentBy = {};
  buys.forEach(b => { const k = b.etapa || '_'; spentBy[k] = r2((spentBy[k] || 0) + b.total); });
  const budget = r2(etapas.reduce((s, e) => s + (Number(e.budget) || 0), 0));
  const allBudgeted = etapas.length && etapas.every(e => Number(e.budget) > 0);
  const pct = !etapas.length ? 0 : allBudgeted
    ? etapas.reduce((s, e) => s + (Number(e.pct) || 0) * Number(e.budget), 0) / budget
    : etapas.reduce((s, e) => s + (Number(e.pct) || 0), 0) / etapas.length;
  const spent = r2(buys.filter(b => b.okind !== 'terreno').reduce((s, b) => s + b.total, 0));
  // comparação justa: só as etapas que têm valor orçado
  const withB = etapas.filter(e => Number(e.budget) > 0);
  const bSpent = r2(withB.reduce((s, e) => s + (spentBy[e.id] || 0), 0));
  const bPct = budget ? Math.round(withB.reduce((s, e) => s + (Number(e.pct) || 0) * Number(e.budget), 0) / budget) : 0;
  const bUsed = budget ? Math.round(bSpent / budget * 100) : null;
  return { spentBy, budget, pct: Math.round(pct), spent, weighted: allBudgeted, bSpent, bPct, bUsed, nBudget: withB.length };
}

// Valores mês a mês do terreno (parcelas)
export function terrenoParcelas(t) {
  if (!t || !t.parcelas || !t.valorParcela || !t.inicio) return [];
  return Array.from({ length: Number(t.parcelas) }, (_, k) => [shiftM(t.inicio, k), Number(t.valorParcela)]);
}

export { parcelIn, monthsOf };
