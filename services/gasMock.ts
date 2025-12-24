
import { Cliente, Produto, Entregador, Pedido, ResumoFinanceiro, Movimentacao, PedidoItem } from '../types';

// Função auxiliar para chamar o Google Apps Script se disponível
const callGAS = async (functionName: string, ...args: any[]): Promise<any> => {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      // @ts-ignore
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)[functionName](...args);
    } else {
      // Se não estiver no GAS, rejeita para cair no fallback do Mock
      reject(new Error('Ambiente GAS não detectado'));
    }
  });
};

let mockClientes: Cliente[] = [
  { id: '1', telefone: '11999998888', nome: 'João Silva', endereco: 'Rua das Flores, 123', bairro: 'Centro', referencia: 'Perto da padaria', dataCadastro: '2023-01-01' },
  { id: '2', telefone: '11988884444', nome: 'Maria Oliveira', endereco: 'Rua das Flores, 456', bairro: 'Centro', referencia: 'Casa amarela', dataCadastro: '2023-02-15' },
  { id: '3', telefone: '11977773333', nome: 'Ricardo Santos', endereco: 'Avenida Paulista, 1000', bairro: 'Bela Vista', referencia: 'Edifício Gazeta', dataCadastro: '2023-03-10' }
];

let mockProdutos: Produto[] = [
  { id: 'P13', nome: 'Gás P13 (Cozinha)', preco: 110, estoque: 50 },
  { id: 'A20', nome: 'Água 20L', preco: 15, estoque: 100 }
];

let mockEntregadores: Entregador[] = [
  { id: 'E1', nome: 'Carlos Moto', telefone: '11988887777', status: 'Ativo', veiculo: 'Titan 160 Preta' },
  { id: 'E2', nome: 'Marcos Entrega', telefone: '11977776666', status: 'Ativo', veiculo: 'Biz Azul' }
];

let mockPedidos: Pedido[] = [
  { 
    id: 'PED-001', 
    dataHora: '20/05/2024 10:00:00', 
    nomeCliente: 'João Silva', 
    telefoneCliente: '11999998888', 
    endereco: 'Rua das Flores, 123', 
    itens: [{ produtoId: 'P13', nome: 'Gás P13 (Cozinha)', qtd: 1, precoUnitario: 110 }],
    valorTotal: 110, 
    entregador: 'Carlos Moto', 
    status: 'Entregue', 
    formaPagamento: 'PIX' 
  }
];

let mockFinanceiro: Movimentacao[] = [
  { id: 'FIN-1', dataHora: '20/05/2024 10:00:05', tipo: 'Entrada', descricao: 'Venda: João Silva', valor: 110, categoria: 'Venda', metodo: 'PIX' },
  { id: 'FIN-2', dataHora: '20/05/2024 11:30:00', tipo: 'Saída', descricao: 'Gasolina Moto 01', valor: 45, categoria: 'Combustível', metodo: 'Dinheiro' }
];

