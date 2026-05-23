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
            const badgeBg = '#fff';
            const badgeFg = '#000';
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
                  <Text style={{ fontSize: 11, fontWeight: '900', color: badgeFg }}>
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
  screen:    { flex: 1, padding: 16, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  title:     { fontSize: 16, fontWeight: '900', color: '#000', letterSpacing: 1.0, textTransform: 'uppercase' },
  subtitle: { fontSize: 12, color: '#000', fontWeight: '800' },
  card:      {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111',
    padding: 16,
    elevation: 0,
  },
  pickerWrap:{ borderWidth: 1, borderColor: '#111', borderRadius: 8, marginBottom: 12, overflow: 'hidden', backgroundColor: '#fff' },
  picker:    { height: 52, width: '100%' },
  input:     { borderWidth: 1, borderColor: '#111', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 12, backgroundColor: '#fff' },
  itemRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#111' },
  itemImg: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#111' },
  itemImgPh: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#111', alignItems: 'center', justifyContent: 'center' },
  itemImgPhTxt: { color: '#000', fontSize: 14, fontWeight: '900' },
  itemNome:  { fontSize: 13, fontWeight: '900', color: '#000' },
  itemPreco: { fontSize: 12, color: '#000', fontWeight: '800' },
  badge:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#111', backgroundColor: '#fff' },
  emptyMsg: { textAlign: 'center', color: '#000', fontSize: 13, paddingVertical: 18, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 18 },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111',
    padding: 16,
    elevation: 0,
  },
  modalTitle: { fontSize: 14, fontWeight: '900', marginBottom: 12, color: '#000' },
  modalImg: { width: '100%', height: 320, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#111', resizeMode: 'contain' },
  btnPrimary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#111', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  btnPrimaryText: { color: '#000', fontWeight: '900' },
});
