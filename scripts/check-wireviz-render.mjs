// Verificação de ponta a ponta (sem navegador): YAML -> DOT -> SVG.
import { readFile } from 'node:fs/promises';
import { instance } from '@viz-js/viz';
import { convertWireVizToDot } from '../src/lib/wirevizToDot.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Uso: node scripts/check-wireviz-render.mjs <arquivo.yaml> [outro.yaml ...]');
  process.exit(1);
}

const viz = await instance();
let failures = 0;
for (const file of files) {
  try {
    const yaml = await readFile(file, 'utf8');
    const { dot, stats, warnings } = convertWireVizToDot(yaml);
    const svg = viz.renderString(dot, { format: 'svg' });
    const hasSvg = /<svg\b/i.test(svg);
    const hasNodes = (svg.match(/class="node"/g) || []).length >= stats.connectors;
    if (!hasSvg || !hasNodes) throw new Error('SVG gerado sem os nós esperados.');
    console.log(`PASS ${file}: ${stats.connectors}c/${stats.cables}f/${stats.connections}x | DOT ${dot.length} B | SVG ${svg.length} B | avisos ${warnings.length}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${file}: ${error.message}`);
  }
}
process.exit(failures ? 1 : 0);