export const gasService = {
  listarClientes: async () => {
    try { return await callGAS('listarClientes'); }
    catch { return [...mockClientes]; }
  },
  buscarClientePorTelefone: async (t: string) => {
    try { return await callGAS('buscarClientePorTelefone', t); }
    catch {
      const clean = t.replace(/\D/g, '');
      return mockClientes.find(c => c.telefone.replace(/\D/g, '') === clean) || null;
    }
  },
  salvarCliente: async (c: Partial<Cliente>) => {
    try { return await callGAS('salvarCliente', c); }
    catch {
      const cleanTel = String(c.telefone || '').replace(/\D/g, '');
      if (c.id) {
        const idx = mockClientes.findIndex(cli => cli.id === c.id);
        if (idx !== -1) mockClientes[idx] = { ...mockClientes[idx], ...c, telefone: cleanTel } as Cliente;
      } else {
        mockClientes.unshift({ ...c, id: `CLI-${Math.floor(Math.random()*10000)}`, telefone: cleanTel, dataCadastro: new Date().toLocaleDateString() } as Cliente);
      }
      return { success: true };
    }
  },
  excluirCliente: async (id: string) => {
    try { return await callGAS('excluirCliente', id); }
    catch {
      mockClientes = mockClientes.filter(c => c.id !== id);
      return { success: true };
    }
  },
  listarProdutos: async () => {
    try { return await callGAS('listarProdutos'); }
    catch { return [...mockProdutos]; }
  },
  salvarProduto: async (p: Partial<Produto>) => {
    try { return await callGAS('salvarProduto', p); }
    catch {
      if (p.id) {
        const idx = mockProdutos.findIndex(item => item.id === p.id);
        if (idx !== -1) mockProdutos[idx] = { ...mockProdutos[idx], ...p } as Produto;
      } else {
        mockProdutos.push({ ...p, id: `PROD-${Math.floor(Math.random() * 1000)}` } as Produto);
      }
      return { success: true };
    }
  },
  listarEntregadores: async () => {
    try { return await callGAS('listarEntregadores'); }
    catch { return [...mockEntregadores]; }
  },
  salvarEntregador: async (e: Partial<Entregador>) => {
    try { return await callGAS('salvarEntregador', e); }
    catch {
      if (e.id) {
        const idx = mockEntregadores.findIndex(ent => ent.id === e.id);
        if (idx !== -1) mockEntregadores[idx] = { ...mockEntregadores[idx], ...e } as Entregador;
      } else {
        mockEntregadores.push({ ...e, id: `ENT-${Math.floor(Math.random()*1000)}`, status: 'Ativo' } as Entregador);
      }
      return { success: true };
    }
  },
  // Fix: Added the missing excluirEntregador method to allow removing delivery personnel records
  excluirEntregador: async (id: string) => {
    try { return await callGAS('excluirEntregador', id); }
    catch {
      mockEntregadores = mockEntregadores.filter(e => e.id !== id);
      return { success: true };
    }
  },
  salvarPedido: async (d: any) => {
    try { return await callGAS('salvarPedido', d); }
    catch {
      const id = `PED-${Math.floor(Math.random()*10000)}`;
      mockPedidos.unshift({ ...d, id, status: 'Pendente', dataHora: new Date().toLocaleString() });
      d.itens.forEach((item: PedidoItem) => {
        const p = mockProdutos.find(p => p.nome === item.nome);
        if (p) p.estoque -= item.qtd;
      });
      return { success: true, id };
    }
  },
  atualizarStatusPedido: async (id: string, s: string) => {
    try { return await callGAS('atualizarStatusPedido', id, s); }
    catch {
      const p = mockPedidos.find(p => p.id === id);
      if (p) {
        p.status = s as any;
        if (s === 'Entregue') {
          mockFinanceiro.unshift({ id: `FIN-${Date.now()}`, dataHora: new Date().toLocaleString(), tipo: 'Entrada', descricao: `Venda: ${p.nomeCliente}`, valor: p.valorTotal, categoria: 'Venda', metodo: p.formaPagamento });
        }
        return { success: true };
      }
      return { success: false };
    }
  },
  getResumoFinanceiro: async (): Promise<ResumoFinanceiro> => {
    try { return await callGAS('getResumoFinanceiro'); }
    catch {
      let entradas = 0, saidas = 0;
      const porMetodo: any = {};
      mockFinanceiro.forEach(m => {
        if (m.tipo === 'Entrada') { entradas += m.valor; porMetodo[m.metodo!] = (porMetodo[m.metodo!] || 0) + m.valor; }
        else { saidas += m.valor; }
      });
      return { totalEntradas: entradas, totalSaidas: saidas, saldo: entradas - saidas, porMetodo, recentes: mockFinanceiro.slice(0, 50) };
    }
  },
  listarUltimosPedidos: async () => {
    try { return await callGAS('listarUltimosPedidos'); }
    catch { return mockPedidos.slice(0, 15); }
  },
  registrarMovimentacao: async (d: any) => {
    try { return await callGAS('registrarMovimentacao', d.tipo, d.valor, d.descricao, d.categoria, d.metodo); }
    catch {
      mockFinanceiro.unshift({ id: `FIN-${Date.now()}`, dataHora: new Date().toLocaleString(), tipo: d.tipo, descricao: d.descricao, valor: d.valor, categoria: d.categoria, metodo: d.metodo || 'Caixa' });
      return { success: true };
    }
  },
  salvarClientesEmMassa: async (lista: any[]) => {
    try { return await callGAS('salvarClientesEmMassa', lista); }
    catch {
      const novos = lista.map(c => ({ ...c, id: `IMP-${Math.floor(Math.random()*10000)}`, telefone: String(c.telefone).replace(/\D/g, ''), dataCadastro: new Date().toLocaleDateString() }));
      mockClientes = [...novos, ...mockClientes];
      return { success: true, count: novos.length };
    }
  },
};
