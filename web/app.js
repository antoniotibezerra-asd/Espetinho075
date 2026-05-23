/**
 * bar-app/web/app.js
 * Controlador web: conecta o store ao DOM.
 */

import { criarStore } from '../core/store.js';
import { formatBRL, agruparPor, nivelEstoque, totalItens, diffSyncSnapshot } from '../core/utils.js';

// ─── Inicialização ────────────────────────────────────────────────────────────

const store = criarStore();
// Controle de edição na aba "Cadastros"
let editandoId = null; // id do produto sendo editado (cadastros -> produtos)
let editandoUsuarioId = null; // id do usuário sendo editado (parâmetros -> usuários)
const _urlParams = new URLSearchParams(window.location.search || '');
const _isClienteMode = (_urlParams.get('cliente') === '1');

// Listas temporárias filtradas (usadas para exportação/visão)
let fechadosFiltrados = []; // cache do modal "Pedidos fechados" com filtros aplicados
let auditoriaFiltrada = []; // cache de auditoria filtrada (parâmetros -> auditoria)

// Sincronização com o servidor (/api/state)
let carregadoDoServidor = false; // liga o auto-save somente após o primeiro carregamento
let _serverInfo = { rev: 0, updatedAt: 0 }; // revisão/timestamp do último estado conhecido do servidor
let _conflitoNotificado = false; // evita alert repetido quando há conflito de rev
let _remoteCache = { state: null, server: { rev: 0, updatedAt: 0 } }; // cache do último /api/state

// Integração com Supabase (status e cadastros)
let _supabaseInfo = null; // resposta do GET /api/supabase/status
let _supabaseInfoTs = 0; // último momento (ms) que consultamos o status

// Stream de notificações (SSE) para avisar quando o servidor mudou rev/updatedAt
let _stateStream = null;
let _stateStreamTs = 0;

// Preferências do seletor rápido de produtos no mobile (persistidas no localStorage por usuário)
let _mobileProdCat = '';
let _mobileProdQuery = '';
let _mobileProdMode = 'all';
let _activeUserIdCache = 0;

// Indicadores de salvamento (feedback visual)
let _pendingSave = false; // houve mudança local ainda não confirmada pelo servidor
let _lastSavedAt = 0; // timestamp do último save OK
let _lastSaveError = ''; // última mensagem de erro recebida ao salvar

// Dashboard (relatórios): debounce do resize para redesenhar gráficos
let _relChartResizeTimer = null;

// Reage a qualquer mudança de estado
store.subscribe(render);

// Navegação por abas
document.getElementById('nav').addEventListener('click', e => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  const tab = btn.dataset.tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
});

// Expõe ações ao HTML inline (onclick=)
window.app = {
  selecionarMesa(n)    { store.selecionarMesa(n); },
  addItem()            { _addItem(); },
  addItemById(id)      { _addItemById(id); },
  setMobileProdCat(cat) {
    _mobileProdCat = String(cat || '').trim();
    _persistMobileProdPrefs();
    _applyMobileProdFilters();
  },
  setMobileProdQuery(q) {
    _mobileProdQuery = String(q || '');
    _persistMobileProdPrefs();
    _applyMobileProdFilters();
  },
  setMobileProdMode(m) {
    _mobileProdMode = (m === 'fav' || m === 'recent') ? m : 'all';
    _persistMobileProdPrefs();
    renderComanda(store.getState());
  },
  toggleFav(id) {
    try { store.toggleFavoritoProduto(id); } catch (e) { alert(e.message); }
    renderComanda(store.getState());
  },
  aplicarFiltroRelatorios() { renderRelatorios(store.getState()); },
  changeQty(id, delta) { _changeQty(id, delta); },
  removeItem(id)       { _removeItem(id); },
  fecharMesaModal()    { _abrirModalFechar(); },
  confirmarFechamento(){ _confirmarFechamento(); },
  abrirPedidosFechados(){ _abrirModalPedidosFechados(); },
  fecharPedidosFechados(){ document.getElementById('modal-fechados').style.display = 'none'; },
  imprimirPedidoFechado(idx){ _imprimirReciboHistorico(idx); },
  aplicarFiltroFechados(){ renderPedidosFechados(store.getState()); },
  exportarFechadosFiltrado(){ _exportarFechadosFiltrado(); },
  addProduto()         { _addProduto(); },
  uploadImagemProduto(){ _uploadImagemProduto(); },
  addCategoria()       { _addCategoria(); },
  removeCategoria(nome){ try { store.removerCategoria(nome); } catch (e) { alert(e.message); } },
  addSubcategoria()    { _addSubcategoria(); },
  removeSubcategoria(id) { try { store.removerSubcategoria(id); } catch (e) { alert(e.message); } },
  cancelarEdicao()     { _cancelarEdicao(); },
  limparCadastro()     { _limparCadastro(); },
  editProduto(id)      { _prepararEdicao(id); },
  removeProduto(id)    { try { store.removerProduto(id); } catch (e) { alert(e.message); } },
  ajustarEstoque(id, d){ try { store.ajustarEstoque(id, d); } catch (e) { alert(e.message); } },
  adicionarMesa(tipo)  { try { store.adicionarMesa(tipo); } catch (e) { alert(e.message); } },
  removerMesa(id)      { _removerMesa(id); },
  qrMesa(id)           { _mostrarQrMesa(id); },
  resetTokenMesa(id)   { _resetTokenMesa(id); },
  addPagamento()       { _addPagamento(); },
  removePagamento(n)   { try { store.removerFormaPagamento(n); } catch (e) { alert(e.message); } },
  addUsuario()         { _addUsuario(); },
  editarUsuario(id)    { _prepararEdicaoUsuario(id); },
  cancelarEdicaoUsuario() { _cancelarEdicaoUsuario(); },
  removerUsuario(id)   { _removerUsuario(id); },
  ativarUsuario(id)    { _ativarUsuario(id); },
  salvarPerfil()       { _salvarPerfil(); },
  baixarBackup()       { _baixarBackup(); },
  abrirImportBackup()  { _abrirImportBackup(); },
  aplicarFiltroAuditoria() { renderAuditoria(store.getState()); },
  exportarAuditoria()  { _exportarAuditoriaCSV(); },
  exportarRelatorio()  { _exportarCSV(); },
  exportarRelatorioProdutos() { _exportarProdutosVendidosCSV(); },
  exportarRelatorioCategorias() { _exportarCategoriasCSV(); },
  exportarRelatorioPagamentos() { _exportarPagamentosCSV(); },
  exportarRelatorioEstoque() { _exportarEstoqueCSV(); },
  exportarRelatorioMovEstoque() { _exportarMovEstoqueCSV(); },
  exportarRelatorioCancelamentos() { _exportarCancelamentosCSV(); },
  imprimirComanda()    { _imprimirComanda(); },
  abrirModalUsuario()  { _abrirModalUsuario(); },
  confirmarTrocaUsuario() { _confirmarTrocaUsuario(); },
  logout() { _logout(); },
  salvarEmpresa() { _salvarEmpresa(); },
  salvarAparencia() { _salvarAparencia(); },
  syncBaixar() { _syncBaixar(); },
  syncEnviar() { _syncEnviar(); },
  syncMesclarCadastros() { _syncMesclarCadastros(); },
  supabaseImportCadastros() { _supabaseImportCadastros(); },
  supabaseExportCadastros() { _supabaseExportCadastros(); },
  verImagem(url, titulo) { _verImagem(url, titulo); },
  fecharImagem() { _fecharImagem(); },
  atualizarProducao(id, status) { try { store.atualizarStatusProducao(id, status); } catch (e) { alert(e.message); } },
};

// ─── Renderização Principal ───────────────────────────────────────────────────

function render(state) {
  renderMesas(state);
  renderComanda(state);
  renderCardapio(state);
  renderManutencaoProdutos(state);
  renderManutencaoMesas(state);
  renderCategorias(state);
  renderSubcategorias(state);
  renderConfiguracoes(state);
  renderUsuarios(state);
  renderPerfis(state);
  renderAuditoria(state);
  renderRelatorios(state);
  renderCaixa(state);
  renderEstoque(state);
  renderFormasPagamento(state);
  renderUsuario(state);
  renderProducao(state);
}

function _persistMobileProdPrefs() {
  const uid = Number(store.getState()?.usuarioAtivo?.id) || 0;
  if (!uid) return;
  try {
    localStorage.setItem(`mobileProdCat:${uid}`, _mobileProdCat || '');
    localStorage.setItem(`mobileProdQuery:${uid}`, _mobileProdQuery || '');
    localStorage.setItem(`mobileProdMode:${uid}`, _mobileProdMode || 'all');
  } catch {}
}

function _loadMobileProdPrefsForUser(userId) {
  const uid = Number(userId) || 0;
  if (!uid) return;
  try {
    _mobileProdCat = localStorage.getItem(`mobileProdCat:${uid}`) || '';
    _mobileProdQuery = localStorage.getItem(`mobileProdQuery:${uid}`) || '';
    const m = localStorage.getItem(`mobileProdMode:${uid}`) || 'all';
    _mobileProdMode = (m === 'fav' || m === 'recent') ? m : 'all';
  } catch {}
}

function _applyMobileProdFilters() {
  const body = document.getElementById('comanda-body');
  if (!body) return;
  const picker = body.querySelector('.prod-picker');
  if (!picker) return;
  const q = String(_mobileProdQuery || '').trim().toLowerCase();
  const cat = String(_mobileProdCat || '').trim();
  const btns = picker.querySelectorAll('.prod-btn');
  let vis = 0;
  btns.forEach((b) => {
    const bCat = b.getAttribute('data-cat') || '';
    const bNome = (b.getAttribute('data-nome') || '').toLowerCase();
    const okCat = !cat || bCat === cat;
    const okNome = !q || bNome.includes(q);
    const isFav = (b.getAttribute('data-fav') || '') === '1';
    const isRecent = (b.getAttribute('data-recent') || '') === '1';
    const okMode = (_mobileProdMode === 'fav' ? isFav : (_mobileProdMode === 'recent' ? isRecent : true));
    const show = okCat && okNome && okMode;
    b.style.display = show ? '' : 'none';
    if (show) vis += 1;
  });

  const empty = body.querySelector('#prod-empty');
  if (empty) empty.style.display = vis ? 'none' : 'block';

  const chips = body.querySelectorAll('.prod-filters .chip');
  chips.forEach((c) => {
    const v = c.getAttribute('data-cat') || '';
    c.classList.toggle('active', v === cat);
  });

  const input = body.querySelector('#prod-search');
  if (input && String(input.value || '') !== String(_mobileProdQuery || '')) input.value = _mobileProdQuery || '';
}

// Primeira renderização
render(store.getState());
_supabaseAtualizarStatus(true);
if (_isClienteMode) _bootClienteMode();

function _supabaseRenderStatus() {
  const el = document.getElementById('supabase-status');
  if (!el) return;
  if (!_supabaseInfo) { el.textContent = '—'; return; }
  if (_supabaseInfo.configured) {
    const backend = _supabaseInfo.stateBackend === 'supabase'
      ? `Estado: Supabase (${_supabaseInfo.stateTable}/${_supabaseInfo.appInstanceId})`
      : 'Estado: arquivo local';
    el.textContent = `Conectado · ${backend}`;
  } else {
    el.textContent = 'Não configurado no servidor';
  }
}

async function _supabaseAtualizarStatus(force = false) {
  const now = Date.now();
  if (!force && _supabaseInfo && (now - _supabaseInfoTs) < 10_000) {
    _supabaseRenderStatus();
    return;
  }
  try {
    const r = await fetch('/api/supabase/status');
    const j = await r.json();
    _supabaseInfo = j || null;
    _supabaseInfoTs = now;
  } catch {
    _supabaseInfo = { configured: false };
    _supabaseInfoTs = now;
  }
  _supabaseRenderStatus();
}

async function _supabaseExportCadastros() {
  await _supabaseAtualizarStatus(true);
  if (!_supabaseInfo?.configured) {
    alert('Supabase não está configurado no servidor. Defina SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE_KEY) antes de exportar.');
    return;
  }
  try {
    const snap = store.getSyncSnapshot();
    const r = await fetch('/api/supabase/cadastros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: snap }),
    });
    const j = await r.json();
    if (!r.ok || !j?.ok) throw new Error(j?.error || 'Falha ao exportar.');
    alert('Cadastros exportados para o Supabase.');
  } catch (e) {
    alert(e.message);
  }
}

async function _supabaseImportCadastros() {
  await _supabaseAtualizarStatus(true);
  if (!_supabaseInfo?.configured) {
    alert('Supabase não está configurado no servidor. Defina SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE_KEY) antes de importar.');
    return;
  }
  try {
    const r = await fetch('/api/supabase/cadastros');
    const j = await r.json();
    if (!r.ok || !j?.ok) throw new Error(j?.error || 'Falha ao importar.');
    const data = j.data || {};
    const current = store.getState();
    const produtos = Array.isArray(data.produtos) ? data.produtos : [];
    const usuarios = Array.isArray(data.usuarios) ? data.usuarios : [];
    const subcategorias = Array.isArray(data.subcategorias) ? data.subcategorias : [];
    const maxProd = produtos.reduce((m, p) => Math.max(m, Number(p?.id) || 0), 0);
    const maxUser = usuarios.reduce((m, u) => Math.max(m, Number(u?.id) || 0), 0);
    const maxSub = subcategorias.reduce((m, s) => Math.max(m, Number(s?.id) || 0), 0);
    const merged = {
      ...current,
      categorias: Array.isArray(data.categorias) ? data.categorias : current.categorias,
      produtos,
      usuarios,
      subcategorias,
      empresa: (data.empresa && typeof data.empresa === 'object') ? data.empresa : current.empresa,
      proxId: Math.max(current.proxId || 1, maxProd + 1),
      proxUsuarioId: Math.max(current.proxUsuarioId || 1, maxUser + 1),
      proxSubcatId: Math.max(current.proxSubcatId || 1, maxSub + 1),
    };
    store.importarEstado(merged);
    localStorage.removeItem('sessaoToken');
    _abrirModalUsuario(true);
    alert('Cadastros importados do Supabase. Faça login novamente.');
  } catch (e) {
    alert(e.message);
  }
}

let _autoCadTimer = null;
let _autoCadInFlight = false;
let _lastAutoCadKey = '';
let _lastAutoCadAt = 0;
let _lastAutoCadFailAt = 0;

function _produtosKey() {
  const st = store.getState();
  const prods = Array.isArray(st?.produtos) ? st.produtos : [];
  return JSON.stringify(
    prods
      .map(p => ({
        id: Number(p?.id) || 0,
        nome: String(p?.nome || ''),
        cat: String(p?.cat || ''),
        subcat: String(p?.subcat || ''),
        preco: Number(p?.preco) || 0,
        estoque: Number(p?.estoque) || 0,
        estoqueMinimo: Number(p?.estoqueMinimo) || 0,
        imagem: String(p?.imagem || ''),
      }))
      .sort((a, b) => a.id - b.id)
  );
}

function _queueAutoExportCadastros() {
  if (_autoCadTimer) return;
  _autoCadTimer = setTimeout(() => {
    _autoCadTimer = null;
    _autoExportCadastrosIfNeeded().catch(() => {});
  }, 1800);
}

async function _autoExportCadastrosIfNeeded() {
  const now = Date.now();
  if (_autoCadInFlight) return;
  if (_lastAutoCadFailAt && (now - _lastAutoCadFailAt) < 15_000) return;
  if (_lastAutoCadAt && (now - _lastAutoCadAt) < 3_500) return;

  await _supabaseAtualizarStatus();
  if (!_supabaseInfo?.configured) return;

  const key = _produtosKey();
  if (key === _lastAutoCadKey) return;

  _autoCadInFlight = true;
  try {
    const snap = store.getSyncSnapshot();
    const r = await fetch('/api/supabase/cadastros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: snap }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.ok) throw new Error(j?.error || 'Falha ao exportar cadastros.');
    _lastAutoCadKey = key;
    _lastAutoCadAt = Date.now();
  } catch {
    _lastAutoCadFailAt = Date.now();
  } finally {
    _autoCadInFlight = false;
  }
}

// Auto-save: qualquer alteração no store (após carregarInicial) é enviada ao servidor.
// - Envia { state, ifRev } para evitar sobrescrever estado mais novo sem aviso (409 CONFLICT).
// - Em caso de conflito, pausa o auto-save e direciona o usuário para resolver via Parâmetros → Sincronização.
let _saveTimer = null;
let _saveFailShown = false;
let _autoResolvingConflict = false;

async function _autoResolverConflito() {
  if (_autoResolvingConflict) return;
  _autoResolvingConflict = true;
  try {
    const backupState = store.exportarEstado();
    const ts = Date.now();
    const key = `conflictBackup:${ts}`;
    try {
      localStorage.setItem(key, JSON.stringify({ ts, server: { ..._serverInfo }, state: backupState }));
      localStorage.setItem('conflictBackup:last', key);
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && String(k).startsWith('conflictBackup:')) keys.push(String(k));
        }
        keys.sort();
        const keep = 3;
        if (keys.length > keep) {
          keys.slice(0, keys.length - keep).forEach(k => {
            try { localStorage.removeItem(k); } catch {}
          });
        }
      } catch {}
    } catch {}

    carregadoDoServidor = false;
    _pendingSave = true;
    _lastSaveError = 'Conflito: atualizando do servidor...';
    try { render(store.getState()); } catch {}

    const data = await _fetchRemoteState();
    const remoteState = data?.state || null;
    if (remoteState) store.importarEstado(remoteState);

    carregadoDoServidor = true;
    _conflitoNotificado = false;
    _pendingSave = false;
    _saveFailShown = false;
    _lastSavedAt = Date.now();
    _lastSaveError = 'Conflito resolvido automaticamente (servidor)';

    const token = localStorage.getItem('sessaoToken') || '';
    const ok = token ? store.restaurarSessao(token) : false;
    if (!ok && !_isClienteMode) _abrirModalUsuario(true);
    render(store.getState());
  } catch {
    carregadoDoServidor = false;
    _pendingSave = true;
    _lastSaveError = 'Conflito: falha ao baixar';
    try { render(store.getState()); } catch {}
  } finally {
    _autoResolvingConflict = false;
  }
}

store.subscribe(() => {
  if (!carregadoDoServidor) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _pendingSave = true;
  _lastSaveError = '';
  _saveTimer = setTimeout(() => {
    const payloadState = store.exportarEstado();
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: payloadState, ifRev: _serverInfo.rev }),
    })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (r.status === 409) {
          _serverInfo.rev = Number(json?.server?.rev) || _serverInfo.rev;
          _serverInfo.updatedAt = Number(json?.server?.updatedAt) || _serverInfo.updatedAt;
          await _autoResolverConflito();
          return;
        }
        if (r.ok) {
          _serverInfo.rev = Number(json?.server?.rev) || Number(payloadState?.sync?.rev) || _serverInfo.rev;
          _serverInfo.updatedAt = Number(json?.server?.updatedAt) || Date.now();
          _saveFailShown = false;
          _supabaseAtualizarStatus();
          _queueAutoExportCadastros();
          _pendingSave = false;
          _lastSavedAt = Date.now();
          _lastSaveError = '';
          return;
        }
        if (!_saveFailShown) {
          _saveFailShown = true;
          _supabaseAtualizarStatus(true);
          _pendingSave = true;
          _lastSaveError = String(json?.error || 'erro desconhecido');
          alert(`Falha ao salvar no servidor: ${json?.error || 'erro desconhecido'}.\n\nSe estiver usando Supabase, verifique RLS/policies da tabela e se o servidor tem SUPABASE_SERVICE_ROLE_KEY.`);
        }
      })
      .catch(() => {});
  }, 700);
});

// Boot do front-end:
// 1) Baixa o estado do servidor (/api/state) e importa no store.
// 2) Se o estado importado precisar de "normalização" (ex.: categorias deduplicadas), grava de volta automaticamente.
// 3) Reabre sessão via token (localStorage) ou força login.
// 4) Inicia o stream SSE para detectar mudanças vindas de outros dispositivos.
async function carregarInicial() {
  try {
    const r = await fetch('/api/state');
    if (r.ok) {
      const data = await r.json();
      if (data?.state) {
        store.importarEstado(data.state);
        const after = store.exportarEstado();
        try {
          const a = JSON.stringify(data.state);
          const b = JSON.stringify(after);
          if (a !== b) {
            const srvRev = Number(data?.server?.rev) || 0;
            const r2 = await fetch('/api/state', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ state: after, ifRev: srvRev }),
            });
            const j2 = await r2.json().catch(() => ({}));
            if (r2.ok) {
              _serverInfo.rev = Number(j2?.server?.rev) || Number(after?.sync?.rev) || 0;
              _serverInfo.updatedAt = Number(j2?.server?.updatedAt) || Date.now();
              _remoteCache = { state: after, server: { rev: _serverInfo.rev, updatedAt: _serverInfo.updatedAt } };
            } else {
              _serverInfo.rev = srvRev;
              _serverInfo.updatedAt = Number(data?.server?.updatedAt) || 0;
              _remoteCache = { state: data?.state || null, server: { rev: _serverInfo.rev, updatedAt: _serverInfo.updatedAt } };
            }
          } else {
            _serverInfo.rev = Number(data?.server?.rev) || 0;
            _serverInfo.updatedAt = Number(data?.server?.updatedAt) || 0;
            _remoteCache = { state: data?.state || null, server: { rev: _serverInfo.rev, updatedAt: _serverInfo.updatedAt } };
          }
        } catch {
          _serverInfo.rev = Number(data?.server?.rev) || 0;
          _serverInfo.updatedAt = Number(data?.server?.updatedAt) || 0;
          _remoteCache = { state: data?.state || null, server: { rev: _serverInfo.rev, updatedAt: _serverInfo.updatedAt } };
        }
      } else {
        _serverInfo.rev = Number(data?.server?.rev) || 0;
        _serverInfo.updatedAt = Number(data?.server?.updatedAt) || 0;
        _remoteCache = { state: data?.state || null, server: { rev: _serverInfo.rev, updatedAt: _serverInfo.updatedAt } };
      }
    }
  } catch (e) {}

  carregadoDoServidor = true;
  const token = localStorage.getItem('sessaoToken') || '';
  const ok = token ? store.restaurarSessao(token) : false;
  if (!ok && !_isClienteMode) _abrirModalUsuario(true);
  if (!_isClienteMode) _iniciarStreamEstado();
}

if (!_isClienteMode) carregarInicial();

