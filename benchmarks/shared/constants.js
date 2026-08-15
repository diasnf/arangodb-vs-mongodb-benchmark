// Constantes compartilhadas entre o gerador de seed (Node) e os scripts k6.
// Mantidas em um único arquivo para garantir que os testes de consulta
// usem exatamente as mesmas 3 empresas que foram semeadas nos bancos.

export const EMPRESAS = [
  { _id_empresa: "0eb1b5d3-929c-4427-b354-7298b4c53a01", _id_conta: "c1a1b5d3-929c-4427-b354-7298b4c53a01" },
  { _id_empresa: "0eb1b5d3-929c-4427-b354-7298b4c53a02", _id_conta: "c1a1b5d3-929c-4427-b354-7298b4c53a02" },
  { _id_empresa: "0eb1b5d3-929c-4427-b354-7298b4c53a03", _id_conta: "c1a1b5d3-929c-4427-b354-7298b4c53a03" },
];

export const SERIE = 11;
export const MODELO = 65;

export const VENDEDORES = [
  { nome: "OPERADOR CAIXA", _key: "52b3c2f1-1813-4a72-8830-1d56ba560e5a" },
  { nome: "MARIA SILVA", _key: "62b3c2f1-1813-4a72-8830-1d56ba560e5b" },
  { nome: "JOAO SOUZA", _key: "72b3c2f1-1813-4a72-8830-1d56ba560e5c" },
];

export const TERMINAIS = [
  "74784e4d-a63a-415c-95de-4f3a2a3fbad1",
  "84784e4d-a63a-415c-95de-4f3a2a3fbad2",
  "94784e4d-a63a-415c-95de-4f3a2a3fbad3",
];

export const CAIXAS = [
  "dbbaba4b-7c0f-45ba-a47c-a44fcbc34b40",
  "ebbaba4b-7c0f-45ba-a47c-a44fcbc34b41",
  "fbbaba4b-7c0f-45ba-a47c-a44fcbc34b42",
];

export const CLIENTES = [
  { _key: "f55d0641-9c92-4961-a207-10e8143a5de4", nome: "CLIENTE BALCAO", documento: "00000000000" },
  { _key: "f55d0641-9c92-4961-a207-10e8143a5de5", nome: "ANA PEREIRA", documento: "11122233344" },
  { _key: "f55d0641-9c92-4961-a207-10e8143a5de6", nome: "CARLOS LIMA", documento: "22233344455" },
];

export const PRODUTOS = [
  { codigo: "79", descricao: "PINGADO", ncm: "21011200", cfop: "5102", cest: "1710700", unidade: "UND", valor_unitario: 2.0 },
  { codigo: "17", descricao: "MISTO QUENTE", ncm: "19059090", cfop: "5101", unidade: "UND", valor_unitario: 6.9 },
  { codigo: "60", descricao: "SALGADO FRITO", ncm: "19022000", cfop: "5101", unidade: "UND", valor_unitario: 3.5 },
  { codigo: "22", descricao: "REFRIGERANTE LATA", ncm: "22021000", cfop: "5102", unidade: "UND", valor_unitario: 5.5 },
  { codigo: "35", descricao: "AGUA MINERAL", ncm: "22011000", cfop: "5102", unidade: "UND", valor_unitario: 3.0 },
  { codigo: "48", descricao: "SUCO NATURAL", ncm: "20091100", cfop: "5102", unidade: "UND", valor_unitario: 7.5 },
  { codigo: "09", descricao: "PAO DE QUEIJO", ncm: "19059090", cfop: "5101", unidade: "UND", valor_unitario: 4.0 },
  { codigo: "63", descricao: "BOLO CASEIRO", ncm: "19059090", cfop: "5101", unidade: "FAT", valor_unitario: 6.0 },
];

export const MODALIDADES_PAGAMENTO = [
  { modalidade: "DINHEIRO", forma_pagamento: "01" },
  { modalidade: "CARTAO DE CREDITO", forma_pagamento: "03" },
  { modalidade: "CARTAO DE DEBITO", forma_pagamento: "04" },
  { modalidade: "PIX", forma_pagamento: "17" },
];

export const STATUS_PESO = [
  { status: "emitida", peso: 90 },
  { status: "cancelada", peso: 7 },
  { status: "denegada", peso: 3 },
];

export const DATA_INICIO = "2022-01-01T09:00:00.000Z";
