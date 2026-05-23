/**
 * bar-app/app/screens/OrdersScreen.js
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Modal, TextInput, Switch,
  Image,
  Share,
  useWindowDimensions,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { formatBRL } from '../core/utils';

export default function OrdersScreen({ state, store }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const screenPad = 16;
  const mesaGap = 8;
  const mesaCols = screenW >= 900 ? 7 : screenW >= 720 ? 6 : screenW >= 420 ? 5 : 4;
  const mesaSize = Math.max(54, Math.floor((screenW - screenPad * 2 - mesaGap * (mesaCols - 1)) / mesaCols));
  const productGap = 10;
  const productCols = screenW >= 900 ? 4 : screenW >= 650 ? 3 : 2;
  const productW = Math.max(140, Math.floor((screenW - screenPad * 2 - productGap * (productCols - 1)) / productCols));
  const productImgH = Math.max(84, Math.round(productW * 0.62));
  const reciboMaxH = Math.max(320, Math.round(screenH * 0.85));
  const reciboCardH = Math.max(320, Math.min(Math.round(screenH - 32), reciboMaxH));
  const reciboW = Math.max(280, Math.min(screenW - 32, 520));

  const [catSelecionada, setCatSelecionada] = useState('Todos');
  const [subcatSelecionada, setSubcatSelecionada] = useState('Todos');
  const [modalFechamento, setModalFechamento] = useState(false);
  const [modalFechados, setModalFechados] = useState(false);
  const [modalRecibo, setModalRecibo] = useState(false);
  const [aplicarTaxa, setAplicarTaxa] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState('Dinheiro');
  const [valorAbater, setValorAbater] = useState('');
  const [descontoTipo, setDescontoTipo] = useState('');
  const [descontoPct, setDescontoPct] = useState('');
  const [descontoValor, setDescontoValor] = useState('');
  const [recibo, setRecibo] = useState(null);
  const podeFechar = !!store.getPerfilAcesso(state.usuarioAtivo?.papel)?.tabs?.caixa;
  const [modalVia, setModalVia] = useState(false);
  const [via, setVia] = useState(null);

  const { mesas, mesaSelecionada } = state;
  const mesa = mesaSelecionada ? mesas[mesaSelecionada] : null;
  const user = useMemo(
    () => (state.usuarios || []).find(u => u.id === state.usuarioAtivo?.id) || {},
    [state.usuarios, state.usuarioAtivo?.id]
  );
  const maxDescPct = Number.isFinite(Number(user.descontoPctMax)) ? Math.max(0, Math.min(100, Number(user.descontoPctMax))) : 0;
  const maxDescVal = Number.isFinite(Number(user.descontoValorMax)) ? Math.max(0, Number(user.descontoValorMax)) : 0;
  const podeDesconto = maxDescPct > 0 || maxDescVal > 0;

  const resumo = mesa ? store.calcResumoMesa(mesa, {
    aplicarTaxa,
    descontoTipo,
    descontoPct: Number(String(descontoPct || '').replace(',', '.')),
    descontoValor: Number(String(descontoValor || '').replace(',', '.')),
  }) : { subtotal: 0, descontoValor: 0, descontoPct: 0, taxaServico: 0, total: 0, credito: 0, saldo: 0, aplicarTaxa: false };
  const disponiveis = store.getProdutosDisponiveis(mesa?.tipo || '');
  
  const categorias = useMemo(() => ['Todos', ...new Set(state.produtos.map(p => p.cat))], [state.produtos]);
  const subcats = useMemo(() => {
    if (catSelecionada === 'Todos') return ['Todos'];
    const subs = store.getSubcategoriasPorCategoria(catSelecionada);
    return ['Todos', ...subs];
  }, [store, state.subcategorias, catSelecionada]);

  const produtosFiltrados = useMemo(() => {
    const base = catSelecionada === 'Todos' ? disponiveis : disponiveis.filter(p => p.cat === catSelecionada);
    if (subcatSelecionada === 'Todos') return base;
    return base.filter(p => (p.subcat || '') === subcatSelecionada);
  }, [disponiveis, catSelecionada, subcatSelecionada]);

  function handleSelecionarMesa(n) {
    store.selecionarMesa(n);
  }

  function handleAddItem(produtoId) {
    if (!mesaSelecionada) return;
    try {
      const filaItem = store.adicionarItemMesa(mesaSelecionada, produtoId);
      const prod = state.produtos.find(p => p.id === produtoId);
      const cfg = state.impressao || {};
      const setor = filaItem?.setor;
      if (prod && (setor === 'churrasco' || setor === 'cozinha')) {
        const setorTxt = setor === 'churrasco' ? 'CHURRASCO' : 'COZINHA';
        const label = setor === 'churrasco' ? 'churrasco' : 'cozinha';
        const abrir = () => {
          setVia({
            setor: setorTxt,
            mesaId: mesaSelecionada,
            hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            itens: [{ qty: 1, nome: prod.nome }],
          });
          setModalVia(true);
        };
        if (cfg.autoImprimirViasSetor) {
          abrir();
        } else if (cfg.perguntarViasSetor) {
          Alert.alert('Impressão', `Deseja imprimir a via do ${label}?`, [
            { text: 'Não', style: 'cancel' },
            { text: 'Sim', onPress: abrir },
          ]);
        }
      }
    } catch (e) {
      Alert.alert('Ops', e.message);
    }
  }

  function abrirFechamento() {
    if (!mesaSelecionada || !mesa) return;
    if ((mesa.itens?.length || 0) === 0) {
      Alert.alert('Ops', 'Mesa sem consumo.');
      return;
    }
    const primeiraForma = state.formasPagamento?.[0] || 'Dinheiro';
    setAplicarTaxa(false);
    setFormaPagamento(primeiraForma);
    setDescontoTipo('');
    setDescontoPct('');
    setDescontoValor('');
    const r = store.calcResumoMesa(mesa, false);
    setValorAbater(String(r.saldo.toFixed(2)));
    setModalFechamento(true);
  }

  function confirmarPagamento() {
    if (!mesaSelecionada) return;
    const valor = Number(String(valorAbater || '').replace(',', '.'));
    try {
      const result = store.registrarPagamentoMesa(mesaSelecionada, {
        valorPago: valor,
        aplicarTaxa,
        formaPagamento,
        descontoTipo,
        descontoPct: Number(String(descontoPct || '').replace(',', '.')),
        descontoValor: Number(String(descontoValor || '').replace(',', '.')),
      });
      setModalFechamento(false);
      setRecibo(result);
      if (result.tipoPagamento === 'parcial') {
        Alert.alert('Pagamento parcial', 'Deseja imprimir o valor pago?', [
          { text: 'Não', style: 'cancel' },
          { text: 'Sim', onPress: () => setModalRecibo(true) },
        ]);
      } else {
        setModalRecibo(true);
      }
    } catch (e) {
      Alert.alert('Ops', e.message);
    }
  }

  const pedidosFechados = useMemo(() => {
    return (state.historico || [])
      .filter(h => (h.tipoPagamento || 'fechamento') === 'fechamento')
      .slice();
  }, [state.historico]);

  function abrirPedidoFechado(h) {
    const r = {
      ...h,
      mesaId: h.mesa,
      tipoPagamento: h.tipoPagamento || 'fechamento',
      valorPago: (typeof h.valorPago === 'number') ? h.valorPago : h.total,
      saldoRestante: (typeof h.saldoRestante === 'number') ? h.saldoRestante : 0,
    };
    setRecibo(r);
    setModalFechados(false);
    setModalRecibo(true);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      {/* Grade de Mesas */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Mesas</Text>
        <TouchableOpacity style={styles.btnMini} onPress={() => setModalFechados(true)} activeOpacity={0.8}>
          <Text style={styles.btnMiniText}>Fechados</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.mesaGrid}>
        {Object.values(mesas)
          .slice()
          .sort((a, b) => a.id - b.id)
          .map(m => {
          const n = m.id;
          const t = store.calcTotalMesa(m.itens);
          const ocupada = m.status === 'ocupada';
          const comTotal = t > 0;
          const selecionada = mesaSelecionada === n;
          return (
            <TouchableOpacity
              key={n}
              style={[
                styles.mesaBtn,
                { width: mesaSize, height: mesaSize },
                ocupada     && styles.mesaBtnOcupada,
                comTotal    && styles.mesaBtnComTotal,
                selecionada && styles.mesaBtnSelecionada,
              ]}
              onPress={() => handleSelecionarMesa(n)}
              activeOpacity={0.7}
            >
              <Text style={[styles.mesaNum, comTotal ? { color: '#3B6D11' } : ocupada ? { color: '#BA7517' } : null]}>M{n}</Text>
              {t > 0 && <Text style={styles.mesaVal}>{formatBRL(t)}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Seção da Comanda */}
      {mesaSelecionada ? (
        <View>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Mesa {mesaSelecionada}</Text>
              {podeFechar ? (
                <TouchableOpacity style={styles.btnFechar} onPress={abrirFechamento}>
                  <Text style={styles.btnFecharText}>Fechar · {formatBRL(resumo.saldo)}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Lista de Itens */}
            {mesa.itens.length === 0 ? (
              <Text style={styles.emptyMsg}>Nenhum item adicionado.</Text>
            ) : (
              mesa.itens.map(it => (
                <View key={it.id} style={styles.itemRow}>
                  {(() => {
                    const p = state.produtos.find(x => x.id === it.id);
                    return p?.imagem ? <Image source={{ uri: p.imagem }} style={styles.itemImg} /> : null;
                  })()}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemNome}>{it.nome}</Text>
                    <Text style={styles.itemPreco}>{formatBRL(it.preco)} cada</Text>
                  </View>
                  <View style={styles.qtyCtrl}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => store.alterarQuantidadeItem(mesaSelecionada, it.id, -1)}
                    >
                      <Text style={styles.qtyBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.qty}>{it.qty}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => {
                        try {
                          const filaItem = store.alterarQuantidadeItem(mesaSelecionada, it.id, 1);
                          const prod = state.produtos.find(p => p.id === it.id);
                          const cfg = state.impressao || {};
                          const setor = filaItem?.setor;
                          if (prod && (setor === 'churrasco' || setor === 'cozinha')) {
                            const setorTxt = setor === 'churrasco' ? 'CHURRASCO' : 'COZINHA';
                            const label = setor === 'churrasco' ? 'churrasco' : 'cozinha';
                            const abrir = () => {
                              setVia({
                                setor: setorTxt,
                                mesaId: mesaSelecionada,
                                hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                                itens: [{ qty: 1, nome: prod.nome }],
                              });
                              setModalVia(true);
                            };
                            if (cfg.autoImprimirViasSetor) {
                              abrir();
                            } else if (cfg.perguntarViasSetor) {
                              Alert.alert('Impressão', `Deseja imprimir a via do ${label}?`, [
                                { text: 'Não', style: 'cancel' },
                                { text: 'Sim', onPress: abrir },
                              ]);
                            }
                          }
                        } catch (e) {
                          Alert.alert('Ops', e.message);
                        }
                      }}
                    >
                      <Text style={styles.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.subtotal}>{formatBRL(it.preco * it.qty)}</Text>
                  <TouchableOpacity onPress={() => store.removerItemMesa(mesaSelecionada, it.id)}>
                    <Text style={styles.removeBtn}>×</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}

            {/* Total */}
            <View style={styles.totalBar}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalVal}>{formatBRL(resumo.subtotal)}</Text>
            </View>
            {mesa.credito > 0 && (
              <View style={styles.totalBar2}>
                <Text style={styles.totalLabel}>Pago</Text>
                <Text style={styles.totalVal2}>{formatBRL(mesa.credito)}</Text>
              </View>
            )}
            {mesa.credito > 0 && (
              <View style={styles.totalBar2}>
                <Text style={styles.totalLabel}>Saldo</Text>
                <Text style={styles.totalVal2}>{formatBRL(resumo.saldo)}</Text>
              </View>
            )}
          </View>

          {/* Seleção de Produtos */}
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Adicionar Itens</Text>
          
          {/* Filtro de Categorias */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            {categorias.map(c => (
              <TouchableOpacity 
                key={c} 
                style={[styles.catBtn, catSelecionada === c && styles.catBtnActive]}
                onPress={() => { setCatSelecionada(c); setSubcatSelecionada('Todos'); }}
              >
                <Text style={[styles.catBtnText, catSelecionada === c && styles.catBtnTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {catSelecionada !== 'Todos' && subcats.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
              {subcats.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.catBtn, subcatSelecionada === s && styles.catBtnActive]}
                  onPress={() => setSubcatSelecionada(s)}
                >
                  <Text style={[styles.catBtnText, subcatSelecionada === s && styles.catBtnTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Grade de Produtos */}
          <View style={styles.productGrid}>
            {produtosFiltrados.map(p => (
              <TouchableOpacity 
                key={p.id} 
                style={[styles.productBtn, { width: productW }]}
                onPress={() => handleAddItem(p.id)}
              >
                {p.imagem ? <Image source={{ uri: p.imagem }} style={[styles.productImg, { height: productImgH }]} /> : <View style={[styles.productImg, { height: productImgH }]} />}
                <Text style={styles.productName} numberOfLines={2}>{p.nome}</Text>
                <Text style={styles.productPrice}>{formatBRL(p.preco)}</Text>
                {(p.subcat || '') !== '' && <Text style={styles.productSub} numberOfLines={1}>{p.subcat}</Text>}
                <View style={styles.productAdd}>
                  <Text style={styles.productAddText}>+</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.emptyMsg}>Selecione uma mesa para gerenciar pedidos.</Text>
        </View>
      )}

      <Modal visible={modalFechamento} animationType="slide" transparent onRequestClose={() => setModalFechamento(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Fechamento · Mesa {mesaSelecionada}</Text>

            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Cobrar 10%:</Text>
              <Switch value={aplicarTaxa} onValueChange={setAplicarTaxa} />
            </View>

            <Text style={styles.modalLabel}>Desconto</Text>
            {!podeDesconto ? (
              <Text style={styles.emptyMsg}>Sem permissão de desconto para este usuário.</Text>
            ) : (
              <>
                <View style={styles.pickerWrap}>
                  <Picker selectedValue={descontoTipo} onValueChange={setDescontoTipo} style={styles.picker}>
                    <Picker.Item label="Sem desconto" value="" />
                    {maxDescPct > 0 ? <Picker.Item label={`Percentual (até ${maxDescPct}%)`} value="pct" /> : null}
                    {maxDescVal > 0 ? <Picker.Item label={`Valor (até R$ ${maxDescVal})`} value="valor" /> : null}
                  </Picker>
                </View>
                {descontoTipo === 'pct' ? (
                  <TextInput
                    style={styles.input}
                    value={descontoPct}
                    onChangeText={setDescontoPct}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                ) : null}
                {descontoTipo === 'valor' ? (
                  <TextInput
                    style={styles.input}
                    value={descontoValor}
                    onChangeText={setDescontoValor}
                    keyboardType="decimal-pad"
                    placeholder="0,00"
                  />
                ) : null}
              </>
            )}

            <View style={styles.modalSummary}>
              <RowKV k="Subtotal" v={formatBRL(resumo.subtotal)} />
              {(resumo.descontoValor || 0) > 0 ? (
                <RowKV k={`Desconto${(resumo.descontoPct || 0) > 0 ? ` (${resumo.descontoPct}%)` : ''}`} v={`- ${formatBRL(resumo.descontoValor)}`} />
              ) : null}
              <RowKV k="Taxa (10%)" v={formatBRL(resumo.taxaServico)} />
              <RowKV k="Total" v={formatBRL(resumo.total)} />
              {resumo.credito > 0 && <RowKV k="Pago" v={formatBRL(resumo.credito)} />}
              <RowKV k="Saldo" v={formatBRL(resumo.saldo)} bold />
            </View>

            <Text style={styles.modalLabel}>Forma de pagamento</Text>
            <View style={styles.pickerWrap}>
              <Picker selectedValue={formaPagamento} onValueChange={setFormaPagamento} style={styles.picker}>
                {(state.formasPagamento || ['Dinheiro']).map(f => <Picker.Item key={f} label={f} value={f} />)}
              </Picker>
            </View>

            <Text style={styles.modalLabel}>Valor a abater (R$)</Text>
            <TextInput
              style={styles.input}
              value={valorAbater}
              onChangeText={setValorAbater}
              keyboardType="decimal-pad"
              placeholder="0,00"
            />

            <View style={styles.rowBtns}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => setValorAbater(String(resumo.saldo.toFixed(2)))}
                activeOpacity={0.8}
              >
                <Text style={styles.btnGhostText}>Abater saldo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={confirmarPagamento}
                activeOpacity={0.8}
              >
                <Text style={styles.btnPrimaryText}>Confirmar</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.btnClose} onPress={() => setModalFechamento(false)} activeOpacity={0.8}>
              <Text style={styles.btnCloseText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalRecibo} animationType="fade" transparent onRequestClose={() => setModalRecibo(false)}>
        <View style={styles.modalBackdropCenter}>
          <View style={[styles.modalCardRecibo, { height: reciboCardH, width: reciboW }]}>
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
            <TouchableOpacity style={[styles.btnPrimary, { flex: 0 }]} onPress={() => setModalRecibo(false)} activeOpacity={0.8}>
              <Text style={styles.btnPrimaryText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalFechados} animationType="slide" transparent onRequestClose={() => setModalFechados(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitle}>Pedidos Fechados</Text>
            <ScrollView>
              {pedidosFechados.length === 0 ? (
                <Text style={styles.emptyMsg}>Nenhum pedido fechado ainda.</Text>
              ) : (
                pedidosFechados.map((h, idx) => (
                  <TouchableOpacity key={idx} style={styles.fechadoRow} onPress={() => abrirPedidoFechado(h)} activeOpacity={0.8}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fechadoTitle}>{(h.tipoMesa === 'online' ? '🌐 Pedido' : '🪑 Mesa')} {h.mesa}</Text>
                      <Text style={styles.fechadoSub}>{h.hora} · {h.formaPagamento}</Text>
                    </View>
                    <Text style={styles.fechadoTotal}>{formatBRL(h.total)}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={[styles.btnPrimary, { flex: 0 }]} onPress={() => setModalFechados(false)} activeOpacity={0.8}>
              <Text style={styles.btnPrimaryText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVia} animationType="fade" transparent onRequestClose={() => setModalVia(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <Text style={styles.modalTitle}>Via {via?.setor || ''}</Text>
            {via ? (
              <ScrollView>
                <Text style={styles.reciboHeader}>{(state.empresa?.nome || 'ESPETINHO 075')}</Text>
                {state.empresa?.endereco ? <Text style={styles.reciboSub}>{state.empresa.endereco}</Text> : null}
                {state.empresa?.telefone ? <Text style={styles.reciboSub}>{state.empresa.telefone}</Text> : null}
                <Text style={styles.reciboSub}>MESA {via.mesaId}</Text>
                <Text style={styles.reciboSub}>{via.hora}</Text>
                <Text style={styles.reciboLine}>--------------------------------</Text>
                {(via.itens || []).map((it, idx) => (
                  <View key={idx} style={styles.reciboItem}>
                    <Text style={styles.reciboItemTxt}>{it.qty}x {it.nome}</Text>
                    <Text style={styles.reciboItemTxt}></Text>
                  </View>
                ))}
                <Text style={styles.reciboLine}>--------------------------------</Text>
              </ScrollView>
            ) : null}
            <View style={styles.rowBtns}>
              <TouchableOpacity
                style={styles.btnGhost}
                onPress={() => {
                  const text = via
                    ? `${state.empresa?.nome || 'ESPETINHO 075'}\nVIA ${via.setor}\nMESA ${via.mesaId}\n${via.hora}\n\n${(via.itens || []).map(it => `${it.qty}x ${it.nome}`).join('\n')}`
                    : '';
                  if (text) Share.share({ message: text });
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.btnGhostText}>Compartilhar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnPrimary} onPress={() => setModalVia(false)} activeOpacity={0.8}>
                <Text style={styles.btnPrimaryText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function RowKV({ k, v, bold }) {
  return (
    <View style={styles.kvRow}>
      <Text style={[styles.kvKey, bold && { fontWeight: '800' }]}>{k}</Text>
      <Text style={[styles.kvVal, bold && { fontWeight: '800' }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:        { flex: 1, padding: 16, backgroundColor: '#fff' },
  sectionTitle:  { fontSize: 15, fontWeight: '900', marginBottom: 14, color: '#000', letterSpacing: 1.0, textTransform: 'uppercase' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btnMini: { borderWidth: 1, borderColor: '#111', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 14, backgroundColor: '#fff' },
  btnMiniText: { fontSize: 12, fontWeight: '900', color: '#000' },
  mesaGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20,
  },
  mesaBtn: {
    borderRadius: 8,
    borderWidth: 1, borderColor: '#111',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', gap: 6,
  },
  mesaBtnOcupada:    { backgroundColor: '#fff', borderColor: '#111' },
  mesaBtnComTotal:   { backgroundColor: '#fff', borderColor: '#111' },
  mesaBtnSelecionada:{ borderWidth: 2, borderColor: '#000' },
  mesaNum:  { fontSize: 13, fontWeight: '900', color: '#000' },
  mesaVal:  { fontSize: 9, color: '#000', fontWeight: '900' },
  card: {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#111', padding: 16,
    elevation: 0,
  },
  cardTitle:    { fontSize: 15, fontWeight: '900', color: '#000' },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  btnFechar:    { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#111' },
  btnFecharText:{ fontSize: 12, fontWeight: '900', color: '#000' },
  divider:      { height: 1, backgroundColor: '#111', marginBottom: 12 },
  emptyMsg:     { textAlign: 'center', color: '#000', fontSize: 13, paddingVertical: 18, fontWeight: '900' },
  itemRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#111' },
  itemImg: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#111' },
  itemNome:     { fontSize: 13, fontWeight: '900', color: '#000' },
  itemPreco:    { fontSize: 12, color: '#000', fontWeight: '800' },
  qtyCtrl:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn:       { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#111', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  qtyBtnText:   { fontSize: 16, color: '#000', lineHeight: 20, fontWeight: '900' },
  qty:          { fontSize: 13, minWidth: 18, textAlign: 'center', color: '#000', fontWeight: '900' },
  subtotal:     { fontSize: 13, fontWeight: '900', minWidth: 60, textAlign: 'right', color: '#000' },
  removeBtn:    { fontSize: 20, color: '#000', paddingHorizontal: 4 },
  totalBar:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#111' },
  totalLabel:   { fontSize: 13, color: '#000', fontWeight: '900' },
  totalVal:     { fontSize: 18, fontWeight: '900', color: '#000' },
  totalBar2:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  totalVal2:    { fontSize: 14, fontWeight: '900', color: '#000' },
  
  catScroll:    { marginBottom: 12 },
  catBtn:       { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#111', marginRight: 10 },
  catBtnActive: { backgroundColor: '#fff', borderColor: '#000' },
  catBtnText:   { fontSize: 12, color: '#000', fontWeight: '900' },
  catBtnTextActive: { color: '#000' },
  
  productGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  productBtn:   {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#111',
    padding: 14,
    position: 'relative',
    elevation: 0,
  },
  productImg: { width: '100%', borderRadius: 8, marginBottom: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#111' },
  productName:  { fontSize: 13, fontWeight: '900', marginBottom: 6, paddingRight: 20, color: '#000' },
  productPrice: { fontSize: 12, color: '#000', fontWeight: '900' },
  productSub:   { fontSize: 11, color: '#000', marginTop: 6, paddingRight: 20, fontWeight: '800' },
  productAdd:   { position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#111' },
  productAddText: { fontSize: 16, color: '#000', fontWeight: '900' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBackdropCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 16 },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#111',
    elevation: 0,
  },
  modalCardRecibo: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#111',
    elevation: 0,
    alignSelf: 'center',
  },
  modalTitle: { fontSize: 15, fontWeight: '900', marginBottom: 12, color: '#000' },
  modalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalLabel: { fontSize: 12, fontWeight: '900', marginBottom: 8, color: '#000' },
  modalSummary: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#111' },
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  kvKey: { fontSize: 12, color: '#000', fontWeight: '900' },
  kvVal: { fontSize: 12, color: '#000', fontWeight: '900' },
  pickerWrap: { borderWidth: 1, borderColor: '#111', borderRadius: 8, marginBottom: 12, overflow: 'hidden', height: 52, justifyContent: 'center', backgroundColor: '#fff' },
  picker: { height: 52, width: '100%' },
  input: { borderWidth: 1, borderColor: '#111', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 12, backgroundColor: '#fff' },
  rowBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnPrimary: { flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#111' },
  btnPrimaryText: { color: '#000', fontWeight: '900' },
  btnGhost: { flex: 1, borderWidth: 1, borderColor: '#111', borderRadius: 8, paddingVertical: 12, alignItems: 'center', backgroundColor: '#fff' },
  btnGhostText: { color: '#000', fontWeight: '900' },
  btnClose: { marginTop: 10, alignItems: 'center', paddingVertical: 10 },
  btnCloseText: { fontSize: 13, fontWeight: '900', color: '#000' },

  reciboHeader: { textAlign: 'center', fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  reciboSub: { textAlign: 'center', color: '#000', marginBottom: 6, fontWeight: '900' },
  reciboLine: { textAlign: 'center', color: '#000', marginVertical: 10 },
  reciboItem: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 2 },
  reciboItemTxt: { fontSize: 12, color: '#000', fontWeight: '900' },
  reciboTotTxt: { fontSize: 12, fontWeight: '900', color: '#000' },

  fechadoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#111' },
  fechadoTitle: { fontSize: 13, fontWeight: '700' },
  fechadoSub: { fontSize: 12, color: '#000', marginTop: 2 },
  fechadoTotal: { fontSize: 13, fontWeight: '900', color: '#000' },
});
