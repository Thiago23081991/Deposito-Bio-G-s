
/**
 * SISTEMA BIO GÁS PRO - BACKEND V6.0 ESTÁVEL
 * Autor: Senior Full-Stack Engineer
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Bio Gás PRO - Gestão Inteligente')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headers = {
      'Clientes': ['ID', 'Telefone', 'Nome', 'Endereço', 'Bairro', 'Referência', 'Data_Cadastro'],
      'Produtos': ['ID', 'Nome_Produto', 'Preço', 'Estoque_Cheio'],
      'Entregadores': ['ID', 'Nome', 'Status', 'Telefone', 'Veiculo'],
      'Pedidos': ['ID_Pedido', 'Data_Hora', 'Nome_Cliente', 'Telefone_Cliente', 'Endereço', 'Itens_JSON', 'Valor_Total', 'Entregador', 'Status', 'Forma_Pagamento'],
      'Financeiro': ['ID', 'Data_Hora', 'Tipo', 'Descrição', 'Valor', 'Categoria', 'Metodo']
    };
    if (headers[name]) sheet.appendRow(headers[name]);
  }
  return sheet;
}

// --- SERVIÇOS FINANCEIROS ---
function registrarMovimentacao(tipo, valor, descricao, categoria, metodo = '-') {
  const sheet = getSheet('Financeiro');
  const timestamp = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm");
  const id = "FIN-" + Date.now();
  sheet.appendRow([id, timestamp, tipo, descricao, Number(valor), categoria, metodo]);
  return true;
}

function getResumoFinanceiro() {
  const data = getSheet('Financeiro').getDataRange().getValues();
  let ent = 0, sai = 0, arec = 0, recentes = [];
  if (data.length > 1) {
    for (let i = 1; i < data.length; i++) {
      const tipo = data[i][2], valor = Number(data[i][4]);
      if (tipo === 'Entrada') ent += valor;
      else if (tipo === 'Saída') sai += valor;
      else if (tipo === 'A Receber') arec += valor;
      
      recentes.push({
        id: data[i][0], dataHora: data[i][1], tipo: tipo,
        descricao: data[i][3], valor: valor, categoria: data[i][5], metodo: data[i][6]
      });
    }
  }
  return { totalEntradas: ent, totalSaidas: sai, totalAReceber: arec, saldo: ent - sai, recentes: recentes.reverse() };
}

// --- GESTÃO DE PEDIDOS ---
function salvarPedido(dados) {
  const sheet = getSheet('Pedidos');
  const id = "PED-" + Math.floor(Math.random() * 90000 + 10000);
  const items = dados.itens.map(it => `${it.qtd}x ${it.nome}`).join(", ");
  const timestamp = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm");
  
  sheet.appendRow([id, timestamp, dados.nomeCliente, dados.telefoneCliente, dados.endereco, items, Number(dados.valorTotal), dados.entregador, 'Pendente', dados.formaPagamento]);
  
  // Baixa de estoque
  const sheetProdutos = getSheet('Produtos');
  const prodData = sheetProdutos.getDataRange().getValues();
  dados.itens.forEach(item => {
    for(let j=1; j<prodData.length; j++) {
      if(prodData[j][1] === item.nome) {
        sheetProdutos.getRange(j+1, 4).setValue(Number(prodData[j][3]) - Number(item.qtd));
        break;
      }
    }
  });
  return { success: true, id };
}

function atualizarStatusPedido(id, status) {
  const sheet = getSheet('Pedidos');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.getRange(i + 1, 9).setValue(status);
      
      // REGISTRO AUTOMÁTICO NO FINANCEIRO AO ENTREGAR
      if (status === 'Entregue') {
        const valor = Number(data[i][6]);
        const cliente = data[i][2];
        const formaPgto = data[i][9];
        const tipo = (formaPgto === 'A Receber') ? 'A Receber' : 'Entrada';
        const categoria = (formaPgto === 'A Receber') ? 'Venda Fiada' : 'Venda Direta';
        
        registrarMovimentacao(tipo, valor, "Venda Finalizada: " + cliente, categoria, formaPgto);
      }
      return { success: true };
    }
  }
  return { success: false };
}

function listarUltimosPedidos() {
  const data = getSheet('Pedidos').getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => ({ 
    id: r[0], dataHora: r[1], nomeCliente: r[2], telefoneCliente: String(r[3]), 
    endereco: r[4], produtoSummary: r[5], valorTotal: Number(r[6]), 
    entregador: r[7], status: r[8], formaPagamento: r[9] 
  })).reverse();
}

// --- OUTROS LISTADOS ---
function listarClientes() {
  const data = getSheet('Clientes').getDataRange().getValues();
  return data.length <= 1 ? [] : data.slice(1).map(r => ({ id: r[0], telefone: String(r[1]), nome: r[2], endereco: r[3], bairro: r[4], referencia: r[5], dataCadastro: r[6] })).reverse();
}

function listarProdutos() {
  const data = getSheet('Produtos').getDataRange().getValues();
  return data.length <= 1 ? [] : data.slice(1).map(r => ({ id: r[0], nome: r[1], preco: Number(r[2]), estoque: Number(r[3]) }));
}

function listarEntregadores() {
  const data = getSheet('Entregadores').getDataRange().getValues();
  return data.length <= 1 ? [] : data.slice(1).map(r => ({ id: r[0], nome: r[1], status: r[2], telefone: r[3], veiculo: r[4] }));
}

function buscarClientePorTelefone(tel) {
  const data = getSheet('Clientes').getDataRange().getValues();
  const cleanTel = String(tel).replace(/\D/g, '');
  for(let i=1; i<data.length; i++) {
    if(String(data[i][1]).replace(/\D/g, '') === cleanTel) {
      return { id: data[i][0], telefone: data[i][1], nome: data[i][2], endereco: data[i][3], bairro: data[i][4] };
    }
  }
  return null;
}
