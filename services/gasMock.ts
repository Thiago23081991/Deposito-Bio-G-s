
import { Cliente, Produto, Entregador, Pedido, ResumoFinanceiro, Movimentacao, PedidoItem, RelatorioMensal } from '../types.ts';

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
  { id: 'P13', nome: 'Gás P13 (Cozinha)', preco: 110, estoque: 50, unidadeMedida: 'unidade', precoCusto: 85.50 },
  { id: 'A20', nome: 'Água 20L', preco: 15, estoque: 100, unidadeMedida: 'unidade', precoCusto: 8.00 }
];

let mockEntregadores: Entregador[] = [
  { id: 'E1', nome: 'Carlos Moto', telefone: '11988887777', status: 'Ativo', veiculo: 'CG 160 Preta' }
];

let mockPedidos: Pedido[] = [];
let mockFinanceiro: Movimentacao[] = [];

export const gasService = {
  listarClientes: async () => { try { return await callGAS('listarClientes'); } catch { return [...mockClientes]; } },
  
  importarClientesEmMassa: async (clientes: any[]) => {
    try { return await callGAS('importarClientesEmMassa', clientes); }
    catch {
      clientes.forEach(c => {
        mockClientes.push({
          ...c,
          id: c.id || "CRM-" + Math.floor(Math.random() * 100000),
          dataCadastro: new Date().toLocaleDateString()
        });
      });
      return { success: true, count: clientes.length };
    }
  },

  listarProdutos: async () => { try { return await callGAS('listarProdutos'); } catch { return [...mockProdutos]; } },
  salvarProduto: async (p: any) => {
    try { return await callGAS('salvarProduto', p); }
    catch {
      const idx = mockProdutos.findIndex(item => item.id === p.id);
      if(idx !== -1) {
        mockProdutos[idx] = { ...mockProdutos[idx], ...p };
      } else {
        mockProdutos.push({...p, id: p.id || "PRD-"+Date.now()});
      }
      return { success: true };
    }
  },

  liquidarDivida: async (id: string, metodo: string) => {
    try { return await callGAS('liquidarDivida', id, metodo); }
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
          categoria: 'Liquidação',
          metodo: metodo || 'Dinheiro',
          detalhe: 'Liquidação manual via dashboard'
        });
      }
      return { success: true };
    }
  },

  listarEntregadores: async () => { try { return await callGAS('listarEntregadores'); } catch { return [...mockEntregadores]; } },
  
  salvarEntregador: async (e: any) => {
    try { return await callGAS('salvarEntregador', e); }
    catch {
      const idx = mockEntregadores.findIndex(item => item.id === e.id);
      if(idx !== -1) mockEntregadores[idx] = e;
      else mockEntregadores.push({...e, id: "ENT-"+Date.now(), status: 'Ativo'});
      return { success: true };
    }
  },

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
              metodo: p.formaPagamento,
              detalhe: `Pedido ${id}`
            });
          }
        }
      });
      return { success: true, count: ids.length };
    }
  },

  registrarMovimentacao: async (tipo: string, valor: number, descricao: string, categoria: string, metodo: string, detalhe: string = '') => {
    try { return await callGAS('registrarMovimentacao', tipo, valor, descricao, categoria, metodo, detalhe); }
    catch {
      mockFinanceiro.unshift({
        id: `FIN-${Date.now()}`,
        dataHora: new Date().toLocaleString(),
        tipo: tipo as any,
        descricao,
        valor,
        categoria,
        metodo,
        detalhe
      });
      return { success: true };
    }
  },
  
  getResumoFinanceiro: async (dataIni?: string, dataFim?: string) => { 
    try { return await callGAS('getResumoFinanceiro', dataIni, dataFim); } 
    catch { 
      let ent = 0, sai = 0, aRec = 0;
      
      const parseDate = (str: string) => {
         // Assumes dd/mm/yyyy
         if(!str) return 0;
         const parts = str.split(' ')[0].split('/');
         return new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0])).getTime();
      };
      
      const start = dataIni ? new Date(dataIni).getTime() : 0;
      const end = dataFim ? new Date(dataFim).getTime() + 86400000 : Infinity;

      const filtered = mockFinanceiro.filter(m => {
         const d = parseDate(m.dataHora);
         return d >= start && d <= end;
      });

      filtered.forEach(m => { 
        if(m.tipo === 'Entrada') ent += m.valor; 
        else if(m.tipo === 'Saída') sai += m.valor;
        else if(m.tipo === 'A Receber') aRec += m.valor;
      });
      
      return { totalEntradas: ent, totalSaidas: sai, totalAReceber: aRec, saldo: ent - sai, porMetodo: {}, recentes: filtered.slice(0, 100) }; 
    } 
  },

  gerarRelatorioMensal: async (): Promise<RelatorioMensal> => {
    try { return await callGAS('gerarRelatorioMensal'); }
    catch {
      // Mock logic: Filter current month
      const now = new Date();
      const currentMonthStr = now.toLocaleDateString().substring(3); // aprox mm/yyyy check based on locale
      
      let ent = 0, sai = 0;
      const catsEnt: Record<string, number> = {};
      const catsSai: Record<string, number> = {};

      mockFinanceiro.forEach(m => {
        // Simple check just to simulate. In real app date format needs to be strict
        if (true) { // Assuming all mock data is recent for demo
           if (m.tipo === 'Entrada') {
             ent += m.valor;
             catsEnt[m.categoria] = (catsEnt[m.categoria] || 0) + m.valor;
           } else if (m.tipo === 'Saída') {
             sai += m.valor;
             catsSai[m.categoria] = (catsSai[m.categoria] || 0) + m.valor;
           }
        }
      });

      return {
        mes: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
        totalEntradas: ent,
        totalSaidas: sai,
        saldo: ent - sai,
        categoriasEntrada: Object.entries(catsEnt).map(([k, v]) => ({ categoria: k, valor: v })),
        categoriasSaida: Object.entries(catsSai).map(([k, v]) => ({ categoria: k, valor: v }))
      };
    }
  },
  
  listarUltimosPedidos: async () => { try { return await callGAS('listarUltimosPedidos'); } catch { return mockPedidos.slice(0, 30); } },

  buscarPedidoPorId: async (id: string) => {
    try { return await callGAS('buscarPedidoPorId', id); }
    catch { return mockPedidos.find(p => p.id === id) || null; }
  }
};
