
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
  { id: 'E1', nome: 'Carlos Moto', telefone: '11988887777', status: 'Ativo', veiculo: 'CG 160 Preta' }
];

let mockPedidos: Pedido[] = [];
let mockFinanceiro: Movimentacao[] = [];

export const gasService = {
  listarClientes: async () => { try { return await callGAS('listarClientes'); } catch { return [...mockClientes]; } },
  
  listarProdutos: async () => { try { return await callGAS('listarProdutos'); } catch { return [...mockProdutos]; } },
  salvarProduto: async (p: any) => {
    try { return await callGAS('salvarProduto', p); }
    catch {
      const idx = mockProdutos.findIndex(item => item.id === p.id);
      if(idx !== -1) mockProdutos[idx] = p;
      else mockProdutos.push({...p, id: "PRD-"+Date.now()});
      return { success: true };
    }
  },

  liquidarDivida: async (id: string) => {
    try { return await callGAS('liquidarDivida', id); }
    catch {
      const idx = mockFinanceiro.findIndex(m => m.id === id);
      if(idx !== -1) {
        const divida = mockFinanceiro[idx];
        divida.tipo = 'Liquidado';
        mockFinanceiro.unshift({
          id: `FIN-${Date.now()}`,
          dataHora: new Date().toLocaleDateString(),
          tipo: 'Entrada',
          descricao: `Recebimento Fiado: ${divida.descricao}`,
          valor: divida.valor,
          categoria: 'Liquidação'
        });
      }
      return { success: true };
    }
  },

  listarEntregadores: async () => { try { return await callGAS('listarEntregadores'); } catch { return [...mockEntregadores]; } },
  
  salvarPedido: async (d: any) => { 
    try { return await callGAS('salvarPedido', d); } 
    catch { 
      const id = `PED-${Math.floor(Math.random()*10000)}`;
      mockPedidos.unshift({ ...d, id, status: 'Pendente', dataHora: new Date().toLocaleTimeString() });
      return { success: true, id }; 
    } 
  },
  
  atualizarStatusPedido: async (id: string, s: string) => { 
    return gasService.atualizarStatusPedidosEmMassa([id], s);
  },

  atualizarStatusPedidosEmMassa: async (ids: string[], s: string) => {
    try { return await callGAS('atualizarStatusPedidosEmMassa', ids, s); }
    catch {
      ids.forEach(id => {
        const p = mockPedidos.find(p => p.id === id);
        if (p) {
          p.status = s as any;
          if (s === 'Entregue') {
            mockFinanceiro.unshift({ 
              id: `FIN-${Date.now()}`, 
              dataHora: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(), 
              tipo: p.formaPagamento === 'A Receber' ? 'A Receber' : 'Entrada', 
              descricao: `Venda Finalizada: ${p.nomeCliente}`, 
              valor: Number(p.valorTotal), 
              categoria: 'Venda Direta', 
              metodo: p.formaPagamento 
            });
          }
        }
      });
      return { success: true, count: ids.length };
    }
  },
  
  getResumoFinanceiro: async () => { 
    try { return await callGAS('getResumoFinanceiro'); } 
    catch { 
      let ent = 0, sai = 0, aRec = 0;
      mockFinanceiro.forEach(m => { 
        if(m.tipo === 'Entrada') ent += m.valor; 
        else if(m.tipo === 'Saída') sai += m.valor;
        else if(m.tipo === 'A Receber') aRec += m.valor;
      });
      return { totalEntradas: ent, totalSaidas: sai, totalAReceber: aRec, saldo: ent - sai, porMetodo: {}, recentes: mockFinanceiro.slice(0, 50) }; 
    } 
  },
  
  listarUltimosPedidos: async () => { try { return await callGAS('listarUltimosPedidos'); } catch { return mockPedidos.slice(0, 30); } },
};
