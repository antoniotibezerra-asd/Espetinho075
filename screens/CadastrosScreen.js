import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { diffSyncSnapshot, formatBRL } from '../core/utils';

const PERFIL_TABS = [
  { key: 'pedidos', label: 'Pedidos' },
  { key: 'cardapio', label: 'Cardápio' },
  { key: 'producao', label: 'Produção' },
  { key: 'cadastros', label: 'Cadastros' },
  { key: 'parametros', label: 'Parâmetros' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'caixa', label: 'Caixa' },
  { key: 'estoque', label: 'Estoque' },
];
const PERFIL_ACOES = [
  { key: 'adicionarItem', label: 'Adicionar item' },
  { key: 'cancelarItem', label: 'Cancelar/remover item' },
  { key: 'gerenciarProdutos', label: 'Gerenciar produtos' },
  { key: 'gerenciarSubcategorias', label: 'Gerenciar subcategorias' },
  { key: 'gerenciarMesas', label: 'Gerenciar mesas' },
  { key: 'gerenciarPagamentos', label: 'Gerenciar pagamentos' },
  { key: 'editarEstoque', label: 'Editar estoque' },
  { key: 'receberPagamento', label: 'Receber pagamento' },
  { key: 'reimprimir', label: 'Reimprimir' },
  { key: 'verRelatorios', label: 'Ver relatórios' },
  { key: 'verAuditoria', label: 'Ver auditoria' },
  { key: 'configurarSistema', label: 'Configurar sistema' },
  { key: 'configurarIntegracao', label: 'Configurar integração' },
  { key: 'gerenciarUsuarios', label: 'Gerenciar usuários' },
  { key: 'gerenciarPerfis', label: 'Gerenciar perfis' },
];

export default function CadastrosScreen({ state, store }) {
  const [aba, setAba] = useState('produtos');
  const tabsAcesso = store.getPerfilAcesso(state.usuarioAtivo?.papel)?.tabs || {};
  const podeParametros = !!tabsAcesso.parametros;

  useEffect(() => {
    if (aba === 'parametros' && !podeParametros) setAba('produtos');
  }, [aba, podeParametros]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Cadastros</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
        <TabBtn label="Produtos" ativa={aba === 'produtos'} onPress={() => setAba('produtos')} />
        <TabBtn label="Categorias" ativa={aba === 'categorias'} onPress={() => setAba('categorias')} />
        <TabBtn label="Subcategorias" ativa={aba === 'subcats'} onPress={() => setAba('subcats')} />
        <TabBtn label="Mesas" ativa={aba === 'mesas'} onPress={() => setAba('mesas')} />
        <TabBtn label="Pagamentos" ativa={aba === 'pagamentos'} onPress={() => setAba('pagamentos')} />
        {podeParametros && (
          <TabBtn label="Parâmetros" ativa={aba === 'parametros'} onPress={() => setAba('parametros')} />
        )}
      </ScrollView>

      {aba === 'produtos' && <ProdutosSection state={state} store={store} />}
      {aba === 'categorias' && <CategoriasSection state={state} store={store} />}
      {aba === 'subcats' && <SubcategoriasSection state={state} store={store} />}
      {aba === 'mesas' && <MesasSection state={state} store={store} />}
      {aba === 'pagamentos' && <PagamentosSection state={state} store={store} />}
      {aba === 'parametros' && <ParametrosSection state={state} store={store} />}
    </ScrollView>
  );
}

function ParametrosSection({ state, store }) {
  return (
    <View>
      <View style={{ marginBottom: 12 }}>
        <ConfigSection state={state} store={store} />
      </View>
      <View style={{ marginBottom: 12 }}>
        <AparenciaSection state={state} store={store} />
      </View>
      <View style={{ marginBottom: 12 }}>
        <IntegracaoSection state={state} store={store} />
      </View>
      <View style={{ marginBottom: 12 }}>
        <BackupSection state={state} store={store} />
      </View>
      <View style={{ marginBottom: 12 }}>
        <AuditoriaSection state={state} store={store} />
      </View>
      <View style={{ marginBottom: 12 }}>
        <UsuariosSection state={state} store={store} />
      </View>
      <PerfisSection state={state} store={store} />
    </View>
  );
}

