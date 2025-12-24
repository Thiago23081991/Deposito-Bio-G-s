
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { gasService } from './services/gasMock.ts';
import { Cliente, Produto, Entregador, Pedido, PaymentMethod, ResumoFinanceiro, PedidoItem, Movimentacao, ChatMessage } from './types.ts';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const App: React.FC = () => {
  // --- ESTADO GLOBAL ---
  const [activeTab, setActiveTab] = useState<'vendas' | 'caixa' | 'cobranca' | 'estoque' | 'clientes' | 'ai'>('vendas');
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // --- DADOS ---
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);

  // --- SELEÇÃO EM MASSA ---
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // --- FILTROS & BUSCA ---
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [searchTermCRM, setSearchTermCRM] = useState('');
  
  // --- ATENDIMENTO ---
  const [nomeBusca, setNomeBusca] = useState('');
  const [telBusca, setTelBusca] = useState('');
  const [endBusca, setEndBusca] = useState('');
  const [cart, setCart] = useState<PedidoItem[]>([]);
  const [selectedEnt, setSelectedEnt] = useState('');
  const [formaPgto, setFormaPgto] = useState<string>(PaymentMethod.DINHEIRO);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // --- AI ---
  const [aiChat, setAiChat] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- CARREGAMENTO ---
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [p, e, up, res, cls] = await Promise.all([
        gasService.listarProdutos(),
        gasService.listarEntregadores(),
        gasService.listarUltimosPedidos(),
        gasService.getResumoFinanceiro(),
        gasService.listarClientes()
      ]);
      setProdutos(p || []);
      setEntregadores(e || []);
      setPedidos(up || []);
      setResumo(res);
      setClientes(cls || []);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Erro ao conectar com o servidor.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // --- LOGÍSTICA E AÇÕES EM MASSA ---
  const filteredPedidos = useMemo(() => {
    return pedidos.filter(p => filterStatus === 'Todos' || p.status === filterStatus);
  }, [pedidos, filterStatus]);

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkAction = async (novoStatus: 'Entregue' | 'Cancelado' | 'Em Rota') => {
    if (selectedOrderIds.length === 0) return;
    
    // Confirmação personalizada
    let confirmMsg = "";
    if(novoStatus === 'Entregue') confirmMsg = `Deseja concluir ${selectedOrderIds.length} pedidos selecionados? (Gerará entradas financeiras)`;
    else if(novoStatus === 'Cancelado') confirmMsg = `Deseja CANCELAR ${selectedOrderIds.length} pedidos?`;
    else confirmMsg = `Encaminhar ${selectedOrderIds.length} pedidos para ROTA de entrega?`;

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const res = await gasService.atualizarStatusPedidosEmMassa(selectedOrderIds, novoStatus);
      if (res.success) {
        // Se for "Em Rota", preparar o texto do WhatsApp com o resumo da rota
        if (novoStatus === 'Em Rota') {
          const ordersToForward = pedidos.filter(p => selectedOrderIds.includes(p.id));
          let summary = "*🚚 ROTA DE ENTREGA - BIO GÁS*\n\n";
          ordersToForward.forEach((o, idx) => {
            summary += `*${idx + 1}. ${o.nomeCliente}*\n📍 ${o.endereco}\n📦 ${o.produtoSummary}\n💰 R$ ${Number(o.valorTotal).toFixed(2)} (${o.formaPagamento})\n\n`;
          });
          summary += "⚠️ _Por favor, confirmar ao realizar a entrega._";
          
          const msgUrl = `https://wa.me/?text=${encodeURIComponent(summary)}`;
          window.open(msgUrl, '_blank');
        }

        setMessage({ type: 'success', text: `${res.count} pedidos atualizados!` });
        setSelectedOrderIds([]);
        await loadData(true);
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro ao processar ações.' });
    } finally {
      setLoading(false);
    }
  };

  // --- COBRANÇA ---
  const devedores = useMemo(() => {
    if(!resumo) return [];
    return resumo.recentes.filter(m => m.tipo === 'A Receber');
  }, [resumo]);

  const handleLiquidarDivida = async (id: string) => {
    if(!window.confirm("Confirmar recebimento do valor? Isso liquidará a dívida no sistema.")) return;
    setProcessingId(id);
    try {
      const res = await gasService.liquidarDivida(id);
      if(res.success) {
        setMessage({ type: 'success', text: 'Dívida liquidada!' });
        await loadData(true);
      }
    } finally { setProcessingId(null); }
  };

  // --- RENDERS ---
  const renderVendas = () => {
    const cartTotal = cart.reduce((acc, i) => acc + (i.qtd * i.precoUnitario), 0);
    const nameSuggestions = clientes.filter(c => c.nome.toLowerCase().includes(nomeBusca.toLowerCase()) || c.telefone.includes(nomeBusca)).slice(0, 5);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
        <div className="lg:col-span-2 space-y-6">
          {/* Atendimento */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-slate-800"><i className="fas fa-headset text-blue-600"></i> Atendimento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
              <div className="md:col-span-2 relative">
                <input className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold" placeholder="Nome do Cliente..." value={nomeBusca} onChange={e => {setNomeBusca(e.target.value); setShowSuggestions(true);}} />
                {showSuggestions && nomeBusca.length > 2 && nameSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white shadow-2xl rounded-2xl border z-50 mt-2 overflow-hidden">
                    {nameSuggestions.map(c => (
                      <button key={c.id} onClick={() => {setNomeBusca(c.nome); setTelBusca(c.telefone); setEndBusca(c.endereco); setShowSuggestions(false);}} className="w-full p-4 text-left hover:bg-blue-50 border-b last:border-0">
                        <p className="font-bold text-slate-800">{c.nome}</p>
                        <p className="text-xs text-slate-400">{c.telefone} | {c.endereco}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input className="px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold" placeholder="WhatsApp" value={telBusca} onChange={e => setTelBusca(e.target.value)} />
              <input className="px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold" placeholder="Endereço" value={endBusca} onChange={e => setEndBusca(e.target.value)} />
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {produtos.map(p => (
                <button key={p.id} onClick={() => setCart(prev => {
                  const ex = prev.find(i => i.produtoId === p.id);
                  if(ex) return prev.map(i => i.produtoId === p.id ? {...i, qtd: i.qtd+1} : i);
                  return [...prev, { produtoId: p.id, nome: p.nome, qtd: 1, precoUnitario: p.preco }];
                })} className="px-4 py-3 bg-slate-50 rounded-2xl font-bold text-xs hover:bg-blue-50 transition-all">+ {p.nome}</button>
              ))}
            </div>
          </div>

          {/* Monitor de Pedidos com Ações em Massa */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative min-h-[400px]">
            {/* Barra de Ações Contextual */}
            {selectedOrderIds.length > 0 && (
              <div className="absolute top-0 left-0 w-full bg-slate-900 p-4 z-20 flex justify-between items-center animate-in slide-in-from-top-4 duration-300">
                <div className="flex items-center gap-3">
                   <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">{selectedOrderIds.length}</span>
                   <span className="text-white font-black text-[10px] uppercase tracking-widest">Pedidos Selecionados</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleBulkAction('Em Rota')} className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-xl uppercase hover:bg-blue-700 transition shadow-lg flex items-center gap-2">
                    <i className="fas fa-truck"></i> Enviar p/ Rota
                  </button>
                  <button onClick={() => handleBulkAction('Entregue')} className="px-4 py-2 bg-emerald-500 text-white text-[10px] font-black rounded-xl uppercase hover:bg-emerald-600 transition shadow-lg">
                    <i className="fas fa-check"></i> Concluir
                  </button>
                  <button onClick={() => handleBulkAction('Cancelado')} className="px-4 py-2 bg-rose-500 text-white text-[10px] font-black rounded-xl uppercase hover:bg-rose-600 transition shadow-lg">
                    <i className="fas fa-times"></i> Cancelar
                  </button>
                  <button onClick={() => setSelectedOrderIds([])} className="ml-2 w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition bg-white/10 rounded-full">×</button>
                </div>
              </div>
            )}

            <div className="px-6 py-4 bg-slate-50/50 border-b flex justify-between items-center">
              <div className="flex items-center gap-4">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  checked={selectedOrderIds.length === filteredPedidos.length && filteredPedidos.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedOrderIds(filteredPedidos.map(p => p.id));
                    else setSelectedOrderIds([]);
                  }}
                />
                <h3 className="font-black text-slate-800">📦 Monitor de Fluxo</h3>
              </div>
              <div className="flex bg-white p-1 rounded-xl border">
                {['Todos', 'Pendente', 'Em Rota', 'Entregue'].map(s => (
                  <button key={s} onClick={() => { setFilterStatus(s); setSelectedOrderIds([]); }} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${filterStatus === s ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{s}</button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-50 max-h-[600px] overflow-y-auto custom-scrollbar">
              {filteredPedidos.length === 0 ? (
                <div className="p-20 text-center flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 text-2xl"><i className="fas fa-inbox"></i></div>
                  <p className="text-slate-400 font-bold italic text-sm">Nenhum pedido nesta categoria.</p>
                </div>
              ) : filteredPedidos.map(p => (
                <div key={p.id} className={`p-5 flex justify-between items-center hover:bg-slate-50/50 transition-colors cursor-pointer ${selectedOrderIds.includes(p.id) ? 'bg-blue-50/60 ring-1 ring-inset ring-blue-100' : ''}`} onClick={() => toggleSelectOrder(p.id)}>
                  <div className="flex items-center gap-4">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-300 text-blue-600" 
                      checked={selectedOrderIds.includes(p.id)}
                      readOnly
                    />
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${p.status === 'Em Rota' ? 'bg-blue-100 text-blue-600 shadow-inner' : p.status === 'Entregue' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                      <i className={`fas ${p.status === 'Em Rota' ? 'fa-truck-fast' : p.status === 'Entregue' ? 'fa-circle-check' : 'fa-clock-rotate-left'}`}></i>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                         <p className="font-bold text-slate-800 leading-none">{p.nomeCliente}</p>
                         <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest ${p.status === 'Em Rota' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{p.status}</span>
                      </div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mt-1">🕒 {p.dataHora.split(' ')[1]} • {p.entregador}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="font-black text-blue-600 text-sm">R$ {Number(p.valorTotal).toFixed(2)}</p>
                    <p className="text-[9px] font-black text-slate-400 uppercase">{p.formaPagamento}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Checkout Lateral */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border-2 border-blue-50 sticky top-24 shadow-lg shadow-blue-900/5">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2"><i className="fas fa-shopping-cart text-blue-600"></i> Carrinho</h3>
            <div className="max-h-[250px] overflow-y-auto custom-scrollbar mb-4 space-y-2">
              {cart.map(i => (
                <div key={i.produtoId} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl text-xs font-bold">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setCart(prev => prev.map(item => item.produtoId === i.produtoId ? {...item, qtd: Math.max(1, item.qtd-1)} : item))} className="w-5 h-5 bg-white rounded border flex items-center justify-center">-</button>
                    <span>{i.qtd}x {i.nome}</span>
                    <button onClick={() => setCart(prev => prev.map(item => item.produtoId === i.produtoId ? {...item, qtd: item.qtd+1} : item))} className="w-5 h-5 bg-white rounded border flex items-center justify-center">+</button>
                  </div>
                  <span>R$ {(i.qtd * i.precoUnitario).toFixed(2)}</span>
                </div>
              ))}
              {cart.length === 0 && <p className="text-center py-8 text-slate-400 italic text-xs font-medium">Carrinho vazio</p>}
            </div>
            
            <div className="border-t border-dashed border-slate-200 pt-4">
              <div className="flex justify-between items-center mb-6">
                <span className="font-black text-slate-400 text-[10px] uppercase tracking-widest">Total Geral</span>
                <span className="font-black text-3xl text-blue-600">R$ {cartTotal.toFixed(2)}</span>
              </div>
              
              <div className="space-y-4">
                <select className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" value={selectedEnt} onChange={e => setSelectedEnt(e.target.value)}>
                  <option value="">👤 Entregador Responsável...</option>
                  {entregadores.map(e => <option key={e.id} value={e.nome}>{e.nome}</option>)}
                </select>
                <select className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" value={formaPgto} onChange={e => setFormaPgto(e.target.value)}>
                  {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button 
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await gasService.salvarPedido({ nomeCliente: nomeBusca, telefoneCliente: telBusca, endereco: endBusca, itens: cart, valorTotal: cartTotal, entregador: selectedEnt || 'Logística', formaPagamento: formaPgto });
                      setCart([]); setNomeBusca(''); setTelBusca(''); setEndBusca(''); await loadData(true);
                      setMessage({ type: 'success', text: 'Pedido registrado!' });
                    } finally { setLoading(false); }
                  }}
                  disabled={!nomeBusca || cart.length === 0}
                  className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl uppercase text-[11px] shadow-xl shadow-blue-200 disabled:opacity-50 transition-all hover:bg-blue-700"
                >Lançar Pedido</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16 font-sans">
      <header className="bg-white border-b sticky top-0 z-40 shadow-sm backdrop-blur-md bg-white/90">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 w-10 h-10 rounded-xl text-white flex items-center justify-center font-black text-xl shadow-lg">B</div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight italic">BIO GÁS <span className="text-blue-600 not-italic">PRO</span></h1>
          </div>
          <div className="flex gap-8">
            <div className="text-right"><p className="text-[10px] text-slate-400 font-black uppercase">Caixa</p><p className="font-black text-blue-600">R$ {(resumo?.totalEntradas || 0).toFixed(2)}</p></div>
            <div className="text-right"><p className="text-[10px] text-slate-400 font-black uppercase">Pendências</p><p className="font-black text-rose-600">R$ {(resumo?.totalAReceber || 0).toFixed(2)}</p></div>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-6 flex overflow-x-auto gap-2 border-t no-scrollbar">
          {[
            { id: 'vendas', label: 'Painel Vendas', icon: '⚡' },
            { id: 'cobranca', label: 'Cobrança', icon: '💸' },
            { id: 'caixa', label: 'Financeiro', icon: '💰' },
            { id: 'estoque', label: 'Estoque', icon: '📦' },
            { id: 'clientes', label: 'CRM Clientes', icon: '👥' },
            { id: 'ai', label: 'Bio AI', icon: '🤖' }
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setSelectedOrderIds([]); }} className={`flex items-center gap-2 px-6 py-5 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === tab.id ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              <span className="text-lg">{tab.icon}</span> {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {message && (
          <div className={`mb-8 p-4 rounded-2xl flex justify-between items-center animate-in slide-in-from-top-4 duration-300 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'} border`}>
            <span className="font-bold text-sm">{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-xl">×</button>
          </div>
        )}
        
        {activeTab === 'vendas' && renderVendas()}
        {activeTab === 'cobranca' && (
           <div className="space-y-6 animate-in fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-white p-8 rounded-3xl border border-rose-100 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Devedores</p>
                    <p className="text-4xl font-black text-rose-600">R$ {(resumo?.totalAReceber || 0).toFixed(2)}</p>
                 </div>
                 <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-3xl"><i className="fas fa-users-viewfinder"></i></div>
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase">Clientes Pendentes</p>
                       <p className="text-2xl font-black text-slate-800">{devedores.length} devedores ativos</p>
                    </div>
                 </div>
              </div>
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b">
                       <tr>{['Data', 'Cliente', 'Valor', 'Ações'].map(h => <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {devedores.map(m => (
                          <tr key={m.id} className="hover:bg-slate-50/50">
                             <td className="px-6 py-4 text-xs font-bold text-slate-400">{m.dataHora}</td>
                             <td className="px-6 py-4 text-sm font-bold text-slate-800">{m.descricao.replace("Venda Finalizada: ", "")}</td>
                             <td className="px-6 py-4 font-black text-rose-600">R$ {m.valor.toFixed(2)}</td>
                             <td className="px-6 py-4 flex gap-2">
                                <button onClick={() => {
                                   const n = m.descricao.replace("Venda Finalizada: ", "");
                                   window.open(`https://wa.me/?text=${encodeURIComponent(`Olá ${n}, sou da Bio Gás. Vimos uma pendência de R$ ${m.valor.toFixed(2)}. Poderia confirmar se recebeu o pedido e como prefere pagar?`)}`, '_blank');
                                }} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition"><i className="fab fa-whatsapp"></i></button>
                                <button onClick={() => handleLiquidarDivida(m.id)} disabled={processingId === m.id} className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-xl uppercase">{processingId === m.id ? '...' : 'Baixar'}</button>
                             </td>
                          </tr>
                       ))}
                       {devedores.length === 0 && <tr><td colSpan={4} className="p-12 text-center text-slate-300 font-bold italic">Nenhum "fiado" pendente no momento.</td></tr>}
                    </tbody>
                 </table>
              </div>
           </div>
        )}
        {activeTab === 'caixa' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[{l: 'Entradas', v: resumo?.totalEntradas || 0, c: 'text-emerald-600', i: 'fa-arrow-up'}, {l: 'Saídas', v: resumo?.totalSaidas || 0, c: 'text-rose-600', i: 'fa-arrow-down'}, {l: 'Pendentes', v: resumo?.totalAReceber || 0, c: 'text-orange-600', i: 'fa-hand-holding-dollar'}, {l: 'Saldo Real', v: resumo?.saldo || 0, c: 'text-slate-800', b: 'bg-blue-50 border-blue-100', i: 'fa-wallet'}].map((s,i) => (
                  <div key={i} className={`p-6 bg-white rounded-3xl border ${s.b || 'border-slate-100'} shadow-sm flex items-center gap-4`}>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${s.c.replace('text', 'bg').replace('-600', '-50')} ${s.c}`}><i className={`fas ${s.i}`}></i></div>
                    <div><p className="text-[10px] font-black text-slate-400 uppercase">{s.l}</p><p className={`text-xl font-black ${s.c}`}>R$ {s.v.toFixed(2)}</p></div>
                  </div>
                ))}
             </div>
             <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50/30"><h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Movimentações Recentes</h3></div>
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b"><tr>{['Data', 'Tipo', 'Descrição', 'Valor'].map(h => <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {(resumo?.recentes || []).map(m => (
                      <tr key={m.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4 text-xs font-bold text-slate-400">{m.dataHora}</td>
                        <td className="px-6 py-4"><span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${m.tipo === 'Entrada' ? 'bg-emerald-100 text-emerald-700' : m.tipo === 'Saída' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>{m.tipo}</span></td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-800">{m.descricao}</td>
                        <td className={`px-6 py-4 font-black ${m.tipo === 'Saída' ? 'text-rose-600' : 'text-slate-800'}`}>R$ {m.valor.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}
        {activeTab === 'estoque' && (
           <div className="space-y-6 animate-in fade-in">
              <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                 <div><h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">📦 Gestão de Itens</h2><p className="text-[10px] font-black text-slate-400 uppercase">Preços e quantidades em tempo real</p></div>
                 <button onClick={() => {}} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-lg shadow-blue-100">Novo Produto</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {produtos.map(p => (
                    <div key={p.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:border-blue-500 transition-all cursor-pointer">
                       <h4 className="font-black text-slate-800 text-lg mb-2">{p.nome}</h4>
                       <p className="text-3xl font-black text-blue-600">R$ {p.preco.toFixed(2)}</p>
                       <div className="mt-4 flex justify-between items-center">
                          <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${p.estoque < 5 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>{p.estoque} em estoque</span>
                          <button className="text-slate-300 hover:text-blue-600"><i className="fas fa-edit"></i></button>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        )}
        {activeTab === 'clientes' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50/50"><h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">Base de Dados de Clientes</h3><input className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-sm" placeholder="🔍 Buscar..." value={searchTermCRM} onChange={e => setSearchTermCRM(e.target.value)} /></div>
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b"><tr>{['Nome', 'Telefone', 'Endereço'].map(h => <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-50">
                {clientes.filter(c => c.nome.toLowerCase().includes(searchTermCRM.toLowerCase())).map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50"><td className="px-6 py-4 text-sm font-bold text-slate-800">{c.nome}</td><td className="px-6 py-4 text-xs font-semibold text-slate-500">{c.telefone}</td><td className="px-6 py-4 text-xs font-medium text-slate-400">{c.endereco}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === 'ai' && (
           <div className="max-w-3xl mx-auto h-[550px] bg-white rounded-3xl shadow-xl border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-500">
             <div className="p-5 border-b bg-slate-900 text-white flex items-center gap-3"><div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div><span className="font-black text-xs uppercase tracking-widest">Bio AI Assistant</span></div>
             <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50 custom-scrollbar">
               {aiChat.length === 0 && <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 gap-4"><div className="text-4xl">🤖</div><p className="font-bold">Olá! Como posso ajudar com sua logística hoje?</p></div>}
               {aiChat.map((m,i) => (
                 <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[85%] p-4 rounded-2xl text-sm font-medium leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none shadow-sm'}`}>{m.text}</div>
                 </div>
               ))}
               <div ref={chatEndRef} />
             </div>
             <form onSubmit={async (e) => {
               e.preventDefault(); if(!aiInput.trim()) return;
               const m = aiInput; setAiInput(''); setAiChat(p => [...p, {role: 'user', text: m}]); setAiLoading(true);
               try {
                 const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
                 const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: m });
                 setAiChat(p => [...p, {role: 'model', text: res.text || 'Desculpe, não consegui processar.'}]);
               } catch { setAiChat(p => [...p, {role: 'model', text: 'Conexão interrompida.'}]); }
               finally { setAiLoading(false); }
             }} className="p-4 bg-white border-t flex gap-2">
               <input className="flex-1 p-4 bg-slate-50 border-none rounded-2xl font-bold placeholder:text-slate-300" placeholder="Digite sua dúvida logística..." value={aiInput} onChange={e => setAiInput(e.target.value)} />
               <button className="bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase hover:bg-black transition-all">Enviar</button>
             </form>
           </div>
        )}
      </main>

      {loading && (
        <div className="fixed inset-0 bg-white/70 backdrop-blur-md flex items-center justify-center z-[300] animate-in fade-in">
          <div className="flex flex-col items-center gap-6">
            <div className="relative w-20 h-20">
               <div className="absolute inset-0 border-4 border-blue-600/20 rounded-full"></div>
               <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-[11px] font-black text-blue-600 uppercase tracking-[0.2em] animate-pulse">Sincronizando Nuvem</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
