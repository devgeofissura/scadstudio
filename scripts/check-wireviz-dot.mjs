// Compara a assinatura estrutural do DOT gerado com .gv de referência do
// WireViz 0.4.1. Uso:
//   node scripts/check-wireviz-dot.mjs [pastaDeYAMLs] [pastaDeGVs]
// Sem argumentos, usa public/examples e %TEMP%/opencode/wireviz-gv.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { convertWireVizToDot } from '../src/lib/wirevizToDot.js';

const YAML_DIR = process.argv[2] || path.join(process.cwd(), 'public', 'examples');
const GV_DIR = process.argv[3]
  || process.env.WIREVIZ_GV_DIR
  || path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'opencode', 'wireviz-gv');

function normalizeEndpoint(endpoint) {
  return endpoint
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/:(?:w|e)$/, '');
}

function signature(dot) {
  const nodes = new Set();
  for (const match of dot.matchAll(/^\s*(\w+)\s*\[label=</gm)) nodes.add(match[1]);
  const edges = new Set();
  for (const match of dot.matchAll(/^\s*(\S+)\s+--\s+(\S+)/gm)) {
    edges.add(`${normalizeEndpoint(match[1])} -- ${normalizeEndpoint(match[2])}`);
  }
  return {
    nodes: [...nodes].sort(),
    edges: [...edges].sort(),
    pins: (dot.match(/port="p\d+[lr]"/g) || []).length,
    colorRows: (dot.match(/<td[^>]*height="2"[^>]*bgcolor="#[0-9a-fA-F]{6}"/g) || []).length,
  };
}

function difference(actual, expected) {
  const got = new Set(actual);
  return {
    missing: expected.filter((item) => !got.has(item)),
    extra: actual.filter((item) => !expected.includes(item)),
  };
}

let failures = 0;
let compared = 0;

console.log('=== WireViz -> DOT: assinatura estrutural ===');
console.log(`YAML: ${YAML_DIR}`);
console.log(`Referencias GV: ${GV_DIR}`);

let files = [];
try {
  files = readdirSync(YAML_DIR).filter((name) => /\.(ya?ml)$/i.test(name)).sort();
} catch (error) {
  console.error(`FAIL: pasta de YAMLs indisponível: ${error.message}`);
  process.exit(1);
}
if (!files.length) {
  console.error('FAIL: nenhum .yaml encontrado na pasta informada.');
  process.exit(1);
}

for (const file of files) {
  const yamlPath = path.join(YAML_DIR, file);
  const gvPath = path.join(GV_DIR, file.replace(/\.ya?ml$/i, '.gv'));
  let generated;
  try {
    generated = convertWireVizToDot(readFileSync(yamlPath, 'utf8'));
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${file}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  const actual = signature(generated.dot);
  if (!existsSync(gvPath)) {
    console.log(`SKIP ${file}: sem .gv de referência | DOT gerado | ${generated.stats.connectors}c/${generated.stats.cables}f/${generated.stats.connections}x | avisos ${generated.warnings.length}`);
    continue;
  }
  compared += 1;
  const expected = signature(readFileSync(gvPath, 'utf8'));
  const nodeDiff = difference(actual.nodes, expected.nodes);
  const edgeDiff = difference(actual.edges, expected.edges);
  const ok = !nodeDiff.missing.length && !nodeDiff.extra.length
    && !edgeDiff.missing.length && !edgeDiff.extra.length
    && actual.pins === expected.pins && actual.colorRows === expected.colorRows;

  if (ok) {
    console.log(`PASS ${file}: nós ${actual.nodes.length}/${expected.nodes.length} | arestas ${actual.edges.length}/${expected.edges.length} | pinos ${actual.pins}/${expected.pins} | linhas-cor ${actual.colorRows}/${expected.colorRows} | avisos ${generated.warnings.length}`);
  } else {
    failures += 1;
    console.log(`FAIL ${file}: nós ${actual.nodes.length}/${expected.nodes.length} | arestas ${actual.edges.length}/${expected.edges.length} | pinos ${actual.pins}/${expected.pins} | linhas-cor ${actual.colorRows}/${expected.colorRows}`);
    if (nodeDiff.missing.length) console.log(`  nós ausentes: ${nodeDiff.missing.slice(0, 12).join(', ')}`);
    if (nodeDiff.extra.length) console.log(`  nós extras: ${nodeDiff.extra.slice(0, 12).join(', ')}`);
    if (edgeDiff.missing.length) console.log(`  arestas ausentes (${edgeDiff.missing.length}): ${edgeDiff.missing.slice(0, 12).join(' | ')}`);
    if (edgeDiff.extra.length) console.log(`  arestas extras (${edgeDiff.extra.length}): ${edgeDiff.extra.slice(0, 12).join(' | ')}`);
  }
}

console.log(`Resumo: ${compared} comparação(ões), ${failures} falha(s).`);
process.exit(failures ? 1 : 0);
