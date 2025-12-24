
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { gasService } from './services/gasMock.ts';
import { Cliente, Produto, Entregador, Pedido, PaymentMethod, ResumoFinanceiro, PedidoItem, Movimentacao } from './types.ts';
import * as XLSX from 'xlsx';

const App: React.FC = () => {
  // Estados de Dados
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);

  // Estados de Navegação
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clientes' | 'equipe' | 'caixa' | 'estoque'>('dashboard');

  // Estados de Pedido
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [selectedProduto, setSelectedProduto] = useState<string>('');
  const [quantidade, setQuantidade] = useState<number>(1);
  const [cart, setCart] = useState<PedidoItem[]>([]);
  const [selectedEntregador, setSelectedEntregador] = useState<string>('');
  const [formaPagamento, setFormaPagamento] = useState<string>(PaymentMethod.DINHEIRO);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Estados de Edição
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false);
  const [finEntry, setFinEntry] = useState<{
    tipo: 'Entrada' | 'Saída',
    descricao: string,
    valor: string,
    categoria: string,
    metodo: string
  }>({
    tipo: 'Saída',
    descricao: '',
    valor: '',
    categoria: 'Outros',
    metodo: PaymentMethod.DINHEIRO
  });

  const [prodEdit, setProdEdit] = useState<Partial<Produto> | null>(null);
  const [entEdit, setEntEdit] = useState<Partial<Entregador> | null>(null);
  const [cliEdit, setCliEdit] = useState<Partial<Cliente> | null>(null);
  const [cliFilter, setCliFilter] = useState('');

  // Estado para campos de ajuste rápido de estoque
  const [estoqueQuickInput, setEstoqueQuickInput] = useState<Record<string, string>>({});
  
  // UI
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);

  const categoriasReceita = ['Venda de Gás', 'Venda de Água', 'Ajuste de Saldo', 'Outros'];
  const categoriasDespesa = ['Combustível', 'Manutenção Moto', 'Aluguel', 'Energia/Água', 'Salários', 'Compra de Estoque', 'Marketing', 'Outros'];

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
    } catch (err) { 
      console.error('Erro ao carregar dados:', err);
      setMessage({ type: 'error', text: 'Erro de conexão.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleTelefoneBlur = async () => {
    if (telefone.length >= 8) {
      const clienteEncontrado = clientes.find(c => c.telefone.includes(telefone));
      if (clienteEncontrado) {
        setNome(clienteEncontrado.nome);
        setEndereco(clienteEncontrado.endereco);
      }
    }
  };

  const nameSuggestions = useMemo(() => {
    if (nome.length < 2) return [];
    return clientes.filter(c => 
      c.nome.toLowerCase().includes(nome.toLowerCase())
    ).slice(0, 5);
  }, [clientes, nome]);

  const selectCustomer = (c: Cliente) => {
    setNome(c.nome);
    setTelefone(c.telefone);
    setEndereco(c.endereco);
    setShowSuggestions(false);
  };

  const handleSaveProduct = async () => {
    if (!prodEdit?.nome || prodEdit.preco === undefined || prodEdit.estoque === undefined) {
      alert("Preencha todos os campos do produto.");
      return;
    }
    setLoading(true);
    const res = await gasService.salvarProduto(prodEdit);
    setLoading(false);
    if (res.success) {
      setMessage({ type: 'success', text: 'Produto salvo com sucesso!' });
      setProdEdit(null);
      loadData();
    } else {
      setMessage({ type: 'error', text: 'Erro ao salvar produto.' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleQuickEstoqueAdjust = async (product: Produto) => {
    const newVal = estoqueQuickInput[product.id];
    if (!newVal || isNaN(parseInt(newVal))) return;
    
    setLoading(true);
    const updatedProduct = { ...product, estoque: parseInt(newVal) };
    const res = await gasService.salvarProduto(updatedProduct);
    setLoading(false);
    
    if (res.success) {
      setMessage({ type: 'success', text: `Estoque de ${product.nome} atualizado!` });
      setEstoqueQuickInput(prev => ({ ...prev, [product.id]: '' }));
      loadData();
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setLoading(true);
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const findKey = (obj: any, keys: string[]) => {
          const lowerKeys = keys.map(k => k.toLowerCase());
          const found = Object.keys(obj).find(k => lowerKeys.includes(k.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
          return found ? obj[found] : '';
        };

        const clientesParaSalvar = data.map(item => {
          const rawTel = String(findKey(item, ['telefone', 'tel', 'whatsapp', 'contato', 'celular']) || '');
          return {
            nome: String(findKey(item, ['nome', 'cliente', 'razao social', 'nome completo']) || ''),
            telefone: rawTel.replace(/\D/g, ''),
            endereco: String(findKey(item, ['endereco', 'rua', 'logradouro', 'localizacao']) || ''),
            bairro: String(findKey(item, ['bairro', 'distrito']) || ''),
            referencia: String(findKey(item, ['referencia', 'ponto de referencia', 'obs']) || '')
          };
        }).filter(c => c.nome.length > 2 && c.telefone.length >= 8);

        if (clientesParaSalvar.length === 0) {
          throw new Error("Nenhum cliente válido encontrado.");
        }

        const res = await gasService.salvarClientesEmMassa(clientesParaSalvar);
        if (res.success) {
          setMessage({ type: 'success', text: `${res.count} clientes importados!` });
          await loadData();
        }
      } catch (err: any) {
        setMessage({ type: 'error', text: err.message || "Erro no processamento." });
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => setMessage(null), 5000);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSaveFinance = async () => {
    if (!finEntry.descricao || !finEntry.valor || parseFloat(finEntry.valor) <= 0) {
      alert("Preencha descrição e valor corretamente.");
      return;
    }
    setLoading(true);
    const res = await gasService.registrarMovimentacao({
      ...finEntry,
      valor: parseFloat(finEntry.valor)
    });
    setLoading(false);
    if (res.success) {
      setMessage({ type: 'success', text: 'Movimentação registrada!' });
      setIsFinanceModalOpen(false);
      setFinEntry({ tipo: 'Saída', descricao: '', valor: '', categoria: 'Outros', metodo: PaymentMethod.DINHEIRO });
      loadData();
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSaveCustomer = async () => {
    if (!cliEdit?.nome || !cliEdit?.telefone) return;
    setLoading(true);
    const res = await gasService.salvarCliente(cliEdit);
    setLoading(false);
    if (res.success) {
      setMessage({ type: 'success', text: 'Cliente salvo!' });
      setCliEdit(null);
      loadData();
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm('Excluir este cliente permanentemente?')) return;
    setLoading(true);
    const res = await gasService.excluirCliente(id);
    setLoading(false);
    if (res.success) {
      setMessage({ type: 'success', text: 'Cliente removido!' });
      loadData();
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSendWhatsAppRoute = (pedido: Pedido) => {
    const entregadorObj = entregadores.find(e => e.nome === pedido.entregador);
    if (!entregadorObj || !entregadorObj.telefone) {
      alert("WhatsApp do entregador não cadastrado!");
      return;
    }
    const itemsStr = pedido.itens && pedido.itens.length > 0 
      ? pedido.itens.map(it => `${it.qtd}x ${it.nome}`).join(", ")
      : pedido.produtoSummary;

    const msg = `📦 *NOVO PEDIDO - BIO GÁS*%0A%0A👤 *Cliente:* ${pedido.nomeCliente}%0A📞 *Tel:* ${pedido.telefoneCliente}%0A📍 *Endereço:* ${pedido.endereco}%0A🛒 *Itens:* ${itemsStr}%0A💰 *Valor:* R$ ${Number(pedido.valorTotal).toFixed(2)}%0A💳 *Pgto:* ${pedido.formaPagamento}%0A%0A🗺️ *Maps:* https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pedido.endereco)}`;

    const url = `https://api.whatsapp.com/send?phone=55${entregadorObj.telefone.replace(/\D/g, '')}&text=${msg}`;
    window.open(url, '_blank');
  };

  const handleAddItem = () => {
    const prod = produtos.find(p => p.nome === selectedProduto);
    if (!prod) return;
    setCart([...cart, { produtoId: prod.id, nome: prod.nome, qtd: parseInt(String(quantidade)), precoUnitario: prod.preco }]);
    setSelectedProduto(''); setQuantidade(1);
  };

  const handleCreateOrder = async () => {
    if (!nome || !telefone || cart.length === 0 || !selectedEntregador) return;
    setLoading(true);
    const total = cart.reduce((acc, it) => acc + (it.qtd * it.precoUnitario), 0);
    const pedidoDados = { nomeCliente: nome, telefoneCliente: telefone, endereco, itens: cart, valorTotal: total, entregador: selectedEntregador, formaPagamento };
    const res = await gasService.salvarPedido(pedidoDados);
    setLoading(false);
    if (res.success) {
      setMessage({ type: 'success', text: 'Pedido registrado!' });
      setTelefone(''); setNome(''); setEndereco(''); setCart([]); loadData();
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const filteredClientes = useMemo(() => {
    return clientes.filter(c => 
      cliFilter === '' || 
      c.nome.toLowerCase().includes(cliFilter.toLowerCase()) || 
      c.telefone.includes(cliFilter)
    );
  }, [clientes, cliFilter]);

  const activeOrders = useMemo(() => pedidos.filter(p => p.status === 'Pendente' || p.status === 'Em Rota'), [pedidos]);

  return (
    <div className="flex h-screen overflow-hidden text-slate-900">
      {/* SIDEBAR */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="bg-[#002B5B] w-12 h-12 rounded-2xl flex items-center justify-center text-[#FFD700] shadow-lg border-2 border-[#FFD700]/30 relative">
              <span className="font-black text-xl italic">B</span>
              <span className="font-black text-xs absolute bottom-1 right-2 text-white/50">G</span>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xl tracking-tighter text-slate-800 leading-none"><span className="text-[#002B5B]">BIO</span> <span className="text-[#0088CC]">GÁS</span></span>
              <span className="text-[10px] font-bold text-slate-400 uppercase mt-1 tracking-widest">SISTEMA PRO</span>
            </div>
          </div>
          <nav className="space-y-2">
            {[
              { id: 'dashboard', icon: 'fa-chart-pie', label: 'Painel Central' },
              { id: 'clientes', icon: 'fa-address-book', label: 'Clientes' },
              { id: 'caixa', icon: 'fa-wallet', label: 'Financeiro' },
              { id: 'equipe', icon: 'fa-motorcycle', label: 'Entregadores' },
              { id: 'estoque', icon: 'fa-boxes-stacked', label: 'Estoque' },
            ].map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-sm transition-all duration-300 ${activeTab === item.id ? 'sidebar-item-active' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                <i className={`fas ${item.icon} text-lg ${activeTab === item.id ? 'text-[#FFD700]' : ''}`}></i>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#F8FAFC] flex flex-col">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-10 sticky top-0 z-40">
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <div className="w-1.5 h-6 bg-[#0088CC] rounded-full"></div>
            {activeTab === 'dashboard' && 'Novo Pedido'}
            {activeTab === 'clientes' && 'Gestão de Clientes'}
            {activeTab === 'caixa' && 'Fluxo de Caixa'}
            {activeTab === 'equipe' && 'Equipe Logística'}
            {activeTab === 'estoque' && 'Estoque'}
          </h1>
          <div className="flex items-center gap-4">
             <button onClick={() => setIsFinanceModalOpen(true)} className="bg-[#002B5B] text-[#FFD700] px-6 py-2 rounded-xl font-black text-[10px] uppercase shadow-md flex items-center gap-2 hover:scale-105 transition-all">
               <i className="fas fa-wallet"></i> Controle de Caixa
             </button>
             <div className="text-[10px] font-black text-emerald-500 flex items-center gap-2 border border-emerald-100 bg-emerald-50 px-4 py-2 rounded-full">
               <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>SISTEMA ONLINE
             </div>
          </div>
        </header>

        <div className="p-10">
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
              <div className="xl:col-span-2 space-y-8">
                {/* Stats Summary Dashboard */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl"><i className="fas fa-arrow-up"></i></div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Receitas</div>
                      <div className="text-lg font-black text-slate-800">R$ {resumo?.totalEntradas.toFixed(2) || '0.00'}</div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl"><i className="fas fa-arrow-down"></i></div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Despesas</div>
                      <div className="text-lg font-black text-slate-800">R$ {resumo?.totalSaidas.toFixed(2) || '0.00'}</div>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#002B5B] flex items-center justify-center text-xl"><i className="fas fa-wallet"></i></div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Saldo</div>
                      <div className="text-lg font-black text-slate-800">R$ {resumo?.saldo.toFixed(2) || '0.00'}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Telefone</label>
                        <input type="tel" value={telefone} onChange={e => setTelefone(e.target.value.replace(/\D/g, ''))} onBlur={handleTelefoneBlur} placeholder="WhatsApp do Cliente" className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] rounded-2xl py-5 px-6 font-black text-lg outline-none transition-all" />
                    </div>
                    <div className="space-y-2 relative" ref={suggestionRef}>
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Nome do Cliente</label>
                        <input type="text" value={nome} onChange={e => { setNome(e.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} placeholder="Digite para buscar..." className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] rounded-2xl py-5 px-6 font-black text-lg outline-none transition-all" />
                        {showSuggestions && nameSuggestions.length > 0 && (
                          <div className="absolute top-[100%] left-0 w-full bg-white/95 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-3xl mt-2 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                            {nameSuggestions.map(c => (
                              <button key={c.id} onClick={() => selectCustomer(c)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 group text-left">
                                <div className="flex flex-col"><span className="font-black text-slate-800">{c.nome}</span><span className="text-[10px] font-bold text-slate-400 uppercase">{c.bairro || 'Sem Bairro'}</span></div>
                                <i className="fas fa-arrow-right text-slate-200 group-hover:text-[#002B5B] transition-all"></i>
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                  <div className="space-y-2 mb-8 relative">
                    <div className="flex justify-between items-center px-2 mb-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Endereço de Entrega</label></div>
                    <textarea value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, Número, Bairro, Referência..." className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] rounded-2xl py-5 px-6 font-bold text-lg outline-none h-24 resize-none transition-all" />
                  </div>
                  <div className="mb-10 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                      <select value={selectedProduto} onChange={e => setSelectedProduto(e.target.value)} className="flex-1 bg-white py-4 px-6 rounded-xl font-bold border-2 border-transparent focus:border-[#002B5B] outline-none">
                        <option value="">Produto...</option>
                        {produtos.map(p => <option key={p.id} value={p.nome}>{p.nome} - R$ {p.preco.toFixed(2)}</option>)}
                      </select>
                      <input type="number" min="1" value={quantidade} onChange={e => setQuantidade(parseInt(e.target.value) || 1)} className="w-24 bg-white py-4 px-6 rounded-xl font-bold border-2 border-transparent focus:border-[#002B5B] outline-none text-center" />
                      <button onClick={handleAddItem} disabled={!selectedProduto} className="bg-[#002B5B] text-[#FFD700] px-8 py-4 rounded-xl font-black text-xs uppercase shadow-lg">Adicionar</button>
                    </div>
                    {cart.map((item, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-xl flex items-center justify-between border border-slate-100 mb-2">
                        <span className="font-bold text-slate-700">{item.qtd}x {item.nome}</span>
                        <div className="flex items-center gap-4"><span className="font-black text-slate-400 text-xs">R$ {(item.qtd * item.precoUnitario).toFixed(2)}</span><button onClick={() => setCart(cart.filter((_, i) => i !== idx))} className="text-rose-400"><i className="fas fa-trash-alt"></i></button></div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    <select value={selectedEntregador} onChange={e => setSelectedEntregador(e.target.value)} className="w-full bg-slate-50 py-5 px-6 rounded-2xl font-bold border-2 border-transparent focus:border-[#002B5B]">
                      <option value="">Entregador...</option>
                      {entregadores.filter(e => e.status === 'Ativo').map(e => <option key={e.id} value={e.nome}>{e.nome} ({e.veiculo})</option>)}
                    </select>
                    <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className="w-full bg-slate-50 py-5 px-6 rounded-2xl font-bold border-2 border-transparent focus:border-[#002B5B]">
                      {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <button onClick={handleCreateOrder} disabled={loading || cart.length === 0} className="w-full bg-[#002B5B] text-white py-6 rounded-[2rem] font-black uppercase text-sm shadow-xl hover:bg-blue-900 transition-all">Finalizar Pedido</button>
                </div>
              </div>

              <div className="space-y-6">
                 <h3 className="font-black text-slate-800 uppercase text-xs tracking-wider">📦 Entregas Ativas</h3>
                 <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
                    {activeOrders.map(p => (
                        <div key={p.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm group hover:border-[#0088CC]/30 transition-all">
                            <div className="flex justify-between items-start mb-4">
                              <div className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${p.status === 'Pendente' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-[#002B5B]'}`}>{p.status}</div>
                              <div className="text-[10px] font-bold text-slate-400">{p.dataHora}</div>
                            </div>
                            <div className="font-black text-slate-800 text-lg mb-1">{p.nomeCliente}</div>
                            <div className="text-xs text-slate-500 font-medium mb-4 line-clamp-1">{p.endereco}</div>
                            <div className="flex items-center gap-2 mb-4 bg-slate-50 p-2 rounded-lg">
                               <i className="fas fa-motorcycle text-[#0088CC] text-xs"></i>
                               <span className="text-[10px] font-black text-slate-600 uppercase">Motorista: {p.entregador}</span>
                            </div>
                            <div className="flex flex-col gap-2 pt-4 border-t border-slate-50">
                                <div className="flex justify-between items-center mb-2"><div className="text-sm font-black text-[#002B5B]">R$ {Number(p.valorTotal).toFixed(2)}</div></div>
                                <div className="flex gap-2">
                                    {p.status === 'Pendente' && (
                                      <>
                                        <button onClick={async () => { setLoading(true); await gasService.atualizarStatusPedido(p.id, 'Em Rota'); await loadData(); }} className="flex-1 bg-[#002B5B] text-white py-3 rounded-xl font-black text-[10px] uppercase shadow-lg">Despachar</button>
                                        <button onClick={async () => { setLoading(true); await gasService.atualizarStatusPedido(p.id, 'Entregue'); await loadData(); setMessage({ type: 'success', text: 'Entregue!' }); setTimeout(() => setMessage(null), 3000); }} className="px-4 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[10px] uppercase hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-1 shadow-sm"><i className="fas fa-check"></i> Finalizar</button>
                                      </>
                                    )}
                                    {p.status === 'Em Rota' && (
                                      <>
                                        <button onClick={() => handleSendWhatsAppRoute(p)} className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-2 shadow-lg hover:bg-emerald-600 transition-all"><i className="fab fa-whatsapp"></i> Rota</button>
                                        <button onClick={async () => { setLoading(true); await gasService.atualizarStatusPedido(p.id, 'Entregue'); await loadData(); setMessage({ type: 'success', text: 'Entregue!' }); setTimeout(() => setMessage(null), 3000); }} className="px-4 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[10px] uppercase hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-1 shadow-sm"><i className="fas fa-check"></i> Finalizar</button>
                                      </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'caixa' && resumo && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-emerald-600 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="text-[10px] font-black uppercase opacity-70 mb-2 tracking-widest">Receitas Totais</div>
                    <div className="text-4xl font-black">R$ {resumo.totalEntradas.toFixed(2)}</div>
                  </div>
                  <i className="fas fa-arrow-trend-up absolute -right-4 -bottom-4 text-8xl text-white/10"></i>
                </div>
                <div className="bg-rose-600 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="text-[10px] font-black uppercase opacity-70 mb-2 tracking-widest">Despesas Totais</div>
                    <div className="text-4xl font-black">R$ {resumo.totalSaidas.toFixed(2)}</div>
                  </div>
                  <i className="fas fa-arrow-trend-down absolute -right-4 -bottom-4 text-8xl text-white/10"></i>
                </div>
                <div className="bg-[#002B5B] p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="text-[10px] font-black uppercase opacity-70 mb-2 tracking-widest">Saldo Atual</div>
                    <div className="text-4xl font-black">R$ {resumo.saldo.toFixed(2)}</div>
                  </div>
                  <i className="fas fa-vault absolute -right-4 -bottom-4 text-8xl text-white/10"></i>
                </div>
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-10">
                  <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Fluxo de Caixa</h3>
                      <p className="text-sm font-bold text-slate-400">Gerencie todas as entradas e saídas do negócio.</p>
                    </div>
                    <button onClick={() => setIsFinanceModalOpen(true)} className="bg-[#002B5B] text-[#FFD700] px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-lg hover:scale-105 transition-all flex items-center gap-3">
                      <i className="fas fa-plus-circle"></i> Novo Lançamento
                    </button>
                  </div>

                  <div className="space-y-4">
                    {resumo.recentes.length === 0 ? (
                      <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed">
                        <i className="fas fa-receipt text-4xl text-slate-200 mb-4"></i>
                        <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Nenhuma movimentação encontrada</p>
                      </div>
                    ) : (
                      resumo.recentes.map(m => (
                        <div key={m.id} className="flex items-center justify-between p-6 bg-slate-50 rounded-[2rem] border border-slate-100 hover:bg-white hover:shadow-md transition-all group">
                          <div className="flex items-center gap-5">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl shadow-sm ${m.tipo === 'Entrada' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                               <i className={`fas ${m.tipo === 'Entrada' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                            </div>
                            <div>
                              <div className="font-black text-slate-800 group-hover:text-[#002B5B] transition-colors">{m.descricao}</div>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider bg-white px-2 py-0.5 rounded border">{m.categoria}</span>
                                <span className="text-[10px] font-bold text-slate-300 italic">{m.dataHora}</span>
                              </div>
                            </div>
                          </div>
                          <div className={`text-xl font-black ${m.tipo === 'Entrada' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {m.tipo === 'Entrada' ? '+' : '-'} R$ {m.valor.toFixed(2)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
              </div>
            </div>
          )}

          {activeTab === 'clientes' && (
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[75vh]">
              <div className="p-10 border-b flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-50/30">
                <input type="text" value={cliFilter} onChange={e => setCliFilter(e.target.value)} placeholder="Procurar cliente..." className="w-full md:w-96 bg-white border-2 border-transparent focus:border-[#002B5B] rounded-2xl py-4 px-6 font-bold outline-none shadow-sm transition-all" />
                <div className="flex gap-4">
                  <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx, .xls, .csv" className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-emerald-700 transition-all flex items-center gap-2"><i className="fas fa-file-excel"></i> Importar Excel</button>
                  <button onClick={() => setCliEdit({nome: '', telefone: '', endereco: ''})} className="bg-[#002B5B] text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-blue-900 transition-all flex items-center gap-2"><i className="fas fa-plus"></i> Novo Cliente</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-4">
                    <tr><th className="pb-4">Cliente</th><th className="pb-4">Contato</th><th className="pb-4">Endereço</th><th className="pb-4 text-right">Ações</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredClientes.map(c => (
                      <tr key={c.id} className="group hover:bg-slate-50/50">
                        <td className="py-6 font-black text-slate-800">{c.nome}</td>
                        <td className="py-6 font-bold text-slate-500">{c.telefone}</td>
                        <td className="py-6 text-sm text-slate-600 max-w-[300px] truncate">{c.endereco}</td>
                        <td className="py-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setCliEdit(c)} className="w-10 h-10 bg-white border rounded-xl text-slate-400 hover:text-[#002B5B] shadow-sm transition-all"><i className="fas fa-edit"></i></button>
                            <button onClick={() => handleDeleteCustomer(c.id)} className="w-10 h-10 bg-white border rounded-xl text-rose-400 hover:bg-rose-600 hover:text-white shadow-sm transition-all"><i className="fas fa-trash-alt"></i></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'equipe' && (
             <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-10">
               <div className="flex justify-between items-center mb-10"><h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Equipe Logística</h2><button onClick={() => setEntEdit({ nome: '', telefone: '', veiculo: '', status: 'Ativo' })} className="bg-[#002B5B] text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-lg">Adicionar Entregador</button></div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {entregadores.map(e => (
                   <div key={e.id} className="p-8 bg-slate-50 border border-slate-100 rounded-[3rem] flex flex-col items-center text-center relative group hover:bg-white transition-all shadow-sm">
                     <button onClick={() => setEntEdit(e)} className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 w-10 h-10 bg-white rounded-xl shadow-md text-slate-400 hover:text-[#002B5B] transition-all flex items-center justify-center"><i className="fas fa-edit"></i></button>
                     <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-[#002B5B] text-3xl shadow-sm mb-6 border border-slate-100"><i className="fas fa-motorcycle"></i></div>
                     <div className="font-black text-slate-800 text-xl mb-1">{e.nome}</div>
                     <div className="text-xs font-bold text-[#0088CC] uppercase mb-4">{e.veiculo || 'Moto'}</div>
                     <div className="flex items-center gap-2 text-emerald-600 font-black text-sm mb-6 bg-emerald-50 px-4 py-2 rounded-full"><i className="fab fa-whatsapp"></i> {e.telefone}</div>
                     <div className={`text-[10px] font-black uppercase px-6 py-2 rounded-full ${e.status === 'Ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>{e.status}</div>
                   </div>
                 ))}
               </div>
             </div>
          )}

          {activeTab === 'estoque' && (
             <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-10">
                <div className="flex justify-between items-center mb-10">
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Controle de Estoque</h2>
                  <button onClick={() => setProdEdit({nome: '', preco: 0, estoque: 0})} className="bg-[#002B5B] text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-lg hover:scale-105 transition-all">
                    <i className="fas fa-plus-circle mr-2"></i> Novo Produto
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {produtos.map(p => (
                    <div key={p.id} className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 hover:bg-white hover:shadow-xl transition-all group relative">
                      <div className="flex justify-between mb-4">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estoque</div>
                        <div className={`text-2xl font-black flex items-center gap-2 ${p.estoque < 10 ? 'text-rose-500' : 'text-slate-800'}`}>
                          {p.estoque < 10 && <i className="fas fa-triangle-exclamation animate-pulse"></i>}
                          {p.estoque} <span className="text-[10px] font-black text-slate-300">UN</span>
                        </div>
                      </div>
                      <div className="font-black text-slate-800 text-xl mb-1 group-hover:text-[#002B5B] transition-colors">{p.nome}</div>
                      <div className="text-sm font-bold text-[#0088CC] mb-6 bg-blue-50 px-3 py-1 rounded-full inline-block">R$ {p.preco.toFixed(2)}</div>
                      
                      {/* Seção de Ajuste Rápido de Estoque */}
                      <div className="mb-6 p-4 bg-white/50 border border-slate-200 rounded-2xl space-y-3 shadow-sm">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Ajuste Manual</label>
                        <div className="flex gap-2">
                           <input 
                              type="number" 
                              value={estoqueQuickInput[p.id] || ''} 
                              onChange={(e) => setEstoqueQuickInput({...estoqueQuickInput, [p.id]: e.target.value})}
                              placeholder="Nova qtd" 
                              className="flex-1 bg-white border border-slate-100 py-2 px-3 rounded-xl text-xs font-bold outline-none focus:border-[#002B5B]"
                           />
                           <button 
                              onClick={() => handleQuickEstoqueAdjust(p)}
                              disabled={!estoqueQuickInput[p.id]}
                              className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm disabled:opacity-50"
                           >
                             Ajustar
                           </button>
                        </div>
                      </div>

                      <button onClick={() => setProdEdit(p)} className="w-full bg-white border-2 border-slate-100 py-3 rounded-2xl font-black text-[10px] uppercase text-slate-500 hover:bg-[#002B5B] hover:text-white hover:border-[#002B5B] transition-all shadow-sm">
                        <i className="fas fa-edit mr-2"></i> Editar Dados do Produto
                      </button>
                    </div>
                  ))}
                </div>
             </div>
          )}
        </div>
      </main>

      {/* MODAL CONTROLE DE CAIXA DEDICADO */}
      {isFinanceModalOpen && resumo && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[250] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl p-10 animate-in zoom-in duration-300 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-8 shrink-0">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                <i className="fas fa-wallet text-[#002B5B]"></i> Controle de Caixa
              </h2>
              <button onClick={() => setIsFinanceModalOpen(false)} className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-colors"><i className="fas fa-times"></i></button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-10 shrink-0">
               <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                  <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest block mb-1">Entradas</span>
                  <span className="text-lg font-black text-emerald-700">R$ {resumo.totalEntradas.toFixed(2)}</span>
               </div>
               <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100">
                  <span className="text-[8px] font-black text-rose-600 uppercase tracking-widest block mb-1">Saídas</span>
                  <span className="text-lg font-black text-rose-700">R$ {resumo.totalSaidas.toFixed(2)}</span>
               </div>
               <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">Saldo Final</span>
                  <span className="text-lg font-black text-slate-800">R$ {resumo.saldo.toFixed(2)}</span>
               </div>
            </div>

            <div className="overflow-y-auto custom-scrollbar flex-1 pr-2">
              <div className="space-y-6">
                <div className="flex gap-4 p-2 bg-slate-50 rounded-2xl">
                  <button onClick={() => setFinEntry({...finEntry, tipo: 'Entrada', categoria: categoriasReceita[0]})} className={`flex-1 py-4 rounded-xl font-black uppercase text-xs transition-all ${finEntry.tipo === 'Entrada' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400'}`}><i className="fas fa-arrow-up mr-2"></i> Entrada</button>
                  <button onClick={() => setFinEntry({...finEntry, tipo: 'Saída', categoria: categoriasDespesa[0]})} className={`flex-1 py-4 rounded-xl font-black uppercase text-xs transition-all ${finEntry.tipo === 'Saída' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-400'}`}><i className="fas fa-arrow-down mr-2"></i> Saída</button>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Valor</label>
                  <div className="relative"><span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-slate-400">R$</span><input type="number" value={finEntry.valor} onChange={e => setFinEntry({...finEntry, valor: e.target.value})} placeholder="0,00" className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-5 pl-14 pr-6 rounded-2xl font-black text-2xl outline-none" /></div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Descrição</label>
                  <input type="text" value={finEntry.descricao} onChange={e => setFinEntry({...finEntry, descricao: e.target.value})} placeholder="Ex: Gasolina Moto" className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-5 px-6 rounded-2xl font-bold outline-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Categoria</label>
                    <select value={finEntry.categoria} onChange={e => setFinEntry({...finEntry, categoria: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-4 px-6 rounded-2xl font-bold outline-none appearance-none">
                      {(finEntry.tipo === 'Entrada' ? categoriasReceita : categoriasDespesa).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Forma de Pagamento</label>
                    <select value={finEntry.metodo} onChange={e => setFinEntry({...finEntry, metodo: e.target.value})} className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-4 px-6 rounded-2xl font-bold outline-none appearance-none">
                      {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                      <option value="Caixa Local">Caixa Local</option>
                    </select>
                  </div>
                </div>

                <button onClick={handleSaveFinance} className={`w-full py-6 rounded-[2rem] font-black uppercase text-sm tracking-widest shadow-xl transition-all mt-6 ${finEntry.tipo === 'Entrada' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#002B5B] hover:bg-blue-900'} text-white`}>Salvar Movimentação</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR PRODUTO (NOVO/EDITAR) */}
      {prodEdit && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl p-10 animate-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{prodEdit.id ? 'Editar' : 'Novo'} Produto</h2>
              <button onClick={() => setProdEdit(null)} className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-colors"><i className="fas fa-times"></i></button>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Nome do Produto</label>
                <input 
                  type="text" 
                  value={prodEdit.nome || ''} 
                  onChange={e => setProdEdit({...prodEdit, nome: e.target.value})} 
                  placeholder="Ex: Gás P13" 
                  className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-5 px-6 rounded-2xl font-bold outline-none transition-all" 
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Preço de Venda (R$)</label>
                  <input 
                    type="number" 
                    value={prodEdit.preco} 
                    onChange={e => setProdEdit({...prodEdit, preco: parseFloat(e.target.value) || 0})} 
                    placeholder="0,00" 
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-5 px-6 rounded-2xl font-black text-lg outline-none" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Estoque Atual (UN)</label>
                  <input 
                    type="number" 
                    value={prodEdit.estoque} 
                    onChange={e => setProdEdit({...prodEdit, estoque: parseInt(e.target.value) || 0})} 
                    placeholder="0" 
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-5 px-6 rounded-2xl font-black text-lg outline-none" 
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button onClick={handleSaveProduct} className="flex-1 bg-[#002B5B] text-white py-6 rounded-2xl font-black uppercase text-sm shadow-xl hover:bg-blue-900 transition-all">
                  Confirmar Alterações
                </button>
                <button onClick={() => setProdEdit(null)} className="px-10 bg-slate-100 text-slate-400 py-6 rounded-2xl font-black uppercase text-sm hover:bg-slate-200 transition-all">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cliEdit && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl p-10 animate-in zoom-in">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-8">{cliEdit.id ? 'Editar' : 'Novo'} Cliente</h2>
            <div className="space-y-5">
              <input type="text" value={cliEdit.nome || ''} onChange={e => setCliEdit({...cliEdit, nome: e.target.value})} placeholder="Nome" className="w-full bg-slate-50 border py-4 px-6 rounded-2xl font-bold outline-none" />
              <input type="tel" value={cliEdit.telefone || ''} onChange={e => setCliEdit({...cliEdit, telefone: e.target.value})} placeholder="WhatsApp" className="w-full bg-slate-50 border py-4 px-6 rounded-2xl font-bold outline-none" />
              <textarea value={cliEdit.endereco || ''} onChange={e => setCliEdit({...cliEdit, endereco: e.target.value})} placeholder="Endereço" className="w-full bg-slate-50 border py-4 px-6 rounded-2xl font-bold h-24 outline-none resize-none" />
              <div className="flex gap-4"><button onClick={handleSaveCustomer} className="flex-1 bg-[#002B5B] text-white py-5 rounded-2xl font-black uppercase shadow-xl">Salvar</button><button onClick={() => setCliEdit(null)} className="px-8 bg-slate-100 text-slate-400 py-5 rounded-2xl font-black uppercase">Sair</button></div>
            </div>
          </div>
        </div>
      )}

      {entEdit && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-lg shadow-2xl p-10 animate-in zoom-in">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-8">{entEdit.id ? 'Editar' : 'Novo'} Entregador</h2>
            <div className="space-y-6">
              <input type="text" value={entEdit.nome || ''} onChange={e => setEntEdit({...entEdit, nome: e.target.value})} placeholder="Nome" className="w-full bg-slate-50 border-2 py-5 px-6 rounded-2xl font-bold outline-none" />
              <input type="text" value={entEdit.veiculo || ''} onChange={e => setEntEdit({...entEdit, veiculo: e.target.value})} placeholder="Veículo" className="w-full bg-slate-50 border-2 py-5 px-6 rounded-2xl font-bold outline-none" />
              <input type="tel" value={entEdit.telefone || ''} onChange={e => setEntEdit({...entEdit, telefone: e.target.value.replace(/\D/g, '')})} placeholder="WhatsApp" className="w-full bg-slate-50 border-2 py-5 px-6 rounded-2xl font-bold outline-none" />
              <div className="flex gap-4 mt-6"><button onClick={async () => { setLoading(true); await gasService.salvarEntregador(entEdit); setLoading(false); setEntEdit(null); loadData(); }} className="flex-1 bg-[#002B5B] text-white py-5 rounded-2xl font-black uppercase shadow-xl">Confirmar</button><button onClick={() => setEntEdit(null)} className="px-8 bg-slate-100 text-slate-400 py-5 rounded-2xl font-black uppercase">Cancelar</button></div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-sm z-[300] flex items-center justify-center">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 animate-pulse border border-slate-200"><div className="w-16 h-16 border-4 border-slate-100 border-t-[#002B5B] rounded-full animate-spin"></div><span className="font-black text-slate-800 uppercase text-[10px] tracking-widest">Processando...</span></div>
        </div>
      )}

      {message && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] px-10 py-5 rounded-3xl shadow-2xl text-white font-black flex items-center gap-4 animate-in slide-in-from-bottom-10 ${message.type === 'success' ? 'bg-emerald-600' : 'bg-rose-500'}`}><i className="fas fa-check-circle text-xl"></i>{message.text}</div>
      )}
    </div>
  );
};

export default App;