// SSE (/api/state/stream): recebe eventos com { server: { rev, updatedAt } }.
// Quando rev/updatedAt muda, rebaixa o estado e atualiza o cache local.
function _iniciarStreamEstado() {
  if (_isClienteMode) return;
  if (_stateStream) return;
  if (typeof EventSource === 'undefined') return;
  try {
    const es = new EventSource('/api/state/stream');
    _stateStream = es;
    es.addEventListener('server', (ev) => {
      const now = Date.now();
      _stateStreamTs = now;
      let msg = null;
      try { msg = JSON.parse(String(ev?.data || '')); } catch { msg = null; }
      const srv = msg?.server || null;
      const rev = Number(srv?.rev) || 0;
      const updatedAt = Number(srv?.updatedAt) || 0;
      if (!rev && !updatedAt) return;
      const changed = rev !== Number(_serverInfo.rev) || updatedAt !== Number(_serverInfo.updatedAt);
      _serverInfo.rev = rev;
      _serverInfo.updatedAt = updatedAt;
      if (changed) {
        _fetchRemoteState().catch(() => {});
        renderConfiguracoes(store.getState());
      }
    });
    es.onerror = () => {
      _stateStreamTs = Date.now();
    };
  } catch {
    _stateStream = null;
  }
}

// ─── Mesas ───────────────────────────────────────────────────────────────────

function renderMesas(state) {
  const grid = document.getElementById('mesa-grid');
  grid.innerHTML = '';
  
  // Agrupa mesas por tipo
  const presencial = Object.values(state.mesas).filter(m => m.tipo === 'presencial');
  const online     = Object.values(state.mesas).filter(m => m.tipo === 'online');

  const renderSecao = (titulo, mesas) => {
    if (mesas.length === 0) return '';
    return `
      <div class="mesa-secao">
        <h3 class="secao-titulo">${titulo}</h3>
        <div class="mesa-lista">
          ${mesas.map(mesa => {
            const total = store.calcTotalMesa(mesa.itens);
            let statusClass = '';
            if (mesa.status === 'ocupada') {
              statusClass = total > 0 ? 'com-total' : 'ocupada';
            }

            return `
              <button class="mesa-btn ${statusClass} ${state.mesaSelecionada == mesa.id ? 'selecionada' : ''}" 
                      onclick="app.selecionarMesa(${mesa.id})">
                <span class="mesa-num">${mesa.tipo === 'online' ? '🌐' : 'M'}${mesa.id}</span>
                ${total > 0 ? `<span class="mesa-val">${formatBRL(total)}</span>` : ''}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  grid.innerHTML = renderSecao('Mesas Presenciais', presencial) + renderSecao('Pedidos Online', online);
}

// ─── Comanda ─────────────────────────────────────────────────────────────────

function renderComanda(state) {
  const title  = document.getElementById('comanda-title');
  const btnFec = document.getElementById('btn-fechar');
  const body   = document.getElementById('comanda-body');
  const n      = state.mesaSelecionada;

  if (!n) {
    title.textContent = 'Selecione uma mesa';
    btnFec.style.display = 'none';
    body.innerHTML = '<p class="empty-msg">Clique em uma mesa para gerenciar pedidos.</p>';
    return;
  }

  const mesa  = state.mesas[n];
  const resumo = store.calcResumoMesa(mesa, { aplicarTaxa: !!mesa.aplicarTaxa });
  const subtotal = resumo.subtotal;
  const taxa = resumo.taxaServico;
  const taxaEntrega = resumo.taxaEntrega || 0;
  const total = resumo.total;
  const credito = resumo.credito || 0;
  const saldo = resumo.saldo;

  title.textContent = `${mesa.tipo === 'online' ? 'Pedido Online' : 'Mesa'} ${n}`;
  btnFec.style.display = 'flex';
  btnFec.innerHTML = `
    <button class="btn btn-sm" onclick="app.imprimirComanda()" title="Imprimir Comanda">🖨️</button>
    <button class="btn btn-danger btn-sm" onclick="app.fecharMesaModal()">
      Fechar · <span id="btn-fechar-total">${formatBRL(saldo)}</span>
    </button>
  `;

  const isMobile = !!(window.matchMedia && window.matchMedia('(max-width: 980px)').matches);
  const disponiveis = store.getProdutosDisponiveis(mesa.tipo);
  const pctOnline = Number.isFinite(Number(state.empresa?.precoOnlinePct)) ? Number(state.empresa.precoOnlinePct) : 0;
  const precoLista = (p) => (mesa.tipo === 'online')
    ? Math.round((Number(p.preco) * (1 + (pctOnline / 100))) * 100) / 100
    : Number(p.preco) || 0;
  const userFull = (state.usuarios || []).find(u => u.id === state.usuarioAtivo?.id) || {};
  const favSet = new Set((Array.isArray(userFull.favoritos) ? userFull.favoritos : []).map(Number).filter(Boolean));
  const recentes = (Array.isArray(userFull.recentes) ? userFull.recentes : []).map(Number).filter(Boolean);
  const recentPos = new Map(recentes.map((id, idx) => [Number(id) || 0, idx]));
  const cats = Array.from(
    new Set(disponiveis.map(p => String(p?.cat || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const activeCat = cats.includes(_mobileProdCat) ? _mobileProdCat : '';
  if (_mobileProdCat && !activeCat) _mobileProdCat = '';
  const opcoesSelect = disponiveis
    .map(p => `<option value="${p.id}">${p.nome} — ${formatBRL(precoLista(p))}</option>`)
    .join('');

  const escAttr = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const gridProdutosHTML = disponiveis.slice()
    .sort((a, b) => {
      if (_mobileProdMode === 'recent') {
        const ra = recentPos.has(a?.id) ? recentPos.get(a?.id) : 1e9;
        const rb = recentPos.has(b?.id) ? recentPos.get(b?.id) : 1e9;
        if (ra !== rb) return ra - rb;
      } else if (_mobileProdMode === 'fav') {
        const fa = favSet.has(a?.id) ? 1 : 0;
        const fb = favSet.has(b?.id) ? 1 : 0;
        if (fa !== fb) return fb - fa;
      }
      return String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR');
    })
    .map(p => `
      <button type="button" class="prod-btn" data-cat="${escAttr(p?.cat || '')}" data-nome="${escAttr(p?.nome || '')}" data-fav="${favSet.has(p.id) ? '1' : '0'}" data-recent="${recentPos.has(p.id) ? '1' : '0'}" onclick="app.addItemById(${p.id})" title="Adicionar: ${p.nome}">
        <span class="prod-fav ${favSet.has(p.id) ? 'active' : ''}" onclick="event.stopPropagation(); app.toggleFav(${p.id})" title="${favSet.has(p.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">★</span>
        ${p.imagem
          ? `<img class="thumb" src="${p.imagem}" alt="" onerror="this.style.display='none'">`
          : `<div class="thumb placeholder" title="Sem imagem">🖼️</div>`
        }
        <div class="prod-nome">${p.nome}</div>
        <div class="prod-preco">${formatBRL(precoLista(p))}</div>
      </button>
    `).join('');

  const seletorProdutoHTML = isMobile
    ? `
      <div class="prod-modes" role="tablist" aria-label="Modo de lista">
        <button type="button" class="chip ${_mobileProdMode === 'all' ? 'active' : ''}" onclick="app.setMobileProdMode('all')">Todos</button>
        <button type="button" class="chip ${_mobileProdMode === 'fav' ? 'active' : ''}" onclick="app.setMobileProdMode('fav')">⭐ Fav</button>
        <button type="button" class="chip ${_mobileProdMode === 'recent' ? 'active' : ''}" onclick="app.setMobileProdMode('recent')">🕘 Recentes</button>
      </div>
      <div class="prod-filters" role="tablist" aria-label="Filtro de categorias">
        <button type="button" class="chip ${activeCat ? '' : 'active'}" data-cat="" onclick="app.setMobileProdCat('')">Todas</button>
        ${cats.map(c => `<button type="button" class="chip ${c === activeCat ? 'active' : ''}" data-cat="${escAttr(c)}" onclick="app.setMobileProdCat(${JSON.stringify(c)})">${c}</button>`).join('')}
      </div>
      <div class="prod-search">
        <input id="prod-search" type="search" placeholder="Buscar produto..." value="${escAttr(_mobileProdQuery || '')}" oninput="app.setMobileProdQuery(this.value)" />
      </div>
      <div class="prod-picker">
        ${gridProdutosHTML}
      </div>
      <p id="prod-empty" class="empty-msg" style="display:none">Nenhum produto encontrado.</p>
    `
    : `
      <div class="add-item-row">
        <select id="sel-item">
          <option value="">Selecione um produto...</option>
          ${opcoesSelect}
        </select>
        <button class="btn btn-primary" onclick="app.addItem()">+ Add</button>
      </div>
    `;

  const itensHTML = mesa.itens.length === 0
    ? '<p class="empty-msg">Nenhum item adicionado.</p>'
    : mesa.itens.map(it => `
        <div class="item-row">
          ${(() => {
            const p = state.produtos.find(x => x.id === it.id);
            return p?.imagem ? `<img class="thumb" src="${p.imagem}" alt="" onerror="this.style.display='none'">` : '';
          })()}
          <div class="item-info">
            <div class="item-nome">${it.nome}</div>
            <div class="item-preco">${formatBRL(it.preco)} cada</div>
          </div>
          <div class="row" style="gap:6px">
            <button class="qty-btn" onclick="app.changeQty(${it.id}, -1)">−</button>
            <span style="font-size:13px;min-width:18px;text-align:center">${it.qty}</span>
            <button class="qty-btn" onclick="app.changeQty(${it.id}, 1)">+</button>
          </div>
          <span class="item-subtotal">${formatBRL(it.preco * it.qty)}</span>
          <button class="remove-btn" onclick="app.removeItem(${it.id})">×</button>
        </div>
      `).join('');

  const cliente = (mesa?.cliente && typeof mesa.cliente === 'object') ? mesa.cliente : null;
  const clienteInfoHTML = (mesa.tipo === 'online' && cliente)
    ? `
      <div class="simple-item" style="margin-bottom:10px; gap:10px; align-items:flex-start">
        <span>
          <b>Cliente:</b> ${escAttr(cliente.apelido || cliente.nome || '-')}${cliente.nome && cliente.apelido ? ` (${escAttr(cliente.nome)})` : ''}<br>
          <span style="color:#555; font-size:12px">
            ${cliente.telefone ? `WhatsApp: ${escAttr(cliente.telefone)}` : ''}
            ${cliente.entregaTipo ? ` · ${cliente.entregaTipo === 'retirada' ? 'Retirada' : 'Entrega'}` : ''}
            ${cliente.formaPagamento ? ` · Pgto: ${escAttr(cliente.formaPagamento)}` : ''}
          </span>
          ${cliente.entregaTipo !== 'retirada' && (cliente.enderecoTexto || cliente.mapsUrl) ? `<br><span style="color:#555; font-size:12px">Endereço: ${escAttr(cliente.enderecoTexto || cliente.mapsUrl)}</span>` : ''}
          ${cliente.entregaTipo !== 'retirada' && cliente.referencia ? `<br><span style="color:#555; font-size:12px">Ref: ${escAttr(cliente.referencia)}</span>` : ''}
          ${cliente.formaPagamento && String(cliente.formaPagamento).toLowerCase().includes('dinheiro') && (Number.isFinite(Number(cliente.trocoPara)) && Number(cliente.trocoPara) >= 0) ? `<br><span style="color:#555; font-size:12px">Troco: R$ ${Number(cliente.trocoPara).toFixed(2).replace('.', ',')}</span>` : ''}
          ${cliente.observacao ? `<br><span style="color:#555; font-size:12px">Obs: ${escAttr(cliente.observacao)}</span>` : ''}
        </span>
      </div>
    `
    : '';

  body.innerHTML = `
    ${seletorProdutoHTML}
    ${clienteInfoHTML}
    <hr style="border:none;border-top:1px solid #ece9e2;margin-bottom:12px"/>
    <div class="item-list">${itensHTML}</div>
    <div class="total-bar">
      <span class="total-label">Subtotal</span>
      <div class="spacer"></div>
      <span class="total-val">${formatBRL(subtotal)}</span>
    </div>
    ${taxaEntrega > 0 ? `
      <div class="total-bar" style="margin-top:8px">
        <span class="total-label">Entrega</span>
        <div class="spacer"></div>
        <span class="total-val" style="font-size:14px">${formatBRL(taxaEntrega)}</span>
      </div>
    ` : ''}
    ${taxa > 0 ? `
      <div class="total-bar" style="margin-top:8px">
        <span class="total-label">Taxa Serviço</span>
        <div class="spacer"></div>
        <span class="total-val" style="font-size:14px">${formatBRL(taxa)}</span>
      </div>
    ` : ''}
    <div class="total-bar" style="margin-top:8px">
      <span class="total-label">Total</span>
      <div class="spacer"></div>
      <span class="total-val" style="font-size:14px">${formatBRL(total)}</span>
    </div>
    ${credito > 0 ? `
      <div class="total-bar" style="margin-top:8px">
        <span class="total-label">Pago</span>
        <div class="spacer"></div>
        <span class="total-val" style="font-size:14px">${formatBRL(credito)}</span>
      </div>
    ` : ''}
    <div class="total-bar" style="margin-top:8px">
      <span class="total-label">Saldo</span>
      <div class="spacer"></div>
      <span class="total-val" style="font-size:14px">${formatBRL(saldo)}</span>
    </div>
  `;
  if (isMobile) _applyMobileProdFilters();
}

// ─── Cardápio ─────────────────────────────────────────────────────────────────

function renderCardapio(state) {
  document.getElementById('qtd-prod').textContent = `${state.produtos.length} itens`;
  const list = document.getElementById('lista-cardapio');
  if (!state.produtos.length) {
    list.innerHTML = '<p class="empty-msg">Nenhum produto cadastrado.</p>';
    return;
  }
  const grupos = agruparPor(state.produtos, 'cat');
  list.innerHTML = Object.entries(grupos).map(([cat, prods]) => {
    const gruposSub = agruparPor(prods, 'subcat');
    const ordenados = Object.entries(gruposSub).sort(([a], [b]) => (a || '—').localeCompare(b || '—', 'pt-BR'));
    return `
      <div class="cat-label">${cat}</div>
      ${ordenados.map(([sub, itens]) => `
        ${sub ? `<div class="item-preco" style="margin:6px 0 4px;color:#888">${sub}</div>` : ''}
        ${itens.map(p => `
          <div class="item-row">
            ${p.imagem
              ? `<img class="thumb" src="${p.imagem}" data-url="${p.imagem}" data-titulo="${p.nome}" alt="" onclick="app.verImagem(this.getAttribute('data-url'), this.getAttribute('data-titulo'))" onerror="this.style.display='none'">`
              : `<div class="thumb placeholder" title="Sem imagem">🖼️</div>`
            }
            <div class="item-info">
              <div class="item-nome">${p.nome}</div>
              <div class="item-preco">${formatBRL(p.preco)}</div>
            </div>
            <span class="badge badge-${p.estoque > 10 ? 'green' : p.estoque > 0 ? 'amber' : 'red'}">${p.estoque} un</span>
          </div>
        `).join('')}
      `).join('')}
    `;
  }).join('');
}

function _verImagem(url, titulo) {
  const u = String(url || '').trim();
  if (!u) return;
  const t = String(titulo || 'Imagem').trim() || 'Imagem';
  const titleEl = document.getElementById('modal-imagem-titulo');
  const imgEl = document.getElementById('modal-imagem-img');
  if (titleEl) titleEl.textContent = t;
  if (imgEl) imgEl.src = u;
  const modal = document.getElementById('modal-imagem');
  if (modal) modal.style.display = 'flex';
}

function _fecharImagem() {
  const modal = document.getElementById('modal-imagem');
  const imgEl = document.getElementById('modal-imagem-img');
  if (imgEl) imgEl.src = '';
  if (modal) modal.style.display = 'none';
}

function renderManutencaoProdutos(state) {
  const list = document.getElementById('lista-manutencao-produtos');
  if (!list) return;

  if (!state.produtos.length) {
    list.innerHTML = '<p class="empty-msg">Nenhum produto para gerenciar.</p>';
    return;
  }

  list.innerHTML = state.produtos.map(p => `
    <div class="item-row">
      ${p.imagem ? `<img class="thumb" src="${p.imagem}" alt="" onerror="this.style.display='none'">` : ''}
      <div class="item-info">
        <div class="item-nome">${p.nome}</div>
        <div class="item-preco">${p.cat}${p.subcat ? ` · ${p.subcat}` : ''}${String(p.tipo || '').toLowerCase() === 'combo' ? ' · Combo' : ''}${p.somenteOnline ? ' · Online' : ''} · ${formatBRL(p.preco)}</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="edit-btn" onclick="app.editProduto(${p.id})" title="Editar">✏️</button>
        <button class="remove-btn" onclick="app.removeProduto(${p.id})">×</button>
      </div>
    </div>
  `).join('');
}

function renderCategorias(state) {
  const cats = (Array.isArray(state.categorias) && state.categorias.length)
    ? state.categorias.slice()
    : ['Bebida', 'Petisco', 'Prato', 'Sobremesa'];

  const catSelProduto = document.getElementById('f-cat');
  if (catSelProduto) {
    const atual = catSelProduto.value;
    catSelProduto.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    if (atual && cats.includes(atual)) catSelProduto.value = atual;
  }

  const catSelSub = document.getElementById('subcat-cat');
  if (catSelSub) {
    const atual = catSelSub.value;
    catSelSub.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    if (atual && cats.includes(atual)) catSelSub.value = atual;
  }

  const list = document.getElementById('lista-categorias');
  if (!list) return;
  if (!cats.length) {
    list.innerHTML = '<p class="empty-msg">Nenhuma categoria cadastrada.</p>';
    return;
  }
  list.innerHTML = cats
    .slice()
    .sort((a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR'))
    .map(c => `
      <div class="simple-item">
        <span>${c}</span>
        <button class="remove-btn" onclick="app.removeCategoria(${JSON.stringify(c)})">×</button>
      </div>
    `).join('');
}

function renderSubcategorias(state) {
  const catSelProduto = document.getElementById('f-cat');
  const subSelProduto = document.getElementById('f-subcat');
  if (catSelProduto && subSelProduto) {
    const cat = catSelProduto.value;
    const subs = store.getSubcategoriasPorCategoria(cat);
    const atual = subSelProduto.value;
    subSelProduto.innerHTML = [
      `<option value="">Sem subcategoria</option>`,
      ...subs.map(s => `<option value="${s}">${s}</option>`)
    ].join('');
    if (atual && subs.includes(atual)) subSelProduto.value = atual;
  }

  const list = document.getElementById('lista-subcategorias');
  const catSel = document.getElementById('subcat-cat');
  if (!list || !catSel) return;

  const cat = catSel.value;
  const itens = state.subcategorias.filter(s => s.cat === cat);
  if (itens.length === 0) {
    list.innerHTML = '<p class="empty-msg">Nenhuma subcategoria cadastrada.</p>';
    return;
  }
  list.innerHTML = itens
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(s => `
      <div class="simple-item">
        <span>${s.nome}</span>
        <button class="remove-btn" onclick="app.removeSubcategoria(${s.id})">×</button>
      </div>
    `).join('');
}

function renderConfiguracoes(state) {
  const el = document.getElementById('check-venda-sem-estoque');
  if (!el) return;
  el.checked = !!state.permitirVendaSemEstoque;
  el.onchange = () => {
    try {
      store.setPermitirVendaSemEstoque(el.checked);
    } catch (e) {
      el.checked = !!store.getState().permitirVendaSemEstoque;
      alert(e.message);
    }
  };

  const tel = document.getElementById('f-empresa-telefone');
  const end = document.getElementById('f-empresa-endereco');
  const taxaEntrega = document.getElementById('f-empresa-taxa-entrega');
  const onlinePct = document.getElementById('f-empresa-online-pct');
  const pix = document.getElementById('f-empresa-pix');
  const rod = document.getElementById('f-empresa-rodape');
  const emp = state.empresa || {};
  if (tel && tel.value !== String(emp.telefone || '')) tel.value = String(emp.telefone || '');
  if (end && end.value !== String(emp.endereco || '')) end.value = String(emp.endereco || '');
  if (taxaEntrega && taxaEntrega.value !== String(Number(emp.taxaEntregaPadrao || 0))) taxaEntrega.value = String(Number(emp.taxaEntregaPadrao || 0));
  if (onlinePct && onlinePct.value !== String(Number(emp.precoOnlinePct || 0))) onlinePct.value = String(Number(emp.precoOnlinePct || 0));
  if (pix && pix.value !== String(emp.pixCopiaECola || '')) pix.value = String(emp.pixCopiaECola || '');
  if (rod && rod.value !== String(emp.mensagemRodape || '')) rod.value = String(emp.mensagemRodape || '');

  const fundo = Number(state.aparencia?.fundoOpacidade);
  const op = Number.isFinite(fundo) ? Math.max(0, Math.min(1, fundo)) : 0.90;
  document.documentElement.style.setProperty('--bg-overlay-a', String(op));

  const bg = document.getElementById('bg-opacity');
  const bgVal = document.getElementById('bg-opacity-val');
  if (bg) {
    const pct = Math.round(op * 100);
    if (String(bg.value) !== String(pct)) bg.value = String(pct);
    if (bgVal) bgVal.textContent = String(pct);
    bg.oninput = () => {
      const v = Math.max(0, Math.min(100, Number(bg.value)));
      if (bgVal) bgVal.textContent = String(v);
      document.documentElement.style.setProperty('--bg-overlay-a', String((v / 100).toFixed(2)));
    };
  }

  const ask = document.getElementById('check-impressao-perguntar');
  const auto = document.getElementById('check-impressao-auto');
  if (ask && auto) {
    const cfg = state.impressao || {};
    const autoVal = !!cfg.autoImprimirViasSetor;
    const askVal = autoVal ? false : !!cfg.perguntarViasSetor;
    auto.checked = autoVal;
    ask.checked = askVal;
    ask.disabled = autoVal;
    auto.onchange = () => {
      try {
        store.atualizarImpressao({ autoImprimirViasSetor: auto.checked, perguntarViasSetor: auto.checked ? false : ask.checked });
      } catch (e) {
        auto.checked = !!store.getState().impressao?.autoImprimirViasSetor;
        alert(e.message);
      }
    };
    ask.onchange = () => {
      try {
        store.atualizarImpressao({ perguntarViasSetor: ask.checked });
      } catch (e) {
        ask.checked = !!store.getState().impressao?.perguntarViasSetor;
        alert(e.message);
      }
    };
  }

  const sync = document.getElementById('sync-status');
  if (sync) {
    const localRev = Number(state.sync?.rev) || 0;
    const localAt = Number(state.sync?.updatedAt) || 0;
    const srvRev = Number(_serverInfo.rev) || 0;
    const srvAt = Number(_serverInfo.updatedAt) || 0;
    const fmt = (ts) => ts ? new Date(ts).toLocaleString('pt-BR') : '—';
    const status = carregadoDoServidor ? 'OK' : 'Pausado';
    const saveTxt = _pendingSave ? 'PENDENTE' : (_lastSavedAt ? `SALVO (${fmt(_lastSavedAt)})` : '—');
    const errTxt = _lastSaveError ? ` · Erro: ${_lastSaveError}` : '';
    sync.textContent = `Local rev ${localRev} (${fmt(localAt)}) · Servidor rev ${srvRev} (${fmt(srvAt)}) · ${status} · ${saveTxt}${errTxt}`;
  }

  const diffEl = document.getElementById('sync-diff');
  if (diffEl) {
    const remoteSnap = _remoteCache?.state ? _snapshotFromRawState(_remoteCache.state) : null;
    const localSnap = store.getSyncSnapshot();
    if (remoteSnap) {
      const d = diffSyncSnapshot(localSnap, remoteSnap);
      diffEl.textContent = d.summary.length ? `Diferenças: ${d.summary.join(' · ')}` : 'Diferenças: nenhuma';
    } else {
      diffEl.textContent = 'Diferenças: —';
    }
  }

  const histEl = document.getElementById('sync-historico');
  if (histEl) {
    const h = Array.isArray(state.integracao?.syncHistory) ? state.integracao.syncHistory : [];
    if (h.length === 0) {
      histEl.innerHTML = '<p class="empty-msg">Sem histórico de sincronização.</p>';
    } else {
      const fmt = (ts) => ts ? new Date(ts).toLocaleString('pt-BR') : '—';
      histEl.innerHTML = h
        .slice(0, 10)
        .map(x => {
          const ok = x.ok ? '✅' : '⚠️';
          const dir = String(x.direcao || '').toUpperCase();
          const note = x.note ? ` · ${x.note}` : '';
          return `<div class="simple-item"><span>${ok} ${dir} · ${fmt(x.ts)} · srv ${x.serverRev ?? '—'} · local ${x.localRev ?? '—'}${note}</span></div>`;
        })
        .join('');
    }
  }

  const precosEl = document.getElementById('lista-precos-online');
  if (precosEl) {
    const pct = Number.isFinite(Number(state.empresa?.precoOnlinePct)) ? Number(state.empresa.precoOnlinePct) : 0;
    const prods = (Array.isArray(state.produtos) ? state.produtos : [])
      .filter(p => Number(p?.id) > 0 && String(p?.nome || '').trim())
      .slice()
      .sort((a, b) => {
        const ca = String(a?.cat || '').localeCompare(String(b?.cat || ''), 'pt-BR');
        if (ca !== 0) return ca;
        return String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR');
      });

    if (!prods.length) {
      precosEl.innerHTML = '<p class="empty-msg">Nenhum produto cadastrado.</p>';
    } else {
      const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
      const calcOnline = (base) => round2((Number(base) || 0) * (1 + (pct / 100)));
      precosEl.innerHTML = [
        `<div class="simple-item"><span><b>Ajuste online:</b> ${pct}%</span><span>${prods.length} item(ns)</span></div>`,
        ...prods.map(p => {
          const base = Number(p?.preco) || 0;
          const online = calcOnline(base);
          const tipo = String(p?.tipo || '').toLowerCase() === 'combo' ? 'Combo' : '';
          const only = p?.somenteOnline ? 'Online' : '';
          const tags = [tipo, only].filter(Boolean).join(' · ');
          const left = `${String(p?.nome || '').trim()}${tags ? ` <span style="color:#777">· ${tags}</span>` : ''}`;
          const right = `${formatBRL(base)} → ${formatBRL(online)}`;
          return `<div class="simple-item"><span>${left}</span><span>${right}</span></div>`;
        }),
      ].join('');
    }
  }
}

function _snapshotFromRawState(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    rev: Number(s.sync?.rev) || 0,
    categorias: [...(s.categorias || [])],
    produtos: (s.produtos || []).map(p => ({
      id: p.id,
      nome: p.nome,
      cat: p.cat,
      subcat: p.subcat,
      preco: p.preco,
      estoque: p.estoque,
      estoqueMinimo: p.estoqueMinimo,
      imagem: p.imagem,
    })),
    usuarios: (s.usuarios || []).map(u => ({
      id: u.id,
      nome: u.nome,
      papel: u.papel,
      senhaHash: u.senhaHash || null,
      descontoPctMax: Number.isFinite(Number(u.descontoPctMax)) ? Math.max(0, Math.min(100, Number(u.descontoPctMax))) : 0,
      descontoValorMax: Number.isFinite(Number(u.descontoValorMax)) ? Math.max(0, Number(u.descontoValorMax)) : 0,
    })),
    perfis: JSON.parse(JSON.stringify(s.perfis || {})),
    empresa: { ...(s.empresa || {}) },
    permitirVendaSemEstoque: !!s.permitirVendaSemEstoque,
    formasPagamento: [...(s.formasPagamento || [])],
    subcategorias: [...(s.subcategorias || [])].map(x => ({ ...x })),
    aparencia: { ...(s.aparencia || {}) },
    impressao: { ...(s.impressao || {}) },
  };
}

function _salvarEmpresa() {
  try {
    store.atualizarEmpresa({
      telefone: document.getElementById('f-empresa-telefone')?.value || '',
      endereco: document.getElementById('f-empresa-endereco')?.value || '',
      taxaEntregaPadrao: parseFloat(String(document.getElementById('f-empresa-taxa-entrega')?.value || '').replace(',', '.')) || 0,
      precoOnlinePct: parseFloat(String(document.getElementById('f-empresa-online-pct')?.value || '').replace(',', '.')) || 0,
      pixCopiaECola: document.getElementById('f-empresa-pix')?.value || '',
      mensagemRodape: document.getElementById('f-empresa-rodape')?.value || '',
    });
    alert('Dados do recibo salvos.');
  } catch (e) {
    alert(e.message);
  }
}

function _salvarAparencia() {
  try {
    const bg = document.getElementById('bg-opacity');
    const v = bg ? Math.max(0, Math.min(100, Number(bg.value))) : 90;
    store.atualizarAparencia({ fundoOpacidade: v / 100 });
    alert('Aparência salva.');
  } catch (e) {
    alert(e.message);
  }
}

async function _syncBaixar() {
  try {
    const data = await _fetchRemoteState();
    const remoteState = data?.state || null;
    const srvRev = Number(data?.server?.rev) || 0;
    const srvAt = Number(data?.server?.updatedAt) || 0;

    const local = store.getState();
    const localRev = Number(local?.sync?.rev) || 0;
    const localAt = Number(local?.sync?.updatedAt) || 0;
    const baseRev = Number(local?.integracao?.lastSyncServerRev) || 0;
    const fmt = (ts) => ts ? new Date(ts).toLocaleString('pt-BR') : '—';

    const houveMudancaLocal = localRev > baseRev;
    const houveMudancaServidor = srvRev > baseRev;
    const conflito = houveMudancaLocal && houveMudancaServidor && localRev !== srvRev;

    const localSnap = store.getSyncSnapshot();
    const remoteSnap = remoteState ? _snapshotFromRawState(remoteState) : null;
    const diffTxt = remoteSnap ? (diffSyncSnapshot(localSnap, remoteSnap).summary.join(' · ') || 'nenhuma') : '—';

    const msg = conflito
      ? `Conflito detectado.\n\nLocal: rev ${localRev} (${fmt(localAt)})\nServidor: rev ${srvRev} (${fmt(srvAt)})\nDiferenças: ${diffTxt}\n\nBaixar vai SUBSTITUIR os dados locais e exigirá novo login.\nContinuar?`
      : `Baixar vai SUBSTITUIR os dados locais e exigirá novo login.\n\nLocal: rev ${localRev} (${fmt(localAt)})\nServidor: rev ${srvRev} (${fmt(srvAt)})\nDiferenças: ${diffTxt}\n\nContinuar?`;

    if (!confirm(msg)) return;

    const integracaoAtual = { ...(local.integracao || {}) };
    if (remoteState && typeof remoteState === 'object') {
      const entry = {
        ts: Date.now(),
        direcao: 'baixar',
        ok: true,
        serverRev: srvRev,
        localRev,
        note: conflito ? 'Conflito resolvido por download' : '',
      };
      const history = Array.isArray(integracaoAtual.syncHistory) ? integracaoAtual.syncHistory : [];
      const nextHistory = [entry, ...history].slice(0, 10);
      const snap = remoteSnap || _snapshotFromRawState(remoteState);
      remoteState.integracao = {
        ...(remoteState.integracao || {}),
        apiBaseUrl: integracaoAtual.apiBaseUrl || '',
        lastSyncServerRev: srvRev,
        lastSyncAt: Date.now(),
        lastSyncDirecao: 'baixar',
        lastSyncSnapshot: snap,
        syncHistory: nextHistory,
      };
    }

    store.importarEstado(remoteState);
    _serverInfo.rev = srvRev;
    _serverInfo.updatedAt = srvAt;
    _remoteCache = { state: remoteState, server: { rev: srvRev, updatedAt: srvAt } };
    carregadoDoServidor = true;
    _conflitoNotificado = false;
    localStorage.removeItem('sessaoToken');
    _abrirModalUsuario(true);
  } catch (e) {
    alert(e.message);
  }
}

async function _syncEnviar() {
  try {
    const local = store.getState();
    const localRev = Number(local?.sync?.rev) || 0;
    const localAt = Number(local?.sync?.updatedAt) || 0;
    const fmt = (ts) => ts ? new Date(ts).toLocaleString('pt-BR') : '—';

    const enviar = async (force) => {
      const payloadState = store.exportarEstado();
      const r = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: payloadState, ifRev: _serverInfo.rev, force: !!force }),
      });
      const json = await r.json().catch(() => ({}));
      return { r, json };
    };

    const { r, json } = await enviar(false);
    if (r.status === 409) {
      const srvRev = Number(json?.server?.rev) || 0;
      const srvAt = Number(json?.server?.updatedAt) || 0;
      _serverInfo.rev = srvRev;
      _serverInfo.updatedAt = srvAt;
      _remoteCache = { state: _remoteCache?.state || null, server: { rev: srvRev, updatedAt: srvAt } };
      carregadoDoServidor = false;

      const msg = `Conflito detectado.\n\nLocal: rev ${localRev} (${fmt(localAt)})\nServidor: rev ${srvRev} (${fmt(srvAt)})\n\nEnviar FORÇADO vai sobrescrever o servidor.\nContinuar?`;
      if (!confirm(msg)) {
        render(store.getState());
        return;
      }
      const forced = await enviar(true);
      if (!forced.r.ok) throw new Error(forced.json?.error || 'Falha ao enviar.');
      _serverInfo.rev = Number(forced.json?.server?.rev) || localRev;
      _serverInfo.updatedAt = Number(forced.json?.server?.updatedAt) || Date.now();
      carregadoDoServidor = true;
      _conflitoNotificado = false;
    } else if (!r.ok) {
      throw new Error(json?.error || 'Falha ao enviar.');
    } else {
      _serverInfo.rev = Number(json?.server?.rev) || localRev;
      _serverInfo.updatedAt = Number(json?.server?.updatedAt) || Date.now();
      carregadoDoServidor = true;
      _conflitoNotificado = false;
    }

    try {
      const snap = store.getSyncSnapshot();
      const entry = { ts: Date.now(), direcao: 'enviar', ok: true, serverRev: _serverInfo.rev, localRev, note: '' };
      const history = Array.isArray(local?.integracao?.syncHistory) ? local.integracao.syncHistory : [];
      const nextHistory = [entry, ...history].slice(0, 10);
      store.atualizarIntegracao({ lastSyncServerRev: _serverInfo.rev, lastSyncAt: Date.now(), lastSyncDirecao: 'enviar', lastSyncSnapshot: snap, syncHistory: nextHistory });
    } catch (e) {}

    alert('Sincronização: estado enviado para o servidor.');
    render(store.getState());
  } catch (e) {
    alert(e.message);
  }
}

async function _fetchRemoteState() {
  const r = await fetch('/api/state');
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || 'Falha ao carregar do servidor.');
  const srvRev = Number(data?.server?.rev) || 0;
  const srvAt = Number(data?.server?.updatedAt) || 0;
  _serverInfo.rev = srvRev;
  _serverInfo.updatedAt = srvAt;
  _remoteCache = { state: data?.state || null, server: { rev: srvRev, updatedAt: srvAt } };
  return data;
}

function _mergeCadastrosSnapshot(baseSnap, localSnap, remoteSnap, prefer = 'server') {
  const choose = (a, b) => (prefer === 'local' ? a : b);
  const byId = (arr) => {
    const m = new Map();
    (Array.isArray(arr) ? arr : []).forEach(x => {
      if (x && (x.id !== undefined && x.id !== null)) m.set(String(x.id), x);
    });
    return m;
  };
  const stable = (obj) => JSON.stringify(obj ?? null);
  const mergeArrById = (baseArr, localArr, remoteArr) => {
    const b = byId(baseArr);
    const l = byId(localArr);
    const r = byId(remoteArr);
    const ids = new Set([...b.keys(), ...l.keys(), ...r.keys()]);
    const out = [];
    ids.forEach(id => {
      const bv = b.get(id);
      const lv = l.get(id);
      const rv = r.get(id);
      const lChanged = stable(lv) !== stable(bv);
      const rChanged = stable(rv) !== stable(bv);
      if (lChanged && !rChanged) { if (lv) out.push(lv); return; }
      if (!lChanged && rChanged) { if (rv) out.push(rv); return; }
      if (!lChanged && !rChanged) { if (bv) out.push(bv); return; }
      const picked = choose(lv, rv);
      if (picked) out.push(picked);
    });
    return out;
  };

  const base = baseSnap && typeof baseSnap === 'object' ? baseSnap : {};
  const local = localSnap && typeof localSnap === 'object' ? localSnap : {};
  const remote = remoteSnap && typeof remoteSnap === 'object' ? remoteSnap : {};

  const merged = {
    produtos: mergeArrById(base.produtos, local.produtos, remote.produtos),
    usuarios: mergeArrById(base.usuarios, local.usuarios, remote.usuarios),
    perfis: (() => {
      const bp = base.perfis || {};
      const lp = local.perfis || {};
      const rp = remote.perfis || {};
      const keys = new Set([...Object.keys(bp), ...Object.keys(lp), ...Object.keys(rp)]);
      const out = {};
      keys.forEach(k => {
        const b0 = bp[k];
        const l0 = lp[k];
        const r0 = rp[k];
        const lChanged = stable(l0) !== stable(b0);
        const rChanged = stable(r0) !== stable(b0);
        if (lChanged && !rChanged) out[k] = l0;
        else if (!lChanged && rChanged) out[k] = r0;
        else if (!lChanged && !rChanged) out[k] = b0;
        else out[k] = choose(l0, r0);
      });
      return out;
    })(),
    empresa: (() => {
      const b0 = base.empresa || {};
      const l0 = local.empresa || {};
      const r0 = remote.empresa || {};
      const lChanged = stable(l0) !== stable(b0);
      const rChanged = stable(r0) !== stable(b0);
      if (lChanged && !rChanged) return l0;
      if (!lChanged && rChanged) return r0;
      if (!lChanged && !rChanged) return b0;
      return choose(l0, r0);
    })(),
    permitirVendaSemEstoque: (() => {
      const b0 = !!base.permitirVendaSemEstoque;
      const l0 = !!local.permitirVendaSemEstoque;
      const r0 = !!remote.permitirVendaSemEstoque;
      const lChanged = l0 !== b0;
      const rChanged = r0 !== b0;
      if (lChanged && !rChanged) return l0;
      if (!lChanged && rChanged) return r0;
      if (!lChanged && !rChanged) return b0;
      return prefer === 'local' ? l0 : r0;
    })(),
    categorias: (() => {
      const b0 = base.categorias || [];
      const l0 = local.categorias || [];
      const r0 = remote.categorias || [];
      const lChanged = stable(l0) !== stable(b0);
      const rChanged = stable(r0) !== stable(b0);
      if (lChanged && !rChanged) return l0;
      if (!lChanged && rChanged) return r0;
      if (!lChanged && !rChanged) return b0;
      return choose(l0, r0);
    })(),
    formasPagamento: (() => {
      const b0 = base.formasPagamento || [];
      const l0 = local.formasPagamento || [];
      const r0 = remote.formasPagamento || [];
      const lChanged = stable(l0) !== stable(b0);
      const rChanged = stable(r0) !== stable(b0);
      if (lChanged && !rChanged) return l0;
      if (!lChanged && rChanged) return r0;
      if (!lChanged && !rChanged) return b0;
      return choose(l0, r0);
    })(),
    subcategorias: (() => {
      const b0 = base.subcategorias || [];
      const l0 = local.subcategorias || [];
      const r0 = remote.subcategorias || [];
      const lChanged = stable(l0) !== stable(b0);
      const rChanged = stable(r0) !== stable(b0);
      if (lChanged && !rChanged) return l0;
      if (!lChanged && rChanged) return r0;
      if (!lChanged && !rChanged) return b0;
      return choose(l0, r0);
    })(),
    aparencia: (() => {
      const b0 = base.aparencia || {};
      const l0 = local.aparencia || {};
      const r0 = remote.aparencia || {};
      const lChanged = stable(l0) !== stable(b0);
      const rChanged = stable(r0) !== stable(b0);
      if (lChanged && !rChanged) return l0;
      if (!lChanged && rChanged) return r0;
      if (!lChanged && !rChanged) return b0;
      return choose(l0, r0);
    })(),
    impressao: (() => {
      const b0 = base.impressao || {};
      const l0 = local.impressao || {};
      const r0 = remote.impressao || {};
      const lChanged = stable(l0) !== stable(b0);
      const rChanged = stable(r0) !== stable(b0);
      if (lChanged && !rChanged) return l0;
      if (!lChanged && rChanged) return r0;
      if (!lChanged && !rChanged) return b0;
      return choose(l0, r0);
    })(),
  };
  return merged;
}

async function _syncMesclarCadastros() {
  try {
    const localState = store.getState();
    const baseSnap = localState?.integracao?.lastSyncSnapshot;
    if (!baseSnap) {
      alert('Não dá para mesclar ainda: faça pelo menos um Enviar ou Baixar primeiro (para criar a base de comparação).');
      return;
    }

    const data = await _fetchRemoteState();
    const remoteState = data?.state || null;
    if (!remoteState) throw new Error('Servidor não retornou estado.');

    const localSnap = store.getSyncSnapshot();
    const remoteSnap = _snapshotFromRawState(remoteState);
    const dif = diffSyncSnapshot(localSnap, remoteSnap);
    const difTxt = dif.summary.join(' · ') || 'nenhuma';

    if (!confirm(`Mesclar CADASTROS (produtos/usuários/perfis/config) mantendo PEDIDOS do servidor.\n\nDiferenças: ${difTxt}\n\nContinuar?`)) return;

    const mergedCad = _mergeCadastrosSnapshot(baseSnap, localSnap, remoteSnap, 'server');
    const mergedState = JSON.parse(JSON.stringify(remoteState));
    mergedState.produtos = mergedCad.produtos;
    mergedState.usuarios = mergedCad.usuarios;
    mergedState.perfis = mergedCad.perfis;
    mergedState.empresa = mergedCad.empresa;
    mergedState.permitirVendaSemEstoque = mergedCad.permitirVendaSemEstoque;
    mergedState.categorias = mergedCad.categorias;
    mergedState.formasPagamento = mergedCad.formasPagamento;
    mergedState.subcategorias = mergedCad.subcategorias;
    mergedState.aparencia = mergedCad.aparencia;
    mergedState.impressao = mergedCad.impressao;

    const mergedRev = Math.max(Number(localState?.sync?.rev) || 0, Number(remoteState?.sync?.rev) || 0) + 1;
    mergedState.sync = { rev: mergedRev, updatedAt: Date.now(), updatedBy: null };

    const entry = { ts: Date.now(), direcao: 'mesclar', ok: true, serverRev: Number(data?.server?.rev) || 0, localRev: Number(localState?.sync?.rev) || 0, note: 'Mescla de cadastros (preferindo servidor em conflitos)' };
    const history = Array.isArray(localState.integracao?.syncHistory) ? localState.integracao.syncHistory : [];
    const nextHistory = [entry, ...history].slice(0, 10);
    mergedState.integracao = {
      ...(mergedState.integracao || {}),
      apiBaseUrl: localState.integracao?.apiBaseUrl || '',
      lastSyncServerRev: Number(data?.server?.rev) || 0,
      lastSyncAt: Date.now(),
      lastSyncDirecao: 'mesclar',
      lastSyncSnapshot: { ...mergedCad, rev: mergedRev },
      syncHistory: nextHistory,
    };

    const save = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: mergedState, force: true }),
    });
    const saveJson = await save.json().catch(() => ({}));
    if (!save.ok) throw new Error(saveJson?.error || 'Falha ao salvar mescla no servidor.');

    _serverInfo.rev = Number(saveJson?.server?.rev) || mergedRev;
    _serverInfo.updatedAt = Number(saveJson?.server?.updatedAt) || Date.now();
    _remoteCache = { state: mergedState, server: { rev: _serverInfo.rev, updatedAt: _serverInfo.updatedAt } };

    store.importarEstado(mergedState);
    carregadoDoServidor = true;
    _conflitoNotificado = false;
    localStorage.removeItem('sessaoToken');
    _abrirModalUsuario(true);
  } catch (e) {
    alert(e.message);
  }
}

