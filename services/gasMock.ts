
import { Cliente, Produto, Entregador, Pedido, ResumoFinanceiro, Movimentacao, PedidoItem } from '../types.ts';

const callGAS = async (functionName: string, ...args: any[]): Promise<any> => {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      // @ts-ignore
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)[functionName](...args);
    } else {
      reject(new Error('Ambiente GAS não detectado'));
    }
  });
};

let mockClientes: Cliente[] = [
  { id: '1', telefone: '11999998888', nome: 'João Silva', endereco: 'Rua das Flores, 123', bairro: 'Centro', referencia: 'Perto da padaria', dataCadastro: '01/01/2024' }
];

let mockProdutos: Produto[] = [
  { id: 'P13', nome: 'Gás P13 (Cozinha)', preco: 110, estoque: 50 },
  { id: 'A20', nome: 'Água 20L', preco: 15, estoque: 100 }
];

let mockEntregadores: Entregador[] = [
  { id: 'E1', nome: 'Carlos Moto', telefone: '11988887777', status: 'Ativo', veiculo: 'CG 160 Preta' },
  { id: 'E2', nome: 'Marcos Entrega', telefone: '11977776666', status: 'Ativo', veiculo: 'Factor 150 Azul' }
];

let mockPedidos: Pedido[] = [];
let mockFinanceiro: Movimentacao[] = [];

export const gasService = {
  listarClientes: async () => { try { return await callGAS('listarClientes'); } catch { return [...mockClientes]; } },
  buscarClientePorTelefone: async (t: string) => { try { return await callGAS('buscarClientePorTelefone', t); } catch { return mockClientes.find(c => c.telefone.includes(t)) || null; } },
  salvarCliente: async (c: Partial<Cliente>) => { 
    try { return await callGAS('salvarCliente', c); } 
    catch { 
      if (c.id) {
        const idx = mockClientes.findIndex(cli => cli.id === c.id);
        if (idx !== -1) mockClientes[idx] = { ...mockClientes[idx], ...c } as Cliente;
      } else {
        mockClientes.unshift({ ...c, id: `CLI-${Date.now()}`, dataCadastro: new Date().toLocaleDateString() } as Cliente);
      }
      return { success: true }; 
    } 
  },
  excluirCliente: async (id: string) => { try { return await callGAS('excluirCliente', id); } catch { mockClientes = mockClientes.filter(c => c.id !== id); return { success: true }; } },
  
  listarProdutos: async () => { try { return await callGAS('listarProdutos'); } catch { return [...mockProdutos]; } },
  salvarProduto: async (p: Partial<Produto>) => { 
    try { return await callGAS('salvarProduto', p); } 
    catch { 
      if (p.id) {
        const idx = mockProdutos.findIndex(prod => prod.id === p.id);
        if (idx !== -1) mockProdutos[idx] = { ...mockProdutos[idx], ...p } as Produto;
      } else {
        mockProdutos.push({ ...p, id: `PROD-${Date.now()}` } as Produto);
      }
      return { success: true }; 
    } 
  },
  
  listarEntregadores: async () => { try { return await callGAS('listarEntregadores'); } catch { return [...mockEntregadores]; } },
  salvarEntregador: async (e: Partial<Entregador>) => { 
    try { return await callGAS('salvarEntregador', e); } 
    catch { 
      if (e.id) {
        const idx = mockEntregadores.findIndex(ent => ent.id === e.id);
        if (idx !== -1) mockEntregadores[idx] = { ...mockEntregadores[idx], ...e } as Entregador;
      } else {
        mockEntregadores.push({ ...e, id: `ENT-${Date.now()}` } as Entregador);
      }
      return { success: true }; 
    } 
  },
  excluirEntregador: async (id: string) => { try { return await callGAS('excluirEntregador', id); } catch { mockEntregadores = mockEntregadores.filter(e => e.id !== id); return { success: true }; } },
  
  salvarPedido: async (d: any) => { 
    try { return await callGAS('salvarPedido', d); } 
    catch { 
      const id = `PED-${Math.floor(Math.random()*10000)}`;
      mockPedidos.unshift({ ...d, id, status: 'Pendente', dataHora: new Date().toLocaleString() });
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
      }
      return { success: true }; 
    } 
  },
  getResumoFinanceiro: async () => { 
    try { return await callGAS('getResumoFinanceiro'); } 
    catch { 
      let ent = 0, sai = 0;
      mockFinanceiro.forEach(m => { if(m.tipo === 'Entrada') ent += m.valor; else sai += m.valor; });
      return { totalEntradas: ent, totalSaidas: sai, saldo: ent - sai, porMetodo: {}, recentes: mockFinanceiro.slice(0, 50) }; 
    } 
  },
  listarUltimosPedidos: async () => { try { return await callGAS('listarUltimosPedidos'); } catch { return mockPedidos.slice(0, 15); } },
  registrarMovimentacao: async (d: any) => { 
    try { return await callGAS('registrarMovimentacao', d.tipo, d.valor, d.descricao, d.categoria, d.metodo); } 
    catch { 
      mockFinanceiro.unshift({
        id: `FIN-${Date.now()}`,
        dataHora: new Date().toLocaleString(),
        tipo: d.tipo,
        descricao: d.descricao,
        valor: d.valor,
        categoria: d.categoria,
        metodo: d.metodo
      });
      return { success: true }; 
    } 
  },
  salvarClientesEmMassa: async (lista: any[]) => { 
    try { 
      return await callGAS('salvarClientesEmMassa', lista); 
    } catch { 
      let count = 0;
      lista.forEach(novo => {
        const telLimpo = String(novo.telefone).replace(/\D/g, '');
        if (!mockClientes.find(c => c.telefone === telLimpo)) {
          mockClientes.unshift({
            ...novo,
            id: `CLI-${Date.now()}-${count}`,
            telefone: telLimpo,
            dataCadastro: new Date().toLocaleDateString()
          } as Cliente);
          count++;
        }
      });
      return { success: true, count }; 
    } 
  },
};
