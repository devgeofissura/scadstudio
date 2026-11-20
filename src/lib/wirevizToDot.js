import { parse } from 'yaml';

/**
 * Conversor clean-room de YAML no formato WireViz para DOT (Graphviz).
 * Implementado a partir do esquema YAML e dos artefatos .gv gerados como
 * referencia de formato. Nenhum codigo-fonte do WireViz foi copiado.
 */

const COLORS = Object.freeze({
  BK: '#000000',
  WH: '#ffffff',
  RD: '#ff0000',
  GN: '#00ff00',
  YE: '#ffff00',
  BL: '#0066ff',
  BU: '#0066ff',
  BN: '#895956',
  VT: '#8000ff',
  GY: '#808080',
  PK: '#ffc0cb',
  BR: '#895956',
  OG: '#ff8000',
  OR: '#ff8000',
});

const FALLBACK_COLOR = '#808080';
const ID_SAFE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isObject(value)) {
    const inner = value.label ?? value.name ?? value.pin ?? value.number;
    return inner === undefined || inner === null ? '' : String(inner);
  }
  return String(value);
}

function escapeHtml(value) {
  return asText(value)
    .replace(/\r\n?/g, '\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br />');
}

function dotId(name) {
  return ID_SAFE.test(name) ? name : `"${name.replace(/"/g, '\\"')}"`;
}

function expandRefs(ref) {
  if (typeof ref === 'number') return [ref];
  const text = asText(ref).trim();
  const range = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    const out = [];
    for (let n = from; n <= to; n += 1) out.push(n);
    return out;
  }
  return [text];
}

function numericValue(ref) {
  if (typeof ref === 'number') return Number.isFinite(ref) ? ref : null;
  if (isObject(ref)) {
    return numericValue(ref.pin ?? ref.number ?? ref.name ?? ref.label);
  }
  const text = asText(ref).trim();
  return /^\d+$/.test(text) ? Number(text) : null;
}

function colorSegments(code) {
  const raw = asText(code).trim().toUpperCase();
  const trailing = raw.match(/^([A-Z]{2})WH$/);
  if (trailing) return [trailing[1], 'WH'];
  const leading = raw.match(/^WH([A-Z]{2})$/);
  if (leading) return ['WH', leading[1]];
  return [raw || 'GY'];
}

function buildConnector(name, def, warn) {
  const source = isObject(def) ? def : {};
  const pinSource = source.pinlabels !== undefined
    ? asArray(source.pinlabels)
    : (Array.isArray(source.pins) ? source.pins : []);
  const numberSource = Array.isArray(source.pins) && source.pins.length
    ? source.pins
    : pinSource.map((_, index) => index + 1);

  const pins = pinSource.map((entry, index) => {
    const label = asText(entry);
    const rawNumber = numberSource[index] ?? index + 1;
    const number = numericValue(rawNumber) ?? index + 1;
    const names = [label];
    if (isObject(entry)) {
      for (const key of ['name', 'label', 'pin', 'number']) {
        if (entry[key] !== undefined && entry[key] !== null) names.push(asText(entry[key]));
      }
    }
    return { number, label, names: names.filter(Boolean) };
  });

  const byName = new Map();
  for (const pin of pins) {
    for (const alias of pin.names) {
      if (!byName.has(alias)) byName.set(alias, pin.number);
    }
    byName.set(String(pin.number), pin.number);
  }

  const loops = [];
  for (const loop of asArray(source.loops)) {
    const refs = asArray(loop).map(numericValue).filter((n) => n !== null);
    if (refs.length >= 2) loops.push(refs);
    else warn(`Loops do conector ${name} ignorados: entrada invalida.`);
  }

  return {
    name,
    type: asText(source.type),
    subtype: asText(source.subtype),
    notes: asText(source.notes),
    color: asText(source.color) || '#FFFFFF',
    hideDisconnected: source.hide_disconnected_pins === true,
    pins,
    byName,
    loops,
    sides: new Set(),
    usedPins: new Set(),
  };
}

