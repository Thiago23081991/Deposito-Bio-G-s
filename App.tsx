
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { gasService } from './services/gasMock.ts';
import { Cliente, Produto, Entregador, Pedido, PaymentMethod, ResumoFinanceiro, PedidoItem, Movimentacao, ChatMessage, RelatorioMensal } from './types.ts';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import * as XLSX from 'xlsx';

const App: React.FC = () => {
  // --- ESTADO GLOBAL ---
  const [activeTab, setActiveTab] = useState<'vendas' | 'caixa' | 'cobranca' | 'estoque' | 'clientes' | 'entregadores' | 'marketing'>('vendas');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // --- DADOS ---
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);

  // --- SELEÇÃO EM MASSA & FILTROS ---
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [searchTermCRM, setSearchTermCRM] = useState('');

  // --- MODAIS ---
  const [showEntregadorModal, setShowEntregadorModal] = useState(false);
  const [novoEntregador, setNovoEntregador] = useState({ id: '', nome: '', telefone: '', veiculo: '', status: 'Ativo' as 'Ativo' | 'Inativo' });

  // --- MODAL FINANCEIRO ---
  const [showFinanceiroModal, setShowFinanceiroModal] = useState(false);
  const [movimentacaoForm, setMovimentacaoForm] = useState({ tipo: 'Entrada', descricao: '', valor: '', categoria: 'Geral' });
  
  // --- MODAL RELATÓRIO ---
  const [showRelatorioModal, setShowRelatorioModal] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioMensal | null>(null);

  // --- MODAL PRODUTO (ESTOQUE) ---
  const [showProdutoModal, setShowProdutoModal] = useState(false);
  const [novoProduto, setNovoProduto] = useState<Produto>({ id: '', nome: '', preco: 0, estoque: 0, unidadeMedida: 'unidade', precoCusto: 0 });

  // --- ATENDIMENTO ---
  const [nomeBusca, setNomeBusca] = useState('');
  const [telBusca, setTelBusca] = useState('');
  const [endBusca, setEndBusca] = useState('');
  const [cart, setCart] = useState<PedidoItem[]>([]);
  const [formaPgto, setFormaPgto] = useState<string>(PaymentMethod.DINHEIRO);
  const [selectedEntregador, setSelectedEntregador] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // --- MARKETING IA ---
  const [mktMessage, setMktMessage] = useState('');
  const [mktBairroFilter, setMktBairroFilter] = useState('Todos');
  const [isGeneratingMkt, setIsGeneratingMkt] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ESTOQUE_MINIMO = 10;
  const produtosEstoqueBaixo = useMemo(() => produtos.filter(p => p.estoque < ESTOQUE_MINIMO), [produtos]);

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
      setMessage({ type: 'error', text: 'Erro ao sincronizar com a nuvem.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // --- GERAÇÃO RELATÓRIO ---
  const handleGerarRelatorio = async () => {
    setLoading(true);
    try {
      const rel = await gasService.gerarRelatorioMensal();
      setRelatorio(rel);
      setShowRelatorioModal(true);
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao gerar relatório.' });
    } finally {
      setLoading(false);
    }
  };

  // --- IMPRESSÃO DE RECIBO ---
  const handlePrintReceipt = () => {
    if (cart.length === 0) {
      setMessage({ type: 'error', text: 'Carrinho vazio! Adicione itens para imprimir.' });
      return;
    }

    const total = cart.reduce((acc, i) => acc + (i.qtd * i.precoUnitario), 0);
    const dateStr = new Date().toLocaleString('pt-BR');

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(`
        <html>
        <head>
          <title>Recibo - Bio Gás PRO</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; max-width: 80mm; margin: 0 auto; padding: 10px; }
            .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
            .title { font-size: 16px; font-weight: bold; }
            .info { margin-bottom: 10px; }
            .item { display: flex; justify-content: space-between; margin-bottom: 3px; }
            .divider { border-top: 1px dashed #000; margin: 10px 0; }
            .total { font-size: 14px; font-weight: bold; text-align: right; margin-top: 5px; }
            .footer { text-align: center; margin-top: 20px; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">BIO GÁS PRO</div>
            <div>Entrega Rápida e Segura</div>
            <div>Recibo de Venda</div>
          </div>
          <div class="info">
            <strong>Data:</strong> ${dateStr}<br/>
            <strong>Cliente:</strong> ${nomeBusca || 'Consumidor Final'}<br/>
            <strong>Tel:</strong> ${telBusca || '-'}<br/>
            <strong>Endereço:</strong> ${endBusca || 'Balcão/Retirada'}<br/>
            <strong>Entregador:</strong> ${selectedEntregador || 'Logística'}
          </div>
          <div class="divider"></div>
          <div class="items">
            ${cart.map(item => `
              <div class="item">
                <span>${item.qtd}x ${item.nome}</span>
                <span>R$ ${(item.qtd * item.precoUnitario).toFixed(2)}</span>
              </div>
            `).join('')}
          </div>
          <div class="divider"></div>
          <div class="total">TOTAL: R$ ${total.toFixed(2)}</div>
          <div style="text-align: right; font-size: 11px;">Forma Pagto: ${formaPgto}</div>
          <div class="footer">
            Obrigado pela preferência!<br/>
            Volte sempre.
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // --- ENVIO RECIBO WHATSAPP ---
  const handleSendReceiptWhatsApp = () => {
    if (cart.length === 0) {
      setMessage({ type: 'error', text: 'Carrinho vazio!' });
      return;
    }
    
    const total = cart.reduce((acc, i) => acc + (i.qtd * i.precoUnitario), 0);
    const dateStr = new Date().toLocaleString('pt-BR');
    
    let msg = `*🧾 BIO GÁS PRO - RECIBO DIGITAL*\n`;
    msg += `📅 ${dateStr}\n`;
    msg += `👤 Cliente: ${nomeBusca || 'Consumidor'}\n`;
    if(selectedEntregador) msg += `🛵 Entregador: ${selectedEntregador}\n\n`;
    else msg += `\n`;
    
    msg += `*ITENS DO PEDIDO:*\n`;
    
    cart.forEach(item => {
      msg += `${item.qtd}x ${item.nome} - R$ ${(item.qtd * item.precoUnitario).toFixed(2)}\n`;
    });
    
    msg += `\n💰 *TOTAL: R$ ${total.toFixed(2)}*\n`;
    msg += `💳 Forma Pagto: ${formaPgto}\n\n`;
    msg += `✅ _Obrigado pela preferência!_`;
    
    const phone = telBusca ? telBusca.replace(/\D/g, '') : '';
    // Se tiver telefone, abre direto a conversa, senão abre seleção de contato
    const url = phone 
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
      
    window.open(url, '_blank');
  };

  // --- IMPORTAÇÃO INTELIGENTE DE ENDEREÇO ---
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

        const normalizeKey = (key: string) => key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

        const findValue = (row: any, keywords: string[]) => {
          const keys = Object.keys(row);
          const foundKey = keys.find(k => keywords.includes(normalizeKey(k)));
          return foundKey ? String(row[foundKey]).trim() : '';
        };

        const formatted = data.map((row: any) => ({
          nome: findValue(row, ['nome', 'cliente', 'consumidor']),
          telefone: findValue(row, ['tel', 'telefone', 'whats', 'celular', 'fone']).replace(/\D/g, ''),
          endereco: findValue(row, ['endereco', 'rua', 'logradouro', 'local', 'addr', 'localizacao', 'end']),
          bairro: findValue(row, ['bairro', 'regiao', 'setor']),
          referencia: findValue(row, ['ref', 'referencia', 'ponto', 'obs'])
        })).filter(c => c.nome && c.telefone);

        if (formatted.length > 0) {
          await gasService.importarClientesEmMassa(formatted);
          setMessage({ type: 'success', text: `${formatted.length} Clientes com Endereços Importados!` });
          await loadData(true);
        } else {
          setMessage({ type: 'error', text: 'Nenhum cliente válido na planilha.' });
        }
      } catch (err) {
        setMessage({ type: 'error', text: 'Erro ao processar arquivo.' });
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- LOGÍSTICA & STATUS ---
  const processStatusUpdate = async (ids: string[], novoStatus: 'Entregue' | 'Cancelado' | 'Em Rota') => {
    setLoading(true);
    try {
      await gasService.atualizarStatusPedidosEmMassa(ids, novoStatus);
      if (novoStatus === 'Em Rota') {
        const orders = pedidos.filter(p => ids.includes(p.id));
        let summary = `*🚚 BIO GÁS - ROTA DE ENTREGA*\n\n`;
        orders.forEach((o, i) => summary += `*${i+1}. ${o.nomeCliente}*\n📍 ${o.endereco}\n💰 *R$ ${Number(o.valorTotal).toFixed(2)}*\n\n`);
        window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank');
      }
      setMessage({ type: 'success', text: 'Logística atualizada!' });
      setSelectedOrderIds([]);
      await loadData(true);
    } finally { setLoading(false); }
  };

  // --- MARKETING IA ---
  const generateMktCopy = async (tipo: string) => {
    setIsGeneratingMkt(true);
    try {
      const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
      const prompt = `Gere uma mensagem curta e persuasiva de WhatsApp para um depósito de gás. Assunto: ${tipo}. Use [nome] para o cliente e emojis.`;
      const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
      setMktMessage(res.text || '');
    } catch {
      setMessage({ type: 'error', text: 'Erro na IA.' });
    } finally { setIsGeneratingMkt(false); }
  };

  // --- RENDERS ---
  const renderVendas = () => {
    const cartTotal = cart.reduce((acc, i) => acc + (i.qtd * i.precoUnitario), 0);
    const filteredPedidos = pedidos.filter(p => filterStatus === 'Todos' || p.status === filterStatus);
    const suggestions = nomeBusca.length > 0 ? clientes.filter(c => c.nome.toLowerCase().includes(nomeBusca.toLowerCase()) || c.telefone.includes(nomeBusca)).slice(0, 5) : [];
    
    // Funções auxiliares para o carrinho
    const updateQty = (prodId: string, delta: number) => {
      setCart(prev => prev.map(item => {
         if(item.produtoId === prodId) {
            const newQty = Math.max(1, item.qtd + delta);
            return {...item, qtd: newQty};
         }
         return item;
      }));
    };

    const setQtyManual = (prodId: string, value: string) => {
       const qty = parseInt(value);
       if (!isNaN(qty) && qty > 0) {
          setCart(prev => prev.map(item => item.produtoId === prodId ? {...item, qtd: qty} : item));
       }
    };

    const removeItem = (prodId: string) => {
       setCart(prev => prev.filter(item => item.produtoId !== prodId));
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-black mb-4 flex items-center gap-2 text-slate-800"><i className="fas fa-headset text-blue-600"></i> Atendimento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
              <div className="md:col-span-2 relative">
                <input className="w-full pl-12 pr-5 py-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-bold" placeholder="Digite nome ou telefone..." value={nomeBusca} onChange={e => {setNomeBusca(e.target.value); setShowSuggestions(true);}} />
                <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"></i>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white shadow-2xl rounded-2xl border z-50 mt-2 overflow-hidden">
                    {suggestions.map(c => (
                      <button key={c.id} onClick={() => {setNomeBusca(c.nome); setTelBusca(c.telefone); setEndBusca(c.endereco); setShowSuggestions(false);}} className="w-full p-4 text-left hover:bg-blue-50 border-b flex justify-between items-center">
                        <div><p className="font-black text-slate-800 text-sm">{c.nome}</p><p className="text-[10px] text-slate-400">{c.telefone}</p></div>
                        <p className="text-[9px] text-slate-400 truncate max-w-[50%] font-bold italic">📍 {c.endereco}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold" placeholder="WhatsApp" value={telBusca} onChange={e => setTelBusca(e.target.value)} />
              <input className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold" placeholder="Endereço de Entrega" value={endBusca} onChange={e => setEndBusca(e.target.value)} />
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {produtos.map(p => (
                <button key={p.id} onClick={() => setCart(prev => {
                  const ex = prev.find(i => i.produtoId === p.id);
                  if(ex) return prev.map(i => i.produtoId === p.id ? {...i, qtd: i.qtd+1} : i);
                  return [...prev, { produtoId: p.id, nome: p.nome, qtd: 1, precoUnitario: p.preco }];
                })} className="px-5 py-3 bg-white border-2 rounded-2xl font-black text-[10px] uppercase border-slate-100 hover:border-blue-500 hover:text-blue-600 transition">+ {p.nome}</button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative">
            {selectedOrderIds.length > 0 && (
              <div className="absolute top-0 left-0 w-full bg-slate-900 p-4 z-20 flex justify-between items-center animate-in slide-in-from-top-4">
                <span className="text-white font-black text-[10px] uppercase tracking-widest">{selectedOrderIds.length} Selecionados</span>
                <div className="flex gap-2">
                  <button onClick={() => processStatusUpdate(selectedOrderIds, 'Em Rota')} className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-lg uppercase">Despachar</button>
                  <button onClick={() => processStatusUpdate(selectedOrderIds, 'Entregue')} className="px-4 py-2 bg-emerald-500 text-white text-[10px] font-black rounded-lg uppercase">Dar Baixa</button>
                  <button onClick={() => setSelectedOrderIds([])} className="ml-2 text-white/50 text-xl">×</button>
                </div>
              </div>
            )}
            <div className="px-6 py-5 bg-slate-50/50 border-b flex justify-between items-center">
              <h3 className="font-black text-slate-800 uppercase text-xs">📦 Painel Logístico</h3>
              <div className="flex bg-white p-1 rounded-xl border">
                {['Todos', 'Pendente', 'Em Rota', 'Entregue'].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg ${filterStatus === s ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400'}`}>{s}</button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {filteredPedidos.map(p => (
                <div key={p.id} className={`p-5 flex justify-between items-center hover:bg-slate-50 cursor-pointer ${selectedOrderIds.includes(p.id) ? 'bg-blue-50' : ''}`} onClick={() => setSelectedOrderIds(prev => prev.includes(p.id) ? prev.filter(i => i !== p.id) : [...prev, p.id])}>
                  <div className="flex items-center gap-4">
                    <input type="checkbox" checked={selectedOrderIds.includes(p.id)} readOnly className="w-4 h-4 rounded text-blue-600" />
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.status === 'Em Rota' ? 'bg-blue-600 text-white' : p.status === 'Entregue' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      <i className={`fas ${p.status === 'Em Rota' ? 'fa-truck-fast' : p.status === 'Entregue' ? 'fa-check' : 'fa-clock'}`}></i>
                    </div>
                    <div><p className="font-black text-slate-800 text-sm leading-none">{p.nomeCliente}</p><p className="text-[10px] font-bold text-slate-500 mt-1">📍 {p.endereco}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.status === 'Pendente' && <button onClick={(e) => { e.stopPropagation(); processStatusUpdate([p.id], 'Em Rota'); }} className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg"><i className="fas fa-truck-fast text-[10px]"></i></button>}
                    {p.status !== 'Entregue' && <button onClick={(e) => { e.stopPropagation(); processStatusUpdate([p.id], 'Entregue'); }} className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg"><i className="fas fa-check text-[10px]"></i></button>}
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
               <div className="max-h-[300px] overflow-y-auto mb-4 pr-2 custom-scrollbar space-y-3">
                 {cart.map(i => (
                    <div key={i.produtoId} className="flex flex-col p-3 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm relative group">
                       <div className="flex justify-between items-start mb-3 pl-1">
                          <span className="font-black text-slate-800 text-xs w-3/4 leading-tight">{i.nome}</span>
                          <span className="font-black text-emerald-600 text-xs">R$ {(i.qtd * i.precoUnitario).toFixed(2)}</span>
                       </div>
                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 bg-white rounded-xl border p-1 shadow-sm">
                             <button onClick={() => updateQty(i.produtoId, -1)} className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"><i className="fas fa-minus text-[10px]"></i></button>
                             <input type="number" min="1" className="w-10 text-center font-black text-sm bg-transparent outline-none text-slate-800" value={i.qtd} onChange={(e) => setQtyManual(i.produtoId, e.target.value)} />
                             <button onClick={() => updateQty(i.produtoId, 1)} className="w-7 h-7 flex items-center justify-center bg-blue-100 hover:bg-blue-600 hover:text-white text-blue-600 rounded-lg transition-colors"><i className="fas fa-plus text-[10px]"></i></button>
                          </div>
                          <button onClick={() => removeItem(i.produtoId)} className="w-8 h-8 flex items-center justify-center bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-colors"><i className="fas fa-trash-alt text-xs"></i></button>
                       </div>
                    </div>
                 ))}
                 {cart.length === 0 && (
                   <div className="text-center py-10 flex flex-col items-center opacity-50">
                     <i className="fas fa-shopping-basket text-4xl text-slate-200 mb-3"></i>
                     <p className="text-[10px] font-black text-slate-300 uppercase">Carrinho Vazio</p>
                   </div>
                 )}
              </div>
              
              <div className="space-y-1">
                 <p className="text-[9px] font-black text-slate-400 uppercase ml-2">Entregador Responsável</p>
                 <select className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-xs" value={selectedEntregador} onChange={e => setSelectedEntregador(e.target.value)}>
                    <option value="">-- Definir Automaticamente --</option>
                    {entregadores.filter(e => e.status === 'Ativo').map(e => (
                       <option key={e.id} value={e.nome}>{e.nome}</option>
                    ))}
                 </select>
              </div>

              <div className="space-y-1"><p className="text-[9px] font-black text-slate-400 uppercase ml-2">Forma de Pagamento</p>
                 <select className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-xs" value={formaPgto} onChange={e => setFormaPgto(e.target.value)}>
                   {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                 </select>
              </div>
              <div className="pt-4 border-t flex justify-between items-center mb-4"><span className="text-[10px] font-black text-slate-400 uppercase">Total</span><span className="text-2xl font-black text-blue-600">R$ {cartTotal.toFixed(2)}</span></div>
              <div className="grid grid-cols-5 gap-2">
                 <button onClick={handlePrintReceipt} disabled={cart.length === 0} className="col-span-1 py-5 bg-slate-100 text-slate-600 font-black rounded-2xl text-[18px] shadow-sm hover:bg-slate-200 transition-all flex items-center justify-center disabled:opacity-50" title="Imprimir Recibo"><i className="fas fa-print"></i></button>
                 <button onClick={handleSendReceiptWhatsApp} disabled={cart.length === 0} className="col-span-1 py-5 bg-emerald-50 text-emerald-600 font-black rounded-2xl text-[18px] shadow-sm hover:bg-emerald-100 transition-all flex items-center justify-center disabled:opacity-50" title="Enviar Recibo WhatsApp"><i className="fab fa-whatsapp"></i></button>
                 <button onClick={async () => {
                    setLoading(true);
                    try {
                      await gasService.salvarPedido({ nomeCliente: nomeBusca, telefoneCliente: telBusca, endereco: endBusca, itens: cart, valorTotal: cartTotal, entregador: selectedEntregador || 'Logística', formaPagamento: formaPgto });
                      setCart([]); setNomeBusca(''); setTelBusca(''); setEndBusca(''); setSelectedEntregador(''); await loadData(true);
                      setMessage({ type: 'success', text: 'Venda registrada com sucesso!' });
                    } finally { setLoading(false); }
                  }} disabled={!nomeBusca || cart.length === 0} className="col-span-3 py-5 bg-blue-600 text-white font-black rounded-2xl uppercase text-[11px] shadow-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">Finalizar Pedido</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCobranca = () => {
    const pendentes = resumo?.recentes.filter(m => m.tipo === 'A Receber') || [];
    const totalPendentes = pendentes.reduce((acc, curr) => acc + curr.valor, 0);

    return (
      <div className="space-y-8 animate-in slide-in-from-bottom-8">
        <div className="bg-white p-8 rounded-[40px] border-2 border-rose-50 shadow-xl flex items-center justify-between">
          <div><h2 className="text-2xl font-black text-slate-900 uppercase">💸 Gestão de Cobrança</h2><p className="text-[10px] font-black text-slate-400 uppercase mt-1">Acompanhamento de Vendas Fiadas</p></div>
          <div className="text-right"><p className="text-[10px] font-black text-rose-400 uppercase mb-1">Total a Receber</p><p className="text-3xl font-black text-rose-600">R$ {totalPendentes.toFixed(2)}</p></div>
        </div>
        <div className="bg-white rounded-[40px] shadow-xl border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
              <tr>{['Data', 'Cliente', 'Descrição', 'Valor', 'Ação'].map(h => <th key={h} className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendentes.map(m => {
                const clienteNome = m.descricao.split(': ')[1] || m.descricao;
                const clienteObj = clientes.find(c => c.nome.trim().toUpperCase() === clienteNome.trim().toUpperCase());

                const handleCobrar = () => {
                   if (clienteObj) {
                      const msg = `Oie *${clienteObj.nome}*, tudo bom?\n\nPassando rapidinho só para lembrar daquele valor de *R$ ${m.valor.toFixed(2)}* referente à Bio Gás. Conseguimos agendar uma data para o pagamento?\n\nObrigado(a) e uma ótima semana!`;
                      window.open(`https://wa.me/${clienteObj.telefone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
                   } else {
                      setMessage({ type: 'error', text: 'Telefone do cliente não encontrado no CRM para cobrar.' });
                   }
                };

                return (
                  <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-6 text-[10px] font-black text-slate-400">{m.dataHora}</td>
                    <td className="px-8 py-6 text-sm font-black text-slate-800 uppercase">{clienteNome}</td>
                    <td className="px-8 py-6 text-xs font-bold text-slate-500">{m.detalhe}</td>
                    <td className="px-8 py-6 font-black text-rose-600">R$ {m.valor.toFixed(2)}</td>
                    <td className="px-8 py-6">
                      <div className="flex gap-2">
                        <button onClick={handleCobrar} className="px-4 py-2 bg-emerald-100 text-emerald-600 text-[9px] font-black uppercase rounded-xl hover:bg-emerald-600 hover:text-white transition flex items-center gap-1">
                          <i className="fab fa-whatsapp text-xs"></i> Cobrar
                        </button>
                        <button onClick={async () => {
                          setLoading(true);
                          await gasService.liquidarDivida(m.id);
                          await loadData(true);
                          setMessage({ type: 'success', text: 'Dívida Liquidada!' });
                        }} className="px-4 py-2 bg-emerald-500 text-white text-[9px] font-black uppercase rounded-xl hover:bg-emerald-600 transition">Dar Baixa</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pendentes.length === 0 && <tr><td colSpan={5} className="p-20 text-center font-black text-slate-300 uppercase tracking-widest">Nenhuma conta pendente</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderMarketing = () => {
    const bairros = ['Todos', ...Array.from(new Set(clientes.map(c => c.bairro).filter(b => b)))];
    const filteredMktClients = clientes.filter(c => mktBairroFilter === 'Todos' || c.bairro === mktBairroFilter);
    return (
      <div className="space-y-8 animate-in fade-in">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-8 rounded-[40px] shadow-xl border border-slate-100">
                 <h3 className="text-lg font-black mb-6 flex items-center gap-3 text-slate-800"><i className="fas fa-wand-magic-sparkles text-blue-600"></i> Bio IA Marketing</h3>
                 <div className="grid grid-cols-2 gap-3 mb-6">
                    {['Promoção Gás', 'Feriado', 'Aviso Falta', 'Fidelidade'].map(t => (
                       <button key={t} onClick={() => generateMktCopy(t)} disabled={isGeneratingMkt} className="px-4 py-3 bg-slate-50 border rounded-2xl text-[10px] font-black uppercase text-slate-600 hover:bg-blue-600 hover:text-white transition-all disabled:opacity-50">{isGeneratingMkt ? 'Gerando...' : t}</button>
                    ))}
                 </div>
                 <textarea className="w-full p-5 bg-slate-50 border-none rounded-[30px] font-medium text-sm min-h-[250px] mb-4 leading-relaxed" placeholder="Gere ou digite a mensagem..." value={mktMessage} onChange={e => setMktMessage(e.target.value)} />
                 <div className="p-4 bg-blue-50 rounded-2xl text-[10px] font-bold text-blue-600 flex gap-3"><i className="fas fa-info-circle"></i><p>Dica: Use [nome] para o sistema trocar pelo nome do cliente.</p></div>
              </div>
           </div>
           <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-8 rounded-[40px] shadow-xl border border-slate-100">
                 <div className="flex justify-between items-center mb-8">
                    <div><h3 className="text-xl font-black text-slate-900 tracking-tight">Segmentação de Clientes</h3><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Total: {filteredMktClients.length} contatos</p></div>
                    <select className="bg-slate-50 p-4 rounded-2xl font-black text-[10px] uppercase border-none outline-none" value={mktBairroFilter} onChange={e => setMktBairroFilter(e.target.value)}>
                       {bairros.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                 </div>
                 <div className="max-h-[500px] overflow-y-auto custom-scrollbar divide-y divide-slate-50">
                    {filteredMktClients.map(c => (
                       <div key={c.id} className="py-4 flex justify-between items-center hover:bg-slate-50/50 px-4 rounded-2xl transition-all group">
                          <div className="flex items-center gap-4">
                             <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-black text-xs uppercase tracking-tighter">{c.nome.charAt(0)}</div>
                             <div><p className="font-black text-sm text-slate-800 uppercase">{c.nome}</p><p className="text-[10px] text-slate-400 font-bold italic">📍 {c.bairro || 'Não informado'}</p></div>
                          </div>
                          <button onClick={() => {
                            const msg = mktMessage.replace(/\[nome\]/gi, c.nome);
                            window.open(`https://wa.me/${c.telefone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');
                          }} disabled={!mktMessage.trim()} className="px-6 py-3 bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase rounded-2xl hover:bg-emerald-600 hover:text-white transition-all disabled:opacity-20 flex items-center gap-2"><i className="fab fa-whatsapp text-lg"></i> Disparar</button>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  };

  const renderEntregadores = () => (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex justify-between items-center bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl">
         <div><h2 className="text-2xl font-black text-slate-900 uppercase">🛵 Equipe de Entrega</h2><p className="text-[10px] font-black text-slate-400 uppercase mt-1">Gestão de Motoristas e Frota</p></div>
         <button onClick={() => { setNovoEntregador({id: '', nome: '', telefone: '', veiculo: '', status: 'Ativo'}); setShowEntregadorModal(true); }} className="bg-blue-600 text-white px-8 py-4 rounded-3xl font-black text-[11px] uppercase shadow-xl hover:bg-blue-700 transition-all">Novo Entregador</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         {entregadores.map(e => (
            <div key={e.id} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl hover:shadow-2xl transition-all group">
               <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl group-hover:bg-blue-600 group-hover:text-white transition-all"><i className="fas fa-motorcycle"></i></div>
                  <div><h4 className="font-black text-slate-800 text-lg uppercase tracking-tight">{e.nome}</h4><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${e.status === 'Ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{e.status}</span></div>
               </div>
               <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-tight"><span>Veículo</span><span className="text-slate-800">{e.veiculo}</span></div>
                  <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-tight"><span>WhatsApp</span><span className="text-blue-600">{e.telefone}</span></div>
               </div>
               <button onClick={() => window.open(`https://wa.me/${e.telefone.replace(/\D/g,'')}`, '_blank')} className="w-full py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-black text-[10px] uppercase hover:bg-emerald-600 hover:text-white transition-all">WhatsApp do Motorista</button>
            </div>
         ))}
      </div>
    </div>
  );

  const renderEstoque = () => (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex justify-between items-center bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl">
         <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase">📦 Controle de Estoque</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Gestão de Produtos e Inventário</p>
         </div>
         <button onClick={() => { setNovoProduto({id: '', nome: '', preco: 0, estoque: 0, unidadeMedida: 'unidade', precoCusto: 0}); setShowProdutoModal(true); }} className="bg-blue-600 text-white px-8 py-4 rounded-3xl font-black text-[11px] uppercase shadow-xl hover:bg-blue-700 transition-all">Novo Produto</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         {produtos.map(p => (
            <div key={p.id} className="bg-white p-6 rounded-[30px] border border-slate-100 shadow-lg hover:shadow-xl transition-all relative overflow-hidden group">
               {p.estoque < ESTOQUE_MINIMO && <div className="absolute top-0 right-0 bg-rose-500 text-white text-[8px] font-black uppercase px-3 py-1 rounded-bl-xl z-10">Estoque Baixo</div>}
               <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-xl font-black"><i className="fas fa-box-open"></i></div>
                  <button onClick={() => { setNovoProduto(p); setShowProdutoModal(true); }} className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition flex items-center justify-center"><i className="fas fa-pen text-xs"></i></button>
               </div>
               <h4 className="font-black text-slate-800 text-base uppercase mb-1 truncate">{p.nome}</h4>
               <p className="text-[10px] text-slate-400 font-bold mb-4 uppercase">{p.id}</p>
               <div className="space-y-2 bg-slate-50 p-4 rounded-2xl">
                  <div className="flex justify-between items-center text-xs font-bold">
                     <span className="text-slate-400 uppercase">Preço Venda</span>
                     <span className="text-emerald-600">R$ {p.preco.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold">
                     <span className="text-slate-400 uppercase">Estoque</span>
                     <span className={`${p.estoque < ESTOQUE_MINIMO ? 'text-rose-500' : 'text-slate-800'}`}>{p.estoque} {p.unidadeMedida || 'unidade'}</span>
                  </div>
               </div>
            </div>
         ))}
      </div>
    </div>
  );

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
            { id: 'marketing', label: 'Marketing IA', icon: '📢' },
            { id: 'entregadores', label: 'Equipe', icon: '🛵' },
            { id: 'estoque', label: 'Estoque', icon: '📦' },
            { id: 'clientes', label: 'CRM Inteligente', icon: '👥' },
          ].map(tab => {
            const hasAlert = tab.id === 'estoque' && produtosEstoqueBaixo.length > 0;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 transition-all relative ${activeTab === tab.id ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                <span className="text-xl">{tab.icon}</span> {tab.label}
                {hasAlert && <span className="absolute top-3 right-3 w-5 h-5 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center animate-pulse border-2 border-white shadow-sm">{produtosEstoqueBaixo.length}</span>}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {message && (
          <div className={`mb-10 p-5 rounded-3xl flex justify-between items-center border-2 animate-in slide-in-from-top-6 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-rose-50 text-rose-800 border-rose-100'} shadow-sm`}>
            <span className="font-black text-xs uppercase tracking-widest">{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-2xl font-light hover:rotate-90 transition-transform">×</button>
          </div>
        )}
        
        {activeTab === 'vendas' && renderVendas()}
        {activeTab === 'cobranca' && renderCobranca()}
        {activeTab === 'marketing' && renderMarketing()}
        {activeTab === 'entregadores' && renderEntregadores()}
        {activeTab === 'estoque' && renderEstoque()}
        
        {activeTab === 'clientes' && (
          <div className="bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in">
            <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-slate-800 uppercase text-xs tracking-[0.3em]">CRM Master de Clientes</h3>
              <div className="flex gap-3 items-center">
                <input type="file" className="hidden" ref={fileInputRef} accept=".xlsx, .xls, .csv" onChange={handleImportExcel} />
                <button onClick={() => fileInputRef.current?.click()} className="px-6 py-4 bg-white border-2 border-slate-100 rounded-[20px] font-black text-[10px] uppercase text-slate-500 hover:bg-slate-50 transition flex items-center gap-2 shadow-sm"><i className="fas fa-file-import text-blue-600"></i> Importar Planilha</button>
                <div className="relative"><i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i><input className="pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-[20px] font-bold text-sm shadow-sm w-80 outline-none" placeholder="Filtrar por nome..." value={searchTermCRM} onChange={e => setSearchTermCRM(e.target.value)} /></div>
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
                    <td className="px-10 py-6 text-xs font-medium text-slate-500 font-bold italic">📍 {c.endereco}</td>
                    <td className="px-10 py-6 text-xs font-black text-slate-400 uppercase tracking-tighter">{c.bairro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'caixa' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-8">
             <div className="flex justify-end gap-3 mb-2">
               <button onClick={handleGerarRelatorio} className="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg transition flex items-center gap-2"><i className="fas fa-chart-pie"></i> Relatório Mensal</button>
               <button onClick={() => { setMovimentacaoForm({tipo: 'Entrada', descricao: '', valor: '', categoria: 'Venda Extra'}); setShowFinanceiroModal(true); }} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg transition flex items-center gap-2"><i className="fas fa-plus"></i> Nova Receita</button>
               <button onClick={() => { setMovimentacaoForm({tipo: 'Saída', descricao: '', valor: '', categoria: 'Despesa'}); setShowFinanceiroModal(true); }} className="bg-rose-500 hover:bg-rose-600 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase shadow-lg transition flex items-center gap-2"><i className="fas fa-minus"></i> Nova Despesa</button>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[{l: 'Receitas', v: resumo?.totalEntradas || 0, c: 'text-emerald-600', i: 'fa-arrow-up-long'}, {l: 'Despesas', v: resumo?.totalSaidas || 0, c: 'text-rose-600', i: 'fa-arrow-down-long'}, {l: 'Pendentes', v: resumo?.totalAReceber || 0, c: 'text-orange-500', i: 'fa-clock'}, {l: 'Saldo Real', v: resumo?.saldo || 0, c: 'text-slate-900', b: 'bg-blue-50 border-blue-100', i: 'fa-vault'}].map((s,i) => (
                  <div key={i} className={`p-8 bg-white rounded-[40px] border ${s.b || 'border-slate-100'} shadow-sm flex items-center gap-5`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${s.c.replace('text', 'bg').replace('-600', '-50')} ${s.c}`}><i className={`fas ${s.i}`}></i></div>
                    <div><p className="text-[9px] font-black text-slate-400 uppercase mb-1">{s.l}</p><p className={`text-2xl font-black ${s.c}`}>R$ {s.v.toFixed(2)}</p></div>
                  </div>
                ))}
             </div>
             <div className="bg-white rounded-[40px] shadow-xl border border-slate-100 overflow-hidden">
                <div className="p-8 border-b flex justify-between items-center bg-slate-50/30">
                  <h3 className="font-black text-slate-800 uppercase text-[10px]">Movimentações Recentes</h3>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b">
                    <tr>{['Data', 'Tipo', 'Descrição', 'Valor', 'Observações'].map(h => <th key={h} className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(resumo?.recentes || []).map(m => (
                      <tr key={m.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-8 py-6 text-[10px] font-black text-slate-400">{m.dataHora}</td>
                        <td className="px-8 py-6"><span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter ${m.tipo === 'Entrada' ? 'bg-emerald-100 text-emerald-700' : m.tipo === 'Saída' ? 'bg-rose-100 text-rose-700' : m.tipo === 'Liquidado' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{m.tipo}</span></td>
                        <td className="px-8 py-6 text-sm font-black text-slate-800 uppercase">{m.descricao}</td>
                        <td className={`px-8 py-6 font-black text-base ${m.tipo === 'Saída' ? 'text-rose-600' : 'text-slate-900'}`}>R$ {m.valor.toFixed(2)}</td>
                        <td className="px-8 py-6 text-[10px] font-medium text-slate-400 italic">{m.detalhe || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}
      </main>

      {/* MODAL ENTREGADOR */}
      {showEntregadorModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6 animate-in zoom-in-95">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden">
            <div className="p-6 bg-blue-600 text-white flex justify-between items-center"><h3 className="font-black text-xs uppercase tracking-widest">Cadastro de Colaborador</h3><button onClick={() => setShowEntregadorModal(false)} className="text-2xl">&times;</button></div>
            <form onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  await gasService.salvarEntregador(novoEntregador);
                  setShowEntregadorModal(false);
                  setMessage({ type: 'success', text: 'Entregador registrado!' });
                  await loadData(true);
                } finally { setLoading(false); }
              }} className="p-8 space-y-5">
              <input required className="w-full p-4 bg-slate-50 rounded-2xl font-bold" placeholder="Nome Completo" value={novoEntregador.nome} onChange={e => setNovoEntregador({...novoEntregador, nome: e.target.value})} />
              <input required className="w-full p-4 bg-slate-50 rounded-2xl font-bold" placeholder="WhatsApp" value={novoEntregador.telefone} onChange={e => setNovoEntregador({...novoEntregador, telefone: e.target.value})} />
              <input required className="w-full p-4 bg-slate-50 rounded-2xl font-bold" placeholder="Veículo" value={novoEntregador.veiculo} onChange={e => setNovoEntregador({...novoEntregador, veiculo: e.target.value})} />
              <button className="w-full py-5 bg-blue-600 text-white font-black rounded-3xl uppercase text-[11px] shadow-xl hover:bg-blue-700 transition-all">Salvar Motorista</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRODUTO */}
      {showProdutoModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6 animate-in zoom-in-95">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden">
            <div className="p-6 bg-blue-600 text-white flex justify-between items-center"><h3 className="font-black text-xs uppercase tracking-widest">{novoProduto.id ? 'Editar Produto' : 'Novo Produto'}</h3><button onClick={() => setShowProdutoModal(false)} className="text-2xl">&times;</button></div>
            <form onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  await gasService.salvarProduto(novoProduto);
                  setShowProdutoModal(false);
                  setMessage({ type: 'success', text: 'Produto salvo com sucesso!' });
                  await loadData(true);
                } finally { setLoading(false); }
              }} className="p-8 space-y-5">
              <div className="space-y-1">
                 <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nome do Produto</label>
                 <input required className="w-full p-4 bg-slate-50 rounded-2xl font-bold" placeholder="Ex: Gás P13" value={novoProduto.nome} onChange={e => setNovoProduto({...novoProduto, nome: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Preço Venda (R$)</label>
                    <input required type="number" step="0.01" className="w-full p-4 bg-slate-50 rounded-2xl font-bold" value={novoProduto.preco} onChange={e => setNovoProduto({...novoProduto, preco: Number(e.target.value)})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Preço Custo (R$)</label>
                    <input required type="number" step="0.01" className="w-full p-4 bg-slate-50 rounded-2xl font-bold" value={novoProduto.precoCusto} onChange={e => setNovoProduto({...novoProduto, precoCusto: Number(e.target.value)})} />
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Estoque Atual</label>
                    <input required type="number" className="w-full p-4 bg-slate-50 rounded-2xl font-bold" value={novoProduto.estoque} onChange={e => setNovoProduto({...novoProduto, estoque: Number(e.target.value)})} />
                 </div>
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Unidade</label>
                    <select className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-sm" value={novoProduto.unidadeMedida} onChange={e => setNovoProduto({...novoProduto, unidadeMedida: e.target.value})}>
                       <option value="unidade">Unidade</option>
                       <option value="kg">Kg</option>
                       <option value="litro">Litro</option>
                       <option value="metro">Metro</option>
                       <option value="pacote">Pacote</option>
                       <option value="caixa">Caixa</option>
                    </select>
                 </div>
              </div>
              <button className="w-full py-5 bg-blue-600 text-white font-black rounded-3xl uppercase text-[11px] shadow-xl hover:bg-blue-700 transition-all">Salvar Produto</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL FINANCEIRO */}
      {showFinanceiroModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6 animate-in zoom-in-95">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden">
            <div className={`p-6 ${movimentacaoForm.tipo === 'Entrada' ? 'bg-emerald-500' : 'bg-rose-500'} text-white flex justify-between items-center`}>
              <h3 className="font-black text-xs uppercase tracking-widest">{movimentacaoForm.tipo === 'Entrada' ? 'Nova Receita' : 'Nova Despesa'}</h3>
              <button onClick={() => setShowFinanceiroModal(false)} className="text-2xl">&times;</button>
            </div>
            <form onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  await gasService.registrarMovimentacao(movimentacaoForm.tipo, Number(movimentacaoForm.valor), movimentacaoForm.descricao, movimentacaoForm.categoria, 'MANUAL', 'Lançamento via Dashboard');
                  setShowFinanceiroModal(false);
                  setMessage({ type: 'success', text: 'Movimentação registrada com sucesso!' });
                  await loadData(true);
                } finally { setLoading(false); }
              }} className="p-8 space-y-5">
              <input required className="w-full p-4 bg-slate-50 rounded-2xl font-bold" placeholder="Descrição (ex: Conta de Luz)" value={movimentacaoForm.descricao} onChange={e => setMovimentacaoForm({...movimentacaoForm, descricao: e.target.value})} />
              <input required type="number" step="0.01" className="w-full p-4 bg-slate-50 rounded-2xl font-bold" placeholder="Valor (R$)" value={movimentacaoForm.valor} onChange={e => setMovimentacaoForm({...movimentacaoForm, valor: e.target.value})} />
              <select className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-500" value={movimentacaoForm.categoria} onChange={e => setMovimentacaoForm({...movimentacaoForm, categoria: e.target.value})}>
                 <option value="Geral">Geral</option>
                 <option value="Fornecedores">Fornecedores</option>
                 <option value="Aluguel/Contas">Aluguel/Contas</option>
                 <option value="Funcionários">Funcionários</option>
                 <option value="Venda Extra">Venda Extra</option>
                 <option value="Outros">Outros</option>
              </select>
              <button className={`w-full py-5 ${movimentacaoForm.tipo === 'Entrada' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'} text-white font-black rounded-3xl uppercase text-[11px] shadow-xl transition-all`}>Salvar Lançamento</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RELATÓRIO MENSAL */}
      {showRelatorioModal && relatorio && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-6 animate-in zoom-in-95">
          <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
               <div>
                  <h3 className="font-black text-xs uppercase tracking-widest">Relatório Financeiro</h3>
                  <p className="text-indigo-200 text-sm font-bold capitalize">{relatorio.mes}</p>
               </div>
               <button onClick={() => setShowRelatorioModal(false)} className="text-2xl">&times;</button>
            </div>
            <div className="p-8 space-y-8">
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                     <p className="text-[9px] font-black text-emerald-400 uppercase">Receita Total</p>
                     <p className="text-xl font-black text-emerald-600">R$ {relatorio.totalEntradas.toFixed(2)}</p>
                  </div>
                  <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
                     <p className="text-[9px] font-black text-rose-400 uppercase">Despesa Total</p>
                     <p className="text-xl font-black text-rose-600">R$ {relatorio.totalSaidas.toFixed(2)}</p>
                  </div>
               </div>
               <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Saldo Líquido do Mês</p>
                  <p className={`text-3xl font-black ${relatorio.saldo >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>R$ {relatorio.saldo.toFixed(2)}</p>
               </div>
               
               {relatorio.categoriasEntrada.length > 0 && (
                  <div>
                     <h4 className="font-black text-xs uppercase text-slate-800 mb-3 border-b pb-2">Receitas por Categoria</h4>
                     <div className="space-y-3">
                        {relatorio.categoriasEntrada.map((c, i) => (
                           <div key={i}>
                              <div className="flex justify-between text-[10px] font-bold uppercase mb-1"><span>{c.categoria}</span><span>R$ {c.valor.toFixed(2)}</span></div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5"><div className="bg-emerald-500 h-1.5 rounded-full" style={{width: `${(c.valor / relatorio.totalEntradas) * 100}%`}}></div></div>
                           </div>
                        ))}
                     </div>
                  </div>
               )}

               {relatorio.categoriasSaida.length > 0 && (
                  <div>
                     <h4 className="font-black text-xs uppercase text-slate-800 mb-3 border-b pb-2">Despesas por Categoria</h4>
                     <div className="space-y-3">
                        {relatorio.categoriasSaida.map((c, i) => (
                           <div key={i}>
                              <div className="flex justify-between text-[10px] font-bold uppercase mb-1"><span>{c.categoria}</span><span>R$ {c.valor.toFixed(2)}</span></div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5"><div className="bg-rose-500 h-1.5 rounded-full" style={{width: `${(c.valor / relatorio.totalSaidas) * 100}%`}}></div></div>
                           </div>
                        ))}
                     </div>
                  </div>
               )}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-xl flex items-center justify-center z-[300] animate-in fade-in">
          <div className="flex flex-col items-center gap-8"><div className="relative w-24 h-24"><div className="absolute inset-0 border-8 border-blue-600/10 rounded-full animate-pulse"></div><div className="absolute inset-0 border-8 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div><p className="text-[12px] font-black text-blue-600 uppercase tracking-[0.4em] animate-pulse">BIO GÁS PRO: SINCRONIZANDO</p></div>
        </div>
      )}
    </div>
  );
};

export default App;