function renderUsuarios(state) {
  const list = document.getElementById('lista-usuarios');
  if (!list) return;

  const papelLabel = {
    gerente: 'Gerente',
    garcom: 'Garçom',
    cozinha: 'Cozinha',
    churrasqueiro: 'Churrasqueiro',
    cliente: 'Cliente',
  };

  const ativoId = state.usuarioAtivo?.id;
  const usuarios = (state.usuarios || []).slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  list.innerHTML = usuarios.length === 0
    ? '<p class="empty-msg">Nenhum usuário cadastrado.</p>'
    : usuarios.map(u => `
        <div class="simple-item">
          <span>${u.id === ativoId ? '✅ ' : ''}${u.nome}${u.senhaHash ? ' 🔒' : ''} <span class="badge badge-gray" style="margin-left:8px">${(papelLabel[u.papel] || u.papel).toUpperCase()}</span> <span class="badge badge-gray" style="margin-left:6px">DESC ≤ ${Number(u.descontoPctMax) || 0}% / R$ ${Number(u.descontoValorMax) || 0}</span></span>
          <div class="row" style="gap:8px">
            <button class="btn btn-sm" onclick="app.ativarUsuario(${u.id})">Ativar</button>
            <button class="edit-btn" onclick="app.editarUsuario(${u.id})" title="Editar">✏️</button>
            <button class="remove-btn" onclick="app.removerUsuario(${u.id})">×</button>
          </div>
        </div>
      `).join('');
}