function buildCable(name, def, warn, colorWarnings) {
  const source = isObject(def) ? def : {};
  const rawColors = asArray(source.colors ?? source.color);
  const rawLabels = asArray(source.wirelabels ?? source.labels);
  const declaredCount = numericValue(source.wirecount);
  const count = declaredCount && declaredCount > 0
    ? declaredCount
    : (rawColors.length || 1);

  if (rawColors.length && declaredCount && declaredCount > rawColors.length) {
    warn(`Cabo ${name}: wirecount ${declaredCount} excede ${rawColors.length} cores; fios sem cor usam cinza.`);
  }

  const wires = [];
  for (let index = 0; index < count; index += 1) {
    let code = asText(rawColors[index] ?? rawColors[0] ?? 'GY').trim().toUpperCase();
    if (!code) code = 'GY';
    const segments = colorSegments(code);
    for (const segment of segments) {
      if (!COLORS[segment] && !colorWarnings.has(segment)) {
        colorWarnings.add(segment);
        warn(`Cor WireViz desconhecida "${segment}" no cabo ${name}; usando cinza.`);
      }
    }
    wires.push({
      number: index + 1,
      code,
      label: asText(rawLabels[index]),
      segments,
      ends: { left: '', right: '' },
    });
  }

  return {
    name,
    type: asText(source.type),
    subtype: asText(source.subtype),
    gauge: asText(source.gauge),
    length: asText(source.length),
    notes: asText(source.notes),
    wires,
    byLabel: new Map(wires.map((wire) => [wire.label, wire.number])),
  };
}

function parseTarget(value) {
  const text = asText(value).trim();
  const match = text.match(/^([^:]+):(.+)$/);
  if (!match) return null;
  return { name: match[1].trim().trimEnd(':'), pin: match[2].trim() };
}

function makeEndpoint(name, refs, connectors, cables, warn) {
  let kind = 'unknown';
  if (connectors.has(name)) kind = 'connector';
  else if (cables.has(name)) kind = 'cable';
  else warn(`Componente "${name}" referenciado em connections nao foi declarado.`);
  const expanded = asArray(refs).flatMap(expandRefs);
  return { name, kind, refs: expanded };
}

function parseNets(rawConnections, connectors, cables, warn) {
  const rawNets = Array.isArray(rawConnections)
    ? rawConnections
    : isObject(rawConnections) ? [rawConnections] : [];
  const nets = [];

  for (const rawNet of rawNets) {
    if (typeof rawNet === 'string') {
      nets.push({ endpoints: [makeEndpoint(rawNet, [], connectors, cables, warn)] });
      continue;
    }
    if (!Array.isArray(rawNet) && !isObject(rawNet)) {
      warn('Entrada ignorada em connections: formato nao reconhecido.');
      continue;
    }

    if (isObject(rawNet)) {
      // Formas: CONN: { PIN: [CABO:PINW] } ou CABO: { PINW: [CONN:PIN] }.
      const expanded = [];
      let hasMap = false;
      for (const [name, value] of Object.entries(rawNet)) {
        if (!isObject(value)) continue;
        hasMap = true;
        for (const [pin, targets] of Object.entries(value)) {
          for (const target of asArray(targets)) {
            const parsed = parseTarget(target);
            if (!parsed) {
              warn(`Alvo "${asText(target)}" invalido em connections; ignorado.`);
              continue;
            }
            expanded.push({
              endpoints: [
                makeEndpoint(name, [pin], connectors, cables, warn),
                makeEndpoint(parsed.name, [parsed.pin], connectors, cables, warn),
              ],
            });
          }
        }
      }
      if (hasMap) {
        if (expanded.length) nets.push(...expanded);
        else warn('Conexao em mapa vazia ignorada.');
        continue;
      }
    }

    const parts = Array.isArray(rawNet) ? rawNet : Object.entries(rawNet)
      .map(([name, value]) => ({ [name]: value }));
    const endpoints = [];
    for (const part of parts) {
      if (typeof part === 'string') {
        endpoints.push(makeEndpoint(part, [], connectors, cables, warn));
      } else if (isObject(part)) {
        for (const [name, value] of Object.entries(part)) {
          endpoints.push(makeEndpoint(name, value, connectors, cables, warn));
        }
      } else {
        warn('Item de conexao ignorado: formato nao reconhecido.');
      }
    }
    if (endpoints.length) nets.push({ endpoints });
  }

  return nets;
}

function resolveEndpoint(endpoint, connectors, cables, warn) {
  const refs = [];
  for (const ref of endpoint.refs) {
    if (endpoint.kind === 'connector') {
      const connector = connectors.get(endpoint.name);
      const direct = numericValue(ref);
      if (direct !== null) {
        refs.push(direct);
      } else if (connector.byName.has(asText(ref))) {
        refs.push(connector.byName.get(asText(ref)));
      } else {
        warn(`Pino "${asText(ref)}" nao encontrado no conector ${endpoint.name}; aresta ignorada.`);
      }
    } else if (endpoint.kind === 'cable') {
      const cable = cables.get(endpoint.name);
      const direct = numericValue(ref);
      if (direct !== null) {
        refs.push(direct);
      } else if (cable.byLabel.has(asText(ref))) {
        refs.push(cable.byLabel.get(asText(ref)));
      } else {
        warn(`Fio "${asText(ref)}" nao encontrado no cabo ${endpoint.name}; aresta ignorada.`);
      }
    }
  }
  return refs;
}

