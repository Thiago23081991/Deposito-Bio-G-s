
# Passo a Passo para Instalação

Siga estas etapas para colocar seu sistema de Disk Gás para funcionar:

### 1. Preparar a Planilha Google
1. Crie uma nova Planilha Google (Google Sheets).
2. Crie 4 abas com os nomes exatos abaixo e coloque os seguintes cabeçalhos na Linha 1:
   - **Clientes**: ID, Telefone, Nome, Endereço, Bairro, Referência, Data_Cadastro
   - **Produtos**: ID, Nome_Produto, Preço, Estoque_Cheio
   - **Entregadores**: ID, Nome, Status
   - **Pedidos**: ID_Pedido, Data_Hora, Nome_Cliente, Telefone_Cliente, Endereço, Produto, Qtd, Valor_Total, Entregador, Status, Forma_Pagamento
3. Na aba **Produtos**, cadastre alguns produtos (ex: P13, Gás de Cozinha, 110, 50).
4. Na aba **Entregadores**, cadastre entregadores e coloque o status como 'Ativo'.

### 2. Adicionar o Código Backend
1. Na sua planilha, vá em `Extensões` > `Apps Script`.
2. Renomeie o arquivo `Código.gs` para `Code.gs`.
3. Apague tudo e cole o conteúdo do arquivo `Code.gs` gerado aqui.
4. Crie um novo arquivo HTML (clique no +) e dê o nome de `index`.
5. Cole o conteúdo de `index.html` gerado aqui (o que contém o div `root`).
6. *Nota*: Em um ambiente de produção Google Apps Script, você precisaria compilar o React. Para este exemplo prático, você pode adaptar o `index.html` para incluir o bundle do React via CDN ou hospedar o script compilado.

### 3. Publicar como Web App
1. No Apps Script, clique em `Implantar` > `Nova implantação`.
2. Selecione o tipo `App da Web`.
3. Em "Quem pode acessar", selecione `Qualquer pessoa`.
4. Clique em `Implantar`.
5. Copie o URL gerado e acesse no seu navegador ou celular.

### 4. Dicas Extras
- Use o URL no celular para registrar pedidos em tempo real.
- O sistema busca automaticamente o cliente assim que você digita o telefone e sai do campo (ou clica fora).
- Todas as vendas são registradas instantaneamente na aba 'Pedidos' da sua planilha.