function renderPerfis(state) {
  const sel = document.getElementById('perfil-papel');
  if (!sel) return;

  const papel = sel.value || 'gerente';
  const perfil = store.getPerfilAcesso(papel) || { tabs: {} };
  const tabs = perfil.tabs || {};
  const acoes = perfil.acoes || {};

  const map = {
    pedidos: 'perfil-tab-pedidos',
    cardapio: 'perfil-tab-cardapio',
    producao: 'perfil-tab-producao',
    cadastros: 'perfil-tab-cadastros',
    parametros: 'perfil-tab-parametros',
    relatorios: 'perfil-tab-relatorios',
    caixa: 'perfil-tab-caixa',
    estoque: 'perfil-tab-estoque',
  };

  Object.entries(map).forEach(([tab, id]) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!tabs[tab];
  });

  const mapAcoes = {
    adicionarItem: 'perfil-acao-adicionarItem',
    cancelarItem: 'perfil-acao-cancelarItem',
    gerenciarProdutos: 'perfil-acao-gerenciarProdutos',
    gerenciarSubcategorias: 'perfil-acao-gerenciarSubcategorias',
    gerenciarMesas: 'perfil-acao-gerenciarMesas',
    gerenciarPagamentos: 'perfil-acao-gerenciarPagamentos',
    editarEstoque: 'perfil-acao-editarEstoque',
    receberPagamento: 'perfil-acao-receberPagamento',
    reimprimir: 'perfil-acao-reimprimir',
    verRelatorios: 'perfil-acao-verRelatorios',
    verAuditoria: 'perfil-acao-verAuditoria',
    configurarSistema: 'perfil-acao-configurarSistema',
    configurarIntegracao: 'perfil-acao-configurarIntegracao',
    gerenciarUsuarios: 'perfil-acao-gerenciarUsuarios',
    gerenciarPerfis: 'perfil-acao-gerenciarPerfis',
  };
  Object.entries(mapAcoes).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!acoes[k];
  });

  sel.onchange = () => renderPerfis(store.getState());
}

function renderAuditoria(state) {
  const list = document.getElementById('lista-auditoria');
  if (!list) return;

  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  const pode = !!perfil?.tabs?.parametros && !!perfil?.acoes?.verAuditoria;
  if (!pode) {
    list.innerHTML = '<p class="empty-msg">Sem permissão para ver auditoria.</p>';
    return;
  }

  const selUser = document.getElementById('audit-user');
  if (selUser) {
    const atual = selUser.value || 'todos';
    const opts = ['<option value="todos">Todos</option>'].concat((state.usuarios || []).map(u => `<option value="${u.id}">${u.nome}</option>`));
    selUser.innerHTML = opts.join('');
    const ids = (state.usuarios || []).map(u => String(u.id));
    selUser.value = atual === 'todos' || ids.includes(atual) ? atual : 'todos';
  }

  const de = document.getElementById('audit-de')?.value || '';
  const ate = document.getElementById('audit-ate')?.value || '';
  const busca = String(document.getElementById('audit-busca')?.value || '').trim().toLowerCase();
  const userId = String(document.getElementById('audit-user')?.value || 'todos');

  const tsDe = de ? new Date(`${de}T00:00:00`).getTime() : null;
  const tsAte = ate ? new Date(`${ate}T23:59:59`).getTime() : null;

  auditoriaFiltrada = (state.auditoria || []).filter(a => {
    if (tsDe && Number(a.ts) < tsDe) return false;
    if (tsAte && Number(a.ts) > tsAte) return false;
    if (userId !== 'todos' && String(a.userId || '') !== userId) return false;
    if (busca) {
      const t = String(a.tipo || '').toLowerCase();
      const u = String(a.userNome || '').toLowerCase();
      if (!t.includes(busca) && !u.includes(busca)) return false;
    }
    return true;
  });

  const max = 200;
  const itens = auditoriaFiltrada.slice(0, max);
  list.innerHTML = itens.length === 0
    ? '<p class="empty-msg">Nenhum registro encontrado.</p>'
    : itens.map(a => `
        <div class="simple-item">
          <span>
            <b>${a.hora || ''}</b> ${a.data || ''} · ${a.userNome || '-'} (${(a.userPapel || '-').toUpperCase()})<br>
            <span style="color:#555; font-size:12px">${a.tipo || ''}</span>
          </span>
        </div>
      `).join('') + (auditoriaFiltrada.length > max ? `<p class="empty-msg">Mostrando ${max} de ${auditoriaFiltrada.length}.</p>` : '');
}

function renderManutencaoMesas(state) {
  const list = document.getElementById('lista-manutencao-mesas');
  if (!list) return;

  const mesas = Object.values(state.mesas);
  if (mesas.length === 0) {
    list.innerHTML = '<p class="empty-msg">Nenhuma mesa cadastrada.</p>';
    return;
  }

  list.innerHTML = mesas.map(m => {
    const total = store.calcTotalMesa(m.itens);
    const badgeClass = m.status === 'ocupada' ? (total > 0 ? 'green' : 'amber') : 'gray';
    
    return `
      <div class="simple-item">
        <span>${m.tipo === 'online' ? '🌐 Pedido' : '🪑 Mesa'} ${m.id}</span>
        <div class="row" style="gap:8px">
          ${m.tipo !== 'online'
            ? `<button class="btn btn-sm" onclick="app.qrMesa(${m.id})">📱 QR</button>
               <button class="btn btn-sm" onclick="app.resetTokenMesa(${m.id})" title="Resetar token do QR">♻️</button>`
            : ''
          }
          <span class="badge badge-${badgeClass}">${m.status}</span>
          <button class="remove-btn" onclick="app.removerMesa(${m.id})" ${m.status === 'ocupada' ? 'disabled style="opacity:0.3"' : ''}>×</button>
        </div>
      </div>
    `;
  }).join('');
}

function _mostrarQrMesa(mesaId) {
  try {
    const token = store.garantirTokenMesa(mesaId);
    const base = `${window.location.origin}${window.location.pathname}`;
    const link = `${base}?cliente=1&mesa=${Number(mesaId) || 0}&token=${encodeURIComponent(token)}`;
    const qr = `https://quickchart.io/qr?text=${encodeURIComponent(link)}&size=320&margin=1`;
    _verImagem(qr, `Mesa ${mesaId} · QR Code`);
    setTimeout(() => {
      try { navigator.clipboard?.writeText?.(link); } catch {}
      try { window.prompt('Link do QR (copie e cole):', link); } catch {}
    }, 50);
  } catch (e) {
    alert(e.message || String(e));
  }
}

function _resetTokenMesa(mesaId) {
  if (!confirm(`Resetar o token do QR da Mesa ${mesaId}?\n\nQualquer QR antigo vai parar de funcionar.`)) return;
  try {
    store.resetarTokenMesa(mesaId);
    _mostrarQrMesa(mesaId);
  } catch (e) {
    alert(e.message || String(e));
  }
}