function AparenciaSection({ state, store }) {
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  const pode = !!perfil?.tabs?.parametros && !!perfil?.acoes?.configurarSistema;

  const [pct, setPct] = useState(() => {
    const op = Number(state.aparencia?.fundoOpacidade);
    const v = Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 0.90;
    return String(Math.round(v * 100));
  });

  useEffect(() => {
    const op = Number(state.aparencia?.fundoOpacidade);
    const v = Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 0.90;
    setPct(String(Math.round(v * 100)));
  }, [state.aparencia?.fundoOpacidade]);

  function salvar() {
    try {
      const raw = Number(String(pct || '').replace(',', '.'));
      const v = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 90;
      store.atualizarAparencia({ fundoOpacidade: v / 100 });
      Alert.alert('OK', 'Aparência salva.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  if (!pode) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Aparência</Text>
        <Text style={styles.emptyMsg}>Sem permissão para alterar aparência.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Aparência</Text>
      <TextInput
        style={styles.input}
        placeholder="Opacidade do fundo (0-100)"
        value={pct}
        onChangeText={setPct}
        keyboardType="numeric"
      />
      <View style={styles.row}>
        <TouchableOpacity style={styles.btnPrimary} onPress={salvar} activeOpacity={0.8}>
          <Text style={styles.btnPrimaryText}>Salvar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={() => setPct('90')} activeOpacity={0.8}>
          <Text style={styles.btnGhostText}>90%</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.configHint}>Aumente para “apagar” mais o fundo e melhorar a leitura.</Text>
    </View>
  );
}

function IntegracaoSection({ state, store }) {
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  const pode = !!perfil?.tabs?.parametros && !!perfil?.acoes?.configurarIntegracao;
  const [apiBaseUrl, setApiBaseUrl] = useState(String(state.integracao?.apiBaseUrl || ''));
  const [serverInfo, setServerInfo] = useState(null);
  const [remoteSnap, setRemoteSnap] = useState(null);
  const [remoteDiff, setRemoteDiff] = useState('');

  useEffect(() => {
    setApiBaseUrl(String(state.integracao?.apiBaseUrl || ''));
  }, [state.integracao?.apiBaseUrl]);

  useEffect(() => {
    if (!remoteSnap) {
      setRemoteDiff('');
      return;
    }
    try {
      const d = diffSyncSnapshot(store.getSyncSnapshot(), remoteSnap);
      setRemoteDiff(d.summary.join(' · ') || 'nenhuma');
    } catch (e) {
      setRemoteDiff('');
    }
  }, [remoteSnap, state.sync?.rev, state.produtos, state.usuarios, state.perfis, state.empresa, state.permitirVendaSemEstoque, state.formasPagamento, state.subcategorias, state.aparencia, state.impressao, store]);

  function salvar() {
    try {
      store.atualizarIntegracao({ apiBaseUrl });
      Alert.alert('OK', 'Integração salva.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  function normalizarBase(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (u.startsWith('http://') || u.startsWith('https://')) return u.replace(/\/+$/, '');
    return `http://${u.replace(/\/+$/, '')}`;
  }

  function snapshotFromRawState(raw) {
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

  function mergeCadastrosSnapshot(baseSnap, localSnap, remoteSnap0, prefer = 'server') {
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
    const remote = remoteSnap0 && typeof remoteSnap0 === 'object' ? remoteSnap0 : {};

    return {
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
  }

  async function consultarServidor() {
    try {
      const base = normalizarBase(apiBaseUrl);
      if (!base) throw new Error('Informe o endereço do servidor (ex.: 192.168.0.10:3002).');
      const resp = await fetch(`${base}/api/state`);
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Falha ao carregar.');
      const srvRev = Number(json?.server?.rev) || 0;
      const srvAt = Number(json?.server?.updatedAt) || 0;
      setServerInfo({ rev: srvRev, updatedAt: srvAt });
      if (json?.state) {
        const snap = snapshotFromRawState(json.state);
        setRemoteSnap(snap);
      } else {
        setRemoteSnap(null);
      }
      Alert.alert('OK', `Servidor rev ${srvRev}`);
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  async function baixarDoServidor() {
    try {
      const base = normalizarBase(apiBaseUrl);
      if (!base) throw new Error('Informe o endereço do servidor (ex.: 192.168.0.10:3002).');
      const resp = await fetch(`${base}/api/state`);
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.error || 'Falha ao carregar.');
      if (!json?.state) throw new Error('Servidor não retornou estado.');
      const srvRev = Number(json?.server?.rev) || 0;
      const srvAt = Number(json?.server?.updatedAt) || 0;
      const localRev = Number(state.sync?.rev) || 0;
      const localAt = Number(state.sync?.updatedAt) || 0;
      const baseRev = Number(state.integracao?.lastSyncServerRev) || 0;
      const fmt = (ts) => ts ? new Date(ts).toLocaleString('pt-BR') : '—';
      const houveMudancaLocal = localRev > baseRev;
      const houveMudancaServidor = srvRev > baseRev;
      const conflito = houveMudancaLocal && houveMudancaServidor && localRev !== srvRev;

      setServerInfo({ rev: srvRev, updatedAt: srvAt });
      const snap = snapshotFromRawState(json.state);
      setRemoteSnap(snap);
      const diffTxt = diffSyncSnapshot(store.getSyncSnapshot(), snap).summary.join(' · ') || 'nenhuma';

      const msg = conflito
        ? `Conflito detectado.\n\nLocal: rev ${localRev} (${fmt(localAt)})\nServidor: rev ${srvRev} (${fmt(srvAt)})\nDiferenças: ${diffTxt}\n\nCarregar do servidor vai SUBSTITUIR os dados locais e exigirá novo login.\nContinuar?`
        : `Carregar do servidor vai SUBSTITUIR os dados locais e exigirá novo login.\n\nLocal: rev ${localRev} (${fmt(localAt)})\nServidor: rev ${srvRev} (${fmt(srvAt)})\nDiferenças: ${diffTxt}\n\nContinuar?`;

      Alert.alert('Confirmar', msg, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Carregar',
          style: 'destructive',
          onPress: () => {
            const next = { ...(json.state || {}) };
            const entry = {
              ts: Date.now(),
              direcao: 'baixar',
              ok: true,
              serverRev: srvRev,
              localRev,
              note: conflito ? 'Conflito resolvido por download' : '',
            };
            const history = Array.isArray(state.integracao?.syncHistory) ? state.integracao.syncHistory : [];
            const nextHistory = [entry, ...history].slice(0, 10);
            next.integracao = {
              ...(next.integracao || {}),
              apiBaseUrl,
              lastSyncServerRev: srvRev,
              lastSyncAt: Date.now(),
              lastSyncDirecao: 'baixar',
              lastSyncSnapshot: snap,
              syncHistory: nextHistory,
            };
            store.importarEstado(next);
          },
        },
      ]);
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  async function enviarParaServidor() {
    try {
      const base = normalizarBase(apiBaseUrl);
      if (!base) throw new Error('Informe o endereço do servidor (ex.: 192.168.0.10:3002).');
      const ifRev = Number.isFinite(Number(serverInfo?.rev)) ? Number(serverInfo.rev) : (Number(state.integracao?.lastSyncServerRev) || 0);
      const resp = await fetch(`${base}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: store.exportarEstado(), ifRev }),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.status === 409) {
        const srvRev = Number(json?.server?.rev) || 0;
        const srvAt = Number(json?.server?.updatedAt) || 0;
        setServerInfo({ rev: srvRev, updatedAt: srvAt });
        const localRev = Number(state.sync?.rev) || 0;
        const localAt = Number(state.sync?.updatedAt) || 0;
        const fmt = (ts) => ts ? new Date(ts).toLocaleString('pt-BR') : '—';
        Alert.alert(
          'Conflito',
          `Servidor tem alterações mais recentes.\n\nLocal: rev ${localRev} (${fmt(localAt)})\nServidor: rev ${srvRev} (${fmt(srvAt)})\n\nDeseja enviar FORÇANDO (sobrescrever o servidor)?`,
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Forçar envio',
              style: 'destructive',
              onPress: async () => {
                try {
                  const r2 = await fetch(`${base}/api/state`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ state: store.exportarEstado(), force: true }),
                  });
                  const j2 = await r2.json().catch(() => ({}));
                  if (!r2.ok) throw new Error(j2?.error || 'Falha ao enviar.');
                  try {
                    const serverRev = Number(j2?.server?.rev) || srvRev;
                    setServerInfo({ rev: serverRev, updatedAt: Number(j2?.server?.updatedAt) || Date.now() });
                    const snapLocal = store.getSyncSnapshot();
                    const entry = { ts: Date.now(), direcao: 'enviar', ok: true, serverRev, localRev: Number(state.sync?.rev) || 0, note: 'Envio forçado' };
                    const history = Array.isArray(state.integracao?.syncHistory) ? state.integracao.syncHistory : [];
                    const nextHistory = [entry, ...history].slice(0, 10);
                    store.atualizarIntegracao({ lastSyncServerRev: serverRev, lastSyncAt: Date.now(), lastSyncDirecao: 'enviar', lastSyncSnapshot: snapLocal, syncHistory: nextHistory });
                  } catch (e) {}
                  Alert.alert('OK', 'Estado enviado (forçado).');
                } catch (e) {
                  Alert.alert('Erro', e.message);
                }
              },
            },
          ]
        );
        return;
      }
      if (!resp.ok) throw new Error(json?.error || 'Falha ao enviar.');
      try {
        const serverRev = Number(json?.server?.rev) || ifRev;
        setServerInfo({ rev: serverRev, updatedAt: Number(json?.server?.updatedAt) || Date.now() });
        const snapLocal = store.getSyncSnapshot();
        const entry = { ts: Date.now(), direcao: 'enviar', ok: true, serverRev, localRev: Number(state.sync?.rev) || 0, note: '' };
        const history = Array.isArray(state.integracao?.syncHistory) ? state.integracao.syncHistory : [];
        const nextHistory = [entry, ...history].slice(0, 10);
        store.atualizarIntegracao({ lastSyncServerRev: serverRev, lastSyncAt: Date.now(), lastSyncDirecao: 'enviar', lastSyncSnapshot: snapLocal, syncHistory: nextHistory });
      } catch (e) {}
      Alert.alert('OK', 'Estado enviado para o servidor.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  async function supabaseStatus() {
    const base = normalizarBase(apiBaseUrl);
    if (!base) throw new Error('Informe o endereço do servidor (ex.: 192.168.0.10:3002).');
    const r = await fetch(`${base}/api/supabase/status`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || 'Falha ao consultar Supabase.');
    if (!j?.configured) throw new Error('Supabase não configurado no servidor.');
    return j;
  }

  async function supabaseExportarCadastros() {
    try {
      await supabaseStatus();
      const base = normalizarBase(apiBaseUrl);
      const snap = store.getSyncSnapshot();
      const r = await fetch(`${base}/api/supabase/cadastros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: snap }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'Falha ao exportar.');
      Alert.alert('OK', 'Cadastros exportados para o Supabase.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  async function supabaseImportarCadastros() {
    try {
      await supabaseStatus();
      const base = normalizarBase(apiBaseUrl);
      const r = await fetch(`${base}/api/supabase/cadastros`);
      const j = await r.json().catch(() => ({}));
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
      Alert.alert('OK', 'Cadastros importados do Supabase. Faça login novamente.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  async function mesclarCadastros() {
    try {
      const base = normalizarBase(apiBaseUrl);
      if (!base) throw new Error('Informe o endereço do servidor (ex.: 192.168.0.10:3002).');
      const baseSnap = state.integracao?.lastSyncSnapshot;
      if (!baseSnap) throw new Error('Não dá para mesclar ainda: faça pelo menos um Enviar ou Baixar primeiro.');

      const resp = await fetch(`${base}/api/state`);
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error || 'Falha ao carregar.');
      if (!json?.state) throw new Error('Servidor não retornou estado.');
      const remoteState = json.state;
      const srvRev = Number(json?.server?.rev) || 0;
      const srvAt = Number(json?.server?.updatedAt) || 0;
      setServerInfo({ rev: srvRev, updatedAt: srvAt });

      const localSnap = store.getSyncSnapshot();
      const rsnap = snapshotFromRawState(remoteState);
      setRemoteSnap(rsnap);
      const difTxt = diffSyncSnapshot(localSnap, rsnap).summary.join(' · ') || 'nenhuma';

      Alert.alert(
        'Confirmar',
        `Mesclar CADASTROS (produtos/usuários/perfis/config) mantendo PEDIDOS do servidor.\n\nDiferenças: ${difTxt}\n\nContinuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Mesclar',
            style: 'destructive',
            onPress: async () => {
              try {
                const mergedCad = mergeCadastrosSnapshot(baseSnap, localSnap, rsnap, 'server');
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

                const mergedRev = Math.max(Number(state.sync?.rev) || 0, Number(remoteState?.sync?.rev) || 0) + 1;
                mergedState.sync = { rev: mergedRev, updatedAt: Date.now(), updatedBy: null };

                const entry = { ts: Date.now(), direcao: 'mesclar', ok: true, serverRev: srvRev, localRev: Number(state.sync?.rev) || 0, note: 'Mescla de cadastros (preferindo servidor em conflitos)' };
                const history = Array.isArray(state.integracao?.syncHistory) ? state.integracao.syncHistory : [];
                const nextHistory = [entry, ...history].slice(0, 10);
                mergedState.integracao = {
                  ...(mergedState.integracao || {}),
                  apiBaseUrl,
                  lastSyncServerRev: srvRev,
                  lastSyncAt: Date.now(),
                  lastSyncDirecao: 'mesclar',
                  lastSyncSnapshot: { ...mergedCad, rev: mergedRev },
                  syncHistory: nextHistory,
                };

                const save = await fetch(`${base}/api/state`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ state: mergedState, force: true }),
                });
                const saveJson = await save.json().catch(() => ({}));
                if (!save.ok) throw new Error(saveJson?.error || 'Falha ao salvar mescla no servidor.');
                const outRev = Number(saveJson?.server?.rev) || mergedRev;
                const outAt = Number(saveJson?.server?.updatedAt) || Date.now();
                setServerInfo({ rev: outRev, updatedAt: outAt });

                store.importarEstado(mergedState);
              } catch (e) {
                Alert.alert('Erro', e.message);
              }
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  if (!pode) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Integração</Text>
        <Text style={styles.emptyMsg}>Sem permissão para configurar integração.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Integração</Text>
      <TextInput
        style={styles.input}
        placeholder="Servidor (ex.: 192.168.0.10:3002)"
        value={apiBaseUrl}
        onChangeText={setApiBaseUrl}
        autoCapitalize="none"
      />
      <View style={styles.row}>
        <TouchableOpacity style={styles.btnPrimary} onPress={salvar} activeOpacity={0.8}>
          <Text style={styles.btnPrimaryText}>Salvar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={consultarServidor} activeOpacity={0.8}>
          <Text style={styles.btnGhostText}>Consultar</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.row, { marginTop: 8 }]}>
        <TouchableOpacity style={styles.btnGhost} onPress={baixarDoServidor} activeOpacity={0.8}>
          <Text style={styles.btnGhostText}>Baixar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={enviarParaServidor} activeOpacity={0.8}>
          <Text style={styles.btnGhostText}>Enviar</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.row, { marginTop: 8 }]}>
        <TouchableOpacity style={styles.btnGhost} onPress={mesclarCadastros} activeOpacity={0.8}>
          <Text style={styles.btnGhostText}>Mesclar cadastros</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.row, { marginTop: 8 }]}>
        <TouchableOpacity style={styles.btnGhost} onPress={supabaseImportarCadastros} activeOpacity={0.8}>
          <Text style={styles.btnGhostText}>Supabase: Importar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={supabaseExportarCadastros} activeOpacity={0.8}>
          <Text style={styles.btnGhostText}>Supabase: Exportar</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.configHint}>
        Local rev {Number(state.sync?.rev) || 0} · Último sync rev {Number(state.integracao?.lastSyncServerRev) || 0}
      </Text>
      <Text style={styles.configHint}>
        Servidor rev {serverInfo ? Number(serverInfo.rev) : '—'} ({serverInfo?.updatedAt ? new Date(serverInfo.updatedAt).toLocaleString('pt-BR') : '—'})
      </Text>
      <Text style={styles.configHint}>
        Diferenças: {remoteSnap ? (remoteDiff || 'nenhuma') : '—'}
      </Text>
      <Text style={styles.configHint}>
        Histórico: {(Array.isArray(state.integracao?.syncHistory) && state.integracao.syncHistory.length)
          ? state.integracao.syncHistory
              .slice(0, 5)
              .map(x => {
                const ok = x.ok ? 'OK' : 'ERRO';
                const dir = String(x.direcao || '').toUpperCase();
                const ts = x.ts ? new Date(x.ts).toLocaleString('pt-BR') : '—';
                return `${ok} ${dir} · ${ts} · srv ${x.serverRev ?? '—'} · local ${x.localRev ?? '—'}${x.note ? ` · ${x.note}` : ''}`;
              })
              .join('\n')
          : '—'}
      </Text>
      <Text style={styles.configHint}>Use Supabase para centralizar cadastros entre dispositivos.</Text>
    </View>
  );
}

function BackupSection({ state, store }) {
  const [jsonTxt, setJsonTxt] = useState('');

  function gerar() {
    try {
      const txt = JSON.stringify(store.exportarEstado(), null, 2);
      setJsonTxt(txt);
      Alert.alert('OK', 'Backup gerado. Selecione e copie o texto.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  function importar() {
    try {
      const obj = JSON.parse(jsonTxt || '');
      Alert.alert('Confirmar', 'Restaurar backup substitui os dados locais e exigirá novo login. Continuar?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Restaurar', style: 'destructive', onPress: () => store.importarEstado(obj) },
      ]);
    } catch (e) {
      Alert.alert('Erro', 'JSON inválido.');
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Backup</Text>
      <TextInput
        style={[styles.input, { minHeight: 140, textAlignVertical: 'top' }]}
        placeholder="Clique em Gerar para criar o backup. Para restaurar, cole o JSON aqui."
        value={jsonTxt}
        onChangeText={setJsonTxt}
        multiline
        autoCapitalize="none"
      />
      <View style={styles.row}>
        <TouchableOpacity style={styles.btnPrimary} onPress={gerar} activeOpacity={0.8}>
          <Text style={styles.btnPrimaryText}>Gerar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={importar} activeOpacity={0.8}>
          <Text style={styles.btnDangerText}>Restaurar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AuditoriaSection({ state, store }) {
  const [busca, setBusca] = useState('');

  const itens = useMemo(() => {
    const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
    if (!perfil?.tabs?.parametros || !perfil?.acoes?.verAuditoria) return [];
    const q = String(busca || '').trim().toLowerCase();
    const base = (state.auditoria || []);
    const filtrado = q
      ? base.filter(a => String(a.tipo || '').toLowerCase().includes(q) || String(a.userNome || '').toLowerCase().includes(q))
      : base;
    return filtrado.slice(0, 120);
  }, [busca, state.auditoria, state.usuarioAtivo?.papel, store]);

  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  if (!perfil?.tabs?.parametros || !perfil?.acoes?.verAuditoria) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Auditoria</Text>
        <Text style={styles.emptyMsg}>Sem permissão para ver auditoria.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Auditoria</Text>
      <TextInput
        style={styles.input}
        placeholder="Buscar (ex.: caixa.pagamento)"
        value={busca}
        onChangeText={setBusca}
        autoCapitalize="none"
      />
      <View style={styles.list}>
        {itens.length === 0 ? (
          <Text style={styles.emptyMsg}>Nenhum registro.</Text>
        ) : itens.map((a, idx) => (
          <View key={`${a.ts}-${idx}`} style={styles.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.listTitle}>{a.hora || ''} · {a.data || ''}</Text>
              <Text style={styles.listSub}>{a.userNome || '-'} ({(a.userPapel || '-').toUpperCase()})</Text>
              <Text style={[styles.listSub, { color: '#555' }]}>{a.tipo || ''}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function TabBtn({ label, ativa, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.tabBtn, ativa && styles.tabBtnAtiva]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.tabTxt, ativa && styles.tabTxtAtiva]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CategoriasSection({ state, store }) {
  const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
  const pode = !!perfil?.tabs?.cadastros && !!perfil?.acoes?.gerenciarProdutos;
  const [nome, setNome] = useState('');

  const categorias = useMemo(() => {
    const cats = Array.isArray(state.categorias) && state.categorias.length
      ? state.categorias
      : ['Bebida', 'Petisco', 'Prato', 'Sobremesa'];
    return cats.slice().sort((a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR'));
  }, [state.categorias]);

  function add() {
    try {
      store.adicionarCategoria(nome);
      setNome('');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  function remover(cat) {
    Alert.alert('Excluir categoria', `Deseja excluir a categoria "${cat}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => {
        try { store.removerCategoria(cat); } catch (e) { Alert.alert('Erro', e.message); }
      }},
    ]);
  }

  if (!pode) {
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Categorias</Text>
        <Text style={styles.emptyMsg}>Sem permissão para gerenciar categorias.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Categorias</Text>
      <View style={styles.row}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nova categoria" value={nome} onChangeText={setNome} />
        <TouchableOpacity style={[styles.btnPrimary, { paddingHorizontal: 16 }]} onPress={add} activeOpacity={0.8}>
          <Text style={styles.btnPrimaryText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {categorias.length === 0 ? (
          <Text style={styles.emptyMsg}>Nenhuma categoria cadastrada.</Text>
        ) : (
          categorias.map(c => (
            <View key={c} style={styles.listRow}>
              <Text style={[styles.listTitle, { flex: 1 }]}>{c}</Text>
              <TouchableOpacity style={styles.iconBtn} onPress={() => remover(c)}>
                <Text style={styles.iconBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
      <Text style={styles.configHint}>Para remover, a categoria não pode estar em uso por produtos.</Text>
    </View>
  );
}

function ProdutosSection({ state, store }) {
  const cats = useMemo(() => {
    const base = Array.isArray(state.categorias) && state.categorias.length
      ? state.categorias
      : ['Bebida', 'Petisco', 'Prato', 'Sobremesa'];
    return base.slice();
  }, [state.categorias]);

  const [editandoId, setEditandoId] = useState(null);
  const [nome, setNome] = useState('');
  const [imagem, setImagem] = useState('');
  const [cat, setCat] = useState(() => cats[0] || 'Bebida');
  const [subcat, setSubcat] = useState('');
  const [preco, setPreco] = useState('');
  const [estoque, setEstoque] = useState('');
  const [estoqueMinimo, setEstoqueMinimo] = useState('5');

  useEffect(() => {
    if (!cats.includes(cat)) setCat(cats[0] || 'Bebida');
  }, [cats, cat]);

  const subcats = useMemo(() => store.getSubcategoriasPorCategoria(cat), [store, state.subcategorias, cat]);

  function resetForm() {
    setEditandoId(null);
    setNome('');
    setImagem('');
    setCat(cats[0] || 'Bebida');
    setSubcat('');
    setPreco('');
    setEstoque('');
    setEstoqueMinimo('5');
  }

  function iniciarEdicao(p) {
    setEditandoId(p.id);
    setNome(p.nome ?? '');
    setImagem(p.imagem ?? '');
    setCat(p.cat ?? (cats[0] || 'Bebida'));
    setSubcat(p.subcat ?? '');
    setPreco(String(p.preco ?? ''));
    setEstoque(String(p.estoque ?? ''));
    setEstoqueMinimo(String(p.estoqueMinimo ?? '5'));
  }

  function salvar() {
    try {
      const dados = { nome, imagem, cat, subcat, preco, estoque, estoqueMinimo };
      if (editandoId) {
        store.editarProduto(editandoId, {
          nome: dados.nome,
          imagem: dados.imagem,
          cat: dados.cat,
          subcat: dados.subcat,
          preco: parseFloat(dados.preco),
          estoque: parseInt(dados.estoque) || 0,
          estoqueMinimo: parseInt(dados.estoqueMinimo) || 0,
        });
      } else {
        store.adicionarProduto(dados);
      }
      resetForm();
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  function remover(id) {
    Alert.alert('Excluir produto', 'Deseja excluir este produto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => store.removerProduto(id) },
    ]);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{editandoId ? 'Editar Produto' : 'Novo Produto'}</Text>

      <TextInput style={styles.input} placeholder="Nome" value={nome} onChangeText={setNome} />
      <TextInput
        style={styles.input}
        placeholder="Imagem (URL)"
        value={imagem}
        onChangeText={setImagem}
        autoCapitalize="none"
      />

      <View style={styles.pickerWrap}>
        <Picker selectedValue={cat} onValueChange={(v) => { setCat(v); setSubcat(''); }} style={styles.picker}>
          {cats.map(c => <Picker.Item key={c} label={c} value={c} />)}
        </Picker>
      </View>

      <View style={styles.pickerWrap}>
        <Picker selectedValue={subcat} onValueChange={setSubcat} style={styles.picker}>
          <Picker.Item label="Sem subcategoria" value="" />
          {subcats.map(s => <Picker.Item key={s} label={s} value={s} />)}
        </Picker>
      </View>

      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Preço (R$)"
          keyboardType="decimal-pad"
          value={preco}
          onChangeText={setPreco}
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Estoque"
          keyboardType="numeric"
          value={estoque}
          onChangeText={setEstoque}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Estoque mínimo"
        keyboardType="numeric"
        value={estoqueMinimo}
        onChangeText={setEstoqueMinimo}
      />

      <View style={styles.row}>
        <TouchableOpacity style={styles.btnPrimary} onPress={salvar} activeOpacity={0.8}>
          <Text style={styles.btnPrimaryText}>{editandoId ? 'Salvar' : 'Adicionar'}</Text>
        </TouchableOpacity>
        {editandoId && (
          <TouchableOpacity style={styles.btnGhost} onPress={resetForm} activeOpacity={0.8}>
            <Text style={styles.btnGhostText}>Cancelar</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Produtos ({state.produtos.length})</Text>
      <View style={styles.list}>
        {state.produtos
          .slice()
          .sort((a, b) => (a.cat || '').localeCompare(b.cat || '', 'pt-BR') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
          .map((p) => (
            <View key={p.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{p.nome}</Text>
                <Text style={styles.listSub}>
                  {p.cat}{p.subcat ? ` · ${p.subcat}` : ''} · {formatBRL(p.preco)} · mín {p.estoqueMinimo ?? 5}
                </Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{p.estoque} un</Text>
              </View>
              <TouchableOpacity style={styles.iconBtn} onPress={() => iniciarEdicao(p)}>
                <Text style={styles.iconBtnText}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => remover(p.id)}>
                <Text style={styles.iconBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))}
      </View>
    </View>
  );
}

function SubcategoriasSection({ state, store }) {
  const cats = useMemo(() => {
    const base = Array.isArray(state.categorias) && state.categorias.length
      ? state.categorias
      : ['Bebida', 'Petisco', 'Prato', 'Sobremesa'];
    return base.slice();
  }, [state.categorias]);

  const [cat, setCat] = useState(() => cats[0] || 'Bebida');
  const [nome, setNome] = useState('');

  useEffect(() => {
    if (!cats.includes(cat)) setCat(cats[0] || 'Bebida');
  }, [cats, cat]);

  const itens = useMemo(
    () => state.subcategorias.filter(s => s.cat === cat).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [state.subcategorias, cat]
  );

  function add() {
    try {
      store.adicionarSubcategoria({ cat, nome });
      setNome('');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  function remover(id) {
    Alert.alert('Excluir subcategoria', 'Deseja excluir esta subcategoria?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => store.removerSubcategoria(id) },
    ]);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Subcategorias</Text>

      <View style={styles.pickerWrap}>
        <Picker selectedValue={cat} onValueChange={(v) => setCat(v)} style={styles.picker}>
          {cats.map(c => <Picker.Item key={c} label={c} value={c} />)}
        </Picker>
      </View>

      <View style={styles.row}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nova subcategoria" value={nome} onChangeText={setNome} />
        <TouchableOpacity style={[styles.btnPrimary, { paddingHorizontal: 16 }]} onPress={add} activeOpacity={0.8}>
          <Text style={styles.btnPrimaryText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {itens.length === 0 ? (
          <Text style={styles.emptyMsg}>Nenhuma subcategoria cadastrada.</Text>
        ) : (
          itens.map(s => (
            <View key={s.id} style={styles.listRow}>
              <Text style={[styles.listTitle, { flex: 1 }]}>{s.nome}</Text>
              <TouchableOpacity style={styles.iconBtn} onPress={() => remover(s.id)}>
                <Text style={styles.iconBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function MesasSection({ state, store }) {
  const mesas = useMemo(
    () => Object.values(state.mesas).slice().sort((a, b) => a.id - b.id),
    [state.mesas]
  );

  function add(tipo) {
    store.adicionarMesa(tipo);
  }

  function remover(id) {
    try {
      store.removerMesa(id);
    } catch (e) {
      Alert.alert('Ops', e.message);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Mesas</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => add('presencial')} activeOpacity={0.8}>
          <Text style={styles.btnPrimaryText}>+ Mesa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={() => add('online')} activeOpacity={0.8}>
          <Text style={styles.btnGhostText}>+ Pedido Online</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {mesas.map(m => {
          const total = store.calcTotalMesa(m.itens);
          const podeExcluir = (m.itens?.length || 0) === 0;
          return (
            <View key={m.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{m.tipo === 'online' ? '🌐 Pedido' : '🪑 Mesa'} {m.id}</Text>
                <Text style={styles.listSub}>
                  {m.status === 'ocupada' ? 'Ocupada' : 'Livre'} · {total > 0 ? formatBRL(total) : 'Sem consumo'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.btnMini, !podeExcluir && { opacity: 0.4 }]}
                onPress={() => podeExcluir && remover(m.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.btnMiniText}>Excluir</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PagamentosSection({ state, store }) {
  const [nome, setNome] = useState('');

  function add() {
    try {
      store.adicionarFormaPagamento(nome.trim());
      setNome('');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  function remover(f) {
    store.removerFormaPagamento(f);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Formas de pagamento</Text>
      <View style={styles.row}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nova forma" value={nome} onChangeText={setNome} />
        <TouchableOpacity style={[styles.btnPrimary, { paddingHorizontal: 16 }]} onPress={add} activeOpacity={0.8}>
          <Text style={styles.btnPrimaryText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {state.formasPagamento.map(f => (
          <View key={f} style={styles.listRow}>
            <Text style={[styles.listTitle, { flex: 1 }]}>{f}</Text>
            <TouchableOpacity style={styles.iconBtn} onPress={() => remover(f)}>
              <Text style={styles.iconBtnText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

function ConfigSection({ state, store }) {
  const [telefone, setTelefone] = useState(String(state.empresa?.telefone || ''));
  const [endereco, setEndereco] = useState(String(state.empresa?.endereco || ''));
  const [pix, setPix] = useState(String(state.empresa?.pixCopiaECola || ''));
  const [rodape, setRodape] = useState(String(state.empresa?.mensagemRodape || ''));

  useEffect(() => {
    setTelefone(String(state.empresa?.telefone || ''));
    setEndereco(String(state.empresa?.endereco || ''));
    setPix(String(state.empresa?.pixCopiaECola || ''));
    setRodape(String(state.empresa?.mensagemRodape || ''));
  }, [state.empresa]);

  function salvar() {
    try {
      store.atualizarEmpresa({ telefone, endereco, pixCopiaECola: pix, mensagemRodape: rodape });
      Alert.alert('OK', 'Dados do recibo salvos.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Configurações</Text>
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>Permitir vender sem estoque</Text>
        <Switch
          value={!!state.permitirVendaSemEstoque}
          onValueChange={(v) => {
            try {
              store.setPermitirVendaSemEstoque(v);
            } catch (e) {
              Alert.alert('Erro', e.message);
            }
          }}
        />
      </View>
      <Text style={styles.configHint}>
        Quando ativado, o estoque pode ficar negativo e os itens continuam disponíveis para venda.
      </Text>

      <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Impressão</Text>
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>Perguntar via do setor</Text>
        <Switch
          value={!!state.impressao?.perguntarViasSetor && !state.impressao?.autoImprimirViasSetor}
          disabled={!!state.impressao?.autoImprimirViasSetor}
          onValueChange={(v) => {
            try {
              store.atualizarImpressao({ perguntarViasSetor: v });
            } catch (e) {
              Alert.alert('Erro', e.message);
            }
          }}
        />
      </View>
      <View style={styles.configRow}>
        <Text style={styles.configLabel}>Auto imprimir via do setor</Text>
        <Switch
          value={!!state.impressao?.autoImprimirViasSetor}
          onValueChange={(v) => {
            try {
              store.atualizarImpressao({ autoImprimirViasSetor: v, perguntarViasSetor: v ? false : !!state.impressao?.perguntarViasSetor });
            } catch (e) {
              Alert.alert('Erro', e.message);
            }
          }}
        />
      </View>
      <Text style={styles.configHint}>Petisco → Churrasco, Prato/Sobremesa → Cozinha.</Text>

      <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Recibo</Text>
      <TextInput style={styles.input} placeholder="Telefone" value={telefone} onChangeText={setTelefone} />
      <TextInput style={styles.input} placeholder="Endereço" value={endereco} onChangeText={setEndereco} />
      <TextInput style={styles.input} placeholder="Pix (Copia e Cola)" value={pix} onChangeText={setPix} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Mensagem no rodapé" value={rodape} onChangeText={setRodape} />
      <TouchableOpacity style={styles.btnPrimary} onPress={salvar} activeOpacity={0.8}>
        <Text style={styles.btnPrimaryText}>Salvar</Text>
      </TouchableOpacity>
    </View>
  );
}

function UsuariosSection({ state, store }) {
  const papeis = useMemo(() => store.getPapeisDisponiveis(), [store]);

  const [editandoId, setEditandoId] = useState(null);
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState(papeis[0] || 'gerente');
  const [senha, setSenha] = useState('');
  const [descontoPctMax, setDescontoPctMax] = useState('0');
  const [descontoValorMax, setDescontoValorMax] = useState('0');

  const usuarioAtivoId = state.usuarioAtivo?.id;

  function resetForm() {
    setEditandoId(null);
    setNome('');
    setPapel(papeis[0] || 'gerente');
    setSenha('');
    setDescontoPctMax('0');
    setDescontoValorMax('0');
  }

  function iniciarEdicao(u) {
    setEditandoId(u.id);
    setNome(u.nome ?? '');
    setPapel(u.papel ?? (papeis[0] || 'gerente'));
    setSenha('');
    setDescontoPctMax(String(Number.isFinite(Number(u.descontoPctMax)) ? u.descontoPctMax : 0));
    setDescontoValorMax(String(Number.isFinite(Number(u.descontoValorMax)) ? u.descontoValorMax : 0));
  }

  function salvar() {
    try {
      if (editandoId) {
        const patch = { nome, papel, descontoPctMax: Number(String(descontoPctMax || '').replace(',', '.')), descontoValorMax: Number(String(descontoValorMax || '').replace(',', '.')) };
        if ((senha || '').trim() !== '') patch.senha = senha;
        store.editarUsuario(editandoId, patch);
      } else {
        store.adicionarUsuario({ nome, papel, senha, descontoPctMax: Number(String(descontoPctMax || '').replace(',', '.')), descontoValorMax: Number(String(descontoValorMax || '').replace(',', '.')) });
      }
      resetForm();
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  function removerSenha() {
    try {
      if (!editandoId) return;
      store.editarUsuario(editandoId, { senha: '' });
      setSenha('');
      Alert.alert('OK', 'Senha removida.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  function remover(id) {
    Alert.alert('Excluir usuário', 'Deseja excluir este usuário?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => store.removerUsuario(id) },
    ]);
  }

  function ativar(id) {
    try {
      const u = state.usuarios.find(x => x.id === id);
      if (u?.senhaHash) {
        Alert.alert('Senha', 'Use "Trocar" no topo para informar a senha.');
        return;
      }
      store.selecionarUsuarioAtivo(id);
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{editandoId ? 'Editar Usuário' : 'Novo Usuário'}</Text>

      <TextInput style={styles.input} placeholder="Nome" value={nome} onChangeText={setNome} />

      <View style={styles.pickerWrap}>
        <Picker selectedValue={papel} onValueChange={setPapel} style={styles.picker}>
          {papeis.map(p => (
            <Picker.Item key={p} label={store.getPerfilAcesso(p)?.label || p} value={p} />
          ))}
        </Picker>
      </View>

      <TextInput
        style={styles.input}
        placeholder={editandoId ? 'Nova senha (opcional)' : 'Senha (opcional)'}
        value={senha}
        onChangeText={setSenha}
        secureTextEntry
      />

      <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Limites de Desconto</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Máx % (ex.: 10)"
          value={descontoPctMax}
          onChangeText={setDescontoPctMax}
          keyboardType="numeric"
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Máx R$ (ex.: 50)"
          value={descontoValorMax}
          onChangeText={setDescontoValorMax}
          keyboardType="decimal-pad"
        />
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={styles.btnPrimary} onPress={salvar} activeOpacity={0.8}>
          <Text style={styles.btnPrimaryText}>{editandoId ? 'Salvar' : 'Adicionar'}</Text>
        </TouchableOpacity>
        {editandoId && (
          <TouchableOpacity style={styles.btnGhost} onPress={resetForm} activeOpacity={0.8}>
            <Text style={styles.btnGhostText}>Cancelar</Text>
          </TouchableOpacity>
        )}
      </View>

      {editandoId && (
        <TouchableOpacity style={[styles.btnGhost, { marginTop: 10 }]} onPress={removerSenha} activeOpacity={0.8}>
          <Text style={styles.btnDangerText}>Remover senha</Text>
        </TouchableOpacity>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Usuários ({state.usuarios.length})</Text>
      <View style={styles.list}>
        {state.usuarios.map(u => {
          const perfil = store.getPerfilAcesso(u.papel);
          const ativo = u.id === usuarioAtivoId;
          return (
            <View key={u.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.listTitle}>{u.nome}{u.senhaHash ? ' 🔒' : ''}</Text>
                  {ativo && (
                    <View style={styles.badgeAtivo}>
                      <Text style={styles.badgeAtivoText}>Ativo</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.listSub}>
                  {perfil?.label || u.papel} · desc até {Number(u.descontoPctMax) || 0}% / R$ {Number(u.descontoValorMax) || 0}
                </Text>
              </View>
              <TouchableOpacity style={styles.iconBtn} onPress={() => ativar(u.id)} activeOpacity={0.8}>
                <Text style={styles.iconBtnText}>✅</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => iniciarEdicao(u)} activeOpacity={0.8}>
                <Text style={styles.iconBtnText}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => remover(u.id)} activeOpacity={0.8}>
                <Text style={styles.iconBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PerfisSection({ state, store }) {
  const papeis = useMemo(() => store.getPapeisDisponiveis(), [store]);
  const [papel, setPapel] = useState(papeis[0] || 'gerente');
  const [tabs, setTabs] = useState(() => store.getPerfilAcesso(papel)?.tabs || {});
  const [acoes, setAcoes] = useState(() => store.getPerfilAcesso(papel)?.acoes || {});

  useEffect(() => {
    setTabs(store.getPerfilAcesso(papel)?.tabs || {});
    setAcoes(store.getPerfilAcesso(papel)?.acoes || {});
  }, [papel, store, state.perfis]);

  function toggleTab(key) {
    setTabs(prev => ({ ...(prev || {}), [key]: !prev?.[key] }));
  }

  function toggleAcao(key) {
    setAcoes(prev => ({ ...(prev || {}), [key]: !prev?.[key] }));
  }

  function salvar() {
    try {
      store.atualizarPerfilAcesso(papel, tabs);
      store.atualizarAcoesPerfil(papel, acoes);
      Alert.alert('OK', 'Perfil atualizado.');
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Perfis de Acesso</Text>

      <View style={styles.pickerWrap}>
        <Picker selectedValue={papel} onValueChange={setPapel} style={styles.picker}>
          {papeis.map(p => (
            <Picker.Item key={p} label={store.getPerfilAcesso(p)?.label || p} value={p} />
          ))}
        </Picker>
      </View>

      <View style={styles.list}>
        {PERFIL_TABS.map(t => (
          <View key={t.key} style={styles.perfilRow}>
            <Text style={styles.perfilLabel}>{t.label}</Text>
            <Switch value={!!tabs?.[t.key]} onValueChange={() => toggleTab(t.key)} />
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Ações</Text>
      <View style={styles.list}>
        {PERFIL_ACOES.map(a => (
          <View key={a.key} style={styles.perfilRow}>
            <Text style={styles.perfilLabel}>{a.label}</Text>
            <Switch value={!!acoes?.[a.key]} onValueChange={() => toggleAcao(a.key)} />
          </View>
        ))}
      </View>

      <TouchableOpacity style={[styles.btnPrimary, { marginTop: 12 }]} onPress={salvar} activeOpacity={0.8}>
        <Text style={styles.btnPrimaryText}>Salvar Perfil</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '900', color: '#2B1D0E', letterSpacing: 0.8, textTransform: 'uppercase' },

  tabsRow: { marginBottom: 12 },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8C3A5',
    backgroundColor: '#FFF8EF',
    marginRight: 8,
  },
  tabBtnAtiva: { backgroundColor: '#6B3E1E', borderColor: '#6B3E1E' },
  tabTxt: { fontSize: 12, fontWeight: '800', color: '#6D5A49' },
  tabTxtAtiva: { color: '#fff' },

  card: {
    backgroundColor: '#FFF8EF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8C3A5',
    padding: 14,
    shadowColor: '#2B1D0E',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  sectionTitle: { fontSize: 14, fontWeight: '900', marginBottom: 10, color: '#2B1D0E', letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 8, backgroundColor: '#FFF' },
  pickerWrap: { borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 8, marginBottom: 8, overflow: 'hidden', backgroundColor: '#FFF8EF' },
  picker: { height: 52, width: '100%' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },

  btnPrimary: { backgroundColor: '#6B3E1E', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', flex: 1 },
  btnPrimaryText: { color: '#FFF8EF', fontWeight: '900' },
  btnGhost: { borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', flex: 1, backgroundColor: '#F2E7D3' },
  btnGhostText: { color: '#2B1D0E', fontWeight: '900' },
  btnDangerText: { color: '#A32D2D', fontWeight: '800' },
  btnMini: { borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#F2E7D3' },
  btnMiniText: { fontSize: 12, fontWeight: '700', color: '#A32D2D' },

  list: { marginTop: 10 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e9dcc8' },
  listTitle: { fontSize: 13, fontWeight: '900', color: '#2B1D0E' },
  listSub: { fontSize: 12, color: '#6D5A49', marginTop: 2, fontWeight: '700' },
  badge: { backgroundColor: '#F1EFE8', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#666' },
  badgeAtivo: { backgroundColor: '#6B3E1E', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeAtivoText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  iconBtnText: { fontSize: 16 },
  emptyMsg: { textAlign: 'center', color: '#7B6A5B', fontSize: 13, paddingVertical: 12, fontWeight: '700' },

  perfilRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0ede6' },
  perfilLabel: { fontSize: 13, fontWeight: '900', color: '#2B1D0E' },

  configRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  configLabel: { fontSize: 13, fontWeight: '900', color: '#2B1D0E' },
  configHint: { marginTop: 10, color: '#6D5A49', fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
