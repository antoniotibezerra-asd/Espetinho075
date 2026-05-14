/**
 * bar-app/app/screens/CashierScreen.js
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput, useWindowDimensions } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { formatBRL, totalItens } from '../core/utils';

export default function CashierScreen({ state, store }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const reciboMaxH = Math.max(320, Math.round(screenH * 0.85));
  const reciboCardH = Math.max(320, Math.min(Math.round(screenH - 32), reciboMaxH));
  const reciboW = Math.max(280, Math.min(screenW - 32, 520));

  const ticket    = store.getTicketMedio();
  const catTotais = store.getVendasPorCategoria();
  const maxV      = Math.max(...Object.values(catTotais), 1);

  const [fMesa, setFMesa] = useState('');
  const [fForma, setFForma] = useState('todas');
  const [fData, setFData] = useState('');
  const [modalRecibo, setModalRecibo] = useState(false);
  const [recibo, setRecibo] = useState(null);

  const formas = useMemo(() => ['todas', ...(state.formasPagamento || [])], [state.formasPagamento]);

  const fechados = useMemo(() => {
    const mesaQ = String(fMesa || '').trim();
    const formaQ = fForma || 'todas';
    const dataQ = String(fData || '').trim();
    return (state.historico || [])
      .filter(h => (h.tipoPagamento || 'fechamento') === 'fechamento')
      .filter(h => (mesaQ ? String(h.mesa) === mesaQ : true))
      .filter(h => (formaQ !== 'todas' ? h.formaPagamento === formaQ : true))
      .filter(h => (dataQ ? String(h.data || '').startsWith(dataQ) : true));
  }, [state.historico, fMesa, fForma, fData]);

  function abrirRecibo(h) {
    setRecibo({
      ...h,
      mesaId: h.mesa,
      tipoPagamento: h.tipoPagamento || 'fechamento',
      valorPago: (typeof h.valorPago === 'number') ? h.valorPago : h.total,
      saldoRestante: (typeof h.saldoRestante === 'number') ? h.saldoRestante : 0,
    });
    setModalRecibo(true);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Métricas */}
      <View style={styles.metricsGrid}>
        {[
          { label: 'Vendas hoje',       val: formatBRL(state.totalDia) },
          { label: 'Comandas fechadas', val: String(state.historico.length) },
          { label: 'Ticket médio',      val: formatBRL(ticket) },
          { label: 'Mesas ocupadas',    val: String(store.getMesasOcupadas()) },
        ].map(m => (
          <View key={m.label} style={styles.metricCard}>
            <Text style={styles.metricLabel}>{m.label}</Text>
            <Text style={styles.metricVal}>{m.val}</Text>
          </View>
        ))}
      </View>

      {/* Histórico */}
      <Text style={styles.sectionTitle}>Histórico de Hoje</Text>
      <View style={styles.card}>
        {state.historico.length === 0
          ? <Text style={styles.emptyMsg}>Nenhum pagamento ainda.</Text>
          : state.historico.map((h, i) => (
              <View key={i} style={[styles.histRow, i === state.historico.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.histCircle}><Text style={styles.histCircleText}>M{h.mesa}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.histMesa}>Mesa {h.mesa}</Text>
                  <Text style={styles.histSub}>
                    {h.hora} · {h.tipoPagamento === 'parcial' ? 'Pag. Parcial' : 'Fechamento'} · {totalItens(h.itens)} itens
                    {h.tipoPagamento === 'parcial' ? ` · Saldo ${formatBRL(h.saldoRestante)}` : ''}
                  </Text>
                </View>
                <Text style={styles.histTotal}>{formatBRL(h.valorPago ?? h.total)}</Text>
              </View>
            ))
        }
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Pedidos Fechados</Text>
      <View style={styles.card}>
        <View style={styles.filtersRow}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Mesa" value={fMesa} onChangeText={setFMesa} keyboardType="numeric" />
          <View style={[styles.pickerWrap, { flex: 1 }]}>
            <Picker selectedValue={fForma} onValueChange={setFForma} style={styles.picker}>
              {formas.map(f => <Picker.Item key={f} label={f === 'todas' ? 'Todas' : f} value={f} />)}
            </Picker>
          </View>
        </View>
        <TextInput style={styles.input} placeholder="Data (AAAA-MM-DD)" value={fData} onChangeText={setFData} autoCapitalize="none" />

        {fechados.length === 0 ? (
          <Text style={styles.emptyMsg}>Nenhum pedido fechado no filtro.</Text>
        ) : (
          fechados.map((h, i) => (
            <TouchableOpacity key={i} style={[styles.fechadoRow, i === fechados.length - 1 && { borderBottomWidth: 0 }]} onPress={() => abrirRecibo(h)} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fechadoTitle}>{(h.tipoMesa === 'online' ? '🌐 Pedido' : '🪑 Mesa')} {h.mesa}</Text>
                <Text style={styles.fechadoSub}>{(h.data || '')} {h.hora} · {h.formaPagamento}</Text>
              </View>
              <Text style={styles.fechadoTotal}>{formatBRL(h.total)}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Vendas por categoria */}
      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Vendas por Categoria</Text>
      <View style={styles.card}>
        {Object.keys(catTotais).length === 0
          ? <Text style={styles.emptyMsg}>Feche comandas para ver dados.</Text>
          : Object.entries(catTotais).map(([cat, val]) => (
              <View key={cat} style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 13 }}>{cat}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600' }}>{formatBRL(val)}</Text>
                </View>
                <View style={styles.progBar}>
                  <View style={[styles.progFill, { width: `${Math.round(val / maxV * 100)}%` }]} />
                </View>
              </View>
            ))
        }
      </View>

      <Modal visible={modalRecibo} animationType="fade" transparent onRequestClose={() => setModalRecibo(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { height: reciboCardH, width: reciboW }]}>
            <Text style={styles.modalTitle}>Recibo</Text>
            {recibo ? (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
                <Text style={styles.reciboHeader}>{(state.empresa?.nome || 'ESPETINHO 075')}</Text>
                {state.empresa?.endereco ? <Text style={styles.reciboSub}>{state.empresa.endereco}</Text> : null}
                {state.empresa?.telefone ? <Text style={styles.reciboSub}>{state.empresa.telefone}</Text> : null}
                <Text style={styles.reciboSub}>{(recibo.tipoMesa === 'online' ? 'PEDIDO ONLINE' : 'MESA')} {recibo.mesaId}</Text>
                <Text style={styles.reciboSub}>{(recibo.data || '')} {recibo.hora}</Text>
                <Text style={styles.reciboLine}>--------------------------------</Text>
                {(recibo.itens || []).map(it => (
                  <View key={it.id} style={styles.reciboItem}>
                    <Text style={styles.reciboItemTxt}>{it.qty}x {it.nome}</Text>
                    <Text style={styles.reciboItemTxt}>{formatBRL(it.preco * it.qty)}</Text>
                  </View>
                ))}
                <Text style={styles.reciboLine}>--------------------------------</Text>
                <View style={styles.reciboItem}>
                  <Text style={styles.reciboTotTxt}>SUBTOTAL</Text>
                  <Text style={styles.reciboTotTxt}>{formatBRL(recibo.subtotal)}</Text>
                </View>
                {(recibo.descontoValor || 0) > 0 ? (
                  <View style={styles.reciboItem}>
                    <Text style={styles.reciboTotTxt}>DESCONTO</Text>
                    <Text style={styles.reciboTotTxt}>- {formatBRL(recibo.descontoValor)}</Text>
                  </View>
                ) : null}
                {(recibo.taxaServico || 0) > 0 ? (
                  <View style={styles.reciboItem}>
                    <Text style={styles.reciboTotTxt}>TAXA (10%)</Text>
                    <Text style={styles.reciboTotTxt}>{formatBRL(recibo.taxaServico)}</Text>
                  </View>
                ) : null}
                <View style={styles.reciboItem}>
                  <Text style={styles.reciboTotTxt}>TOTAL</Text>
                  <Text style={styles.reciboTotTxt}>{formatBRL(recibo.total)}</Text>
                </View>
                <View style={styles.reciboItem}>
                  <Text style={styles.reciboTotTxt}>{recibo.tipoPagamento === 'parcial' ? 'PAG. PARCIAL' : 'PAGO'}</Text>
                  <Text style={styles.reciboTotTxt}>{formatBRL(recibo.valorPago)}</Text>
                </View>
                <View style={styles.reciboItem}>
                  <Text style={styles.reciboTotTxt}>SALDO A PAGAR</Text>
                  <Text style={styles.reciboTotTxt}>{formatBRL(recibo.saldoRestante)}</Text>
                </View>
                <Text style={styles.reciboSub}>Forma: {recibo.formaPagamento}</Text>
                {state.empresa?.pixCopiaECola ? (
                  <Text style={[styles.reciboSub, { marginTop: 8 }]}>Pix: {state.empresa.pixCopiaECola}</Text>
                ) : null}
                {state.empresa?.mensagemRodape ? (
                  <Text style={[styles.reciboSub, { marginTop: 8 }]}>{state.empresa.mensagemRodape}</Text>
                ) : null}
              </ScrollView>
            ) : null}
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setModalRecibo(false)} activeOpacity={0.8}>
              <Text style={styles.btnPrimaryText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:       { flex: 1, padding: 16, backgroundColor: 'transparent' },
  sectionTitle: { fontSize: 15, fontWeight: '900', marginBottom: 10, color: '#2B1D0E', letterSpacing: 0.8, textTransform: 'uppercase' },
  metricsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  metricCard:   {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFF8EF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8C3A5',
    padding: 14,
    shadowColor: '#2B1D0E',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  metricLabel:  { fontSize: 12, color: '#6D5A49', marginBottom: 6, fontWeight: '800' },
  metricVal:    { fontSize: 20, fontWeight: '900', color: '#2B1D0E' },
  card:         {
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
  emptyMsg:     { textAlign: 'center', color: '#7B6A5B', fontSize: 13, paddingVertical: 16, fontWeight: '700' },
  histRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0ede6' },
  histCircle:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1EFE8', alignItems: 'center', justifyContent: 'center' },
  histCircleText:{ fontSize: 10, fontWeight: '700', color: '#666' },
  histMesa:     { fontSize: 13, fontWeight: '900', color: '#2B1D0E' },
  histSub:      { fontSize: 12, color: '#6D5A49', fontWeight: '700' },
  histTotal:    { fontSize: 14, fontWeight: '900', color: '#2F5E2E' },
  progBar:      { height: 6, backgroundColor: '#E9DCC8', borderRadius: 3, overflow: 'hidden' },
  progFill:     { height: '100%', backgroundColor: '#D08B3E', borderRadius: 3 },
  filtersRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 10, backgroundColor: '#FFF' },
  pickerWrap: { borderWidth: 1, borderColor: '#D8C3A5', borderRadius: 8, marginBottom: 10, overflow: 'hidden', height: 52, justifyContent: 'center', backgroundColor: '#FFF8EF' },
  picker: { height: 52, width: '100%' },
  fechadoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0ede6' },
  fechadoTitle: { fontSize: 13, fontWeight: '900', color: '#2B1D0E' },
  fechadoSub: { fontSize: 12, color: '#6D5A49', marginTop: 2, fontWeight: '700' },
  fechadoTotal: { fontSize: 13, fontWeight: '900', color: '#2F5E2E' },

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
  btnPrimary: { backgroundColor: '#6B3E1E', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  btnPrimaryText: { color: '#FFF8EF', fontWeight: '900' },
  reciboHeader: { textAlign: 'center', fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  reciboSub: { textAlign: 'center', color: '#6D5A49', marginBottom: 4, fontWeight: '800' },
  reciboLine: { textAlign: 'center', color: '#999', marginVertical: 6 },
  reciboItem: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 2 },
  reciboItemTxt: { fontSize: 12, color: '#2B1D0E', fontWeight: '700' },
  reciboTotTxt: { fontSize: 12, fontWeight: '900', color: '#2B1D0E' },
});
