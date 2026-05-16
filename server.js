/**
 * bar-app/server.js
 *
 * Servidor HTTP (Node puro, sem Express):
 * - Serve o front-end estático em /web (HTML/CSS/JS/imagens).
 * - Exponde APIs do sistema (estado, sincronização e integrações).
 *
 * Persistência do "estado do sistema":
 * - Preferencialmente no Supabase (tabela definida por SUPABASE_STATE_TABLE, chave id=APP_INSTANCE_ID).
 * - Fallback local em arquivo JSON (data/state.json) se Supabase não estiver configurado ou se a tabela não existir.
 *
 * Variáveis de ambiente importantes:
 * - PORT: porta do servidor.
 * - SUPABASE_URL: URL do projeto Supabase (ex.: https://xxxx.supabase.co).
 * - SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY: chave para acesso (service role ignora RLS; anon precisa de policies).
 * - SUPABASE_STATE_TABLE: nome da tabela que guarda o estado (default: app_state).
 * - APP_INSTANCE_ID: id lógico do "ambiente" dentro da tabela (default: default).
 * - SUPABASE_STORAGE_BUCKET: bucket usado no upload de imagens (default: uploads).
 *
 * Endpoints principais:
 * - GET  /api/state              -> lê estado (Supabase ou arquivo).
 * - POST /api/state              -> salva estado (Supabase ou arquivo), com detecção de conflito por rev.
 * - GET  /api/state/stream       -> SSE para avisar mudanças de rev/updatedAt.
 * - GET  /api/supabase/status    -> status/config do Supabase no servidor (sem expor chaves).
 * - GET  /api/supabase/cadastros -> exporta cadastros do Supabase para o app.
 * - POST /api/supabase/cadastros -> salva cadastros do app no Supabase.
 * - POST /api/upload-image       -> upload de imagem (Supabase Storage ou pasta local).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

let createSupabaseClient = null;
try {
  const supabase = require('@supabase/supabase-js');
  createSupabaseClient = supabase.createClient;
} catch (e) {
  createSupabaseClient = null;
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;
const WEB_DIR = path.join(__dirname, 'web');
const CORE_DIR = path.join(__dirname, 'core');
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const UPLOAD_DIR = path.join(WEB_DIR, 'assets', 'uploads');
const SUPABASE_STATE_TABLE = String(process.env.SUPABASE_STATE_TABLE || 'app_state').trim() || 'app_state';
const APP_INSTANCE_ID = String(process.env.APP_INSTANCE_ID || 'default').trim() || 'default';
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || 'uploads').trim() || 'uploads';
let _lastBackupKey = '';

function normalizeSupabaseUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.origin;
  } catch {
    return raw.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/g, '');
  }
}

function getSupabaseConfig() {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const key = serviceRoleKey || anonKey;
  const configured = !!(createSupabaseClient && url && key);
  return { configured, url, hasAnonKey: !!anonKey, hasServiceRoleKey: !!serviceRoleKey, key };
}

function getSupabaseClientOrNull() {
  const cfg = getSupabaseConfig();
  if (!cfg.configured) return null;
  return createSupabaseClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseBool(v, fallback = false) {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (!s) return fallback;
  if (['1', 'true', 't', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'f', 'no', 'n', 'off'].includes(s)) return false;
  return fallback;
}

function isSupabaseMissingRelation(err) {
  const msg = String(err?.message || err || '');
  return msg.toLowerCase().includes('does not exist') && msg.toLowerCase().includes('relation');
}

async function supabaseGetAppState(sb) {
  const { data, error } = await sb
    .from(SUPABASE_STATE_TABLE)
    .select('id,rev,updated_at,state')
    .eq('id', APP_INSTANCE_ID)
    .limit(1);
  if (error) throw error;
  const row = (data && data[0]) || null;
  if (!row) return { state: null, server: { rev: 0, updatedAt: 0 } };
  const rev = Number.isFinite(Number(row.rev)) ? Number(row.rev) : 0;
  const updatedAt = row.updated_at ? Date.parse(row.updated_at) : 0;
  return { state: row.state ?? null, server: { rev, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 } };
}

async function supabaseSaveAppState(sb, { state, ifRev, force }) {
  const nextState = state ?? null;
  const rev = Number.isFinite(Number(nextState?.sync?.rev)) ? Number(nextState.sync.rev) : 0;
  const updatedAt = Number.isFinite(Number(nextState?.sync?.updatedAt)) ? Number(nextState.sync.updatedAt) : Date.now();
  const row = {
    id: APP_INSTANCE_ID,
    rev,
    updated_at: new Date(updatedAt).toISOString(),
    state: nextState,
  };

  const ifRevNum = Number(ifRev);
  const hasIfRev = Number.isFinite(ifRevNum);
  const shouldForce = !!force || !hasIfRev;

  if (shouldForce) {
    const { error } = await sb.from(SUPABASE_STATE_TABLE).upsert(row, { onConflict: 'id' });
    if (error) throw error;
    return { ok: true, server: { rev, updatedAt } };
  }

  const { data: updatedRows, error: updErr } = await sb
    .from(SUPABASE_STATE_TABLE)
    .update(row)
    .eq('id', APP_INSTANCE_ID)
    .eq('rev', ifRevNum)
    .select('rev,updated_at');
  if (updErr) throw updErr;
  if (updatedRows && updatedRows.length) return { ok: true, server: { rev, updatedAt } };

  const current = await supabaseGetAppState(sb);
  if (!current?.state && (Number(current?.server?.rev) || 0) === 0) {
    const { error: insErr } = await sb.from(SUPABASE_STATE_TABLE).insert(row);
    if (insErr) throw insErr;
    return { ok: true, server: { rev, updatedAt } };
  }

  return { ok: false, conflict: true, server: current.server };
}

const _sseClients = new Set();
let _sseLast = { rev: -1, updatedAt: -1 };
let _sseTimer = null;
async function _readFileStateInfo() {
  ensureDirSync(DATA_DIR);
  if (!fs.existsSync(STATE_FILE)) return { rev: 0, updatedAt: 0 };
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const state = raw ? JSON.parse(raw) : null;
    const rev = Number.isFinite(Number(state?.sync?.rev)) ? Number(state.sync.rev) : 0;
    const updatedAt = Number.isFinite(Number(state?.sync?.updatedAt)) ? Number(state.sync.updatedAt) : 0;
    return { rev, updatedAt };
  } catch {
    return { rev: 0, updatedAt: 0 };
  }
}

async function _getServerInfoForStream() {
  const sb = getSupabaseClientOrNull();
  if (sb) {
    try {
      const { server } = await supabaseGetAppState(sb);
      return { rev: Number(server?.rev) || 0, updatedAt: Number(server?.updatedAt) || 0 };
    } catch {
      return _readFileStateInfo();
    }
  }
  return _readFileStateInfo();
}

function _broadcastServerInfo(server) {
  const payload = JSON.stringify({ server });
  for (const res of _sseClients) {
    try {
      res.write(`event: server\n`);
      res.write(`data: ${payload}\n\n`);
    } catch {}
  }
}

function _ensureSseTimer() {
  if (_sseTimer) return;
  _sseTimer = setInterval(async () => {
    const info = await _getServerInfoForStream();
    const rev = Number(info?.rev) || 0;
    const updatedAt = Number(info?.updatedAt) || 0;
    if (rev === _sseLast.rev && updatedAt === _sseLast.updatedAt) return;
    _sseLast = { rev, updatedAt };
    _broadcastServerInfo({ rev, updatedAt });
  }, 2000);
  _sseTimer.unref?.();
}

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  (Array.isArray(arr) ? arr : []).forEach(v => {
    const s = String(v || '').trim();
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  });
  return out;
}

function parseNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function randomToken(bytesLen = 16) {
  const len = Math.max(8, Number(bytesLen) || 16);
  try {
    return crypto.randomBytes(len).toString('hex');
  } catch {
    let out = '';
    for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    return out;
  }
}

async function supabaseSelectSingleRow(sb, table, columns) {
  const { data, error } = await sb.from(table).select(columns).limit(1);
  if (error) throw error;
  return (data && data[0]) || null;
}

async function supabaseGetCadastros(sb) {
  const { data: catRows, error: catErr } = await sb.from('categorias').select('id,nome,ativa');
  if (catErr) throw catErr;

  const { data: subRows, error: subErr } = await sb.from('subcategorias').select('id,app_id,nome,categoria_id');
  if (subErr) throw subErr;

  const { data: prodRows, error: prodErr } = await sb.from('produtos').select('id,app_id,nome,categoria_id,subcategoria_id,preco,estoque,estoque_minimo,imagem_url,ativo');
  if (prodErr) throw prodErr;

  const { data: userRows, error: userErr } = await sb.from('usuarios').select('id,app_id,nome,papel,senha_hash,desconto_pct_max,desconto_valor_max,ativo');
  if (userErr) throw userErr;

  const empRow = await supabaseSelectSingleRow(sb, 'empresa', 'id,nome,telefone,endereco,pix_copia_e_cola,mensagem_rodape,logo_url');

  const catById = new Map((catRows || []).map(c => [String(c.id), c]));
  const catIdByNameLower = new Map((catRows || []).map(c => [String(c.nome || '').toLowerCase(), String(c.id)]));

  const subOut = (subRows || [])
    .map(s => {
      const cat = catById.get(String(s.categoria_id));
      return { id: Number(s.app_id) || null, cat: cat?.nome || '', nome: s.nome || '' };
    })
    .filter(s => !!s.id && !!s.cat && !!s.nome);

  const subById = new Map(subOut.map(s => [String(s.id), s]));

  const prodOut = (prodRows || [])
    .map(p => {
      const cat = catById.get(String(p.categoria_id));
      const sub = p.subcategoria_id ? (subRows || []).find(s => String(s.id) === String(p.subcategoria_id)) : null;
      const subcatNome = sub ? String(sub.nome || '') : '';
      return {
        id: Number(p.app_id) || null,
        nome: p.nome || '',
        cat: cat?.nome || '',
        subcat: subcatNome || '',
        preco: parseNumber(p.preco, 0),
        estoque: parseInt(p.estoque, 10) || 0,
        estoqueMinimo: parseInt(p.estoque_minimo, 10) || 0,
        imagem: p.imagem_url || '',
        ativo: p.ativo !== false,
      };
    })
    .filter(p => !!p.id && !!p.nome && !!p.cat);

  const usersOut = (userRows || [])
    .map(u => ({
      id: Number(u.app_id) || null,
      nome: u.nome || '',
      papel: u.papel || 'garcom',
      senhaHash: u.senha_hash || null,
      descontoPctMax: parseNumber(u.desconto_pct_max, 0),
      descontoValorMax: parseNumber(u.desconto_valor_max, 0),
      ativo: u.ativo !== false,
    }))
    .filter(u => !!u.id && !!u.nome);

  const categorias = uniqStrings((catRows || []).filter(c => c.ativa !== false).map(c => c.nome));

  const empresa = empRow ? {
    nome: empRow.nome || '',
    telefone: empRow.telefone || '',
    endereco: empRow.endereco || '',
    pixCopiaECola: empRow.pix_copia_e_cola || '',
    mensagemRodape: empRow.mensagem_rodape || '',
    logoUrl: empRow.logo_url || '',
  } : null;

  const subcats = subOut.map(s => ({ id: s.id, cat: s.cat, nome: s.nome }));

  return { categorias, subcategorias: subcats, produtos: prodOut, usuarios: usersOut, empresa };
}

async function supabaseUpsertCadastros(sb, payload) {
  const snap = (payload && typeof payload === 'object') ? payload : {};
  const empresa = (snap.empresa && typeof snap.empresa === 'object') ? snap.empresa : null;
  const produtos = Array.isArray(snap.produtos) ? snap.produtos : [];
  const subcategorias = Array.isArray(snap.subcategorias) ? snap.subcategorias : [];
  const usuarios = Array.isArray(snap.usuarios) ? snap.usuarios : [];
  const categoriasInput = Array.isArray(snap.categorias) ? snap.categorias : [];

  const categoriasDerivadas = uniqStrings([
    ...categoriasInput,
    ...produtos.map(p => p?.cat),
    ...subcategorias.map(s => s?.cat),
  ]);

  if (categoriasDerivadas.length) {
    const { error } = await sb.from('categorias').upsert(
      categoriasDerivadas.map(nome => ({ nome, ativa: true })),
      { onConflict: 'nome' }
    );
    if (error) throw error;
  }

  const { data: catRows, error: catErr } = await sb.from('categorias').select('id,nome');
  if (catErr) throw catErr;
  const catIdByNameLower = new Map((catRows || []).map(c => [String(c.nome || '').toLowerCase(), String(c.id)]));

  const subUp = subcategorias
    .map(s => {
      const appId = parseInt(s?.id, 10);
      const nome = String(s?.nome || '').trim();
      const catNome = String(s?.cat || '').trim();
      const catId = catIdByNameLower.get(catNome.toLowerCase());
      if (!Number.isFinite(appId) || !nome || !catId) return null;
      return { app_id: appId, nome, categoria_id: catId };
    })
    .filter(Boolean);

  if (subUp.length) {
    const { error } = await sb.from('subcategorias').upsert(subUp, { onConflict: 'app_id' });
    if (error) throw error;
  }

  const { data: subRows, error: subErr } = await sb.from('subcategorias').select('id,app_id,nome,categoria_id');
  if (subErr) throw subErr;
  const subIdByKey = new Map();
  (subRows || []).forEach(s => {
    const k = `${String(s.categoria_id)}::${String(s.nome || '').toLowerCase()}`;
    subIdByKey.set(k, String(s.id));
  });

  const prodUp = produtos
    .map(p => {
      const appId = parseInt(p?.id, 10);
      const nome = String(p?.nome || '').trim();
      const catNome = String(p?.cat || '').trim();
      const catId = catIdByNameLower.get(catNome.toLowerCase());
      if (!Number.isFinite(appId) || !nome || !catId) return null;
      const subNome = String(p?.subcat || '').trim();
      const subKey = subNome ? `${catId}::${subNome.toLowerCase()}` : '';
      const subId = subKey ? (subIdByKey.get(subKey) || null) : null;
      return {
        app_id: appId,
        nome,
        categoria_id: catId,
        subcategoria_id: subId,
        preco: parseNumber(p?.preco, 0),
        estoque: parseInt(p?.estoque, 10) || 0,
        estoque_minimo: parseInt(p?.estoqueMinimo, 10) || 0,
        imagem_url: String(p?.imagem || '').trim() || null,
        ativo: p?.ativo !== false,
      };
    })
    .filter(Boolean);

  if (prodUp.length) {
    const { error } = await sb.from('produtos').upsert(prodUp, { onConflict: 'app_id' });
    if (error) throw error;
  }

  const userUp = usuarios
    .map(u => {
      const appId = parseInt(u?.id, 10);
      const nome = String(u?.nome || '').trim();
      const papel = String(u?.papel || '').trim() || 'garcom';
      if (!Number.isFinite(appId) || !nome) return null;
      return {
        app_id: appId,
        nome,
        papel,
        senha_hash: u?.senhaHash || null,
        desconto_pct_max: parseNumber(u?.descontoPctMax, 0),
        desconto_valor_max: parseNumber(u?.descontoValorMax, 0),
        ativo: u?.ativo !== false,
      };
    })
    .filter(Boolean);

  if (userUp.length) {
    const { error } = await sb.from('usuarios').upsert(userUp, { onConflict: 'app_id' });
    if (error) throw error;
  }

  if (empresa) {
    const row = {
      nome: String(empresa?.nome || '').trim() || 'ESPETINHO 075',
      telefone: String(empresa?.telefone || '').trim() || null,
      endereco: String(empresa?.endereco || '').trim() || null,
      pix_copia_e_cola: String(empresa?.pixCopiaECola || '').trim() || null,
      mensagem_rodape: String(empresa?.mensagemRodape || '').trim() || null,
      logo_url: String(empresa?.logoUrl || '').trim() || null,
      updated_at: new Date().toISOString(),
    };
    const existing = await supabaseSelectSingleRow(sb, 'empresa', 'id');
    if (existing?.id) {
      const { error } = await sb.from('empresa').update(row).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('empresa').insert(row);
      if (error) throw error;
    }
  }
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function maybeAutoBackupState(sb, state) {
  if (!parseBool(process.env.APP_AUTO_BACKUP, true)) return;
  const rev = Number.isFinite(Number(state?.sync?.rev)) ? Number(state.sync.rev) : 0;
  const ts = Number.isFinite(Number(state?.sync?.updatedAt)) ? Number(state.sync.updatedAt) : Date.now();
  const day = new Date(ts).toISOString().slice(0, 10);
  const key = `${APP_INSTANCE_ID}:${day}`;
  if (_lastBackupKey === key) return;
  _lastBackupKey = key;

  const filename = `state_${APP_INSTANCE_ID}_${day}_rev${rev}.json`;
  const payload = JSON.stringify({ meta: { appInstanceId: APP_INSTANCE_ID, day, rev, ts }, state: state ?? null });

  try {
    ensureDirSync(BACKUP_DIR);
    fs.writeFileSync(path.join(BACKUP_DIR, filename), payload, 'utf8');
  } catch {}

  if (sb && parseBool(process.env.SUPABASE_USE_STORAGE, true)) {
    try {
      const objectPath = `backups/${APP_INSTANCE_ID}/${filename}`;
      await sb.storage.from(SUPABASE_STORAGE_BUCKET).upload(objectPath, Buffer.from(payload, 'utf8'), {
        contentType: 'application/json',
        upsert: true,
      });
    } catch {}
  }
}

function sendJson(res, status, obj) {
  if (res.writableEnded || res.headersSent) return;
  const payload = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 25 * 1024 * 1024) reject(new Error('Payload muito grande.'));
    });
    req.on('end', () => {
      if (!data) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', err => reject(err));
  });
}

function safePathJoin(baseDir, urlPath) {
  const safe = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.join(baseDir, safe);
  if (!full.startsWith(baseDir)) return null;
  return full;
}

function readFileState() {
  ensureDirSync(DATA_DIR);
  if (!fs.existsSync(STATE_FILE)) return { state: null, server: { rev: 0, updatedAt: 0 } };
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const state = raw ? JSON.parse(raw) : null;
    const rev = Number.isFinite(Number(state?.sync?.rev)) ? Number(state.sync.rev) : 0;
    const updatedAt = Number.isFinite(Number(state?.sync?.updatedAt)) ? Number(state.sync.updatedAt) : 0;
    return { state, server: { rev, updatedAt } };
  } catch {
    return { state: null, server: { rev: 0, updatedAt: 0 } };
  }
}

function writeFileState({ state, ifRev, force }) {
  ensureDirSync(DATA_DIR);
  const current = readFileState();
  const currentRev = Number(current?.server?.rev) || 0;
  const currentUpdatedAt = Number(current?.server?.updatedAt) || 0;
  if (!force && Number.isFinite(Number(ifRev)) && current?.state && currentRev !== Number(ifRev)) {
    return { ok: false, conflict: true, server: { rev: currentRev, updatedAt: currentUpdatedAt } };
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state ?? null), 'utf8');
  const rev = Number.isFinite(Number(state?.sync?.rev)) ? Number(state.sync.rev) : 0;
  const updatedAt = Number.isFinite(Number(state?.sync?.updatedAt)) ? Number(state.sync.updatedAt) : Date.now();
  return { ok: true, server: { rev, updatedAt } };
}

async function loadStateAny() {
  const sb = getSupabaseClientOrNull();
  if (sb) {
    try {
      const out = await supabaseGetAppState(sb);
      return { backend: 'supabase', sb, ...out };
    } catch (err) {
      if (!isSupabaseMissingRelation(err)) throw err;
      const out = readFileState();
      return { backend: 'file', sb: null, ...out };
    }
  }
  const out = readFileState();
  return { backend: 'file', sb: null, ...out };
}

async function saveStateAny(ctx, { state, ifRev, force }) {
  if (ctx?.backend === 'supabase' && ctx?.sb) {
    const out = await supabaseSaveAppState(ctx.sb, { state, ifRev, force });
    return out;
  }
  return writeFileState({ state, ifRev, force });
}

function setorPorCategoria(cat) {
  const c = String(cat || '');
  if (c === 'Petisco') return 'churrasco';
  if (c === 'Prato' || c === 'Sobremesa') return 'cozinha';
  return 'bar';
}

function applyClientOrderToState(state, { mesaId, itens, origemLabel }) {
  const s = state && typeof state === 'object' ? state : null;
  if (!s) throw new Error('Estado não inicializado.');
  if (!s.mesas || typeof s.mesas !== 'object') throw new Error('Estado inválido (mesas).');
  if (!Array.isArray(s.produtos)) throw new Error('Estado inválido (produtos).');
  if (!Array.isArray(s.filaProducao)) s.filaProducao = [];
  if (!Array.isArray(s.estoqueMov)) s.estoqueMov = [];
  if (!Array.isArray(s.auditoria)) s.auditoria = [];
  if (!s.sync || typeof s.sync !== 'object') s.sync = { rev: 0, updatedAt: 0, updatedBy: null };

  const idMesa = Number(mesaId) || 0;
  const mesa = s.mesas[idMesa];
  if (!mesa) throw new Error('Mesa não encontrada.');

  const itensNorm = (Array.isArray(itens) ? itens : [])
    .map(it => ({ produtoId: Number(it?.produtoId) || 0, qty: Number(it?.qty) || 0 }))
    .filter(it => it.produtoId > 0 && it.qty > 0)
    .map(it => ({ ...it, qty: Math.min(50, Math.floor(it.qty)) }))
    .filter(it => it.qty > 0);
  if (!itensNorm.length) throw new Error('Itens inválidos.');

  const prodById = new Map((s.produtos || []).map(p => [Number(p?.id) || 0, p]).filter(([k]) => !!k));
  const erros = [];
  for (const it of itensNorm) {
    const p = prodById.get(it.produtoId);
    if (!p) { erros.push(`Produto ${it.produtoId} não encontrado.`); continue; }
    if (!s.permitirVendaSemEstoque && Number(p.estoque) < it.qty) erros.push(`"${p.nome}" sem estoque suficiente.`);
  }
  if (erros.length) throw new Error(erros.join(' '));

  if (mesa.status === 'livre') mesa.status = 'ocupada';
  if (!Array.isArray(mesa.itens)) mesa.itens = [];

  const ts = Date.now();
  const prevRev = Number.isFinite(Number(s.sync?.rev)) ? Number(s.sync.rev) : 0;
  s.sync = {
    rev: prevRev + 1,
    updatedAt: ts,
    updatedBy: { id: null, nome: 'Cliente', papel: 'cliente' },
  };
  s.auditoria.unshift({
    ts,
    data: new Date(ts).toISOString().slice(0, 10),
    hora: new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    userId: null,
    userNome: 'Cliente',
    userPapel: 'cliente',
    tipo: 'client.order',
    meta: { mesaId: idMesa, itens: itensNorm.map(x => ({ ...x })), origem: origemLabel || '' },
  });
  if (s.auditoria.length > 1000) s.auditoria.length = 1000;

  for (const it of itensNorm) {
    const p = prodById.get(it.produtoId);
    if (!p) continue;
    const itemMesa = (mesa.itens || []).find(x => Number(x?.id) === Number(p.id));
    if (itemMesa) itemMesa.qty = (Number(itemMesa.qty) || 0) + it.qty;
    else mesa.itens.push({ id: p.id, nome: p.nome, preco: p.preco, qty: it.qty });
    p.estoque = Number(p.estoque) - it.qty;

    const movTs = ts;
    const after = Number.isFinite(Number(p?.estoque)) ? Number(p.estoque) : null;
    const before = Number.isFinite(Number(after)) ? after + it.qty : null;
    s.estoqueMov.unshift({
      ts: movTs,
      data: new Date(movTs).toISOString().slice(0, 10),
      hora: new Date(movTs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      userId: null,
      userNome: 'Cliente',
      userPapel: 'cliente',
      produtoId: Number(p.id) || null,
      produtoNome: p.nome || null,
      categoria: p.cat || null,
      delta: -Math.abs(Number(it.qty) || 0),
      before,
      after,
      motivo: 'venda',
      origem: 'cliente',
      mesaId: idMesa,
    });

    s.filaProducao.push({
      id: Date.now() + Math.random(),
      mesaId: idMesa,
      produtoId: p.id,
      nome: p.nome,
      qty: it.qty,
      setor: setorPorCategoria(p.cat),
      status: 'pendente',
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      origem: origemLabel || 'Online',
    });
  }

  if (s.estoqueMov.length > 5000) s.estoqueMov.length = 5000;
  return s;
}

function criarMesaOnlineNoEstado(state) {
  const s = state && typeof state === 'object' ? state : null;
  if (!s) throw new Error('Estado não inicializado.');
  if (!s.mesas || typeof s.mesas !== 'object') s.mesas = {};
  const ids = Object.keys(s.mesas).map(Number).filter(n => Number.isFinite(n) && n > 0);
  const novoId = ids.length ? Math.max(...ids) + 1 : 1;
  s.mesas[novoId] = { id: novoId, itens: [], status: 'livre', tipo: 'online', credito: 0, aplicarTaxa: false, token: randomToken(12) };
  return { mesaId: novoId, token: String(s.mesas[novoId].token || '') };
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
  const url = parsedUrl.pathname || '/';

  if (url === '/api/state/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('\n');
    _sseClients.add(res);
    _ensureSseTimer();
    _getServerInfoForStream()
      .then(info => {
        const rev = Number(info?.rev) || 0;
        const updatedAt = Number(info?.updatedAt) || 0;
        res.write(`event: server\n`);
        res.write(`data: ${JSON.stringify({ server: { rev, updatedAt } })}\n\n`);
      })
      .catch(() => {});
    req.on('close', () => {
      _sseClients.delete(res);
      try { res.end(); } catch {}
    });
    return;
  }

  if (url === '/api/supabase/status') {
    const cfg = getSupabaseConfig();
    const useSupabaseState = !!getSupabaseClientOrNull();
    return sendJson(res, 200, {
      configured: cfg.configured,
      url: cfg.url || null,
      hasAnonKey: cfg.hasAnonKey,
      hasServiceRoleKey: cfg.hasServiceRoleKey,
      stateBackend: useSupabaseState ? 'supabase' : 'file',
      stateTable: useSupabaseState ? SUPABASE_STATE_TABLE : null,
      appInstanceId: useSupabaseState ? APP_INSTANCE_ID : null,
    });
  }

  if (url === '/api/supabase/cadastros') {
    const sb = getSupabaseClientOrNull();
    if (!sb) return sendJson(res, 400, { error: 'Supabase não configurado no servidor. Defina SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE_KEY).' });

    if (req.method === 'GET') {
      supabaseGetCadastros(sb)
        .then(data => sendJson(res, 200, { ok: true, data }))
        .catch(err => sendJson(res, 500, { error: err.message || String(err) }));
      return;
    }

    if (req.method === 'POST') {
      readJsonBody(req)
        .then(body => supabaseUpsertCadastros(sb, body?.data || body?.snapshot || body?.state || body || {}))
        .then(() => sendJson(res, 200, { ok: true }))
        .catch(err => sendJson(res, 500, { error: err.message || String(err) }));
      return;
    }

    return sendJson(res, 405, { error: 'Método não permitido.' });
  }

  if (url === '/api/client/menu') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Método não permitido.' });
    loadStateAny()
      .then(ctx => {
        const st = ctx?.state || null;
        if (!st) return sendJson(res, 200, { ok: true, data: { empresa: null, categorias: [], produtos: [] } });
        const permitir = !!st.permitirVendaSemEstoque;
        const produtos = (Array.isArray(st.produtos) ? st.produtos : [])
          .map(p => ({
            id: Number(p?.id) || 0,
            nome: String(p?.nome || ''),
            cat: String(p?.cat || ''),
            subcat: String(p?.subcat || ''),
            preco: Number(p?.preco) || 0,
            imagem: String(p?.imagem || ''),
            disponivel: permitir ? true : (Number(p?.estoque) > 0),
          }))
          .filter(p => p.id > 0 && p.nome);
        const categorias = Array.isArray(st.categorias) ? st.categorias.map(x => String(x || '')).filter(Boolean) : [];
        const empresa = st.empresa ? {
          nome: String(st.empresa?.nome || ''),
          telefone: String(st.empresa?.telefone || ''),
          endereco: String(st.empresa?.endereco || ''),
          logoUrl: String(st.empresa?.logoUrl || ''),
        } : null;
        return sendJson(res, 200, { ok: true, data: { empresa, categorias, produtos } });
      })
      .catch(err => sendJson(res, 500, { error: err.message || String(err) }));
    return;
  }

  if (url === '/api/client/order') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido.' });
    readJsonBody(req)
      .then(async body => {
        let mesaId = Number(body?.mesaId) || 0;
        const token = String(body?.token || '').trim();
        const itens = Array.isArray(body?.itens) ? body.itens : [];

        const tries = 3;
        for (let attempt = 0; attempt < tries; attempt++) {
          const ctx = await loadStateAny();
          const st = ctx?.state || null;
          if (!st) return sendJson(res, 400, { error: 'Sistema ainda não foi inicializado.' });
          let outOnline = null;
          if (mesaId > 0) {
            const mesa = st?.mesas?.[mesaId];
            if (!mesa) return sendJson(res, 404, { error: 'Mesa não encontrada.' });
            const mesaToken = String(mesa?.token || '').trim();
            if (!mesaToken) return sendJson(res, 400, { error: 'Mesa sem token. Gere o QR Code novamente.' });
            if (!token || token !== mesaToken) return sendJson(res, 401, { error: 'Token inválido.' });
          } else {
            try {
              outOnline = criarMesaOnlineNoEstado(st);
              mesaId = outOnline.mesaId;
            } catch (e) {
              return sendJson(res, 400, { error: e.message || String(e) });
            }
          }

          let nextState;
          try {
            nextState = applyClientOrderToState(st, { mesaId, itens, origemLabel: mesaId > 0 && !outOnline ? 'Mesa' : 'Online' });
          } catch (e) {
            return sendJson(res, 400, { error: e.message || String(e) });
          }

          try {
            const out = await saveStateAny(ctx, { state: nextState, ifRev: ctx?.server?.rev, force: false });
            if (out?.conflict) continue;
            const serverInfo = out?.server || { rev: Number(nextState?.sync?.rev) || 0, updatedAt: Number(nextState?.sync?.updatedAt) || Date.now() };
            _sseLast = { rev: Number(serverInfo?.rev) || 0, updatedAt: Number(serverInfo?.updatedAt) || 0 };
            _broadcastServerInfo(_sseLast);
            maybeAutoBackupState(ctx?.sb || null, nextState);
            return sendJson(res, 200, { ok: true, server: serverInfo, mesaId, token: outOnline?.token || null });
          } catch (err) {
            return sendJson(res, 500, { error: err.message || String(err) });
          }
        }
        return sendJson(res, 409, { error: 'CONFLICT' });
      })
      .catch(err => sendJson(res, 400, { error: err.message || String(err) }));
    return;
  }

  if (url.startsWith('/api/state')) {
    if (req.method === 'GET') {
      const sb = getSupabaseClientOrNull();
      if (sb) {
        supabaseGetAppState(sb)
          .then(out => sendJson(res, 200, out))
          .catch(err => {
            if (isSupabaseMissingRelation(err)) return '__FALLBACK__';
            sendJson(res, 500, { error: err.message || String(err) });
            return '__STOP__';
          })
          .then(v => {
            if (v !== '__FALLBACK__') return;
            ensureDirSync(DATA_DIR);
                const out = readFileState();
                return sendJson(res, 200, out);
          });
        return;
      }
      const out = readFileState();
      return sendJson(res, 200, out);
    }

    if (req.method === 'POST') {
      readJsonBody(req)
        .then(body => {
          const state = body?.state ?? null;
          const force = !!body?.force;
          const ifRev = body?.ifRev;

          const sb = getSupabaseClientOrNull();
          if (sb) {
            supabaseSaveAppState(sb, { state, ifRev, force })
              .then(out => {
                if (out.conflict) return sendJson(res, 409, { error: 'CONFLICT', server: out.server });
                _sseLast = { rev: Number(out?.server?.rev) || 0, updatedAt: Number(out?.server?.updatedAt) || 0 };
                _broadcastServerInfo(_sseLast);
                maybeAutoBackupState(sb, state);
                return sendJson(res, 200, { ok: true, server: out.server });
              })
              .catch(err => {
                if (isSupabaseMissingRelation(err)) return '__FALLBACK__';
                sendJson(res, 400, { error: err.message || String(err) });
                return '__STOP__';
              })
              .then(v => {
                if (v !== '__FALLBACK__') return;
                ensureDirSync(DATA_DIR);
                const out = writeFileState({ state, ifRev, force });
                if (out?.conflict) return sendJson(res, 409, { error: 'CONFLICT', server: out.server });
                _sseLast = { rev: Number(out?.server?.rev) || 0, updatedAt: Number(out?.server?.updatedAt) || 0 };
                _broadcastServerInfo(_sseLast);
                maybeAutoBackupState(null, state);
                return sendJson(res, 200, { ok: true, server: out.server });
              });
            return;
          }

          const out = writeFileState({ state, ifRev, force });
          if (out?.conflict) return sendJson(res, 409, { error: 'CONFLICT', server: out.server });
          _sseLast = { rev: Number(out?.server?.rev) || 0, updatedAt: Number(out?.server?.updatedAt) || 0 };
          _broadcastServerInfo(_sseLast);
          maybeAutoBackupState(null, state);
          sendJson(res, 200, { ok: true, server: out.server });
        })
        .catch(err => sendJson(res, 400, { error: err.message }));
      return;
    }

    return sendJson(res, 405, { error: 'Método não permitido.' });
  }

  if (url.startsWith('/api/upload-image')) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Método não permitido.' });

    readJsonBody(req)
      .then(async body => {
        const dataUrl = String(body?.dataUrl || '');
        const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!match) return sendJson(res, 400, { error: 'dataUrl inválido.' });
        const mime = match[1].toLowerCase();
        const b64 = match[2];

        const ext = mime.includes('png') ? 'png'
          : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg'
          : mime.includes('webp') ? 'webp'
          : mime.includes('gif') ? 'gif'
          : 'png';

        const safeName = String(body?.filename || 'imagem')
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60) || 'imagem';

        const filename = `${Date.now()}-${Math.floor(Math.random() * 1e9)}-${safeName}.${ext}`;
        const buffer = Buffer.from(b64, 'base64');

        const sb = getSupabaseClientOrNull();
        if (sb && parseBool(process.env.SUPABASE_USE_STORAGE, true)) {
          const objectPath = `produtos/${filename}`;
          const { error: upErr } = await sb.storage
            .from(SUPABASE_STORAGE_BUCKET)
            .upload(objectPath, buffer, { contentType: mime, upsert: false });
          if (!upErr) {
            const pub = sb.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(objectPath);
            const publicUrl = pub?.data?.publicUrl || '';
            if (publicUrl) return sendJson(res, 200, { url: publicUrl });
            const signed = await sb.storage.from(SUPABASE_STORAGE_BUCKET).createSignedUrl(objectPath, 60 * 60);
            const signedUrl = signed?.data?.signedUrl || '';
            if (signedUrl) return sendJson(res, 200, { url: signedUrl });
            return sendJson(res, 200, { url: objectPath });
          }
        }

        ensureDirSync(UPLOAD_DIR);
        const filePath = path.join(UPLOAD_DIR, filename);
        fs.writeFileSync(filePath, buffer);
        return sendJson(res, 200, { url: `/assets/uploads/${filename}` });
      })
      .catch(err => sendJson(res, 400, { error: err.message }));
    return;
  }

  let filePath;

  if (url.startsWith('/core/')) {
    filePath = safePathJoin(CORE_DIR, url.replace('/core/', ''));
  } else {
    const rel = url === '/' ? 'index.html' : url.replace(/^\//, '');
    filePath = safePathJoin(WEB_DIR, rel);
  }
  if (!filePath) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  const extname = path.extname(filePath);
  let contentType = 'text/html';
  switch (extname) {
    case '.js': contentType = 'text/javascript'; break;
    case '.css': contentType = 'text/css'; break;
    case '.json': contentType = 'application/json'; break;
    case '.png': contentType = 'image/png'; break;
    case '.jpg': contentType = 'image/jpeg'; break;
    case '.jpeg': contentType = 'image/jpeg'; break;
    case '.webp': contentType = 'image/webp'; break;
    case '.gif': contentType = 'image/gif'; break;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + error.code);
      }
    } else {
      const cacheControl = (extname === '.png' || extname === '.jpg' || extname === '.jpeg' || extname === '.webp' || extname === '.gif')
        ? 'public, max-age=86400'
        : 'no-store';
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  Object.values(nets).forEach(list => {
    (list || []).forEach(addr => {
      if (addr && addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    });
  });

  console.log(`Server running at:`);
  console.log(`- http://localhost:${PORT}/`);
  ips.forEach(ip => console.log(`- http://${ip}:${PORT}/`));
});
