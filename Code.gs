
/**
 * SISTEMA BIO GÁS PRO - BACKEND V8.4
 * Gestão de Cobrança, Equipe, Lançamentos e Importação
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Bio Gás PRO - Master')
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
      'Produtos': ['ID', 'Nome_Produto', 'Preço', 'Estoque_Cheio', 'Unidade_Medida', 'Preco_Custo'],
      'Entregadores': ['ID', 'Nome', 'Status', 'Telefone', 'Veiculo'],
      'Pedidos': ['ID_Pedido', 'Data_Hora', 'Nome_Cliente', 'Telefone_Cliente', 'Endereço', 'Itens_JSON', 'Valor_Total', 'Entregador', 'Status', 'Forma_Pagamento'],
      'Financeiro': ['ID', 'Data_Hora', 'Tipo', 'Descrição', 'Valor', 'Categoria', 'Metodo', 'Detalhe']
    };
    if (headers[name]) sheet.appendRow(headers[name]);
  }
  return sheet;
}

// --- IMPORTAÇÃO EM MASSA ---
function importarClientesEmMassa(clientes) {
  const sheet = getSheet('Clientes');
  const timestamp = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy");
  
  const rows = clientes.map(c => [
    c.id || "CRM-" + Math.floor(Math.random() * 100000),
    String(c.telefone || ""),
    c.nome || "",
    c.endereco || "",
    c.bairro || "",
    c.referencia || "",
    timestamp
  ]);
  
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  }
  
  return { success: true, count: rows.length };
}

// --- GESTÃO DE ENTREGADORES ---
function salvarEntregador(e) {
  const sheet = getSheet('Entregadores');
  const data = sheet.getDataRange().getValues();
  let row = -1;
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(e.id)) {
      row = i + 1;
      break;
    }
  }
  if(row !== -1) {
    sheet.getRange(row, 2, 1, 4).setValues([[e.nome, e.status, e.telefone, e.veiculo]]);
  } else {
    const newId = e.id || "ENT-" + Math.floor(Math.random() * 9000);
    sheet.appendRow([newId, e.nome, e.status || 'Ativo', e.telefone, e.veiculo]);
  }
  return { success: true };
}

// --- AÇÕES EM MASSA ---
function atualizarStatusPedidosEmMassa(ids, novoStatus) {
  const sheet = getSheet('Pedidos');
  const data = sheet.getDataRange().getValues();
  const idsStr = ids.map(id => String(id));
  let count = 0;

  for (let i = 1; i < data.length; i++) {
    if (idsStr.includes(String(data[i][0]))) {
      sheet.getRange(i + 1, 9).setValue(novoStatus);
      if (novoStatus === 'Entregue') {
        const valor = Number(data[i][6]);
        const cliente = data[i][2];
        const formaPgto = data[i][9];
        const tipo = (formaPgto === 'A Receber') ? 'A Receber' : 'Entrada';
        const categoria = (formaPgto === 'A Receber') ? 'Venda Fiada' : 'Venda Direta';
        registrarMovimentacao(tipo, valor, "Venda Finalizada: " + cliente, categoria, formaPgto, "Pedido ID: " + data[i][0]);
      }
      count++;
    }
  }
  return { success: true, count: count };
}

// --- GESTÃO DE COBRANÇA ---
function liquidarDivida(financeiroId, metodoPagamento) {
  const sheet = getSheet('Financeiro');
  const data = sheet.getDataRange().getValues();
  const metodo = metodoPagamento || 'BAIXA MANUAL';

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(financeiroId)) {
      sheet.getRange(i + 1, 3).setValue('Liquidado');
      const valor = data[i][4];
      const desc = "Recebimento Fiado: " + data[i][3].replace("Venda Finalizada: ", "");
      registrarMovimentacao('Entrada', valor, desc, 'Liquidação de Dívida', metodo, "Liquidação da pendência " + financeiroId);
      return { success: true };
    }
  }
  return { success: false };
}

// --- SERVIÇOS FINANCEIROS ---
function registrarMovimentacao(tipo, valor, descricao, categoria, metodo = '-', detalhe = '') {
  const sheet = getSheet('Financeiro');
  const timestamp = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm");
  const id = "FIN-" + Date.now();
  sheet.appendRow([id, timestamp, tipo, descricao, Number(valor), categoria, metodo, detalhe]);
  return true;
}

function getResumoFinanceiro(dataIniStr, dataFimStr) {
  const data = getSheet('Financeiro').getDataRange().getValues();
  let ent = 0, sai = 0, arec = 0, recentes = [];

  // Converte string 'yyyy-MM-dd' para timestamp
  const parseInputDate = (str) => {
     if (!str) return null;
     const parts = str.split('-');
     return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
  };

  const parseRowDate = (str) => {
     if (!str) return 0;
     // Esperado: dd/MM/yyyy HH:mm
     const parts = str.split(' ')[0].split('/');
     if(parts.length < 3) return 0;
     return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
  };

  const start = dataIniStr ? parseInputDate(dataIniStr) : 0;
  // IMPORTANTE: Adiciona 23h 59m 59s ao filtro final para incluir o dia inteiro
  const end = dataFimStr ? parseInputDate(dataFimStr) + 86399999 : Infinity;

  if (data.length > 1) {
    for (let i = 1; i < data.length; i++) {
      const rowDate = parseRowDate(data[i][1]);
      
      // Filtra por data (inclusivo)
      if (rowDate >= start && rowDate <= end) {
        const tipoOriginal = String(data[i][2]).trim(); // Remove espaços extras
        const valor = Number(data[i][4]);
        
        // Verifica Entrada
        if (tipoOriginal === 'Entrada') {
          ent += valor;
        } 
        // Verifica Saída (com ou sem acento para robustez)
        else if (tipoOriginal === 'Saída' || tipoOriginal === 'Saida') {
          sai += valor;
        } 
        // Verifica A Receber
        else if (tipoOriginal === 'A Receber') {
          arec += valor;
        }
        
        recentes.push({
          id: data[i][0], 
          dataHora: data[i][1], 
          tipo: tipoOriginal,
          descricao: data[i][3], 
          valor: valor, 
          categoria: data[i][5], 
          metodo: data[i][6], 
          detalhe: data[i][7] || ''
        });
      }
    }
  }
  return { totalEntradas: ent, totalSaidas: sai, totalAReceber: arec, saldo: ent - sai, porMetodo: {}, recentes: recentes.reverse() };
}

function gerarRelatorioMensal() {
  const sheet = getSheet('Financeiro');
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const currentMonthStr = Utilities.formatDate(now, "GMT-3", "/MM/yyyy"); // Busca o mês atual
  
  let totalEntradas = 0;
  let totalSaidas = 0;
  const catsEnt = {};
  const catsSai = {};
  
  // 1. Processamento Financeiro
  for (let i = 1; i < data.length; i++) {
    const dataHora = String(data[i][1]); 
    if (dataHora.includes(currentMonthStr)) {
      const tipo = String(data[i][2]).trim();
      const valor = Number(data[i][4]);
      const categoria = data[i][5] || 'Geral';
      
      if (tipo === 'Entrada') {
        totalEntradas += valor;
        catsEnt[categoria] = (catsEnt[categoria] || 0) + valor;
      } else if (tipo === 'Saída' || tipo === 'Saida') {
        totalSaidas += valor;
        catsSai[categoria] = (catsSai[categoria] || 0) + valor;
      }
    }
  }
  
  const mapCats = (obj) => Object.keys(obj).map(k => ({ categoria: k, valor: obj[k] }));

  // 2. Processamento de Produtos (Pedidos)
  const sheetPedidos = getSheet('Pedidos');
  const dataPedidos = sheetPedidos.getDataRange().getValues();
  const sheetProdutos = getSheet('Produtos');
  const dataProdutos = sheetProdutos.getDataRange().getValues();
  
  // Mapa de Preços dos Produtos (Nome -> Preço Atual)
  const mapPrecos = {};
  for(let i=1; i<dataProdutos.length; i++){
    mapPrecos[String(dataProdutos[i][1]).trim()] = Number(dataProdutos[i][2]);
  }

  const statsProdutos = {};

  for (let i = 1; i < dataPedidos.length; i++) {
    const dataHoraPedido = String(dataPedidos[i][1]);
    const status = String(dataPedidos[i][8]); // Status (Coluna I)

    // Filtra pelo mês atual e apenas pedidos Entregues (Vendas confirmadas)
    if (dataHoraPedido.includes(currentMonthStr) && status === 'Entregue') {
      const itensStr = String(dataPedidos[i][5]); // Coluna F: "2x Gás, 1x Água"
      if(itensStr){
        const itensArr = itensStr.split(',');
        itensArr.forEach(item => {
          // Parse: "2x Nome do Produto"
          const parts = item.trim().split('x ');
          if(parts.length >= 2){
            const qtd = Number(parts[0]);
            const nomeProd = parts[1].trim();
            
            if(!statsProdutos[nomeProd]) {
              statsProdutos[nomeProd] = { qtd: 0, valorTotal: 0 };
            }
            
            statsProdutos[nomeProd].qtd += qtd;
            // Valor Estimado = Qtd * Preço Atual (ja que o historico individual nao esta na string)
            const precoUnit = mapPrecos[nomeProd] || 0;
            statsProdutos[nomeProd].valorTotal += (qtd * precoUnit);
          }
        });
      }
    }
  }

  const arrayProdutos = Object.keys(statsProdutos).map(k => ({
    produto: k,
    qtd: statsProdutos[k].qtd,
    valorTotal: statsProdutos[k].valorTotal
  })).sort((a,b) => b.valorTotal - a.valorTotal); // Ordena por maior valor
  
  return {
    mes: Utilities.formatDate(now, "GMT-3", "MMMM/yyyy"),
    totalEntradas: totalEntradas,
    totalSaidas: totalSaidas,
    saldo: totalEntradas - totalSaidas,
    categoriasEntrada: mapCats(catsEnt),
    categoriasSaida: mapCats(catsSai),
    vendasPorProduto: arrayProdutos
  };
}

// --- GESTÃO DE PRODUTOS ---
function salvarProduto(p) {
  const sheet = getSheet('Produtos');
  const data = sheet.getDataRange().getValues();
  let row = -1;
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(p.id)) {
      row = i + 1;
      break;
    }
  }
  if(row !== -1) {
    sheet.getRange(row, 2, 1, 5).setValues([[p.nome, Number(p.preco), Number(p.estoque), p.unidadeMedida, Number(p.precoCusto)]]);
  } else {
    const newId = p.id || "PRD-" + Math.floor(Math.random() * 9000);
    sheet.appendRow([newId, p.nome, Number(p.preco), Number(p.estoque), p.unidadeMedida, Number(p.precoCusto)]);
  }
  return { success: true };
}

// --- GESTÃO DE PEDIDOS ---
function salvarPedido(dados) {
  const sheet = getSheet('Pedidos');
  const id = "PED-" + Math.floor(Math.random() * 90000 + 10000);
  const items = dados.itens.map(it => `${it.qtd}x ${it.nome}`).join(", ");
  const timestamp = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy HH:mm");
  sheet.appendRow([id, timestamp, dados.nomeCliente, dados.telefoneCliente, dados.endereco, items, Number(dados.valorTotal), dados.entregador, 'Pendente', dados.formaPagamento]);
  
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

function listarUltimosPedidos() {
  const data = getSheet('Pedidos').getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(r => ({ 
    id: r[0], dataHora: r[1], nomeCliente: r[2], telefoneCliente: String(r[3]), 
    endereco: r[4], produtoSummary: r[5], valorTotal: Number(r[6]), 
    entregador: r[7], status: r[8], formaPagamento: r[9] 
  })).reverse();
}

function buscarPedidoPorId(id) {
  const data = getSheet('Pedidos').getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(id)) {
      return { 
        id: data[i][0], dataHora: data[i][1], nomeCliente: data[i][2], 
        telefoneCliente: String(data[i][3]), endereco: data[i][4], 
        produtoSummary: data[i][5], valorTotal: Number(data[i][6]), 
        entregador: data[i][7], status: data[i][8], formaPagamento: data[i][9] 
      };
    }
  }
  return null;
}

function listarClientes() {
  const data = getSheet('Clientes').getDataRange().getValues();
  return data.length <= 1 ? [] : data.slice(1).map(r => ({ id: r[0], telefone: String(r[1]), nome: r[2], endereco: r[3], bairro: r[4], referencia: r[5], dataCadastro: r[6] })).reverse();
}

function listarProdutos() {
  const data = getSheet('Produtos').getDataRange().getValues();
  return data.length <= 1 ? [] : data.slice(1).map(r => ({ id: r[0], nome: r[1], preco: Number(r[2]), estoque: Number(r[3]), unidadeMedida: r[4] || 'unidade', precoCusto: Number(r[5] || 0) }));
}

function listarEntregadores() {
  const data = getSheet('Entregadores').getDataRange().getValues();
  return data.length <= 1 ? [] : data.slice(1).map(r => ({ id: r[0], nome: r[1], status: r[2], telefone: r[3], veiculo: r[4] }));
}