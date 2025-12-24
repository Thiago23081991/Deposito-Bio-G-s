
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { gasService } from './services/gasMock.ts';
import { Cliente, Produto, Entregador, Pedido, PaymentMethod, ResumoFinanceiro, PedidoItem, Movimentacao, ChatMessage } from './types.ts';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const App: React.FC = () => {
  // --- ESTADO GLOBAL ---
  const [activeTab, setActiveTab] = useState<'vendas' | 'caixa' | 'clientes' | 'ai'>('vendas');
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // --- DADOS ---
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);

  // --- FILTROS & BUSCAS ---
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [searchTermCRM, setSearchTermCRM] = useState('');
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // --- FORMULÁRIO DE ATENDIMENTO ---
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

  // --- CARREGAMENTO DE DADOS ---
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

  // --- LOGICA DE ATENDIMENTO ---
  const nameSuggestions = useMemo(() => {
    const term = nomeBusca.toLowerCase().trim();
    if (!term || term.length < 2) return [];
    return clientes.filter(c => c.nome.toLowerCase().includes(term) || c.telefone.includes(term)).slice(0, 5);
  }, [clientes, nomeBusca]);

  const selectClient = (c: Cliente) => {
    setNomeBusca(c.nome);
    setTelBusca(c.telefone);
    setEndBusca(c.endereco);
    setShowSuggestions(false);
  };

  const addToCart = (p: Produto) => {
    setCart(prev => {
      const exists = prev.find(i => i.produtoId === p.id);
      if (exists) return prev.map(i => i.produtoId === p.id ? { ...i, qtd: i.qtd + 1 } : i);
      return [...prev, { produtoId: p.id, nome: p.nome, qtd: 1, precoUnitario: p.preco }];
    });
  };

  // --- AÇÕES DO MONITOR ---
  const handleBaixaManual = async (pedido: Pedido) => {
    if (!window.confirm(`Confirmar recebimento de R$ ${Number(pedido.valorTotal).toFixed(2)}?`)) return;
    setProcessingId(pedido.id);
    try {
      const res = await gasService.atualizarStatusPedido(pedido.id, 'Entregue');
      if (res.success) {
        setMessage({ type: 'success', text: 'Baixa efetuada! Valor creditado no caixa.' });
        await loadData(true);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao processar baixa.' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleEnviarRota = async (pedido: Pedido) => {
    const ent = entregadores.find(e => e.nome === pedido.entregador);
    if (!ent) return setMessage({ type: 'error', text: 'Selecione um entregador primeiro.' });

    setProcessingId(pedido.id);
    try {
      await gasService.atualizarStatusPedido(pedido.id, 'Em Rota');
      const msg = encodeURIComponent(`🚚 *NOVA ROTA - BIO GÁS*\n\n📍 *Endereço:* ${pedido.endereco}\n👤 *Cliente:* ${pedido.nomeCliente}\n💰 *Total:* R$ ${Number(pedido.valorTotal).toFixed(2)}\n💳 *Pgto:* ${pedido.formaPagamento}`);
      window.open(`https://wa.me/55${ent.telefone.replace(/\D/g, '')}?text=${msg}`, '_blank');
      await loadData(true);
      setMessage({ type: 'success', text: 'Rota enviada com sucesso!' });
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao atualizar rota.' });
    } finally {
      setProcessingId(null);
    }
  };

  // --- RENDERIZADORES ---
  const renderVendas = () => {
    const cartTotal = cart.reduce((acc, i) => acc + (i.qtd * i.precoUnitario), 0);
    const filteredPedidos = pedidos.filter(p => filterStatus === 'Todos' || p.status === filterStatus);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
        <div className="lg:col-span-2 space-y-6">
          {/* Atendimento Card */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-slate-800">
              <i className="fas fa-headset text-blue-600"></i> Atendimento Rápido
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
              <div className="md:col-span-2 relative">
                <input 
                  className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold" 
                  placeholder="Nome do Cliente..." value={nomeBusca} onChange={e => {setNomeBusca(e.target.value); setShowSuggestions(true);}}
                />
                {showSuggestions && nameSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white shadow-2xl rounded-2xl border z-50 mt-2 overflow-hidden">
                    {nameSuggestions.map(c => (
                      <button key={c.id} onClick={() => selectClient(c)} className="w-full p-4 text-left hover:bg-blue-50 border-b last:border-0">
                        <p className="font-bold text-slate-800">{c.nome}</p>
                        <p className="text-xs text-slate-400">{c.telefone} | {c.endereco}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input className="px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold" placeholder="WhatsApp" value={telBusca} onChange={e => setTelBusca(e.target.value)} />
              <input className="px-5 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 font-bold" placeholder="Endereço Completo" value={endBusca} onChange={e => setEndBusca(e.target.value)} />
            </div>
            
            <div className="mt-6 flex flex-wrap gap-3">
              {produtos.map(p => (
                <button key={p.id} onClick={() => addToCart(p)} className="px-5 py-3 bg-white border-2 border-slate-100 rounded-2xl hover:border-blue-500 hover:text-blue-600 transition-all font-bold text-sm">
                  + {p.nome} (R$ {p.preco})
                </button>
              ))}
            </div>
          </div>

          {/* Monitor de Pedidos */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50/50 border-b flex justify-between items-center">
              <h3 className="font-black text-slate-800">📦 Monitor de Pedidos</h3>
              <div className="flex bg-white p-1 rounded-xl border">
                {['Todos', 'Pendente', 'Em Rota', 'Entregue'].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${filterStatus === s ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{s}</button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto custom-scrollbar">
              {filteredPedidos.length === 0 ? (
                <div className="p-12 text-center text-slate-300 font-bold italic">Nenhum pedido nesta categoria</div>
              ) : filteredPedidos.map(p => (
                <div key={p.id} className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${p.status === 'Em Rota' ? 'bg-orange-100 text-orange-600 animate-pulse' : p.status === 'Entregue' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                      <i className={`fas ${p.status === 'Em Rota' ? 'fa-truck-fast' : p.status === 'Entregue' ? 'fa-check-double' : 'fa-clock'}`}></i>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 leading-tight">{p.nomeCliente}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.dataHora} • {p.entregador}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                    <div className="text-right">
                      <p className="font-black text-blue-600 text-sm">R$ {Number(p.valorTotal).toFixed(2)}</p>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase ${p.status === 'Entregue' ? 'bg-emerald-100 text-emerald-700' : p.status === 'Em Rota' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-600'}`}>{p.status}</span>
                    </div>
                    
                    {p.status === 'Pendente' && (
                      <button onClick={() => handleEnviarRota(p)} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition shadow-sm"><i className="fab fa-whatsapp text-lg"></i></button>
                    )}
                    
                    {p.status === 'Em Rota' && (
                      <button onClick={() => handleBaixaManual(p)} className="px-4 py-3 bg-blue-600 text-white text-[10px] font-black rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all uppercase tracking-widest">Baixar Manual</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Checkout Sidebar */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-blue-50 sticky top-24">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2"><i className="fas fa-shopping-cart text-blue-600"></i> Checkout</h3>
            {cart.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 text-xs font-bold uppercase tracking-widest">Carrinho Vazio</div>
            ) : (
              <div className="space-y-4">
                {cart.map(i => (
                  <div key={i.produtoId} className="flex justify-between items-center text-sm font-bold">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCart(prev => prev.map(item => item.produtoId === i.produtoId ? {...item, qtd: Math.max(0, item.qtd-1)} : item).filter(item => item.qtd > 0))} className="w-6 h-6 bg-slate-100 rounded-lg">-</button>
                      <span>{i.qtd}x {i.nome}</span>
                      <button onClick={() => setCart(prev => prev.map(item => item.produtoId === i.produtoId ? {...item, qtd: item.qtd+1} : item))} className="w-6 h-6 bg-slate-100 rounded-lg">+</button>
                    </div>
                    <span className="text-slate-800">R$ {(i.qtd * i.precoUnitario).toFixed(2)}</span>
                  </div>
                ))}
                <div className="pt-4 border-t-2 border-dashed flex justify-between items-center">
                  <span className="font-black text-slate-400 text-[10px] uppercase">Total</span>
                  <span className="font-black text-2xl text-blue-600">R$ {cartTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="mt-6 space-y-4">
              <select className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" value={selectedEnt} onChange={e => setSelectedEnt(e.target.value)}>
                <option value="">Selecione Entregador...</option>
                {entregadores.map(e => <option key={e.id} value={e.nome}>{e.nome}</option>)}
              </select>
              <select className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" value={formaPgto} onChange={e => setFormaPgto(e.target.value)}>
                {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button 
                onClick={async () => {
                  if(!nomeBusca || cart.length === 0) return;
                  setLoading(true);
                  try {
                    const res = await gasService.salvarPedido({ nomeCliente: nomeBusca, telefoneCliente: telBusca, endereco: endBusca, itens: cart, valorTotal: cartTotal, entregador: selectedEnt || 'Logística', formaPagamento: formaPgto });
                    if (res.success) {
                      setCart([]); setNomeBusca(''); setTelBusca(''); setEndBusca(''); await loadData(true);
                      setMessage({ type: 'success', text: 'Pedido registrado!' });
                    }
                  } finally { setLoading(false); }
                }}
                disabled={cart.length === 0 || !nomeBusca}
                className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 disabled:opacity-50 transition-all uppercase tracking-widest text-xs"
              >Salvar Pedido</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFinanceiro = () => (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          {l: 'Entradas', v: resumo?.totalEntradas || 0, c: 'text-emerald-600', i: 'fa-arrow-up'},
          {l: 'Saídas', v: resumo?.totalSaidas || 0, c: 'text-rose-600', i: 'fa-arrow-down'},
          {l: 'A Receber', v: resumo?.totalAReceber || 0, c: 'text-orange-600', i: 'fa-hand-holding-dollar'},
          {l: 'Saldo Atual', v: resumo?.saldo || 0, c: 'text-slate-800', b: 'bg-blue-50 border-blue-100', i: 'fa-wallet'}
        ].map((s,i) => (
          <div key={i} className={`p-6 bg-white rounded-3xl border ${s.b || 'border-slate-100'} shadow-sm flex items-center gap-4`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${s.c.replace('text', 'bg').replace('-600', '-50')} ${s.c}`}>
              <i className={`fas ${s.i}`}></i>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.l}</p>
              <p className={`text-xl font-black ${s.c}`}>R$ {s.v.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b">
            <tr>{['Data', 'Tipo', 'Descrição', 'Valor'].map(h => <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(resumo?.recentes || []).map(m => (
              <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-xs font-bold text-slate-400">{m.dataHora}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${m.tipo === 'Entrada' ? 'bg-emerald-100 text-emerald-700' : m.tipo === 'Saída' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>{m.tipo}</span>
                </td>
                <td className="px-6 py-4 text-sm font-bold text-slate-800">{m.descricao}</td>
                <td className={`px-6 py-4 font-black ${m.tipo === 'Saída' ? 'text-rose-600' : 'text-slate-800'}`}>R$ {m.valor.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16 font-sans">
      <header className="bg-white border-b sticky top-0 z-40 shadow-sm backdrop-blur-md bg-white/90">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 w-10 h-10 rounded-xl text-white flex items-center justify-center font-black text-xl shadow-lg shadow-blue-200">B</div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight italic">BIO GÁS <span className="text-blue-600 not-italic">PRO DASH</span></h1>
          </div>
          <div className="flex gap-8">
            <div className="text-right"><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Caixa Hoje</p><p className="font-black text-blue-600 text-lg">R$ {(resumo?.totalEntradas || 0).toFixed(2)}</p></div>
            <div className="text-right"><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">A Receber</p><p className="font-black text-orange-600 text-lg">R$ {(resumo?.totalAReceber || 0).toFixed(2)}</p></div>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-6 flex overflow-x-auto gap-1 border-t scrollbar-hide">
          {[
            { id: 'vendas', label: 'Painel Vendas', icon: '⚡' },
            { id: 'caixa', label: 'Financeiro', icon: '💰' },
            { id: 'clientes', label: 'CRM Clientes', icon: '👥' },
            { id: 'ai', label: 'Analista AI', icon: '🤖' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-5 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              <span className="text-lg">{tab.icon}</span> {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {message && (
          <div className={`mb-8 p-4 rounded-2xl flex justify-between items-center animate-in slide-in-from-top-4 duration-300 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
            <span className="font-bold text-sm">{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-xl">×</button>
          </div>
        )}
        
        {activeTab === 'vendas' && renderVendas()}
        {activeTab === 'caixa' && renderFinanceiro()}
        {activeTab === 'clientes' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in duration-500">
            <div className="p-6 border-b flex justify-between items-center gap-4">
              <h3 className="font-black text-slate-800">👥 Base de Clientes</h3>
              <input 
                className="max-w-xs px-4 py-2 bg-slate-50 border-none rounded-xl font-bold text-sm" 
                placeholder="Buscar cliente..." value={searchTermCRM} onChange={e => setSearchTermCRM(e.target.value)} 
              />
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b">
                <tr>{['Nome', 'Telefone', 'Endereço', 'Cadastro'].map(h => <th key={h} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {clientes.filter(c => c.nome.toLowerCase().includes(searchTermCRM.toLowerCase())).map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-bold text-slate-800">{c.nome}</td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-500">{c.telefone}</td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-400">{c.endereco}</td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-400">{c.dataCadastro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === 'ai' && (
           <div className="max-w-3xl mx-auto h-[600px] bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30 custom-scrollbar">
                {aiChat.map((m,i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 rounded-2xl text-sm font-medium shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>{m.text}</div>
                  </div>
                ))}
                {aiLoading && <div className="flex justify-start"><div className="bg-white p-3 rounded-2xl flex gap-1"><div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce delay-100"></div><div className="w-2 h-2 bg-blue-300 rounded-full animate-bounce delay-200"></div></div></div>}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                if(!aiInput.trim()) return;
                const m = aiInput; setAiInput(''); setAiChat(p => [...p, {role: 'user', text: m}]); setAiLoading(true);
                try {
                  const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
                  const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: m, config: { systemInstruction: "Você é o analista virtual da Bio Gás PRO. Seja curto, direto e use dados de vendas se fornecidos." } });
                  setAiChat(p => [...p, {role: 'model', text: res.text || 'Erro.'}]);
                } catch { setAiChat(p => [...p, {role: 'model', text: 'Sem conexão com a IA.'}]); } finally { setAiLoading(false); }
              }} className="p-4 bg-white border-t flex gap-3">
                <input className="flex-1 px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm" placeholder="Analise meus dados..." value={aiInput} onChange={e => setAiInput(e.target.value)} />
                <button className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition shadow-lg">Analista</button>
              </form>
           </div>
        )}
      </main>

      {loading && (
        <div className="fixed inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-[110] animate-in fade-in">
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin shadow-xl"></div>
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest animate-pulse">Sincronizando Sistema...</p>
          </div>
        </div>
      )}

      {processingId && (
        <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-[2px] z-[120] flex items-center justify-center pointer-events-none">
           <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-100 animate-bounce">
              <p className="text-[10px] font-black text-slate-800 uppercase">Processando Transação...</p>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
