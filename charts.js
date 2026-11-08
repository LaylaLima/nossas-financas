// Gráficos em SVG puro (sem bibliotecas externas).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brlShort = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (a >= 1e4) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return brl(n).replace(/,00$/, '');
};

// Rosca: data = [{label, value, color}]
export function donut(data, center = '', sub = '') {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return '<p class="muted center">Sem valores neste mês.</p>';
  const R = 80, r = 52, cx = 100, cy = 100;
  let a0 = -Math.PI / 2, paths = '';
  data.forEach(d => {
    const frac = d.value / total; if (frac <= 0) return;
    const a1 = a0 + frac * Math.PI * 2 - (frac < 1 ? 0.012 : 0.0001);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${cx + rad * Math.cos(ang)} ${cy + rad * Math.sin(ang)}`;
    paths += `<path d="M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z" fill="${d.color}"><title>${esc(d.label)}: ${brl(d.value)} (${Math.round(frac * 100)}%)</title></path>`;
    a0 = a0 + frac * Math.PI * 2;
  });
  const legend = data.filter(d => d.value > 0).map(d => `
    <li><span class="dot" style="background:${d.color}"></span><span class="lg-l">${esc(d.label)}</span>
    <b>${brl(d.value)}</b><small>${Math.round(d.value / total * 100)}%</small></li>`).join('');
  return `<div class="donut-wrap">
    <svg viewBox="0 0 200 200" class="donut" role="img" aria-label="Gráfico de rosca">${paths}
      <text x="100" y="96" text-anchor="middle" class="d-c">${esc(center)}</text>
      <text x="100" y="116" text-anchor="middle" class="d-s">${esc(sub)}</text></svg>
    <ul class="legend-list">${legend}</ul></div>`;
}

// Barras horizontais: [{label, value, color, extra}]
export function hbars(data, opts = {}) {
  const items = data.filter(d => d.value > 0 || opts.showZero);
  if (!items.length) return '<p class="muted center">Sem valores neste mês.</p>';
  const max = Math.max(...items.map(d => d.max || d.value), 1);
  return `<div class="hb">${items.map(d => `
    <div class="hb-row">
      <div class="hb-top"><span>${esc(d.label)}</span><b>${brl(d.value)}</b></div>
      <div class="hb-track"><i style="width:${(d.value / max * 100).toFixed(1)}%;background:${d.color}"></i></div>
      ${d.extra ? `<small class="muted">${d.extra}</small>` : ''}
    </div>`).join('')}</div>`;
}

// Colunas agrupadas / linhas: labels[], series=[{name,color,values[]}], line = {name,color,values[]} opcional
export function timeChart(labels, series, mode = 'bar', line = null) {
  const W = 340, H = 190, L = 44, Rr = 8, T = 12, B = 26;
  const all = series.flatMap(s => s.values).concat(line ? line.values : []);
  let max = Math.max(0, ...all), min = Math.min(0, ...all);
  if (max === min) max = min + 1;
  const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(Math.abs(v) || 1))); return Math.ceil(v / p) * p; };
  max = nice(max); if (min < 0) min = -nice(-min);
  const y = (v) => T + (H - T - B) * (1 - (v - min) / (max - min));
  const n = labels.length, slot = (W - L - Rr) / n;
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = min + (max - min) * k / 4;
    g += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 4}" y="${y(v) + 3}" text-anchor="end" class="ax">${esc(brlShort(v).replace('R$ ', ''))}</text>`;
  }
  if (min < 0) g += `<line x1="${L}" x2="${W - Rr}" y1="${y(0)}" y2="${y(0)}" class="zero"/>`;
  labels.forEach((lb, i) => g += `<text x="${L + slot * i + slot / 2}" y="${H - 8}" text-anchor="middle" class="ax">${esc(lb)}</text>`);
  if (mode === 'bar') {
    const bw = Math.min(14, (slot - 6) / series.length);
    series.forEach((s, si) => s.values.forEach((v, i) => {
      const x = L + slot * i + slot / 2 - (bw * series.length) / 2 + si * bw;
      const y0 = y(Math.max(0, v)), h = Math.abs(y(v) - y(0));
      g += `<rect x="${x}" y="${y0}" width="${bw - 1.5}" height="${Math.max(h, v ? 1 : 0)}" rx="2" fill="${s.color}"><title>${esc(s.name)} · ${esc(labels[i])}: ${brl(v)}</title></rect>`;
    }));
  } else {
    series.forEach(s => g += pathFor(s, labels, L, slot, y));
  }
  if (line) g += pathFor(line, labels, L, slot, y, true);
  const leg = series.concat(line ? [line] : []).map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="tchart" role="img">${g}</svg><div class="tlegend">${leg}</div>`;
}
function pathFor(s, labels, L, slot, y, dashed = false) {
  const pts = s.values.map((v, i) => [L + slot * i + slot / 2, y(v)]);
  let out = `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" ${dashed ? 'stroke-dasharray="5 4"' : ''}/>`;
  pts.forEach((p, i) => out += `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="${s.color}"><title>${esc(s.name)} · ${esc(labels[i])}: ${brl(s.values[i])}</title></circle>`);
  return out;
}

// Medidor semicircular (pago x falta)
export function gauge(frac, color = '#5B6B3A') {
  frac = Math.max(0, Math.min(1, frac || 0));
  const a = Math.PI * (1 - frac), R = 70, cx = 90, cy = 85;
  const x = cx + R * Math.cos(a), y = cy - R * Math.sin(a);
  return `<svg viewBox="0 0 180 100" class="gauge"><path d="M20 85 A70 70 0 0 1 160 85" class="g-bg"/>
    ${frac > 0 ? `<path d="M20 85 A70 70 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}" stroke="${color}" class="g-fg"/>` : ''}
    <text x="90" y="80" text-anchor="middle" class="g-t">${Math.round(frac * 100)}%</text></svg>`;
}