function pinLabel(connector, number) {
  const pin = connector.pins.find((item) => item.number === number);
  return pin ? pin.label : '';
}

function endLabel(endpoint, number, connectors, cables) {
  if (endpoint.kind === 'connector') {
    const label = pinLabel(connectors.get(endpoint.name), number);
    return label ? `${endpoint.name}:${number}:${label}` : `${endpoint.name}:${number}`;
  }
  const cable = cables.get(endpoint.name);
  const wire = cable.wires.find((item) => item.number === number);
  const label = wire ? wire.label : '';
  return label ? `${endpoint.name}:${number}:${label}` : `${endpoint.name}:${number}`;
}

function colorRows(segments) {
  const hexes = segments.map((segment) => COLORS[segment] || FALLBACK_COLOR);
  const middle = hexes.length === 1
    ? [hexes[0], hexes[0], hexes[0]]
    : [hexes[0], hexes[1], hexes[0]];
  return ['#000000', ...middle, '#000000'];
}

function connectorNode(connector) {
  const lines = [`\t${dotId(connector.name)} [label=<`];
  lines.push('<table border="0" cellspacing="0" cellpadding="0">');
  lines.push(' <tr><td>');
  lines.push('  <table border="0" cellspacing="0" cellpadding="3" cellborder="1"><tr>');
  lines.push(`   <td balign="left">${escapeHtml(connector.name)}</td>`);
  lines.push('  </tr></table>');
  lines.push(' </td></tr>');
  lines.push(' <tr><td>');
  lines.push('  <table border="0" cellspacing="0" cellpadding="3" cellborder="1"><tr>');
  if (connector.type) lines.push(`   <td balign="left">${escapeHtml(connector.type)}</td>`);
  if (connector.subtype) lines.push(`   <td balign="left">${escapeHtml(connector.subtype)}</td>`);
  lines.push(`   <td balign="left">${connector.pins.length}-pin</td>`);
  lines.push('  </tr></table>');
  lines.push(' </td></tr>');

  if (connector.pins.length) {
    lines.push(' <tr><td>');
    lines.push('  <table border="0" cellspacing="0" cellpadding="3" cellborder="1">');
    for (const pin of connector.pins) {
      const sides = [...connector.sides].sort();
      const left = sides.includes('l') ? `<td port="p${pin.number}l">${pin.number}</td>` : '';
      const right = sides.includes('r') ? `<td port="p${pin.number}r">${pin.number}</td>` : '';
      lines.push('   <tr>');
      lines.push(left ? `    ${left}` : '');
      lines.push(`    <td>${escapeHtml(pin.label)}</td>`);
      lines.push(right ? `    ${right}` : '');
      lines.push('   </tr>');
    }
    lines.push('  </table>');
    lines.push(' </td></tr>');
  }

  if (connector.notes) {
    lines.push(' <tr><td>');
    lines.push('  <table border="0" cellspacing="0" cellpadding="3" cellborder="1"><tr>');
    lines.push(`   <td balign="left">${escapeHtml(connector.notes)}</td>`);
    lines.push('  </tr></table>');
    lines.push(' </td></tr>');
  }

  lines.push('</table>');
  lines.push('> fillcolor="#FFFFFF" shape=box style=filled]');
  return lines.filter((line) => line !== '').join('\n');
}

