// Lê benchmarks/seed/dataset.jsonl (gerado por generate.js) e insere em lotes
// no ArangoDB. Rode generate.js antes deste script.
//
// Uso:
//   ARANGO_URL=http://localhost:8529 ARANGO_DB=benchmark ARANGO_PASSWORD=benchmark node seed/seed.arango.js

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Database } from "arangojs";

const ARANGO_URL = process.env.ARANGO_URL ?? "http://localhost:8529";
const ARANGO_DB = process.env.ARANGO_DB ?? "benchmark";
const ARANGO_USER = process.env.ARANGO_USER ?? "root";
const ARANGO_PASSWORD = process.env.ARANGO_PASSWORD ?? "benchmark";
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 1000);

const datasetPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "dataset.jsonl");

async function main() {
  const systemDb = new Database({ url: ARANGO_URL, auth: { username: ARANGO_USER, password: ARANGO_PASSWORD } });
  if (!(await systemDb.listDatabases()).includes(ARANGO_DB)) {
    await systemDb.createDatabase(ARANGO_DB);
  }

  const db = new Database({ url: ARANGO_URL, databaseName: ARANGO_DB, auth: { username: ARANGO_USER, password: ARANGO_PASSWORD } });
  const notas = db.collection("notas");
  if (!(await notas.exists())) await notas.create();
  await notas.ensureIndex({ type: "persistent", fields: ["_id_empresa", "data_emissao"], name: "idx_empresa_data" });
  await notas.ensureIndex({ type: "persistent", fields: ["_id_empresa", "codigo"], name: "idx_empresa_codigo", unique: true });

  const rl = createInterface({ input: createReadStream(datasetPath), crlfDelay: Infinity });

  let batch = [];
  let total = 0;

  async function flush() {
    if (batch.length === 0) return;
    await notas.saveAll(batch);
    total += batch.length;
    process.stdout.write(`  ${total} notas inseridas no ArangoDB\n`);
    batch = [];
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  console.log(`OK: ${total} notas inseridas em ${ARANGO_DB}.notas`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
