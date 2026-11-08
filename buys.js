// Gastos detalhados dos cartões: entende frases livres, separa itens, data, parcelas e categoria.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pad = (n) => String(n).padStart(2, '0');
export const r2 = (n) => Math.round(n * 100) / 100;
export const shiftM = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const diffM = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
export const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export const BUY_CATS = [
  { k: 'alimentacao', n: 'Alimentação', i: '🍫', c: '#C9A25A', w: 'pacoca paçoca mercado supermercado atacadao assai ifood lanche pizza hamburguer padaria pao acougue carne frango peixe restaurante comida chocolate doce bolo cafe cha bebida refrigerante suco cerveja vinho fruta hortifruti feira leite queijo biscoito bolacha arroz feijao sorvete acai salgado marmita' },
  { k: 'higiene', n: 'Higiene e beleza', i: '🧴', c: '#C48A8A', w: 'pasta dente escova shampoo xampu condicionador sabonete desodorante perfume maquiagem batom creme hidratante protetor absorvente fralda barbeador gilete cosmetico esmalte cabelo cabeleireiro manicure unha depilacao fio dental' },
  { k: 'roupas', n: 'Roupas e calçados', i: '👖', c: '#8C7AA0', w: 'calca calcas camisa camiseta blusa vestido sapato sapatos tenis meia meias cueca calcinha sutia jaqueta casaco moletom short shorts saia bermuda roupa roupas bolsa chinelo sandalia bone pijama biquini sunga renner riachuelo cea zara shein' },
  { k: 'saude', n: 'Saúde', i: '💊', c: '#B5655A', w: 'farmacia drogaria remedio medicamento medico consulta exame dentista vitamina hospital plano saude psicologo terapia oculos lente' },
  { k: 'transporte', n: 'Transporte', i: '🚗', c: '#7A8FA0', w: 'uber 99 taxi gasolina combustivel etanol alcool posto estacionamento pedagio onibus metro passagem oficina pneu oleo mecanico lava jato' },
  { k: 'casa', n: 'Casa', i: '🏠', c: '#6E9A8C', w: 'panela movel moveis cama mesa toalha lencol travesseiro limpeza detergente sabao amaciante vassoura rodo decoracao ferramenta lampada luz agua gas aluguel condominio eletro geladeira fogao microondas cortina tapete utensilio copo prato talher tv televisao notebook celular fone' },
  { k: 'lazer', n: 'Lazer', i: '🎉', c: '#8FA35A', w: 'cinema show ingresso bar balada viagem hotel pousada passeio parque jogo game festa aniversario presente praia' },
  { k: 'assinaturas', n: 'Assinaturas', i: '📺', c: '#9A9480', w: 'netflix spotify prime amazon disney hbo max globoplay youtube deezer icloud google assinatura mensalidade app' },
  { k: 'pets', n: 'Pets', i: '🐾', c: '#A8B86A', w: 'racao pet petshop veterinario vet areia coleira brinquedo cachorro gato banho tosa' },
  { k: 'casamento', n: 'Casamento', i: '💍', c: '#D4B26A', w: 'casamento buffet noiva noivo alianca convite convites cerimonia fotografo decoracao lembrancinha padrinhos madrinhas' },
  { k: 'educacao', n: 'Educação', i: '📚', c: '#C07A3E', w: 'curso faculdade livro livros material escola apostila mensalidade escolar' },
  { k: 'obra', n: 'Obra e terreno', i: '🏗️', c: '#8A6A2E', w: 'cimento areia brita tijolo bloco telha piso porcelanato argamassa tinta pedreiro obra terreno vergalhao ferragem madeireira' },
  { k: 'outros', n: 'Outros', i: '📦', c: '#B3AA90', w: '' }
];
const CAT_WORDS = BUY_CATS.flatMap(c => c.w.split(' ').filter(Boolean).map(w => [w, c.k]));
export const catOf = (k) => BUY_CATS.find(c => c.k === k) || BUY_CATS[BUY_CATS.length - 1];

// Descobre a categoria pelas palavras (aprende com o que vocês já classificaram antes)
export function categorize(desc, history = []) {
  const d = norm(desc);
  const words = d.split(/[^a-z0-9]+/).filter(w => w.length >= 2);
  const learned = history.find(h => norm(h.desc) === d) || history.find(h => words.length && norm(h.desc).split(/[^a-z0-9]+/).includes(words[words.length - 1]) && h.cat !== 'outros');
  if (learned) return learned.cat;
  if (/pasta de dente|fio dental/.test(d)) return 'higiene';
  for (const w of words) {
    const hit = CAT_WORDS.find(([cw]) => w === cw || (w.length >= 4 && (w.startsWith(cw) || cw.startsWith(w))));
    if (hit) return hit[1];
  }
  return 'outros';
}

