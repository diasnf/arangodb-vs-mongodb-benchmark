import type { FastifyPluginAsync } from "fastify";
import { ObjectId } from "mongodb";
import type { Nota } from "../models/nota.js";

const createBodySchema = {
  type: "object",
  required: ["_id_empresa", "operacao", "codigo", "serie", "modelo", "data_emissao", "itens", "total"],
  properties: {
    _id_empresa: { type: "string" },
    operacao: { type: "string" },
    codigo: { type: "string" },
    serie: { type: "number" },
    modelo: { type: "number" },
    data_emissao: { type: "string" },
    itens: { type: "array", minItems: 1 },
    total: { type: "object" },
  },
  additionalProperties: true,
} as const;

const listQuerySchema = {
  type: "object",
  required: ["_id_empresa"],
  properties: {
    _id_empresa: { type: "string" },
    data_inicio: { type: "string" },
    data_fim: { type: "string" },
    operacao: { type: "string" },
    page: { type: "integer", minimum: 1, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 200, default: 20 },
  },
} as const;

const recentesQuerySchema = {
  type: "object",
  required: ["_id_empresa", "data_inicio", "data_fim"],
  properties: {
    _id_empresa: { type: "string" },
    data_inicio: { type: "string" },
    data_fim: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 10 },
  },
} as const;

const resumoQuerySchema = {
  type: "object",
  required: ["_id_empresa", "data_inicio", "data_fim"],
  properties: {
    _id_empresa: { type: "string" },
    data_inicio: { type: "string" },
    data_fim: { type: "string" },
    agrupar: { type: "string", enum: ["dia", "vendedor"], default: "dia" },
  },
} as const;

const notasRoutes: FastifyPluginAsync = async (fastify) => {
  const collection = () => fastify.mongo.collection<Nota>("notas");

  fastify.post<{ Body: Nota }>("/", { schema: { body: createBodySchema } }, async (request, reply) => {
    const now = new Date().toISOString();
    const doc = { ...request.body, _created_at: now, _updated_at: now };
    const result = await collection().insertOne(doc as Nota);
    reply.code(201);
    return { id: result.insertedId.toHexString() };
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    if (!ObjectId.isValid(request.params.id)) {
      reply.code(400);
      return { error: "id inválido" };
    }
    const nota = await collection().findOne({ _id: new ObjectId(request.params.id) } as any);
    if (!nota) {
      reply.code(404);
      return { error: "nota não encontrada" };
    }
    return nota;
  });

  fastify.get<{
    Querystring: { _id_empresa: string; data_inicio?: string; data_fim?: string; operacao?: string; page?: number; pageSize?: number };
  }>("/", { schema: { querystring: listQuerySchema } }, async (request) => {
    const { _id_empresa, data_inicio, data_fim, operacao, page = 1, pageSize = 20 } = request.query;

    const filter: Record<string, unknown> = { _id_empresa };
    if (data_inicio || data_fim) {
      filter.data_emissao = {
        ...(data_inicio ? { $gte: data_inicio } : {}),
        ...(data_fim ? { $lte: data_fim } : {}),
      };
    }
    if (operacao) filter.operacao = operacao;

    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      collection().find(filter).sort({ data_emissao: -1 }).skip(skip).limit(pageSize).toArray(),
      collection().countDocuments(filter),
    ]);

    return { data, total, page, pageSize };
  });

  // Espelha a query real de listagem de notas recentes por empresa/período.
  fastify.get<{
    Querystring: { _id_empresa: string; data_inicio: string; data_fim: string; limit?: number };
  }>("/recentes", { schema: { querystring: recentesQuerySchema } }, async (request) => {
    const { _id_empresa, data_inicio, data_fim, limit = 10 } = request.query;

    const filter = {
      _id_empresa,
      _deleted: { $ne: true },
      data_emissao: { $gte: data_inicio, $lte: data_fim },
    };

    const notas = await collection()
      .find(filter, {
        projection: {
          _id: 1,
          numero: 1,
          serie: 1,
          chave_acesso: 1,
          "pessoa.nome": 1,
          "total.vnf": 1,
          status: 1,
          natureza_operacao: 1,
          operacao: 1,
          "venda.pagamento": 1,
          data_emissao: 1,
          data_movimento: 1,
          estorno: 1,
          codigo: 1,
          modelo: 1,
          _id_conta: 1,
        },
      })
      .sort({ data_emissao: -1 })
      .limit(limit)
      .toArray();

    return notas.map((nota) => ({
      _key: nota._id.toHexString(),
      numero: nota.numero,
      serie: nota.serie,
      chave_acesso: nota.chave_acesso,
      pessoa: { nome: nota.pessoa?.nome },
      valor: nota.total?.vnf,
      status: nota.status,
      natureza_operacao: nota.natureza_operacao,
      operacao: nota.operacao,
      pagamento: nota.venda?.pagamento,
      data_emissao: nota.data_emissao,
      data_movimento: nota.data_movimento,
      estorno: nota.estorno,
      codigo: nota.codigo,
      modelo: nota.modelo,
      _id_conta: nota._id_conta,
    }));
  });

  fastify.get<{
    Querystring: { _id_empresa: string; data_inicio: string; data_fim: string; agrupar?: "dia" | "vendedor" };
  }>("/resumo", { schema: { querystring: resumoQuerySchema } }, async (request) => {
    const { _id_empresa, data_inicio, data_fim, agrupar = "dia" } = request.query;

    const match = {
      _id_empresa,
      data_emissao: { $gte: data_inicio, $lte: data_fim },
    };

    if (agrupar === "vendedor") {
      const pipeline = [
        { $match: match },
        { $unwind: "$itens" },
        {
          $group: {
            _id: "$itens.vendedor._key",
            vendedor: { $first: "$itens.vendedor.nome" },
            valor_total: { $sum: "$itens.valor_total" },
            qtd_itens: { $sum: 1 },
          },
        },
        { $sort: { valor_total: -1 } },
      ];
      return { agrupar, resultado: await collection().aggregate(pipeline).toArray() };
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: { $substrCP: ["$data_emissao", 0, 10] },
          valor_total: { $sum: "$total.vnf" },
          qtd_notas: { $sum: 1 },
          qtd_itens: { $sum: "$total.vqnt" },
        },
      },
      { $sort: { _id: 1 } },
    ];
    return { agrupar, resultado: await collection().aggregate(pipeline).toArray() };
  });
};

export default notasRoutes;
