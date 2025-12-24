
/**
 * SISTEMA BIO GÁS - BACKEND V5.0
 * Gestão de Equipe, CRM e Controladoria Financeira
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Bio Gás PRO')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === 'Clientes') sheet.appendRow(['ID', 'Telefone', 'Nome', 'Endereço', 'Bairro', 'Referência', 'Data_Cadastro']);
    if (name === 'Produtos') sheet.appendRow(['ID', 'Nome_Produto', 'Preço', 'Estoque_Cheio']);
    if (name === 'Entregadores') sheet.appendRow(['ID', 'Nome', 'Status', 'Telefone', 'Veiculo']);
    if (name === 'Pedidos') sheet.appendRow(['ID_Pedido', 'Data_Hora', 'Nome_Cliente', 'Telefone_Cliente', 'Endereço', 'Itens_JSON', 'Valor_Total', 'Entregador', 'Status', 'Forma_Pagamento']);
    if (name === 'Financeiro') sheet.appendRow(['ID', 'Data_Hora', 'Tipo', 'Descrição', 'Valor', 'Categoria', 'Metodo']);
  }
  return sheet;
}

// --- PRODUTOS & ESTOQUE ---
function listarProdutos() {
  const data = getSheet('Produtos').getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => ({ 
    id: r[0], 
    nome: r[1], 
    preco: Number(r[2]), 
    estoque: Number(r[3]) 
  }));
}

function salvarProduto(dados) {
  try {
    const sheet = getSheet('Produtos');
    const data = sheet.getDataRange().getValues();
    if (dados.id) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === dados.id) {
          sheet.getRange(i + 1, 2, 1, 3).setValues([[dados.nome, dados.preco, dados.estoque]]);
          return { success: true };
        }
      }
    } else {
      const id = "PROD-" + Math.floor(Math.random() * 9000 + 1000);
      sheet.appendRow([id, dados.nome, dados.preco, dados.estoque]);
      return { success: true };
    }
  } catch (e) { return { success: false, error: e.toString() }; }
}

// --- FINANCEIRO ---
function registrarMovimentacao(tipo, valor, descricao, categoria, metodo = '-', dataCustom = null) {
  const sheet = getSheet('Financeiro');
  let timestamp;
  if (dataCustom) {
    const partes = dataCustom.split('-');
    timestamp = partes.length === 3 ? partes[2] + '/' + partes[1] + '/' + partes[0] : dataCustom;
  } else {
    timestamp = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy");
  }
  const id = "FIN-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
  sheet.appendRow([id, timestamp, tipo, descricao, Number(valor), categoria, metodo]);
  return { success: true };
}

function baixarPagamento(id, metodo) {
  try {
    const sheet = getSheet('Financeiro');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === id && data[i][2] === 'A Receber') {
        const valor = data[i][4];
        const descOriginal = data[i][3];
        
        // Marca o antigo como Liquidado
        sheet.getRange(i + 1, 3).setValue('Liquidado');
        
        // Registra a nova Entrada no caixa real
        registrarMovimentacao('Entrada', valor, "[LIQUIDAÇÃO] " + descOriginal, "Recebimento de Dívida", metodo);
        return { success: true };
      }
    }
    return { success: false };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function getResumoFinanceiro() {
  const data = getSheet('Financeiro').getDataRange().getValues();
  let totalEntradas = 0, totalSaidas = 0, totalAReceber = 0, recentes = [];
  for (let i = 1; i < data.length; i++) {
    const tipo = data[i][2], valor = Number(data[i][4]);
    if (tipo === 'Entrada') totalEntradas += valor;
    else if (tipo === 'Saída') totalSaidas += valor;
    else if (tipo === 'A Receber') totalAReceber += valor;
    
    recentes.push({ 
      id: data[i][0], 
      dataHora: data[i][1], 
      tipo: tipo, 
      descricao: data[i][3], 
      valor: valor, 
      categoria: data[i][5], 
      metodo: data[i][6] 
    });
  }
  return { 
    totalEntradas, 
    totalSaidas, 
    totalAReceber, 
    saldo: totalEntradas - totalSaidas, 
    recentes: recentes.reverse() 
  };
}

// --- CLIENTES & ENTREGADORES ---
function listarClientes() {
  const data = getSheet('Clientes').getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => ({ id: r[0], telefone: String(r[1]), nome: r[2], endereco: r[3], bairro: r[4], referencia: r[5], dataCadastro: r[6] })).reverse();
}

function salvarCliente(dados) {
  const sheet = getSheet('Clientes');
  const cleanTel = String(dados.telefone).replace(/\D/g, '');
  if (dados.id) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === dados.id) {
        sheet.getRange(i + 1, 2, 1, 5).setValues([[cleanTel, dados.nome, dados.endereco, dados.bairro || '', dados.referencia || '']]);
        return { success: true };
      }
    }
  } else {
    const id = "CLI-" + Math.floor(Math.random() * 90000 + 10000);
    const ts = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy");
    sheet.appendRow([id, cleanTel, dados.nome, dados.endereco, dados.bairro || '', dados.referencia || '', ts]);
    return { success: true };
  }
}

function listarEntregadores() {
  const data = getSheet('Entregadores').getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => ({ id: r[0], nome: r[1], status: r[2], telefone: r[3], veiculo: r[4] }));
}

function salvarEntregador(dados) {
  const sheet = getSheet('Entregadores');
  if (dados.id) {
     const data = sheet.getDataRange().getValues();
     for (let i = 1; i < data.length; i++) {
       if (data[i][0] === dados.id) {
         sheet.getRange(i + 1, 2, 1, 4).setValues([[dados.nome, dados.status, dados.telefone, dados.veiculo]]);
         return { success: true };
       }
     }
  } else {
    const id = "ENT-" + Math.floor(Math.random() * 9000 + 1000);
    sheet.appendRow([id, dados.nome, 'Ativo', dados.telefone, dados.veiculo]);
    return { success: true };
  }
}

function excluirEntregador(id) {
  const sheet = getSheet('Entregadores');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) { sheet.deleteRow(i + 1); return { success: true }; }
  }
  return { success: false };
}

// --- PEDIDOS ---
function salvarPedido(dados) {
  const sheetPedidos = getSheet('Pedidos');
  const timestamp = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm:ss");
  const idPedido = "PED-" + Math.floor(Math.random() * 90000 + 10000);
  const summary = dados.itens.map(it => it.qtd + "x " + it.nome).join(", ");
  sheetPedidos.appendRow([idPedido, timestamp, dados.nomeCliente, dados.telefoneCliente, dados.endereco, summary, dados.valorTotal, dados.entregador, 'Pendente', dados.formaPagamento]);
  
  // Baixa de estoque automática no pedido
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
  return { success: true, id: idPedido };
}

function atualizarStatusPedido(idPedido, novoStatus) {
  const sheet = getSheet('Pedidos');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === idPedido) {
      sheet.getRange(i + 1, 9).setValue(novoStatus); 
      if (novoStatus === 'Entregue') {
        const valor = data[i][6], desc = "Venda: " + data[i][2], metodo = data[i][9]; 
        const tipo = (metodo === 'A Receber') ? 'A Receber' : 'Entrada';
        const categoria = (metodo === 'A Receber') ? 'Venda Fiada' : 'Venda Direta';
        registrarMovimentacao(tipo, valor, desc, categoria, metodo);
      }
      return { success: true };
    }
  }
  return { success: false };
}

function listarUltimosPedidos() {
  const data = getSheet('Pedidos').getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => ({ id: r[0], dataHora: r[1], nomeCliente: r[2], telefoneCliente: r[3], endereco: r[4], produtoSummary: r[5], valorTotal: r[6], entregador: r[7], status: r[8], formaPagamento: r[9] })).reverse().slice(0, 20);
}
