import fp from "fastify-plugin";
import { MongoClient, Db } from "mongodb";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    mongo: Db;
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const url = process.env.MONGO_URL ?? "mongodb://localhost:27017";
  const dbName = process.env.MONGO_DB ?? "benchmark";

  const client = new MongoClient(url);
  await client.connect();

  const db = client.db(dbName);
  const notas = db.collection("notas");
  // Suporta: FILTER _id_empresa == ? AND data_emissao BETWEEN ? AND ? SORT data_emissao DESC
  await notas.createIndex({ _id_empresa: 1, data_emissao: -1 });
  await notas.createIndex({ _id_empresa: 1, codigo: 1 }, { unique: true });

  fastify.decorate("mongo", db);

  fastify.addHook("onClose", async () => {
    await client.close();
  });
};

export default fp(dbPlugin);