function _bootClienteMode() {
  document.body.classList.add('cliente-mode');
  const header = document.querySelector('header.topbar');
  const main = document.querySelector('main.main');
  if (header) header.style.display = 'none';
  if (main) main.style.display = 'none';

  const root = document.createElement('div');
  root.id = 'cliente-root';
  root.className = 'cliente-root';
  document.body.appendChild(root);

  const _flowKind = (Number(_urlParams.get('mesa')) || 0) ? 'mesa' : 'online';
  let mesaId = Number(_urlParams.get('mesa')) || 0;
  let token = String(_urlParams.get('token') || '').trim();
  let authToken = '';
  let clienteMe = null;
  let authMode = 'login';
  let authNome = '';
  let authApelido = '';
  let authTelefone = '';
  let authSenha = '';
  let step = 'menu';
  let navTab = 'home';
  let bagOpen = false;
  let authModalOpen = false;

  let clienteEntregaTipo = 'entrega';
  let clienteEnderecoTexto = '';
  let clienteReferencia = '';
  let clienteMapsUrl = '';
  let clienteLat = '';
  let clienteLng = '';
  let clienteFormaPagamento = '';
  let clienteTrocoPara = '';
  let clienteObservacao = '';
  let tipoLista = 'all';
  let pedidos = [];
  let pedidosLoading = false;
  try {
    authToken = localStorage.getItem('clienteAuthToken') || '';
    authNome = localStorage.getItem('clienteNome') || '';
    authTelefone = localStorage.getItem('clienteTelefone') || '';
    authApelido = localStorage.getItem('clienteApelido') || '';
    clienteEntregaTipo = localStorage.getItem('clienteEntregaTipo') || 'entrega';
    clienteEnderecoTexto = localStorage.getItem('clienteEnderecoTexto') || '';
    clienteReferencia = localStorage.getItem('clienteReferencia') || '';
    clienteMapsUrl = localStorage.getItem('clienteMapsUrl') || '';
    clienteLat = localStorage.getItem('clienteLat') || '';
    clienteLng = localStorage.getItem('clienteLng') || '';
    clienteFormaPagamento = localStorage.getItem('clienteFormaPagamento') || '';
    clienteTrocoPara = localStorage.getItem('clienteTrocoPara') || '';
    clienteObservacao = localStorage.getItem('clienteObservacao') || '';
  } catch {}

  const cart = new Map();
  let menu = { empresa: null, categorias: [], formasPagamento: [], produtos: [] };
  let cat = '';
  let q = '';
  let status = '';
  let orderInfo = null;
  let orderItens = [];
  let _statusTimer = null;

  function _tituloMesa() {
    return mesaId ? `Pedido ${mesaId}` : 'Pedido Online';
  }

  function _normalizarTelefoneBR(v) {
    const raw = String(v || '').trim();
    if (!raw) return '';
    let d = raw.replace(/\D+/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = d.replace(/^0+/, '');
    if (d.startsWith('55')) return d;
    if (d.length === 10 || d.length === 11) return `55${d}`;
    return d;
  }

  async function _apiFetch(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (!headers['Content-Type'] && opts.body) headers['Content-Type'] = 'application/json';
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return fetch(path, { ...opts, headers });
  }

  async function _loadMe() {
    if (!_flowKind || _flowKind !== 'online') return;
    if (!authToken) { clienteMe = null; return; }
    try {
      const r = await _apiFetch('/api/client/me', { method: 'GET' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'Falha');
      clienteMe = j?.cliente || null;
      try {
        if (clienteMe?.nome) localStorage.setItem('clienteNome', String(clienteMe.nome || ''));
        if (clienteMe?.telefone) localStorage.setItem('clienteTelefone', String(clienteMe.telefone || ''));
        if (clienteMe?.apelido) localStorage.setItem('clienteApelido', String(clienteMe.apelido || ''));
      } catch {}
    } catch {
      clienteMe = null;
      authToken = '';
      try { localStorage.removeItem('clienteAuthToken'); } catch {}
    }
  }

  async function _loadPedidos() {
    if (pedidosLoading) return;
    pedidosLoading = true;
    try {
      const r = await _apiFetch('/api/client/orders', { method: 'GET' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'Falha');
      pedidos = Array.isArray(j?.pedidos) ? j.pedidos : [];
    } catch {
      pedidos = [];
    } finally {
      pedidosLoading = false;
    }
  }

  async function _fetchStatus() {
    if (!mesaId || !token) return;
    try {
      const r = await fetch(`/api/client/order-status?mesaId=${encodeURIComponent(String(mesaId))}&token=${encodeURIComponent(String(token))}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) return;
      orderInfo = { mesa: j?.mesa || null, status: j?.status || null };
      orderItens = Array.isArray(j?.itens) ? j.itens : [];
      renderCliente();
    } catch {}
  }

  function _ensureStatusTimer() {
    if (!mesaId || !token) return;
    if (_statusTimer) return;
    _fetchStatus();
    _statusTimer = setInterval(_fetchStatus, 3500);
  }

  function _persistCliente() {
    try {
      localStorage.setItem('clienteEntregaTipo', String(clienteEntregaTipo || 'entrega'));
      localStorage.setItem('clienteEnderecoTexto', String(clienteEnderecoTexto || ''));
      localStorage.setItem('clienteReferencia', String(clienteReferencia || ''));
      localStorage.setItem('clienteMapsUrl', String(clienteMapsUrl || ''));
      localStorage.setItem('clienteLat', String(clienteLat || ''));
      localStorage.setItem('clienteLng', String(clienteLng || ''));
      localStorage.setItem('clienteFormaPagamento', String(clienteFormaPagamento || ''));
      localStorage.setItem('clienteTrocoPara', String(clienteTrocoPara || ''));
      localStorage.setItem('clienteObservacao', String(clienteObservacao || ''));
    } catch {}
  }

  function _isCombo(p) {
    const t = String(p?.tipo || '').toLowerCase();
    if (t === 'combo') return true;
    const n = String(p?.nome || '').toLowerCase();
    const c = String(p?.cat || '').toLowerCase();
    const s = String(p?.subcat || '').toLowerCase();
    return c === 'combo' || s === 'combo' || n.includes('combo');
  }

  function _logout() {
    authToken = '';
    clienteMe = null;
    try { localStorage.removeItem('clienteAuthToken'); } catch {}
    step = 'auth';
    renderCliente();
  }

  function renderCliente() {
    const empresaNome = (menu?.empresa?.nome || 'Espetinho 075').trim();
    const cats = Array.isArray(menu?.categorias) ? menu.categorias.filter(Boolean) : [];
    const pgs = Array.isArray(menu?.formasPagamento) ? menu.formasPagamento.filter(Boolean) : [];
    const produtos = Array.isArray(menu?.produtos) ? menu.produtos : [];
    const isOnlineFlow = _flowKind === 'online';
    const pctOnline = Number.isFinite(Number(menu?.empresa?.precoOnlinePct)) ? Number(menu.empresa.precoOnlinePct) : 0;
    const precoLista = (p) => {
      const base = Number(p?.preco) || 0;
      if (!isOnlineFlow) return base;
      return Math.round((base * (1 + (pctOnline / 100))) * 100) / 100;
    };

    if (isOnlineFlow && !mesaId && !authToken) step = 'auth';
    if (mesaId && token) step = 'status';

    const qNorm = String(q || '').trim().toLowerCase();
    const itensCart = Array.from(cart.entries()).map(([id, qty]) => ({ id: Number(id) || 0, qty: Number(qty) || 0 })).filter(x => x.id && x.qty > 0);
    const cartById = new Map(itensCart.map(x => [x.id, x.qty]));

    if (!isOnlineFlow && tipoLista === 'combo') tipoLista = 'prod';
    const visiveis = produtos
      .filter(p => (tipoLista === 'combo' ? _isCombo(p) : (tipoLista === 'prod' ? !_isCombo(p) : true)))
      .filter(p => (isOnlineFlow ? true : !p?.somenteOnline))
      .filter(p => (cat ? p.cat === cat : true))
      .filter(p => (qNorm ? String(p.nome || '').toLowerCase().includes(qNorm) : true))
      .slice()
      .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

    const cartDetalhes = itensCart
      .map(it => {
        const p = produtos.find(x => Number(x.id) === Number(it.id));
        if (!p) return null;
        return { ...it, nome: p.nome, preco: precoLista(p) };
      })
      .filter(Boolean);
    const subtotalCart = cartDetalhes.reduce((soma, it) => soma + (Number(it.preco) || 0) * (Number(it.qty) || 0), 0);

    const statusLabel = String(orderInfo?.status?.label || '').trim();
    const showStatus = !!(mesaId && token && (statusLabel || orderItens.length));
    const ent = (String(clienteEntregaTipo || '').trim().toLowerCase() === 'retirada') ? 'retirada' : 'entrega';
    const showEndereco = isOnlineFlow && ent !== 'retirada';
    const pgLower = String(clienteFormaPagamento || '').toLowerCase();
    const showTroco = isOnlineFlow && pgLower.includes('dinheiro');
    const taxaPadrao = Number.isFinite(Number(menu?.empresa?.taxaEntregaPadrao)) ? Math.max(0, Number(menu.empresa.taxaEntregaPadrao)) : 0;
    const taxaEfetivaMesa = Number.isFinite(Number(orderInfo?.mesa?.taxaEntrega)) ? Math.max(0, Number(orderInfo.mesa.taxaEntrega)) : null;
    const taxaEntregaEfetiva = showEndereco ? (taxaEfetivaMesa !== null ? taxaEfetivaMesa : taxaPadrao) : 0;
    const totalFinal = subtotalCart + taxaEntregaEfetiva;

    const empresaTel = String(menu?.empresa?.telefone || '').trim();
    const empresaTelNorm = _normalizarTelefoneBR(empresaTel);
    const trackUrl = (mesaId && token) ? `${window.location.origin}${window.location.pathname}?cliente=1&mesa=${encodeURIComponent(String(mesaId))}&token=${encodeURIComponent(String(token))}` : '';
    const waMsg = mesaId ? `Olá! Quero falar sobre o Pedido Nº ${mesaId}.` : 'Olá! Quero fazer um pedido.';
    const waLink = empresaTelNorm ? `https://wa.me/${encodeURIComponent(empresaTelNorm)}?text=${encodeURIComponent(waMsg)}` : '';

    const isAuth = step === 'auth';
    const isMenu = step === 'menu';
    const isDelivery = step === 'delivery';
    const isPayment = step === 'payment';
    const isHistory = step === 'history';
    const canSeeWizard = isOnlineFlow && !!authToken && !mesaId;

    if (mesaId && token) navTab = 'orders';
    if (!mesaId && navTab === 'orders') navTab = 'home';
    if (!isOnlineFlow && navTab === 'profile') navTab = 'home';
    if (!isOnlineFlow && tipoLista === 'combo') tipoLista = 'prod';
    if (isOnlineFlow && !mesaId && authToken && step === 'auth') step = 'menu';

    const heroUrl = String(menu?.empresa?.logoUrl || '').trim() || '/assets/fundo.jpeg';
    const storeAddr = String(menu?.empresa?.endereco || '').trim();
    const showCartBar = !bagOpen && cartDetalhes.length > 0 && navTab === 'home';
    const showAuthModal = isOnlineFlow && (authModalOpen || (!authToken && navTab === 'profile') || (step === 'auth'));

    const homeHtml = `
      <div class="c-tabs" id="cliente-cats">
        <button class="c-tab ${!cat ? 'active' : ''}" data-cat="">Avisos</button>
        ${cats.map(c => `<button class="c-tab ${c === cat ? 'active' : ''}" data-cat="${String(c).replace(/"/g, '&quot;')}">${c}</button>`).join('')}
      </div>
      <div class="c-type" id="cliente-tipo">
        <button class="c-chip chip ${tipoLista === 'all' ? 'active' : ''}" data-t="all">Todos</button>
        <button class="c-chip chip ${tipoLista === 'prod' ? 'active' : ''}" data-t="prod">Produtos</button>
        ${isOnlineFlow ? `<button class="c-chip chip ${tipoLista === 'combo' ? 'active' : ''}" data-t="combo">Combos</button>` : ''}
      </div>
      <div class="c-prod-list prod-picker" id="cliente-prods">
        ${visiveis.map(p => {
          const inCart = cartById.get(Number(p.id)) || 0;
          const dis = !p.disponivel;
          return `
            <button class="c-prod prod-btn" data-id="${p.id}" ${dis ? 'disabled style="opacity:0.45"' : ''}>
              ${p.imagem ? `<img class="thumb" src="${p.imagem}" alt="" onerror="this.style.display='none'">` : `<div class="thumb placeholder">🖼️</div>`}
              <div class="c-prod-info">
                <div class="c-prod-nome">${p.nome}</div>
                <div class="c-prod-preco">${formatBRL(precoLista(p))}${inCart ? ` · ${inCart}x` : ''}${dis ? ' · Indisponível' : ''}</div>
              </div>
            </button>
          `;
        }).join('')}
      </div>
      <div id="cliente-prods-empty" class="empty-msg" style="display:${visiveis.length ? 'none' : 'block'}; padding:14px 0">Nenhum item encontrado.</div>
    `;

    const ordersHtml = `
      ${showStatus ? `
        <div class="card cliente-card" style="margin-top:12px">
          <div class="row" style="justify-content:space-between; margin-bottom:8px">
            <div style="font-weight:900">Status do pedido</div>
            <span class="badge badge-${statusLabel === 'Pronto' ? 'green' : statusLabel === 'Em preparo' ? 'amber' : 'blue'}">${statusLabel || '—'}</span>
          </div>
          <div class="row" style="gap:8px; margin-bottom:10px; flex-wrap:wrap; justify-content:flex-end">
            ${trackUrl ? `<button class="btn btn-sm" id="cliente-copiar-link">🔗 Copiar link</button>` : ''}
            ${waLink ? `<a class="btn btn-sm btn-primary" href="${waLink}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          </div>
          <div class="simple-list" style="gap:6px; margin-top:0">
            ${(orderItens || []).slice(0, 20).map(it => `
              <div class="simple-item">
                <span>${it.qty}x ${it.nome}</span>
                <span class="badge badge-${String(it.status||'').toLowerCase()==='entregue'?'green':String(it.status||'').toLowerCase()==='preparando'?'amber':'gray'}">${it.status}</span>
              </div>
            `).join('') || `<div class="empty-msg" style="padding:8px 0">Atualizando...</div>`}
          </div>
        </div>
      ` : `<div class="empty-msg" style="padding:18px 0">Nenhum pedido ativo.</div>`}
      ${isOnlineFlow ? `
        <div class="card cliente-card" style="margin-top:12px">
          <div style="font-weight:900; margin-bottom:10px">Histórico de pedidos</div>
          ${(pedidosLoading ? `<div class="empty-msg" style="padding:8px 0">Carregando...</div>` : '')}
          ${(!pedidosLoading && pedidos.length === 0) ? `<div class="empty-msg" style="padding:8px 0">Você ainda não possui pedidos nesta loja.</div>` : ''}
          <div class="simple-list" style="gap:8px">
            ${(!pedidosLoading ? pedidos.map(p => {
              const when = p.ts ? new Date(p.ts).toLocaleString('pt-BR') : '';
              const label = String(p?.status?.label || '').trim() || '—';
              return `
                <div class="simple-item" style="align-items:flex-start">
                  <span>
                    <b>Pedido ${p.mesaId}</b> · ${when}<br>
                    <span style="color:#555; font-size:12px">${label} · Total ${formatBRL(Number(p.total) || 0)}</span>
                  </span>
                  <div class="row" style="gap:8px">
                    ${p.trackUrl ? `<button class="btn btn-sm" data-act="open" data-url="${String(p.trackUrl).replace(/"/g, '&quot;')}">Ver</button>` : ''}
                  </div>
                </div>
              `;
            }).join('') : '')}
          </div>
        </div>
      ` : ''}
    `;

    const profileHtml = `
      <div class="card cliente-card" style="margin-top:12px">
        <div style="font-weight:900; margin-bottom:10px">Perfil</div>
        ${isOnlineFlow ? `
          ${authToken ? `
            <div class="simple-item"><span>Nome</span><span>${String(clienteMe?.apelido || clienteMe?.nome || '').trim() || '—'}</span></div>
            <div class="simple-item"><span>WhatsApp</span><span>${String(clienteMe?.telefone || '').trim() || '—'}</span></div>
            <div style="margin-top:12px">
              <button class="btn" id="c-logout" style="width:100%">Sair</button>
            </div>
          ` : `
            <div class="empty-msg" style="padding:8px 0">Faça login para ver seus pedidos e finalizar compras.</div>
            <button class="c-primary-btn" id="c-open-auth">Fazer login</button>
          `}
        ` : `
          <div class="empty-msg" style="padding:8px 0">Perfil disponível apenas no pedido online.</div>
        `}
      </div>
    `;

    const sheetHtml = bagOpen ? `
      <div class="c-sheet-backdrop" id="c-sheet">
        <div class="c-sheet" role="dialog" aria-modal="true">
          <div class="c-sheet-head">
            <div class="c-sheet-title">Sua sacola</div>
            <button class="c-x" id="c-close-bag">×</button>
          </div>

          ${isOnlineFlow ? `
            <div style="margin-top:12px">
              <button class="c-action" id="c-calc-delivery">Calcular taxa de entrega</button>
            </div>
          ` : ''}

          <div style="margin-top:12px" id="cliente-cart">
            ${cartDetalhes.length
              ? cartDetalhes.map(it => `
                  <div class="item-row">
                    <div class="item-info">
                      <div class="item-nome">${it.nome}</div>
                      <div class="item-preco">${formatBRL(it.preco)} · ${it.qty}x</div>
                    </div>
                    <div class="row" style="gap:6px">
                      <button class="qty-btn" data-act="dec" data-id="${it.id}">−</button>
                      <button class="qty-btn" data-act="inc" data-id="${it.id}">+</button>
                      <button class="remove-btn" data-act="rm" data-id="${it.id}">×</button>
                    </div>
                  </div>
                `).join('')
              : `<div class="empty-msg" style="padding:10px 0">Sua sacola está vazia.</div>`
            }
          </div>

          <div style="margin-top:12px">
            <button class="c-muted-btn" id="c-add-more">Adicionar mais itens</button>
          </div>

          <div class="c-totals">
            <div class="row"><span>Subtotal</span><span>${formatBRL(subtotalCart)}</span></div>
            <div class="row" style="opacity:${taxaEntregaEfetiva > 0 ? '1' : '0.6'}"><span>Taxa de entrega</span><span>${formatBRL(taxaEntregaEfetiva)}</span></div>
            <div class="row" style="font-weight:900; font-size:16px; color:#111; margin-top:8px"><span>Total</span><span>${formatBRL(totalFinal)}</span></div>
          </div>

          ${isOnlineFlow ? `
            <div style="margin-top:12px">
              <div class="simple-item">
                <span>Tem um cupom?<br><span style="color:#777; font-size:12px">Clique e insira o código</span></span>
                <span>›</span>
              </div>
            </div>
          ` : ''}

          ${(canSeeWizard || _flowKind === 'mesa') ? `
            <div style="margin-top:14px">
              ${isOnlineFlow ? `
                ${step === 'delivery' ? `
                  <div style="font-weight:900; margin-bottom:10px">Entrega</div>
                  <div class="row" style="gap:10px; margin-bottom:10px; flex-wrap:wrap">
                    <div class="form-group" style="flex:1; min-width:180px">
                      <label style="font-size:12px; font-weight:700; color:#666">Entrega ou Retirada</label>
                      <select id="cliente-entrega-tipo" style="width:100%; padding:10px 12px; border:var(--border); border-radius:12px; font-family:var(--font); font-size:13px; background:rgba(255,255,255,0.95)">
                        <option value="entrega" ${ent === 'entrega' ? 'selected' : ''}>Entrega</option>
                        <option value="retirada" ${ent === 'retirada' ? 'selected' : ''}>Retirada</option>
                      </select>
                    </div>
                  </div>
                  ${showEndereco ? `
                    <div class="row" style="gap:10px; margin-bottom:10px; flex-wrap:wrap">
                      <div class="form-group" style="flex:2; min-width:220px">
                        <label style="font-size:12px; font-weight:700; color:#666">Endereço completo</label>
                        <textarea id="cliente-endereco" rows="2" placeholder="Rua, número, bairro, cidade" style="width:100%; padding:10px 12px; border:var(--border); border-radius:12px; font-family:var(--font); font-size:13px; background:rgba(255,255,255,0.95)">${String(clienteEnderecoTexto || '').replace(/</g, '&lt;')}</textarea>
                      </div>
                      <div class="form-group" style="flex:1; min-width:180px">
                        <label style="font-size:12px; font-weight:700; color:#666">Ponto de referência</label>
                        <input id="cliente-referencia" type="text" placeholder="Ex: perto da farmácia" value="${String(clienteReferencia || '').replace(/"/g, '&quot;')}" />
                      </div>
                    </div>
                    <div class="row" style="gap:8px; margin-bottom:10px; flex-wrap:wrap; justify-content:flex-end">
                      <button class="btn btn-sm" id="cliente-geo">📍 Usar localização atual</button>
                      <button class="btn btn-sm" id="cliente-maps">🗺️ Abrir Maps</button>
                    </div>
                    <div class="row" style="gap:10px; margin-bottom:10px; flex-wrap:wrap">
                      <div class="form-group" style="flex:1; min-width:220px">
                        <label style="font-size:12px; font-weight:700; color:#666">Link do Maps (opcional)</label>
                        <input id="cliente-maps-url" type="url" placeholder="Cole aqui o link compartilhado" value="${String(clienteMapsUrl || '').replace(/"/g, '&quot;')}" />
                      </div>
                    </div>
                  ` : ''}
                ` : ''}

                ${(step === 'payment') ? `
                  <div style="font-weight:900; margin-bottom:10px">Pagamento</div>
                  <div class="row" style="gap:10px; margin-top:10px; flex-wrap:wrap">
                    <div class="form-group" style="flex:1; min-width:180px">
                      <label style="font-size:12px; font-weight:700; color:#666">Forma de pagamento</label>
                      <select id="cliente-pagamento" style="width:100%; padding:10px 12px; border:var(--border); border-radius:12px; font-family:var(--font); font-size:13px; background:rgba(255,255,255,0.95)">
                        <option value="">Selecione...</option>
                        ${(pgs.length ? pgs : ['Dinheiro', 'PIX', 'Cartão']).map(pg => `<option value="${String(pg).replace(/"/g, '&quot;')}" ${String(clienteFormaPagamento||'')===String(pg)?'selected':''}>${pg}</option>`).join('')}
                      </select>
                    </div>
                    ${showTroco ? `
                      <div class="form-group" style="flex:1; min-width:180px">
                        <label style="font-size:12px; font-weight:700; color:#666">Troco para (R$)</label>
                        <input id="cliente-troco" type="number" placeholder="0.00" min="0" step="0.01" value="${String(clienteTrocoPara || '').replace(/"/g, '&quot;')}" />
                      </div>
                    ` : ''}
                  </div>
                  <div class="row" style="gap:10px; margin-top:10px; flex-wrap:wrap">
                    <div class="form-group" style="flex:1; min-width:220px">
                      <label style="font-size:12px; font-weight:700; color:#666">Observações (opcional)</label>
                      <textarea id="cliente-obs" rows="2" placeholder="Ex: sem cebola, caprichar no molho...">${String(clienteObservacao || '').replace(/</g, '&lt;')}</textarea>
                    </div>
                  </div>
                ` : ''}
              ` : ''}

              <div class="row" style="gap:10px; margin-top:12px; flex-wrap:wrap">
                <button class="btn" id="cliente-limpar" style="flex:1" ${cartDetalhes.length ? '' : 'disabled style="opacity:0.4"'}>Limpar</button>
                ${canSeeWizard ? `
                  ${step === 'menu' ? `<button class="c-primary-btn" id="c-next-menu" style="flex:1" ${cartDetalhes.length ? '' : 'disabled style="opacity:0.45"'}>Continuar pedido</button>` : ''}
                  ${step === 'delivery' ? `<button class="c-primary-btn" id="c-next-delivery" style="flex:1" ${cartDetalhes.length ? '' : 'disabled style="opacity:0.45"'}>Ir para pagamento</button>` : ''}
                  ${step === 'payment' ? `<button class="c-primary-btn" id="cliente-enviar" style="flex:1" ${cartDetalhes.length ? '' : 'disabled style="opacity:0.45"'}>Confirmar pedido</button>` : ''}
                ` : `<button class="c-primary-btn" id="cliente-enviar" style="flex:1" ${cartDetalhes.length ? '' : 'disabled style="opacity:0.45"'}>Continuar pedido</button>`}
              </div>
              <div class="empty-msg" id="cliente-status" style="padding:10px 0; display:${status ? 'block' : 'none'}">${status || ''}</div>
            </div>
          ` : ''}
        </div>
      </div>
    ` : '';

    const authHtml = showAuthModal ? `
      <div class="c-modal-backdrop" id="c-auth-modal">
        <div class="c-modal" role="dialog" aria-modal="true">
          <div class="c-modal-head">
            <div class="c-modal-title">Fazer login</div>
            <button class="c-x" id="c-close-auth">×</button>
          </div>
          <div style="margin-top:12px">
            <div class="row" style="gap:8px; margin-bottom:10px">
              <button class="chip ${authMode === 'login' ? 'active' : ''}" id="c-auth-login">Entrar</button>
              <button class="chip ${authMode === 'register' ? 'active' : ''}" id="c-auth-register">Cadastrar</button>
            </div>
            ${authMode === 'register' ? `
              <div class="row" style="gap:10px; margin-bottom:10px; flex-wrap:wrap">
                <div class="form-group" style="flex:1; min-width:180px">
                  <label style="font-size:12px; font-weight:700; color:#666">Seu nome</label>
                  <input id="c-auth-nome" type="text" value="${String(authNome || '').replace(/"/g, '&quot;')}" />
                </div>
                <div class="form-group" style="flex:1; min-width:180px">
                  <label style="font-size:12px; font-weight:700; color:#666">Como quer ser chamado</label>
                  <input id="c-auth-apelido" type="text" value="${String(authApelido || '').replace(/"/g, '&quot;')}" />
                </div>
              </div>
            ` : ''}
            <div class="row" style="gap:10px; margin-bottom:10px; flex-wrap:wrap">
              <div class="form-group" style="flex:1; min-width:180px">
                <label style="font-size:12px; font-weight:700; color:#666">WhatsApp</label>
                <input id="c-auth-tel" type="tel" value="${String(authTelefone || '').replace(/"/g, '&quot;')}" />
              </div>
              <div class="form-group" style="flex:1; min-width:180px">
                <label style="font-size:12px; font-weight:700; color:#666">Senha</label>
                <input id="c-auth-senha" type="password" value="" />
              </div>
            </div>
            <button class="c-primary-btn" id="c-auth-submit">${authMode === 'login' ? 'Entrar' : 'Cadastrar'}</button>
            <div class="empty-msg" id="cliente-status" style="padding:10px 0; display:${status ? 'block' : 'none'}">${status || ''}</div>
          </div>
        </div>
      </div>
    ` : '';

    root.innerHTML = `
      <div class="c-shell">
        <div class="c-hero" style="background-image:url('${heroUrl.replace(/"/g, '&quot;')}')">
          <div class="c-hero-inner">
            <div class="c-search">
              <span style="font-weight:900">🔎</span>
              <input id="cliente-busca" type="search" placeholder="Buscar no cardápio" value="${String(q || '').replace(/"/g, '&quot;')}" />
            </div>
          </div>
        </div>

        <div class="c-wrap c-store">
          <div class="c-store-card">
            <div class="c-store-name">${empresaNome}</div>
            <div class="c-store-sub">${storeAddr ? storeAddr : _tituloMesa()}</div>
            ${isOnlineFlow ? `
              <div class="c-action-row">
                <button class="c-action" id="c-calc-delivery">Calcular taxa de entrega</button>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="c-wrap" style="padding-top:12px; padding-bottom:16px">
          ${navTab === 'home' ? homeHtml : (navTab === 'orders' ? ordersHtml : profileHtml)}
        </div>

        ${showCartBar ? `
          <div class="c-cartbar" id="c-cartbar">
            <div style="display:flex; align-items:center; gap:10px">
              <span style="font-weight:900">🛍️</span>
              <span style="font-weight:900">${formatBRL(subtotalCart)}</span>
            </div>
            <button id="c-open-bag">Ver sacola</button>
          </div>
        ` : ''}

        <div class="c-bottomnav" id="c-bottomnav">
          <button class="c-navbtn ${navTab === 'home' ? 'active' : ''}" data-tab="home"><span class="c-ico">⌂</span><span>Home</span></button>
          <button class="c-navbtn ${navTab === 'orders' ? 'active' : ''}" data-tab="orders"><span class="c-ico">🧾</span><span>Pedidos</span></button>
          <button class="c-navbtn ${navTab === 'profile' ? 'active' : ''}" data-tab="profile"><span class="c-ico">👤</span><span>Perfil</span></button>
        </div>

        ${sheetHtml}
        ${authHtml}
      </div>
    `;

    const btnLogout = root.querySelector('#c-logout');
    if (btnLogout) btnLogout.addEventListener('click', _logout);

    const navEl = root.querySelector('#c-bottomnav');
    if (navEl) {
      navEl.addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-tab]');
        if (!b) return;
        const t = String(b.getAttribute('data-tab') || 'home');
        navTab = (t === 'orders' ? 'orders' : (t === 'profile' ? 'profile' : 'home'));
        if (navTab === 'profile' && isOnlineFlow && !authToken) authModalOpen = true;
        if (navTab === 'orders' && isOnlineFlow && authToken) await _loadPedidos();
        renderCliente();
      });
    }

    const btnOpenBag = root.querySelector('#c-open-bag');
    if (btnOpenBag) {
      btnOpenBag.addEventListener('click', () => {
        bagOpen = true;
        if (canSeeWizard && (step !== 'menu' && step !== 'delivery' && step !== 'payment')) step = 'menu';
        renderCliente();
      });
    }

    const btnCloseBag = root.querySelector('#c-close-bag');
    if (btnCloseBag) {
      btnCloseBag.addEventListener('click', () => {
        bagOpen = false;
        renderCliente();
      });
    }

    const sheetEl = root.querySelector('#c-sheet');
    if (sheetEl) {
      sheetEl.addEventListener('click', (e) => {
        if (e.target === sheetEl) {
          bagOpen = false;
          renderCliente();
        }
      });
    }

    const btnAddMore = root.querySelector('#c-add-more');
    if (btnAddMore) {
      btnAddMore.addEventListener('click', () => {
        bagOpen = false;
        navTab = 'home';
        if (canSeeWizard) step = 'menu';
        renderCliente();
      });
    }

    const btnCalcDelivery = root.querySelector('#c-calc-delivery');
    if (btnCalcDelivery) {
      btnCalcDelivery.addEventListener('click', () => {
        if (isOnlineFlow && !mesaId && authToken) step = 'delivery';
        bagOpen = true;
        renderCliente();
      });
    }

    const btnOpenAuth = root.querySelector('#c-open-auth');
    if (btnOpenAuth) {
      btnOpenAuth.addEventListener('click', () => {
        if (!isOnlineFlow) return;
        authModalOpen = true;
        renderCliente();
      });
    }

    const btnCloseAuth = root.querySelector('#c-close-auth');
    if (btnCloseAuth) {
      btnCloseAuth.addEventListener('click', () => {
        authModalOpen = false;
        if (!authToken && navTab === 'profile') navTab = 'home';
        renderCliente();
      });
    }

    const authModalEl = root.querySelector('#c-auth-modal');
    if (authModalEl) {
      authModalEl.addEventListener('click', (e) => {
        if (e.target === authModalEl) {
          authModalOpen = false;
          if (!authToken && navTab === 'profile') navTab = 'home';
          renderCliente();
        }
      });
    }

    const btnStepAuth = root.querySelector('#c-step-auth');
    const btnStepMenu = root.querySelector('#c-step-menu');
    const btnStepDelivery = root.querySelector('#c-step-delivery');
    const btnStepPayment = root.querySelector('#c-step-payment');
    const btnStepHistory = root.querySelector('#c-step-history');
    if (btnStepAuth) btnStepAuth.addEventListener('click', () => { step = 'auth'; renderCliente(); });
    if (btnStepMenu) btnStepMenu.addEventListener('click', () => { if (authToken && !mesaId) { step = 'menu'; renderCliente(); } });
    if (btnStepDelivery) btnStepDelivery.addEventListener('click', () => { if (authToken && !mesaId) { step = 'delivery'; renderCliente(); } });
    if (btnStepPayment) btnStepPayment.addEventListener('click', () => { if (authToken && !mesaId) { step = 'payment'; renderCliente(); } });
    if (btnStepHistory) btnStepHistory.addEventListener('click', async () => { if (authToken) { step = 'history'; await _loadPedidos(); renderCliente(); } });

    const btnAuthLogin = root.querySelector('#c-auth-login');
    const btnAuthRegister = root.querySelector('#c-auth-register');
    if (btnAuthLogin) btnAuthLogin.addEventListener('click', () => { authMode = 'login'; status = ''; renderCliente(); });
    if (btnAuthRegister) btnAuthRegister.addEventListener('click', () => { authMode = 'register'; status = ''; renderCliente(); });
    const btnAuthSubmit = root.querySelector('#c-auth-submit');
    if (btnAuthSubmit) {
      btnAuthSubmit.addEventListener('click', async () => {
        const nome = String(root.querySelector('#c-auth-nome')?.value || '').trim();
        const ap = String(root.querySelector('#c-auth-apelido')?.value || '').trim();
        const tel = String(root.querySelector('#c-auth-tel')?.value || '').trim();
        const senha = String(root.querySelector('#c-auth-senha')?.value || '').trim();
        if (authMode === 'register' && !nome) { status = 'Informe seu nome.'; renderCliente(); return; }
        if (!tel) { status = 'Informe seu WhatsApp/telefone.'; renderCliente(); return; }
        if (!senha) { status = 'Informe sua senha.'; renderCliente(); return; }
        status = 'Enviando...';
        renderCliente();
        try {
          const endpoint = authMode === 'register' ? '/api/client/register' : '/api/client/login';
          const body = authMode === 'register' ? { nome, apelido: ap, telefone: tel, senha } : { telefone: tel, senha };
          const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j?.ok) { status = String(j?.error || 'Falha.'); renderCliente(); return; }
          authToken = String(j?.token || '');
          try { localStorage.setItem('clienteAuthToken', authToken); } catch {}
          authNome = nome || authNome;
          authApelido = ap || authApelido;
          authTelefone = tel || authTelefone;
          try {
            if (authNome) localStorage.setItem('clienteNome', authNome);
            if (authApelido) localStorage.setItem('clienteApelido', authApelido);
            if (authTelefone) localStorage.setItem('clienteTelefone', authTelefone);
          } catch {}
          status = '';
          await _loadMe();
          step = 'menu';
          authModalOpen = false;
          if (navTab === 'profile') navTab = 'home';
          renderCliente();
        } catch {
          status = 'Sem conexão. Tente novamente.';
          renderCliente();
        }
      });
    }

    const busca = root.querySelector('#cliente-busca');
    if (busca) {
      busca.addEventListener('input', (e) => {
        q = String(e.target.value || '');
        renderCliente();
      });
    }

    const selEntrega = root.querySelector('#cliente-entrega-tipo');
    if (selEntrega) {
      selEntrega.addEventListener('change', (e) => {
        clienteEntregaTipo = String(e.target.value || 'entrega');
        _persistCliente();
        renderCliente();
      });
    }
    const selPg = root.querySelector('#cliente-pagamento');
    if (selPg) {
      selPg.addEventListener('change', (e) => {
        clienteFormaPagamento = String(e.target.value || '');
        if (!String(clienteFormaPagamento || '').toLowerCase().includes('dinheiro')) clienteTrocoPara = '';
        _persistCliente();
        renderCliente();
      });
    }
    const taEnd = root.querySelector('#cliente-endereco');
    if (taEnd) {
      taEnd.addEventListener('input', (e) => {
        clienteEnderecoTexto = String(e.target.value || '');
        _persistCliente();
      });
    }
    const inpRef = root.querySelector('#cliente-referencia');
    if (inpRef) {
      inpRef.addEventListener('input', (e) => {
        clienteReferencia = String(e.target.value || '');
        _persistCliente();
      });
    }
    const inpMapsUrl = root.querySelector('#cliente-maps-url');
    if (inpMapsUrl) {
      inpMapsUrl.addEventListener('input', (e) => {
        clienteMapsUrl = String(e.target.value || '');
        _persistCliente();
      });
    }
    const inpTroco = root.querySelector('#cliente-troco');
    if (inpTroco) {
      inpTroco.addEventListener('input', (e) => {
        clienteTrocoPara = String(e.target.value || '');
        _persistCliente();
      });
    }
    const taObs = root.querySelector('#cliente-obs');
    if (taObs) {
      taObs.addEventListener('input', (e) => {
        clienteObservacao = String(e.target.value || '');
        _persistCliente();
      });
    }
    const btnGeo = root.querySelector('#cliente-geo');
    if (btnGeo) {
      btnGeo.addEventListener('click', () => {
        if (!navigator.geolocation) {
          status = 'Geolocalização não disponível.';
          renderCliente();
          return;
        }
        status = 'Capturando localização...';
        renderCliente();
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const la = Number(pos?.coords?.latitude);
            const lo = Number(pos?.coords?.longitude);
            if (!Number.isFinite(la) || !Number.isFinite(lo)) {
              status = 'Não foi possível obter a localização.';
              renderCliente();
              return;
            }
            clienteLat = String(la);
            clienteLng = String(lo);
            clienteMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${la},${lo}`)}`;
            _persistCliente();
            status = 'Localização capturada.';
            renderCliente();
          },
          () => {
            status = 'Permissão de localização negada.';
            renderCliente();
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    }
    const btnMaps = root.querySelector('#cliente-maps');
    if (btnMaps) {
      btnMaps.addEventListener('click', () => {
        const la = Number(clienteLat);
        const lo = Number(clienteLng);
        const url = (Number.isFinite(la) && Number.isFinite(lo))
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${la},${lo}`)}`
          : 'https://www.google.com/maps';
        try { window.open(url, '_blank'); } catch { window.location.href = url; }
      });
    }

    const btnCopiar = root.querySelector('#cliente-copiar-link');
    if (btnCopiar) {
      btnCopiar.addEventListener('click', async () => {
        if (!trackUrl) return;
        try {
          await navigator.clipboard?.writeText?.(trackUrl);
          status = 'Link copiado.';
        } catch {
          try { window.prompt('Copie o link:', trackUrl); } catch {}
          status = 'Link pronto para copiar.';
        }
        renderCliente();
      });
    }

    const tipoEl = root.querySelector('#cliente-tipo');
    if (tipoEl) {
      tipoEl.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-t]');
        if (!b) return;
        const t = String(b.getAttribute('data-t') || 'all');
        tipoLista = (t === 'combo' ? 'combo' : (t === 'prod' ? 'prod' : 'all'));
        renderCliente();
      });
    }

    const catsEl = root.querySelector('#cliente-cats');
    if (catsEl) {
      catsEl.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-cat]');
        if (!b) return;
        cat = String(b.getAttribute('data-cat') || '');
        renderCliente();
      });
    }

    const prodsEl = root.querySelector('#cliente-prods');
    if (prodsEl) {
      prodsEl.addEventListener('click', (e) => {
        const b = e.target.closest('.prod-btn');
        if (!b) return;
        const id = Number(b.getAttribute('data-id')) || 0;
        if (!id) return;
        const prev = Number(cart.get(id)) || 0;
        cart.set(id, prev + 1);
        status = '';
        renderCliente();
      });
    }

    const cartEl = root.querySelector('#cliente-cart');
    if (cartEl) {
      cartEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const act = btn.getAttribute('data-act') || '';
        const id = Number(btn.getAttribute('data-id')) || 0;
        if (!id) return;
        const prev = Number(cart.get(id)) || 0;
        if (act === 'inc') cart.set(id, prev + 1);
        if (act === 'dec') {
          const next = Math.max(0, prev - 1);
          if (next <= 0) cart.delete(id);
          else cart.set(id, next);
        }
        if (act === 'rm') cart.delete(id);
        status = '';
        renderCliente();
      });
    }

    const btnLimpar = root.querySelector('#cliente-limpar');
    if (btnLimpar) {
      btnLimpar.addEventListener('click', () => {
        cart.clear();
        status = '';
        renderCliente();
      });
    }

    const btnNextMenu = root.querySelector('#c-next-menu');
    if (btnNextMenu) {
      btnNextMenu.addEventListener('click', () => {
        if (!itensCart.length) return;
        step = 'delivery';
        status = '';
        renderCliente();
      });
    }
    const btnNextDelivery = root.querySelector('#c-next-delivery');
    if (btnNextDelivery) {
      btnNextDelivery.addEventListener('click', () => {
        if (!itensCart.length) return;
        const entNow = (String(clienteEntregaTipo || '').trim().toLowerCase() === 'retirada') ? 'retirada' : 'entrega';
        const hasLatLng = Number.isFinite(Number(clienteLat)) && Number.isFinite(Number(clienteLng));
        const hasEndereco = !!String(clienteEnderecoTexto || '').trim() || !!String(clienteMapsUrl || '').trim() || hasLatLng;
        if (entNow === 'entrega' && !hasEndereco) { status = 'Informe o endereço de entrega.'; renderCliente(); return; }
        step = 'payment';
        status = '';
        renderCliente();
      });
    }

    const btnEnviar = root.querySelector('#cliente-enviar');
    if (btnEnviar) {
      btnEnviar.addEventListener('click', async () => {
        const payloadItens = Array.from(cart.entries()).map(([id, qty]) => ({ produtoId: Number(id) || 0, qty: Number(qty) || 0 })).filter(x => x.produtoId && x.qty > 0);
        if (!payloadItens.length) return;
        if (mesaId > 0 && !token) {
          status = 'Link inválido. Leia o QR Code novamente.';
          renderCliente();
          return;
        }
        if (!mesaId && isOnlineFlow && !authToken) {
          status = 'Faça login.';
          step = 'auth';
          authModalOpen = true;
          bagOpen = false;
          navTab = 'profile';
          renderCliente();
          return;
        }
        if (isOnlineFlow) {
          const entNow = (String(clienteEntregaTipo || '').trim().toLowerCase() === 'retirada') ? 'retirada' : 'entrega';
          const hasLatLng = Number.isFinite(Number(clienteLat)) && Number.isFinite(Number(clienteLng));
          const hasEndereco = !!String(clienteEnderecoTexto || '').trim() || !!String(clienteMapsUrl || '').trim() || hasLatLng;
          if (entNow === 'entrega' && !hasEndereco) { status = 'Informe o endereço de entrega.'; renderCliente(); return; }
          if (!String(clienteFormaPagamento || '').trim()) { status = 'Escolha a forma de pagamento.'; renderCliente(); return; }
        }
        status = 'Enviando...';
        renderCliente();
        try {
          const r = await _apiFetch('/api/client/order', {
            method: 'POST',
            body: JSON.stringify({
              mesaId: mesaId || 0,
              token: token || '',
              itens: payloadItens,
              cliente: {
                entregaTipo: clienteEntregaTipo,
                enderecoTexto: clienteEnderecoTexto,
                referencia: clienteReferencia,
                mapsUrl: clienteMapsUrl,
                lat: clienteLat,
                lng: clienteLng,
                formaPagamento: clienteFormaPagamento,
                trocoPara: clienteTrocoPara,
                observacao: clienteObservacao,
              },
            }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j?.ok) {
            status = String(j?.error || 'Falha ao enviar pedido.');
            renderCliente();
            return;
          }
          cart.clear();
          const newMesaId = Number(j?.mesaId) || 0;
          const newToken = String(j?.token || '').trim();
          if (!mesaId && newMesaId && newToken) {
            mesaId = newMesaId;
            token = newToken;
            try {
              history.replaceState(null, '', `?cliente=1&mesa=${encodeURIComponent(String(mesaId))}&token=${encodeURIComponent(String(token))}`);
            } catch {}
          }
          const label = String(j?.status?.label || '').trim();
          status = newMesaId ? `Pedido enviado! Nº ${newMesaId}${label ? ` · ${label}` : ''}.` : 'Pedido enviado!';
          renderCliente();
          _ensureStatusTimer();
        } catch (e) {
          status = 'Sem conexão. Tente novamente.';
          renderCliente();
        }
      });
    }

    const histEl = root.querySelector('.simple-list');
    if (histEl) {
      histEl.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act="open"]');
        if (!b) return;
        const u = String(b.getAttribute('data-url') || '');
        if (!u) return;
        try { window.location.href = u; } catch {}
      });
    }
  }

  fetch('/api/client/menu')
    .then(r => r.json())
    .then(j => {
      if (!j?.ok) throw new Error(j?.error || 'Falha ao carregar cardápio.');
      menu = j?.data || { empresa: null, categorias: [], produtos: [] };
      _loadMe().finally(() => {
        if (_flowKind === 'online' && !mesaId && authToken) step = 'menu';
        renderCliente();
      });
      _ensureStatusTimer();
    })
    .catch(() => {
      status = 'Falha ao carregar cardápio.';
      renderCliente();
    });
}

// ─── Caixa ───────────────────────────────────────────────────────────────────

function renderCaixa(state) {
  const ticket = store.getTicketMedio();
  const fechamentos = state.historico.filter(h => !h.tipoPagamento || h.tipoPagamento === 'fechamento').length;
  document.getElementById('metrics').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Vendas hoje</div>
      <div class="metric-val">${formatBRL(state.totalDia)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Comandas fechadas</div>
      <div class="metric-val">${fechamentos}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Ticket médio</div>
      <div class="metric-val">${formatBRL(ticket)}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Mesas ocupadas</div>
      <div class="metric-val">${Object.values(state.mesas).filter(m => m.status === 'ocupada').length}</div>
    </div>
  `;

  const btnExportar = `
    <div class="row" style="margin-bottom:12px; justify-content: flex-end;">
      <button class="btn btn-sm" onclick="app.exportarRelatorio()">📊 Exportar CSV</button>
    </div>
  `;

  const hist = document.getElementById('historico');
  hist.innerHTML = (state.historico.length > 0 ? btnExportar : '') + (state.historico.length === 0
    ? '<p class="empty-msg">Nenhum pagamento ainda.</p>'
    : state.historico.map(h => {
        const tipoMesa = h.tipoMesa || store.getState().mesas[h.mesa]?.tipo;
        const prefixo = tipoMesa === 'online' ? '🌐' : 'M';
        const labelMesa = tipoMesa === 'online' ? 'Pedido Online' : 'Mesa';
        const tipoPg = h.tipoPagamento || 'fechamento';
        const pago = (typeof h.valorPago === 'number') ? h.valorPago : h.total;
        const extra = tipoPg === 'parcial' && typeof h.saldoRestante === 'number'
          ? ` · Saldo: ${formatBRL(h.saldoRestante)}`
          : '';
        return `
          <div class="hist-row">
            <div class="hist-circle">${prefixo}${h.mesa}</div>
            <div class="hist-info">
              <div class="hist-mesa">${labelMesa} ${h.mesa}</div>
              <div class="hist-sub">${h.hora} · ${h.formaPagamento} · ${tipoPg === 'parcial' ? 'Parcial' : 'Fechamento'} · ${h.taxaServico > 0 ? '+10%' : 'Sem taxa'}${extra}</div>
            </div>
            <span class="hist-total">${formatBRL(pago)}</span>
          </div>
        `;
      }).join(''));

  const catTotais = store.getVendasPorCategoria();
  const maxV = Math.max(...Object.values(catTotais), 1);
  const vc = document.getElementById('vendas-cat');
  vc.innerHTML = Object.keys(catTotais).length === 0
    ? '<p class="empty-msg">Feche comandas para ver dados.</p>'
    : Object.entries(catTotais).map(([cat, val]) => `
        <div style="margin-bottom:14px">
          <div class="row" style="margin-bottom:4px">
            <span style="font-size:13px">${cat}</span>
            <div class="spacer"></div>
            <span style="font-size:13px;font-weight:600">${formatBRL(val)}</span>
          </div>
          <div class="prog-bar">
            <div class="prog-fill" style="width:${Math.round(val / maxV * 100)}%;background:var(--amber-mid)"></div>
          </div>
        </div>
      `).join('');
}

