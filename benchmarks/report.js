// Lê os summaries do k6 (results/<target>-<load|query>-summary.json) e gera
// um relatório final comparando MongoDB x ArangoDB em results/REPORT.md,
// além de imprimir um resumo no console. Alvos ausentes (ex: arango ainda
// não rodado nesta máquina) são reportados como "sem dados", sem quebrar.
//
// Uso:
//   node report.js

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const RESULTS_DIR = path.join(ROOT, "results");

const TARGETS = [
  { key: "mongo", label: "MongoDB" },
  { key: "arango", label: "ArangoDB" },
];
const TESTS = [
  { key: "load", label: "Teste de carga (escrita + leitura mista, VUs em rampa)" },
  { key: "query", label: "Teste de consulta em concorrência (/notas/recentes, VUs constantes)" },
];

function fmt(n, digits = 1) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function loadSummary(target, test) {
  const file = path.join(RESULTS_DIR, `${target}-${test}-summary.json`);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const metrics = raw.metrics ?? {};
  const dur = metrics.http_req_duration ?? {};
  const failed = metrics.http_req_failed ?? {};
  const reqs = metrics.http_reqs ?? {};
  return {
    reqCount: reqs.count,
    reqRate: reqs.rate,
    avg: dur.avg,
    p90: dur["p(90)"],
    p95: dur["p(95)"],
    p99: dur["p(99)"],
    max: dur.max,
    failRate: typeof failed.value === "number" ? failed.value : failed.rate,
  };
}

function loadDatasetInfo() {
  const file = path.join(HERE, "seed", "dataset-info.json");
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function buildTestSection(test) {
  const rows = TARGETS.map((t) => ({ target: t, data: loadSummary(t.key, test.key) }));
  const anyData = rows.some((r) => r.data);

  const header =
    "| Banco | Requisições | Vazão (req/s) | Latência média (ms) | p90 (ms) | p95 (ms) | p99 (ms) | máx (ms) | Falhas |\n" +
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|";

  const lines = rows.map(({ target, data }) => {
    if (!data) return `| ${target.label} | — | — | — | — | — | — | — | sem dados |`;
    return (
      `| ${target.label} | ${data.reqCount ?? "—"} | ${fmt(data.reqRate, 1)} | ${fmt(data.avg)} | ` +
      `${fmt(data.p90)} | ${fmt(data.p95)} | ${fmt(data.p99)} | ${fmt(data.max)} | ${fmt((data.failRate ?? 0) * 100, 2)}% |`
    );
  });

  let veredito = "";
  if (rows[0].data && rows[1].data) {
    const [mongo, arango] = rows.map((r) => r.data);
    const faster = mongo.p95 <= arango.p95 ? "MongoDB" : "ArangoDB";
    const diff = Math.abs(mongo.p95 - arango.p95);
    const diffPct = (diff / Math.max(mongo.p95, arango.p95)) * 100;
    veredito = `\n**${faster}** teve p95 menor neste teste (diferença de ${fmt(diff)}ms, ~${fmt(diffPct, 1)}%).\n`;
  } else if (!anyData) {
    veredito = "\n_Nenhum dos dois bancos tem resultado para este teste ainda._\n";
  } else {
    const missing = rows.find((r) => !r.data).target.label;
    veredito = `\n_Faltam resultados de ${missing} para comparar este teste._\n`;
  }

  return `### ${test.label}\n\n${header}\n${lines.join("\n")}\n${veredito}`;
}

function main() {
  const info = loadDatasetInfo();
  const now = new Date().toISOString();

  const datasetSection = info
    ? `- Dataset: **${info.count}** notas, **${info.empresas.length}** empresas, período **${info.dataInicio}** a **${info.dataFim}** (seed=${info.seed})`
    : "- Dataset: informação não encontrada (rode benchmarks/seed/generate.js)";

  const sections = TESTS.map(buildTestSection).join("\n\n");

  const md = `# Relatório de Benchmark — MongoDB vs ArangoDB (coleção Notas)

Gerado em ${now}

${datasetSection}
- Query principal testada: \`GET /notas/recentes\` — mesmo filtro/projeção usados em produção
  (\`_id_empresa\` + \`_deleted != true\` + range de \`data_emissao\`, \`SORT DESC\`, \`LIMIT\`)

${sections}

---
_Métricas extraídas dos summaries do k6 (\`results/*-summary.json\`). "Falhas" é a % de requisições
que não passaram nos checks/status esperado. Bancos sem arquivo de summary aparecem como "sem dados"._
`;

  const outPath = path.join(RESULTS_DIR, "REPORT.md");
  writeFileSync(outPath, md);

  console.log(md);
  console.log(`\nRelatório salvo em ${outPath}`);
}

main();
