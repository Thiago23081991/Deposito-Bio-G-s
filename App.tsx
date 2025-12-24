
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

  // --- FINANCEIRO MANUAL ---
  const [showFinanceModal, setShowFinanceModal] = useState(false);
  const [financeType, setFinanceType] = useState<'Entrada' | 'Saída'>('Entrada');
  const [manualFinance, setManualFinance] = useState({ descricao: '', valor: '', categoria: '', metodo: PaymentMethod.DINHEIRO });

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
      setMessage({ type: 'error', text: 'Erro na sincronização.' });
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

  const processStatusUpdate = async (ids: string[], novoStatus: 'Entregue' | 'Cancelado' | 'Em Rota') => {
    setLoading(true);
    try {
      const res = await gasService.atualizarStatusPedidosEmMassa(ids, novoStatus);
      if (res.success) {
        if (novoStatus === 'Em Rota') {
          const ordersToForward = pedidos.filter(p => ids.includes(p.id));
          let summary = `*🚚 ROTA DE ENTREGA - BIO GÁS PRO*\n\n`;
          ordersToForward.forEach((o, idx) => {
            summary += `*${idx + 1}. ${o.nomeCliente}*\n📍 ${o.endereco}\n📦 ${o.produtoSummary}\n💰 *R$ ${Number(o.valorTotal).toFixed(2)}* (${o.formaPagamento})\n\n`;
          });
          summary += "---";
          window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank');
        }
        setMessage({ type: 'success', text: 'Operação concluída com sucesso!' });
        setSelectedOrderIds([]);
        await loadData(true);
      }
    } finally { setLoading(false); }
  };

  const handleBulkAction = async (novoStatus: 'Entregue' | 'Cancelado' | 'Em Rota') => {
    if (selectedOrderIds.length === 0) return;
    if (!window.confirm(`Deseja aplicar esta ação a ${selectedOrderIds.length} pedidos?`)) return;
    await processStatusUpdate(selectedOrderIds, novoStatus);
  };

  // --- FINANCEIRO MANUAL ---
  const handleSaveManualFinance = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // @ts-ignore (Acesso direto ao mock/GAS para registrar movimentação manual)
      const res = await gasService.registrarMovimentacao(
        financeType,
        Number(manualFinance.valor),
        manualFinance.descricao,
        manualFinance.categoria,
        manualFinance.metodo
      );
      setShowFinanceModal(false);
      setManualFinance({ descricao: '', valor: '', categoria: '', metodo: PaymentMethod.DINHEIRO });
      setMessage({ type: 'success', text: 'Lançamento financeiro realizado!' });
      await loadData(true);
    } catch {
      setMessage({ type: 'error', text: 'Erro ao registrar movimentação.' });
    } finally {
      setLoading(false);
    }
  };

  // --- COBRANÇA ---
  const devedores = useMemo(() => {
    if(!resumo) return [];
    return resumo.recentes.filter(m => m.tipo === 'A Receber');
  }, [resumo]);

  const handleSendReminder = (m: Movimentacao) => {
    const nome = m.descricao.replace("Venda Finalizada: ", "");
    const valor = m.valor.toFixed(2);
    const data = m.dataHora.split(' ')[0];
    
    if (window.confirm(`Deseja enviar lembrete de cobrança para ${nome} no valor de R$ ${valor}?`)) {
      const msg = `Olá *${nome}*, tudo bem? 👋\n\nSou da *Bio Gás PRO*. Estamos passando apenas para lembrar de uma pendência de *R$ ${valor}* referente ao seu pedido do dia *${data}*.\n\nComo fica melhor para você realizar o acerto? Aceitamos PIX, Dinheiro ou Cartão. 💳💰\n\nMuito obrigado pela preferência!`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }
  };

  const handleLiquidarDivida = async (id: string) => {
    if(!window.confirm("Confirmar recebimento e liquidar esta dívida no caixa?")) return;
    setProcessingId(id);
    try {
      const res = await gasService.liquidarDivida(id);
      if(res.success) {
        setMessage({ type: 'success', text: 'Dívida liquidada com sucesso!' });
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
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-slate-800"><i className="fas fa-headset text-blue-600"></i> Novo Pedido</h3>
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
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative min-h-[500px]">
            {selectedOrderIds.length > 0 && (
              <div className="absolute top-0 left-0 w-full bg-slate-900 p-4 z-20 flex justify-between items-center animate-in slide-in-from-top-4">
                <div className="flex items-center gap-3">
                   <span className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-black">{selectedOrderIds.length}</span>
                   <span className="text-white font-black text-[10px] uppercase tracking-widest">Ações em Massa</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleBulkAction('Em Rota')} className="px-5 py-2.5 bg-blue-600 text-white text-[10px] font-black rounded-xl uppercase hover:bg-blue-700 transition">Despachar Rota</button>
                  <button onClick={() => handleBulkAction('Entregue')} className="px-5 py-2.5 bg-emerald-500 text-white text-[10px] font-black rounded-xl uppercase hover:bg-emerald-600 transition">Baixa Entrega</button>
                  <button onClick={() => setSelectedOrderIds([])} className="ml-2 w-10 h-10 flex items-center justify-center text-white/50 bg-white/10 rounded-full">×</button>
                </div>
              </div>
            )}

            <div className="px-6 py-5 bg-slate-50/50 border-b flex justify-between items-center">
              <div className="flex items-center gap-4">
                <input 
                  type="checkbox" 
                  className="w-5 h-5 rounded-md border-slate-300 text-blue-600 cursor-pointer"
                  checked={selectedOrderIds.length === filteredPedidos.length && filteredPedidos.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedOrderIds(filteredPedidos.map(p => p.id));
                    else setSelectedOrderIds([]);
                  }}
                />
                <h3 className="font-black text-slate-800">📦 Monitor de Pedidos</h3>
              </div>
              <div className="flex bg-white p-1 rounded-xl border border-slate-200">
                {['Todos', 'Pendente', 'Em Rota', 'Entregue'].map(s => (
                  <button key={s} onClick={() => { setFilterStatus(s); setSelectedOrderIds([]); }} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${filterStatus === s ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>{s}</button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[700px] overflow-y-auto custom-scrollbar">
              {filteredPedidos.map(p => (
                <div 
                  key={p.id} 
                  className={`p-5 flex justify-between items-center hover:bg-slate-50/80 cursor-pointer group ${selectedOrderIds.includes(p.id) ? 'bg-blue-50/80 ring-1 ring-inset ring-blue-100' : ''}`}
                  onClick={() => toggleSelectOrder(p.id)}
                >
                  <div className="flex items-center gap-4">
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600" checked={selectedOrderIds.includes(p.id)} readOnly />
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${
                      p.status === 'Em Rota' ? 'bg-blue-600 text-white shadow-lg' : 
                      p.status === 'Entregue' ? 'bg-emerald-500 text-white shadow-lg' : 
                      'bg-white text-slate-400 border'
                    }`}>
                      <i className={`fas ${p.status === 'Em Rota' ? 'fa-truck-fast' : p.status === 'Entregue' ? 'fa-check' : 'fa-clock'}`}></i>
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm leading-none">{p.nomeCliente}</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-1">📍 {p.endereco}</p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div>
                      <p className="font-black text-blue-600 text-sm">R$ {Number(p.valorTotal).toFixed(2)}</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase">{p.formaPagamento}</p>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.status === 'Pendente' && <button onClick={(e) => { e.stopPropagation(); processStatusUpdate([p.id], 'Em Rota'); }} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition"><i className="fas fa-truck-fast"></i></button>}
                      {p.status === 'Em Rota' && <button onClick={(e) => { e.stopPropagation(); processStatusUpdate([p.id], 'Entregue'); }} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition"><i className="fas fa-check"></i></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border-2 border-blue-50 sticky top-24 shadow-sm">
            <h3 className="text-lg font-black mb-6 flex items-center gap-2"><i className="fas fa-cart-shopping text-blue-600"></i> Checkout</h3>
            <div className="space-y-4 mb-6">
              <select className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-xs" value={selectedEnt} onChange={e => setSelectedEnt(e.target.value)}>
                <option value="">Entregador Responsável...</option>
                {entregadores.map(e => <option key={e.id} value={e.nome}>{e.nome}</option>)}
              </select>
              <select className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-xs" value={formaPgto} onChange={e => setFormaPgto(e.target.value)}>
                {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button 
                onClick={async () => {
                  setLoading(true);
                  try {
                    await gasService.salvarPedido({ nomeCliente: nomeBusca, telefoneCliente: telBusca, endereco: endBusca, itens: cart, valorTotal: cartTotal, entregador: selectedEnt || 'Logística', formaPagamento: formaPgto });
                    setCart([]); setNomeBusca(''); setTelBusca(''); setEndBusca(''); await loadData(true);
                    setMessage({ type: 'success', text: 'Pedido registrado com sucesso!' });
                  } finally { setLoading(false); }
                }}
                disabled={!nomeBusca || cart.length === 0}
                className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl uppercase text-[11px] shadow-xl shadow-blue-200 disabled:opacity-30 transition-all"
              >Finalizar Venda</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCaixa = () => (
    <div className="space-y-8 animate-in slide-in-from-bottom-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[{l: 'Entradas', v: resumo?.totalEntradas || 0, c: 'text-emerald-600', i: 'fa-arrow-up-long'}, {l: 'Saídas', v: resumo?.totalSaidas || 0, c: 'text-rose-600', i: 'fa-arrow-down-long'}, {l: 'Em Aberto', v: resumo?.totalAReceber || 0, c: 'text-orange-500', i: 'fa-clock'}, {l: 'Saldo Real', v: resumo?.saldo || 0, c: 'text-slate-900', b: 'bg-blue-50 border-blue-100', i: 'fa-vault'}].map((s,i) => (
          <div key={i} className={`p-8 bg-white rounded-[40px] border ${s.b || 'border-slate-100'} shadow-sm flex items-center gap-5`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${s.c.replace('text', 'bg').replace('-600', '-50')} ${s.c}`}><i className={`fas ${s.i}`}></i></div>
            <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.l}</p><p className={`text-2xl font-black ${s.c}`}>R$ {s.v.toFixed(2)}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[40px] shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-8 border-b flex justify-between items-center bg-slate-50/30">
          <h3 className="font-black text-slate-800 uppercase text-[10px] tracking-widest">Extrato de Movimentações</h3>
          <div className="flex gap-3">
            <button onClick={() => { setFinanceType('Entrada'); setShowFinanceModal(true); }} className="bg-emerald-500 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition">+ Receita</button>
            <button onClick={() => { setFinanceType('Saída'); setShowFinanceModal(true); }} className="bg-rose-500 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-100 hover:bg-rose-600 transition">- Despesa</button>
          </div>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b">
            <tr>{['Data/Hora', 'Fluxo', 'Descrição', 'Valor', 'Metodo'].map(h => <th key={h} className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(resumo?.recentes || []).map(m => (
              <tr key={m.id} className="hover:bg-slate-50/30">
                <td className="px-8 py-6 text-[10px] font-black text-slate-400">{m.dataHora}</td>
                <td className="px-8 py-6"><span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter ${m.tipo === 'Entrada' ? 'bg-emerald-100 text-emerald-700' : m.tipo === 'Saída' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>{m.tipo}</span></td>
                <td className="px-8 py-6 text-sm font-black text-slate-800">{m.descricao}</td>
                <td className={`px-8 py-6 font-black text-base ${m.tipo === 'Saída' ? 'text-rose-600' : 'text-slate-900'}`}>R$ {m.valor.toFixed(2)}</td>
                <td className="px-8 py-6 text-[10px] font-bold text-slate-400 uppercase">{m.metodo || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showFinanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden">
            <div className={`p-6 ${financeType === 'Entrada' ? 'bg-emerald-600' : 'bg-rose-600'} text-white flex justify-between items-center`}>
              <h3 className="font-black text-xs uppercase tracking-widest">Novo Lançamento: {financeType}</h3>
              <button onClick={() => setShowFinanceModal(false)} className="text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSaveManualFinance} className="p-8 space-y-5">
              <input required className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" placeholder="Descrição (ex: Aluguel, Compra estoque...)" value={manualFinance.descricao} onChange={e => setManualFinance({...manualFinance, descricao: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <input required type="number" step="0.01" className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" placeholder="Valor R$" value={manualFinance.valor} onChange={e => setManualFinance({...manualFinance, valor: e.target.value})} />
                <select className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-xs" value={manualFinance.metodo} onChange={e => setManualFinance({...manualFinance, metodo: e.target.value as any})}>
                  {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <input className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" placeholder="Categoria (opcional)" value={manualFinance.categoria} onChange={e => setManualFinance({...manualFinance, categoria: e.target.value})} />
              <button className={`w-full py-5 ${financeType === 'Entrada' ? 'bg-emerald-600' : 'bg-rose-600'} text-white font-black rounded-3xl uppercase text-[11px] shadow-xl transition-all active:scale-95`}>Confirmar Lançamento</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16 font-sans">
      <header className="bg-white border-b sticky top-0 z-40 shadow-sm backdrop-blur-lg bg-white/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 w-11 h-11 rounded-2xl text-white flex items-center justify-center font-black text-2xl shadow-xl shadow-blue-200">B</div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none italic">BIO GÁS <span className="text-blue-600 not-italic">PRO</span></h1>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">SISTEMA DE GESTÃO INTELIGENTE</p>
            </div>
          </div>
          <div className="flex gap-10">
            <div className="text-right">
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Caixa Real</p>
              <p className="font-black text-lg text-slate-900 tracking-tighter">R$ {(resumo?.totalEntradas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-rose-400 font-black uppercase tracking-widest mb-1">Pendências</p>
              <p className="font-black text-lg text-rose-600 tracking-tighter">R$ {(resumo?.totalAReceber || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-6 flex overflow-x-auto gap-1 border-t no-scrollbar">
          {[
            { id: 'vendas', label: 'Painel Vendas', icon: '⚡' },
            { id: 'cobranca', label: 'Cobrança', icon: '💸' },
            { id: 'caixa', label: 'Financeiro', icon: '💰' },
            { id: 'estoque', label: 'Estoque', icon: '📦' },
            { id: 'clientes', label: 'CRM Clientes', icon: '👥' },
            { id: 'ai', label: 'Bio AI', icon: '🤖' }
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setSelectedOrderIds([]); }} className={`flex items-center gap-2 px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 transition-all relative ${activeTab === tab.id ? 'border-blue-600 text-blue-600 bg-blue-50/50 shadow-[inset_0_-2px_0_rgba(37,99,235,1)]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              <span className="text-xl filter drop-shadow-sm">{tab.icon}</span> {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {message && (
          <div className={`mb-10 p-5 rounded-3xl flex justify-between items-center animate-in slide-in-from-top-6 duration-500 border-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-rose-50 text-rose-800 border-rose-100'} shadow-sm`}>
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'} text-white text-lg`}><i className={`fas ${message.type === 'success' ? 'fa-check' : 'fa-triangle-exclamation'}`}></i></div>
              <span className="font-black text-xs uppercase tracking-widest">{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} className="text-2xl font-light hover:rotate-90 transition-transform">×</button>
          </div>
        )}
        
        {activeTab === 'vendas' && renderVendas()}
        {activeTab === 'cobranca' && (
           <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="bg-white p-10 rounded-[40px] border border-rose-100 shadow-xl shadow-rose-900/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full -mr-16 -mt-16"></div>
                    <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.3em] mb-3">Dívida Ativa Fiado</p>
                    <p className="text-5xl font-black text-rose-600 tracking-tighter">R$ {(resumo?.totalAReceber || 0).toFixed(2)}</p>
                 </div>
                 <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-xl shadow-slate-900/5 flex items-center gap-6">
                    <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center text-4xl shadow-inner shadow-blue-100"><i className="fas fa-handshake-angle"></i></div>
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Relacionamento</p>
                       <p className="text-3xl font-black text-slate-800 tracking-tighter">{devedores.length} Pendentes</p>
                    </div>
                 </div>
              </div>
              <div className="bg-white rounded-[40px] shadow-2xl shadow-slate-900/5 border border-slate-100 overflow-hidden">
                 <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center"><h3 className="font-black text-slate-800 uppercase text-xs tracking-[0.2em] flex items-center gap-3"><i className="fas fa-receipt text-rose-500"></i> Gestão de Recebíveis</h3></div>
                 <table className="w-full text-left border-collapse">
                    <thead>
                       <tr className="bg-slate-50/80 border-b">
                         {['Data', 'Cliente Devedor', 'Valor Pendente', 'Ações'].map(h => <th key={h} className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>)}
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {devedores.map(m => (
                          <tr key={m.id} className="hover:bg-slate-50/30 transition-colors">
                             <td className="px-8 py-6 text-[10px] font-black text-slate-400">{m.dataHora}</td>
                             <td className="px-8 py-6 text-sm font-black text-slate-800">{m.descricao.replace("Venda Finalizada: ", "")}</td>
                             <td className="px-8 py-6 font-black text-rose-600 text-lg">R$ {m.valor.toFixed(2)}</td>
                             <td className="px-8 py-6 flex gap-3">
                                <button onClick={() => handleSendReminder(m)} className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center text-xl shadow-sm" title="Enviar Lembrete WhatsApp"><i className="fab fa-whatsapp"></i></button>
                                <button onClick={() => handleLiquidarDivida(m.id)} disabled={processingId === m.id} className="px-6 h-12 bg-blue-600 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest hover:bg-blue-700 transition shadow-lg shadow-blue-200">{processingId === m.id ? 'Baixando...' : 'Dar Baixa'}</button>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        )}
        {activeTab === 'caixa' && renderCaixa()}
        {activeTab === 'estoque' && (
           <div className="space-y-8 animate-in fade-in">
              <div className="flex justify-between items-center bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl shadow-slate-900/5">
                 <div><h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">📦 Controle de Inventário</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Gestão de produtos e preços ativos</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 {produtos.map(p => (
                    <div key={p.id} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl hover:shadow-2xl hover:border-blue-500 transition-all cursor-pointer group">
                       <h4 className="font-black text-slate-800 text-xl mb-3 uppercase tracking-tight group-hover:text-blue-600">{p.nome}</h4>
                       <p className="text-4xl font-black text-slate-900 tracking-tighter mb-6">R$ {p.preco.toFixed(2)}</p>
                       <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                          <span className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-lg ${p.estoque < 10 ? 'bg-rose-500 text-white animate-pulse' : 'bg-white text-slate-800 border border-slate-200'}`}>{p.estoque} Unid. em estoque</span>
                          <button className="text-slate-300 hover:text-blue-600 text-xl transition-colors"><i className="fas fa-pen-to-square"></i></button>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        )}
        {activeTab === 'clientes' && (
          <div className="bg-white rounded-[40px] shadow-2xl shadow-slate-900/5 border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-right-10">
            <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-[0.3em]">Base de Clientes CRM</h3>
              <div className="relative">
                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
                <input className="pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-[20px] font-bold text-sm shadow-sm focus:ring-2 focus:ring-blue-500 w-80" placeholder="Buscar por nome ou tel..." value={searchTermCRM} onChange={e => setSearchTermCRM(e.target.value)} />
              </div>
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b">
                <tr>{['Nome Completo', 'WhatsApp / Telefone', 'Endereço de Entrega Principal'].map(h => <th key={h} className="px-10 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientes.filter(c => c.nome.toLowerCase().includes(searchTermCRM.toLowerCase())).map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-10 py-6 text-sm font-black text-slate-800 uppercase tracking-tight">{c.nome}</td>
                    <td className="px-10 py-6 text-xs font-bold text-blue-600">{c.telefone}</td>
                    <td className="px-10 py-6 text-xs font-medium text-slate-500 italic">📍 {c.endereco}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === 'ai' && (
           <div className="max-w-4xl mx-auto h-[650px] bg-white rounded-[40px] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100 flex flex-col overflow-hidden animate-in zoom-in-95 duration-500 relative">
             <div className="p-6 border-b bg-slate-900 text-white flex items-center justify-between">
               <div className="flex items-center gap-4">
                 <div className="w-4 h-4 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.8)]"></div>
                 <span className="font-black text-[10px] uppercase tracking-[0.4em]">Bio AI Logistics Engine</span>
               </div>
             </div>
             <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-[#FDFDFF] custom-scrollbar">
               {aiChat.map((m,i) => (
                 <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[85%] p-5 rounded-[25px] text-sm font-medium leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'}`}>{m.text}</div>
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
                 setAiChat(p => [...p, {role: 'model', text: res.text || 'Processando análise...'}]);
               } catch { setAiChat(p => [...p, {role: 'model', text: 'Erro de conexão.'}]); }
               finally { setAiLoading(false); }
             }} className="p-6 bg-white border-t-2 border-slate-50 flex gap-4">
               <input className="flex-1 p-5 bg-slate-100 border-none rounded-3xl font-bold placeholder:text-slate-300" placeholder="Analisar tendências de vendas..." value={aiInput} onChange={e => setAiInput(e.target.value)} />
               <button className="bg-slate-900 text-white px-8 py-5 rounded-3xl font-black text-[11px] uppercase tracking-widest hover:bg-blue-600 transition-all">Analisar</button>
             </form>
           </div>
        )}
      </main>

      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-xl flex items-center justify-center z-[300] animate-in fade-in">
          <div className="flex flex-col items-center gap-8">
            <div className="relative w-24 h-24">
               <div className="absolute inset-0 border-8 border-blue-600/10 rounded-full animate-pulse"></div>
               <div className="absolute inset-0 border-8 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-[12px] font-black text-blue-600 uppercase tracking-[0.4em] animate-pulse">Sincronizando Nuvem</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