// ─── Estoque ─────────────────────────────────────────────────────────────────

function renderEstoque(state) {
  const baixo = store.getProdutosBaixoEstoque();
  const alertEl = document.getElementById('alerta-estoque');
  if (baixo.length > 0) {
    alertEl.style.display = 'inline-block';
    alertEl.textContent = `${baixo.length} item(ns) com estoque baixo`;
  } else {
    alertEl.style.display = 'none';
  }

  const sorted = [...state.produtos].sort((a, b) => a.estoque - b.estoque);
  const list   = document.getElementById('lista-estoque');
  list.innerHTML = sorted.map(p => {
    const min = Number.isFinite(Number(p.estoqueMinimo)) ? Number(p.estoqueMinimo) : 5;
    const nivel = nivelEstoque(p.estoque, min);
    const color = { ok: 'var(--green)', baixo: 'var(--amber-mid)', critico: '#E24B4A' }[nivel];
    const pct   = Math.min(100, Math.round(p.estoque / 60 * 100));
    return `
      <div class="item-row">
        <div class="item-info">
          <div class="item-nome">${p.nome}</div>
          <div class="item-preco">${p.cat} · ${formatBRL(p.preco)} · mín ${min}</div>
        </div>
        <div style="min-width:140px">
          <div class="row" style="justify-content:flex-end;gap:6px">
            <span class="badge badge-${nivel === 'ok' ? 'green' : nivel === 'baixo' ? 'amber' : 'red'}">${p.estoque} un</span>
          </div>
          <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:${color}"></div></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderFormasPagamento(state) {
  const lista = document.getElementById('lista-pagamentos');
  const select = document.getElementById('select-pagamento');
  const filtro = document.getElementById('f-fechados-forma');
  
  // Atualiza lista na aba de cadastros
  lista.innerHTML = state.formasPagamento.map(f => `
    <div class="simple-item">
      <span>${f}</span>
      <button class="remove-btn" onclick="app.removePagamento('${f}')">×</button>
    </div>
  `).join('');

  // Atualiza select no modal de fechamento
  select.innerHTML = state.formasPagamento.map(f => `
    <option value="${f}">${f}</option>
  `).join('');

  if (filtro) {
    const atual = filtro.value || 'todas';
    filtro.innerHTML = [`<option value="todas">Todas</option>`, ...state.formasPagamento.map(f => `<option value="${f}">${f}</option>`)].join('');
    filtro.value = state.formasPagamento.includes(atual) ? atual : 'todas';
  }
}

function renderUsuario(state) {
  const user = state.usuarioAtivo;
  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  const badgeEl = document.getElementById('user-badge');

  if (!user) {
    nameEl.textContent = 'Entrar';
    roleEl.textContent = '';
    roleEl.className = 'badge badge-gray';
    if (badgeEl) badgeEl.classList.remove('save-pending', 'save-ok');
    document.querySelectorAll('.nav-btn').forEach(btn => { btn.style.display = 'none'; });
    return;
  }

  nameEl.textContent = user.nome;
  const perfil = store.getPerfilAcesso(user.papel);
  roleEl.textContent = (perfil?.label || user.papel).toUpperCase();
  
  const roleColors = {
    gerente: 'blue',
    garcom: 'gray',
    cozinha: 'amber',
    churrasqueiro: 'red',
    cliente: 'green'
  };
  roleEl.className = `badge badge-${roleColors[user.papel] || 'gray'}`;

  if (Number(user?.id) !== Number(_activeUserIdCache)) {
    _activeUserIdCache = Number(user?.id) || 0;
    _loadMobileProdPrefsForUser(_activeUserIdCache);
    renderComanda(store.getState());
  }

  if (badgeEl) {
    badgeEl.classList.toggle('save-pending', !!_pendingSave);
    badgeEl.classList.toggle('save-ok', !_pendingSave && !!_lastSavedAt);
  }
  
  const tabs = perfil?.tabs || {};
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const tab = btn.dataset.tab;
    btn.style.display = tabs[tab] ? 'inline-block' : 'none';
  });

  const activeBtn = document.querySelector('.nav-btn.active');
  if (activeBtn && activeBtn.style.display === 'none') {
    const firstAllowed = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.style.display !== 'none');
    if (firstAllowed) firstAllowed.click();
  }
  
  // No modo cliente, oculta a grade de mesas e fixa a mesa do QR Code (simulado)
  const gridCont = document.getElementById('mesa-grid-container');
  if (gridCont) {
    if (user.papel === 'cliente') {
      gridCont.style.display = 'none';
      if (!state.mesaSelecionada) store.selecionarMesa(1); // Simula mesa 1 via QR
    } else {
      gridCont.style.display = 'block';
    }
  }
}

function _abrirModalPedidosFechados() {
  const hoje = new Date().toISOString().slice(0, 10);
  const de = document.getElementById('f-fechados-de');
  const ate = document.getElementById('f-fechados-ate');
  if (de && !de.value) de.value = hoje;
  if (ate && !ate.value) ate.value = hoje;
  renderPedidosFechados(store.getState());
  document.getElementById('modal-fechados').style.display = 'flex';
}

function renderPedidosFechados(state) {
  const list = document.getElementById('lista-fechados');
  if (!list) return;

  const de = document.getElementById('f-fechados-de')?.value || '';
  const ate = document.getElementById('f-fechados-ate')?.value || '';
  const forma = document.getElementById('f-fechados-forma')?.value || 'todas';
  const mesaQ = String(document.getElementById('f-fechados-mesa')?.value || '').trim();

  const tsDe = de ? new Date(`${de}T00:00:00`).getTime() : null;
  const tsAte = ate ? new Date(`${ate}T23:59:59`).getTime() : null;

  const fechados = (state.historico || [])
    .map((h, idx) => ({ ...h, __idx: idx }))
    .filter(h => (h.tipoPagamento || 'fechamento') === 'fechamento')
    .filter(h => (typeof tsDe === 'number' ? (h.ts || 0) >= tsDe : true))
    .filter(h => (typeof tsAte === 'number' ? (h.ts || 0) <= tsAte : true))
    .filter(h => (forma && forma !== 'todas' ? h.formaPagamento === forma : true))
    .filter(h => (mesaQ ? String(h.mesa) === mesaQ : true));

  fechadosFiltrados = fechados;

  if (fechados.length === 0) {
    list.innerHTML = '<p class="empty-msg" style="padding:12px 0">Nenhum pedido fechado ainda.</p>';
    return;
  }

  list.innerHTML = fechados.map(h => {
    const tipoMesa = h.tipoMesa || state.mesas?.[h.mesa]?.tipo;
    const labelMesa = tipoMesa === 'online' ? 'Pedido Online' : 'Mesa';
    return `
      <div class="simple-item">
        <span>${labelMesa} ${h.mesa} · ${(h.data || '')} ${h.hora} · ${h.formaPagamento}</span>
        <div class="row" style="gap:8px">
          <span class="badge badge-green">${formatBRL(h.total)}</span>
          <button class="btn btn-sm" onclick="app.imprimirPedidoFechado(${h.__idx})">2ª via</button>
        </div>
      </div>
    `;
  }).join('');
}

function _exportarFechadosFiltrado() {
  if (!fechadosFiltrados.length) return alert('Nada para exportar.');
  let csv = 'Data;Hora;Mesa;Tipo;Subtotal;Taxa;Total;Valor Pago;Saldo Restante;Forma Pagamento\n';
  fechadosFiltrados.forEach(h => {
    const tipoMesa = h.tipoMesa || (h.tipoMesa === 'online' ? 'Online' : 'Mesa');
    const tipoPg = h.tipoPagamento || 'fechamento';
    const valorPago = (typeof h.valorPago === 'number') ? h.valorPago : h.total;
    const saldoRestante = (typeof h.saldoRestante === 'number') ? h.saldoRestante : 0;
    csv += `${h.data || ''};${h.hora || ''};${h.mesa};${tipoMesa};${Number(h.subtotal || 0).toFixed(2)};${Number(h.taxaServico || 0).toFixed(2)};${Number(h.total || 0).toFixed(2)};${Number(valorPago || 0).toFixed(2)};${Number(saldoRestante || 0).toFixed(2)};${h.formaPagamento || ''}\n`;
  });
  _downloadCSV(csv, `pedidos_fechados_${new Date().toLocaleDateString('pt-BR').replace(/\\//g, '-')}.csv`);
}

function renderProducao(state) {
  const lista = document.getElementById('lista-producao');
  if (!lista) return;

  if (state.filaProducao.length === 0) {
    lista.innerHTML = '<p class="empty-msg">Fila de produção vazia.</p>';
    return;
  }

  // FIFO: a fila já está na ordem de inserção (push)
  lista.innerHTML = state.filaProducao.map(p => `
    <div class="hist-row">
      <div class="hist-circle" style="background:${p.setor === 'churrasco' ? 'var(--red-light)' : 'var(--amber-light)'}">
        ${p.mesaId}
      </div>
      <div class="hist-info">
        <div class="hist-mesa">${p.qty}x ${p.nome}</div>
        <div class="hist-sub">${p.hora} · Setor: ${p.setor.toUpperCase()} · Origem: ${p.origem}</div>
      </div>
      <div class="row" style="gap:8px">
        ${p.status === 'pendente' 
          ? `<button class="btn btn-sm btn-primary" onclick="app.atualizarProducao(${p.id}, 'preparando')">Iniciar</button>`
          : `<button class="btn btn-sm badge-green" onclick="app.atualizarProducao(${p.id}, 'entregue')">Concluir</button>`
        }
      </div>
    </div>
  `).join('');
}

// ─── Ações Internas ───────────────────────────────────────────────────────────

function _addItem() {
  const sel = document.getElementById('sel-item');
  const id  = parseInt(sel?.value);
  const n   = store.getState().mesaSelecionada;
  if (!id || !n) return;
  _addItemById(id);
  if (sel) sel.value = '';
}

function _addItemById(id) {
  const produtoId = parseInt(id);
  const n = store.getState().mesaSelecionada;
  if (!produtoId || !n) return;
  try {
    const st = store.getState();
    const prod = st.produtos?.find(p => p.id === produtoId);
    const filaItem = store.adicionarItemMesa(n, produtoId);
    const cfg = st.impressao || {};
    const setor = filaItem?.setor;
    if (prod && (setor === 'churrasco' || setor === 'cozinha')) {
      const label = setor === 'churrasco' ? 'churrasco' : 'cozinha';
      const deve = !!cfg.autoImprimirViasSetor || (!!cfg.perguntarViasSetor && confirm(`Deseja imprimir a via do ${label}?`));
      if (deve) {
        _imprimirViaSetor({
          mesaId: n,
          setor: label.toUpperCase(),
          itens: [{ qty: 1, nome: prod.nome }],
          hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        });
      }
    }
  } catch (e) {
    alert(e.message);
  }
}

function _changeQty(produtoId, delta) {
  const n = store.getState().mesaSelecionada;
  if (!n) return;
  try {
    const st = store.getState();
    const prod = st.produtos?.find(p => p.id === produtoId);
    const filaItem = store.alterarQuantidadeItem(n, produtoId, delta);
    if (delta > 0) {
      const cfg = st.impressao || {};
      const setor = filaItem?.setor;
      if (prod && (setor === 'churrasco' || setor === 'cozinha')) {
        const label = setor === 'churrasco' ? 'churrasco' : 'cozinha';
        const deve = !!cfg.autoImprimirViasSetor || (!!cfg.perguntarViasSetor && confirm(`Deseja imprimir a via do ${label}?`));
        if (deve) {
          _imprimirViaSetor({
            mesaId: n,
            setor: label.toUpperCase(),
            itens: [{ qty: 1, nome: prod.nome }],
            hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          });
        }
      }
    }
  } catch (e) {
    alert(e.message);
  }
}

function _removeItem(produtoId) {
  const n = store.getState().mesaSelecionada;
  if (!n) return;
  store.removerItemMesa(n, produtoId);
}

function _abrirModalFechar() {
  const modal = document.getElementById('modal-fechamento');
  const state = store.getState();
  const n = state.mesaSelecionada;
  const mesa = state.mesas[n];
  if (!mesa) return;

  const checkTaxa = document.getElementById('check-taxa');
  if (mesa.aplicarTaxa) {
    checkTaxa.checked = true;
    checkTaxa.disabled = true;
  } else {
    checkTaxa.checked = false;
    checkTaxa.disabled = false;
  }

  const inputAbater = document.getElementById('input-abater');
  const saldoAtualEl = document.getElementById('fechamento-saldo-atual');
  const saldoRestanteEl = document.getElementById('fechamento-saldo-restante');
  const descontoAplicadoEl = document.getElementById('fechamento-desconto-aplicado');
  const selDescTipo = document.getElementById('select-desconto-tipo');
  const rowDescPct = document.getElementById('row-desconto-pct');
  const rowDescVal = document.getElementById('row-desconto-val');
  const inputDescPct = document.getElementById('input-desconto-pct');
  const inputDescVal = document.getElementById('input-desconto-val');

  const user = (state.usuarios || []).find(u => u.id === state.usuarioAtivo?.id) || {};
  const maxPct = Number.isFinite(Number(user.descontoPctMax)) ? Math.max(0, Math.min(100, Number(user.descontoPctMax))) : 0;
  const maxVal = Number.isFinite(Number(user.descontoValorMax)) ? Math.max(0, Number(user.descontoValorMax)) : 0;
  const temDesconto = maxPct > 0 || maxVal > 0;
  if (selDescTipo) selDescTipo.disabled = !temDesconto;
  if (inputDescPct) inputDescPct.max = String(maxPct || 0);
  if (inputDescVal) inputDescVal.max = String(maxVal || 0);
  if (selDescTipo) selDescTipo.value = '';
  if (inputDescPct) inputDescPct.value = '';
  if (inputDescVal) inputDescVal.value = '';
  if (rowDescPct) rowDescPct.style.display = 'none';
  if (rowDescVal) rowDescVal.style.display = 'none';

  const atualizarResumo = () => {
    const tipo = selDescTipo?.value || '';
    const pct = parseFloat(String(inputDescPct?.value || '').replace(',', '.'));
    const val = parseFloat(String(inputDescVal?.value || '').replace(',', '.'));
    const resumo = store.calcResumoMesa(mesa, {
      aplicarTaxa: !!(mesa.aplicarTaxa || checkTaxa.checked),
      descontoTipo: tipo,
      descontoPct: pct,
      descontoValor: val,
    });
    const saldo = resumo.saldo;
    const valorAbater = parseFloat(String(inputAbater.value).replace(',', '.'));
    let abater = Number.isFinite(valorAbater) ? Math.max(0, valorAbater) : 0;
    if (abater > saldo) {
      abater = saldo;
      inputAbater.value = saldo.toFixed(2);
    }
    const saldoRestante = Math.max(0, saldo - abater);

    saldoAtualEl.textContent = formatBRL(saldo);
    saldoRestanteEl.textContent = formatBRL(saldoRestante);
    if (descontoAplicadoEl) descontoAplicadoEl.textContent = formatBRL(resumo.descontoValor || 0);
  };

  const resumoInicial = store.calcResumoMesa(mesa, { aplicarTaxa: !!(mesa.aplicarTaxa || checkTaxa.checked) });
  const saldoAtual = resumoInicial.saldo;
  inputAbater.value = saldoAtual.toFixed(2);
  atualizarResumo();

  checkTaxa.onchange = atualizarResumo;
  inputAbater.oninput = atualizarResumo;
  if (selDescTipo) selDescTipo.onchange = () => {
    const tipo = selDescTipo.value || '';
    if (rowDescPct) rowDescPct.style.display = tipo === 'pct' ? 'flex' : 'none';
    if (rowDescVal) rowDescVal.style.display = tipo === 'valor' ? 'flex' : 'none';
    atualizarResumo();
  };
  if (inputDescPct) inputDescPct.oninput = atualizarResumo;
  if (inputDescVal) inputDescVal.oninput = atualizarResumo;

  modal.style.display = 'flex';
}

function _confirmarFechamento() {
  const n = store.getState().mesaSelecionada;
  const taxa = document.getElementById('check-taxa').checked;
  const impressao = document.getElementById('select-impressao')?.value || 'pedido';
  const forma = document.getElementById('select-pagamento').value;
  const valorAbater = parseFloat(String(document.getElementById('input-abater').value).replace(',', '.'));
  const descontoTipo = document.getElementById('select-desconto-tipo')?.value || '';
  const descontoPct = parseFloat(String(document.getElementById('input-desconto-pct')?.value || '').replace(',', '.'));
  const descontoValor = parseFloat(String(document.getElementById('input-desconto-val')?.value || '').replace(',', '.'));
  
  try {
    const info = store.registrarPagamentoMesa(n, { valorPago: valorAbater, aplicarTaxa: taxa, formaPagamento: forma, descontoTipo, descontoPct, descontoValor });
    if (impressao === 'pagamento') _imprimirPagamentoParcial(info);
    if (impressao === 'pedido') _imprimirRecibo(info, { via: '' });
    document.getElementById('modal-fechamento').style.display = 'none';
  } catch (e) {
    alert(e.message);
  }
}

function _addPagamento() {
  const input = document.getElementById('f-pagamento');
  try {
    store.adicionarFormaPagamento(input.value);
    input.value = '';
  } catch (e) {
    alert(e.message);
  }
}

function _imprimirComanda(aplicarTaxa = true) {
  const state = store.getState();
  const emp = state.empresa || {};
  const rodape = String(emp.mensagemRodape || 'Obrigado pela preferência!') || 'Obrigado pela preferência!';
  const n = state.mesaSelecionada;
  if (!n) return;
  const mesa = state.mesas[n];
  const aplicarTaxaEfetiva = mesa.aplicarTaxa || aplicarTaxa;
  const resumo = store.calcResumoMesa(mesa, { aplicarTaxa: !!aplicarTaxaEfetiva });
  const subtotal = resumo.subtotal;
  const vTaxa = resumo.taxaServico;
  const vEntrega = resumo.taxaEntrega || 0;
  const credito = resumo.credito || 0;
  const total = resumo.total;
  const saldo = resumo.saldo;
  const labelCredito = saldo === 0 ? 'PAGO' : 'PAG. PARCIAL';
  
  const printArea = document.getElementById('print-area');
  printArea.innerHTML = `
    <div class="ticket">
      <div class="ticket-header">
        <strong>ESPETINHO 075</strong><br>
        ${mesa.tipo === 'online' ? 'PEDIDO ONLINE' : 'MESA'} ${n}<br>
        ${new Date().toLocaleString('pt-BR')}
      </div>
      <div class="ticket-divider"></div>
      ${mesa.itens.map(it => `
        <div class="ticket-row">
          <span>${it.qty}x ${it.nome}</span>
          <span>${formatBRL(it.preco * it.qty)}</span>
        </div>
      `).join('')}
      <div class="ticket-divider"></div>
      <div class="ticket-row" style="font-weight:bold">
        <span>SUBTOTAL</span>
        <span>${formatBRL(subtotal)}</span>
      </div>
      ${vEntrega > 0 ? `
      <div class="ticket-row">
        <span>ENTREGA</span>
        <span>${formatBRL(vEntrega)}</span>
      </div>` : ''}
      ${aplicarTaxaEfetiva ? `
      <div class="ticket-row">
        <span>TAXA SERV. (10%)</span>
        <span>${formatBRL(vTaxa)}</span>
      </div>` : ''}
      <div class="ticket-row" style="font-size:16px; font-weight:bold; margin-top:5px">
        <span>TOTAL</span>
        <span>${formatBRL(total)}</span>
      </div>
      ${credito > 0 ? `
      <div class="ticket-row" style="margin-top:5px">
        <span>${labelCredito}</span>
        <span>${formatBRL(credito)}</span>
      </div>` : ''}
      ${credito > 0 ? `
      <div class="ticket-row" style="font-size:16px; font-weight:bold; margin-top:5px">
        <span>SALDO A PAGAR</span>
        <span>${formatBRL(saldo)}</span>
      </div>` : ''}
      <div class="ticket-footer">
        ${rodape}
      </div>
    </div>
  `;
  
  printArea.style.display = 'block';
  window.print();
  printArea.style.display = 'none';
}

function _imprimirPagamentoParcial(info) {
  _imprimirRecibo(info, { via: '', somentePagamento: true });
}

function _imprimirReciboHistorico(idx) {
  const state = store.getState();
  const h = state.historico?.[idx];
  if (!h) return;

  const info = {
    mesaId: h.mesa,
    tipoMesa: h.tipoMesa,
    subtotal: h.subtotal,
    descontoTipo: h.descontoTipo || '',
    descontoPct: Number(h.descontoPct) || 0,
    descontoValor: Number(h.descontoValor) || 0,
    taxaServico: h.taxaServico,
    taxaEntrega: Number(h.taxaEntrega) || 0,
    total: h.total,
    valorPago: (typeof h.valorPago === 'number') ? h.valorPago : h.total,
    saldoRestante: (typeof h.saldoRestante === 'number') ? h.saldoRestante : 0,
    formaPagamento: h.formaPagamento,
    hora: h.hora,
    data: h.data,
    itens: h.itens || [],
    tipoPagamento: h.tipoPagamento || 'fechamento',
  };
  _imprimirRecibo(info, { via: '2ª VIA' });
}

function _imprimirRecibo(info, { via = '', somentePagamento = false } = {}) {
  const state = store.getState();
  const emp = state.empresa || {};
  const nome = emp.nome || 'ESPETINHO 075';
  const logoUrl = emp.logoUrl || '';
  const tel = String(emp.telefone || '');
  const end = String(emp.endereco || '');
  const pix = String(emp.pixCopiaECola || '');
  const rodape = String(emp.mensagemRodape || 'Obrigado pela preferência!') || 'Obrigado pela preferência!';
  const pixQrUrl = pix ? `https://quickchart.io/qr?text=${encodeURIComponent(pix)}&size=180` : '';

  const labelMesa = (info.tipoMesa === 'online' ? 'PEDIDO ONLINE' : 'MESA');
  const labelCredito = info.saldoRestante === 0 ? 'PAGO' : 'PAG. PARCIAL';

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = `
    <div class="ticket">
      <div class="ticket-header">
        ${logoUrl ? `<img src="${logoUrl}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid #000" onerror="this.style.display='none'"><br>` : ''}
        <strong>${nome}</strong><br>
        ${via ? `<div style="margin-top:4px;font-weight:bold">${via}</div>` : ''}
        ${end ? `${end}<br>` : ''}
        ${tel ? `${tel}<br>` : ''}
        ${labelMesa} ${info.mesaId}<br>
        ${(info.data || new Date().toLocaleDateString('pt-BR'))} ${(info.hora || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}<br>
      </div>
      <div class="ticket-divider"></div>
      ${somentePagamento ? '' : (info.itens || []).map(it => `
        <div class="ticket-row">
          <span>${it.qty}x ${it.nome}</span>
          <span>${formatBRL(it.preco * it.qty)}</span>
        </div>
      `).join('')}
      ${somentePagamento ? '' : '<div class="ticket-divider"></div>'}
      ${somentePagamento ? '' : `
      <div class="ticket-row" style="font-weight:bold">
        <span>SUBTOTAL</span>
        <span>${formatBRL(info.subtotal)}</span>
      </div>
      ${(info.descontoValor || 0) > 0 ? `
      <div class="ticket-row">
        <span>DESCONTO${info.descontoTipo === 'pct' && (info.descontoPct || 0) > 0 ? ` (${info.descontoPct}%)` : ''}</span>
        <span>- ${formatBRL(info.descontoValor)}</span>
      </div>` : ''}
      ${(info.taxaEntrega || 0) > 0 ? `
      <div class="ticket-row">
        <span>ENTREGA</span>
        <span>${formatBRL(info.taxaEntrega)}</span>
      </div>` : ''}
      ${info.taxaServico > 0 ? `
      <div class="ticket-row">
        <span>TAXA SERV. (10%)</span>
        <span>${formatBRL(info.taxaServico)}</span>
      </div>` : ''}`}
      <div class="ticket-row" style="font-size:16px; font-weight:bold; margin-top:5px">
        <span>TOTAL</span>
        <span>${formatBRL(info.total)}</span>
      </div>
      <div class="ticket-row" style="margin-top:5px">
        <span>${labelCredito}</span>
        <span>${formatBRL(info.valorPago)}</span>
      </div>
      <div class="ticket-row" style="font-size:16px; font-weight:bold; margin-top:5px">
        <span>SALDO A PAGAR</span>
        <span>${formatBRL(info.saldoRestante)}</span>
      </div>
      <div class="ticket-divider"></div>
      <div class="ticket-row">
        <span>FORMA</span>
        <span>${info.formaPagamento || ''}</span>
      </div>
      ${pix ? `
      <div class="ticket-divider"></div>
      <div style="text-align:center;margin-top:8px">
        <div style="font-weight:bold">PIX</div>
        ${pixQrUrl ? `<img src="${pixQrUrl}" alt="" style="width:160px;height:160px;margin:6px auto 0;display:block" onerror="this.style.display='none'">` : ''}
        <div style="font-size:10px;word-break:break-all;margin-top:6px">${pix}</div>
      </div>` : ''}
      <div class="ticket-footer">
        ${rodape}
      </div>
    </div>
  `;

  printArea.style.display = 'block';
  window.print();
  printArea.style.display = 'none';
}

function _imprimirViaSetor({ mesaId, setor, itens, hora }) {
  const state = store.getState();
  const emp = state.empresa || {};
  const nome = emp.nome || 'ESPETINHO 075';
  const logoUrl = emp.logoUrl || '';
  const tel = String(emp.telefone || '');
  const end = String(emp.endereco || '');

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = `
    <div class="ticket">
      <div class="ticket-header">
        ${logoUrl ? `<img src="${logoUrl}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid #000" onerror="this.style.display='none'"><br>` : ''}
        <strong>${nome}</strong><br>
        <div style="margin-top:4px;font-weight:bold">VIA ${String(setor || '').toUpperCase()}</div>
        ${end ? `${end}<br>` : ''}
        ${tel ? `${tel}<br>` : ''}
        MESA ${mesaId}<br>
        ${new Date().toLocaleDateString('pt-BR')} ${hora || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}<br>
      </div>
      <div class="ticket-divider"></div>
      ${(itens || []).map(it => `
        <div class="ticket-row">
          <span>${it.qty}x ${it.nome}</span>
          <span></span>
        </div>
      `).join('')}
      <div class="ticket-footer">
        Produção
      </div>
    </div>
  `;

  printArea.style.display = 'block';
  window.print();
  printArea.style.display = 'none';
}

function _abrirModalUsuario(forcar = false) {
  let state = store.getState();
  if (!Array.isArray(state.usuarios) || state.usuarios.length === 0) {
    store.importarEstado(state);
    state = store.getState();
  }
  const user = state.usuarioAtivo;
  const sel = document.getElementById('select-user-id');
  sel.innerHTML = (state.usuarios || []).map(u => `
    <option value="${u.id}">${u.nome}${u.senhaHash ? ' 🔒' : ''} (${(u.papel || '').toUpperCase()})</option>
  `).join('');
  sel.value = user?.id || (state.usuarios?.[0]?.id || '');
  const senhaEl = document.getElementById('select-user-senha');
  if (senhaEl) senhaEl.value = '';
  document.getElementById('modal-usuario').style.display = 'flex';
}

function _confirmarTrocaUsuario() {
  const id = Number(document.getElementById('select-user-id').value);
  try {
    const senha = document.getElementById('select-user-senha') ? document.getElementById('select-user-senha').value : '';
    store.selecionarUsuarioAtivo(id, senha);
  } catch (e) {
    alert(e.message);
    return;
  }
  const token = store.getState()?.sessao?.token;
  if (token) localStorage.setItem('sessaoToken', token);
  document.getElementById('modal-usuario').style.display = 'none';
}

function _logout() {
  localStorage.removeItem('sessaoToken');
  store.logout();
  _abrirModalUsuario(true);
}

function _exportarCSV() {
  const state = store.getState();
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  if (!perfil?.tabs?.relatorios || !perfil?.acoes?.verRelatorios) return alert('Sem permissão.');
  if (state.historico.length === 0) return alert('Nenhuma venda registrada para exportar.');

  const { itens } = _getRelatorioHistoricoFiltrado(state);
  if (itens.length === 0) return alert('Nenhuma venda encontrada para o filtro selecionado.');

  let csv = 'Data;Hora;Mesa;Tipo Mesa;Tipo Pagamento;Subtotal;DescontoTipo;DescontoPct;DescontoValor;Taxa;Total;Valor Pago;Saldo Restante;Forma Pagamento\n';
  itens.forEach(h => {
    const tipoMesa = h.tipoMesa || state.mesas[h.mesa]?.tipo;
    const tipoPg = h.tipoPagamento || 'fechamento';
    const valorPago = (typeof h.valorPago === 'number') ? h.valorPago : h.total;
    const saldoRestante = (typeof h.saldoRestante === 'number') ? h.saldoRestante : 0;
    csv += `${h.data || ''};${h.hora || ''};${h.mesa};${tipoMesa || ''};${tipoPg};${Number(h.subtotal || 0).toFixed(2)};${h.descontoTipo || ''};${Number(h.descontoPct || 0).toFixed(2)};${Number(h.descontoValor || 0).toFixed(2)};${Number(h.taxaServico || 0).toFixed(2)};${Number(h.total || 0).toFixed(2)};${Number(valorPago || 0).toFixed(2)};${Number(saldoRestante || 0).toFixed(2)};${h.formaPagamento || ''}\n`;
  });

  _downloadCSV(csv, `relatorio_vendas_${new Date().toISOString().slice(0, 10)}.csv`);
}

// Relatórios (aba Relatórios):
// - Os filtros são lidos do DOM e aplicados ao state.historico.
// - "Pagamentos" = registros do histórico (parcial e/ou fechamento).
// - "Fechamentos" = tipoPagamento === 'fechamento' (usado para "total vendido" e gráficos por produto/categoria).
function _getRelatorioFiltros(state) {
  const hoje = new Date().toISOString().slice(0, 10);
  const deEl = document.getElementById('rel-de');
  const ateEl = document.getElementById('rel-ate');
  const formaEl = document.getElementById('rel-forma');
  const tipoEl = document.getElementById('rel-tipo-mesa');
  const parcEl = document.getElementById('rel-incluir-parciais');

  const de = (deEl && deEl.value) ? deEl.value : hoje;
  const ate = (ateEl && ateEl.value) ? ateEl.value : hoje;
  const forma = formaEl ? (formaEl.value || 'todas') : 'todas';
  const tipoMesa = tipoEl ? (tipoEl.value || 'todas') : 'todas';
  const incluirParciais = parcEl ? !!parcEl.checked : false;
  const tsDe = de ? new Date(`${de}T00:00:00`).getTime() : null;
  const tsAte = ate ? new Date(`${ate}T23:59:59`).getTime() : null;
  return { de, ate, forma, tipoMesa, incluirParciais, tsDe, tsAte };
}

function _getRelatorioHistoricoFiltrado(state) {
  const f = _getRelatorioFiltros(state);
  const itens = (state.historico || [])
    .filter(h => (typeof f.tsDe === 'number' ? (Number(h.ts) || 0) >= f.tsDe : true))
    .filter(h => (typeof f.tsAte === 'number' ? (Number(h.ts) || 0) <= f.tsAte : true))
    .filter(h => (f.tipoMesa !== 'todas' ? (String(h.tipoMesa || state.mesas?.[h.mesa]?.tipo || '') === f.tipoMesa) : true))
    .filter(h => (f.forma !== 'todas' ? String(h.formaPagamento || '') === f.forma : true))
    .filter(h => (f.incluirParciais ? true : ((h.tipoPagamento || 'fechamento') === 'fechamento')));
  return { filtros: f, itens };
}

function renderRelatorios(state) {
  const deEl = document.getElementById('rel-de');
  const ateEl = document.getElementById('rel-ate');
  const formaEl = document.getElementById('rel-forma');
  const resumoEl = document.getElementById('rel-resumo');
  if (!deEl || !ateEl || !formaEl || !resumoEl) return;

  const hoje = new Date().toISOString().slice(0, 10);
  if (!deEl.value) deEl.value = hoje;
  if (!ateEl.value) ateEl.value = hoje;

  const atual = formaEl.value || 'todas';
  const formas = Array.isArray(state.formasPagamento) ? state.formasPagamento : [];
  formaEl.innerHTML = ['<option value="todas">Todas</option>', ...formas.map(f => `<option value="${String(f).replace(/"/g, '&quot;')}">${f}</option>`)].join('');
  formaEl.value = formas.includes(atual) ? atual : 'todas';

  const { itens, filtros } = _getRelatorioHistoricoFiltrado(state);
  const fechamentos = itens.filter(h => (h.tipoPagamento || 'fechamento') === 'fechamento');
  const pagamentos = itens.length;
  const totalRecebido = itens.reduce((s, h) => s + (Number(h.valorPago) || Number(h.total) || 0), 0);
  const totalVendido = fechamentos.reduce((s, h) => s + (Number(h.total) || 0), 0);
  const ticketMedio = fechamentos.length ? (totalVendido / fechamentos.length) : 0;
  const fmtBRL = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
  const diff = totalVendido - totalRecebido;

  resumoEl.textContent = `Período: ${filtros.de} → ${filtros.ate} · Pagamentos: ${pagamentos} · Fechamentos: ${fechamentos.length} · Total vendido: ${fmtBRL(totalVendido)} · Total recebido: ${fmtBRL(totalRecebido)} · Diferença: ${fmtBRL(diff)} · Ticket médio: ${fmtBRL(ticketMedio)}`;
  _renderDashboardRelatorios(state, itens, fechamentos);
}

function _canvas2d(el) {
  if (!el) return null;
  const ctx = el.getContext('2d');
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = el.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (el.width !== w) el.width = w;
  if (el.height !== h) el.height = h;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function _drawBarChart(canvas, labels, values, color) {
  const ctx = _canvas2d(canvas);
  if (!ctx) return;
  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;
  ctx.clearRect(0, 0, w, h);

  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 18;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, h - padT - padB);
  const maxV = Math.max(...values, 1);

  const n = Math.min(labels.length, values.length, 8);
  const barH = (plotH / n) * 0.62;
  const rowH = plotH / n;
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < n; i++) {
    const y = padT + i * rowH + rowH / 2;
    const v = Number(values[i]) || 0;
    const pct = v / maxV;
    const bw = Math.max(2, Math.round(plotW * pct));
    ctx.fillStyle = '#ece9e2';
    ctx.fillRect(padL, y - barH / 2, plotW, barH);
    ctx.fillStyle = color;
    ctx.fillRect(padL, y - barH / 2, bw, barH);
    ctx.fillStyle = '#2B1D0E';
    ctx.fillText(String(labels[i] || '').slice(0, 18), padL + 6, y);
    ctx.fillStyle = '#666';
    ctx.textAlign = 'right';
    ctx.fillText(`R$ ${v.toFixed(0)}`, w - padR, y);
    ctx.textAlign = 'left';
  }
}

function _drawLineChart(canvas, labels, values, color) {
  const ctx = _canvas2d(canvas);
  if (!ctx) return;
  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;
  ctx.clearRect(0, 0, w, h);

  const padL = 28;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, h - padT - padB);
  const maxV = Math.max(...values, 1);

  ctx.strokeStyle = '#ece9e2';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
  }

  const n = Math.max(labels.length, values.length, 1);
  const xAt = (i) => padL + (plotW * i) / Math.max(1, n - 1);
  const yAt = (v) => padT + plotH - (plotH * (v / maxV));

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = xAt(i);
    const y = yAt(Number(values[i]) || 0);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = xAt(i);
    const y = yAt(Number(values[i]) || 0);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#666';
  ctx.font = '11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = Math.ceil(n / 8);
  for (let i = 0; i < n; i += step) {
    ctx.fillText(String(labels[i] || ''), xAt(i), padT + plotH + 6);
  }
  ctx.textAlign = 'left';
}

function _renderDashboardRelatorios(state, itens, fechamentos) {
  const catCanvas = document.getElementById('chart-rel-cat');
  const pagCanvas = document.getElementById('chart-rel-pag');
  const horaCanvas = document.getElementById('chart-rel-hora');
  if (!catCanvas || !pagCanvas || !horaCanvas) return;

  const catTot = {};
  fechamentos.forEach(h => {
    (h.itens || []).forEach(it => {
      const p = (state.produtos || []).find(x => x.id === it.id);
      const cat = p?.cat || 'Outros';
      catTot[cat] = (catTot[cat] || 0) + (Number(it.preco) || 0) * (Number(it.qty) || 0);
    });
  });
  const catRows = Object.entries(catTot).sort((a, b) => b[1] - a[1]);
  _drawBarChart(catCanvas, catRows.map(x => x[0]), catRows.map(x => x[1]), '#2FA15F');

  const payTot = {};
  itens.forEach(h => {
    const f = h.formaPagamento || '—';
    const v = (Number(h.valorPago) || Number(h.total) || 0);
    payTot[f] = (payTot[f] || 0) + v;
  });
  const payRows = Object.entries(payTot).sort((a, b) => b[1] - a[1]);
  _drawBarChart(pagCanvas, payRows.map(x => x[0]), payRows.map(x => x[1]), '#D9A441');

  const byHour = new Array(24).fill(0);
  fechamentos.forEach(h => {
    const ts = Number(h.ts) || 0;
    const hr = ts ? new Date(ts).getHours() : null;
    if (hr === null) return;
    byHour[hr] += Number(h.total) || 0;
  });
  const labels = byHour.map((_, i) => String(i).padStart(2, '0'));
  _drawLineChart(horaCanvas, labels, byHour, '#2B1D0E');
}

window.addEventListener('resize', () => {
  if (_relChartResizeTimer) clearTimeout(_relChartResizeTimer);
  _relChartResizeTimer = setTimeout(() => {
    try { renderRelatorios(store.getState()); } catch {}
  }, 200);
});

function _exportarProdutosVendidosCSV() {
  const state = store.getState();
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  if (!perfil?.tabs?.relatorios || !perfil?.acoes?.verRelatorios) return alert('Sem permissão.');
  const { itens } = _getRelatorioHistoricoFiltrado(state);
  const vendas = itens.filter(h => (h.tipoPagamento || 'fechamento') === 'fechamento');
  if (vendas.length === 0) return alert('Nenhuma venda (fechamento) encontrada para o filtro selecionado.');

  const byId = new Map();
  vendas.forEach(h => {
    (h.itens || []).forEach(it => {
      const id = Number(it.id) || 0;
      if (!id) return;
      const prev = byId.get(id) || { id, qty: 0, valor: 0 };
      prev.qty += Number(it.qty) || 0;
      prev.valor += (Number(it.preco) || 0) * (Number(it.qty) || 0);
      byId.set(id, prev);
    });
  });

  const rows = Array.from(byId.values())
    .map(r => {
      const p = (state.produtos || []).find(x => x.id === r.id) || {};
      return { ...r, nome: p.nome || '', cat: p.cat || '' };
    })
    .sort((a, b) => b.valor - a.valor);

  let csv = 'ID;Produto;Categoria;Quantidade;Valor\n';
  rows.forEach(r => {
    csv += `${r.id};${String(r.nome || '').replace(/;/g, ',')};${String(r.cat || '').replace(/;/g, ',')};${r.qty};${r.valor.toFixed(2)}\n`;
  });
  _downloadCSV(csv, `relatorio_produtos_vendidos_${new Date().toISOString().slice(0, 10)}.csv`);
}

function _exportarCategoriasCSV() {
  const state = store.getState();
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  if (!perfil?.tabs?.relatorios || !perfil?.acoes?.verRelatorios) return alert('Sem permissão.');
  const { itens } = _getRelatorioHistoricoFiltrado(state);
  const vendas = itens.filter(h => (h.tipoPagamento || 'fechamento') === 'fechamento');
  if (vendas.length === 0) return alert('Nenhuma venda (fechamento) encontrada para o filtro selecionado.');

  const totais = {};
  vendas.forEach(h => {
    (h.itens || []).forEach(it => {
      const p = (state.produtos || []).find(x => x.id === it.id);
      const cat = p?.cat || 'Outros';
      totais[cat] = (totais[cat] || 0) + (Number(it.preco) || 0) * (Number(it.qty) || 0);
    });
  });

  const rows = Object.entries(totais).sort((a, b) => b[1] - a[1]);
  let csv = 'Categoria;Valor\n';
  rows.forEach(([cat, val]) => {
    csv += `${String(cat || '').replace(/;/g, ',')};${Number(val || 0).toFixed(2)}\n`;
  });
  _downloadCSV(csv, `relatorio_categorias_${new Date().toISOString().slice(0, 10)}.csv`);
}

function _exportarPagamentosCSV() {
  const state = store.getState();
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  if (!perfil?.tabs?.relatorios || !perfil?.acoes?.verRelatorios) return alert('Sem permissão.');
  const { itens } = _getRelatorioHistoricoFiltrado(state);
  if (itens.length === 0) return alert('Nenhum pagamento encontrado para o filtro selecionado.');

  const totais = {};
  itens.forEach(h => {
    const forma = h.formaPagamento || '—';
    const val = (Number(h.valorPago) || Number(h.total) || 0);
    totais[forma] = (totais[forma] || 0) + val;
  });
  const rows = Object.entries(totais).sort((a, b) => b[1] - a[1]);
  let csv = 'FormaPagamento;Valor\n';
  rows.forEach(([f, val]) => {
    csv += `${String(f || '').replace(/;/g, ',')};${Number(val || 0).toFixed(2)}\n`;
  });
  _downloadCSV(csv, `relatorio_pagamentos_${new Date().toISOString().slice(0, 10)}.csv`);
}

function _exportarEstoqueCSV() {
  const state = store.getState();
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  if (!perfil?.tabs?.relatorios || !perfil?.acoes?.verRelatorios) return alert('Sem permissão.');
  if (state.produtos.length === 0) return alert('Nenhum produto cadastrado.');

  let csv = 'ID;Produto;Categoria;Preco;Estoque;EstoqueMinimo\n';
  state.produtos.forEach(p => {
    const min = Number.isFinite(Number(p.estoqueMinimo)) ? Number(p.estoqueMinimo) : 5;
    csv += `${p.id};${p.nome};${p.cat};${p.preco.toFixed(2)};${p.estoque};${min}\n`;
  });

  _downloadCSV(csv, `relatorio_estoque_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`);
}

function _exportarMovEstoqueCSV() {
  const state = store.getState();
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  if (!perfil?.tabs?.relatorios || !perfil?.acoes?.verRelatorios) return alert('Sem permissão.');
  const f = _getRelatorioFiltros(state);
  const itens = (state.estoqueMov || [])
    .filter(m => (typeof f.tsDe === 'number' ? (Number(m.ts) || 0) >= f.tsDe : true))
    .filter(m => (typeof f.tsAte === 'number' ? (Number(m.ts) || 0) <= f.tsAte : true));
  if (itens.length === 0) return alert('Nenhuma movimentação encontrada para o período.');

  let csv = 'Data;Hora;Produto;Categoria;Delta;Antes;Depois;Motivo;Origem;Mesa;Usuario;Papel\n';
  itens.forEach(m => {
    csv += `${m.data || ''};${m.hora || ''};${String(m.produtoNome || '').replace(/;/g, ',')};${String(m.categoria || '').replace(/;/g, ',')};${Number(m.delta || 0)};${Number.isFinite(Number(m.before)) ? Number(m.before) : ''};${Number.isFinite(Number(m.after)) ? Number(m.after) : ''};${String(m.motivo || '').replace(/;/g, ',')};${String(m.origem || '').replace(/;/g, ',')};${m.mesaId || ''};${String(m.userNome || '').replace(/;/g, ',')};${String(m.userPapel || '').replace(/;/g, ',')}\n`;
  });
  _downloadCSV(csv, `relatorio_mov_estoque_${new Date().toISOString().slice(0, 10)}.csv`);
}

function _exportarCancelamentosCSV() {
  const state = store.getState();
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  if (!perfil?.tabs?.relatorios || !perfil?.acoes?.verRelatorios) return alert('Sem permissão.');
  const f = _getRelatorioFiltros(state);
  const itens = (state.estoqueMov || [])
    .filter(m => String(m.motivo || '') === 'cancelamento')
    .filter(m => (typeof f.tsDe === 'number' ? (Number(m.ts) || 0) >= f.tsDe : true))
    .filter(m => (typeof f.tsAte === 'number' ? (Number(m.ts) || 0) <= f.tsAte : true));
  if (itens.length === 0) return alert('Nenhum cancelamento encontrado para o período.');

  let csv = 'Data;Hora;Mesa;Produto;Categoria;Quantidade;Usuario;Papel\n';
  itens.forEach(m => {
    csv += `${m.data || ''};${m.hora || ''};${m.mesaId || ''};${String(m.produtoNome || '').replace(/;/g, ',')};${String(m.categoria || '').replace(/;/g, ',')};${Math.abs(Number(m.delta || 0))};${String(m.userNome || '').replace(/;/g, ',')};${String(m.userPapel || '').replace(/;/g, ',')}\n`;
  });
  _downloadCSV(csv, `relatorio_cancelamentos_${new Date().toISOString().slice(0, 10)}.csv`);
}

function _downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function _downloadJSON(obj, filename) {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function _baixarBackup() {
  const state = store.getState();
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  if (!perfil?.tabs?.parametros || !perfil?.acoes?.configurarSistema) return alert('Sem permissão.');
  _downloadJSON(store.exportarEstado(), `backup_${new Date().toISOString().slice(0, 10)}.json`);
}

function _abrirImportBackup() {
  const state = store.getState();
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  if (!perfil?.tabs?.parametros || !perfil?.acoes?.configurarSistema) return alert('Sem permissão.');
  const input = document.getElementById('backup-file');
  if (!input) return;
  input.value = '';
  input.click();
}

function _exportarAuditoriaCSV() {
  const state = store.getState();
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  if (!perfil?.tabs?.parametros || !perfil?.acoes?.verAuditoria) return alert('Sem permissão.');

  const itens = Array.isArray(auditoriaFiltrada) && auditoriaFiltrada.length > 0 ? auditoriaFiltrada : (state.auditoria || []);
  if (itens.length === 0) return alert('Nenhum registro para exportar.');

  let csv = 'Data;Hora;Usuario;Papel;Tipo\n';
  itens.forEach(a => {
    csv += `${a.data || ''};${a.hora || ''};${String(a.userNome || '').replace(/;/g, ',')};${String(a.userPapel || '').replace(/;/g, ',')};${String(a.tipo || '').replace(/;/g, ',')}\n`;
  });
  _downloadCSV(csv, `auditoria_${new Date().toISOString().slice(0, 10)}.csv`);
}

function _prepararEdicao(id) {
  const p = store.getState().produtos.find(p => p.id === id);
  if (!p) return;
  
  editandoId = id;
  document.getElementById('f-nome').value = p.nome;
  if (document.getElementById('f-imagem')) document.getElementById('f-imagem').value = p.imagem || '';
  document.getElementById('f-cat').value = p.cat;
  if (document.getElementById('f-subcat')) document.getElementById('f-subcat').value = p.subcat || '';
  document.getElementById('f-preco').value = p.preco;
  if (document.getElementById('f-tipo')) document.getElementById('f-tipo').value = (String(p.tipo || '').toLowerCase() === 'combo') ? 'combo' : 'produto';
  if (document.getElementById('f-somente-online')) document.getElementById('f-somente-online').checked = !!p.somenteOnline;
  document.getElementById('f-estoque').value = p.estoque;
  if (document.getElementById('f-estoque-min')) document.getElementById('f-estoque-min').value = p.estoqueMinimo ?? 5;
  const tipoEl = document.getElementById('f-tipo');
  const chkOnline = document.getElementById('f-somente-online');
  if (tipoEl && chkOnline) {
    if (String(tipoEl.value) === 'combo') { chkOnline.checked = true; chkOnline.disabled = true; }
    else chkOnline.disabled = false;
  }
  
  document.getElementById('btn-add-text').textContent = 'Salvar Alterações';
  document.getElementById('btn-cancel-edit').style.display = 'inline-block';
  try {
    const anchor = document.getElementById('form-cardapio-titulo') || document.getElementById('f-nome');
    anchor?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  } catch {}
}

function _cancelarEdicao() {
  editandoId = null;
  document.getElementById('f-nome').value = '';
  if (document.getElementById('f-imagem')) document.getElementById('f-imagem').value = '';
  if (document.getElementById('f-cat')) {
    const sel = document.getElementById('f-cat');
    if (sel && sel.options && sel.options.length) sel.value = sel.options[0].value;
  }
  document.getElementById('f-preco').value = '';
  if (document.getElementById('f-tipo')) document.getElementById('f-tipo').value = 'produto';
  if (document.getElementById('f-somente-online')) { document.getElementById('f-somente-online').checked = false; document.getElementById('f-somente-online').disabled = false; }
  document.getElementById('f-estoque').value = '';
  if (document.getElementById('f-estoque-min')) document.getElementById('f-estoque-min').value = '';
  if (document.getElementById('f-subcat')) document.getElementById('f-subcat').value = '';
  document.getElementById('btn-add-text').textContent = 'Adicionar';
  document.getElementById('btn-cancel-edit').style.display = 'none';
}

function _limparCadastro() {
  _cancelarEdicao();
  try {
    renderSubcategorias(store.getState());
    const anchor = document.getElementById('form-cardapio-titulo') || document.getElementById('f-nome');
    anchor?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  } catch {}
}

function _removerMesa(id) {
  if (!confirm(`Deseja realmente excluir a mesa ${id}?`)) return;
  try {
    store.removerMesa(id);
  } catch (e) {
    alert(e.message);
  }
}

function _addProduto() {
  const dados = {
    nome:    document.getElementById('f-nome').value,
    imagem:  document.getElementById('f-imagem') ? document.getElementById('f-imagem').value : '',
    cat:     document.getElementById('f-cat').value,
    subcat:  document.getElementById('f-subcat') ? document.getElementById('f-subcat').value : '',
    tipo:    document.getElementById('f-tipo') ? document.getElementById('f-tipo').value : 'produto',
    somenteOnline: document.getElementById('f-somente-online') ? document.getElementById('f-somente-online').checked : false,
    preco:   document.getElementById('f-preco').value,
    estoque: document.getElementById('f-estoque').value,
    estoqueMinimo: document.getElementById('f-estoque-min') ? document.getElementById('f-estoque-min').value : '',
  };

  try {
    if (editandoId) {
      store.editarProduto(editandoId, {
        ...dados,
        preco: parseFloat(dados.preco),
        estoque: parseInt(dados.estoque),
        estoqueMinimo: parseInt(dados.estoqueMinimo),
      });
      _cancelarEdicao();
    } else {
      store.adicionarProduto(dados);
      document.getElementById('f-nome').value = '';
      if (document.getElementById('f-imagem')) document.getElementById('f-imagem').value = '';
      document.getElementById('f-preco').value = '';
      if (document.getElementById('f-tipo')) document.getElementById('f-tipo').value = 'produto';
      if (document.getElementById('f-somente-online')) { document.getElementById('f-somente-online').checked = false; document.getElementById('f-somente-online').disabled = false; }
      document.getElementById('f-estoque').value = '';
      if (document.getElementById('f-estoque-min')) document.getElementById('f-estoque-min').value = '';
      if (document.getElementById('f-subcat')) document.getElementById('f-subcat').value = '';
    }
  } catch (e) {
    alert(e.message);
  }
}

function _uploadImagemProduto() {
  const fileInput = document.getElementById('f-imagem-file');
  const urlInput = document.getElementById('f-imagem');
  const file = fileInput?.files?.[0];
  if (!file) return alert('Selecione uma imagem.');

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const dataUrl = String(reader.result || '');
      const resp = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, filename: file.name || 'imagem' }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Falha no upload.');
      urlInput.value = json.url || '';
      fileInput.value = '';
      alert('Imagem enviada e vinculada ao produto.');
    } catch (e) {
      alert(e.message);
    }
  };
  reader.readAsDataURL(file);
}

