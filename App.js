/**
 * bar-app/app/App.js
 * Ponto de entrada React Native (Expo).
 * Compartilha 100% da lógica com a versão web via core/store.js
 */

import React, { useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar, Text, TouchableOpacity, Modal, Alert, TextInput, ImageBackground, Platform } from 'react-native';
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
const FUNDO_IMG = require('./web/assets/fundo.jpeg');

export default function App() {
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
  const fundoOpacidade = (() => {
    const v = Number(state.aparencia?.fundoOpacidade);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.90;
  })();

  return (
    <ImageBackground source={FUNDO_IMG} style={styles.bg} imageStyle={styles.bgImg}>
      <View style={[styles.bgOverlay, { backgroundColor: `rgba(246, 239, 227, ${fundoOpacidade})` }]} pointerEvents="none" />
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF8EF" />
        <View style={styles.topBar}>
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  bgImg: { resizeMode: 'cover' },
  bgOverlay: { ...StyleSheet.absoluteFillObject },

  container: { flex: 1, backgroundColor: 'transparent' },
  content:   { flex: 1, backgroundColor: 'transparent' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFF8EF',
    borderBottomWidth: 1,
    borderBottomColor: '#D8C3A5',
    paddingHorizontal: 16,
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0) + 10,
    paddingBottom: 10,
    shadowColor: '#2B1D0E',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  topBarTitle: { fontSize: 14, fontWeight: '800', color: '#2B1D0E' },
  topBarSub: { fontSize: 12, color: '#6D5A49', marginTop: 2 },
  topBarBtn: { borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F2E7D3' },
  topBarBtnText: { fontSize: 12, fontWeight: '800', color: '#2B1D0E' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 18 },
  modalCard: {
    backgroundColor: '#FFF8EF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8C3A5',
    padding: 14,
    shadowColor: '#2B1D0E',
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  modalTitle: { fontSize: 14, fontWeight: '900', marginBottom: 10, color: '#2B1D0E' },
  pickerWrap: { borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 8, marginBottom: 12, overflow: 'hidden', backgroundColor: '#FFF8EF' },
  picker: { height: 52, width: '100%' },
  modalInput: { borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 12, backgroundColor: '#FFF' },
  modalRow: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  modalBtnPrimary: { backgroundColor: '#6B3E1E' },
  modalBtnPrimaryText: { color: '#FFF8EF', fontWeight: '900' },
  modalBtnGhost: { borderWidth: 1, borderColor: '#D8C3A5', backgroundColor: '#F2E7D3' },
  modalBtnGhostText: { color: '#2B1D0E', fontWeight: '900' },
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockedText: { fontSize: 14, fontWeight: '800', color: '#6D5A49' },
});
