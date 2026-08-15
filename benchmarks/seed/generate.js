// Gera um dataset determinístico de notas (mesmas 3 empresas, datas
// estritamente crescentes) em benchmarks/seed/dataset.jsonl, para ser
// carregado igualmente no MongoDB e no ArangoDB (seed.mongo.js / seed.arango.js).
//
// Uso:
//   COUNT=50000 SEED=42 node seed/generate.js

import { createWriteStream, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EMPRESAS, DATA_INICIO } from "../shared/constants.js";
import { buildNota } from "../shared/buildNota.js";

const COUNT = Number(process.env.COUNT ?? 50000);
const SEED = Number(process.env.SEED ?? 42);

// mulberry32: PRNG determinístico e rápido, suficiente para gerar dados fake.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "dataset.jsonl");
const out = createWriteStream(outPath, { flags: "w" });

const numeroPorEmpresa = EMPRESAS.map(() => 0);
let dataAtualMs = new Date(DATA_INICIO).getTime();

for (let i = 0; i < COUNT; i++) {
  const empresaIndex = i % EMPRESAS.length;
  const empresa = EMPRESAS[empresaIndex];
  numeroPorEmpresa[empresaIndex] += 1;

  // incremento crescente e variável (30s a ~10min) para simular cadência real de vendas
  dataAtualMs += 30_000 + Math.floor(rng() * 570_000);
  const dataEmissaoISO = new Date(dataAtualMs).toISOString();

  const nota = buildNota(rng, {
    empresa,
    empresaIndex,
    numero: numeroPorEmpresa[empresaIndex],
    dataEmissaoISO,
  });

  out.write(JSON.stringify(nota) + "\n");

  if ((i + 1) % 10000 === 0) {
    process.stdout.write(`  ${i + 1}/${COUNT} notas geradas\n`);
  }
}

out.end(() => {
  const dataFim = new Date(dataAtualMs).toISOString();
  console.log(`OK: ${COUNT} notas geradas em ${outPath}`);
  console.log(`Período: ${DATA_INICIO} até ${dataFim}`);
  console.log(`Empresas: ${EMPRESAS.map((e) => e._id_empresa).join(", ")}`);

  const infoPath = path.join(path.dirname(outPath), "dataset-info.json");
  writeFileSync(
    infoPath,
    JSON.stringify(
      {
        count: COUNT,
        seed: SEED,
        dataInicio: DATA_INICIO,
        dataFim,
        empresas: EMPRESAS.map((e) => e._id_empresa),
        geradoEm: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
});