function _addCategoria() {
  const nome = document.getElementById('cat-nome')?.value || '';
  try {
    store.adicionarCategoria(nome);
    document.getElementById('cat-nome').value = '';
  } catch (e) {
    alert(e.message);
  }
}

function _addSubcategoria() {
  const cat = document.getElementById('subcat-cat').value;
  const nome = document.getElementById('subcat-nome').value;
  try {
    store.adicionarSubcategoria({ cat, nome });
    document.getElementById('subcat-nome').value = '';
  } catch (e) {
    alert(e.message);
  }
}

function _prepararEdicaoUsuario(id) {
  const u = store.getState().usuarios.find(x => x.id === id);
  if (!u) return;
  editandoUsuarioId = id;
  document.getElementById('f-usuario-nome').value = u.nome;
  document.getElementById('f-usuario-papel').value = u.papel;
  const senhaEl = document.getElementById('f-usuario-senha');
  if (senhaEl) senhaEl.value = '';
  const pctEl = document.getElementById('f-usuario-desc-pct');
  if (pctEl) pctEl.value = String(Number.isFinite(Number(u.descontoPctMax)) ? u.descontoPctMax : 0);
  const valEl = document.getElementById('f-usuario-desc-val');
  if (valEl) valEl.value = String(Number.isFinite(Number(u.descontoValorMax)) ? u.descontoValorMax : 0);
  document.getElementById('btn-usuario-text').textContent = 'Salvar';
  document.getElementById('btn-usuario-cancel').style.display = 'inline-block';
}

