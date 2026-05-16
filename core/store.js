/**
 * bar-app/core/store.js
 * Estado global e lógica de negócio compartilhada entre web e app.
 */

import { sha256Hex, randomToken, dataISO } from './utils.js';

// ─── Estado Inicial ──────────────────────────────────────────────────────────

const MESAS_INICIAIS = 15;
const PAPEIS = ['gerente', 'garcom', 'cozinha', 'churrasqueiro', 'cliente'];

function criarEstadoInicial() {
  const mesas = {};
  for (let i = 1; i <= MESAS_INICIAIS; i++) {
    mesas[i] = { id: i, itens: [], status: 'livre', tipo: 'presencial', credito: 0, aplicarTaxa: false, token: '', clienteId: null, cliente: null, createdAt: 0, taxaEntrega: 0 };
  }
  return {
    /**
     * mesas: mapa { [numeroMesa]: Mesa }
     * - id: número da mesa
     * - itens: lista de itens da comanda [{ id(produto), nome, preco, qty }]
     * - status: 'livre' | 'ocupada'
     * - tipo: 'presencial' | 'online'
     * - credito: total já pago/abatido (pagamento parcial)
     * - aplicarTaxa: trava a taxa quando houver pagamento parcial (evita inconsistência)
     */
    mesas,
    /**
     * permitirVendaSemEstoque:
     * - false: bloqueia adicionar item quando estoque <= 0 (comportamento padrão)
     * - true: permite vender mesmo com estoque zerado (modo "manual")
     */
    permitirVendaSemEstoque: false,
    /**
     * sync: metadados de versionamento do estado para sincronização (web/app)
     * - rev: revisão incremental (sobe a cada alteração relevante)
     * - updatedAt: timestamp (ms) da última alteração
     * - updatedBy: quem alterou (id/nome/papel) ou null
     */
    sync: {
      rev: 0,
      updatedAt: 0,
      updatedBy: null,
    },
    /**
     * produtos: catálogo
     * - id: id interno (inteiro)
     * - nome, cat, subcat
     * - preco: número
     * - estoque: saldo atual
     * - estoqueMinimo: limite para alerta
     * - imagem: URL (ou caminho) da imagem
     */
    produtos: [
      { id: 1, nome: 'Cerveja 600ml',        cat: 'Bebida',    subcat: '', preco: 12,  estoque: 48, estoqueMinimo: 5, imagem: 'https://picsum.photos/seed/cerveja600/600/400' },
      { id: 2, nome: 'Heineken Long Neck',    cat: 'Bebida',    subcat: '', preco: 10,  estoque: 60, estoqueMinimo: 5, imagem: 'https://picsum.photos/seed/heineken/600/400' },
      { id: 3, nome: 'Caipirinha',            cat: 'Bebida',    subcat: '', preco: 16,  estoque: 30, estoqueMinimo: 5, imagem: 'https://picsum.photos/seed/caipirinha/600/400' },
      { id: 4, nome: 'Refrigerante',          cat: 'Bebida',    subcat: '', preco: 6,   estoque: 40, estoqueMinimo: 5, imagem: 'https://picsum.photos/seed/refrigerante/600/400' },
      { id: 5, nome: 'Água',                  cat: 'Bebida',    subcat: '', preco: 4,   estoque: 50, estoqueMinimo: 5, imagem: 'https://picsum.photos/seed/agua/600/400' },
      { id: 6, nome: 'Batata Frita',          cat: 'Petisco',   subcat: '', preco: 28,  estoque: 20, estoqueMinimo: 5, imagem: 'https://picsum.photos/seed/batatafrita/600/400' },
      { id: 7, nome: 'Calabresa Acebolada',   cat: 'Petisco',   subcat: '', preco: 35,  estoque: 15, estoqueMinimo: 5, imagem: 'https://picsum.photos/seed/calabresa/600/400' },
      { id: 8, nome: 'Queijo Coalho',         cat: 'Petisco',   subcat: '', preco: 22,  estoque: 25, estoqueMinimo: 5, imagem: 'https://picsum.photos/seed/queijocoalho/600/400' },
    ],
    proxId: 9,
    /**
     * categorias/subcategorias:
     * - categorias: lista de strings (ex.: Bebida, Petisco, ...)
     * - subcategorias: [{ id, cat, nome }]
     */
    categorias: ['Bebida', 'Petisco', 'Prato', 'Sobremesa'],
    subcategorias: [],      // { id, cat, nome }
    proxSubcatId: 1,
    /**
     * formasPagamento: lista de strings (usado no modal de fechamento e nos relatórios)
     */
    formasPagamento: ['Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'PIX'],
    mesaSelecionada: null,
    /**
     * historico: lista de registros de pagamento (fechamento e/ou parcial)
     * - tipoPagamento: 'fechamento' | 'parcial'
     * - valorPago e saldoRestante permitem pagamentos parciais.
     */
    historico: [],          // { mesa, total, subtotal, taxaServico, formaPagamento, hora, itens[] }
    estoqueMov: [],
    clientes: [],           // { id, nome, telefone, createdAt, lastMesaId }
    proxClienteId: 1,
    clienteSessions: {},    // { [token]: { clienteId, createdAt, lastAt } }
    pedidosCliente: [],     // { id, clienteId, mesaId, ts, itens, subtotal, taxaEntrega, total }
    proxPedidoClienteId: 1,
    /**
     * filaProducao: pedidos a serem preparados por setor (bar/cozinha/churrasco)
     */
    filaProducao: [],       // { id, mesa, item, qty, tipo, status, horaPedido }
    totalDia: 0,
    empresa: {
      nome: 'ESPETINHO 075',
      telefone: '',
      endereco: '',
      pixCopiaECola: '',
      logoUrl: 'assets/logo.jpg',
      mensagemRodape: 'Obrigado pela preferência!',
      taxaEntregaPadrao: 0,
      precoOnlinePct: 0,
    },
    aparencia: {
      fundoOpacidade: 0.90,
    },
    impressao: {
      perguntarViasSetor: true,
      autoImprimirViasSetor: false,
    },
    /**
     * auditoria: log de ações do sistema (até 1000)
     */
    auditoria: [],
    /**
     * integracao: configuração do app mobile para sincronizar com o servidor web
     */
    integracao: {
      apiBaseUrl: '',
      lastSyncServerRev: 0,
      lastSyncAt: 0,
      lastSyncDirecao: '',
      lastSyncSnapshot: null,
      syncHistory: [],
    },
    /**
     * sessao/sessoes:
     * - sessao: sessão atual (token + userId)
     * - sessoes: mapa token -> { userId, ts }
     */
    sessao: null,
    sessoes: {},
    perfis: {
      gerente: {
        label: 'Gerente',
        tabs: { pedidos: true, cardapio: true, producao: true, cadastros: true, parametros: true, relatorios: true, caixa: true, estoque: true },
        acoes: {
          adicionarItem: true,
          cancelarItem: true,
          gerenciarProdutos: true,
          gerenciarSubcategorias: true,
          gerenciarMesas: true,
          gerenciarPagamentos: true,
          editarEstoque: true,
          receberPagamento: true,
          reimprimir: true,
          verRelatorios: true,
          verAuditoria: true,
          configurarSistema: true,
          gerenciarUsuarios: true,
          gerenciarPerfis: true,
          configurarIntegracao: true,
        },
      },
      garcom: {
        label: 'Garçom',
        tabs: { pedidos: true, cardapio: true, producao: true, cadastros: false, parametros: false, relatorios: false, caixa: false, estoque: false },
        acoes: {
          adicionarItem: true,
          cancelarItem: true,
          gerenciarProdutos: false,
          gerenciarSubcategorias: false,
          gerenciarMesas: false,
          gerenciarPagamentos: false,
          editarEstoque: false,
          receberPagamento: false,
          reimprimir: true,
          verRelatorios: false,
          verAuditoria: false,
          configurarSistema: false,
          gerenciarUsuarios: false,
          gerenciarPerfis: false,
          configurarIntegracao: false,
        },
      },
      cozinha: {
        label: 'Cozinha',
        tabs: { pedidos: false, cardapio: false, producao: true, cadastros: false, parametros: false, relatorios: false, caixa: false, estoque: false },
        acoes: {
          adicionarItem: false,
          cancelarItem: false,
          gerenciarProdutos: false,
          gerenciarSubcategorias: false,
          gerenciarMesas: false,
          gerenciarPagamentos: false,
          editarEstoque: false,
          receberPagamento: false,
          reimprimir: false,
          verRelatorios: false,
          verAuditoria: false,
          configurarSistema: false,
          gerenciarUsuarios: false,
          gerenciarPerfis: false,
          configurarIntegracao: false,
        },
      },
      churrasqueiro: {
        label: 'Churrasqueiro',
        tabs: { pedidos: false, cardapio: false, producao: true, cadastros: false, parametros: false, relatorios: false, caixa: false, estoque: false },
        acoes: {
          adicionarItem: false,
          cancelarItem: false,
          gerenciarProdutos: false,
          gerenciarSubcategorias: false,
          gerenciarMesas: false,
          gerenciarPagamentos: false,
          editarEstoque: false,
          receberPagamento: false,
          reimprimir: false,
          verRelatorios: false,
          verAuditoria: false,
          configurarSistema: false,
          gerenciarUsuarios: false,
          gerenciarPerfis: false,
          configurarIntegracao: false,
        },
      },
      cliente: {
        label: 'Cliente',
        tabs: { pedidos: true, cardapio: false, producao: false, cadastros: false, parametros: false, relatorios: false, caixa: false, estoque: false },
        acoes: {
          adicionarItem: false,
          cancelarItem: false,
          gerenciarProdutos: false,
          gerenciarSubcategorias: false,
          gerenciarMesas: false,
          gerenciarPagamentos: false,
          editarEstoque: false,
          receberPagamento: false,
          reimprimir: false,
          verRelatorios: false,
          verAuditoria: false,
          configurarSistema: false,
          gerenciarUsuarios: false,
          gerenciarPerfis: false,
          configurarIntegracao: false,
        },
      },
    },
    usuarios: [
      { id: 1, nome: 'Gerente', papel: 'gerente', descontoPctMax: 20, descontoValorMax: 200 },
    ],
    proxUsuarioId: 2,
    usuarioAtivo: null,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export function criarStore() {
  const estadoInicial = criarEstadoInicial();
  const perfisPadrao = JSON.parse(JSON.stringify(estadoInicial.perfis));
  let state = estadoInicial;
  const listeners = new Set();

  function notificar() {
    const stateCopy = { 
      ...state,
      mesas: { ...state.mesas },
      produtos: [...state.produtos],
      categorias: [...(state.categorias || [])],
      subcategorias: [...state.subcategorias],
      formasPagamento: [...state.formasPagamento],
      historico: [...state.historico],
      estoqueMov: [...(state.estoqueMov || [])],
      filaProducao: [...state.filaProducao],
      usuarios: state.usuarios.map(u => ({ ...u })),
      perfis: JSON.parse(JSON.stringify(state.perfis)),
      empresa: { ...(state.empresa || {}) },
      aparencia: { ...(state.aparencia || {}) },
      impressao: { ...(state.impressao || {}) },
      sync: { ...(state.sync || {}) },
      auditoria: [...(state.auditoria || [])],
      integracao: { ...(state.integracao || {}) },
      sessao: state.sessao ? { ...state.sessao } : null,
      sessoes: { ...(state.sessoes || {}) },
    };
    listeners.forEach(fn => fn(stateCopy));
  }

  function getState() {
    return state;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function calcTotalMesa(itens) {
    return itens.reduce((soma, it) => soma + it.preco * it.qty, 0);
  }

  function getProduto(id) {
    return state.produtos.find(p => p.id === id);
  }

  function getMesa(id) {
    return state.mesas[id];
  }

  function normalizarTexto(v) {
    return String(v ?? '').trim();
  }

  function logAcao(tipo, meta = {}) {
    const ts = Date.now();
    const u = state.usuarioAtivo;
    const prevRev = Number.isFinite(Number(state.sync?.rev)) ? Number(state.sync.rev) : 0;
    state.sync = {
      rev: prevRev + 1,
      updatedAt: ts,
      updatedBy: u ? { id: u.id || null, nome: u.nome || null, papel: u.papel || null } : null,
    };
    state.auditoria.unshift({
      ts,
      data: dataISO(ts),
      hora: new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      userId: u?.id || null,
      userNome: u?.nome || null,
      userPapel: u?.papel || null,
      tipo,
      meta,
    });
    if (state.auditoria.length > 1000) state.auditoria.length = 1000;
  }

  function logEventoSemRev(tipo, meta = {}) {
    const ts = Date.now();
    const u = state.usuarioAtivo;
    state.auditoria.unshift({
      ts,
      data: dataISO(ts),
      hora: new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      userId: u?.id || null,
      userNome: u?.nome || null,
      userPapel: u?.papel || null,
      tipo,
      meta,
    });
    if (state.auditoria.length > 1000) state.auditoria.length = 1000;
  }

  function _registrarMovEstoque({ produtoId, delta, motivo, origem, mesaId = null }) {
    const prod = getProduto(produtoId);
    const ts = Date.now();
    const u = state.usuarioAtivo;
    if (!Array.isArray(state.estoqueMov)) state.estoqueMov = [];
    const d = Number(delta) || 0;
    const after = Number.isFinite(Number(prod?.estoque)) ? Number(prod.estoque) : null;
    const before = Number.isFinite(Number(after)) ? after - d : null;
    state.estoqueMov.unshift({
      ts,
      data: dataISO(ts),
      hora: new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      userId: u?.id || null,
      userNome: u?.nome || null,
      userPapel: u?.papel || null,
      produtoId: Number(produtoId) || null,
      produtoNome: prod?.nome || null,
      categoria: prod?.cat || null,
      delta: d,
      before,
      after,
      motivo: String(motivo || ''),
      origem: String(origem || ''),
      mesaId: mesaId ? Number(mesaId) : null,
    });
    if (state.estoqueMov.length > 5000) state.estoqueMov.length = 5000;
  }

  function _registrarProdutoRecente(produtoId) {
    const uid = state.usuarioAtivo?.id;
    if (!uid) return;
    const idx = state.usuarios.findIndex(u => u.id === uid);
    if (idx === -1) return;
    const u = state.usuarios[idx];
    const id = Number(produtoId) || 0;
    if (!id) return;
    const atuais = Array.isArray(u.recentes) ? u.recentes.map(Number).filter(Boolean) : [];
    const next = [id, ...atuais.filter(x => x !== id)].slice(0, 12);
    state.usuarios[idx] = { ...u, recentes: next };
  }

  function toggleFavoritoProduto(produtoId) {
    assertLogado();
    const uid = state.usuarioAtivo?.id;
    if (!uid) throw new Error('Usuário inválido.');
    const idx = state.usuarios.findIndex(u => u.id === uid);
    if (idx === -1) throw new Error('Usuário não encontrado.');
    const id = Number(produtoId) || 0;
    if (!id) throw new Error('Produto inválido.');
    const u = state.usuarios[idx];
    const atuais = Array.isArray(u.favoritos) ? u.favoritos.map(Number).filter(Boolean) : [];
    const has = atuais.includes(id);
    const next = (has ? atuais.filter(x => x !== id) : [...atuais, id]).slice(0, 60);
    state.usuarios[idx] = { ...u, favoritos: next };
    logEventoSemRev('ui.toggle_favorito', { produtoId: id, ativo: !has });
    notificar();
  }

  function setorProduto(prod) {
    if (!prod) return 'bar';
    if (prod.cat === 'Petisco') return 'churrasco';
    if (prod.cat === 'Prato' || prod.cat === 'Sobremesa') return 'cozinha';
    return 'bar';
  }

  function criarFilaItem({ mesaId, prod, qty = 1 }) {
    return {
      id: Date.now() + Math.random(),
      mesaId,
      produtoId: prod.id,
      nome: prod.nome,
      qty,
      setor: setorProduto(prod),
      status: 'pendente',
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      origem: state.usuarioAtivo?.papel === 'cliente' ? 'Online' : 'Garçom',
    };
  }

  function assertLogado() {
    if (!state.sessao?.token || !state.usuarioAtivo?.id) throw new Error('Faça login para continuar.');
  }

  function assertTab(tab) {
    const perfil = getPerfilAcesso(state.usuarioAtivo?.papel);
    const tabs = perfil?.tabs || {};
    if (!tabs[tab]) throw new Error('Acesso negado.');
  }

  function assertAcao(acao) {
    const perfil = getPerfilAcesso(state.usuarioAtivo?.papel);
    const acoes = perfil?.acoes || {};
    if (!acoes[acao]) throw new Error('Ação não permitida para este perfil.');
  }

  function calcResumoMesa(mesa, aplicarTaxaOrOpts = false) {
    const opts = (aplicarTaxaOrOpts && typeof aplicarTaxaOrOpts === 'object')
      ? aplicarTaxaOrOpts
      : { aplicarTaxa: aplicarTaxaOrOpts };
    const subtotal = calcTotalMesa(mesa.itens);
    const aplicarTaxaEfetiva = !!(mesa.aplicarTaxa || opts.aplicarTaxa);

    const tipo = String(opts.descontoTipo || '').toLowerCase();
    const pctRaw = Number(opts.descontoPct);
    const valorRaw = Number(opts.descontoValor);
    const descontoPct = (tipo === 'pct' && Number.isFinite(pctRaw)) ? Math.max(0, Math.min(100, pctRaw)) : 0;
    const descontoValorReq = (tipo === 'valor' && Number.isFinite(valorRaw)) ? Math.max(0, valorRaw) : 0;
    const descontoValor = Math.max(0, Math.min(subtotal, tipo === 'pct' ? (subtotal * descontoPct / 100) : descontoValorReq));

    const baseTaxa = Math.max(0, subtotal - descontoValor);
    const taxaServico = aplicarTaxaEfetiva ? baseTaxa * 0.10 : 0;
    const taxaEntrega = Number.isFinite(Number(mesa?.taxaEntrega)) ? Math.max(0, Number(mesa.taxaEntrega)) : 0;
    const total = baseTaxa + taxaServico + taxaEntrega;
    const credito = mesa.credito || 0;
    const saldo = Math.max(0, total - credito);

    return { subtotal, aplicarTaxa: aplicarTaxaEfetiva, descontoValor, descontoPct: (tipo === 'pct' ? descontoPct : 0), taxaServico, taxaEntrega, total, credito, saldo };
  }

  function setPermitirVendaSemEstoque(valor) {
    assertLogado();
    assertTab('parametros');
    assertAcao('configurarSistema');
    state.permitirVendaSemEstoque = !!valor;
    logAcao('cadastros.config_venda_sem_estoque', { valor: state.permitirVendaSemEstoque });
    notificar();
  }

  function getPerfilAcesso(papel) {
    const p = String(papel || '').toLowerCase();
    const base = state.perfis?.[p] || state.perfis?.gerente;
    if (!base) return null;
    const padrao = perfisPadrao?.[p] || perfisPadrao?.gerente || {};
    const tabs = { ...(padrao.tabs || {}), ...(base.tabs || {}) };
    const acoes = { ...(padrao.acoes || {}), ...(base.acoes || {}) };
    if (tabs.parametros === undefined) tabs.parametros = !!tabs.cadastros;
    if (p === 'gerente') tabs.parametros = true;
    return { ...padrao, ...base, tabs, acoes };
  }

  function getPapeisDisponiveis() {
    return [...PAPEIS];
  }

  function getCategorias() {
    return [...(state.categorias || [])];
  }

  function adicionarCategoria(nome) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarProdutos');
    const n = normalizarTexto(nome);
    if (!n) throw new Error('Nome da categoria é obrigatório.');
    if (!Array.isArray(state.categorias)) state.categorias = [];
    const existe = state.categorias.some(c => String(c || '').toLowerCase() === n.toLowerCase());
    if (existe) throw new Error('Esta categoria já existe.');
    state.categorias.push(n);
    logAcao('cadastros.adicionar_categoria', { nome: n });
    notificar();
  }

  function removerCategoria(nome) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarProdutos');
    const n = normalizarTexto(nome);
    if (!n) throw new Error('Categoria inválida.');
    const atual = Array.isArray(state.categorias) ? state.categorias : [];
    const existe = atual.some(c => String(c || '').toLowerCase() === n.toLowerCase());
    if (!existe) return;
    const emUso = (state.produtos || []).some(p => String(p.cat || '').toLowerCase() === n.toLowerCase());
    if (emUso) throw new Error('Não é possível remover: há produtos usando esta categoria.');
    if (atual.length <= 1) throw new Error('Deixe pelo menos uma categoria cadastrada.');
    state.categorias = atual.filter(c => String(c || '').toLowerCase() !== n.toLowerCase());
    logAcao('cadastros.remover_categoria', { nome: n });
    notificar();
  }

  // ── Pedidos ──────────────────────────────────────────────────────────────

  function selecionarMesa(id) {
    assertLogado();
    assertTab('pedidos');
    const mesa = state.mesas[id];
    if (!mesa) throw new Error(`Mesa ${id} não existe.`);
    state.mesaSelecionada = id;
    notificar();
  }

  function adicionarItemMesa(mesaId, produtoId) {
    assertLogado();
    assertTab('pedidos');
    assertAcao('adicionarItem');
    const mesa = getMesa(mesaId);
    const prod = getProduto(produtoId);
    if (!mesa) throw new Error(`Mesa ${mesaId} não encontrada.`);
    if (!prod) throw new Error(`Produto ${produtoId} não encontrado.`);
    if (mesa.tipo !== 'online' && prod.somenteOnline) throw new Error(`"${prod.nome}" disponível apenas no pedido online.`);
    if (!state.permitirVendaSemEstoque && prod.estoque <= 0) throw new Error(`"${prod.nome}" sem estoque.`);

    if (mesa.status === 'livre') mesa.status = 'ocupada';

    const pctOnline = Number.isFinite(Number(state.empresa?.precoOnlinePct)) ? Number(state.empresa.precoOnlinePct) : 0;
    const precoVenda = (mesa.tipo === 'online')
      ? Math.round((Number(prod.preco) * (1 + (pctOnline / 100))) * 100) / 100
      : prod.preco;

    const item = mesa.itens.find(it => it.id === produtoId);
    if (item) {
      item.qty += 1;
    } else {
      mesa.itens.push({ id: prod.id, nome: prod.nome, preco: precoVenda, qty: 1 });
    }
    prod.estoque -= 1;
    _registrarMovEstoque({ produtoId: prod.id, delta: -1, motivo: 'venda', origem: 'pedido', mesaId });
    _registrarProdutoRecente(prod.id);

    // Adiciona à fila de produção (FIFO)
    const filaItem = criarFilaItem({ mesaId, prod, qty: 1 });
    state.filaProducao.push(filaItem);

    logAcao('pedido.adicionar_item', { mesaId, produtoId: prod.id, nome: prod.nome });
    notificar();
    return filaItem;
  }

  function removerItemMesa(mesaId, produtoId) {
    assertLogado();
    assertTab('pedidos');
    assertAcao('cancelarItem');
    const mesa = getMesa(mesaId);
    const item = mesa.itens.find(it => it.id === produtoId);
    if (!item) return;

    const prod = getProduto(produtoId);
    if (prod) {
      prod.estoque += item.qty;
      _registrarMovEstoque({ produtoId, delta: Number(item.qty) || 0, motivo: 'cancelamento', origem: 'pedido', mesaId });
    }

    mesa.itens = mesa.itens.filter(it => it.id !== produtoId);
    if (mesa.itens.length === 0) mesa.status = 'livre';
    logAcao('pedido.remover_item', { mesaId, produtoId });
    notificar();
  }

  function alterarQuantidadeItem(mesaId, produtoId, delta) {
    assertLogado();
    assertTab('pedidos');
    if (delta < 0) assertAcao('cancelarItem');
    if (delta > 0) assertAcao('adicionarItem');
    const mesa = getMesa(mesaId);
    const item = mesa.itens.find(it => it.id === produtoId);
    if (!item) return;

    let filaItem = null;
    if (delta > 0) {
      const prod = getProduto(produtoId);
      if (!prod) throw new Error('Produto não encontrado.');
      if (mesa.tipo !== 'online' && prod.somenteOnline) throw new Error(`"${prod.nome}" disponível apenas no pedido online.`);
      if (!state.permitirVendaSemEstoque && prod.estoque <= 0) throw new Error('Sem estoque.');
      prod.estoque -= 1;
      item.qty += 1;
      if (mesa.tipo === 'online') {
        const pctOnline = Number.isFinite(Number(state.empresa?.precoOnlinePct)) ? Number(state.empresa.precoOnlinePct) : 0;
        item.preco = Math.round((Number(prod.preco) * (1 + (pctOnline / 100))) * 100) / 100;
      }
      _registrarMovEstoque({ produtoId, delta: -1, motivo: 'venda', origem: 'pedido', mesaId });
      _registrarProdutoRecente(produtoId);
      filaItem = criarFilaItem({ mesaId, prod, qty: 1 });
      state.filaProducao.push(filaItem);
    } else {
      item.qty -= 1;
      const prod = getProduto(produtoId);
      if (prod) {
        prod.estoque += 1;
        _registrarMovEstoque({ produtoId, delta: 1, motivo: 'cancelamento', origem: 'pedido', mesaId });
      }
      if (item.qty <= 0) {
        mesa.itens = mesa.itens.filter(it => it.id !== produtoId);
      }
    }
    if (mesa.itens.length === 0) mesa.status = 'livre';
    logAcao('pedido.alterar_qtd', { mesaId, produtoId, delta });
    notificar();
    return filaItem;
  }

  function registrarPagamentoMesa(mesaId, { valorPago, aplicarTaxa = false, formaPagamento = 'Dinheiro', descontoTipo = '', descontoPct = 0, descontoValor = 0 } = {}) {
    assertLogado();
    assertTab('caixa');
    assertAcao('receberPagamento');
    const mesa = getMesa(mesaId);
    if (!mesa) throw new Error(`Mesa ${mesaId} não encontrada.`);
    
    const u = state.usuarios.find(x => x.id === state.usuarioAtivo?.id) || state.usuarioAtivo || {};
    const maxPct = Number.isFinite(Number(u.descontoPctMax)) ? Math.max(0, Math.min(100, Number(u.descontoPctMax))) : 0;
    const maxVal = Number.isFinite(Number(u.descontoValorMax)) ? Math.max(0, Number(u.descontoValorMax)) : 0;
    const tipo = String(descontoTipo || '').toLowerCase();
    const pctReq = Number(descontoPct);
    const valReq = Number(descontoValor);
    if (tipo && tipo !== 'pct' && tipo !== 'valor') throw new Error('Tipo de desconto inválido.');
    if (tipo === 'pct') {
      if (!Number.isFinite(pctReq) || pctReq < 0) throw new Error('Desconto (%) inválido.');
      if (pctReq > maxPct) throw new Error(`Desconto (%) acima do limite do usuário (${maxPct}%).`);
    }
    if (tipo === 'valor') {
      if (!Number.isFinite(valReq) || valReq < 0) throw new Error('Desconto (R$) inválido.');
      if (valReq > maxVal) throw new Error(`Desconto (R$) acima do limite do usuário (R$ ${maxVal.toFixed(2).replace('.', ',')}).`);
    }

    const resumo = calcResumoMesa(mesa, { aplicarTaxa, descontoTipo: tipo, descontoPct: pctReq, descontoValor: valReq });
    if (resumo.subtotal === 0) throw new Error('Mesa sem consumo.');

    const valor = Number(valorPago);
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe um valor válido para abater.');
    if (valor > resumo.saldo) throw new Error('Valor maior que o saldo da mesa.');

    mesa.aplicarTaxa = resumo.aplicarTaxa;
    mesa.credito = (mesa.credito || 0) + valor;

    const saldoRestante = Math.max(0, resumo.saldo - valor);
    const tipoPagamento = saldoRestante === 0 ? 'fechamento' : 'parcial';

    const ts = Date.now();
    const hora = new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    state.historico.unshift({
      mesa: mesaId,
      tipoPagamento,
      tipoMesa: mesa.tipo,
      subtotal: resumo.subtotal,
      descontoTipo: tipo || '',
      descontoPct: resumo.descontoPct || 0,
      descontoValor: resumo.descontoValor || 0,
      taxaServico: resumo.taxaServico,
      taxaEntrega: resumo.taxaEntrega || 0,
      total: resumo.total,
      valorPago: valor,
      saldoRestante,
      formaPagamento,
      hora,
      ts,
      data: dataISO(ts),
      itens: mesa.itens.map(it => ({ ...it })),
    });
    
    state.totalDia += valor;

    if (saldoRestante === 0) {
      state.mesas[mesaId] = { ...mesa, itens: [], status: 'livre', credito: 0, aplicarTaxa: false };
      if (state.mesaSelecionada === mesaId) state.mesaSelecionada = null;
    }
    logAcao('caixa.pagamento', { mesaId, tipoPagamento, valorPago: valor, formaPagamento, aplicarTaxa: resumo.aplicarTaxa, descontoTipo: tipo || '', descontoPct: resumo.descontoPct || 0, descontoValor: resumo.descontoValor || 0, taxaEntrega: resumo.taxaEntrega || 0 });
    notificar();

    return {
      tipoPagamento,
      valorPago: valor,
      saldoRestante,
      subtotal: resumo.subtotal,
      descontoTipo: tipo || '',
      descontoPct: resumo.descontoPct || 0,
      descontoValor: resumo.descontoValor || 0,
      taxaServico: resumo.taxaServico,
      taxaEntrega: resumo.taxaEntrega || 0,
      total: resumo.total,
      aplicarTaxa: resumo.aplicarTaxa,
      formaPagamento,
      mesaId,
      tipoMesa: mesa.tipo,
      hora,
      itens: mesa.itens.map(it => ({ ...it })),
    };
  }

  function fecharMesa(mesaId, { aplicarTaxa = false, formaPagamento = 'Dinheiro', descontoTipo = '', descontoPct = 0, descontoValor = 0 } = {}) {
    const resumo = calcResumoMesa(getMesa(mesaId), { aplicarTaxa, descontoTipo, descontoPct, descontoValor });
    return registrarPagamentoMesa(mesaId, { valorPago: resumo.saldo, aplicarTaxa, formaPagamento, descontoTipo, descontoPct, descontoValor });
  }

  // ── Gestão de Mesas ────────────────────────────────────────────────────────

  function adicionarMesa(tipo = 'presencial') {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarMesas');
    const ids = Object.keys(state.mesas).map(Number);
    const novoId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
    state.mesas[novoId] = { id: novoId, itens: [], status: 'livre', tipo, credito: 0, aplicarTaxa: false, token: '', clienteId: null, cliente: null, createdAt: 0, taxaEntrega: 0 };
    logAcao('cadastros.adicionar_mesa', { id: novoId, tipo });
    notificar();
  }

  function garantirTokenMesa(mesaId) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarMesas');
    const id = Number(mesaId) || 0;
    if (!id) throw new Error('Mesa inválida.');
    const mesa = getMesa(id);
    if (!mesa) throw new Error(`Mesa ${id} não existe.`);
    const atual = normalizarTexto(mesa.token);
    if (atual) return atual;
    mesa.token = randomToken(12);
    logAcao('cadastros.mesa_token.gerar', { mesaId: id });
    notificar();
    return mesa.token;
  }

  function resetarTokenMesa(mesaId) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarMesas');
    const id = Number(mesaId) || 0;
    if (!id) throw new Error('Mesa inválida.');
    const mesa = getMesa(id);
    if (!mesa) throw new Error(`Mesa ${id} não existe.`);
    mesa.token = randomToken(12);
    logAcao('cadastros.mesa_token.resetar', { mesaId: id });
    notificar();
    return mesa.token;
  }

  function removerMesa(id) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarMesas');
    const mesa = state.mesas[id];
    if (!mesa) return;
    if (mesa.itens.length > 0) throw new Error('Não é possível excluir uma mesa com itens pendentes.');
    
    delete state.mesas[id];
    if (state.mesaSelecionada === id) state.mesaSelecionada = null;
    logAcao('cadastros.remover_mesa', { id });
    notificar();
  }

  // ── Cardápio ─────────────────────────────────────────────────────────────

  function adicionarProduto({ nome, cat, preco, estoque, estoqueMinimo }) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarProdutos');
    if (!nome || !preco) throw new Error('Nome e preço são obrigatórios.');
    const catTxt = normalizarTexto(cat);
    if (!catTxt) throw new Error('Categoria é obrigatória.');
    const precoNum = Number(preco);
    if (!Number.isFinite(precoNum) || precoNum <= 0) throw new Error('Preço inválido.');
    const estoqueNum = parseInt(estoque, 10);
    const estoqueFinal = Number.isFinite(estoqueNum) ? Math.max(0, estoqueNum) : 0;
    const minNum = parseInt(estoqueMinimo, 10);
    const minFinal = Number.isFinite(minNum) ? Math.max(0, minNum) : 5;
    if (!Array.isArray(state.categorias)) state.categorias = [];
    if (!state.categorias.some(c => String(c || '').toLowerCase() === catTxt.toLowerCase())) {
      state.categorias.push(catTxt);
    }
    state.produtos.push({
      id: state.proxId++,
      nome: normalizarTexto(nome),
      cat: catTxt,
      subcat: normalizarTexto(arguments[0]?.subcat),
      imagem: normalizarTexto(arguments[0]?.imagem),
      tipo: (String(arguments[0]?.tipo || '').toLowerCase() === 'combo') ? 'combo' : 'produto',
      somenteOnline: !!(String(arguments[0]?.tipo || '').toLowerCase() === 'combo' || arguments[0]?.somenteOnline),
      preco: precoNum,
      estoque: estoqueFinal,
      estoqueMinimo: minFinal,
    });
    logAcao('cadastros.adicionar_produto', { id: state.proxId - 1, nome });
    notificar();
  }

  function editarProduto(id, dados) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarProdutos');
    const index = state.produtos.findIndex(p => p.id === id);
    if (index === -1) return;
    const patch = { ...dados };
    if (Object.prototype.hasOwnProperty.call(patch, 'nome')) patch.nome = normalizarTexto(patch.nome);
    if (Object.prototype.hasOwnProperty.call(patch, 'cat')) {
      const c = normalizarTexto(patch.cat);
      if (!c) throw new Error('Categoria inválida.');
      patch.cat = c;
      if (!Array.isArray(state.categorias)) state.categorias = [];
      if (!state.categorias.some(x => String(x || '').toLowerCase() === c.toLowerCase())) {
        state.categorias.push(c);
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'subcat')) patch.subcat = normalizarTexto(patch.subcat);
    if (Object.prototype.hasOwnProperty.call(patch, 'imagem')) patch.imagem = normalizarTexto(patch.imagem);
    if (Object.prototype.hasOwnProperty.call(patch, 'tipo')) {
      const t = String(patch.tipo || '').trim().toLowerCase();
      patch.tipo = (t === 'combo') ? 'combo' : 'produto';
      if (patch.tipo === 'combo') patch.somenteOnline = true;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'somenteOnline')) patch.somenteOnline = !!patch.somenteOnline;
    if (Object.prototype.hasOwnProperty.call(patch, 'preco')) {
      const n = Number(patch.preco);
      if (!Number.isFinite(n) || n <= 0) throw new Error('Preço inválido.');
      patch.preco = n;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'estoque')) {
      const n = parseInt(patch.estoque, 10);
      patch.estoque = Number.isFinite(n) ? Math.max(0, n) : 0;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'estoqueMinimo')) {
      const n = parseInt(patch.estoqueMinimo, 10);
      patch.estoqueMinimo = Number.isFinite(n) ? Math.max(0, n) : 0;
    }
    const before = state.produtos[index];
    state.produtos[index] = { ...state.produtos[index], ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, 'estoque')) {
      const afterEst = Number(state.produtos[index].estoque) || 0;
      const beforeEst = Number(before.estoque) || 0;
      const d = afterEst - beforeEst;
      if (d !== 0) _registrarMovEstoque({ produtoId: id, delta: d, motivo: 'ajuste', origem: 'cadastros', mesaId: null });
    }
    logAcao('cadastros.editar_produto', { id, before: { nome: before.nome, preco: before.preco, estoque: before.estoque }, after: { nome: state.produtos[index].nome, preco: state.produtos[index].preco, estoque: state.produtos[index].estoque } });
    notificar();
  }

  function removerProduto(id) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarProdutos');
    state.produtos = state.produtos.filter(p => p.id !== id);
    Object.values(state.mesas).forEach(mesa => {
      mesa.itens = mesa.itens.filter(it => it.id !== id);
    });
    logAcao('cadastros.remover_produto', { id });
    notificar();
  }

  // ── Subcategorias ─────────────────────────────────────────────────────────

  function adicionarSubcategoria({ cat, nome }) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarSubcategorias');
    const c = normalizarTexto(cat);
    const n = normalizarTexto(nome);
    if (!c || !n) throw new Error('Categoria e subcategoria são obrigatórias.');
    const cats = Array.isArray(state.categorias) ? state.categorias : [];
    const catExiste = cats.some(x => String(x || '').toLowerCase() === c.toLowerCase());
    if (!catExiste) throw new Error('Categoria não cadastrada.');
    const existe = state.subcategorias.some(s => s.cat === c && s.nome.toLowerCase() === n.toLowerCase());
    if (existe) throw new Error('Esta subcategoria já existe nesta categoria.');
    state.subcategorias.push({ id: state.proxSubcatId++, cat: c, nome: n });
    logAcao('cadastros.adicionar_subcategoria', { cat: c, nome: n });
    notificar();
  }

  function removerSubcategoria(id) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarSubcategorias');
    const sub = state.subcategorias.find(s => s.id === id);
    if (!sub) return;
    state.subcategorias = state.subcategorias.filter(s => s.id !== id);
    state.produtos = state.produtos.map(p => {
      if (p.cat === sub.cat && (p.subcat || '').toLowerCase() === sub.nome.toLowerCase()) {
        return { ...p, subcat: '' };
      }
      return p;
    });
    logAcao('cadastros.remover_subcategoria', { id });
    notificar();
  }

  function getSubcategoriasPorCategoria(cat) {
    const c = normalizarTexto(cat);
    return state.subcategorias
      .filter(s => s.cat === c)
      .map(s => s.nome)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  // ── Estoque ──────────────────────────────────────────────────────────────

  function ajustarEstoque(produtoId, delta) {
    assertLogado();
    assertTab('estoque');
    assertAcao('editarEstoque');
    const prod = getProduto(produtoId);
    if (!prod) return;
    prod.estoque = prod.estoque + delta;
    if (!state.permitirVendaSemEstoque) prod.estoque = Math.max(0, prod.estoque);
    _registrarMovEstoque({ produtoId, delta, motivo: 'ajuste', origem: 'estoque', mesaId: null });
    logAcao('estoque.ajustar', { produtoId, delta, estoque: prod.estoque });
    notificar();
  }

  // ── Gestão de Usuários ──────────────────────────────────────────────────────

  function adicionarUsuario({ nome, papel }) {
    assertLogado();
    assertTab('parametros');
    assertAcao('gerenciarUsuarios');
    const n = normalizarTexto(nome);
    const p = normalizarTexto(papel).toLowerCase();
    const senha = normalizarTexto(arguments[0]?.senha);
    if (!n) throw new Error('Nome é obrigatório.');
    if (!PAPEIS.includes(p)) throw new Error('Papel inválido.');
    const pctMax = Number(arguments[0]?.descontoPctMax);
    const valMax = Number(arguments[0]?.descontoValorMax);
    const descontoPctMax = Number.isFinite(pctMax) ? Math.max(0, Math.min(100, pctMax)) : 0;
    const descontoValorMax = Number.isFinite(valMax) ? Math.max(0, valMax) : 0;
    const novo = { id: state.proxUsuarioId++, nome: n, papel: p, descontoPctMax, descontoValorMax };
    if (senha) {
      novo.senhaSalt = randomToken(8);
      novo.senhaHash = sha256Hex(`${novo.senhaSalt}:${senha}`);
    }
    state.usuarios.push(novo);
    logAcao('cadastros.adicionar_usuario', { id: novo.id, papel: p, nome: n });
    notificar();
  }

  function editarUsuario(id, { nome, papel, senha, descontoPctMax, descontoValorMax }) {
    assertLogado();
    assertTab('parametros');
    assertAcao('gerenciarUsuarios');
    const idx = state.usuarios.findIndex(u => u.id === id);
    if (idx === -1) return;
    const patch = {};
    if (typeof nome !== 'undefined') {
      const n = normalizarTexto(nome);
      if (!n) throw new Error('Nome é obrigatório.');
      patch.nome = n;
    }
    if (typeof papel !== 'undefined') {
      const p = normalizarTexto(papel).toLowerCase();
      if (!PAPEIS.includes(p)) throw new Error('Papel inválido.');
      patch.papel = p;
    }
    if (typeof senha !== 'undefined') {
      const s = normalizarTexto(senha);
      if (s) {
        patch.senhaSalt = randomToken(8);
        patch.senhaHash = sha256Hex(`${patch.senhaSalt}:${s}`);
      } else {
        patch.senhaSalt = '';
        patch.senhaHash = '';
      }
    }
    if (typeof descontoPctMax !== 'undefined') {
      const n = Number(descontoPctMax);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Limite de desconto (%) inválido.');
      patch.descontoPctMax = Math.max(0, Math.min(100, n));
    }
    if (typeof descontoValorMax !== 'undefined') {
      const n = Number(descontoValorMax);
      if (!Number.isFinite(n) || n < 0) throw new Error('Limite de desconto (R$) inválido.');
      patch.descontoValorMax = Math.max(0, n);
    }
    state.usuarios[idx] = { ...state.usuarios[idx], ...patch };
    if (state.usuarioAtivo?.id === id) {
      const novoAtivo = { ...state.usuarioAtivo };
      if (Object.prototype.hasOwnProperty.call(patch, 'nome')) novoAtivo.nome = patch.nome;
      if (Object.prototype.hasOwnProperty.call(patch, 'papel')) novoAtivo.papel = patch.papel;
      state.usuarioAtivo = novoAtivo;
    }
    logAcao('cadastros.editar_usuario', { id });
    notificar();
  }

  function removerUsuario(id) {
    assertLogado();
    assertTab('parametros');
    assertAcao('gerenciarUsuarios');
    const user = state.usuarios.find(u => u.id === id);
    if (!user) return;
    state.usuarios = state.usuarios.filter(u => u.id !== id);
    if (state.usuarioAtivo?.id === id) {
      const fallback = state.usuarios.find(u => u.papel === 'gerente') || state.usuarios[0] || { id: 0, nome: 'Gerente', papel: 'gerente' };
      state.usuarioAtivo = { id: fallback.id, nome: fallback.nome, papel: fallback.papel };
      state.sessao = null;
    }
    logAcao('cadastros.remover_usuario', { id });
    notificar();
  }

  function selecionarUsuarioAtivo(id, senha) {
    const user = state.usuarios.find(u => u.id === id);
    if (!user) throw new Error('Usuário não encontrado.');
    if (user.senhaHash) {
      const tentativa = normalizarTexto(senha);
      const salt = normalizarTexto(user.senhaSalt);
      const hashSalted = sha256Hex(`${salt}:${tentativa}`);
      const hashPlain = sha256Hex(`${tentativa}`);
      const ok = (hashSalted === user.senhaHash) || (!salt && hashPlain === user.senhaHash);
      if (!ok) throw new Error('Senha inválida.');
    }
    const token = randomToken(16);
    const ts = Date.now();
    state.sessoes[token] = { userId: user.id, ts };
    state.sessao = { token, userId: user.id, ts };
    state.usuarioAtivo = { id: user.id, nome: user.nome, papel: user.papel };
    logAcao('auth.login', { userId: user.id });
    notificar();
  }

  function restaurarSessao(token) {
    const t = normalizarTexto(token);
    const info = state.sessoes?.[t];
    if (!info?.userId) return false;
    const user = state.usuarios.find(u => u.id === info.userId);
    if (!user) return false;
    state.sessao = { token: t, userId: user.id, ts: info.ts || Date.now() };
    state.usuarioAtivo = { id: user.id, nome: user.nome, papel: user.papel };
    notificar();
    return true;
  }

  function logout() {
    const t = state.sessao?.token;
    if (t && state.sessoes?.[t]) delete state.sessoes[t];
    state.sessao = null;
    state.usuarioAtivo = null;
    logAcao('auth.logout', {});
    notificar();
  }

  function atualizarPerfilAcesso(papel, tabsPatch) {
    assertLogado();
    assertTab('parametros');
    assertAcao('gerenciarPerfis');
    const p = normalizarTexto(papel).toLowerCase();
    if (!PAPEIS.includes(p)) throw new Error('Papel inválido.');
    const atual = state.perfis?.[p] || { label: p, tabs: {} };
    const tabs = { ...(atual.tabs || {}) };
    Object.entries(tabsPatch || {}).forEach(([k, v]) => {
      tabs[k] = !!v;
    });
    state.perfis = { ...(state.perfis || {}), [p]: { ...atual, tabs } };
    logAcao('cadastros.editar_perfil_tabs', { papel: p });
    notificar();
  }

  function trocarUsuario(nome, papel) {
    const n = normalizarTexto(nome);
    const p = normalizarTexto(papel).toLowerCase();
    if (!n) throw new Error('Nome é obrigatório.');
    if (!PAPEIS.includes(p)) throw new Error('Papel inválido.');
    state.usuarioAtivo = { id: state.usuarioAtivo?.id || 0, nome: n, papel: p };
    notificar();
  }

  // ── Logística de Produção ──────────────────────────────────────────────────

  function atualizarStatusProducao(pedidoId, novoStatus) {
    assertLogado();
    assertTab('producao');
    const pedido = state.filaProducao.find(p => p.id === pedidoId);
    if (!pedido) return;
    if (novoStatus === 'entregue') {
      state.filaProducao = state.filaProducao.filter(p => p.id !== pedidoId);
    } else {
      pedido.status = novoStatus;
    }
    logAcao('producao.status', { pedidoId, novoStatus });
    notificar();
  }

  // ── Derivações (getters) ──────────────────────────────────────────────────

  function getTicketMedio() {
    const fechamentos = state.historico.filter(h => !h.tipoPagamento || h.tipoPagamento === 'fechamento').length;
    if (!fechamentos) return 0;
    return state.totalDia / fechamentos;
  }

  function getVendasPorCategoria() {
    const totais = {};
    state.historico
      .filter(h => !h.tipoPagamento || h.tipoPagamento === 'fechamento')
      .forEach(h =>
        h.itens.forEach(it => {
          const prod = state.produtos.find(p => p.id === it.id);
          const cat = prod ? prod.cat : 'Outros';
          totais[cat] = (totais[cat] || 0) + it.preco * it.qty;
        })
      );
    return totais;
  }

  function getProdutosBaixoEstoque(limite = 5) {
    const fallback = Number.isFinite(Number(limite)) ? Number(limite) : 5;
    return state.produtos.filter(p => {
      const min = Number.isFinite(Number(p.estoqueMinimo)) ? Number(p.estoqueMinimo) : fallback;
      return p.estoque <= min;
    });
  }

  function getProdutosDisponiveis(tipoMesa = '') {
    const tipo = String(tipoMesa || '');
    const base = state.permitirVendaSemEstoque ? state.produtos : state.produtos.filter(p => p.estoque > 0);
    if (tipo === 'presencial') return base.filter(p => !p.somenteOnline);
    return base;
  }

  function getMesasOcupadas() {
    return Object.values(state.mesas).filter(m => m.status === 'ocupada').length;
  }

  // ── Gestão de Pagamentos ──────────────────────────────────────────────────

  function adicionarFormaPagamento(nome) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarPagamentos');
    if (!nome) return;
    if (state.formasPagamento.includes(nome)) throw new Error('Esta forma de pagamento já existe.');
    state.formasPagamento.push(nome);
    logAcao('cadastros.adicionar_forma_pagamento', { nome });
    notificar();
  }

  function removerFormaPagamento(nome) {
    assertLogado();
    assertTab('cadastros');
    assertAcao('gerenciarPagamentos');
    state.formasPagamento = state.formasPagamento.filter(f => f !== nome);
    logAcao('cadastros.remover_forma_pagamento', { nome });
    notificar();
  }

  function atualizarEmpresa(patch) {
    assertLogado();
    assertTab('parametros');
    assertAcao('configurarSistema');
    const next = { ...(state.empresa || {}), ...(patch || {}) };
    if (Object.prototype.hasOwnProperty.call(next, 'taxaEntregaPadrao')) {
      const v = Number(next.taxaEntregaPadrao);
      if (!Number.isFinite(v) || v < 0) throw new Error('Taxa de entrega inválida.');
      next.taxaEntregaPadrao = Math.max(0, v);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'precoOnlinePct')) {
      const v = Number(next.precoOnlinePct);
      if (!Number.isFinite(v)) throw new Error('Percentual de preço online inválido.');
      next.precoOnlinePct = Math.max(-50, Math.min(500, v));
    }
    state.empresa = next;
    logAcao('cadastros.atualizar_empresa', {});
    notificar();
  }

  function atualizarAparencia(patch) {
    assertLogado();
    assertTab('parametros');
    assertAcao('configurarSistema');
    const atual = { ...(state.aparencia || {}) };
    const next = { ...atual, ...(patch || {}) };
    if (Object.prototype.hasOwnProperty.call(next, 'fundoOpacidade')) {
      const v = Number(next.fundoOpacidade);
      if (!Number.isFinite(v)) throw new Error('Opacidade inválida.');
      next.fundoOpacidade = Math.max(0, Math.min(1, v));
    }
    state.aparencia = next;
    logAcao('parametros.atualizar_aparencia', { fundoOpacidade: state.aparencia?.fundoOpacidade });
    notificar();
  }

  function atualizarImpressao(patch) {
    assertLogado();
    assertTab('parametros');
    assertAcao('configurarSistema');
    const atual = { ...(state.impressao || {}) };
    const next = { ...atual, ...(patch || {}) };
    if (Object.prototype.hasOwnProperty.call(next, 'perguntarViasSetor')) next.perguntarViasSetor = !!next.perguntarViasSetor;
    if (Object.prototype.hasOwnProperty.call(next, 'autoImprimirViasSetor')) next.autoImprimirViasSetor = !!next.autoImprimirViasSetor;
    state.impressao = next;
    logAcao('parametros.atualizar_impressao', { ...state.impressao });
    notificar();
  }

  function atualizarIntegracao(patch) {
    assertLogado();
    assertTab('parametros');
    assertAcao('configurarIntegracao');
    state.integracao = { ...(state.integracao || {}), ...(patch || {}) };
    logEventoSemRev('parametros.atualizar_integracao', {});
    notificar();
  }

  function getSyncSnapshot() {
    const s = getState();
    return {
      rev: Number(s.sync?.rev) || 0,
      categorias: [...(s.categorias || [])],
      produtos: (s.produtos || []).map(p => ({
        id: p.id,
        nome: p.nome,
        cat: p.cat,
        subcat: p.subcat,
        tipo: p.tipo,
        somenteOnline: !!p.somenteOnline,
        preco: p.preco,
        estoque: p.estoque,
        estoqueMinimo: p.estoqueMinimo,
        imagem: p.imagem,
      })),
      usuarios: (s.usuarios || []).map(u => ({
        id: u.id,
        nome: u.nome,
        papel: u.papel,
        /**
         * senhaHash:
         * - Internamente o usuário pode ter senhaSalt + senhaHash (sha256Hex(`${salt}:${senha}`)).
         * - Para exportação/sincronização, colocamos os dois em uma string: "v1$<salt>$<hash>".
         *   Isso evita perder o salt ao salvar no Supabase (tabela usuarios usa um único campo senha_hash).
         */
        senhaHash: (u.senhaHash && u.senhaSalt)
          ? `v1$${String(u.senhaSalt)}$${String(u.senhaHash)}`
          : (u.senhaHash || null),
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

  function atualizarAcoesPerfil(papel, acoesPatch) {
    assertLogado();
    assertTab('parametros');
    assertAcao('gerenciarPerfis');
    const p = normalizarTexto(papel).toLowerCase();
    if (!PAPEIS.includes(p)) throw new Error('Papel inválido.');
    const atual = state.perfis?.[p] || { label: p, tabs: {}, acoes: {} };
    const acoes = { ...(atual.acoes || {}) };
    Object.entries(acoesPatch || {}).forEach(([k, v]) => {
      acoes[k] = !!v;
    });
    state.perfis = { ...(state.perfis || {}), [p]: { ...atual, acoes } };
    logAcao('cadastros.editar_perfil_acoes', { papel: p });
    notificar();
  }

  function exportarEstado() {
    return JSON.parse(JSON.stringify(state));
  }

  function importarEstado(novo) {
    const base = criarEstadoInicial();
    const s = { ...base, ...(novo || {}) };
    let normalizou = false;
    if (!s.empresa) s.empresa = { ...base.empresa };
    if (!Number.isFinite(Number(s.empresa.taxaEntregaPadrao))) s.empresa.taxaEntregaPadrao = 0;
    s.empresa.taxaEntregaPadrao = Math.max(0, Number(s.empresa.taxaEntregaPadrao) || 0);
    if (!Number.isFinite(Number(s.empresa.precoOnlinePct))) s.empresa.precoOnlinePct = 0;
    s.empresa.precoOnlinePct = Math.max(-50, Math.min(500, Number(s.empresa.precoOnlinePct) || 0));
    if (!s.aparencia || typeof s.aparencia !== 'object') s.aparencia = { ...base.aparencia };
    if (!s.perfis) s.perfis = JSON.parse(JSON.stringify(base.perfis));
    if (!Array.isArray(s.usuarios)) s.usuarios = [...base.usuarios];
    if (s.usuarios.length === 0) s.usuarios = [...base.usuarios].map(u => ({ ...u }));
    if (!Array.isArray(s.auditoria)) s.auditoria = [];
    if (!Array.isArray(s.historico)) s.historico = [];
    if (!Array.isArray(s.estoqueMov)) s.estoqueMov = [];
    if (!Array.isArray(s.clientes)) s.clientes = [];
    if (!Number.isFinite(Number(s.proxClienteId))) s.proxClienteId = 1;
    if (!s.clienteSessions || typeof s.clienteSessions !== 'object') s.clienteSessions = {};
    if (!Array.isArray(s.pedidosCliente)) s.pedidosCliente = [];
    if (!Number.isFinite(Number(s.proxPedidoClienteId))) s.proxPedidoClienteId = 1;
    if (!s.mesas || typeof s.mesas !== 'object') s.mesas = { ...base.mesas };
    const mesasOut = {};
    Object.entries(s.mesas || {}).forEach(([k, v]) => {
      const id = Number(v?.id) || Number(k) || 0;
      if (!id) return;
      const itens = Array.isArray(v?.itens) ? v.itens.map(it => ({ ...it })) : [];
      const status = (v?.status === 'ocupada') ? 'ocupada' : 'livre';
      const tipo = (v?.tipo === 'online') ? 'online' : 'presencial';
      const credito = Number.isFinite(Number(v?.credito)) ? Number(v.credito) : 0;
      const aplicarTaxa = !!v?.aplicarTaxa;
      const token = typeof v?.token === 'string' ? v.token : '';
      const clienteId = (v?.clienteId === null || v?.clienteId === undefined) ? null : (Number(v?.clienteId) || null);
      const cliente = (v?.cliente && typeof v?.cliente === 'object') ? { ...v.cliente } : null;
      const createdAt = Number.isFinite(Number(v?.createdAt)) ? Number(v.createdAt) : 0;
      const taxaEntrega = Number.isFinite(Number(v?.taxaEntrega)) ? Math.max(0, Number(v.taxaEntrega)) : 0;
      mesasOut[id] = { id, itens, status, tipo, credito, aplicarTaxa, token, clienteId, cliente, createdAt, taxaEntrega };
    });
    if (Object.keys(mesasOut).length === 0) {
      s.mesas = { ...base.mesas };
      normalizou = true;
    } else {
      s.mesas = mesasOut;
    }
    if (!s.integracao || typeof s.integracao !== 'object') s.integracao = { ...base.integracao };
    s.integracao = { ...base.integracao, ...(s.integracao || {}) };
    if (!Number.isFinite(Number(s.integracao.lastSyncServerRev))) s.integracao.lastSyncServerRev = 0;
    if (!Number.isFinite(Number(s.integracao.lastSyncAt))) s.integracao.lastSyncAt = 0;
    if (typeof s.integracao.lastSyncDirecao !== 'string') s.integracao.lastSyncDirecao = '';
    if (!Array.isArray(s.integracao.syncHistory)) s.integracao.syncHistory = [];
    if (s.integracao.lastSyncSnapshot && typeof s.integracao.lastSyncSnapshot !== 'object') s.integracao.lastSyncSnapshot = null;
    if (!s.sync || typeof s.sync !== 'object') s.sync = { ...base.sync };
    if (!Number.isFinite(Number(s.sync.rev))) s.sync.rev = 0;
    if (!Number.isFinite(Number(s.sync.updatedAt))) s.sync.updatedAt = 0;
    if (!s.impressao || typeof s.impressao !== 'object') s.impressao = { ...base.impressao };
    if (s.impressao.perguntarViasSetor === undefined) s.impressao.perguntarViasSetor = !!base.impressao.perguntarViasSetor;
    if (s.impressao.autoImprimirViasSetor === undefined) s.impressao.autoImprimirViasSetor = !!base.impressao.autoImprimirViasSetor;
    const catsInput = Array.isArray(s.categorias) ? s.categorias : [];
    if (catsInput.length) {
      const seen = new Set();
      for (const v of catsInput) {
        const t = normalizarTexto(v);
        if (!t) continue;
        const k = t.toLowerCase();
        if (seen.has(k)) { normalizou = true; break; }
        seen.add(k);
      }
    }
    const categorias = [];
    const catSeen = new Set();
    const catPush = (v) => {
      const t = normalizarTexto(v);
      if (!t) return;
      const k = t.toLowerCase();
      if (catSeen.has(k)) return;
      catSeen.add(k);
      categorias.push(t);
    };
    (base.categorias || []).forEach(catPush);
    (Array.isArray(s.categorias) ? s.categorias : []).forEach(catPush);
    (s.produtos || []).forEach(p => catPush(p?.cat));
    (s.subcategorias || []).forEach(sc => catPush(sc?.cat));
    s.categorias = categorias;
    if (!Array.isArray(s.produtos)) s.produtos = [...base.produtos];
    s.produtos = s.produtos.map(p => {
      const out = { ...p };
      if (!Number.isFinite(Number(out.estoqueMinimo))) out.estoqueMinimo = 5;
      if (!Number.isFinite(Number(out.estoque))) out.estoque = 0;
      out.estoque = Math.max(0, parseInt(out.estoque, 10) || 0);
      out.estoqueMinimo = Math.max(0, parseInt(out.estoqueMinimo, 10) || 0);
      out.tipo = (String(out.tipo || '').toLowerCase() === 'combo') ? 'combo' : 'produto';
      out.somenteOnline = !!out.somenteOnline;
      if (out.tipo === 'combo') out.somenteOnline = true;
      if (!normalizarTexto(out.cat)) out.cat = (s.categorias?.[0] || base.categorias?.[0] || 'Bebida');
      if (!normalizarTexto(out.imagem)) {
        const nome = String(out.nome || '').toLowerCase();
        if (nome.includes('cerveja 600')) out.imagem = 'https://picsum.photos/seed/cerveja600/600/400';
        else if (nome.includes('heineken')) out.imagem = 'https://picsum.photos/seed/heineken/600/400';
        else if (nome.includes('caipirinha')) out.imagem = 'https://picsum.photos/seed/caipirinha/600/400';
        else if (nome.includes('refrigerante')) out.imagem = 'https://picsum.photos/seed/refrigerante/600/400';
        else if (nome === 'água' || nome === 'agua' || nome.includes('água')) out.imagem = 'https://picsum.photos/seed/agua/600/400';
        else if (nome.includes('batata frita')) out.imagem = 'https://picsum.photos/seed/batatafrita/600/400';
        else if (nome.includes('calabresa')) out.imagem = 'https://picsum.photos/seed/calabresa/600/400';
        else if (nome.includes('queijo')) out.imagem = 'https://picsum.photos/seed/queijocoalho/600/400';
      }
      return out;
    });


    s.usuarios = s.usuarios.map(u => {
      const out = { ...u };
      if (!Number.isFinite(Number(out.descontoPctMax))) out.descontoPctMax = 0;
      if (!Number.isFinite(Number(out.descontoValorMax))) out.descontoValorMax = 0;
      out.descontoPctMax = Math.max(0, Math.min(100, Number(out.descontoPctMax)));
      out.descontoValorMax = Math.max(0, Number(out.descontoValorMax));
      if (!Array.isArray(out.favoritos)) out.favoritos = [];
      out.favoritos = out.favoritos.map(Number).filter(Boolean).slice(0, 60);
      if (!Array.isArray(out.recentes)) out.recentes = [];
      out.recentes = out.recentes.map(Number).filter(Boolean).slice(0, 12);
      /**
       * Compatibilidade de import:
       * - Se o campo "senhaHash" vier no formato "v1$<salt>$<hash>", reconstrói senhaSalt/senhaHash.
       * - Se vier apenas com hash (formato antigo sem salt), a validação não é possível; o sistema zera a senha.
       */
      if (typeof out.senhaHash === 'string' && out.senhaHash.startsWith('v1$')) {
        const parts = out.senhaHash.split('$');
        const salt = parts[1] || '';
        const hash = parts[2] || '';
        out.senhaSalt = salt;
        out.senhaHash = hash;
        normalizou = true;
      }
      if (out.senha && !out.senhaHash) {
        const salt = randomToken(8);
        out.senhaSalt = salt;
        out.senhaHash = sha256Hex(`${salt}:${String(out.senha)}`);
        delete out.senha;
        normalizou = true;
      }
      if (out.senhaHash && !normalizarTexto(out.senhaSalt)) {
        out.senhaSalt = '';
        out.senhaHash = '';
        normalizou = true;
      }
      return out;
    });
    const maxUserId = s.usuarios.reduce((m, u) => Math.max(m, Number(u?.id) || 0), 0);
    const proxUsuarioId = Number(s.proxUsuarioId);
    s.proxUsuarioId = Number.isFinite(proxUsuarioId) ? proxUsuarioId : 0;
    s.proxUsuarioId = Math.max(s.proxUsuarioId, maxUserId + 1, Number(base.proxUsuarioId) || 2);

    if (!s.sessoes || typeof s.sessoes !== 'object') s.sessoes = {};
    s.sessao = null;
    s.usuarioAtivo = null;
    if (normalizou) {
      const rev = Number.isFinite(Number(s.sync?.rev)) ? Number(s.sync.rev) : 0;
      s.sync = { ...(s.sync || {}), rev: rev + 1, updatedAt: Date.now(), updatedBy: null };
    }

    state = s;
    notificar();
  }

  return {
    getState,
    subscribe,
    calcTotalMesa,
    calcResumoMesa,
    setPermitirVendaSemEstoque,
    getPerfilAcesso,
    getPapeisDisponiveis,
    getCategorias,
    adicionarCategoria,
    removerCategoria,
    getTicketMedio,
    getVendasPorCategoria,
    getProdutosBaixoEstoque,
    getProdutosDisponiveis,
    getMesasOcupadas,
    adicionarSubcategoria,
    removerSubcategoria,
    getSubcategoriasPorCategoria,
    selecionarMesa,
    adicionarItemMesa,
    removerItemMesa,
    alterarQuantidadeItem,
    registrarPagamentoMesa,
    fecharMesa,
    adicionarMesa,
    removerMesa,
    adicionarProduto,
    editarProduto,
    removerProduto,
    ajustarEstoque,
    adicionarFormaPagamento,
    removerFormaPagamento,
    adicionarUsuario,
    editarUsuario,
    removerUsuario,
    selecionarUsuarioAtivo,
    atualizarPerfilAcesso,
    trocarUsuario,
    atualizarStatusProducao,
    restaurarSessao,
    logout,
    atualizarEmpresa,
    atualizarAparencia,
    atualizarImpressao,
    atualizarIntegracao,
    getSyncSnapshot,
    exportarEstado,
    importarEstado,
    atualizarAcoesPerfil,
    toggleFavoritoProduto,
    garantirTokenMesa,
    resetarTokenMesa,
  };
}
