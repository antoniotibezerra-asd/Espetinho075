/**
 * bar-app/app/screens/StockScreen.js
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { formatBRL, nivelEstoque } from '../core/utils';

export default function StockScreen({ state, store }) {
  const baixo  = store.getProdutosBaixoEstoque();
  const sorted = [...state.produtos].sort((a, b) => a.estoque - b.estoque);

  const corNivel = { ok: '#000', baixo: '#000', critico: '#000' };
  const bgNivel  = { ok: '#fff', baixo: '#fff', critico: '#fff' };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Controle de Estoque</Text>
        {baixo.length > 0 && (
          <View style={styles.alerta}>
            <Text style={styles.alertaText}>{baixo.length} item(ns) baixo</Text>
          </View>
        )}
      </View>
      <View style={styles.card}>
        {sorted.map((p, i) => {
          const nivel = nivelEstoque(p.estoque, p.estoqueMinimo ?? 5);
          const pct   = Math.max(0, Math.min(100, Math.round(p.estoque / 60 * 100)));
          return (
            <View key={p.id} style={[styles.itemRow, i === sorted.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemNome}>{p.nome}</Text>
                <Text style={styles.itemSub}>{p.cat}{p.subcat ? ` · ${p.subcat}` : ''} · {formatBRL(p.preco)} · mín {p.estoqueMinimo ?? 5}</Text>
                <View style={styles.progBar}>
                  <View style={[styles.progFill, { width: `${pct}%`, backgroundColor: corNivel[nivel] }]} />
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <View style={[styles.badge, { backgroundColor: bgNivel[nivel] }]}>
                  <Text style={[styles.badgeText, { color: corNivel[nivel] }]}>{p.estoque} un</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:      { flex: 1, padding: 16, backgroundColor: '#fff' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:       { fontSize: 15, fontWeight: '900', color: '#000', letterSpacing: 1.0, textTransform: 'uppercase' },
  alerta:      { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#111' },
  alertaText:  { fontSize: 11, fontWeight: '900', color: '#000' },
  card:        {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111',
    padding: 16,
    elevation: 0,
  },
  itemRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#111' },
  itemNome:    { fontSize: 13, fontWeight: '900', marginBottom: 4, color: '#000' },
  itemSub:     { fontSize: 12, color: '#000', marginBottom: 10, fontWeight: '800' },
  progBar:     { height: 6, backgroundColor: '#fff', borderRadius: 3, overflow: 'hidden', borderWidth: 1, borderColor: '#111' },
  progFill:    { height: '100%', borderRadius: 3 },
  badge:       { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#111', backgroundColor: '#fff' },
  badgeText:   { fontSize: 11, fontWeight: '900' },
});
