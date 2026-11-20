// Verifica o layout organizado: YAML -> DOT -> SVG e auditoria de conexoes.
// Uso: node scripts/check-wireviz-schematic.mjs <arquivo.yaml> [outro.yaml ...]
import { readFile } from 'node:fs/promises';
import { instance } from '@viz-js/viz';
import { parse } from 'yaml';
import { convertWireVizToSchematicDot } from '../src/lib/wirevizToSchematicDot.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Uso: node scripts/check-wireviz-schematic.mjs <arquivo.yaml> [outro.yaml ...]');
  process.exit(1);
}

const viz = await instance();
let failures = 0;

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function decode(value) {
  return asText(value)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function asText(value) {
  if (value === undefined || value === null) return '';
  return typeof value === 'object' ? '' : String(value);
}

for (const file of files) {
  try {
    const yaml = await readFile(file, 'utf8');
    const result = convertWireVizToSchematicDot(yaml);
    const doc = parse(yaml, { schema: 'core', maxAliasCount: 0 });
    const svg = viz.renderString(result.dot, { format: 'svg' });

    const problems = [];
    if (!result.audit.ok) problems.push(`terminais ausentes: ${result.audit.missing.join(', ')}`);
    if (!/<svg\b/i.test(svg)) problems.push('SVG nao gerado');

    for (const name of Object.keys(doc.connectors || {})) {
      if (!result.dot.includes(name)) problems.push(`conector ${name} ausente no DOT`);
    }
    for (const [name, def] of Object.entries(doc.cables || {})) {
      const count = Number(def?.wirecount || (Array.isArray(def?.colors) ? def.colors.length : 1));
      for (let wire = 1; wire <= count; wire += 1) {
        if (!result.dot.includes(`${name}:${wire}`)) problems.push(`fio ${name}:${wire} ausente no DOT`);
      }
    }
    if (!result.dot.includes('__LEGEND')) problems.push('legenda ausente');
    if (!result.dot.includes('__WARNINGS')) problems.push('quadro de avisos ausente');

    const nets = asArray(doc.connections).filter((net) => net !== null);
    const cableNames = new Set(Object.keys(doc.cables || {}));
    const connectedCables = new Set();
    const isolatedPins = [];
    for (const net of nets) {
      if (!Array.isArray(net)) continue;
      for (const part of net) {
        if (!part || typeof part !== 'object') continue;
        for (const [name, refs] of Object.entries(part)) {
          if (cableNames.has(name) && net.length > 1) connectedCables.add(name);
          if (net.length === 1) {
            for (const ref of asArray(refs)) isolatedPins.push(`${name}:${asText(ref).trim()}`);
          }
        }
      }
    }
    const expectedEdges = [...connectedCables].reduce((sum, name) => {
      const def = doc.cables[name] || {};
      return sum + Number(def.wirecount || asArray(def.colors ?? def.color).length || 1);
    }, 0);
    if (result.stats.edges !== expectedEdges) {
      problems.push(`arestas ${result.stats.edges}/${expectedEdges} esperadas`);
    }
    for (const pin of isolatedPins) {
      const needle = pin.slice(pin.lastIndexOf(':') + 1);
      if (!result.dot.includes(needle)) problems.push(`terminal isolada ${pin} ausente no DOT`);
    }
    const expectedLoops = Object.values(doc.connectors || {})
      .reduce((sum, connector) => sum + asArray(connector?.loops).length, 0);
    if (result.stats.loops !== expectedLoops) {
      problems.push(`loops ${result.stats.loops}/${expectedLoops} esperados`);
    }

    const normalizedDot = result.dot.replace(/&gt;/gi, '>').replace(/&amp;/gi, '&');
    for (const fragment of asArray(doc.tweak?.append)) {
      for (const match of asText(fragment).matchAll(/<TD\b[^>]*>([\s\S]*?)<\/TD>/gi)) {
        const warning = decode(match[1]).trim();
        if (warning && !/avisos de seguran/i.test(warning) && !normalizedDot.includes(warning)) {
          problems.push(`aviso ausente no quadro: ${warning}`);
        }
      }
    }

    const nodeCount = (svg.match(/class="node"/g) || []).length;
    const expected = Object.keys(doc.connectors || {}).length + 2;
    if (nodeCount < expected) problems.push(`SVG com ${nodeCount} nos, esperado >= ${expected}`);

    if (problems.length) throw new Error(problems.join('; '));
    console.log(
      `PASS ${file}: ${result.stats.connectors}c/${result.stats.cables}f/${result.stats.connections}x | `
      + `${result.stats.edges} arestas | ${result.stats.disconnected} NC | ${result.stats.loops} loops | `
      + `DOT ${result.dot.length} B | SVG ${svg.length} B | avisos ${result.warnings.length}`,
    );
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

process.exit(failures ? 1 : 0);
