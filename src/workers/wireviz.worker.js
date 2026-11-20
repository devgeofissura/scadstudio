import { instance } from '@viz-js/viz';
import { convertWireVizToDot } from '../lib/wirevizToDot.js';

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
      const converted = convertWireVizToDot(text);
      dot = converted.dot;
      stats = converted.stats || null;
      warnings = converted.warnings || [];
      for (const warning of warnings) self.postMessage({ type: 'warning', text: warning });
    }
    const svg = await renderDot(dot);
    self.postMessage({ type: 'result', id, dot, svg, stats, warnings });
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error.message || 'Falha ao processar o projeto.' });
  }
};
