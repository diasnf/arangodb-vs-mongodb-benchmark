import type { FastifyPluginAsync } from "fastify";
import { aql } from "arangojs";
import { randomUUID } from "node:crypto";
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
  const collection = () => fastify.arango.collection<Nota>("notas");

  fastify.post<{ Body: Nota }>("/", { schema: { body: createBodySchema } }, async (request, reply) => {
    const now = new Date().toISOString();
    const doc = { ...request.body, _key: randomUUID(), _created_at: now, _updated_at: now };
    const result = await collection().save(doc as any);
    reply.code(201);
    return { id: result._key };
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const nota = await collection()
      .document(request.params.id, { graceful: true })
      .catch(() => null);
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
    const offset = (page - 1) * pageSize;

    const cursor = await fastify.arango.query(aql`
      FOR n IN notas
        FILTER n._id_empresa == ${_id_empresa}
        FILTER ${data_inicio ?? null} == null OR n.data_emissao >= ${data_inicio ?? ""}
        FILTER ${data_fim ?? null} == null OR n.data_emissao <= ${data_fim ?? ""}
        FILTER ${operacao ?? null} == null OR n.operacao == ${operacao ?? ""}
        SORT n.data_emissao DESC
        LIMIT ${offset}, ${pageSize}
        RETURN n
    `);
    const data = await cursor.all();

    const countCursor = await fastify.arango.query(aql`
      FOR n IN notas
        FILTER n._id_empresa == ${_id_empresa}
        FILTER ${data_inicio ?? null} == null OR n.data_emissao >= ${data_inicio ?? ""}
        FILTER ${data_fim ?? null} == null OR n.data_emissao <= ${data_fim ?? ""}
        FILTER ${operacao ?? null} == null OR n.operacao == ${operacao ?? ""}
        COLLECT WITH COUNT INTO total
        RETURN total
    `);
    const [total] = await countCursor.all();

    return { data, total: total ?? 0, page, pageSize };
  });

  // Espelha a query real de listagem de notas recentes por empresa/período.
  fastify.get<{
    Querystring: { _id_empresa: string; data_inicio: string; data_fim: string; limit?: number };
  }>("/recentes", { schema: { querystring: recentesQuerySchema } }, async (request) => {
    const { _id_empresa, data_inicio, data_fim, limit = 10 } = request.query;

    const cursor = await fastify.arango.query(aql`
      FOR nota IN notas
        FILTER nota._id_empresa == ${_id_empresa}
        FILTER nota._deleted != true
        FILTER (nota.data_emissao >= ${data_inicio} AND nota.data_emissao <= ${data_fim})
        SORT nota.data_emissao DESC
        LIMIT ${limit}

        RETURN {
          _key: nota._key,
          numero: nota.numero,
          serie: nota.serie,
          chave_acesso: nota.chave_acesso,
          pessoa: { nome: nota.pessoa.nome },
          valor: nota.total.vnf,
          status: nota.status,
          natureza_operacao: nota.natureza_operacao,
          operacao: nota.operacao,
          pagamento: nota.venda.pagamento,
          data_emissao: nota.data_emissao,
          data_movimento: nota.data_movimento,
          estorno: nota.estorno,
          codigo: nota.codigo,
          modelo: nota.modelo,
          _id_conta: nota._id_conta
        }
    `);
    return cursor.all();
  });

  fastify.get<{
    Querystring: { _id_empresa: string; data_inicio: string; data_fim: string; agrupar?: "dia" | "vendedor" };
  }>("/resumo", { schema: { querystring: resumoQuerySchema } }, async (request) => {
    const { _id_empresa, data_inicio, data_fim, agrupar = "dia" } = request.query;

    if (agrupar === "vendedor") {
      const cursor = await fastify.arango.query(aql`
        FOR n IN notas
          FILTER n._id_empresa == ${_id_empresa}
          FILTER n.data_emissao >= ${data_inicio} AND n.data_emissao <= ${data_fim}
          FOR item IN n.itens
            COLLECT vendedorKey = item.vendedor._key, vendedorNome = item.vendedor.nome
              AGGREGATE valor_total = SUM(item.valor_total)
              WITH COUNT INTO qtd_itens
            SORT valor_total DESC
            RETURN { _id: vendedorKey, vendedor: vendedorNome, valor_total, qtd_itens }
      `);
      return { agrupar, resultado: await cursor.all() };
    }

    const cursor = await fastify.arango.query(aql`
      FOR n IN notas
        FILTER n._id_empresa == ${_id_empresa}
        FILTER n.data_emissao >= ${data_inicio} AND n.data_emissao <= ${data_fim}
        COLLECT dia = SUBSTRING(n.data_emissao, 0, 10)
          AGGREGATE valor_total = SUM(n.total.vnf), qtd_itens = SUM(n.total.vqnt)
          WITH COUNT INTO qtd_notas
        SORT dia ASC
        RETURN { _id: dia, valor_total, qtd_notas, qtd_itens }
    `);
    return { agrupar, resultado: await cursor.all() };
  });
};

export default notasRoutes;