const MONEY = /^r?\$?(\d{1,3}(\.\d{3})+(,\d{1,2})?|\d+(,\d{1,2})?|\d+\.\d{1,2})$/;
const toNum = (s) => { s = s.replace(/^r?\$?/, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); return Number(s); };
const STOP = new Set(['foi', 'gasto', 'gastos', 'gastei', 'gastamos', 'com', 'em', 'de', 'do', 'da', 'no', 'na', 'reais', 'real', 'r$', 'e', 'o', 'a', 'os', 'as', 'um', 'uma', 'dia', 'cartao', 'compra', 'compras', 'comprei', 'compramos', 'paguei', 'pra', 'para', 'total', 'valor', 'fatura', ':', '-']);

function extractDate(t) {
  const today = new Date();
  if (/\bontem\b/.test(t)) { const d = new Date(today); d.setDate(d.getDate() - 1); return [t.replace(/\bontem\b/, ' '), `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`]; }
  if (/\bhoje\b/.test(t)) return [t.replace(/\bhoje\b/, ' '), isoToday()];
  const m = t.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  if (m && Number(m[1]) <= 31 && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    let y = m[3] ? Number(m[3]) : today.getFullYear(); if (y < 100) y += 2000;
    return [t.replace(m[0], ' '), `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`];
  }
  return [t, null];
}

// "dia 03.11 com 500 em paçoca 700 em 2xcalças 400 pasta de dente" → itens
const ACC = { a: '[aáàâã]', e: '[eéèê]', i: '[iíì]', o: '[oóòôõ]', u: '[uúù]', c: '[cç]' };
const accentRe = (s) => norm(s).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').split('').map(ch => ACC[ch] || ch).join('').replace(/\s+/g, '\\s+');
const UNITS = new Set(['saco', 'sacos', 'sc', 'm', 'm2', 'm²', 'm3', 'm³', 'metro', 'metros', 'un', 'und', 'unid', 'unidade', 'unidades', 'kg', 'g', 'lata', 'latas', 'peca', 'pecas', 'milheiro', 'milheiros', 'mil', 'carrada', 'carradas', 'caminhao', 'caminhoes', 'barra', 'barras', 'rolo', 'rolos', 'caixa', 'caixas', 'cx', 'litro', 'litros', 'l', 'galao', 'galoes', 'pacote', 'pacotes', 'diaria', 'diarias', 'dias', 'horas', 'h', 'x']);

export function parseItems(text, cardNames = []) {
  let t = ' ' + String(text).replace(/\n/g, ' ; ') + ' ';
  let date;
  [t, date] = extractDate(t);
  // nome completo do cartão (ex.: "no Itaú 1", "Cartão Itau:") sai do texto, com ou sem acento
  for (const cn of [...cardNames].sort((a, b) => b.length - a.length)) {
    if (!cn || cn.length < 3) continue;
    t = t.replace(new RegExp('(?:\\b(?:no|na|pelo|pela)\\s+)?(?:cart[aã]o\\s+)?' + accentRe(cn) + '(?![a-z0-9])\\s*:?', 'gi'), ' ');
  }
  // palavras do nome do cartão (ex.: "Cartão Itaú:") não viram descrição
  const cardWords = new Set(cardNames.flatMap(cn => norm(cn).split(/[^a-z0-9]+/)).filter(w => w.length >= 3 && !/^\d+$/.test(w)));
  const isCardWord = (x) => cardWords.has(norm(x).replace(/[^a-z0-9]/g, ''));
  // parcelas: "em 3x", "3x de 100", "parcelado em 3"
  let tokens = t.replace(/;/g, ' ; ').replace(/,(?=\s|$)/g, ' , ').replace(/:(?=\s|$)/g, ' ').split(/\s+/).filter(Boolean).filter(x => !isCardWord(x));
  // "30 sacos", "2 diárias": número seguido de unidade é quantidade (vai para a descrição)
  tokens = tokens.reduce((acc, x, i, arr) => {
    const nx = norm(arr[i + 1] || '');
    if (/^\d+([.,]\d+)?$/.test(x) && UNITS.has(nx) && !acc._skip) { acc.push('\u0000' + x + ' ' + arr[i + 1]); acc._skip = true; return acc; }
    if (acc._skip) { acc._skip = false; return acc; }
    acc.push(x); return acc;
  }, []);
  // com vírgulas/";" cada pedaço é um item (o valor é o número do pedaço)
  if (tokens.some(x => x === ',' || x === ';')) {
    const segs = []; let cur = [];
    tokens.forEach(x => { if (x === ',' || x === ';') { if (cur.length) segs.push(cur); cur = []; } else cur.push(x); });
    if (cur.length) segs.push(cur);
    const moneyCount = (sg) => sg.filter(x => MONEY.test(norm(x))).length;
    if (segs.every(sg => moneyCount(sg) <= 1)) {
      const out = []; let statedTotal = null;
      for (const sg of segs) {
        const r = parseSeq(sg);
        for (const it of r.items) out.push(it);
        if (r.statedTotal != null && statedTotal == null && !out.length) statedTotal = r.statedTotal;
      }
      return { date, items: out, statedTotal };
    }
  }
  return { date, ...parseSeq(tokens) };
}

