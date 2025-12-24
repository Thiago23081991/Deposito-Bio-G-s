
/**
 * SISTEMA BIO GÁS - BACKEND GOOGLE APPS SCRIPT
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

function listarClientes() {
  const data = getSheet('Clientes').getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => ({
    id: r[0], telefone: String(r[1]), nome: r[2], endereco: r[3], bairro: r[4], referencia: r[5], dataCadastro: r[6]
  })).reverse();
}

function salvarClientesEmMassa(lista) {
  const sheet = getSheet('Clientes');
  const data = sheet.getDataRange().getValues();
  const existingTels = new Set(data.map(r => String(r[1]).replace(/\D/g, '')));
  const rowsToAdd = [];
  const dataCad = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy");

  lista.forEach(dados => {
    const cleanTel = String(dados.telefone).replace(/\D/g, '');
    if (!existingTels.has(cleanTel)) {
      const id = "CLI-" + Math.floor(Math.random() * 90000 + 10000);
      rowsToAdd.push([id, cleanTel, dados.nome, dados.endereco, dados.bairro || '', dados.referencia || '', dataCad]);
      existingTels.add(cleanTel); // Evitar duplicados dentro do próprio lote
    }
  });

  if (rowsToAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, 7).setValues(rowsToAdd);
  }
  return { success: true, count: rowsToAdd.length };
}

function buscarClientePorTelefone(telefone) {
  const data = getSheet('Clientes').getDataRange().getValues();
  const cleanTel = String(telefone).replace(/\D/g, '');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).replace(/\D/g, '') === cleanTel) {
      return { id: data[i][0], telefone: String(data[i][1]), nome: data[i][2], endereco: data[i][3], bairro: data[i][4], referencia: data[i][5] };
    }
  }
  return null;
}

function salvarCliente(dados) {
  const sheet = getSheet('Clientes');
  const data = sheet.getDataRange().getValues();
  const cleanTel = String(dados.telefone).replace(/\D/g, '');
  
  if (dados.id) {
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === dados.id) {
        sheet.getRange(i + 1, 2, 1, 5).setValues([[cleanTel, dados.nome, dados.endereco, dados.bairro || '', dados.referencia || '']]);
        return { success: true };
      }
    }
  } else {
    const id = "CLI-" + Math.floor(Math.random() * 90000 + 10000);
    const dataCad = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy");
    sheet.appendRow([id, cleanTel, dados.nome, dados.endereco, dados.bairro || '', dados.referencia || '', dataCad]);
    return { success: true };
  }
  return { success: false };
}

function excluirCliente(id) {
  const sheet = getSheet('Clientes');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false };
}

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
    return { success: false };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function listarEntregadores() {
  const data = getSheet('Entregadores').getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => ({ id: r[0], nome: r[1], status: r[2], telefone: r[3], veiculo: r[4] }));
}

function salvarEntregador(dados) {
  try {
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
  } catch (e) { return { success: false, error: e.toString() }; }
}

function excluirEntregador(id) {
  const sheet = getSheet('Entregadores');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false };
}

function salvarPedido(dados) {
  const sheetPedidos = getSheet('Pedidos');
  const timestamp = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm:ss");
  const idPedido = "PED-" + Math.floor(Math.random() * 90000 + 10000);
  
  const summary = dados.itens.map(it => it.qtd + "x " + it.nome).join(", ");
  
  sheetPedidos.appendRow([
    idPedido, 
    timestamp, 
    dados.nomeCliente, 
    dados.telefoneCliente, 
    dados.endereco, 
    summary, 
    dados.valorTotal, 
    dados.entregador, 
    'Pendente', 
    dados.formaPagamento
  ]);
  
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
  try {
    const sheet = getSheet('Pedidos');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === idPedido) {
        sheet.getRange(i + 1, 9).setValue(novoStatus); 
        if (novoStatus === 'Entregue') {
          const valor = data[i][6]; 
          const desc = "Venda: " + data[i][2]; 
          const metodo = data[i][9]; 
          registrarMovimentacao('Entrada', valor, desc, 'Venda', metodo);
        }
        return { success: true };
      }
    }
    return { success: false };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function registrarMovimentacao(tipo, valor, descricao, categoria, metodo = '-') {
  const sheet = getSheet('Financeiro');
  const timestamp = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm:ss");
  const id = "FIN-" + Date.now();
  sheet.appendRow([id, timestamp, tipo, descricao, valor, categoria, metodo]);
  return { success: true };
}

function getResumoFinanceiro() {
  const sheet = getSheet('Financeiro');
  const data = sheet.getDataRange().getValues();
  let totalEntradas = 0, totalSaidas = 0, porMetodo = {}, recentes = [];
  for (let i = 1; i < data.length; i++) {
    const tipo = data[i][2], valor = Number(data[i][4]), metodo = data[i][6];
    if (tipo === 'Entrada') {
      totalEntradas += valor;
      porMetodo[metodo] = (porMetodo[metodo] || 0) + valor;
    } else { totalSaidas += valor; }
    recentes.unshift({ id: data[i][0], dataHora: data[i][1], tipo: tipo, descricao: data[i][3], valor: valor, categoria: data[i][5], metodo: metodo });
  }
  return { totalEntradas, totalSaidas, saldo: totalEntradas - totalSaidas, porMetodo, recentes: recentes.slice(0, 50) };
}

function listarUltimosPedidos() {
  const data = getSheet('Pedidos').getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => ({
    id: r[0],
    dataHora: r[1],
    nomeCliente: r[2],
    telefoneCliente: r[3],
    endereco: r[4],
    produtoSummary: r[5],
    itens: [], 
    valorTotal: r[6],
    entregador: r[7],
    status: r[8],
    formaPagamento: r[9]
  })).reverse().slice(0, 15);
}
