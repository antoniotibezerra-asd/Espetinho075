/**
 * bar-app/core/utils.js
 * Funções utilitárias compartilhadas entre web e app.
 */

/**
 * Formata um número como moeda brasileira.
 * Ex: 12.5 → "R$ 12,50"
 */
export function formatBRL(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Hora atual formatada como "HH:MM".
 */
export function horaAtual() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Agrupa um array de objetos por uma chave.
 * Ex: agruparPor(produtos, 'cat') → { Bebida: [...], Petisco: [...] }
 */
export function agruparPor(arr, chave) {
  return arr.reduce((acc, item) => {
    const k = item[chave];
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}

/**
 * Retorna o nível de estoque: 'ok' | 'baixo' | 'critico'
 */
export function nivelEstoque(qtd, minimo = 3) {
  const q = Number(qtd);
  const m = Number(minimo);
  const min = Number.isFinite(m) ? Math.max(0, m) : 3;
  const limiteBaixo = Math.max(10, min + 7);
  if (q > limiteBaixo) return 'ok';
  if (q > min) return 'baixo';
  return 'critico';
}

/**
 * Calcula o total de itens (soma das quantidades) em uma comanda.
 */
export function totalItens(itens) {
  return itens.reduce((s, it) => s + it.qty, 0);
}

export function dataISO(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function diffSyncSnapshot(localSnap, remoteSnap) {
  const ls = localSnap && typeof localSnap === 'object' ? localSnap : {};
  const rs = remoteSnap && typeof remoteSnap === 'object' ? remoteSnap : {};

  const byId = (arr) => {
    const m = new Map();
    (Array.isArray(arr) ? arr : []).forEach(x => {
      if (x && (x.id !== undefined && x.id !== null)) m.set(String(x.id), x);
    });
    return m;
  };
  const stable = (obj) => JSON.stringify(obj ?? null);
  const diffMap = (aArr, bArr, pick) => {
    const a = byId(aArr);
    const b = byId(bArr);
    const ids = new Set([...a.keys(), ...b.keys()]);
    let added = 0, removed = 0, changed = 0, same = 0;
    ids.forEach(id => {
      const av = a.get(id);
      const bv = b.get(id);
      if (!av && bv) { added += 1; return; }
      if (av && !bv) { removed += 1; return; }
      const aj = stable(pick(av));
      const bj = stable(pick(bv));
      if (aj === bj) same += 1;
      else changed += 1;
    });
    return { totalA: a.size, totalB: b.size, added, removed, changed, same };
  };

  const produtos = diffMap(ls.produtos, rs.produtos, (p) => ({
    id: p.id, nome: p.nome, cat: p.cat, subcat: p.subcat, preco: p.preco, estoque: p.estoque, estoqueMinimo: p.estoqueMinimo, imagem: p.imagem,
  }));
  const usuarios = diffMap(ls.usuarios, rs.usuarios, (u) => ({
    id: u.id,
    nome: u.nome,
    papel: u.papel,
    senhaHash: u.senhaHash ? '1' : '',
    descontoPctMax: u.descontoPctMax,
    descontoValorMax: u.descontoValorMax,
  }));

  const perfisDiff = stable(ls.perfis) === stable(rs.perfis) ? 0 : 1;
  const empresaDiff = stable(ls.empresa) === stable(rs.empresa) ? 0 : 1;
  const configDiff = stable({
    permitirVendaSemEstoque: !!ls.permitirVendaSemEstoque,
    categorias: ls.categorias || [],
    aparencia: ls.aparencia || {},
    impressao: ls.impressao || {},
    formasPagamento: ls.formasPagamento || [],
    subcategorias: ls.subcategorias || [],
  }) === stable({
    permitirVendaSemEstoque: !!rs.permitirVendaSemEstoque,
    categorias: rs.categorias || [],
    aparencia: rs.aparencia || {},
    impressao: rs.impressao || {},
    formasPagamento: rs.formasPagamento || [],
    subcategorias: rs.subcategorias || [],
  }) ? 0 : 1;

  const summary = [];
  const push = (label, d) => {
    if ((d.added || 0) + (d.removed || 0) + (d.changed || 0) === 0) return;
    summary.push(`${label}: +${d.added || 0} / -${d.removed || 0} / ~${d.changed || 0}`);
  };
  push('Produtos', produtos);
  push('Usuários', usuarios);
  if (perfisDiff) summary.push('Perfis: alterações');
  if (empresaDiff) summary.push('Empresa: alterações');
  if (configDiff) summary.push('Config: alterações');

  return {
    produtos,
    usuarios,
    perfisDiff,
    empresaDiff,
    configDiff,
    summary,
  };
}

function _rotr(n, x) {
  return (x >>> n) | (x << (32 - n));
}

function _toHex32(x) {
  return (x >>> 0).toString(16).padStart(8, '0');
}

export function sha256Hex(input) {
  const msg = String(input ?? '');
  const bytes = [];
  for (let i = 0; i < msg.length; i++) {
    const c = msg.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0xd800 || c >= 0xe000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else {
      i++;
      const c2 = msg.charCodeAt(i);
      const u = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      bytes.push(0xf0 | (u >> 18), 0x80 | ((u >> 12) & 0x3f), 0x80 | ((u >> 6) & 0x3f), 0x80 | (u & 0x3f));
    }
  }

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);

  for (let i = 7; i >= 0; i--) {
    bytes.push((bitLen >>> (i * 8)) & 0xff);
  }

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Array(64);

  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4;
      w[t] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | (bytes[j + 3])) >>> 0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = (_rotr(7, w[t - 15]) ^ _rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3)) >>> 0;
      const s1 = (_rotr(17, w[t - 2]) ^ _rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = (_rotr(6, e) ^ _rotr(11, e) ^ _rotr(25, e)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = (_rotr(2, a) ^ _rotr(13, a) ^ _rotr(22, a)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return _toHex32(h0) + _toHex32(h1) + _toHex32(h2) + _toHex32(h3) + _toHex32(h4) + _toHex32(h5) + _toHex32(h6) + _toHex32(h7);
}

export function randomToken(bytesLen = 16) {
  const len = Math.max(8, Number(bytesLen) || 16);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  }
  return out;
}
