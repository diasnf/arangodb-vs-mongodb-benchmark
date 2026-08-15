import fp from "fastify-plugin";
import { Database } from "arangojs";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    arango: Database;
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const url = process.env.ARANGO_URL ?? "http://localhost:8529";
  const dbName = process.env.ARANGO_DB ?? "benchmark";
  const username = process.env.ARANGO_USER ?? "root";
  const password = process.env.ARANGO_PASSWORD ?? "";

  const systemDb = new Database({ url, auth: { username, password } });

  const exists = await systemDb.listDatabases().then((dbs) => dbs.includes(dbName));
  if (!exists) {
    await systemDb.createDatabase(dbName);
  }

  const db = new Database({ url, databaseName: dbName, auth: { username, password } });

  const notas = db.collection("notas");
  if (!(await notas.exists())) {
    await notas.create();
  }
  // Suporta: FILTER _id_empresa == ? AND data_emissao BETWEEN ? AND ? SORT data_emissao DESC
  await notas.ensureIndex({
    type: "persistent",
    fields: ["_id_empresa", "data_emissao"],
    name: "idx_empresa_data",
  });
  await notas.ensureIndex({
    type: "persistent",
    fields: ["_id_empresa", "codigo"],
    name: "idx_empresa_codigo",
    unique: true,
  });

  fastify.decorate("arango", db);
};

export default fp(dbPlugin);
