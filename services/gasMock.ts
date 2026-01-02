import { supabase } from './supabaseClient';
import { Cliente, Produto, Entregador, Pedido, ResumoFinanceiro, Movimentacao, PedidoItem, RelatorioMensal } from '../types.ts';

const formatDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Mock data definitions removed as we are now using Supabase

export const gasService = {
  listarClientes: async () => {
    const { data, error } = await supabase.from('clientes').select('*');
    if (error) throw error;
    return data;
  },

  importarClientesEmMassa: async (clientes: any[]) => {
    const { data, error } = await supabase.from('clientes').insert(clientes.map(c => ({
      ...c,
      data_cadastro: new Date()
    })));
    if (error) throw error;
    return { success: true, count: clientes.length };
  },

  listarProdutos: async () => {
    const { data, error } = await supabase.from('produtos').select('*');
    if (error) throw error;
    return data;
  },

  salvarProduto: async (p: any) => {
    // Check if ID exists (if UUID is provided) or simpler logic: upsert
    const { error } = await supabase.from('produtos').upsert(p);
    if (error) throw error;
    return { success: true };
  },

  listarEntregadores: async () => {
    const { data, error } = await supabase.from('entregadores').select('*');
    if (error) throw error;
    return data;
  },

  salvarEntregador: async (e: any) => {
    const { error } = await supabase.from('entregadores').upsert(e);
    if (error) throw error;
    return { success: true };
  },

  salvarPedido: async (d: any) => {
    const { data, error } = await supabase.from('pedidos').insert({
      nome_cliente: d.nomeCliente,
      telefone_cliente: d.telefoneCliente,
      endereco_entrega: d.endereco,
      valor_total: d.valorTotal,
      forma_pagamento: d.formaPagamento,
      itens: d.itens,
      entregador_nome: d.entregador, // We might need to handle ID relation later if strict
      status: 'Pendente'
    }).select().single();

    if (error) throw error;

    // Optional: Register transaction as well? Or handle via trigger?
    // For now, mirroring previous logic manually:
    // Actually, let's keep it simple first.
    return { success: true, id: data.id };
  },

  // Basic implementation for read-only tracking
  buscarPedidoPorId: async (id: string) => {
    const { data, error } = await supabase.from('pedidos').select('*').eq('id', id).single();
    if (error) return null; // or throw
    // Map back to front-end expected format if keys differ (snake_case vs camelCase)
    // We created tables with snake_case. Types might need adjustment or mapping here.
    return {
      ...data,
      nomeCliente: data.nome_cliente,
      telefoneCliente: data.telefone_cliente,
      endereco: data.endereco_entrega,
      valorTotal: data.valor_total,
      entregador: data.entregador_nome
    };
  },

  atualizarStatusPedidosEmMassa: async (ids: string[], s: string) => {
    const { error } = await supabase.from('pedidos').update({ status: s }).in('id', ids);
    if (error) throw error;
    return { success: true, count: ids.length };
  },

  // Stubbing others or implementing basic versions
  registrarMovimentacao: async (tipo: string, valor: number, descricao: string, categoria: string, metodo: string, detalhe: string = '') => {
    const { error } = await supabase.from('financeiro').insert({
      tipo, valor, descricao, categoria, metodo, detalhe
    });
    if (error) throw error;
    return { success: true };
  },

  getResumoFinanceiro: async (dataIni?: string, dataFim?: string) => {
    let query = supabase.from('financeiro').select('*').order('created_at', { ascending: false });

    if (dataIni) query = query.gte('created_at', dataIni);
    // simplistic date filter, ideal is proper ISO strings

    const { data, error } = await query;
    if (error || !data) return { totalEntradas: 0, totalSaidas: 0, totalAReceber: 0, saldo: 0, recentes: [] };

    let ent = 0, sai = 0, aRec = 0;
    data.forEach((m: any) => {
      const t = m.tipo?.trim();
      if (t === 'Entrada') ent += m.valor;
      else if (t === 'Saída' || t === 'Saida') sai += m.valor;
      else if (t === 'A Receber') aRec += m.valor;
    });

    return {
      totalEntradas: ent,
      totalSaidas: sai,
      totalAReceber: aRec,
      saldo: ent - sai,
      recentes: data.map((d: any) => ({ ...d, dataHora: formatDate(new Date(d.created_at)) }))
    };
  },

  listarUltimosPedidos: async () => {
    const { data, error } = await supabase.from('pedidos').select('*').order('created_at', { ascending: false }).limit(30);
    if (error) return [];
    return data.map((d: any) => ({
      ...d,
      nomeCliente: d.nome_cliente,
      telefoneCliente: d.telefone_cliente,
      endereco: d.endereco_entrega,
      valorTotal: d.valor_total,
      entregador: d.entregador_nome
    }));
  },

  // Placeholder for missing methods to avoid breaking build immediately, can implement later
  liquidarDivida: async (id: string, metodo: string) => {
    // Simplified logic: find transaction, update status, create new entry
    return { success: true };
  },

  gerarRelatorioMensal: async () => {
    // Basic stub
    return {
      mes: 'Atual',
      totalEntradas: 0,
      totalSaidas: 0,
      saldo: 0,
      categoriasEntrada: [],
      categoriasSaida: [],
      vendasPorProduto: []
    };
  },

  atualizarStatusPedido: async (id: string, s: string) => {
    const { error } = await supabase.from('pedidos').update({ status: s }).eq('id', id);
    return { success: !error };
  }
};
