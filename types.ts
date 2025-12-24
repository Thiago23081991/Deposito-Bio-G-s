
export interface Cliente {
  id: string;
  telefone: string;
  nome: string;
  endereco: string;
  bairro: string;
  referencia: string;
  dataCadastro: string;
}

export interface Produto {
  id: string;
  nome: string;
  preco: number;
  estoque: number;
}

export interface Entregador {
  id: string;
  nome: string;
  status: 'Ativo' | 'Inativo';
  telefone: string; // WhatsApp
  veiculo: string;  // Moto
}

export interface PedidoItem {
  produtoId: string;
  nome: string;
  qtd: number;
  precoUnitario: number;
}

export interface Pedido {
  id: string;
  dataHora: string;
  nomeCliente: string;
  telefoneCliente: string;
  endereco: string;
  itens: PedidoItem[];
  valorTotal: number;
  entregador: string; // Nome do entregador
  status: 'Pendente' | 'Em Rota' | 'Entregue' | 'Cancelado';
  formaPagamento: string;
  produtoSummary?: string; 
}

export interface Movimentacao {
  id: string;
  dataHora: string;
  tipo: 'Entrada' | 'Saída' | 'A Receber' | 'Liquidado';
  descricao: string;
  valor: number;
  categoria: string;
  metodo?: string;
}

export interface ResumoFinanceiro {
  totalEntradas: number;
  totalSaidas: number;
  totalAReceber: number;
  saldo: number;
  porMetodo: Record<string, number>;
  recentes: Movimentacao[];
}

export enum PaymentMethod {
  DINHEIRO = 'Dinheiro',
  PIX = 'PIX',
  CARTAO_CREDITO = 'Cartão de Crédito',
  CARTAO_DEBITO = 'Cartão de Débito',
  A_RECEBER = 'A Receber'
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  links?: { title: string; uri: string }[];
}
