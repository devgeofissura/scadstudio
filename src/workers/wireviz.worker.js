import { instance } from '@viz-js/viz';
import { convertWireVizToDot } from '../lib/wirevizToDot.js';
import { convertWireVizToSchematicDot } from '../lib/wirevizToSchematicDot.js';

let vizPromise = null;

async function renderDot(dot) {
  if (!vizPromise) vizPromise = instance();
  const viz = await vizPromise;
  return viz.renderString(dot, { format: 'svg' });
}

self.onmessage = async (event) => {
  const message = event.data || {};
  if (message.type === 'init') {
    try {
      await renderDot('graph { }');
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', id: 0, message: error.message || 'Falha ao carregar o Graphviz WASM.' });
    }
    return;
  }

  if (message.type !== 'convert' && message.type !== 'render-dot') return;

  const { id, text } = message;
  try {
    let dot = text;
    let stats = null;
    let warnings = [];
    if (message.type === 'convert') {
      // Layout organizado e o padrao: o YAML continua sendo a fonte das
      // conexoes, mas o DOT gerado controla a posicao de cada bloco.
      const organized = message.layout !== 'wireviz';
      const converted = organized
        ? convertWireVizToSchematicDot(text)
        : convertWireVizToDot(text);
      dot = converted.dot;
      stats = converted.stats || null;
      warnings = [...(converted.warnings || [])];
      if (converted.audit && !converted.audit.ok) {
        warnings.push(`Conexoes sem representacao no desenho: ${converted.audit.missing.slice(0, 6).join(', ')}`);
      }
      for (const warning of warnings) self.postMessage({ type: 'warning', text: warning });
    }
    const svg = await renderDot(dot);
    self.postMessage({ type: 'result', id, dot, svg, stats, warnings });
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error.message || 'Falha ao processar o projeto.' });
  }
};
