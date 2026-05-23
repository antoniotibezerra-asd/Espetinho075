/**
 * bar-app/app/App.js
 * Ponto de entrada React Native (Expo).
 * Compartilha 100% da lógica com a versão web via core/store.js
 */

import React, { useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar, Text, TouchableOpacity, Modal, Alert, TextInput, Platform, Image } from 'react-native';
import { criarStore } from './core/store';
import { Picker } from '@react-native-picker/picker';

// Telas
import PedidosScreen  from './screens/OrdersScreen';
import CadastrosScreen from './screens/CadastrosScreen';
import ProducaoScreen from './screens/ProductionScreen';
import CaixaScreen    from './screens/CashierScreen';
import EstoqueScreen  from './screens/StockScreen';
import CardapioScreen from './screens/MenuScreen';

// Componentes
import BottomNav from './components/BottomNav';

// Cria o store uma única vez para toda a aplicação
const store = criarStore();
const CAPA_IMG = require('./web/assets/logo-espetinho.jpg');
const _ensureGlobalTextDefaults = () => {
  try {
    if (globalThis.__BARAPP_TEXT_DEFAULTS__) return;
    globalThis.__BARAPP_TEXT_DEFAULTS__ = true;
    Text.defaultProps = Text.defaultProps || {};
    const cur = Text.defaultProps.style;
    Text.defaultProps.style = [{ color: '#000', textTransform: 'uppercase', letterSpacing: 0.8, lineHeight: 20 }, cur].filter(Boolean);
    TextInput.defaultProps = TextInput.defaultProps || {};
    const curIn = TextInput.defaultProps.style;
    TextInput.defaultProps.style = [{ color: '#000', textTransform: 'uppercase', letterSpacing: 0.8 }, curIn].filter(Boolean);
    if (!TextInput.defaultProps.placeholderTextColor) TextInput.defaultProps.placeholderTextColor = '#000';
  } catch {}
};

