
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

  // Formulário de Novo Pedido
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [selectedProduto, setSelectedProduto] = useState<string>('');
  const [quantidade, setQuantidade] = useState<number>(1);
  const [cart, setCart] = useState<PedidoItem[]>([]);
  const [selectedEntregador, setSelectedEntregador] = useState<string>('');
  const [formaPagamento, setFormaPagamento] = useState<string>(PaymentMethod.DINHEIRO);
  
  // Estado para Lançamento Financeiro Manual
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

  // Outros estados de UI e Edição
  const [prodEdit, setProdEdit] = useState<Partial<Produto> | null>(null);
  const [entEdit, setEntEdit] = useState<Partial<Entregador> | null>(null);
  const [cliEdit, setCliEdit] = useState<Partial<Cliente> | null>(null);
  const [cliFilter, setCliFilter] = useState('');
  const [nameSearchResults, setNameSearchResults] = useState<Cliente[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Categorias Sugeridas
  const categoriasReceita = ['Venda Direta', 'Bonificação', 'Investimento', 'Reembolso', 'Outros'];
  const categoriasDespesa = ['Combustível', 'Manutenção Moto', 'Aluguel / Luz', 'Estoque', 'Funcionários', 'Marketing', 'Outros'];

  // Carregamento de Dados
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
      setMessage({ type: 'error', text: 'Falha ao sincronizar com o servidor.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Handlers de Clientes
  const handleOpenNewCustomerModal = () => {
    setCliEdit({
      nome: '',
      telefone: '',
      endereco: '',
      bairro: '',
      referencia: ''
    });
  };

  const handleSaveCustomer = async () => {
    if (!cliEdit || !cliEdit.nome || !cliEdit.telefone) {
      setMessage({ type: 'error', text: 'Nome e Telefone são obrigatórios.' });
      return;
    }
    setLoading(true);
    try {
      const res = await gasService.salvarCliente(cliEdit);
      if (res.success) {
        setMessage({ type: 'success', text: 'Cadastro salvo com sucesso!' });
        setCliEdit(null);
        await loadData();
      } else {
        setMessage({ type: 'error', text: 'Erro ao processar salvamento.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro técnico ao salvar cliente.' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!id) return;
    if (!confirm('Deseja realmente excluir este cliente permanentemente?')) return;
    
    setLoading(true);
    try {
      const res = await gasService.excluirCliente(id);
      if (res.success) {
        setMessage({ type: 'success', text: 'Cliente removido do sistema!' });
        await loadData();
      } else {
        setMessage({ type: 'error', text: 'O servidor não permitiu a exclusão.' });
      }
    } catch (err) {
      console.error('Erro ao excluir:', err);
      setMessage({ type: 'error', text: 'Erro ao tentar excluir cliente.' });
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleSaveLançamento = async () => {
    if (!finEntry.descricao || !finEntry.valor || parseFloat(finEntry.valor) <= 0) {
      setMessage({ type: 'error', text: 'Preencha todos os campos.' });
      return;
    }
    setLoading(true);
    const res = await gasService.registrarMovimentacao(finEntry);
    setLoading(false);
    if (res.success) {
      setMessage({ type: 'success', text: 'Lançamento financeiro realizado!' });
      setIsFinanceModalOpen(false);
      setFinEntry({ tipo: 'Saída', descricao: '', valor: '', categoria: 'Outros', metodo: PaymentMethod.DINHEIRO });
      loadData();
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleAddItem = () => {
    const prod = produtos.find(p => p.nome === selectedProduto);
    if (!prod) return;
    setCart([...cart, { produtoId: prod.id, nome: prod.nome, qtd: quantidade, precoUnitario: prod.preco }]);
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
    } else { setMessage({ type: 'error', text: 'Erro ao salvar pedido.' }); }
    setTimeout(() => setMessage(null), 5000);
  };

  const handlePrintReceipt = (p: Pedido) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const summaryHtml = p.itens && p.itens.length > 0 
        ? p.itens.map(it => `<div class="row"><span>${it.qtd}x ${it.nome}</span><span>R$ ${(it.qtd * it.precoUnitario).toFixed(2)}</span></div>`).join('')
        : `<div class="row"><span>${p.produtoSummary}</span><span>R$ ${p.valorTotal}</span></div>`;

    const content = `
      <html><head><style>
        body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; padding: 10px; font-size: 11px; }
        .header { text-align: center; border-bottom: 1px dashed #000; margin-bottom: 10px; padding-bottom: 10px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
        .total { border-top: 1px dashed #000; margin-top: 10px; padding-top: 5px; font-weight: bold; font-size: 14px; text-align: right; }
      </style></head><body>
        <div class="header"><strong>BIO GÁS</strong><br>#${p.id}</div>
        <div class="row"><span>Data:</span> <span>${p.dataHora}</span></div>
        <div class="row"><span>Cliente:</span> <span>${p.nomeCliente}</span></div>
        <div class="row"><span>Endereço:</span> <span>${p.endereco}</span></div>
        <div style="margin-top: 10px; border-bottom: 1px solid #eee; font-weight: bold;">ITENS:</div>
        ${summaryHtml}
        <div class="total">TOTAL: R$ ${Number(p.valorTotal).toFixed(2)}</div>
        <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500);}</script>
      </body></html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const jsonRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        const formatted = jsonRows.map(r => ({ nome: String(r.Nome || r.Cliente || ''), telefone: String(r.Telefone || r.Tel || '').replace(/\D/g, ''), endereco: String(r.Endereco || r.Endereço || '') })).filter(c => c.nome && c.telefone);
        if (formatted.length > 0) {
          const res = await gasService.salvarClientesEmMassa(formatted);
          if (res.success) { setMessage({ type: 'success', text: `${res.count} clientes importados!` }); await loadData(); }
        }
      } catch (err) { setMessage({ type: 'error', text: 'Falha no arquivo Excel.' }); }
      finally { setLoading(false); setTimeout(() => setMessage(null), 5000); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePhoneBlur = async () => {
    const clean = telefone.replace(/\D/g, '');
    if (clean.length < 8) return;
    setSearching(true);
    const c = await gasService.buscarClientePorTelefone(clean);
    if (c) { setNome(c.nome); setEndereco(c.endereco); setTelefone(c.telefone); }
    setSearching(false);
  };

  const handleNameInput = (val: string) => {
    setNome(val);
    if (val.length >= 2) {
      const results = clientes.filter(c => 
        c.nome.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 5);
      setNameSearchResults(results);
    } else {
      setNameSearchResults([]);
    }
  };

  const selectCustomerFromSearch = (c: Cliente) => {
    setNome(c.nome);
    setTelefone(c.telefone);
    setEndereco(c.endereco);
    setNameSearchResults([]);
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
    <div className="flex h-screen overflow-hidden">
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

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto bg-[#F8FAFC] flex flex-col">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-10 sticky top-0 z-40">
          <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <div className="w-1.5 h-6 bg-[#0088CC] rounded-full"></div>
            {activeTab === 'dashboard' && 'Novo Pedido & Despacho'}
            {activeTab === 'clientes' && 'Gestão de Clientes'}
            {activeTab === 'caixa' && 'Fluxo de Caixa'}
            {activeTab === 'equipe' && 'Equipe Logística'}
            {activeTab === 'estoque' && 'Controle de Estoque'}
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-sm font-black text-emerald-500 flex items-center gap-2"><span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>SISTEMA ONLINE</div>
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 border border-slate-200 shadow-sm"><i className="fas fa-user"></i></div>
          </div>
        </header>

        <div className="p-10">
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
              <div className="xl:col-span-2 space-y-8">
                <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Telefone</label>
                        <input type="tel" value={telefone} onChange={e => setTelefone(e.target.value.replace(/\D/g, ''))} onBlur={handlePhoneBlur} placeholder="Apenas números" className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] rounded-2xl py-5 px-6 font-black text-lg outline-none transition-all" />
                    </div>
                    <div className="space-y-2 relative">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Nome do Cliente</label>
                        <input type="text" value={nome} onChange={e => handleNameInput(e.target.value)} placeholder="Ex: João Silva" className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] rounded-2xl py-5 px-6 font-black text-lg outline-none transition-all" />
                        {nameSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden ring-1 ring-black/5 animate-in slide-in-from-top-2 duration-200">
                            {nameSearchResults.map(c => (
                              <button key={c.id} onClick={() => selectCustomerFromSearch(c)} className="w-full text-left p-5 hover:bg-slate-50 flex justify-between items-center transition-colors group border-b border-slate-50 last:border-0">
                                <div>
                                  <div className="font-black text-slate-800 group-hover:text-[#002B5B] transition-colors">{c.nome}</div>
                                  <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-0.5">{c.telefone}</div>
                                </div>
                                <i className="fas fa-chevron-right text-slate-200 group-hover:text-[#002B5B] group-hover:translate-x-1 transition-all"></i>
                              </button>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                  <div className="space-y-2 mb-8">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Endereço Completo</label>
                    <textarea value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, Número, Bairro..." className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] rounded-2xl py-5 px-6 font-bold text-lg outline-none h-24 resize-none" />
                  </div>
                  <div className="mb-10 p-6 bg-slate-50 rounded-[2rem] border border-slate-100">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-2">Itens do Pedido</h3>
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                      <select value={selectedProduto} onChange={e => setSelectedProduto(e.target.value)} className="flex-1 bg-white py-4 px-6 rounded-xl font-bold border-2 border-transparent focus:border-[#002B5B] outline-none">
                        <option value="">Adicionar Produto...</option>
                        {produtos.map(p => <option key={p.id} value={p.nome}>{p.nome} - R$ {p.preco.toFixed(2)}</option>)}
                      </select>
                      <div className="flex gap-4">
                        <input type="number" min="1" value={quantidade} onChange={e => setQuantidade(Number(e.target.value))} className="w-24 bg-white py-4 px-2 rounded-xl font-black text-center outline-none" />
                        <button onClick={handleAddItem} disabled={!selectedProduto} className="bg-[#002B5B] text-[#FFD700] px-6 py-4 rounded-xl font-black text-xs uppercase hover:scale-105 transition-all">Add</button>
                      </div>
                    </div>
                    {cart.length > 0 && (
                      <div className="space-y-3">
                        {cart.map((item, idx) => (
                          <div key={idx} className="bg-white p-4 rounded-xl flex items-center justify-between border border-slate-100">
                            <span className="font-bold text-slate-700">{item.qtd}x {item.nome}</span>
                            <div className="flex items-center gap-6"><span className="font-black text-slate-800 text-sm">R$ {(item.precoUnitario * item.qtd).toFixed(2)}</span><button onClick={() => setCart(cart.filter((_, i) => i !== idx))} className="text-rose-400"><i className="fas fa-trash-alt"></i></button></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    <select value={selectedEntregador} onChange={e => setSelectedEntregador(e.target.value)} className="w-full bg-slate-50 py-5 px-6 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-[#002B5B]">
                      <option value="">Entregador...</option>
                      {entregadores.filter(e => e.status === 'Ativo').map(e => <option key={e.id} value={e.nome}>{e.nome}</option>)}
                    </select>
                    <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className="w-full bg-slate-50 py-5 px-6 rounded-2xl font-bold outline-none border-2 border-transparent focus:border-[#002B5B]">
                      {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-between bg-[#002B5B] rounded-[2.5rem] p-8 text-white shadow-2xl gap-6 border-b-8 border-[#FFD700]">
                    <div><div className="text-[10px] font-black text-[#0088CC] uppercase tracking-widest mb-1">Total</div><div className="text-4xl font-black">R$ {cart.reduce((a, b) => a + (b.qtd * b.precoUnitario), 0).toFixed(2)}</div></div>
                    <button onClick={handleCreateOrder} disabled={loading || cart.length === 0 || !selectedEntregador || !nome} className="bg-[#FFD700] hover:bg-[#e6c200] text-[#002B5B] px-12 py-5 rounded-2xl font-black uppercase text-sm tracking-widest transition-all">Finalizar Pedido</button>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                 <h3 className="font-black text-slate-800 uppercase text-xs tracking-wider">📦 Entregas Ativas</h3>
                 <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
                    {activeOrders.map(p => (
                        <div key={p.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm group hover:border-[#0088CC]/30 transition-all">
                            <div className="flex justify-between items-start mb-4"><div className={`text-[10px] font-black px-3 py-1 rounded-full uppercase ${p.status === 'Pendente' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-[#002B5B]'}`}>{p.status}</div><div className="text-[10px] font-bold text-slate-400">{p.dataHora}</div></div>
                            <div className="font-black text-slate-800 text-lg mb-1">{p.nomeCliente}</div>
                            <div className="text-xs text-slate-500 font-medium mb-3 line-clamp-1">{p.endereco}</div>
                            <div className="text-[10px] font-black text-slate-400 uppercase mb-4 border-l-2 border-[#0088CC] pl-2">{p.produtoSummary || 'Itens diversos'}</div>
                            <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                                <div className="text-sm font-black text-[#002B5B]">R$ {Number(p.valorTotal).toFixed(2)}</div>
                                <div className="flex gap-2">
                                    <button onClick={() => handlePrintReceipt(p)} className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-[#002B5B] hover:text-white transition-all"><i className="fas fa-print"></i></button>
                                    {p.status === 'Pendente' && <button onClick={async () => { setLoading(true); await gasService.atualizarStatusPedido(p.id, 'Em Rota'); await loadData(); }} className="bg-[#002B5B] text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-lg">Despachar</button>}
                                    {p.status === 'Em Rota' && <button onClick={async () => { setLoading(true); await gasService.atualizarStatusPedido(p.id, 'Entregue'); await loadData(); setMessage({ type: 'success', text: 'Entregue!' }); setTimeout(() => setMessage(null), 3000); }} className="px-5 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[10px] uppercase hover:bg-emerald-600 hover:text-white transition-all">OK</button>}
                                </div>
                            </div>
                        </div>
                    ))}
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'clientes' && (
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[75vh]">
              <div className="p-10 border-b flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-50/30">
                <div className="relative w-full md:w-96">
                   <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"></i>
                   <input type="text" value={cliFilter} onChange={e => setCliFilter(e.target.value)} placeholder="Procurar cliente..." className="w-full bg-white border-2 border-transparent focus:border-[#002B5B] rounded-2xl py-4 pl-12 pr-6 font-bold outline-none shadow-sm transition-all" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => fileInputRef.current?.click()} className="bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center gap-2"><i className="fas fa-file-excel"></i> Importar</button>
                  <input type="file" ref={fileInputRef} onChange={handleExcelImport} accept=".xlsx, .xls" className="hidden" />
                  <button onClick={handleOpenNewCustomerModal} className="bg-[#002B5B] text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-lg shadow-blue-100 hover:bg-blue-900 transition-all flex items-center gap-2">
                    <i className="fas fa-plus"></i> Novo Cliente
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-4">
                    <tr><th className="pb-4">Cliente</th><th className="pb-4">Contato</th><th className="pb-4">Localização</th><th className="pb-4 text-right">Ações</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredClientes.map(c => (
                      <tr key={c.id} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="py-6">
                           <div className="font-black text-slate-800">{c.nome}</div>
                           <div className="text-[10px] text-slate-400 font-bold uppercase">Cadastrado: {c.dataCadastro}</div>
                        </td>
                        <td className="py-6 font-bold text-slate-500">{c.telefone}</td>
                        <td className="py-6">
                           <div className="text-sm text-slate-600 font-medium truncate max-w-[300px]">{c.endereco}</div>
                           <div className="text-[10px] text-[#0088CC] font-black uppercase mt-1">{c.bairro || 'Sem bairro'}</div>
                        </td>
                        <td className="py-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setCliEdit(c)} className="w-10 h-10 bg-white border border-slate-100 text-slate-400 rounded-xl flex items-center justify-center hover:bg-[#002B5B] hover:text-white transition-all shadow-sm"><i className="fas fa-edit"></i></button>
                            <button onClick={() => handleDeleteCustomer(c.id)} className="w-10 h-10 bg-white border border-slate-100 text-slate-400 rounded-xl flex items-center justify-center hover:bg-rose-600 hover:text-white transition-all shadow-sm"><i className="fas fa-trash"></i></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'caixa' && resumo && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-emerald-600 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="text-[10px] font-black uppercase opacity-70 mb-2 tracking-widest">Receitas</div>
                    <div className="text-4xl font-black">R$ {resumo.totalEntradas.toFixed(2)}</div>
                  </div>
                  <i className="fas fa-arrow-trend-up absolute -right-4 -bottom-4 text-8xl text-white/10"></i>
                </div>
                <div className="bg-rose-600 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="text-[10px] font-black uppercase opacity-70 mb-2 tracking-widest">Despesas</div>
                    <div className="text-4xl font-black">R$ {resumo.totalSaidas.toFixed(2)}</div>
                  </div>
                  <i className="fas fa-arrow-trend-down absolute -right-4 -bottom-4 text-8xl text-white/10"></i>
                </div>
                <div className="bg-[#002B5B] p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="text-[10px] font-black uppercase opacity-70 mb-2 tracking-widest">Saldo em Caixa</div>
                    <div className="text-4xl font-black">R$ {resumo.saldo.toFixed(2)}</div>
                  </div>
                  <i className="fas fa-vault absolute -right-4 -bottom-4 text-8xl text-white/10"></i>
                </div>
              </div>
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-10">
                  <div className="flex justify-between items-center mb-8 border-b pb-8">
                    <h3 className="font-black text-slate-800 uppercase text-xs tracking-wider">Lançamentos Recentes</h3>
                    <button onClick={() => setIsFinanceModalOpen(true)} className="bg-[#002B5B] text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase shadow-md">Novo Lançamento</button>
                  </div>
                  <div className="space-y-4">
                    {resumo.recentes.map(m => (
                      <div key={m.id} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-4">
                           <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.tipo === 'Entrada' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                             <i className={`fas ${m.tipo === 'Entrada' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                           </div>
                           <div>
                             <div className="font-black text-slate-800 text-sm">{m.descricao}</div>
                             <div className="text-[10px] font-bold text-slate-400">{m.dataHora}</div>
                           </div>
                        </div>
                        <div className={`font-black ${m.tipo === 'Entrada' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {m.tipo === 'Entrada' ? '+' : '-'} R$ {m.valor.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
              </div>
            </div>
          )}

          {activeTab === 'equipe' && (
             <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-10">
               <div className="flex justify-between items-center mb-10"><h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Equipe Logística</h2><button onClick={() => setEntEdit({})} className="bg-[#002B5B] text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-lg">Adicionar</button></div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {entregadores.map(e => (
                   <div key={e.id} className="p-8 bg-slate-50 border border-slate-100 rounded-[2rem] flex flex-col items-center text-center relative group">
                     <button onClick={() => setEntEdit(e)} className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 w-8 h-8 bg-white rounded-lg shadow-sm text-slate-400 hover:text-[#002B5B] transition-all"><i className="fas fa-edit text-xs"></i></button>
                     <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-[#002B5B] text-2xl shadow-sm mb-4 border border-slate-100"><i className="fas fa-motorcycle"></i></div>
                     <div className="font-black text-slate-800 text-lg">{e.nome}</div>
                     <div className="text-xs font-bold text-slate-400 uppercase mb-4">{e.veiculo || 'Moto'}</div>
                     <div className={`text-[10px] font-black uppercase px-4 py-1.5 rounded-full ${e.status === 'Ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>{e.status}</div>
                   </div>
                 ))}
               </div>
             </div>
          )}

          {activeTab === 'estoque' && (
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 p-10">
               <div className="flex justify-between items-center mb-10"><h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Estoque</h2><button onClick={() => setProdEdit({})} className="bg-[#002B5B] text-white px-8 py-4 rounded-2xl font-black text-xs uppercase shadow-lg">Novo Item</button></div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {produtos.map(p => (
                    <div key={p.id} className="bg-slate-50 border border-slate-100 p-8 rounded-[2.5rem] hover:bg-white transition-all group">
                      <div className="flex justify-between items-start mb-6"><div className="bg-white p-4 rounded-2xl shadow-sm border text-[#0088CC] group-hover:bg-[#002B5B] group-hover:text-[#FFD700] transition-colors"><i className="fas fa-boxes-stacked text-xl"></i></div><div className="text-right"><div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo</div><div className={`text-2xl font-black ${p.estoque < 10 ? 'text-rose-500' : 'text-slate-800'}`}>{p.estoque} un</div></div></div>
                      <div className="mb-6"><div className="font-black text-slate-800 text-lg">{p.nome}</div><div className="text-sm font-bold text-[#0088CC]">R$ {p.preco.toFixed(2)}</div></div>
                      <button onClick={() => setProdEdit(p)} className="w-full bg-white border py-3 rounded-xl font-black text-[10px] uppercase text-slate-400 hover:bg-[#002B5B] hover:text-white transition-all">Editar</button>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL CLIENTE */}
      {cliEdit && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-xl shadow-2xl p-10 animate-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{cliEdit.id ? 'Editar Cadastro' : 'Novo Cliente'}</h2>
              <button onClick={() => setCliEdit(null)} className="w-12 h-12 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 transition-colors">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="space-y-5 overflow-y-auto max-h-[75vh] pr-2 custom-scrollbar">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nome do Cliente</label>
                <input type="text" value={cliEdit.nome || ''} onChange={e => setCliEdit({...cliEdit, nome: e.target.value})} placeholder="Ex: Maria das Dores" className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-4 px-6 rounded-2xl font-bold outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Telefone</label>
                <input type="tel" value={cliEdit.telefone || ''} onChange={e => setCliEdit({...cliEdit, telefone: e.target.value.replace(/\D/g, '')})} placeholder="Apenas números" className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-4 px-6 rounded-2xl font-bold outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Endereço (Rua e Número)</label>
                <input type="text" value={cliEdit.endereco || ''} onChange={e => setCliEdit({...cliEdit, endereco: e.target.value})} placeholder="Rua principal, 10" className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-4 px-6 rounded-2xl font-bold outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Bairro</label>
                  <input type="text" value={cliEdit.bairro || ''} onChange={e => setCliEdit({...cliEdit, bairro: e.target.value})} placeholder="Bairro" className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-4 px-6 rounded-2xl font-bold outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Ponto de Referência</label>
                  <input type="text" value={cliEdit.referencia || ''} onChange={e => setCliEdit({...cliEdit, referencia: e.target.value})} placeholder="Perto de..." className="w-full bg-slate-50 border-2 border-transparent focus:border-[#002B5B] py-4 px-6 rounded-2xl font-bold outline-none" />
                </div>
              </div>
              <button onClick={handleSaveCustomer} className="w-full bg-[#002B5B] text-white py-5 rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl hover:bg-blue-900 transition-all mt-4">
                {cliEdit.id ? 'Salvar Alterações' : 'Confirmar Cadastro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FEEDBACK & LOADING */}
      {loading && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-sm z-[300] flex items-center justify-center">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 border border-slate-200">
             <div className="relative">
                <div className="w-16 h-16 border-4 border-slate-100 border-t-[#002B5B] rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-[#002B5B]"><i className="fas fa-sync-alt"></i></div>
             </div>
             <span className="font-black text-slate-800 uppercase text-[10px] tracking-widest">Sincronizando...</span>
          </div>
        </div>
      )}

      {message && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] px-10 py-5 rounded-3xl shadow-2xl text-white font-black flex items-center gap-4 animate-in slide-in-from-bottom-10 ${message.type === 'success' ? 'bg-[#002B5B]' : 'bg-rose-500'}`}>
          <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-triangle-exclamation'} text-xl`}></i>
          {message.text}
        </div>
      )}
    </div>
  );
};

export default App;
