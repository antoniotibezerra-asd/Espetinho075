/**
 * bar-app/app/screens/StockScreen.js
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { formatBRL, nivelEstoque } from '../core/utils';

export default function StockScreen({ state, store }) {
  const baixo  = store.getProdutosBaixoEstoque();
  const sorted = [...state.produtos].sort((a, b) => a.estoque - b.estoque);

  const corNivel = { ok: '#3B6D11', baixo: '#BA7517', critico: '#A32D2D' };
  const bgNivel  = { ok: '#EAF3DE', baixo: '#FAEEDA', critico: '#FCEBEB' };

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
  screen:      { flex: 1, padding: 16, backgroundColor: 'transparent' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:       { fontSize: 15, fontWeight: '900', color: '#2B1D0E', letterSpacing: 0.8, textTransform: 'uppercase' },
  alerta:      { backgroundColor: '#F7DADA', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#E7B1B1' },
  alertaText:  { fontSize: 11, fontWeight: '900', color: '#9B2C2C' },
  card:        {
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
  itemRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0ede6' },
  itemNome:    { fontSize: 13, fontWeight: '900', marginBottom: 2, color: '#2B1D0E' },
  itemSub:     { fontSize: 12, color: '#6D5A49', marginBottom: 6, fontWeight: '700' },
  progBar:     { height: 5, backgroundColor: '#E9DCC8', borderRadius: 3, overflow: 'hidden' },
  progFill:    { height: '100%', borderRadius: 3 },
  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText:   { fontSize: 11, fontWeight: '900' },
});
