
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { gasService } from './services/gasMock.ts';
import { Cliente, Produto, Entregador, Pedido, PaymentMethod, ResumoFinanceiro, PedidoItem, Movimentacao } from './types.ts';

const App: React.FC = () => {
  // Estados de Dados
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);

  // Navegação
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clientes' | 'equipe' | 'caixa' | 'estoque' | 'cobranca'>('dashboard');

  // Filtros Financeiros
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Estados de Pedido
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cart, setCart] = useState<PedidoItem[]>([]);
  const [selectedEntregador, setSelectedEntregador] = useState<string>('');
  const [formaPagamento, setFormaPagamento] = useState<string>(PaymentMethod.DINHEIRO);
  const [selectedProduto, setSelectedProduto] = useState<string>('');
  const [quantidade, setQuantidade] = useState<number>(1);
  
  // Modais
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false);
  const [isBaixaModalOpen, setIsBaixaModalOpen] = useState<{ open: boolean, mov: Movimentacao | null }>({ open: false, mov: null });
  const [metodoBaixa, setMetodoBaixa] = useState<string>(PaymentMethod.PIX);

  const [finEntry, setFinEntry] = useState<{
    tipo: 'Entrada' | 'Saída' | 'A Receber',
    descricao: string,
    valor: string,
    categoria: string,
    metodo: string,
    dataHora: string
  }>({
    tipo: 'Saída',
    descricao: '',
    valor: '',
    categoria: 'Outros',
    metodo: PaymentMethod.DINHEIRO,
    dataHora: new Date().toISOString().split('T')[0]
  });

  const [prodEdit, setProdEdit] = useState<Partial<Produto> | null>(null);
  const [entEdit, setEntEdit] = useState<Partial<Entregador> | null>(null);
  const [cliEdit, setCliEdit] = useState<Partial<Cliente> | null>(null);
  
  const [estoqueQuickInput, setEstoqueQuickInput] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const categoriasReceita = ['Venda Direta', 'Venda Avulsa', 'Recebimento de Dívida', 'Aporte de Capital', 'Outros'];
  const categoriasDespesa = ['Salário', 'Aluguel', 'Marketing', 'Combustível', 'Manutenção', 'Compra de Estoque', 'Energia/Água', 'Retirada Sócio', 'Outros'];
  const categoriasAReceber = ['Venda Fiada', 'Convênio', 'Promissória'];

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
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
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Inteligência de Filtro Auditável
  const auditData = useMemo(() => {
    if (!resumo) return { filtered: [], stats: { ent: 0, sai: 0, arec: 0 } };
    const start = new Date(startDate); start.setHours(0,0,0,0);
    const end = new Date(endDate); end.setHours(23,59,59,999);

    const filtered = resumo.recentes.filter(m => {
      let d: Date;
      if (m.dataHora.includes('/')) {
        const [day, month, year] = m.dataHora.split(' ')[0].split('/');
        d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      } else { d = new Date(m.dataHora); }
      return d >= start && d <= end;
    });

    const stats = filtered.reduce((acc, m) => {
      if (m.tipo === 'Entrada') acc.ent += m.valor;
      if (m.tipo === 'Saída') acc.sai += m.valor;
      if (m.tipo === 'A Receber') acc.arec += m.valor;
      return acc;
    }, { ent: 0, sai: 0, arec: 0 });

    return { filtered, stats };
  }, [resumo, startDate, endDate]);

  const handleQuickEstoqueAdjust = async (product: Produto) => {
    const newVal = estoqueQuickInput[product.id];
    if (!newVal || isNaN(parseInt(newVal))) return;
    setLoading(true);
    const updatedProduct = { ...product, estoque: parseInt(newVal) };
    const res = await gasService.salvarProduto(updatedProduct);
    if (res.success) {
      setMessage({ type: 'success', text: `Estoque de ${product.nome} atualizado!` });
      setEstoqueQuickInput(prev => ({ ...prev, [product.id]: '' }));
      loadData();
    }
    setLoading(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSaveFinance = async () => {
    if (!finEntry.valor || parseFloat(finEntry.valor) <= 0) return;
    setLoading(true);
    const res = await gasService.registrarMovimentacao({ ...finEntry, valor: parseFloat(finEntry.valor) });
    if (res.success) {
      setMessage({ type: 'success', text: 'Lançamento efetivado!' });
      setIsFinanceModalOpen(false);
      loadData();
    }
    setLoading(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleConfirmBaixa = async () => {
    if (!isBaixaModalOpen.mov) return;
    setLoading(true);
    const res = await gasService.baixarPagamento(isBaixaModalOpen.mov.id, metodoBaixa);
    if (res.success) {
      setMessage({ type: 'success', text: 'Pagamento liquidado no caixa!' });
      setIsBaixaModalOpen({ open: false, mov: null });
      loadData();
    }
    setLoading(false);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCreateOrder = async () => {
    if (!telefone || cart.length === 0 || !selectedEntregador) return;
    setLoading(true);
    const total = cart.reduce((acc, it) => acc + (it.qtd * it.precoUnitario), 0);
    const res = await gasService.salvarPedido({ nomeCliente: nome, telefoneCliente: telefone, endereco, itens: cart, valorTotal: total, entregador: selectedEntregador, formaPagamento });
    if (res.success) {
      setTelefone(''); setNome(''); setEndereco(''); setCart([]);
      setMessage({ type: 'success', text: 'Pedido registrado!' });
      loadData();
    }
    setLoading(false);
    setTimeout(() => setMessage(null), 4000);
  };

  return (
    <div className="flex h-screen overflow-hidden text-slate-900 bg-[#F4F7FE]">
      {/* SIDEBAR */}
      <aside className="w-80 bg-[#002B5B] flex flex-col shrink-0 z-50 shadow-2xl">
        <div className="p-10 flex flex-col h-full">
          <div className="flex items-center gap-4 mb-14">
            <div className="bg-[#FFD700] w-14 h-14 rounded-2xl flex items-center justify-center text-[#002B5B] shadow-lg rotate-3"><i className="fas fa-gas-pump text-2xl"></i></div>
            <div className="flex flex-col">
              <span className="font-black text-2xl text-white tracking-tighter leading-none">BIO GÁS</span>
              <span className="text-[10px] font-black text-[#FFD700] uppercase tracking-widest mt-1">Gestão Pro</span>
            </div>
          </div>
          <nav className="space-y-3 flex-1">
            {[
              { id: 'dashboard', icon: 'fa-shopping-cart', label: 'Vendas' },
              { id: 'caixa', icon: 'fa-chart-line', label: 'Financeiro' },
              { id: 'cobranca', icon: 'fa-hand-holding-dollar', label: 'Cobrança' },
              { id: 'clientes', icon: 'fa-users', label: 'Clientes' },
              { id: 'equipe', icon: 'fa-motorcycle', label: 'Equipe' },
              { id: 'estoque', icon: 'fa-boxes-stacked', label: 'Estoque' },
            ].map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`w-full flex items-center gap-4 px-6 py-5 rounded-2xl font-black text-sm transition-all ${activeTab === item.id ? 'bg-[#FFD700] text-[#002B5B] shadow-xl' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                <i className={`fas ${item.icon} text-lg`}></i> {item.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col relative bg-[#F8FAFC]">
        <header className="h-24 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-12 sticky top-0 z-40">
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
            <div className="w-2 h-8 bg-[#002B5B] rounded-full"></div>
            {activeTab}
          </h1>
          <button onClick={() => setIsFinanceModalOpen(true)} className="bg-[#002B5B] text-[#FFD700] px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-xl hover:scale-105 transition-all">Novo Lançamento</button>
        </header>

        <div className="p-12 max-w-7xl mx-auto w-full">
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-2 bg-white rounded-[3rem] p-12 shadow-sm border border-slate-100">
                <h2 className="text-xs font-black text-slate-300 uppercase tracking-widest mb-10">Novo Atendimento</h2>
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <input type="tel" value={telefone} onChange={e => setTelefone(e.target.value)} onBlur={() => {
                    const c = clientes.find(x => x.telefone.includes(telefone));
                    if (c) { setNome(c.nome); setEndereco(c.endereco); }
                  }} placeholder="WhatsApp" className="bg-slate-50 py-5 px-8 rounded-3xl font-black text-lg outline-none border-2 border-transparent focus:border-[#002B5B]" />
                  <input type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do Cliente" className="bg-slate-50 py-5 px-8 rounded-3xl font-black text-lg outline-none border-2 border-transparent focus:border-[#002B5B]" />
                </div>
                <textarea value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Endereço de Entrega" className="w-full bg-slate-50 py-6 px-8 rounded-[2rem] font-bold h-32 outline-none resize-none mb-8" />
                
                <div className="p-8 bg-slate-50 rounded-[2.5rem] mb-10 border border-slate-100">
                  <div className="flex gap-4 mb-6">
                    <select onChange={e => {
                      const p = produtos.find(x => x.nome === e.target.value);
                      if (p) setCart([...cart, { produtoId: p.id, nome: p.nome, qtd: 1, precoUnitario: p.preco }]);
                    }} className="flex-1 bg-white py-5 px-8 rounded-2xl font-black outline-none shadow-sm">
                      <option value="">Selecione o Produto...</option>
                      {produtos.map(p => <option key={p.id} value={p.nome}>{p.nome} - R$ {p.preco.toFixed(2)}</option>)}
                    </select>
                  </div>
                  {cart.map((it, idx) => (
                    <div key={idx} className="bg-white p-5 rounded-2xl flex justify-between items-center mb-3 shadow-sm border border-slate-50">
                      <span className="font-black text-slate-600">{it.qtd}x {it.nome}</span>
                      <button onClick={() => setCart(cart.filter((_, i) => i !== idx))} className="text-rose-400"><i className="fas fa-trash"></i></button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-8 mb-12">
                   <select value={selectedEntregador} onChange={e => setSelectedEntregador(e.target.value)} className="bg-slate-50 py-5 px-8 rounded-3xl font-black outline-none">
                      <option value="">Entregador...</option>
                      {entregadores.filter(e => e.status === 'Ativo').map(e => <option key={e.id} value={e.nome}>{e.nome}</option>)}
                   </select>
                   <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className="bg-slate-50 py-5 px-8 rounded-3xl font-black outline-none">
                      {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                   </select>
                </div>
                <button onClick={handleCreateOrder} className="w-full bg-[#002B5B] text-white py-8 rounded-[2.5rem] font-black uppercase text-sm shadow-2xl hover:scale-[1.01] transition-all">Despachar Pedido</button>
              </div>

              <div className="space-y-8">
                 <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-6">Em Andamento</h3>
                 {pedidos.filter(p => p.status === 'Pendente' || p.status === 'Em Rota').map(p => (
                   <div key={p.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all">
                      <div className={`absolute left-0 top-0 w-2 h-full ${p.status === 'Pendente' ? 'bg-orange-400' : 'bg-blue-500'}`}></div>
                      <div className="flex justify-between mb-6">
                        <span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase ${p.status === 'Pendente' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>{p.status}</span>
                        <div className="flex gap-2">
                           <button onClick={() => gasService.atualizarStatusPedido(p.id, 'Entregue').then(loadData)} className="w-10 h-10 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center"><i className="fas fa-check"></i></button>
                        </div>
                      </div>
                      <div className="font-black text-slate-800 text-lg mb-1">{p.nomeCliente}</div>
                      <div className="text-xs text-slate-400 font-bold mb-6 truncate">{p.endereco}</div>
                      <div className="text-2xl font-black text-[#002B5B]">R$ {Number(p.valorTotal).toFixed(2)}</div>
                   </div>
                 ))}
              </div>
            </div>
          )}

          {activeTab === 'caixa' && (
            <div className="space-y-12 animate-in fade-in duration-500">
               {/* Filtros */}
               <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col md:flex-row items-end gap-10">
                  <div className="flex-1 grid grid-cols-2 gap-8 w-full">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Data Inicial</label>
                       <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-50 py-5 px-8 rounded-3xl font-black outline-none border-2 border-transparent focus:border-[#002B5B]" />
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Data Final</label>
                       <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-slate-50 py-5 px-8 rounded-3xl font-black outline-none border-2 border-transparent focus:border-[#002B5B]" />
                    </div>
                  </div>
                  <button onClick={() => { const now = new Date().toISOString().split('T')[0]; setStartDate(now); setEndDate(now); }} className="px-10 py-5 bg-[#002B5B] text-white rounded-[2rem] font-black uppercase text-xs tracking-widest">Hoje</button>
               </div>

               {/* Cards */}
               <div className="grid grid-cols-4 gap-10">
                  <div className="bg-emerald-600 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
                     <div className="text-[10px] font-black uppercase opacity-60 mb-2">Entradas</div>
                     <div className="text-5xl font-black">R$ {auditData.stats.ent.toFixed(2)}</div>
                     <i className="fas fa-arrow-up absolute -right-6 -bottom-6 text-[10rem] opacity-10"></i>
                  </div>
                  <div className="bg-rose-600 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
                     <div className="text-[10px] font-black uppercase opacity-60 mb-2">Saídas</div>
                     <div className="text-5xl font-black">R$ {auditData.stats.sai.toFixed(2)}</div>
                     <i className="fas fa-arrow-down absolute -right-6 -bottom-6 text-[10rem] opacity-10"></i>
                  </div>
                  <div className="bg-amber-500 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
                     <div className="text-[10px] font-black uppercase opacity-60 mb-2">A Receber</div>
                     <div className="text-5xl font-black">R$ {auditData.stats.arec.toFixed(2)}</div>
                     <i className="fas fa-clock absolute -right-6 -bottom-6 text-[10rem] opacity-10"></i>
                  </div>
                  <div className="bg-[#002B5B] p-10 rounded-[3.5rem] text-[#FFD700] shadow-2xl relative overflow-hidden border-4 border-[#FFD700]/20">
                     <div className="text-[10px] font-black uppercase opacity-60 mb-2">Saldo Real</div>
                     <div className="text-5xl font-black">R$ {(auditData.stats.ent - auditData.stats.sai).toFixed(2)}</div>
                     <i className="fas fa-vault absolute -right-6 -bottom-6 text-[10rem] opacity-5"></i>
                  </div>
               </div>

               {/* Extrato */}
               <div className="bg-white rounded-[4rem] p-12 shadow-sm border border-slate-100">
                  <h3 className="text-2xl font-black text-slate-800 uppercase mb-10">Extrato de Auditoria</h3>
                  <div className="space-y-6">
                    {auditData.filtered.map(m => (
                      <div key={m.id} className="flex items-center justify-between p-8 bg-slate-50/50 rounded-[2.5rem] hover:bg-white hover:shadow-xl transition-all border border-transparent hover:border-slate-100">
                        <div className="flex items-center gap-6">
                           <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl ${m.tipo === 'Entrada' ? 'bg-emerald-100 text-emerald-600' : m.tipo === 'Saída' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                              <i className={`fas ${m.tipo === 'Entrada' ? 'fa-plus' : m.tipo === 'Saída' ? 'fa-minus' : 'fa-clock'}`}></i>
                           </div>
                           <div>
                              <div className="font-black text-xl text-slate-800">{m.descricao}</div>
                              <div className="text-[10px] font-black text-slate-400 uppercase mt-1">{m.dataHora} • {m.categoria} • {m.metodo}</div>
                           </div>
                        </div>
                        <div className={`text-3xl font-black ${m.tipo === 'Entrada' ? 'text-emerald-600' : m.tipo === 'Saída' ? 'text-rose-600' : 'text-amber-600'}`}>
                           {m.tipo === 'Saída' ? '-' : '+'} R$ {m.valor.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'estoque' && (
             <div className="space-y-12 animate-in fade-in duration-500">
                <div className="flex justify-between items-center">
                  <h2 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Controle de Estoque</h2>
                  <button onClick={() => setProdEdit({ nome: '', preco: 0, estoque: 0 })} className="bg-[#002B5B] text-white px-10 py-4 rounded-2xl font-black uppercase text-xs shadow-xl">Novo Produto</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {produtos.map(p => (
                    <div key={p.id} className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100 relative group hover:shadow-2xl transition-all">
                      <div className="flex justify-between mb-8">
                        <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Estoque Atual</div>
                        <div className={`text-4xl font-black ${p.estoque < 10 ? 'text-rose-500 animate-pulse' : 'text-[#002B5B]'}`}>{p.estoque} <span className="text-xs">UN</span></div>
                      </div>
                      <h3 className="font-black text-2xl text-slate-800 mb-2 leading-tight">{p.nome}</h3>
                      <p className="text-emerald-600 font-black mb-10 bg-emerald-50 px-4 py-1.5 rounded-full w-fit">R$ {p.preco.toFixed(2)}</p>
                      
                      {/* Ajuste Rápido */}
                      <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 mb-6">
                        <div className="text-[10px] font-black text-slate-400 uppercase mb-4 text-center">Ajuste Manual Rápido</div>
                        <div className="flex gap-4">
                           <input type="number" value={estoqueQuickInput[p.id] || ''} onChange={e => setEstoqueQuickInput({...estoqueQuickInput, [p.id]: e.target.value})} placeholder="Qtd" className="w-full bg-white border border-slate-100 py-3 px-4 rounded-xl font-bold outline-none" />
                           <button onClick={() => handleQuickEstoqueAdjust(p)} className="bg-emerald-600 text-white px-6 rounded-xl font-black uppercase text-[10px] shadow-lg">Ajustar</button>
                        </div>
                      </div>
                      <button onClick={() => setProdEdit(p)} className="w-full py-4 border-2 border-slate-50 rounded-2xl font-black uppercase text-[10px] text-slate-400 hover:bg-[#002B5B] hover:text-white transition-all">Editar Dados</button>
                    </div>
                  ))}
                </div>
             </div>
          )}

          {activeTab === 'cobranca' && (
            <div className="space-y-12 animate-in fade-in duration-500">
               <div className="bg-amber-500 p-20 rounded-[4rem] text-white shadow-2xl relative overflow-hidden">
                  <div className="relative z-10">
                    <h2 className="text-sm font-black uppercase tracking-widest opacity-60 mb-6">Controle de Recebíveis</h2>
                    <div className="text-[8rem] font-black leading-none mb-8 tracking-tighter">R$ {resumo?.totalAReceber.toFixed(2)}</div>
                    <p className="text-xs font-bold opacity-80 uppercase tracking-widest italic">Valores pendentes de acerto físico com clientes.</p>
                  </div>
                  <i className="fas fa-hand-holding-dollar absolute -right-20 -bottom-20 text-[35rem] opacity-10 rotate-12"></i>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                  {resumo?.recentes.filter(m => m.tipo === 'A Receber').map(m => (
                    <div key={m.id} className="bg-white p-12 rounded-[4rem] shadow-sm border-2 border-slate-50 hover:shadow-2xl hover:-translate-y-2 transition-all">
                       <div className="flex justify-between items-start mb-10">
                          <span className="bg-amber-50 text-amber-600 px-5 py-2 rounded-2xl font-black text-[10px] uppercase">{m.dataHora}</span>
                          <button className="text-emerald-500 text-2xl"><i className="fab fa-whatsapp"></i></button>
                       </div>
                       <div className="font-black text-2xl text-slate-800 mb-2 leading-tight">{m.descricao}</div>
                       <div className="text-4xl font-black text-[#002B5B] mb-12">R$ {m.valor.toFixed(2)}</div>
                       <button onClick={() => setIsBaixaModalOpen({ open: true, mov: m })} className="w-full bg-[#002B5B] text-white py-6 rounded-[2rem] font-black uppercase text-xs shadow-xl active:scale-95 transition-all">Efetuar Baixa no Caixa</button>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL FINANCEIRO LANÇAMENTO REFORMULADO */}
      {isFinanceModalOpen && (
        <div className="fixed inset-0 bg-[#002B5B]/90 backdrop-blur-2xl z-[500] flex items-center justify-center p-6">
          <div className="bg-white rounded-[4rem] w-full max-w-2xl shadow-2xl p-16 animate-in zoom-in duration-300">
             <h2 className="text-3xl font-black text-[#002B5B] uppercase mb-12 tracking-tighter">Controladoria Contábil</h2>
             <div className="space-y-8">
                <div className="flex gap-4 p-2 bg-slate-100 rounded-[2.5rem]">
                  <button onClick={() => setFinEntry({...finEntry, tipo: 'Entrada', categoria: categoriasReceita[0]})} className={`flex-1 py-5 rounded-[2rem] font-black text-xs uppercase transition-all ${finEntry.tipo === 'Entrada' ? 'bg-emerald-600 text-white shadow-xl' : 'text-slate-400'}`}>Receita / Entrada</button>
                  <button onClick={() => setFinEntry({...finEntry, tipo: 'Saída', categoria: categoriasDespesa[0]})} className={`flex-1 py-5 rounded-[2rem] font-black text-xs uppercase transition-all ${finEntry.tipo === 'Saída' ? 'bg-rose-600 text-white shadow-xl' : 'text-slate-400'}`}>Despesa / Saída</button>
                </div>
                <div className="grid grid-cols-2 gap-8">
                   <div className="relative">
                      <span className="absolute left-8 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-300">R$</span>
                      <input type="number" value={finEntry.valor} onChange={e => setFinEntry({...finEntry, valor: e.target.value})} placeholder="0,00" className="w-full bg-slate-50 py-8 pl-20 pr-8 rounded-[2rem] font-black text-4xl outline-none" />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-4">Data</label>
                      <input type="date" value={finEntry.dataHora} onChange={e => setFinEntry({...finEntry, dataHora: e.target.value})} className="w-full bg-slate-50 py-8 px-8 rounded-[2rem] font-black outline-none" />
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-8">
                  <select value={finEntry.categoria} onChange={e => setFinEntry({...finEntry, categoria: e.target.value})} className="bg-slate-50 py-6 px-8 rounded-3xl font-black outline-none shadow-sm">
                    {(finEntry.tipo === 'Entrada' ? categoriasReceita : categoriasDespesa).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <select value={finEntry.metodo} onChange={e => setFinEntry({...finEntry, metodo: e.target.value})} className="bg-slate-50 py-6 px-8 rounded-3xl font-black outline-none shadow-sm">
                    {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <input type="text" value={finEntry.descricao} onChange={e => setFinEntry({...finEntry, descricao: e.target.value})} placeholder="Descrição do Movimento" className="w-full bg-slate-50 py-6 px-8 rounded-3xl font-black outline-none" />
                <div className="flex gap-6 pt-6">
                   <button onClick={() => setIsFinanceModalOpen(false)} className="flex-1 text-slate-400 font-black uppercase text-xs tracking-widest">Desistir</button>
                   <button onClick={handleSaveFinance} className="flex-[2] bg-[#002B5B] text-white py-6 rounded-[2.5rem] font-black uppercase text-xs shadow-2xl active:scale-95 transition-all">Confirmar Lançamento</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* MODAL BAIXA */}
      {isBaixaModalOpen.open && isBaixaModalOpen.mov && (
        <div className="fixed inset-0 bg-[#002B5B]/90 backdrop-blur-2xl z-[600] flex items-center justify-center p-6">
          <div className="bg-white rounded-[4rem] w-full max-w-xl shadow-2xl p-16 animate-in zoom-in duration-300 text-center">
             <div className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-10 shadow-inner"><i className="fas fa-hand-holding-usd"></i></div>
             <h2 className="text-3xl font-black text-[#002B5B] uppercase mb-4 tracking-tighter">Receber Valor</h2>
             <p className="text-slate-400 font-bold mb-12">Confirme a entrada deste valor no caixa físico.</p>
             <div className="bg-slate-50 p-10 rounded-[3rem] mb-12">
                <div className="text-5xl font-black text-emerald-600 tracking-tighter">R$ {isBaixaModalOpen.mov.valor.toFixed(2)}</div>
                <div className="text-sm font-black text-[#002B5B] opacity-60 mt-2">{isBaixaModalOpen.mov.descricao}</div>
             </div>
             <div className="grid grid-cols-2 gap-4">
                {[PaymentMethod.DINHEIRO, PaymentMethod.PIX, PaymentMethod.CARTAO_DEBITO, PaymentMethod.CARTAO_CREDITO].map(m => (
                  <button key={m} onClick={() => { setMetodoBaixa(m); handleConfirmBaixa(); }} className="bg-white border-2 border-slate-100 p-6 rounded-[2rem] font-black text-[10px] uppercase hover:bg-[#002B5B] hover:text-white transition-all shadow-sm">{m}</button>
                ))}
             </div>
             <button onClick={() => setIsBaixaModalOpen({ open: false, mov: null })} className="mt-8 text-slate-300 font-bold uppercase text-[10px] tracking-widest">Fechar</button>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-md z-[1000] flex items-center justify-center">
          <div className="w-16 h-16 border-[6px] border-[#002B5B] border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {message && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[400] px-10 py-5 rounded-3xl shadow-2xl text-white font-black flex items-center gap-4 animate-in slide-in-from-bottom-10 ${message.type === 'success' ? 'bg-emerald-600' : 'bg-rose-500'}`}><i className="fas fa-check-circle text-xl"></i>{message.text}</div>
      )}
    </div>
  );
};

export default App;
