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
  screen: { flex: 1, padding: 16, backgroundColor: 'transparent' },
  title: { fontSize: 16, fontWeight: '900', marginBottom: 10, color: '#2B1D0E', letterSpacing: 0.8, textTransform: 'uppercase' },

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
  emptyMsg: { textAlign: 'center', color: '#7B6A5B', fontSize: 13, paddingVertical: 16, fontWeight: '700' },

  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0ede6' },
  itemTitle: { fontSize: 13, fontWeight: '900', marginBottom: 2, color: '#2B1D0E' },
  itemSub: { fontSize: 12, color: '#6D5A49', marginBottom: 8, fontWeight: '700' },
  statusPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  stPendente: { backgroundColor: '#F3D6B3' },
  stPreparo: { backgroundColor: '#F2E7D3' },
  stPronto: { backgroundColor: '#E3F0DF' },

  actions: { gap: 8, alignItems: 'flex-end' },
  btn: { borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 86, alignItems: 'center', backgroundColor: '#F2E7D3' },
  btnText: { fontSize: 12, fontWeight: '900', color: '#2B1D0E' },
  btnOk: { backgroundColor: '#6B3E1E', borderColor: '#6B3E1E' },
  btnOkText: { color: '#FFF8EF', fontWeight: '900' },
});