function cableNode(cable) {
  const lines = [`\t${dotId(cable.name)} [label=<`];
  lines.push('<table border="0" cellspacing="0" cellpadding="0">');
  lines.push(' <tr><td>');
  lines.push('  <table border="0" cellspacing="0" cellpadding="3" cellborder="1"><tr>');
  lines.push(`   <td balign="left">${escapeHtml(cable.name)}</td>`);
  lines.push('  </tr></table>');
  lines.push(' </td></tr>');
  lines.push(' <tr><td>');
  lines.push('  <table border="0" cellspacing="0" cellpadding="3" cellborder="1"><tr>');
  if (cable.type) lines.push(`   <td balign="left">${escapeHtml(cable.type)}</td>`);
  if (cable.subtype) lines.push(`   <td balign="left">${escapeHtml(cable.subtype)}</td>`);
  lines.push(`   <td balign="left">${cable.wires.length}x</td>`);
  if (cable.gauge) lines.push(`   <td balign="left">${escapeHtml(cable.gauge)}</td>`);
  if (cable.length) lines.push(`   <td balign="left">${escapeHtml(cable.length)}</td>`);
  lines.push('  </tr></table>');
  lines.push(' </td></tr>');
  lines.push(' <tr><td>');
  lines.push('  <table border="0" cellspacing="0" cellborder="0">');
  lines.push('   <tr><td>&nbsp;</td></tr>');
  for (const wire of cable.wires) {
    lines.push('   <tr>');
    lines.push(`    <td>${escapeHtml(wire.ends.left)}</td>`);
    lines.push('    <td>');
    lines.push(`     ${wire.number}:${escapeHtml(wire.code)}${wire.label ? ':' + escapeHtml(wire.label) : ''}`);
    lines.push('    </td>');
    lines.push(`    <td>${escapeHtml(wire.ends.right)}</td>`);
    lines.push('   </tr>');
    lines.push(`   <tr><td colspan="3" border="0" cellspacing="0" cellpadding="0" port="w${wire.number}" height="10">`);
    lines.push('    <table cellspacing="0" cellborder="0" border="0">');
    for (const hex of colorRows(wire.segments)) {
      lines.push(`     <tr><td colspan="3" cellpadding="0" height="2" bgcolor="${hex}" border="0"></td></tr>`);
    }
    lines.push('    </table>');
    lines.push('   </td></tr>');
  }
  lines.push('   <tr><td>&nbsp;</td></tr>');
  lines.push('  </table>');
  lines.push(' </td></tr>');
  if (cable.notes) {
    lines.push(' <tr><td>');
    lines.push('  <table border="0" cellspacing="0" cellpadding="3" cellborder="1"><tr>');
    lines.push(`   <td balign="left">${escapeHtml(cable.notes)}</td>`);
    lines.push('  </tr></table>');
    lines.push(' </td></tr>');
  }
  lines.push('</table>');
  lines.push('> fillcolor="#FFFFFF" shape=box style=filled]');
  return lines.join('\n');
}

/**
 * Converte texto YAML WireViz para DOT.
 * @param {string} text
 * @returns {{ dot: string, stats: {connectors: number, cables: number, connections: number}, warnings: string[] }}
 */