function _cancelarEdicaoUsuario() {
  editandoUsuarioId = null;
  document.getElementById('f-usuario-nome').value = '';
  document.getElementById('f-usuario-papel').value = 'garcom';
  const senhaEl = document.getElementById('f-usuario-senha');
  if (senhaEl) senhaEl.value = '';
  const pctEl = document.getElementById('f-usuario-desc-pct');
  if (pctEl) pctEl.value = '0';
  const valEl = document.getElementById('f-usuario-desc-val');
  if (valEl) valEl.value = '0';
  document.getElementById('btn-usuario-text').textContent = 'Adicionar';
  document.getElementById('btn-usuario-cancel').style.display = 'none';
}

function _addUsuario() {
  const nome = document.getElementById('f-usuario-nome').value;
  const papel = document.getElementById('f-usuario-papel').value;
  const senha = document.getElementById('f-usuario-senha') ? document.getElementById('f-usuario-senha').value : '';
  const pct = parseFloat(String(document.getElementById('f-usuario-desc-pct')?.value || '').replace(',', '.'));
  const val = parseFloat(String(document.getElementById('f-usuario-desc-val')?.value || '').replace(',', '.'));
  try {
    if (editandoUsuarioId) {
      const patch = { nome, papel, descontoPctMax: pct, descontoValorMax: val };
      if ((senha || '').trim() !== '') patch.senha = senha;
      store.editarUsuario(editandoUsuarioId, patch);
      _cancelarEdicaoUsuario();
    } else {
      store.adicionarUsuario({ nome, papel, senha, descontoPctMax: pct, descontoValorMax: val });
      document.getElementById('f-usuario-nome').value = '';
      if (document.getElementById('f-usuario-senha')) document.getElementById('f-usuario-senha').value = '';
      if (document.getElementById('f-usuario-desc-pct')) document.getElementById('f-usuario-desc-pct').value = '0';
      if (document.getElementById('f-usuario-desc-val')) document.getElementById('f-usuario-desc-val').value = '0';
    }
  } catch (e) {
    alert(e.message);
  }
}

function _removerUsuario(id) {
  if (!confirm('Deseja excluir este usuário?')) return;
  store.removerUsuario(id);
}

function _ativarUsuario(id) {
  try {
    const u = store.getState().usuarios.find(x => x.id === id);
    const senha = u?.senhaHash ? (prompt('Senha do usuário:') || '') : '';
    store.selecionarUsuarioAtivo(id, senha);
  } catch (e) {
    alert(e.message);
  }
}

function _salvarPerfil() {
  const papel = document.getElementById('perfil-papel').value;
  const tabs = {
    pedidos: document.getElementById('perfil-tab-pedidos').checked,
    cardapio: document.getElementById('perfil-tab-cardapio').checked,
    producao: document.getElementById('perfil-tab-producao').checked,
    cadastros: document.getElementById('perfil-tab-cadastros').checked,
    parametros: document.getElementById('perfil-tab-parametros').checked,
    relatorios: document.getElementById('perfil-tab-relatorios').checked,
    caixa: document.getElementById('perfil-tab-caixa').checked,
    estoque: document.getElementById('perfil-tab-estoque').checked,
  };
  const acoes = {
    adicionarItem: document.getElementById('perfil-acao-adicionarItem').checked,
    cancelarItem: document.getElementById('perfil-acao-cancelarItem').checked,
    gerenciarProdutos: document.getElementById('perfil-acao-gerenciarProdutos').checked,
    gerenciarSubcategorias: document.getElementById('perfil-acao-gerenciarSubcategorias').checked,
    gerenciarMesas: document.getElementById('perfil-acao-gerenciarMesas').checked,
    gerenciarPagamentos: document.getElementById('perfil-acao-gerenciarPagamentos').checked,
    editarEstoque: document.getElementById('perfil-acao-editarEstoque').checked,
    receberPagamento: document.getElementById('perfil-acao-receberPagamento').checked,
    reimprimir: document.getElementById('perfil-acao-reimprimir').checked,
    verRelatorios: document.getElementById('perfil-acao-verRelatorios').checked,
    verAuditoria: document.getElementById('perfil-acao-verAuditoria').checked,
    configurarSistema: document.getElementById('perfil-acao-configurarSistema').checked,
    configurarIntegracao: document.getElementById('perfil-acao-configurarIntegracao').checked,
    gerenciarUsuarios: document.getElementById('perfil-acao-gerenciarUsuarios').checked,
    gerenciarPerfis: document.getElementById('perfil-acao-gerenciarPerfis').checked,
  };
  try {
    store.atualizarPerfilAcesso(papel, tabs);
    store.atualizarAcoesPerfil(papel, acoes);
    alert('Perfil atualizado.');
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById('f-cat')?.addEventListener('change', () => renderSubcategorias(store.getState()));
document.getElementById('f-tipo')?.addEventListener('change', () => {
  const tipoEl = document.getElementById('f-tipo');
  const chk = document.getElementById('f-somente-online');
  if (!tipoEl || !chk) return;
  if (String(tipoEl.value) === 'combo') {
    chk.checked = true;
    chk.disabled = true;
  } else {
    chk.disabled = false;
  }
});
document.getElementById('subcat-cat')?.addEventListener('change', () => renderSubcategorias(store.getState()));
document.getElementById('backup-file')?.addEventListener('change', async (ev) => {
  const input = ev.target;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    if (!confirm('Restaurar backup? Isso substitui os dados atuais e vai exigir novo login.')) return;
    store.importarEstado(json);
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: store.exportarEstado() }),
    });
    localStorage.removeItem('sessaoToken');
    alert('Backup restaurado. Faça login novamente.');
    _abrirModalUsuario(true);
  } catch (e) {
    alert(e.message || 'Falha ao restaurar backup.');
  } finally {
    input.value = '';
  }
});
