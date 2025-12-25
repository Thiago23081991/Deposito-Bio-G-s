
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { gasService } from './services/gasMock.ts';
import { Cliente, Produto, Entregador, Pedido, PaymentMethod, ResumoFinanceiro, PedidoItem, Movimentacao, ChatMessage } from './types.ts';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import * as XLSX from 'xlsx';

const App: React.FC = () => {
  // --- ESTADO GLOBAL ---
  const [activeTab, setActiveTab] = useState<'vendas' | 'caixa' | 'cobranca' | 'estoque' | 'clientes' | 'entregadores' | 'marketing'>('vendas');
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

  // --- MODAIS ---
  const [showFinanceModal, setShowFinanceModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showEntregadorModal, setShowEntregadorModal] = useState(false);
  const [showProdutoModal, setShowProdutoModal] = useState(false);
  const [financeType, setFinanceType] = useState<'Entrada' | 'Saída'>('Entrada');
  const [manualFinance, setManualFinance] = useState({ descricao: '', valor: '', categoria: '', metodo: PaymentMethod.DINHEIRO, detalhe: '' });
  const [novoEntregador, setNovoEntregador] = useState({ id: '', nome: '', telefone: '', veiculo: '', status: 'Ativo' as 'Ativo' | 'Inativo' });
  const [novoProduto, setNovoProduto] = useState<Partial<Produto>>({ nome: '', preco: 0, precoCusto: 0, estoque: 0, unidadeMedida: 'unidade' });

  // --- FILTROS & BUSCA ---
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [searchTermCRM, setSearchTermCRM] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  
  // --- ATENDIMENTO ---
  const [nomeBusca, setNomeBusca] = useState('');
  const [telBusca, setTelBusca] = useState('');
  const [endBusca, setEndBusca] = useState('');
  const [cart, setCart] = useState<PedidoItem[]>([]);
  const [selectedEnt, setSelectedEnt] = useState('');
  const [formaPgto, setFormaPgto] = useState<string>(PaymentMethod.DINHEIRO);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // --- MARKETING ---
  const [mktMessage, setMktMessage] = useState('');
  const [mktBairroFilter, setMktBairroFilter] = useState('Todos');
  const [isGeneratingMkt, setIsGeneratingMkt] = useState(false);

  // --- MONITOR DE ESTOQUE CRÍTICO ---
  const ESTOQUE_MINIMO = 10;
  const produtosEstoqueBaixo = useMemo(() => 
    produtos.filter(p => p.estoque < ESTOQUE_MINIMO), 
  [produtos]);

  // --- LÓGICA DE RELATÓRIO MENSAL ---
  const reportData = useMemo(() => {
    if (!resumo) return null;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const currentMonthMovs = resumo.recentes.filter(m => {
      const parts = m.dataHora.split('/');
      if (parts.length < 3) return false;
      const month = parseInt(parts[1]);
      const year = parseInt(parts[2].split(' ')[0]);
      return month === currentMonth && year === currentYear;
    });

    const byCategory: Record<string, { entrada: number, saida: number }> = {};
    const byMethod: Record<string, number> = {};
    let totalIn = 0;
    let totalOut = 0;

    currentMonthMovs.forEach(m => {
      const cat = m.categoria || 'Geral';
      if (!byCategory[cat]) byCategory[cat] = { entrada: 0, saida: 0 };
      if (m.tipo === 'Entrada') {
        byCategory[cat].entrada += m.valor;
        totalIn += m.valor;
      } else if (m.tipo === 'Saída') {
        byCategory[cat].saida += m.valor;
        totalOut += m.valor;
      }
      if (m.tipo === 'Entrada' || m.tipo === 'Liquidado') {
        const met = m.metodo || 'Outros';
        byMethod[met] = (byMethod[met] || 0) + m.valor;
      }
    });

    return {
      monthName: now.toLocaleString('pt-BR', { month: 'long' }),
      year: currentYear,
      totalIn,
      totalOut,
      balance: totalIn - totalOut,
      byCategory,
      byMethod,
      count: currentMonthMovs.length
    };
  }, [resumo]);

  // Fechar sugestões ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // --- MARKETING ---
  const generateMktCopy = async (tipo: string) => {
    setIsGeneratingMkt(true);
    try {
      const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
      const prompt = `Atue como um especialista em marketing para depósitos de gás. Gere uma mensagem de WhatsApp curta e persuasiva do tipo "${tipo}". 
      Produtos: ${produtos.map(p => p.nome).join(', ')}. Use [nome] para o cliente.`;
      const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
      setMktMessage(res.text || '');
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao gerar texto com IA.' });
    } finally { setIsGeneratingMkt(false); }
  };

  const handleSendCampaign = (c: Cliente) => {
    const personalMsg = mktMessage.replace(/\[nome\]/gi, c.nome);
    window.open(`https://wa.me/${c.telefone.replace(/\D/g,'')}?text=${encodeURIComponent(personalMsg)}`, '_blank');
  };

  // --- LOGÍSTICA ---
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
          const orders = pedidos.filter(p => ids.includes(p.id));
          let summary = `*🚚 ROTA BIO GÁS*\n\n`;
          orders.forEach((o, idx) => summary += `*${idx + 1}. ${o.nomeCliente}*\n📍 ${o.endereco}\n💰 *R$ ${Number(o.valorTotal).toFixed(2)}*\n\n`);
          window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank');
        }
        setMessage({ type: 'success', text: 'Logística atualizada!' });
        setSelectedOrderIds([]);
        await loadData(true);
      }
    } finally { setLoading(false); }
  };

  const handleQuickStatus = async (e: React.MouseEvent, id: string, novoStatus: 'Entregue' | 'Em Rota' | 'Cancelado') => {
    e.stopPropagation();
    await processStatusUpdate([id], novoStatus);
  };

  const handleBulkAction = async (novoStatus: 'Entregue' | 'Cancelado' | 'Em Rota') => {
    if (selectedOrderIds.length === 0) return;
    if (!window.confirm(`Atualizar ${selectedOrderIds.length} pedidos?`)) return;
    await processStatusUpdate(selectedOrderIds, novoStatus);
  };

  // --- ENTREGADORES ---
  const handleSaveEntregador = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await gasService.salvarEntregador(novoEntregador);
      setShowEntregadorModal(false);
      setMessage({ type: 'success', text: 'Entregador atualizado com sucesso!' });
      await loadData(true);
    } catch {
      setMessage({ type: 'error', text: 'Erro ao salvar entregador.' });
    } finally { setLoading(false); }
  };

  // --- FINANCEIRO ---
  const handleSaveManualFinance = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await gasService.registrarMovimentacao(financeType, Number(manualFinance.valor), manualFinance.descricao, manualFinance.categoria, manualFinance.metodo, manualFinance.detalhe);
      setShowFinanceModal(false);
      setManualFinance({ descricao: '', valor: '', categoria: '', metodo: PaymentMethod.DINHEIRO, detalhe: '' });
      setMessage({ type: 'success', text: 'Movimentação registrada.' });
      await loadData(true);
    } finally { setLoading(false); }
  };

  const handleLiquidarDivida = async (id: string) => {
    if(!window.confirm("Confirmar recebimento?")) return;
    setProcessingId(id);
    try {
      await gasService.liquidarDivida(id);
      setMessage({ type: 'success', text: 'Pendência liquidada.' });
      await loadData(true);
    } finally { setProcessingId(null); }
  };

  // --- IMPORTAÇÃO ---
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        const formatted = data.map((item: any) => ({
          nome: item.Nome || item.nome || '',
          telefone: String(item.Telefone || item.telefone || '').replace(/\D/g, ''),
          endereco: item.Endereco || item.endereco || '',
          bairro: item.Bairro || item.bairro || '',
          referencia: item.Referencia || item.referencia || ''
        }));
        await gasService.importarClientesEmMassa(formatted);
        setMessage({ type: 'success', text: 'Clientes importados!' });
        await loadData(true);
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- RENDERS ---
  const renderVendas = () => {
    const cartTotal = cart.reduce((acc, i) => acc + (i.qtd * i.precoUnitario), 0);
    const nameSuggestions = nomeBusca.length > 0 ? clientes.filter(c => c.nome.toLowerCase().includes(nomeBusca.toLowerCase()) || c.telefone.includes(nomeBusca)).slice(0, 6) : [];
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-slate-800"><i className="fas fa-headset text-blue-600"></i> Novo Atendimento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
              <div className="md:col-span-2 relative" ref={suggestionsRef}>
                <div className="relative">
                   <i className="fas fa-user absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"></i>
                   <input className="w-full pl-12 pr-5 py-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-bold" placeholder="Consumidor ou WhatsApp..." value={nomeBusca} onChange={e => {setNomeBusca(e.target.value); setShowSuggestions(true);}} />
                </div>
                {showSuggestions && nameSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white shadow-2xl rounded-2xl border border-slate-100 z-[100] mt-2 overflow-hidden">
                    {nameSuggestions.map(c => (
                      <button key={c.id} onClick={() => {setNomeBusca(c.nome); setTelBusca(c.telefone); setEndBusca(c.endereco); setShowSuggestions(false);}} className="w-full p-4 text-left hover:bg-blue-50 border-b last:border-0 flex justify-between items-center group">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all"><i className="fas fa-user"></i></div>
                           <div><p className="font-black text-slate-800 text-sm">{c.nome}</p><p className="text-[10px] text-slate-400">{c.telefone}</p></div>
                        </div>
                        <p className="text-[9px] text-slate-400 truncate max-w-[40%]">📍 {c.endereco}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative"><i className="fab fa-whatsapp absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"></i><input className="w-full pl-12 pr-5 py-4 bg-slate-50 border-none rounded-2xl font-bold" placeholder="WhatsApp" value={telBusca} onChange={e => setTelBusca(e.target.value)} /></div>
              <div className="relative"><i className="fas fa-location-dot absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"></i><input className="w-full pl-12 pr-5 py-4 bg-slate-50 border-none rounded-2xl font-bold" placeholder="Endereço" value={endBusca} onChange={e => setEndBusca(e.target.value)} /></div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <p className="w-full text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">Produtos Rápidos</p>
              {produtos.map(p => (
                <button key={p.id} onClick={() => setCart(prev => {
                  const ex = prev.find(i => i.produtoId === p.id);
                  if(ex) return prev.map(i => i.produtoId === p.id ? {...i, qtd: i.qtd+1} : i);
                  return [...prev, { produtoId: p.id, nome: p.nome, qtd: 1, precoUnitario: p.preco }];
                })} className="px-5 py-3 bg-white border-2 rounded-2xl font-black text-[10px] uppercase border-slate-100 hover:border-blue-500 hover:text-blue-600 transition-all">+ {p.nome}</button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative min-h-[500px]">
            {selectedOrderIds.length > 0 && (
              <div className="absolute top-0 left-0 w-full bg-slate-900 p-4 z-20 flex justify-between items-center animate-in slide-in-from-top-4">
                <div className="flex items-center gap-3">
                   <span className="w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-black">{selectedOrderIds.length}</span>
                   <span className="text-white font-black text-[10px] uppercase tracking-widest">Ação em Massa</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleBulkAction('Em Rota')} className="px-5 py-2.5 bg-blue-600 text-white text-[10px] font-black rounded-xl uppercase">Despachar</button>
                  <button onClick={() => handleBulkAction('Entregue')} className="px-5 py-2.5 bg-emerald-500 text-white text-[10px] font-black rounded-xl uppercase">Dar Baixa</button>
                  <button onClick={() => setSelectedOrderIds([])} className="ml-2 w-10 h-10 text-white/50 bg-white/10 rounded-full flex items-center justify-center">×</button>
                </div>
              </div>
            )}
            <div className="px-6 py-5 bg-slate-50/50 border-b flex justify-between items-center">
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest">📦 Logística de Entregas</h3>
              <div className="flex bg-white p-1 rounded-xl border border-slate-200">
                {['Todos', 'Pendente', 'Em Rota', 'Entregue'].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg ${filterStatus === s ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>{s}</button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredPedidos.map(p => (
                <div key={p.id} className={`p-5 flex justify-between items-center hover:bg-slate-50/80 cursor-pointer transition-all ${selectedOrderIds.includes(p.id) ? 'bg-blue-50' : ''}`} onClick={() => toggleSelectOrder(p.id)}>
                  <div className="flex items-center gap-4">
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600" checked={selectedOrderIds.includes(p.id)} readOnly />
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${p.status === 'Em Rota' ? 'bg-blue-600 text-white shadow-lg' : p.status === 'Entregue' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-white text-slate-400 border'}`}>
                      <i className={`fas ${p.status === 'Em Rota' ? 'fa-truck-fast' : p.status === 'Entregue' ? 'fa-check' : 'fa-clock'}`}></i>
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm leading-none">{p.nomeCliente}</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-1">📍 {p.endereco}</p>
                      <p className="text-[9px] font-black text-blue-500 uppercase mt-1">{p.produtoSummary}</p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-6">
                    <div className="hidden md:block">
                      <p className="font-black text-blue-600 text-sm">R$ {Number(p.valorTotal).toFixed(2)}</p>
                      <p className="text-[8px] font-black text-slate-400 uppercase">{p.formaPagamento}</p>
                    </div>
                    <div className="flex gap-2">
                       {p.status === 'Pendente' && <button onClick={(e) => handleQuickStatus(e, p.id, 'Em Rota')} className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition flex items-center justify-center shadow-sm"><i className="fas fa-truck-fast"></i></button>}
                       {p.status !== 'Entregue' && <button onClick={(e) => handleQuickStatus(e, p.id, 'Entregue')} className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition flex items-center justify-center shadow-sm"><i className="fas fa-check"></i></button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border-2 border-blue-50 sticky top-24 shadow-sm">
            <h3 className="text-lg font-black mb-6 flex items-center gap-2 text-slate-800"><i className="fas fa-cart-shopping text-blue-600"></i> Checkout</h3>
            <div className="space-y-4 mb-6">
              <div className="max-h-[200px] overflow-y-auto mb-4 pr-2 custom-scrollbar">
                 {cart.map(i => (
                    <div key={i.produtoId} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl text-xs font-bold mb-2 border">
                       <div className="flex items-center gap-2">
                          <button onClick={() => setCart(prev => prev.map(it => it.produtoId === i.produtoId ? {...it, qtd: Math.max(0, it.qtd-1)} : it).filter(it => it.qtd > 0))} className="w-6 h-6 bg-white rounded-lg border text-rose-500">-</button>
                          <span>{i.qtd}x {i.nome}</span>
                       </div>
                       <span>R$ {(i.qtd * i.precoUnitario).toFixed(2)}</span>
                    </div>
                 ))}
                 {cart.length === 0 && <p className="text-center py-8 text-[10px] font-black text-slate-300 uppercase">Carrinho Vazio</p>}
              </div>
              <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase ml-2">Pagamento</p>
                 <select className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-xs" value={formaPgto} onChange={e => setFormaPgto(e.target.value)}>
                   {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                 </select>
              </div>
              <button onClick={async () => {
                  setLoading(true);
                  try {
                    await gasService.salvarPedido({ nomeCliente: nomeBusca, telefoneCliente: telBusca, endereco: endBusca, itens: cart, valorTotal: cartTotal, entregador: selectedEnt || 'Logística', formaPagamento: formaPgto });
                    setCart([]); setNomeBusca(''); setTelBusca(''); setEndBusca(''); await loadData(true);
                    setMessage({ type: 'success', text: 'Pedido Finalizado!' });
                  } finally { setLoading(false); }
                }} disabled={!nomeBusca || cart.length === 0} className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl uppercase text-[11px] shadow-xl shadow-blue-200">Confirmar Venda</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderEntregadores = () => (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex justify-between items-center bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl">
         <div><h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">🛵 Gestão de Equipe</h2><p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-1">Equipe Ativa e Veículos</p></div>
         <button onClick={() => { setNovoEntregador({id: '', nome: '', telefone: '', veiculo: '', status: 'Ativo'}); setShowEntregadorModal(true); }} className="bg-blue-600 text-white px-8 py-4 rounded-3xl font-black text-[11px] uppercase tracking-widest shadow-xl hover:bg-blue-700 transition">Novo Entregador</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         {entregadores.map(e => (
            <div key={e.id} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl hover:shadow-2xl transition-all group">
               <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl group-hover:bg-blue-600 group-hover:text-white transition-all"><i className="fas fa-motorcycle"></i></div>
                  <div><h4 className="font-black text-slate-800 text-lg uppercase tracking-tight">{e.nome}</h4><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${e.status === 'Ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{e.status}</span></div>
               </div>
               <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-xs font-bold text-slate-400 uppercase"><span>Veículo</span><span className="text-slate-800">{e.veiculo}</span></div>
                  <div className="flex justify-between text-xs font-bold text-slate-400 uppercase"><span>Contato</span><span className="text-blue-600">{e.telefone}</span></div>
               </div>
               <div className="flex gap-2">
                  <button onClick={() => window.open(`https://wa.me/${e.telefone.replace(/\D/g,'')}`, '_blank')} className="flex-1 py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-black text-[10px] uppercase hover:bg-emerald-600 hover:text-white transition">WhatsApp</button>
                  <button onClick={() => {setNovoEntregador(e); setShowEntregadorModal(true);}} className="px-4 py-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-blue-50 hover:text-blue-600 transition"><i className="fas fa-edit"></i></button>
               </div>
            </div>
         ))}
      </div>
    </div>
  );

  const renderMarketing = () => {
    const bairros = ['Todos', ...Array.from(new Set(clientes.map(c => c.bairro).filter(b => b)))];
    const filteredMktClients = clientes.filter(c => mktBairroFilter === 'Todos' || c.bairro === mktBairroFilter);
    return (
      <div className="space-y-8 animate-in fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-8 rounded-[40px] shadow-xl border border-slate-100">
                 <h3 className="text-lg font-black mb-6 flex items-center gap-3 text-slate-800"><i className="fas fa-wand-magic-sparkles text-blue-600"></i> Criativo Bio IA</h3>
                 <div className="grid grid-cols-2 gap-3 mb-6">
                    {['Promoção', 'Feriado', 'Aviso', 'Fidelidade'].map(t => (
                       <button key={t} onClick={() => generateMktCopy(t)} disabled={isGeneratingMkt} className="px-4 py-3 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase text-slate-600 hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50">{isGeneratingMkt ? '...' : t}</button>
                    ))}
                 </div>
                 <textarea className="w-full p-5 bg-slate-50 border-none rounded-[30px] font-medium text-sm min-h-[250px] mb-4 leading-relaxed" placeholder="Mensagem..." value={mktMessage} onChange={e => setMktMessage(e.target.value)} />
                 <div className="p-4 bg-blue-50 rounded-2xl text-[10px] font-bold text-blue-600 flex gap-3"><i className="fas fa-info-circle"></i><p>Dica: Use [nome] para personalizar.</p></div>
              </div>
           </div>
           <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-8 rounded-[40px] shadow-xl border border-slate-100">
                 <div className="flex justify-between items-center mb-8">
                    <div><h3 className="text-xl font-black text-slate-900 tracking-tight">Segmentação de Audiência</h3><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Total: {filteredMktClients.length} contatos</p></div>
                    <select className="bg-slate-50 p-4 rounded-2xl font-black text-[10px] uppercase border-none" value={mktBairroFilter} onChange={e => setMktBairroFilter(e.target.value)}>
                       {bairros.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                 </div>
                 <div className="max-h-[500px] overflow-y-auto custom-scrollbar divide-y divide-slate-50">
                    {filteredMktClients.map(c => (
                       <div key={c.id} className="py-4 flex justify-between items-center hover:bg-slate-50/50 px-4 rounded-2xl transition-all group">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-black text-xs uppercase">{c.nome.charAt(0)}</div>
                             <div><p className="font-black text-sm text-slate-800">{c.nome}</p><p className="text-[10px] text-slate-400 font-bold">📍 {c.bairro || 'Geral'}</p></div>
                          </div>
                          <button onClick={() => handleSendCampaign(c)} disabled={!mktMessage.trim()} className="px-6 py-3 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase rounded-2xl hover:bg-emerald-600 hover:text-white transition-all disabled:opacity-20 flex items-center gap-2"><i className="fab fa-whatsapp text-lg"></i> Disparar</button>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16 font-sans">
      <header className="bg-white border-b sticky top-0 z-40 shadow-sm backdrop-blur-lg bg-white/80">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 w-11 h-11 rounded-2xl text-white flex items-center justify-center font-black text-2xl shadow-xl shadow-blue-200">B</div>
            <div><h1 className="text-xl font-black text-slate-900 tracking-tight leading-none italic">BIO GÁS <span className="text-blue-600 not-italic">PRO</span></h1><p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">SISTEMA DE GESTÃO INTEGRADA</p></div>
          </div>
          <div className="flex gap-10">
            <div className="text-right"><p className="text-[9px] text-slate-400 font-black uppercase mb-1">Caixa Geral</p><p className="font-black text-lg text-slate-900 tracking-tighter">R$ {(resumo?.totalEntradas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
            <div className="text-right"><p className="text-[9px] text-rose-400 font-black uppercase mb-1">Fiado / Pendente</p><p className="font-black text-lg text-rose-600 tracking-tighter">R$ {(resumo?.totalAReceber || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></div>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-6 flex overflow-x-auto gap-1 border-t no-scrollbar">
          {[
            { id: 'vendas', label: 'Atendimento', icon: '⚡' },
            { id: 'cobranca', label: 'Cobrança', icon: '💸' },
            { id: 'caixa', label: 'Caixa', icon: '💰' },
            { id: 'marketing', label: 'Marketing', icon: '📢' },
            { id: 'entregadores', label: 'Equipe', icon: '🛵' },
            { id: 'estoque', label: 'Estoque', icon: '📦' },
            { id: 'clientes', label: 'CRM Inteligente', icon: '👥' },
          ].map(tab => {
            const hasAlert = tab.id === 'estoque' && produtosEstoqueBaixo.length > 0;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 transition-all relative ${activeTab === tab.id ? 'border-blue-600 text-blue-600 bg-blue-50/50 shadow-[inset_0_-2px_0_rgba(37,99,235,1)]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                <span className="text-xl filter drop-shadow-sm">{tab.icon}</span> {tab.label}
                {hasAlert && <span className="absolute top-3 right-3 w-5 h-5 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center animate-pulse border-2 border-white shadow-sm">{produtosEstoqueBaixo.length}</span>}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {message && (
          <div className={`mb-10 p-5 rounded-3xl flex justify-between items-center border-2 animate-in slide-in-from-top-6 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-rose-50 text-rose-800 border-rose-100'} shadow-sm`}>
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'} text-white text-lg`}><i className={`fas ${message.type === 'success' ? 'fa-check' : 'fa-triangle-exclamation'}`}></i></div>
              <span className="font-black text-xs uppercase tracking-widest">{message.text}</span>
            </div>
            <button onClick={() => setMessage(null)} className="text-2xl font-light hover:rotate-90 transition-transform">×</button>
          </div>
        )}
        
        {activeTab === 'vendas' && renderVendas()}
        {activeTab === 'marketing' && renderMarketing()}
        {activeTab === 'entregadores' && renderEntregadores()}
        {activeTab === 'estoque' && (
           <div className="space-y-8 animate-in fade-in">
              {produtosEstoqueBaixo.length > 0 && (
                <div className="bg-gradient-to-r from-rose-500 to-orange-500 p-8 rounded-[40px] text-white shadow-2xl animate-in slide-in-from-top-6">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center text-3xl animate-bounce"><i className="fas fa-triangle-exclamation"></i></div>
                    <div><h3 className="text-xl font-black uppercase tracking-tight">Estoque em Nível Crítico!</h3><p className="text-sm font-bold opacity-90">Reposição urgente necessária.</p></div>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl">
                 <div><h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">📦 Inventário & Preços</h2><p className="text-[10px] font-black text-slate-400 uppercase mt-1">Produtos ativos e estoque</p></div>
                 <button onClick={() => { setNovoProduto({ nome: '', preco: 0, precoCusto: 0, estoque: 0, unidadeMedida: 'unidade' }); setShowProdutoModal(true); }} className="bg-blue-600 text-white px-8 py-4 rounded-3xl font-black text-[11px] uppercase shadow-xl hover:bg-blue-700 transition">Adicionar Produto</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                 {produtos.map(p => {
                    const isLow = p.estoque < ESTOQUE_MINIMO;
                    return (
                      <div key={p.id} className={`bg-white p-8 rounded-[40px] border-2 transition-all relative overflow-hidden ${isLow ? 'border-rose-400 shadow-2xl' : 'border-slate-100 shadow-xl'}`}>
                         <div className="flex justify-between items-start mb-4">
                           <h4 className={`font-black text-xl uppercase tracking-tight ${isLow ? 'text-rose-600' : 'text-slate-800'}`}>{p.nome}</h4>
                           <button onClick={() => { setNovoProduto(p); setShowProdutoModal(true); }} className="text-slate-300 hover:text-blue-600 transition-colors"><i className="fas fa-edit text-lg"></i></button>
                         </div>
                         <div className="flex items-baseline gap-1 mb-1"><p className="text-4xl font-black text-slate-900 tracking-tighter">R$ {p.preco.toFixed(2)}</p><span className="text-[10px] font-black text-slate-400 uppercase">/ {p.unidadeMedida}</span></div>
                         <div className={`flex justify-between items-center p-4 rounded-2xl ${isLow ? 'bg-rose-50' : 'bg-slate-50'}`}><span className={`text-[10px] font-black uppercase px-4 py-2 rounded-xl ${isLow ? 'bg-rose-600 text-white' : 'bg-white text-slate-800 border'}`}>{p.estoque} unidades</span></div>
                      </div>
                    );
                 })}
              </div>
           </div>
        )}
        {activeTab === 'caixa' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-8">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[{l: 'Receitas', v: resumo?.totalEntradas || 0, c: 'text-emerald-600', i: 'fa-arrow-up-long'}, {l: 'Despesas', v: resumo?.totalSaidas || 0, c: 'text-rose-600', i: 'fa-arrow-down-long'}, {l: 'Fiado', v: resumo?.totalAReceber || 0, c: 'text-orange-500', i: 'fa-clock'}, {l: 'Saldo Real', v: resumo?.saldo || 0, c: 'text-slate-900', b: 'bg-blue-50 border-blue-100', i: 'fa-vault'}].map((s,i) => (
                  <div key={i} className={`p-8 bg-white rounded-[40px] border ${s.b || 'border-slate-100'} shadow-sm flex items-center gap-5`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${s.c.replace('text', 'bg').replace('-600', '-50')} ${s.c}`}><i className={`fas ${s.i}`}></i></div>
                    <div><p className="text-[9px] font-black text-slate-400 uppercase mb-1">{s.l}</p><p className={`text-2xl font-black ${s.c}`}>R$ {s.v.toFixed(2)}</p></div>
                  </div>
                ))}
             </div>
             <div className="bg-white rounded-[40px] shadow-xl border border-slate-100 overflow-hidden">
                <div className="p-8 border-b flex justify-between items-center bg-slate-50/30">
                  <h3 className="font-black text-slate-800 uppercase text-[10px]">Extrato de Operações</h3>
                  <div className="flex gap-3">
                    <button onClick={() => setShowReportModal(true)} className="bg-blue-50 text-blue-600 px-5 py-3 rounded-2xl font-black text-[10px] uppercase border border-blue-100">📊 Relatório Mensal</button>
                    <button onClick={() => { setFinanceType('Entrada'); setShowFinanceModal(true); }} className="bg-emerald-500 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg">+ Receita</button>
                    <button onClick={() => { setFinanceType('Saída'); setShowFinanceModal(true); }} className="bg-rose-500 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg">- Despesa</button>
                  </div>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr>{['Data', 'Tipo', 'Descrição', 'Valor', 'Observações'].map(h => <th key={h} className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(resumo?.recentes || []).map(m => (
                      <tr key={m.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-8 py-6 text-[10px] font-black text-slate-400">{m.dataHora}</td>
                        <td className="px-8 py-6"><span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter ${m.tipo === 'Entrada' ? 'bg-emerald-100 text-emerald-700' : m.tipo === 'Saída' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>{m.tipo}</span></td>
                        <td className="px-8 py-6 text-sm font-black text-slate-800">{m.descricao}</td>
                        <td className={`px-8 py-6 font-black text-base ${m.tipo === 'Saída' ? 'text-rose-600' : 'text-slate-900'}`}>R$ {m.valor.toFixed(2)}</td>
                        <td className="px-8 py-6 text-[10px] font-medium text-slate-400 italic">{m.detalhe || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}
        {activeTab === 'cobranca' && (
           <div className="space-y-8 animate-in fade-in">
              <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden">
                 <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center"><h3 className="font-black text-slate-800 uppercase text-xs">Gestão de Recebíveis (Fiado)</h3></div>
                 <table className="w-full text-left">
                    <thead>
                       <tr className="bg-slate-50/80 border-b">
                         {['Data', 'Cliente', 'Valor', 'Ações'].map(h => <th key={h} className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase">{h}</th>)}
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {resumo?.recentes.filter(m => m.tipo === 'A Receber').map(m => (
                          <tr key={m.id} className="hover:bg-slate-50/30 transition-colors">
                             <td className="px-8 py-6 text-[10px] font-black text-slate-400">{m.dataHora}</td>
                             <td className="px-8 py-6 text-sm font-black text-slate-800">{m.descricao.replace("Venda Finalizada: ", "")}</td>
                             <td className="px-8 py-6 font-black text-rose-600">R$ {m.valor.toFixed(2)}</td>
                             <td className="px-8 py-6 flex gap-3">
                                <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent('Olá, lembramos da pendência de R$ ' + m.valor.toFixed(2))}`, '_blank')} className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center hover:bg-emerald-500 hover:text-white transition-all shadow-sm"><i className="fab fa-whatsapp"></i></button>
                                <button onClick={() => handleLiquidarDivida(m.id)} disabled={processingId === m.id} className="px-6 py-2 bg-blue-600 text-white text-[10px] font-black rounded-xl uppercase hover:bg-blue-700 transition">Liquidar</button>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        )}
        {activeTab === 'clientes' && (
          <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in">
            <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-[0.3em]">Banco de Dados CRM</h3>
              <div className="flex gap-3 items-center">
                <input type="file" className="hidden" ref={fileInputRef} accept=".xlsx, .xls, .csv" onChange={handleImportExcel} />
                <button onClick={() => fileInputRef.current?.click()} className="px-6 py-4 bg-white border-2 border-slate-100 rounded-[20px] font-black text-[10px] uppercase text-slate-500 hover:bg-slate-50 transition flex items-center gap-2 shadow-sm"><i className="fas fa-file-import text-blue-600"></i> Importar Excel/CSV</button>
                <div className="relative"><i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i><input className="pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-[20px] font-bold text-sm shadow-sm w-80" placeholder="Filtrar por nome..." value={searchTermCRM} onChange={e => setSearchTermCRM(e.target.value)} /></div>
              </div>
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 border-b">
                <tr>{['Consumidor', 'WhatsApp', 'Endereço', 'Bairro'].map(h => <th key={h} className="px-10 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientes.filter(c => c.nome.toLowerCase().includes(searchTermCRM.toLowerCase())).map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-10 py-6 text-sm font-black text-slate-800 uppercase tracking-tight">{c.nome}</td>
                    <td className="px-10 py-6 text-xs font-bold text-blue-600">{c.telefone}</td>
                    <td className="px-10 py-6 text-xs font-medium text-slate-500">📍 {c.endereco}</td>
                    <td className="px-10 py-6 text-xs font-black text-slate-400 uppercase">{c.bairro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* MODAL ENTREGADOR */}
      {showEntregadorModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6 animate-in zoom-in-95">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden">
            <div className="p-6 bg-blue-600 text-white flex justify-between items-center"><h3 className="font-black text-xs uppercase tracking-widest">{novoEntregador.id ? 'Editar' : 'Novo'} Entregador</h3><button onClick={() => setShowEntregadorModal(false)} className="text-2xl">&times;</button></div>
            <form onSubmit={handleSaveEntregador} className="p-8 space-y-5">
              <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">Nome</p><input required className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold" value={novoEntregador.nome} onChange={e => setNovoEntregador({...novoEntregador, nome: e.target.value})} /></div>
              <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">WhatsApp</p><input required className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold" value={novoEntregador.telefone} onChange={e => setNovoEntregador({...novoEntregador, telefone: e.target.value})} /></div>
              <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">Veículo</p><input required className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold" value={novoEntregador.veiculo} onChange={e => setNovoEntregador({...novoEntregador, veiculo: e.target.value})} /></div>
              <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">Status</p>
                <select className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold" value={novoEntregador.status} onChange={e => setNovoEntregador({...novoEntregador, status: e.target.value as any})}>
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                </select>
              </div>
              <button className="w-full py-5 bg-blue-600 text-white font-black rounded-3xl uppercase text-[11px] shadow-xl">Salvar Colaborador</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL FINANCEIRO */}
      {showFinanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden">
            <div className={`p-6 ${financeType === 'Entrada' ? 'bg-emerald-600' : 'bg-rose-600'} text-white flex justify-between items-center`}><h3 className="font-black text-xs uppercase tracking-widest">Lançamento de {financeType}</h3><button onClick={() => setShowFinanceModal(false)} className="text-2xl">&times;</button></div>
            <form onSubmit={handleSaveManualFinance} className="p-8 space-y-5">
              <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">Descrição</p><input required className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold" value={manualFinance.descricao} onChange={e => setManualFinance({...manualFinance, descricao: e.target.value})} /></div>
              <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase ml-2 mb-1">Valor (R$)</p><input required type="number" step="0.01" className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold" value={manualFinance.valor} onChange={e => setManualFinance({...manualFinance, valor: e.target.value})} /></div>
              <button className={`w-full py-5 ${financeType === 'Entrada' ? 'bg-emerald-600' : 'bg-rose-600'} text-white font-black rounded-3xl uppercase text-[11px]`}>Confirmar</button>
            </form>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-xl flex items-center justify-center z-[300] animate-in fade-in">
          <div className="flex flex-col items-center gap-8"><div className="relative w-24 h-24"><div className="absolute inset-0 border-8 border-blue-600/10 rounded-full animate-pulse"></div><div className="absolute inset-0 border-8 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div><p className="text-[12px] font-black text-blue-600 uppercase tracking-[0.4em] animate-pulse">Processando Operação</p></div>
        </div>
      )}
    </div>
  );
};

export default App;
