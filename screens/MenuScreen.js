/**
 * bar-app/app/screens/MenuScreen.js
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Modal,
  Image,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { formatBRL, nivelEstoque } from '../core/utils';

export default function MenuScreen({ state, store }) {
  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState('Todos');
  const [imgModalUrl, setImgModalUrl] = useState('');
  const [imgModalTitle, setImgModalTitle] = useState('');

  const categorias = useMemo(() => ['Todos', ...new Set((state.produtos || []).map(p => p.cat).filter(Boolean))], [state.produtos]);

  const produtos = useMemo(() => {
    const q = String(busca || '').trim().toLowerCase();
    return (state.produtos || [])
      .filter(p => (cat === 'Todos' ? true : p.cat === cat))
      .filter(p => (q ? String(p.nome || '').toLowerCase().includes(q) : true))
      .slice()
      .sort((a, b) => (a.cat || '').localeCompare(b.cat || '', 'pt-BR') || (a.subcat || '').localeCompare(b.subcat || '', 'pt-BR') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  }, [state.produtos, busca, cat]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Cardápio</Text>
        <Text style={styles.subtitle}>{state.produtos.length} itens</Text>
      </View>
      <View style={styles.card}>
        <TextInput style={styles.input} placeholder="Buscar produto" value={busca} onChangeText={setBusca} />
        <View style={styles.pickerWrap}>
          <Picker selectedValue={cat} onValueChange={setCat} style={styles.picker}>
            {categorias.map(c => <Picker.Item key={c} label={c} value={c} />)}
          </Picker>
        </View>
      </View>

      <View style={[styles.card, { marginTop: 12 }]}>
        {produtos.length === 0 ? (
          <Text style={styles.emptyMsg}>Nenhum item encontrado.</Text>
        ) : (
          produtos.map((p, i) => {
            const nivel = nivelEstoque(p.estoque, p.estoqueMinimo ?? 5);
            const badgeBg = nivel === 'ok' ? '#EAF3DE' : nivel === 'baixo' ? '#FAEEDA' : '#FCEBEB';
            const badgeFg = nivel === 'ok' ? '#3B6D11' : nivel === 'baixo' ? '#BA7517' : '#A32D2D';
            return (
              <View key={p.id} style={[styles.itemRow, i === produtos.length - 1 && { borderBottomWidth: 0 }]}>
                {p.imagem ? (
                  <TouchableOpacity
                    onPress={() => { setImgModalUrl(p.imagem); setImgModalTitle(p.nome || 'Imagem'); }}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri: p.imagem }} style={styles.itemImg} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.itemImgPh}>
                    <Text style={styles.itemImgPhTxt}>🖼️</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNome}>{p.nome}</Text>
                  <Text style={styles.itemPreco}>{(p.cat || '')}{p.subcat ? ` · ${p.subcat}` : ''} · {formatBRL(p.preco)}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: badgeFg }}>
                    {p.estoque} un
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <Modal visible={!!imgModalUrl} transparent animationType="fade" onRequestClose={() => setImgModalUrl('')}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{imgModalTitle || 'Imagem'}</Text>
            {imgModalUrl ? (
              <Image source={{ uri: imgModalUrl }} style={styles.modalImg} />
            ) : null}
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setImgModalUrl('')} activeOpacity={0.8}>
              <Text style={styles.btnPrimaryText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:    { flex: 1, padding: 16, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  title:     { fontSize: 16, fontWeight: '900', color: '#2B1D0E', letterSpacing: 0.8, textTransform: 'uppercase' },
  subtitle: { fontSize: 12, color: '#6D5A49', fontWeight: '700' },
  card:      {
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
  pickerWrap:{ borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 8, marginBottom: 8, overflow: 'hidden', backgroundColor: '#FFF8EF' },
  picker:    { height: 52, width: '100%' },
  input:     { borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 8, fontFamily: 'System', backgroundColor: '#FFF' },
  itemRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0ede6' },
  itemImg: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8C3A5' },
  itemImgPh: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8C3A5', alignItems: 'center', justifyContent: 'center' },
  itemImgPhTxt: { color: '#7B6A5B', fontSize: 14, fontWeight: '800' },
  itemNome:  { fontSize: 13, fontWeight: '900', color: '#2B1D0E' },
  itemPreco: { fontSize: 12, color: '#6D5A49', fontWeight: '700' },
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  emptyMsg: { textAlign: 'center', color: '#7B6A5B', fontSize: 13, paddingVertical: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 18 },
  modalCard: {
    backgroundColor: '#FFF8EF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8C3A5',
    padding: 14,
    shadowColor: '#2B1D0E',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  modalTitle: { fontSize: 14, fontWeight: '900', marginBottom: 10, color: '#2B1D0E' },
  modalImg: { width: '100%', height: 320, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8C3A5', resizeMode: 'contain' },
  btnPrimary: { backgroundColor: '#6B3E1E', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  btnPrimaryText: { color: '#FFF8EF', fontWeight: '900' },
});
