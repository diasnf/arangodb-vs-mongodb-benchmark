// Construtor de um documento "Nota" realista, compartilhado entre o gerador
// de seed (Node, determinístico) e os scripts k6 de carga (não-determinístico).
// Não usa nenhuma API específica de runtime (Node/k6), só matemática/strings.

import {
  VENDEDORES,
  TERMINAIS,
  CAIXAS,
  CLIENTES,
  PRODUTOS,
  MODALIDADES_PAGAMENTO,
  STATUS_PESO,
  SERIE,
  MODELO,
} from "./constants.js";

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function weightedPick(rng, list) {
  const total = list.reduce((acc, i) => acc + i.peso, 0);
  let r = rng() * total;
  for (const item of list) {
    r -= item.peso;
    if (r <= 0) return item;
  }
  return list[list.length - 1];
}

function pad(n, len) {
  return String(n).padStart(len, "0");
}

function pseudoId(rng) {
  const hex = () => Math.floor(rng() * 16).toString(16);
  const block = (len) => Array.from({ length: len }, hex).join("");
  return `${block(8)}-${block(4)}-4${block(3)}-${block(4)}-${block(12)}`;
}

function buildImposto(rng) {
  return {
    icms: {
      csosn: "102",
      orig: 0,
      modbc: 0,
      vbc: 0,
      picms: 0,
      vicms: 0,
      modbcst: 0,
      pmvast: 0,
      predbcst: 0,
      vbcst: 0,
      picmsst: 0,
      vicmsst: 0,
      predbc: 0,
    },
    ipi: { cst: "99", qselo: 0, vbc: 0, qunid: 0, vunid: 0, pipi: 0, vipi: 0 },
    pis: { cst: rng() < 0.9 ? "99" : "01", vbc: 0, ppis: 0, vpis: 0, qbcprod: 0, valiqprod: 0 },
    cofins: { cst: rng() < 0.9 ? "99" : "01", vbc: 0, pcofins: 0, vcofins: 0, qbcprod: 0, valiqprod: 0 },
    pisst: { vbc: 0, ppis: 0, qbcprod: 0, valiqprod: 0, vpis: 0 },
    cofinsst: { vbc: 0, pcofins: 0, qbcprod: 0, valiqprod: 0, vcofins: 0 },
    total_tributos: 0,
  };
}

function buildItens(rng, dataEmissaoISO, terminal, vendedor) {
  const qtdItens = 1 + Math.floor(rng() * 4);
  const itens = [];
  for (let i = 0; i < qtdItens; i++) {
    const produto = pick(rng, PRODUTOS);
    const quantidade = 1 + Math.floor(rng() * 3);
    const valor_total = Number((produto.valor_unitario * quantidade).toFixed(2));
    itens.push({
      impresso: false,
      pronto: false,
      impressora: "COZINHA",
      _changed: false,
      _transferido: false,
      codigo: produto.codigo,
      descricao: produto.descricao,
      ncm: produto.ncm,
      cfop: produto.cfop,
      ...(produto.cest ? { cest: produto.cest } : {}),
      unidade: produto.unidade,
      quantidade,
      valor_unitario: produto.valor_unitario,
      valor_total,
      desconto: 0,
      outro: 0,
      frete: 0,
      seguro: 0,
      comissao: 0,
      base_calculo: 0,
      valor_final: valor_total,
      imposto: buildImposto(rng),
      estorno: false,
      vendedor,
      terminal,
      data_lancamento: dataEmissaoISO,
      _entry: pseudoId(rng),
      _deleted: false,
      promocional: false,
      valor_desconto_promocao: 0,
      valor_cashback: 0,
      _key: pseudoId(rng),
    });
  }
  return itens;
}

function buildChaveAcesso(rng, empresaIndex, dataEmissaoISO, numero) {
  const d = new Date(dataEmissaoISO);
  const aamm = `${pad(d.getUTCFullYear() % 100, 2)}${pad(d.getUTCMonth() + 1, 2)}`;
  const cnpj = pad(empresaIndex + 1, 14);
  const cNF = pad(Math.floor(rng() * 1e8), 8);
  return `35${aamm}${cnpj}${pad(MODELO, 2)}${pad(SERIE, 3)}${pad(numero, 9)}1${cNF}0`;
}

/**
 * @param {() => number} rng gerador de números pseudoaleatórios [0,1)
 * @param {{ empresa: {_id_empresa:string,_id_conta:string}, empresaIndex: number, numero: number, dataEmissaoISO: string }} params
 */
export function buildNota(rng, { empresa, empresaIndex, numero, dataEmissaoISO }) {
  const vendedor = pick(rng, VENDEDORES);
  const terminal = pick(rng, TERMINAIS);
  const caixa = pick(rng, CAIXAS);
  const cliente = pick(rng, CLIENTES);
  const modalidade = pick(rng, MODALIDADES_PAGAMENTO);
  const { status } = weightedPick(rng, STATUS_PESO);

  const itens = buildItens(rng, dataEmissaoISO, terminal, vendedor);
  const vprod = Number(itens.reduce((acc, i) => acc + i.valor_total, 0).toFixed(2));
  const vqnt = itens.reduce((acc, i) => acc + i.quantidade, 0);

  const codigo = `${dataEmissaoISO.replace(/[-:.TZ]/g, "")}${pad(numero, 6)}`;
  const pagamento = { modalidade: modalidade.modalidade, forma_pagamento: modalidade.forma_pagamento, valor: vprod, parcelas: 1 };

  return {
    _id_empresa: empresa._id_empresa,
    _id_conta: empresa._id_conta,
    operacao: "saida",
    tpemis: "1",
    numeracao_automatica: true,
    numero,
    codigo,
    serie: SERIE,
    modelo: MODELO,
    chave_acesso: buildChaveAcesso(rng, empresaIndex, dataEmissaoISO, numero),
    data_emissao: dataEmissaoISO,
    data_movimento: dataEmissaoISO,
    natureza_operacao: "venda",
    crt: "1",
    finalidade: 1,
    status,
    pessoa: cliente,
    itens,
    info: { complementares: `CODIGO DA VENDA:${codigo}` },
    total: {
      vbc: 0,
      vicms: 0,
      vicmsdeson: 0,
      vfcpufdest: 0,
      vicmsufdest: 0,
      vicmsufremet: 0,
      vbcst: 0,
      vst: 0,
      vprod,
      vfrete: 0,
      vseg: 0,
      vdesc: 0,
      vii: 0,
      vipi: 0,
      vpis: 0,
      vcofins: 0,
      voutro: 0,
      vnf: vprod,
      vtottrib: 0,
      vcomissao: 0,
      vcomissao_temp: 0,
      vqnt,
      vtotal_promocional: 0,
      total_cashback: 0,
      pessoas: 0,
    },
    estorno: false,
    status_sefaz: status === "emitida" ? 100 : 0,
    pedidos: [String(numero)],
    emissao_imediata: false,
    venda: {
      status: status === "emitida",
      data_venda: dataEmissaoISO,
      caixa,
      pagamento,
      pagamentos: [pagamento],
      valor: vprod,
      troco: 0,
      qnt_pessoas: 0,
    },
    _id_cliente: cliente._key,
    _deleted: rng() < 0.02,
    _created_at: dataEmissaoISO,
    _updated_at: dataEmissaoISO,
    _last_sync: dataEmissaoISO,
    _first_sync: dataEmissaoISO,
  };
}
