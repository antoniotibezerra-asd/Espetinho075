import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';

const SETORES = [
  { key: 'cozinha', label: 'Cozinha' },
  { key: 'churrasco', label: 'Churrasco' },
  { key: 'bar', label: 'Bar' },
];

export default function ProductionScreen({ state, store }) {
  const [setor, setSetor] = useState('cozinha');

  const fila = useMemo(() => {
    return (state.filaProducao || []).filter(p => p.setor === setor);
  }, [state.filaProducao, setor]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.title}>Produção (FIFO)</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
        {SETORES.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.tabBtn, setor === s.key && styles.tabBtnAtiva]}
            onPress={() => setSetor(s.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabTxt, setor === s.key && styles.tabTxtAtiva]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.card}>
        {fila.length === 0 ? (
          <Text style={styles.emptyMsg}>Nenhum pedido pendente neste setor.</Text>
        ) : (
          fila.map((p, idx) => (
            <View key={p.id} style={[styles.row, idx === fila.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {p.nome} · {p.qty}x
                </Text>
                <Text style={styles.itemSub}>
                  Mesa {p.mesaId} · {p.origem} · {p.hora}
                </Text>
                <View style={[styles.statusPill, p.status === 'pendente' ? styles.stPendente : p.status === 'pronto' ? styles.stPronto : styles.stPreparo]}>
                  <Text style={styles.statusText}>
                    {p.status === 'pendente' ? 'Pendente' : p.status === 'em_preparo' ? 'Em preparo' : 'Pronto'}
                  </Text>
                </View>
              </View>

              <View style={styles.actions}>
                {p.status !== 'em_preparo' && p.status !== 'pronto' && (
                  <TouchableOpacity
                    style={styles.btn}
                    onPress={() => store.atualizarStatusProducao(p.id, 'em_preparo')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnText}>Preparar</Text>
                  </TouchableOpacity>
                )}
                {p.status !== 'pronto' && (
                  <TouchableOpacity
                    style={styles.btn}
                    onPress={() => store.atualizarStatusProducao(p.id, 'pronto')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.btnText}>Pronto</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.btn, styles.btnOk]}
                  onPress={() => store.atualizarStatusProducao(p.id, 'entregue')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnText, styles.btnOkText]}>Entregue</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 16, fontWeight: '900', marginBottom: 14, color: '#000', letterSpacing: 1.0, textTransform: 'uppercase' },

  tabsRow: { marginBottom: 12 },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#111',
    backgroundColor: '#fff',
    marginRight: 10,
  },
  tabBtnAtiva: { backgroundColor: '#fff', borderColor: '#000' },
  tabTxt: { fontSize: 12, fontWeight: '900', color: '#000' },
  tabTxtAtiva: { color: '#000' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111',
    padding: 16,
    elevation: 0,
  },
  emptyMsg: { textAlign: 'center', color: '#000', fontSize: 13, paddingVertical: 18, fontWeight: '900' },

  row: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#111' },
  itemTitle: { fontSize: 13, fontWeight: '900', marginBottom: 4, color: '#000' },
  itemSub: { fontSize: 12, color: '#000', marginBottom: 10, fontWeight: '800' },
  statusPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#111', backgroundColor: '#fff' },
  statusText: { fontSize: 11, fontWeight: '900', color: '#000' },
  stPendente: { backgroundColor: '#fff' },
  stPreparo: { backgroundColor: '#fff' },
  stPronto: { backgroundColor: '#fff' },

  actions: { gap: 10, alignItems: 'flex-end' },
  btn: { borderWidth: 1, borderColor: '#111', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, minWidth: 110, alignItems: 'center', backgroundColor: '#fff' },
  btnText: { fontSize: 12, fontWeight: '900', color: '#000' },
  btnOk: { backgroundColor: '#fff', borderColor: '#111' },
  btnOkText: { color: '#000', fontWeight: '900' },
});
