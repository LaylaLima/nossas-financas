// Leitor mínimo de .xlsx (sem bibliotecas externas): abre o zip e lê células, valores e se têm fórmula.
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

async function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Arquivo não parece ser um .xlsx');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {}, td = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const loff = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
    files[name] = { method, csize, loff };
    p += 46 + nlen + xlen + clen;
  }
  return {
    names: Object.keys(files),
    async text(name) {
      const f = files[name]; if (!f) return null;
      const start = f.loff + 30 + dv.getUint16(f.loff + 26, true) + dv.getUint16(f.loff + 28, true);
      const raw = u8.subarray(start, start + f.csize);
      return td.decode(f.method === 0 ? raw : await inflate(raw));
    }
  };
}

const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, tag) => [...el.getElementsByTagName(tag)];

export function colToNum(c) { let n = 0; for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
export function numToCol(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// Retorna { [nomeDaAba]: { "B6": {v, f} } }
export async function readXlsx(buf) {
  const z = await unzip(buf);
  const shared = [];
  const ss = await z.text('xl/sharedStrings.xml');
  if (ss) kids(xml(ss), 'si').forEach(si => shared.push(kids(si, 't').map(t => t.textContent).join('')));
  const wb = xml(await z.text('xl/workbook.xml'));
  const rels = xml(await z.text('xl/_rels/workbook.xml.rels'));
  const relMap = {};
  kids(rels, 'Relationship').forEach(r => relMap[r.getAttribute('Id')] = r.getAttribute('Target'));
  const out = {};
  for (const sh of kids(wb, 'sheet')) {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = relMap[rid]; if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const s = await z.text(target); if (!s) continue;
    const cells = {};
    kids(xml(s), 'c').forEach(c => {
      const t = c.getAttribute('t'), vEl = kids(c, 'v')[0], fEl = kids(c, 'f')[0];
      let v = vEl ? vEl.textContent : null;
      if (t === 's' && v != null) v = shared[Number(v)];
      else if (t === 'inlineStr') v = kids(c, 't').map(x => x.textContent).join('');
      else if (t === 'b') v = v === '1';
      else if (t !== 'str' && t !== 'e' && v != null && v !== '') v = Number(v);
      cells[c.getAttribute('r')] = { v, f: !!fEl };
    });
    out[sh.getAttribute('name')] = cells;
  }
  return out;
}