export function convertWireVizToDot(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('YAML vazio: nao ha contenido para converter.');
  }

  let doc;
  try {
    doc = parse(text, { schema: 'core', maxAliasCount: 0 });
  } catch (error) {
    throw new Error(`YAML invalido: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(doc)) {
    throw new Error('YAML invalido: a raiz do documento deve ser um mapeamento.');
  }

  const warnings = [];
  const seenWarnings = new Set();
  const colorWarnings = new Set();
  const warn = (message) => {
    if (!seenWarnings.has(message)) {
      seenWarnings.add(message);
      warnings.push(message);
    }
  };

  const rawConnectors = isObject(doc.connectors) ? doc.connectors : {};
  const rawCables = isObject(doc.cables) ? doc.cables : {};
  if (!Object.keys(rawConnectors).length && !Object.keys(rawCables).length) {
    throw new Error('YAML sem conectores ou cabos utilizaveis.');
  }
  if (doc.connections === undefined || doc.connections === null
      || (Array.isArray(doc.connections) && !doc.connections.length)
      || (isObject(doc.connections) && !Object.keys(doc.connections).length)) {
    throw new Error('YAML sem conexoes utilizaveis.');
  }

  const connectors = new Map();
  for (const [name, def] of Object.entries(rawConnectors)) {
    connectors.set(name, buildConnector(name, def, warn));
  }
  const cables = new Map();
  for (const [name, def] of Object.entries(rawCables)) {
    cables.set(name, buildCable(name, def, warn, colorWarnings));
  }

  const nets = parseNets(doc.connections, connectors, cables, warn);
  if (!nets.length || nets.every((net) => !net.endpoints.length)) {
    throw new Error('YAML sem conexoes utilizaveis.');
  }

  const edges = [];
  for (const net of nets) {
    const resolved = net.endpoints.map((endpoint) => ({
      ...endpoint,
      pins: resolveEndpoint(endpoint, connectors, cables, warn),
    }));

    resolved.forEach((endpoint, index) => {
      if (endpoint.kind !== 'connector') return;
      const connector = connectors.get(endpoint.name);
      if (index === 0 && resolved.length > 1) connector.sides.add('r');
      if (index === resolved.length - 1) connector.sides.add('l');
      if (resolved.length === 1) connector.sides.add('l');
      if (index > 0 && index < resolved.length - 1) {
        connector.sides.add('l');
        connector.sides.add('r');
      }
      for (const pin of endpoint.pins) connector.usedPins.add(pin);
    });

    let pendingLeft = null;
    for (let index = 0; index < resolved.length; index += 1) {
      const endpoint = resolved[index];
      if (endpoint.kind === 'cable') {
        const cable = cables.get(endpoint.name);
        if (pendingLeft && pendingLeft.kind === 'connector') {
          for (let wireIndex = 0; wireIndex < endpoint.pins.length; wireIndex += 1) {
            const wireNumber = endpoint.pins[wireIndex];
            const pinNumber = pendingLeft.pins[wireIndex];
            const wire = cable.wires.find((item) => item.number === wireNumber);
            if (!wire || pinNumber === undefined) continue;
            wire.ends.left = endLabel(pendingLeft, pinNumber, connectors, cables);
            const connector = connectors.get(pendingLeft.name);
            edges.push({
              from: `${dotId(pendingLeft.name)}:p${pinNumber}r:e`,
              to: `${dotId(cable.name)}:w${wireNumber}:w`,
              colors: colorRows(wire.segments),
            });
          }
        }
        const next = resolved[index + 1];
        if (next && next.kind === 'connector') {
          for (let wireIndex = 0; wireIndex < endpoint.pins.length; wireIndex += 1) {
            const wireNumber = endpoint.pins[wireIndex];
            const pinNumber = next.pins[wireIndex];
            const wire = cable.wires.find((item) => item.number === wireNumber);
            if (!wire || pinNumber === undefined) continue;
            wire.ends.right = endLabel(next, pinNumber, connectors, cables);
            edges.push({
              from: `${dotId(cable.name)}:w${wireNumber}:e`,
              to: `${dotId(next.name)}:p${pinNumber}l:w`,
              colors: colorRows(wire.segments),
            });
          }
        }
        pendingLeft = next && next.kind === 'connector' ? next : null;
      } else if (endpoint.kind === 'connector' && !pendingLeft) {
        pendingLeft = endpoint;
      }
    }

    if (!resolved.some((endpoint) => endpoint.kind === 'cable')) {
      const direct = resolved.filter((endpoint) => endpoint.kind === 'connector');
      for (let index = 0; index + 1 < direct.length; index += 1) {
        const left = direct[index];
        const right = direct[index + 1];
        for (let pinIndex = 0; pinIndex < left.pins.length; pinIndex += 1) {
          const pinNumber = left.pins[pinIndex];
          const other = right.pins[pinIndex];
          if (other === undefined) continue;
          edges.push({
            from: `${dotId(left.name)}:p${pinNumber}r:e`,
            to: `${dotId(right.name)}:p${other}l:w`,
            colors: ['#000000', '#000000', '#000000', '#000000', '#000000'],
          });
        }
      }
    }
  }

  for (const connector of connectors.values()) {
    if (connector.hideDisconnected) {
      const used = connector.usedPins;
      connector.pins = connector.pins.filter((pin) => used.has(pin.number));
    }
    if (connector.loops.length) connector.sides.add('l');
    for (const loop of connector.loops) {
      for (let index = 0; index + 1 < loop.length; index += 1) {
        edges.unshift({
          from: `${dotId(connector.name)}:p${loop[index]}l:w`,
          to: `${dotId(connector.name)}:p${loop[index + 1]}l:w`,
          colors: null,
          loop: true,
        });
      }
    }
  }

  const out = ['graph {'];
  out.push('// DOT compativel com WireViz 0.4.1 (gerado por conversor clean-room)');
  out.push('\tgraph [bgcolor="#FFFFFF" fontname=arial nodesep=0.33 rankdir=LR ranksep=2]');
  out.push('\tnode [fillcolor="#FFFFFF" fontname=arial height=0 margin=0 shape=none style=filled width=0]');
  out.push('\tedge [fontname=arial style=bold]');
  for (const connector of connectors.values()) out.push(connectorNode(connector));
  for (const cable of cables.values()) out.push(cableNode(cable));
  for (const edge of edges) {
    if (edge.colors) out.push(`\tedge [color="${edge.colors.join(':')}"]`);
    const attrs = edge.loop ? ' [label=" "]' : '';
    out.push(`\t${edge.from} -- ${edge.to}${attrs}`);
  }
  out.push('}');

  return {
    dot: `${out.join('\n')}\n`,
    stats: {
      connectors: connectors.size,
      cables: cables.size,
      connections: nets.length,
    },
    warnings,
  };
}

export default convertWireVizToDot;
