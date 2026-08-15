// Contrato de dado compartilhado entre api-mongo e api-arango.
// Este arquivo é a referência canônica; cada API mantém uma cópia idêntica
// em src/models/nota.ts para manter o build Docker de cada stack isolado.

export interface Vendedor {
  nome: string;
  _key: string;
}

export interface Icms {
  csosn: string;
  orig: number;
  modbc: number;
  vbc: number;
  picms: number;
  vicms: number;
  modbcst: number;
  pmvast: number;
  predbcst: number;
  vbcst: number;
  picmsst: number;
  vicmsst: number;
  predbc: number;
}

export interface Ipi {
  cst: string;
  qselo: number;
  vbc: number;
  qunid: number;
  vunid: number;
  pipi: number;
  vipi: number;
}

export interface PisCofins {
  cst: string;
  vbc: number;
  ppis?: number;
  pcofins?: number;
  vpis?: number;
  vcofins?: number;
  qbcprod: number;
  valiqprod: number;
}

export interface PisCofinsSt {
  vbc: number;
  ppis?: number;
  pcofins?: number;
  qbcprod: number;
  valiqprod: number;
  vpis?: number;
  vcofins?: number;
}

export interface Imposto {
  icms: Icms;
  ipi: Ipi;
  pis: PisCofins;
  cofins: PisCofins;
  pisst: PisCofinsSt;
  cofinsst: PisCofinsSt;
  total_tributos: number;
}

export interface ItemNota {
  impresso: boolean;
  pronto: boolean;
  impressora: string;
  _changed: boolean;
  _transferido: boolean;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  cest?: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  desconto: number;
  outro: number;
  frete: number;
  seguro: number;
  comissao: number;
  base_calculo: number;
  valor_final: number;
  imposto: Imposto;
  estorno: boolean;
  vendedor: Vendedor;
  terminal: string;
  data_lancamento: string;
  _entry: string;
  _deleted: boolean;
  promocional: boolean;
  valor_desconto_promocao: number;
  valor_cashback: number;
  _key: string;
}

export interface Info {
  complementares: string;
}

export interface Pessoa {
  _key: string;
  nome: string;
  documento: string;
}

export interface Total {
  vbc: number;
  vicms: number;
  vicmsdeson: number;
  vfcpufdest: number;
  vicmsufdest: number;
  vicmsufremet: number;
  vbcst: number;
  vst: number;
  vprod: number;
  vfrete: number;
  vseg: number;
  vdesc: number;
  vii: number;
  vipi: number;
  vpis: number;
  vcofins: number;
  voutro: number;
  vnf: number;
  vtottrib: number;
  vcomissao: number;
  vcomissao_temp: number;
  vqnt: number;
  vtotal_promocional: number;
  total_cashback: number;
  pessoas: number;
}

export interface Pagamento {
  modalidade: string;
  forma_pagamento: string;
  valor: number;
  parcelas: number;
}

export interface Venda {
  status: boolean;
  data_venda: string;
  caixa: string;
  pagamento: Pagamento;
  pagamentos: Pagamento[];
  valor: number;
  troco: number;
  qnt_pessoas: number;
}

export type StatusNota = "emitida" | "cancelada" | "denegada";

export interface Nota {
  _id_empresa: string;
  _id_conta: string;
  operacao: string;
  tpemis: string;
  numeracao_automatica: boolean;
  numero: number;
  codigo: string;
  serie: number;
  modelo: number;
  chave_acesso: string;
  data_emissao: string;
  data_movimento: string;
  natureza_operacao: string;
  crt: string;
  finalidade: number;
  status: StatusNota;
  pessoa: Pessoa;
  itens: ItemNota[];
  info: Info;
  total: Total;
  estorno: boolean;
  status_sefaz: number;
  pedidos: string[];
  emissao_imediata: boolean;
  venda: Venda;
  _id_cliente: string;
  _deleted: boolean;
  _created_at: string;
  _updated_at: string;
  _last_sync: string;
  _first_sync: string;
}
