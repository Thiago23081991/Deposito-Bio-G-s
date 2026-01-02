
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { gasService } from './services/gasMock.ts';
import { Cliente, Produto, Entregador, Pedido, PaymentMethod, ResumoFinanceiro, PedidoItem, Movimentacao, RelatorioMensal, ChatMessage } from './types.ts';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from "@google/genai";

// --- CONFIGURAÇÃO DA LOGO ---
// Substitua a URL abaixo pelo link da sua imagem ou Base64
const LOGO_URL = "/logo.png";

const App: React.FC = () => {
  // --- ESTADO GLOBAL ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [activeTab, setActiveTab] = useState<'vendas' | 'caixa' | 'cobranca' | 'estoque' | 'clientes' | 'entregadores' | 'marketing'>('vendas');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // --- DADOS ---
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);

  // --- RASTREAMENTO & QR CODE ---
  const [trackingPedido, setTrackingPedido] = useState<Pedido | null>(null);
  const [isTrackingMode, setIsTrackingMode] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodePedido, setQrCodePedido] = useState<Pedido | null>(null);
  const [depositoOrigem, setDepositoOrigem] = useState('Centro');

  // --- MARKETING IA ---
  const [marketingChat, setMarketingChat] = useState<ChatMessage[]>([
    { role: 'model', text: 'Olá! Sou seu assistente de Marketing da Bio Gás. Posso criar promoções, textos para WhatsApp ou ideias para campanhas. O que vamos criar hoje?', timestamp: new Date() }
  ]);
  const [marketingInput, setMarketingInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- FILTRO CAIXA ---
  const [caixaDataIni, setCaixaDataIni] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
  });
  const [caixaDataFim, setCaixaDataFim] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // --- SELEÇÃO EM MASSA & FILTROS ---
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [searchTermCRM, setSearchTermCRM] = useState('');

  // --- SELEÇÃO EM MASSA FINANCEIRO ---
  const [selectedMovimentacaoIds, setSelectedMovimentacaoIds] = useState<string[]>([]);

  // --- MODAIS ---
  const [showEntregadorModal, setShowEntregadorModal] = useState(false);
  const [novoEntregador, setNovoEntregador] = useState({ id: '', nome: '', telefone: '', veiculo: '', status: 'Ativo' as 'Ativo' | 'Inativo' });

  // --- MODAL FINANCEIRO ---
  const [showFinanceiroModal, setShowFinanceiroModal] = useState(false);
  const [movimentacaoForm, setMovimentacaoForm] = useState({ tipo: 'Entrada', descricao: '', valor: '', categoria: 'Geral' });

  // --- MODAL BAIXA DÍVIDA ---
  const [showBaixaModal, setShowBaixaModal] = useState(false);
  const [selectedDivida, setSelectedDivida] = useState<Movimentacao | null>(null);
  const [metodoBaixa, setMetodoBaixa] = useState<string>('Dinheiro');

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ESTOQUE_MINIMO = 10;
  const produtosEstoqueBaixo = useMemo(() => produtos.filter(p => p.estoque < ESTOQUE_MINIMO), [produtos]);

  // --- INITIAL LOAD & TRACKING CHECK ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trackingId = params.get('tracking');

    if (trackingId) {
      setIsTrackingMode(true);
      setLoading(true);
      gasService.buscarPedidoPorId(trackingId).then(p => {
        setTrackingPedido(p);
        setLoading(false);
      }).catch(() => {
        setMessage({ type: 'error', text: 'Pedido não encontrado ou link inválido.' });
        setLoading(false);
      });
    } else {
      loadData();
    }
  }, []);

  // --- SCROLL TO BOTTOM MARKETING ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [marketingChat]);

  // --- FLUXO DE CAIXA DIÁRIO ---
  const fluxoCaixaDiario = useMemo(() => {
    const grupos: Record<string, { entradas: number; saidas: number }> = {};
    (resumo?.recentes || []).forEach(m => {
      const data = m.dataHora.split(' ')[0];
      if (!grupos[data]) grupos[data] = { entradas: 0, saidas: 0 };

      const tipo = m.tipo.trim();
      if (tipo === 'Entrada') grupos[data].entradas += m.valor;
      if (tipo === 'Saída' || tipo === 'Saida') grupos[data].saidas += m.valor;
    });

    return Object.entries(grupos)
      .map(([data, vals]) => ({
        data,
        ...vals,
        saldo: vals.entradas - vals.saidas
      }))
      .sort((a, b) => {
        const [da, ma, ya] = a.data.split('/').map(Number);
        const [db, mb, yb] = b.data.split('/').map(Number);
        return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
      });
  }, [resumo]);

  // --- CÁLCULO TOTAL SELEÇÃO FINANCEIRA ---
  const totalSelecionadoFinanceiro = useMemo(() => {
    if (!resumo?.recentes) return 0;
    return resumo.recentes
      .filter(m => selectedMovimentacaoIds.includes(m.id))
      .reduce((acc, curr) => {
        return acc + curr.valor;
      }, 0);
  }, [resumo, selectedMovimentacaoIds]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [p, e, up, res, cls] = await Promise.all([
        gasService.listarProdutos(),
        gasService.listarEntregadores(),
        gasService.listarUltimosPedidos(),
        gasService.getResumoFinanceiro(caixaDataIni, caixaDataFim),
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
  }, [caixaDataIni, caixaDataFim]);

  // --- LOGIC: MARKETING AI ---
  const handleSendMarketingMessage = async () => {
    if (!marketingInput.trim()) return;

    const userMsg = marketingInput;
    setMarketingInput('');
    setMarketingChat(prev => [...prev, { role: 'user', text: userMsg, timestamp: new Date() }]);
    setIsGenerating(true);

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

      const systemContext = `
        Você é um especialista em Marketing Digital para uma distribuidora de Gás e Água chamada "Bio Gás PRO".
        Seu tom deve ser amigável, vendedor e usar emojis.
        Foque em criar mensagens curtas para WhatsApp, ideias de promoções relâmpago e campanhas de fidelidade.
        Produtos principais: Gás P13 (Cozinha) e Água Mineral 20L.
        Destaque sempre a "Entrega Rápida" e o "Melhor Preço da Região".
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: userMsg,
        config: {
          systemInstruction: systemContext,
          temperature: 0.8
        }
      });

      const text = response.text;
      if (text) {
        setMarketingChat(prev => [...prev, { role: 'model', text: text, timestamp: new Date() }]);
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Erro ao gerar conteúdo. Verifique sua API Key.' });
      setMarketingChat(prev => [...prev, { role: 'model', text: 'Desculpe, tive um problema ao criar o conteúdo. Verifique se a chave de API está configurada.', timestamp: new Date() }]);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- QR CODE GENERATION ---
  const handleGenerateQR = (pedido: Pedido) => {
    setQrCodePedido(pedido);
    setShowQRModal(true);
  };

  const getMapsLink = (enderecoCliente: string) => {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(depositoOrigem)}&destination=${encodeURIComponent(enderecoCliente)}&travelmode=driving`;
  };

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

  // --- EXPORTAR SELEÇÃO FINANCEIRA ---
  const handleExportMovimentacoes = () => {
    if (selectedMovimentacaoIds.length === 0) return;

    const selectedItems = resumo?.recentes.filter(m => selectedMovimentacaoIds.includes(m.id)) || [];

    const dataToExport = selectedItems.map(item => ({
      Data: item.dataHora,
      Tipo: item.tipo,
      Descrição: item.descricao,
      Categoria: item.categoria,
      Valor: item.valor,
      Detalhes: item.detalhe || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Seleção Financeira");
    XLSX.writeFile(wb, "movimentacoes_selecionadas.xlsx");

    setMessage({ type: 'success', text: 'Arquivo exportado com sucesso!' });
    setSelectedMovimentacaoIds([]);
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
            .logo-img { max-width: 100px; display: block; margin: 0 auto 10px auto; }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="${LOGO_URL}" class="logo-img" alt="Logo" />
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

  // --- ENVIO RECIBO WHATSAPP (MANUAL) ---
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
    if (selectedEntregador) msg += `🛵 Entregador: ${selectedEntregador}\n\n`;
    else msg += `\n`;

    msg += `*ITENS DO PEDIDO:*\n`;

    cart.forEach(item => {
      msg += `${item.qtd}x ${item.nome} - R$ ${(item.qtd * item.precoUnitario).toFixed(2)}\n`;
    });

    msg += `\n💰 *TOTAL: R$ ${total.toFixed(2)}*\n`;
    msg += `💳 Forma Pagto: ${formaPgto}\n\n`;
    msg += `✅ _Obrigado pela preferência!_`;

    const phone = telBusca ? telBusca.replace(/\D/g, '') : '';
    const url = phone
      ? `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`
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

        // Solicita previsão de chegada
        const eta = window.prompt("🚚 Saiu para entrega!\n\nInforme a previsão de chegada para enviar ao cliente:", "15-30 minutos");

        if (eta) {
          orders.forEach(o => {
            if (!o.telefoneCliente) return;

            const msg = `*🚚 PEDIDO A CAMINHO!* \n\nOlá *${o.nomeCliente}*, seu pedido Bio Gás já saiu para entrega!\n\n🛵 Entregador: *${o.entregador || 'Equipe Bio Gás'}*\n⏱️ Previsão: *${eta}*\n\nFique atento(a) à campainha! 😉`;

            window.open(`https://wa.me/55${o.telefoneCliente.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
          });
        }
      }

      setMessage({ type: 'success', text: 'Status atualizado e clientes notificados!' });
      setSelectedOrderIds([]);
      await loadData(true);
    } finally { setLoading(false); }
  };

  // --- RENDERS ---

  // RENDER: LOGIN SCREEN (If not authenticated and not tracking)
  if (!isAuthenticated && !isTrackingMode) {
    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if (loginUser === 'Admin' && loginPass === 'admin') {
        setIsAuthenticated(true);
        setMessage({ type: 'success', text: 'Bem-vindo de volta, Admin!' });
      } else {
        setMessage({ type: 'error', text: 'Usuário ou senha incorretos.' });
      }
    };

    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center">
            <img src={LOGO_URL} alt="Logo" className="h-20 w-auto mb-4 object-contain" />
            <h1 className="text-2xl font-black text-slate-800 uppercase">Acesso Restrito</h1>
            <p className="text-xs font-bold text-slate-400 uppercase">Bio Gás PRO</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Usuário</label>
              <input
                type="text"
                className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-bold text-slate-800 outline-none transition-all"
                placeholder="Digite seu usuário..."
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Senha</label>
              <input
                type="password"
                className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-bold text-slate-800 outline-none transition-all"
                placeholder="******"
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
              />
            </div>
            <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-blue-700 transition transform hover:scale-[1.02]">
              Entrar no Sistema
            </button>
          </form>
          {message && (
            <div className={`p-4 rounded-xl text-center text-xs font-bold ${message.type === 'error' ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600'}`}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    );
  }

  // RENDER: TRACKING VIEW (CLIENT)
  if (isTrackingMode) {
    if (!trackingPedido) return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
            <p className="text-slate-500 font-bold text-sm uppercase">Buscando pedido...</p>
          </div>
        ) : (
          <div className="text-center">
            <i className="fas fa-search text-4xl text-slate-300 mb-4"></i>
            <p className="text-slate-500 font-bold">Pedido não encontrado.</p>
            <button onClick={() => window.location.href = window.location.href.split('?')[0]} className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm uppercase">Ir para Home</button>
          </div>
        )}
      </div>
    );

    const steps = [
      { status: 'Pendente', icon: 'fa-clipboard-check', label: 'Confirmado' },
      { status: 'Em Rota', icon: 'fa-truck-fast', label: 'Saiu para Entrega' },
      { status: 'Entregue', icon: 'fa-check', label: 'Entregue' }
    ];

    const currentStepIdx = steps.findIndex(s => s.status === trackingPedido.status);
    const isCancelled = trackingPedido.status === 'Cancelado';

    return (
      <div className="min-h-screen bg-slate-100 font-sans">
        <div className="bg-white p-6 shadow-sm sticky top-0 z-10">
          <div className="flex justify-center mb-4">
            <img src={LOGO_URL} alt="Logo" className="h-16 w-auto object-contain" />
          </div>
          <h1 className="text-center text-xl font-black text-slate-800 uppercase tracking-tight">Rastreamento</h1>
          <p className="text-center text-[10px] text-slate-400 font-bold uppercase mt-1">Pedido #{trackingPedido.id}</p>
        </div>

        <div className="max-w-md mx-auto p-6 space-y-6">
          {isCancelled ? (
            <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl text-center">
              <i className="fas fa-ban text-4xl text-rose-500 mb-3"></i>
              <h2 className="text-lg font-black text-rose-600 uppercase">Pedido Cancelado</h2>
              <p className="text-xs text-rose-400 mt-2">Entre em contato para mais informações.</p>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
              <div className="space-y-8 relative">
                {/* Linha conectora */}
                <div className="absolute left-6 top-2 bottom-2 w-1 bg-slate-100 -z-0"></div>

                {steps.map((step, idx) => {
                  const isActive = idx <= currentStepIdx || (trackingPedido.status === 'Entregue' && step.status !== 'Cancelado');
                  const isCurrent = idx === currentStepIdx;

                  return (
                    <div key={step.status} className={`relative flex items-center gap-4 z-10 ${isActive ? 'opacity-100' : 'opacity-40 grayscale'}`}>
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 ${isActive ? (isCurrent ? 'bg-blue-600 border-blue-100 text-white shadow-lg scale-110' : 'bg-emerald-500 border-emerald-100 text-white') : 'bg-white border-slate-100 text-slate-300'} transition-all`}>
                        <i className={`fas ${step.icon} text-sm`}></i>
                      </div>
                      <div>
                        <p className={`text-xs font-black uppercase tracking-widest ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>{step.label}</p>
                        {isCurrent && <p className="text-[10px] font-bold text-blue-600 animate-pulse">Status Atual</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="font-black text-xs uppercase text-slate-400 tracking-widest border-b pb-2">Detalhes da Entrega</h3>
            <div className="flex items-start gap-3">
              <i className="fas fa-map-marker-alt text-blue-600 mt-1"></i>
              <div>
                <p className="text-xs font-black text-slate-800 uppercase">Endereço</p>
                <p className="text-xs text-slate-500">{trackingPedido.endereco}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <i className="fas fa-motorcycle text-blue-600 mt-1"></i>
              <div>
                <p className="text-xs font-black text-slate-800 uppercase">Entregador</p>
                <p className="text-xs text-slate-500">{trackingPedido.entregador || 'A definir'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <i className="fas fa-receipt text-blue-600 mt-1"></i>
              <div>
                <p className="text-xs font-black text-slate-800 uppercase">Total</p>
                <p className="text-lg font-black text-emerald-600">R$ {trackingPedido.valorTotal.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <button onClick={() => window.open(`https://wa.me/55${trackingPedido.telefoneCliente.replace(/\D/g, '')}`, '_blank')} className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-emerald-600 transition flex items-center justify-center gap-2">
            <i className="fab fa-whatsapp text-lg"></i> Falar com Suporte
          </button>
        </div>
      </div>
    );
  }

  const renderVendas = () => {
    const cartTotal = cart.reduce((acc, i) => acc + (i.qtd * i.precoUnitario), 0);
    const filteredPedidos = pedidos.filter(p => filterStatus === 'Todos' || p.status === filterStatus);
    const suggestions = nomeBusca.length > 0 ? clientes.filter(c => c.nome.toLowerCase().includes(nomeBusca.toLowerCase()) || c.telefone.includes(nomeBusca)).slice(0, 5) : [];

    // Funções auxiliares para o carrinho
    const updateQty = (prodId: string, delta: number) => {
      setCart(prev => prev.map(item => {
        if (item.produtoId === prodId) {
          const newQty = Math.max(1, item.qtd + delta);
          return { ...item, qtd: newQty };
        }
        return item;
      }));
    };

    const setQtyManual = (prodId: string, value: string) => {
      const qty = parseInt(value);
      if (!isNaN(qty) && qty > 0) {
        setCart(prev => prev.map(item => item.produtoId === prodId ? { ...item, qtd: qty } : item));
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
                <input className="w-full pl-12 pr-5 py-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl font-bold" placeholder="Digite nome ou telefone..." value={nomeBusca} onChange={e => { setNomeBusca(e.target.value); setShowSuggestions(true); }} />
                <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"></i>
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white shadow-2xl rounded-2xl border z-50 mt-2 overflow-hidden">
                    {suggestions.map(c => (
                      <button key={c.id} onClick={() => { setNomeBusca(c.nome); setTelBusca(c.telefone); setEndBusca(c.endereco); setShowSuggestions(false); }} className="w-full p-4 text-left hover:bg-blue-50 border-b flex justify-between items-center">
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
                  if (ex) return prev.map(i => i.produtoId === p.id ? { ...i, qtd: i.qtd + 1 } : i);
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
                    <button onClick={(e) => { e.stopPropagation(); handleGenerateQR(p); }} className="w-8 h-8 bg-slate-100 text-slate-600 hover:bg-slate-900 hover:text-white transition rounded-lg" title="Ver QR Code"><i className="fas fa-qrcode text-[10px]"></i></button>
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
                    // Capture snapshot for WhatsApp before clearing state
                    const snapshotCart = [...cart];
                    const snapshotTotal = cartTotal;
                    const snapshotNome = nomeBusca || 'Cliente';
                    const snapshotTel = telBusca;
                    const snapshotPgto = formaPgto;

                    const res = await gasService.salvarPedido({ nomeCliente: nomeBusca, telefoneCliente: telBusca, endereco: endBusca, itens: cart, valorTotal: cartTotal, entregador: selectedEntregador || 'Logística', formaPagamento: formaPgto });

                    // Clear State
                    setCart([]); setNomeBusca(''); setTelBusca(''); setEndBusca(''); setSelectedEntregador('');
                    await loadData(true);
                    setMessage({ type: 'success', text: 'Venda registrada com sucesso!' });

                    // AUTOMATIC WHATSAPP NOTIFICATION WITH 30 MIN ESTIMATE
                    if (snapshotTel) {
                      const itensMsg = snapshotCart.map(i => `• ${i.qtd}x ${i.nome}`).join('\n');
                      const msg = `*✅ PEDIDO CONFIRMADO!*\n\nOlá *${snapshotNome}*, obrigado pela preferência!\n\n🛒 *Resumo do Pedido:*\n${itensMsg}\n\n💰 *Total:* R$ ${snapshotTotal.toFixed(2)}\n💳 *Pagamento:* ${snapshotPgto}\n\n🚀 *Tempo Estimado de Entrega:*\n🕒 *30 Minutos*\n\n_Já estamos preparando sua entrega! 🛵_`;

                      const link = `https://wa.me/55${snapshotTel.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
                      // Small delay to ensure UI updates first
                      setTimeout(() => window.open(link, '_blank'), 500);
                    }

                    // Auto-open QR Code modal after sale
                    if (res.id) {
                      const newOrder = { id: res.id, nomeCliente: snapshotNome, telefoneCliente: snapshotTel, endereco: endBusca, valorTotal: snapshotTotal, status: 'Pendente', itens: snapshotCart } as Pedido;
                      handleGenerateQR(newOrder);
                    }
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
                    window.open(`https://wa.me/55${clienteObj.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
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
                        <button onClick={() => {
                          setSelectedDivida(m);
                          setMetodoBaixa('Dinheiro');
                          setShowBaixaModal(true);
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

  const renderEntregadores = () => (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex justify-between items-center bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl">
        <div><h2 className="text-2xl font-black text-slate-900 uppercase">🛵 Equipe de Entrega</h2><p className="text-[10px] font-black text-slate-400 uppercase mt-1">Gestão de Motoristas e Frota</p></div>
        <button onClick={() => { setNovoEntregador({ id: '', nome: '', telefone: '', veiculo: '', status: 'Ativo' }); setShowEntregadorModal(true); }} className="bg-blue-600 text-white px-8 py-4 rounded-3xl font-black text-[11px] uppercase shadow-xl hover:bg-blue-700 transition-all">Novo Entregador</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {entregadores.map(e => (
          <div key={e.id} className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl hover:shadow-2xl transition-all group">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl group-hover:bg-blue-600 group-hover:text-white transition-all"><i className="fas fa-motorcycle"></i></div>
                <div><h4 className="font-black text-slate-800 text-lg uppercase tracking-tight">{e.nome}</h4><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${e.status === 'Ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{e.status}</span></div>
              </div>
              <button onClick={() => { setNovoEntregador(e); setShowEntregadorModal(true); }} className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition flex items-center justify-center"><i className="fas fa-pen text-xs"></i></button>
            </div>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-tight"><span>Veículo</span><span className="text-slate-800">{e.veiculo}</span></div>
              <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-tight"><span>WhatsApp</span><span className="text-blue-600">{e.telefone}</span></div>
            </div>
            <button onClick={() => window.open(`https://wa.me/55${e.telefone.replace(/\D/g, '')}`, '_blank')} className="w-full py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-black text-[10px] uppercase hover:bg-emerald-600 hover:text-white transition-all">WhatsApp do Motorista</button>
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
        <button onClick={() => { setNovoProduto({ id: '', nome: '', preco: 0, estoque: 0, unidadeMedida: 'unidade', precoCusto: 0 }); setShowProdutoModal(true); }} className="bg-blue-600 text-white px-8 py-4 rounded-3xl font-black text-[11px] uppercase shadow-xl hover:bg-blue-700 transition-all">Novo Produto</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {produtos.map(p => {
          const isLowStock = p.estoque < ESTOQUE_MINIMO;
          return (
            <div key={p.id} className={`p-6 rounded-[30px] border shadow-lg hover:shadow-xl transition-all relative overflow-hidden group ${isLowStock ? 'bg-rose-50 border-rose-500 shadow-rose-200' : 'bg-white border-slate-100'}`}>
              {isLowStock && (
                <div className="absolute top-0 right-0 bg-rose-500 text-white text-[8px] font-black uppercase px-3 py-1 rounded-bl-xl z-10 flex items-center gap-1 animate-pulse">
                  <i className="fas fa-exclamation-triangle"></i> Estoque Crítico
                </div>
              )}
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black ${isLowStock ? 'bg-rose-100 text-rose-600' : 'bg-blue-50 text-blue-600'}`}><i className="fas fa-box-open"></i></div>
                <button onClick={() => { setNovoProduto(p); setShowProdutoModal(true); }} className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition flex items-center justify-center"><i className="fas fa-pen text-xs"></i></button>
              </div>
              <h4 className="font-black text-slate-800 text-base uppercase mb-1 truncate">{p.nome}</h4>
              <p className="text-[10px] text-slate-400 font-bold mb-4 uppercase">{p.id}</p>
              <div className={`space-y-2 p-4 rounded-2xl ${isLowStock ? 'bg-white' : 'bg-slate-50'}`}>
                <div className="flex justify-between text-xs font-bold uppercase"><span>Venda</span><span className="text-emerald-600">R$ {p.preco.toFixed(2)}</span></div>
                <div className="flex justify-between text-xs font-bold uppercase"><span>Custo</span><span className="text-slate-500">R$ {p.precoCusto.toFixed(2)}</span></div>
                <div className="flex justify-between text-xs font-bold uppercase pt-2 border-t border-slate-200"><span>Margem</span><span className="text-blue-600">{((p.preco - p.precoCusto) / p.preco * 100).toFixed(0)}%</span></div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${isLowStock ? 'bg-rose-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, (p.estoque / 100) * 100)}%` }}></div>
                </div>
                <span className={`text-xs font-black ${isLowStock ? 'text-rose-600' : 'text-slate-600'}`}>{p.estoque} un</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCaixa = () => {
    return (
      <div className="space-y-8 animate-in fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase">💰 Fluxo de Caixa</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Gestão Financeira Completa</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border">
            <input type="date" className="bg-transparent border-none text-xs font-bold text-slate-600 outline-none" value={caixaDataIni} onChange={e => setCaixaDataIni(e.target.value)} />
            <span className="text-slate-300 font-black">→</span>
            <input type="date" className="bg-transparent border-none text-xs font-bold text-slate-600 outline-none" value={caixaDataFim} onChange={e => setCaixaDataFim(e.target.value)} />
            <button onClick={() => loadData()} className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 transition"><i className="fas fa-sync-alt text-xs"></i></button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleGerarRelatorio} className="px-5 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase hover:bg-slate-200 transition"><i className="fas fa-chart-pie mr-1"></i> Relatório</button>
            <button onClick={() => { setMovimentacaoForm({ tipo: 'Entrada', descricao: '', valor: '', categoria: 'Geral' }); setShowFinanceiroModal(true); }} className="px-5 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-blue-700 transition">+ Lançamento</button>
          </div>
        </div>

        {/* Cards Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-[30px] border border-slate-100 shadow-lg relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 rounded-full opacity-50"></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Entradas</p>
            <h3 className="text-3xl font-black text-emerald-600">R$ {resumo?.totalEntradas.toFixed(2)}</h3>
          </div>
          <div className="bg-white p-6 rounded-[30px] border border-slate-100 shadow-lg relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-rose-50 rounded-full opacity-50"></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saídas</p>
            <h3 className="text-3xl font-black text-rose-600">R$ {resumo?.totalSaidas.toFixed(2)}</h3>
          </div>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-[30px] shadow-xl text-white relative overflow-hidden">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo Líquido</p>
            <h3 className="text-3xl font-black text-white">R$ {resumo?.saldo.toFixed(2)}</h3>
          </div>
        </div>

        {/* Tabela de Movimentações */}
        <div className="bg-white rounded-[30px] border border-slate-100 shadow-xl overflow-hidden">
          <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
            <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest">Movimentações Recentes</h3>
            {selectedMovimentacaoIds.length > 0 && (
              <div className="flex items-center gap-4 bg-blue-50 px-4 py-2 rounded-xl">
                <span className="text-xs font-bold text-blue-700">{selectedMovimentacaoIds.length} selecionados</span>
                <span className="text-xs font-black text-blue-900">Total: R$ {totalSelecionadoFinanceiro.toFixed(2)}</span>
                <button onClick={handleExportMovimentacoes} className="text-[10px] bg-white border border-blue-200 text-blue-700 px-3 py-1 rounded-lg uppercase font-bold hover:bg-blue-100">Exportar Excel</button>
              </div>
            )}
          </div>
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-4 w-10"><input type="checkbox" onChange={(e) => {
                  if (e.target.checked && resumo?.recentes) setSelectedMovimentacaoIds(resumo.recentes.map(m => m.id));
                  else setSelectedMovimentacaoIds([]);
                }} className="rounded text-blue-600" /></th>
                {['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor'].map(h => <th key={h} className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resumo?.recentes.map(m => {
                const tipo = m.tipo.trim();
                const isSaida = tipo === 'Saída' || tipo === 'Saida';
                return (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4"><input type="checkbox" checked={selectedMovimentacaoIds.includes(m.id)} onChange={() => {
                      if (selectedMovimentacaoIds.includes(m.id)) setSelectedMovimentacaoIds(prev => prev.filter(id => id !== m.id));
                      else setSelectedMovimentacaoIds(prev => [...prev, m.id]);
                    }} className="rounded text-blue-600" /></td>
                    <td className="px-6 py-4 text-[10px] font-bold text-slate-500">{m.dataHora}</td>
                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${m.tipo === 'Entrada' ? 'bg-emerald-100 text-emerald-600' : isSaida ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>{m.tipo}</span></td>
                    <td className="px-6 py-4 font-bold text-slate-800 text-xs">{m.descricao}</td>
                    <td className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase">{m.categoria}</td>
                    <td className={`px-6 py-4 font-black text-xs ${m.tipo === 'Entrada' ? 'text-emerald-600' : isSaida ? 'text-rose-600' : 'text-slate-400'}`}>R$ {m.valor.toFixed(2)}</td>
                  </tr>
                )
              })}
              {(!resumo?.recentes || resumo.recentes.length === 0) && (
                <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold text-xs uppercase">Nenhuma movimentação no período</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderClientes = () => {
    const filteredClientes = clientes.filter(c =>
      c.nome.toLowerCase().includes(searchTermCRM.toLowerCase()) ||
      c.telefone.includes(searchTermCRM) ||
      c.endereco.toLowerCase().includes(searchTermCRM.toLowerCase())
    );

    return (
      <div className="space-y-8 animate-in fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase">👥 Clientes (CRM)</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Base de Contatos e Histórico</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <input className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl font-bold text-xs" placeholder="Buscar cliente..." value={searchTermCRM} onChange={e => setSearchTermCRM(e.target.value)} />
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
            <label className="flex items-center gap-2 px-5 py-3 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase shadow-lg hover:bg-emerald-600 transition cursor-pointer">
              <i className="fas fa-file-excel text-sm"></i> Importar Excel
              <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx, .xls" className="hidden" />
            </label>
          </div>
        </div>

        <div className="bg-white rounded-[30px] border border-slate-100 shadow-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
              <tr>{['Nome', 'Telefone', 'Endereço', 'Bairro', 'Cadastro', 'Ações'].map(h => <th key={h} className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClientes.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-black text-slate-800 text-xs uppercase">{c.nome}</td>
                  <td className="px-6 py-4 text-xs font-bold text-blue-600">{c.telefone}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500">{c.endereco}</td>
                  <td className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase">{c.bairro}</td>
                  <td className="px-6 py-4 text-[10px] font-bold text-slate-400">{c.dataCadastro}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => window.open(`https://wa.me/55${c.telefone.replace(/\D/g, '')}`, '_blank')} className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white transition flex items-center justify-center"><i className="fab fa-whatsapp"></i></button>
                      <button onClick={() => {
                        setNomeBusca(c.nome); setTelBusca(c.telefone); setEndBusca(c.endereco);
                        setActiveTab('vendas');
                      }} className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-600 hover:text-white transition flex items-center justify-center" title="Novo Pedido"><i className="fas fa-cart-plus"></i></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredClientes.length === 0 && (
                <tr><td colSpan={6} className="p-10 text-center text-slate-300 font-bold uppercase">Nenhum cliente encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderMarketing = () => {
    return (
      <div className="h-[calc(100vh-8rem)] flex flex-col space-y-4 animate-in fade-in">
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase">🚀 Marketing Inteligente</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase mt-1">Crie posts, legendas e promoções com IA</p>
          </div>
          <div className="w-12 h-12 bg-gradient-to-tr from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-purple-200">
            <i className="fas fa-magic text-white text-xl"></i>
          </div>
        </div>

        <div className="flex-1 bg-white rounded-[30px] shadow-xl border border-slate-100 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-50/50">
            {marketingChat.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl p-5 shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'}`}>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{msg.text}</div>
                  {msg.role === 'model' && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.text);
                          setMessage({ type: 'success', text: 'Texto copiado!' });
                        }}
                        className="text-[10px] uppercase font-black text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
                      >
                        <i className="fas fa-copy"></i> Copiar
                      </button>
                      <button
                        onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(msg.text)}`, '_blank')}
                        className="text-[10px] uppercase font-black text-slate-400 hover:text-emerald-500 flex items-center gap-1 transition-colors"
                      >
                        <i className="fab fa-whatsapp"></i> Enviar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex justify-start">
                <div className="bg-white p-4 rounded-2xl rounded-bl-none shadow-sm border border-slate-100 flex items-center gap-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full typing-dot"></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full typing-dot"></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full typing-dot"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-slate-100">
            <div className="relative flex items-center gap-2">
              <input
                value={marketingInput}
                onChange={(e) => setMarketingInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isGenerating && handleSendMarketingMessage()}
                placeholder="Ex: Crie uma promoção de Gás para o fim de semana..."
                className="w-full pl-5 pr-14 py-4 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                disabled={isGenerating}
              />
              <button
                onClick={handleSendMarketingMessage}
                disabled={isGenerating || !marketingInput.trim()}
                className="absolute right-2 p-3 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <i className="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-20 lg:w-64 bg-white border-r border-slate-200 fixed h-full z-20 hidden md:flex flex-col justify-between transition-all">
        <div>
          <div className="h-24 flex items-center justify-center border-b border-slate-100 p-4">
            <img src={LOGO_URL} alt="Bio Gás" className="max-h-16 w-auto object-contain" />
          </div>
          <nav className="p-4 space-y-2">
            {[
              { id: 'vendas', icon: 'fa-cash-register', label: 'Vendas' },
              { id: 'caixa', icon: 'fa-chart-pie', label: 'Fluxo Caixa' },
              { id: 'clientes', icon: 'fa-users', label: 'Clientes' },
              { id: 'cobranca', icon: 'fa-hand-holding-dollar', label: 'Cobrança' },
              { id: 'estoque', icon: 'fa-boxes-stacked', label: 'Estoque' },
              { id: 'entregadores', icon: 'fa-motorcycle', label: 'Equipe' },
              { id: 'marketing', icon: 'fa-bullhorn', label: 'Marketing IA' },
            ].map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}>
                <i className={`fas ${item.icon} w-6 text-center text-lg`}></i>
                <span className="font-bold text-sm hidden lg:block">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="p-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hidden lg:block">
            <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Status do Sistema</p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-xs font-bold text-slate-600">Online</span>
            </div>
          </div>
        </div>
      </aside>

      {/* MOBILE NAV BOTTOM */}
      <div className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 z-50 flex justify-around p-2 pb-safe">
        {[
          { id: 'vendas', icon: 'fa-cash-register' },
          { id: 'caixa', icon: 'fa-chart-pie' },
          { id: 'clientes', icon: 'fa-users' },
          { id: 'marketing', icon: 'fa-bullhorn' },
          { id: 'estoque', icon: 'fa-box' }
        ].map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`p-4 rounded-2xl ${activeTab === item.id ? 'text-blue-600 bg-blue-50' : 'text-slate-300'}`}>
            <i className={`fas ${item.icon} text-xl`}></i>
          </button>
        ))}
      </div>

      <main className="flex-1 md:ml-20 lg:ml-64 p-6 lg:p-10 mb-20 md:mb-0">
        {/* HEADER MOBILE */}
        <div className="md:hidden flex justify-between items-center mb-6">
          <img src={LOGO_URL} alt="Bio Gás" className="h-10 w-auto object-contain" />
        </div>

        {/* MESSAGE TOAST */}
        {message && (
          <div className={`fixed top-6 right-6 px-6 py-4 rounded-2xl shadow-2xl z-50 text-white font-bold text-sm flex items-center gap-3 animate-in slide-in-from-right ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
            <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
            {message.text}
            <button onClick={() => setMessage(null)} className="ml-2 opacity-50 hover:opacity-100">×</button>
          </div>
        )}

        {/* LOADING OVERLAY */}
        {loading && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
              <p className="text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">Processando...</p>
            </div>
          </div>
        )}

        {/* CONTENT */}
        <div className="max-w-7xl mx-auto">
          {activeTab === 'vendas' && renderVendas()}
          {activeTab === 'caixa' && renderCaixa()}
          {activeTab === 'cobranca' && renderCobranca()}
          {activeTab === 'estoque' && renderEstoque()}
          {activeTab === 'clientes' && renderClientes()}
          {activeTab === 'entregadores' && renderEntregadores()}
          {activeTab === 'marketing' && renderMarketing()}
        </div>
      </main>

      {/* --- MODALS --- */}

      {/* MODAL QR CODE */}
      {showQRModal && qrCodePedido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[30px] p-8 w-full max-w-sm text-center shadow-2xl animate-in zoom-in-95">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"><i className="fas fa-qrcode"></i></div>
            <h3 className="text-xl font-black text-slate-800 uppercase mb-2">Pedido #{qrCodePedido.id}</h3>
            <p className="text-xs text-slate-400 font-bold mb-6">Escaneie para rastrear o pedido</p>

            <div className="bg-white p-4 rounded-xl border-2 border-slate-100 inline-block mb-6">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?tracking=' + qrCodePedido.id)}`} alt="QR Code" className="w-48 h-48" />
            </div>

            <div className="space-y-3">
              <button onClick={() => {
                const link = window.location.origin + window.location.pathname + '?tracking=' + qrCodePedido.id;
                navigator.clipboard.writeText(link);
                setMessage({ type: 'success', text: 'Link copiado!' });
              }} className="w-full py-3 bg-slate-100 text-slate-600 font-black rounded-xl text-xs uppercase hover:bg-slate-200 transition">Copiar Link</button>
              <button onClick={() => setShowQRModal(false)} className="w-full py-3 text-slate-400 font-bold text-xs uppercase hover:text-slate-600">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ENTREGADOR */}
      {showEntregadorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[30px] p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-black text-slate-800 uppercase mb-6">Gerenciar Entregador</h3>
            <div className="space-y-4">
              <input className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" placeholder="Nome Completo" value={novoEntregador.nome} onChange={e => setNovoEntregador({ ...novoEntregador, nome: e.target.value })} />
              <input className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" placeholder="Telefone (WhatsApp)" value={novoEntregador.telefone} onChange={e => setNovoEntregador({ ...novoEntregador, telefone: e.target.value })} />
              <input className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" placeholder="Veículo (Modelo/Placa)" value={novoEntregador.veiculo} onChange={e => setNovoEntregador({ ...novoEntregador, veiculo: e.target.value })} />
              <select className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" value={novoEntregador.status} onChange={e => setNovoEntregador({ ...novoEntregador, status: e.target.value as any })}>
                <option value="Ativo">Ativo</option>
                <option value="Inativo">Inativo</option>
              </select>
              <div className="grid grid-cols-2 gap-4 pt-4">
                <button onClick={() => setShowEntregadorModal(false)} className="py-3 bg-slate-100 text-slate-500 font-black rounded-xl text-xs uppercase hover:bg-slate-200">Cancelar</button>
                <button onClick={async () => {
                  setLoading(true);
                  try {
                    await gasService.salvarEntregador(novoEntregador);
                    setShowEntregadorModal(false);
                    await loadData(true);
                    setMessage({ type: 'success', text: 'Entregador salvo!' });
                  } finally { setLoading(false); }
                }} className="py-3 bg-blue-600 text-white font-black rounded-xl text-xs uppercase hover:bg-blue-700 shadow-lg shadow-blue-200">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRODUTO */}
      {showProdutoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[30px] p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-black text-slate-800 uppercase mb-6">Gerenciar Produto</h3>
            <div className="space-y-4">
              <input className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" placeholder="Nome do Produto" value={novoProduto.nome} onChange={e => setNovoProduto({ ...novoProduto, nome: e.target.value })} />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Preço Venda</label>
                  <input type="number" className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" placeholder="Preço" value={novoProduto.preco} onChange={e => setNovoProduto({ ...novoProduto, preco: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Preço Custo</label>
                  <input type="number" className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" placeholder="Custo" value={novoProduto.precoCusto} onChange={e => setNovoProduto({ ...novoProduto, precoCusto: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Estoque</label>
                  <input type="number" className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" placeholder="Estoque" value={novoProduto.estoque} onChange={e => setNovoProduto({ ...novoProduto, estoque: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Unidade</label>
                  <input className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" placeholder="Un (kg, un)" value={novoProduto.unidadeMedida} onChange={e => setNovoProduto({ ...novoProduto, unidadeMedida: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <button onClick={() => setShowProdutoModal(false)} className="py-3 bg-slate-100 text-slate-500 font-black rounded-xl text-xs uppercase hover:bg-slate-200">Cancelar</button>
                <button onClick={async () => {
                  setLoading(true);
                  try {
                    await gasService.salvarProduto(novoProduto);
                    setShowProdutoModal(false);
                    await loadData(true);
                    setMessage({ type: 'success', text: 'Produto salvo!' });
                  } finally { setLoading(false); }
                }} className="py-3 bg-blue-600 text-white font-black rounded-xl text-xs uppercase hover:bg-blue-700 shadow-lg shadow-blue-200">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FINANCEIRO LANÇAMENTO */}
      {showFinanceiroModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[30px] p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-black text-slate-800 uppercase mb-6">Novo Lançamento</h3>
            <div className="space-y-4">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setMovimentacaoForm({ ...movimentacaoForm, tipo: 'Entrada' })}
                  className={`flex-1 py-2 rounded-lg text-xs font-black uppercase transition ${movimentacaoForm.tipo === 'Entrada' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-200'}`}
                >
                  Entrada
                </button>
                <button
                  onClick={() => setMovimentacaoForm({ ...movimentacaoForm, tipo: 'Saída' })}
                  className={`flex-1 py-2 rounded-lg text-xs font-black uppercase transition ${movimentacaoForm.tipo === 'Saída' ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-200'}`}
                >
                  Saída
                </button>
              </div>
              <input className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" placeholder="Descrição (Ex: Conta de Luz)" value={movimentacaoForm.descricao} onChange={e => setMovimentacaoForm({ ...movimentacaoForm, descricao: e.target.value })} />
              <input className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" placeholder="Valor (R$)" type="number" value={movimentacaoForm.valor} onChange={e => setMovimentacaoForm({ ...movimentacaoForm, valor: e.target.value })} />
              <select className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" value={movimentacaoForm.categoria} onChange={e => setMovimentacaoForm({ ...movimentacaoForm, categoria: e.target.value })}>
                <option value="Geral">Geral</option>
                <option value="Vendas">Vendas</option>
                <option value="Despesas Operacionais">Despesas Operacionais</option>
                <option value="Fornecedores">Fornecedores</option>
                <option value="Pessoal">Pessoal</option>
              </select>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <button onClick={() => setShowFinanceiroModal(false)} className="py-3 bg-slate-100 text-slate-500 font-black rounded-xl text-xs uppercase hover:bg-slate-200">Cancelar</button>
                <button onClick={async () => {
                  if (!movimentacaoForm.descricao || !movimentacaoForm.valor) return;
                  setLoading(true);
                  try {
                    await gasService.registrarMovimentacao(movimentacaoForm.tipo, Number(movimentacaoForm.valor), movimentacaoForm.descricao, movimentacaoForm.categoria, 'Manual', 'Lançamento Manual App');
                    setShowFinanceiroModal(false);
                    await loadData(true);
                    setMessage({ type: 'success', text: 'Lançamento registrado!' });
                  } finally { setLoading(false); }
                }} className="py-3 bg-blue-600 text-white font-black rounded-xl text-xs uppercase hover:bg-blue-700 shadow-lg shadow-blue-200">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BAIXA DÍVIDA */}
      {showBaixaModal && selectedDivida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[30px] p-8 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl"><i className="fas fa-hand-holding-dollar"></i></div>
              <h3 className="text-lg font-black text-slate-800 uppercase">Receber Pagamento</h3>
              <p className="text-xs text-slate-500 mt-2 font-bold">{selectedDivida.descricao}</p>
              <h2 className="text-3xl font-black text-emerald-600 mt-2">R$ {selectedDivida.valor.toFixed(2)}</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Método de Pagamento</label>
                <select className="w-full p-4 bg-slate-50 border-none rounded-xl font-bold text-sm" value={metodoBaixa} onChange={e => setMetodoBaixa(e.target.value)}>
                  {Object.values(PaymentMethod).filter(m => m !== 'A Receber').map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button onClick={async () => {
                setLoading(true);
                try {
                  await gasService.liquidarDivida(selectedDivida.id, metodoBaixa);
                  setShowBaixaModal(false);
                  await loadData(true);
                  setMessage({ type: 'success', text: 'Dívida liquidada com sucesso!' });
                } finally { setLoading(false); }
              }} className="w-full py-4 bg-emerald-500 text-white font-black rounded-xl text-xs uppercase hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition">Confirmar Recebimento</button>
              <button onClick={() => setShowBaixaModal(false)} className="w-full py-3 text-slate-400 font-bold text-xs uppercase hover:text-slate-600">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RELATÓRIO */}
      {showRelatorioModal && relatorio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[30px] p-0 w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-blue-600 p-6 text-white text-center">
              <h3 className="text-lg font-black uppercase">Relatório Mensal</h3>
              <p className="opacity-80 text-sm font-medium">{relatorio.mes}</p>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-center">
                  <p className="text-[10px] uppercase font-black text-emerald-400">Entradas</p>
                  <p className="text-xl font-black text-emerald-600">R$ {relatorio.totalEntradas.toFixed(2)}</p>
                </div>
                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 text-center">
                  <p className="text-[10px] uppercase font-black text-rose-400">Saídas</p>
                  <p className="text-xl font-black text-rose-600">R$ {relatorio.totalSaidas.toFixed(2)}</p>
                </div>
              </div>
              <div className="bg-slate-900 p-4 rounded-2xl text-center text-white">
                <p className="text-[10px] uppercase font-black text-slate-400">Saldo Final</p>
                <p className="text-3xl font-black">R$ {relatorio.saldo.toFixed(2)}</p>
              </div>

              {/* NOVO: DESEMPENHO DE PRODUTOS */}
              <div>
                <h4 className="text-xs font-black text-slate-400 uppercase border-b pb-2 mb-3">Desempenho de Produtos</h4>
                <div className="space-y-3">
                  {relatorio.vendasPorProduto && relatorio.vendasPorProduto.length > 0 ? (
                    relatorio.vendasPorProduto.map((prod, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-black text-xs">{idx + 1}</div>
                          <div>
                            <p className="text-xs font-black text-slate-700">{prod.produto}</p>
                            <p className="text-[10px] font-bold text-slate-400">{prod.qtd} unidades vendidas</p>
                          </div>
                        </div>
                        <span className="text-xs font-black text-emerald-600">R$ {prod.valorTotal.toFixed(2)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 font-bold text-center py-4">Nenhum produto vendido neste mês.</p>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black text-slate-400 uppercase border-b pb-2 mb-3">Detalhamento de Entradas</h4>
                <div className="space-y-2">
                  {relatorio.categoriasEntrada.map((c, idx) => (
                    <div key={idx} className="flex justify-between text-xs font-bold text-slate-600">
                      <span>{c.categoria}</span>
                      <span>R$ {c.valor.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black text-slate-400 uppercase border-b pb-2 mb-3">Detalhamento de Saídas</h4>
                <div className="space-y-2">
                  {relatorio.categoriasSaida.map((c, idx) => (
                    <div key={idx} className="flex justify-between text-xs font-bold text-slate-600">
                      <span>{c.categoria}</span>
                      <span>R$ {c.valor.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t text-center">
              <button onClick={() => setShowRelatorioModal(false)} className="px-8 py-3 bg-white border border-slate-200 rounded-xl font-black text-xs uppercase text-slate-600 hover:bg-slate-100">Fechar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;