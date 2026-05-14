/**
 * bar-app/app/components/BottomNav.js
 * Barra de navegação inferior para o app mobile.
 */

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

const TABS = [
  { key: 'pedidos',   label: 'Pedidos',   icon: '🍺' },
  { key: 'cardapio',  label: 'Cardápio',  icon: '📋' },
  { key: 'producao',  label: 'Produção',  icon: '🍳' },
  { key: 'cadastros', label: 'Cadastros', icon: '🗂️' },
  { key: 'caixa',     label: 'Caixa',     icon: '💰' },
  { key: 'estoque',   label: 'Estoque',   icon: '📦' },
];

export default function BottomNav({ tabAtiva, onTabChange, tabsPermitidas }) {
  const tabs = Array.isArray(tabsPermitidas)
    ? TABS.filter(t => tabsPermitidas.includes(t.key))
    : TABS.filter(t => !!tabsPermitidas?.[t.key]);

  return (
    <View style={styles.nav}>
      {tabs.map(tab => {
        const ativa = tabAtiva === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.item}
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={styles.icon}>{tab.icon}</Text>
            <Text style={[styles.label, ativa && styles.labelAtiva]}>
              {tab.label}
            </Text>
            {ativa && <View style={styles.dot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    backgroundColor: '#FFF8EF',
    borderTopWidth: 1,
    borderTopColor: '#D8C3A5',
    paddingBottom: 8,
    paddingTop: 6,
    shadowColor: '#2B1D0E',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -6 },
    elevation: 6,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  icon:      { fontSize: 20 },
  label:     { fontSize: 11, color: '#7B6A5B', fontWeight: '600' },
  labelAtiva:{ color: '#2B1D0E', fontWeight: '900' },
  dot: {
    width: 4, height: 4,
    borderRadius: 2,
    backgroundColor: '#6B3E1E',
    marginTop: 2,
  },
});