export default function App() {
  _ensureGlobalTextDefaults();
  const [tabAtiva, setTabAtiva] = useState('pedidos');
  const [state, setState]       = useState(store.getState());
  const [trocarUserAberto, setTrocarUserAberto] = useState(false);
  const [userIdSelecionado, setUserIdSelecionado] = useState(store.getState()?.usuarioAtivo?.id || 0);
  const [senhaTroca, setSenhaTroca] = useState('');

  // Subscreve ao store — re-renderiza o app quando o estado muda
  useEffect(() => {
    const unsub = store.subscribe(novoState => setState({ ...novoState }));
    return unsub;
  }, []);

  const screenProps = { state, store };
  const logado = !!state.sessao?.token;

  const tabsPermitidas = useMemo(() => {
    if (!logado) return {};
    const perfil = store.getPerfilAcesso(state.usuarioAtivo?.papel);
    const t = { ...(perfil?.tabs || {}) };
    const mobileTabs = ['pedidos', 'cardapio', 'producao', 'cadastros', 'caixa', 'estoque'];
    const permitidas = {};
    mobileTabs.forEach(k => {
      permitidas[k] = !!t[k];
    });
    if (!Object.values(permitidas).some(Boolean)) {
      permitidas.pedidos = true;
    }
    return permitidas;
  }, [logado, state.usuarioAtivo?.papel, state.perfis]);

  const primeiraTabPermitida = useMemo(() => {
    const ordem = ['pedidos', 'producao', 'cadastros', 'caixa', 'estoque'];
    return ordem.find(k => tabsPermitidas[k]) || 'pedidos';
  }, [tabsPermitidas]);

  useEffect(() => {
    if (!tabsPermitidas[tabAtiva]) {
      setTabAtiva(primeiraTabPermitida);
    }
  }, [tabAtiva, tabsPermitidas, primeiraTabPermitida]);

  useEffect(() => {
    setUserIdSelecionado(state.usuarioAtivo?.id || 0);
  }, [state.usuarioAtivo?.id]);

  useEffect(() => {
    if (trocarUserAberto) setSenhaTroca('');
  }, [trocarUserAberto]);

  useEffect(() => {
    setSenhaTroca('');
  }, [userIdSelecionado]);

  function onTabChange(next) {
    if (tabsPermitidas[next]) setTabAtiva(next);
  }

  function confirmarTrocaUsuario() {
    try {
      store.selecionarUsuarioAtivo(userIdSelecionado, senhaTroca);
      setTrocarUserAberto(false);
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  }

  useEffect(() => {
    if (!state.sessao?.token) setTrocarUserAberto(true);
  }, [state.sessao?.token]);

  const renderScreen = () => {
    switch (tabAtiva) {
      case 'pedidos':  return <PedidosScreen  {...screenProps} />;
      case 'cardapio': return <CardapioScreen {...screenProps} />;
      case 'producao': return <ProducaoScreen {...screenProps} />;
      case 'cadastros':return <CadastrosScreen {...screenProps} />;
      case 'caixa':    return <CaixaScreen    {...screenProps} />;
      case 'estoque':  return <EstoqueScreen  {...screenProps} />;
      default:         return null;
    }
  };

  const perfilAtivo = store.getPerfilAcesso(state.usuarioAtivo?.papel);

  return (
    <View style={styles.bg}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.topBar}>
          <Image source={CAPA_IMG} style={styles.brandImg} />
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarTitle}>{state.usuarioAtivo?.nome || 'Usuário'}</Text>
            <Text style={styles.topBarSub}>{perfilAtivo?.label || state.usuarioAtivo?.papel || ''}</Text>
          </View>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => setTrocarUserAberto(true)} activeOpacity={0.8}>
            <Text style={styles.topBarBtnText}>Trocar</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          {logado ? renderScreen() : (
            <View style={styles.locked}>
              <Text style={styles.lockedText}>Faça login para continuar.</Text>
            </View>
          )}
        </View>
        <BottomNav tabAtiva={tabAtiva} onTabChange={onTabChange} tabsPermitidas={tabsPermitidas} />

        <Modal visible={trocarUserAberto} transparent animationType="fade" onRequestClose={() => setTrocarUserAberto(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Image source={CAPA_IMG} style={styles.modalBrandImg} />
              <Text style={styles.modalTitle}>Trocar Usuário</Text>
              <View style={styles.pickerWrap}>
                <Picker selectedValue={userIdSelecionado} onValueChange={setUserIdSelecionado} style={styles.picker}>
                  {state.usuarios.map(u => {
                    const p = store.getPerfilAcesso(u.papel);
                    const label = `${u.nome}${u.senhaHash ? ' 🔒' : ''} (${p?.label || u.papel})`;
                    return <Picker.Item key={u.id} label={label} value={u.id} />;
                  })}
                </Picker>
              </View>
              <TextInput
                style={styles.modalInput}
                value={senhaTroca}
                onChangeText={setSenhaTroca}
                placeholder="Senha (se houver)"
                secureTextEntry
              />
              <View style={styles.modalRow}>
                {logado && (
                  <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setTrocarUserAberto(false)} activeOpacity={0.8}>
                    <Text style={styles.modalBtnGhostText}>Cancelar</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={confirmarTrocaUsuario} activeOpacity={0.8}>
                  <Text style={styles.modalBtnPrimaryText}>Ativar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#fff' },

  container: { flex: 1, backgroundColor: '#fff' },
  content:   { flex: 1, backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    paddingHorizontal: 16,
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0) + 10,
    paddingBottom: 10,
    elevation: 0,
  },
  brandImg: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#111', backgroundColor: '#fff' },
  topBarTitle: { fontSize: 14, fontWeight: '900', color: '#000' },
  topBarSub: { fontSize: 12, color: '#000', marginTop: 2 },
  topBarBtn: { borderWidth: 1, borderColor: '#111', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  topBarBtnText: { fontSize: 12, fontWeight: '900', color: '#000' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 18 },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111',
    padding: 14,
    elevation: 0,
  },
  modalBrandImg: { width: '100%', height: 68, borderRadius: 10, borderWidth: 1, borderColor: '#111', backgroundColor: '#fff', marginBottom: 12, resizeMode: 'cover' },
  modalTitle: { fontSize: 14, fontWeight: '900', marginBottom: 10, color: '#000' },
  pickerWrap: { borderWidth: 1, borderColor: '#111', borderRadius: 8, marginBottom: 12, overflow: 'hidden', backgroundColor: '#fff' },
  picker: { height: 52, width: '100%' },
  modalInput: { borderWidth: 1, borderColor: '#111', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 12, backgroundColor: '#fff' },
  modalRow: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  modalBtnPrimary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#111' },
  modalBtnPrimaryText: { color: '#000', fontWeight: '900' },
  modalBtnGhost: { borderWidth: 1, borderColor: '#111', backgroundColor: '#fff' },
  modalBtnGhostText: { color: '#000', fontWeight: '900' },
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockedText: { fontSize: 14, fontWeight: '900', color: '#000' },
});
