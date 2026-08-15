// Lê benchmarks/seed/dataset.jsonl (gerado por generate.js) e insere em lotes
// no MongoDB. Rode generate.js antes deste script.
//
// Uso:
//   MONGO_URL=mongodb://localhost:27017 MONGO_DB=benchmark node seed/seed.mongo.js

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MongoClient } from "mongodb";

const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017";
const MONGO_DB = process.env.MONGO_DB ?? "benchmark";
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 1000);

const datasetPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "dataset.jsonl");

async function main() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const collection = client.db(MONGO_DB).collection("notas");
  await collection.createIndex({ _id_empresa: 1, data_emissao: -1 });
  await collection.createIndex({ _id_empresa: 1, codigo: 1 }, { unique: true });

  const rl = createInterface({ input: createReadStream(datasetPath), crlfDelay: Infinity });

  let batch = [];
  let total = 0;

  async function flush() {
    if (batch.length === 0) return;
    await collection.insertMany(batch, { ordered: false });
    total += batch.length;
    process.stdout.write(`  ${total} notas inseridas no MongoDB\n`);
    batch = [];
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  console.log(`OK: ${total} notas inseridas em ${MONGO_DB}.notas`);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