function parseSeq(tokens) {
  const items = []; let cur = null, mode = null, statedTotal = null;
  const firstMeaningful = tokens.find(x => !STOP.has(norm(x)) && x !== ',' && x !== ';');
  mode = firstMeaningful && MONEY.test(norm(firstMeaningful)) ? 'num' : 'word';
  const close = () => { if (cur && (cur.desc.length || cur.v != null)) items.push(cur); cur = null; };
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i], w = norm(raw);
    if (w === ',' || w === ';') { if (mode === 'word' && cur?.v != null) close(); else if (mode === 'num') close(); continue; }
    const px = w.match(/^(\d{1,2})x$/);
    if (px && (norm(tokens[i - 1]) === 'em' || norm(tokens[i + 1]) === 'de' || norm(tokens[i - 1]) === 'parcelado')) {
      if (!cur && items.length) cur = items.pop(); // "tv 1200 em 3x": as parcelas são do item anterior
      if (!cur) cur = { desc: [], v: null, n: 1 };
      cur.n = Number(px[1]);
      if (norm(tokens[i + 1]) === 'de' && MONEY.test(norm(tokens[i + 2] || ''))) { cur.parcel = toNum(norm(tokens[i + 2])); i += 2; }
      continue;
    }
    if (MONEY.test(w)) {
      const v = toNum(w);
      if (mode === 'num') { close(); cur = { desc: [], v, n: 1 }; }
      else { if (!cur) cur = { desc: [], v: null, n: 1 }; if (cur.v != null) { close(); cur = { desc: [], v, n: 1 }; } else cur.v = v; if (mode === 'word' && cur.desc.length) close(); }
      continue;
    }
    if (STOP.has(w) && !(cur && cur.desc.length && /^(de|da|do)$/.test(w) && tokens[i + 1] && !MONEY.test(norm(tokens[i + 1])) && !STOP.has(norm(tokens[i + 1])))) continue;
    if (!cur) cur = { desc: [], v: null, n: 1 };
    if (raw.startsWith('\u0000')) { if (!cur) cur = { desc: [], v: null, n: 1 }; cur.desc.push(raw.slice(1)); continue; }
    const q = raw.match(/^(\d{1,2})x(\D.+)$/i); // "2xcalças" = 2 calças
    cur.desc.push(q ? `${q[1]}x ${q[2]}` : raw);
  }
  close();
  const out = [];
  for (const it of items) {
    const desc = it.desc.join(' ').replace(/\s+/g, ' ').trim();
    let total = it.parcel ? r2(it.parcel * it.n) : it.v;
    if (total == null) continue;
    if (!desc) { if (statedTotal == null && !out.length) statedTotal = total; continue; }
    out.push({ desc: desc.charAt(0).toUpperCase() + desc.slice(1), total: r2(total), n: Math.max(1, it.n || 1) });
  }
  return { items: out, statedTotal };
}

/* ---------- parcelas e soma por fatura ---------- */
export function parcelIn(b, m) {
  const k = diffM(b.first, m), n = Math.max(1, b.n || 1);
  if (k < 0 || k >= n) return 0;
  const base = Math.floor(b.total / n * 100) / 100;
  return k === n - 1 ? r2(b.total - base * (n - 1)) : base;
}
export const parcelIdx = (b, m) => diffM(b.first, m) + 1;
export const monthsOf = (b) => Array.from({ length: Math.max(1, b.n || 1) }, (_, k) => shiftM(b.first, k));
