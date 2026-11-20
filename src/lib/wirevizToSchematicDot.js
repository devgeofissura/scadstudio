// Layout organizado para projetos WireViz.
//
// O YAML continua sendo a unica fonte tecnica: este modulo nao cria nem
// remove ligacoes. Ele apenas transforma as conexoes em um DOT com blocos
// compactos, posicoes previsiveis e arestas coloridas. O DOT e renderizado pelo
// Graphviz (WASM no navegador, dot.exe na CLI).
import { parse } from 'yaml';
import {
  FALLBACK_COLOR,
  asArray,
  asText,
  buildCable,
  buildConnector,
  colorRows,
  dotId,
  escapeHtml,
  isObject,
  parseNets,
  resolveEndpoint,
} from './wirevizToDot.js';

const ROLE_RULES = [
  ['ground', /gnd|terra|ground|refer.ncia|ref_/i],
  ['aux5v', /auxiliar|aux_?5|\b5\s?v\b/i],
  ['psu', /24\s?[-_]?\s?36|fonte principal|\bpsu\b|\b24\s?v\b/i],
  ['controller', /simcam|esp32|mcu|controladora|placa/i],
  ['level', /level|conversor|shifter|n.vel/i],
  ['driver', /dm556|driver/i],
  ['motor', /motor|stepper|ktc|nema/i],
];

const ROLE_STYLE = {
  controller: ['#deebf7', '#9dc3e6'],
  level: ['#eadcf5', '#c9a5e8'],
  aux5v: ['#fce4d6', '#f8cbad'],
  driver: ['#d9f0f0', '#a8d8d8'],
  psu: ['#fbe0de', '#f4b7b3'],
  motor: ['#e2f0d9', '#b7dfa8'],
  ground: ['#e7e6e6', '#bfbfbf'],
  unknown: ['#f3f4f6', '#cbd5e1'],
};

const ROLE_RANK = {
  controller: 0,
  level: 1,
  aux5v: 1,
  driver: 2,
  psu: 2,
  motor: 3,
  ground: 4,
  unknown: 5,
};

const WIRE_LEGEND = [
  ['#ff0000', 'RD', 'alimentacao positiva'],
  ['#000000', 'BK', 'GND / 0 V'],
  ['#ffff00', 'YE', 'STEP / PUL 3,3 V'],
  ['#0066ff', 'BU', 'DIR 3,3 V'],
  ['#8000ff', 'VT', 'sinais apos conversor 5 V'],
  ['#ff8000', 'OG', 'alimentacao auxiliar 5 V'],
  ['#00ff00', 'GN', 'fases do motor'],
];

function decodeHtml(value) {
  return asText(value)
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function clean(value) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function shorten(value, max = 120) {
  const text = clean(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function attr(value) {
  return `"${clean(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function roleFor(connector) {
  const haystack = `${connector.name} ${connector.type} ${connector.subtype}`;
  for (const [role, pattern] of ROLE_RULES) {
    if (pattern.test(haystack)) return role;
  }
  return 'unknown';
}

/** Le o YAML com as mesmas regras do conversor WireViz classico. */
function readDocument(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('YAML vazio: nao ha conteudo para converter.');
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
  const seen = new Set();
  const warn = (message) => {
    if (!seen.has(message)) {
      seen.add(message);
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
  for (const [name, definition] of Object.entries(rawConnectors)) {
    connectors.set(name, buildConnector(name, definition, warn));
  }
  const cables = new Map();
  const colorWarnings = new Set();
  for (const [name, definition] of Object.entries(rawCables)) {
    cables.set(name, buildCable(name, definition, warn, colorWarnings));
  }
  const nets = parseNets(doc.connections, connectors, cables, warn);
  if (!nets.length || nets.every((net) => !net.endpoints.length)) {
    throw new Error('YAML sem conexoes utilizaveis.');
  }

  return { doc, connectors, cables, nets, warnings };
}

/**
 * Transforma as conexoes do YAML em ligacoes diretas de pino a pino.
 * Cada fio de cada cabo gera uma ligacao; nenhuma ligacao e deduzida.
 */
function buildLinks(nets, connectors, cables, warn) {
  const links = [];
  const nc = [];
  const loops = [];
  const used = new Set();
  const all = [];
  const mark = (kind, name, ref) => used.add(`${kind}:${name}:${ref}`);

  for (const net of nets) {
    const resolved = net.endpoints.map((endpoint) => ({
      ...endpoint,
      pins: resolveEndpoint(endpoint, connectors, cables, warn),
    }));
    for (const endpoint of resolved) {
      for (const ref of endpoint.pins) {
        all.push({ kind: endpoint.kind, name: endpoint.name, ref });
      }
    }

    if (resolved.length === 1) {
      for (const endpoint of resolved) {
        for (const ref of endpoint.pins) {
          nc.push({
            kind: endpoint.kind,
            name: endpoint.name,
            pin: ref,
            terminal: `__NC_${endpoint.name}_${ref}`,
            label: endpoint.kind === 'connector'
              ? (connectors.get(endpoint.name).pins.find((p) => p.number === ref)?.label || '')
              : '',
          });
          mark(endpoint.kind, endpoint.name, ref);
        }
      }
      continue;
    }

    let pending = null;
    let lastWasCable = false;
    for (let index = 0; index < resolved.length; index += 1) {
      const endpoint = resolved[index];

      if (endpoint.kind === 'cable') {
        const cable = cables.get(endpoint.name);
        const next = resolved[index + 1];
        const right = next && next.kind === 'connector' ? next : null;

        for (let wireIndex = 0; wireIndex < endpoint.pins.length; wireIndex += 1) {
          const wireNumber = endpoint.pins[wireIndex];
          const wire = cable.wires.find((item) => item.number === wireNumber);
          if (!wire) {
            warn(`Fio ${endpoint.name}:${wireNumber} nao declarado; ligacao ignorada.`);
            continue;
          }
          const meta = {
            cable: endpoint.name,
            wire: wireNumber,
            label: wire.label || `fio ${wireNumber}`,
            type: clean(cable.type),
            color: colorRows(wire.segments)[1] || FALLBACK_COLOR,
          };
          const leftPin = pending ? pending.pins[wireIndex] : undefined;
          const rightPin = right ? right.pins[wireIndex] : undefined;

          if (leftPin !== undefined && rightPin !== undefined) {
            links.push({
              from: { kind: 'connector', name: pending.name, pin: leftPin },
              to: { kind: 'connector', name: right.name, pin: rightPin },
              ...meta,
            });
            mark('connector', pending.name, leftPin);
            mark('connector', right.name, rightPin);
            mark('cable', endpoint.name, wireNumber);
          } else if (leftPin !== undefined || rightPin !== undefined) {
            const side = leftPin !== undefined ? pending : right;
            const pin = leftPin !== undefined ? leftPin : rightPin;
            const terminal = {
              kind: 'terminal',
              name: `__NC_${endpoint.name}_${wireNumber}_${side.name}_${pin}`,
            };
            links.push({
              from: leftPin !== undefined
                ? { kind: 'connector', name: side.name, pin }
                : terminal,
              to: leftPin !== undefined
                ? terminal
                : { kind: 'connector', name: side.name, pin },
              ...meta,
            });
            mark('connector', side.name, pin);
            mark('cable', endpoint.name, wireNumber);
          } else {
            warn(`Fio ${endpoint.name}:${wireNumber} sem conector na conexao.`);
          }
        }
        pending = right;
        lastWasCable = true;
      } else if (endpoint.kind === 'connector') {
        if (!pending || lastWasCable) {
          pending = endpoint;
          lastWasCable = false;
        } else {
          for (let pinIndex = 0; pinIndex < endpoint.pins.length; pinIndex += 1) {
            const leftPin = pending.pins[pinIndex];
            const rightPin = endpoint.pins[pinIndex];
            if (leftPin === undefined || rightPin === undefined) continue;
            links.push({
              from: { kind: 'connector', name: pending.name, pin: leftPin },
              to: { kind: 'connector', name: endpoint.name, pin: rightPin },
              cable: null,
              wire: null,
              label: 'mesmo no',
              type: '',
              color: '#374151',
              direct: true,
            });
            mark('connector', pending.name, leftPin);
            mark('connector', endpoint.name, rightPin);
          }
          pending = endpoint;
        }
      }
    }
  }

  for (const connector of connectors.values()) {
    for (const loop of connector.loops) {
      for (let index = 0; index + 1 < loop.length; index += 1) {
        loops.push({ name: connector.name, from: loop[index], to: loop[index + 1] });
      }
    }
  }

  const missing = all.filter((item) => !used.has(`${item.kind}:${item.name}:${item.ref}`));
  if (missing.length) {
    warn(`Layout organizado: ${missing.length} terminal(is) sem representacao no DOT.`);
  }
  return { links, nc, loops, missing };
}

function buildLayout(links, nc, connectors) {
  const layout = new Map();
  const counters = new Map();
  const belowCounters = new Map();

  for (const connector of connectors.values()) {
    const role = roleFor(connector);
    const rank = ROLE_RANK[role];
    // Fontes auxiliares e principais ficam ABAIXO do bloco que alimentam.
    const below = role === 'aux5v' || role === 'psu';
    const row = below
      ? -1 - (belowCounters.get(rank) || 0)
      : (counters.get(rank) || 0);
    if (below) belowCounters.set(rank, -row);
    else counters.set(rank, row + 1);
    const [fill, title] = ROLE_STYLE[role];
    const declared = connector;
    layout.set(connector.name, {
      kind: 'device',
      role,
      rank,
      row,
      fill: /^#[0-9a-f]{6}$/i.test(clean(declared.color)) ? clean(declared.color) : fill,
      title: ROLE_STYLE[role][1],
      header: title,
    });
  }

  const extraRank = Math.max(0, ...[...layout.values()].map((item) => item.rank)) + 1;
  const terminalSpecs = new Map();
  const addTerminal = (name, rank, label = '') => {
    if (!name || terminalSpecs.has(name)) return;
    terminalSpecs.set(name, { rank, label });
  };

  for (const item of nc) {
    addTerminal(item.terminal, layout.get(item.name)?.rank ?? extraRank, item.label);
  }
  for (const link of links) {
    for (const point of [link.from, link.to]) {
      if (point?.kind !== 'terminal') continue;
      const source = [link.from, link.to].find((candidate) => candidate.kind === 'connector');
      const sourceInfo = source ? layout.get(source.name) : null;
      addTerminal(point.name, sourceInfo?.rank ?? extraRank, link.label);
    }
  }
  [...terminalSpecs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([name, spec]) => {
      const row = counters.get(spec.rank) || 0;
      counters.set(spec.rank, row + 1);
      layout.set(name, {
        kind: 'terminal',
        role: 'nc',
        rank: spec.rank,
        row,
        label: spec.label,
      });
    });

  layout.set('__LEGEND', { kind: 'note', role: 'legend', rank: 0, row: 100 });
  layout.set('__WARNINGS', { kind: 'note', role: 'warnings', rank: 0, row: 101 });
  return layout;
}

function deviceNode(connector, info) {
  const lines = [`\t${dotId(connector.name)} [label=<`];
  lines.push('<table border="0" cellborder="0" cellspacing="0" cellpadding="2">');
  lines.push(` <tr><td bgcolor="${info.header}"><b>${escapeHtml(clean(connector.name))}</b></td></tr>`);
  lines.push(' <tr><td>');
  lines.push('  <table border="0" cellborder="0" cellspacing="0" cellpadding="1">');
  if (connector.type) {
    lines.push(`   <tr><td><font point-size="9">${escapeHtml(shorten(connector.type, 56))}</font></td></tr>`);
  }
  if (connector.subtype) {
    lines.push(`   <tr><td><font point-size="8">${escapeHtml(shorten(connector.subtype, 64))}</font></td></tr>`);
  }
  lines.push('  </table>');
  lines.push(' </td></tr>');

  if (connector.pins.length) {
    lines.push(' <tr><td>');
    lines.push('  <table border="1" cellborder="1" cellspacing="0" cellpadding="2">');
    for (const pin of connector.pins) {
      lines.push(`   <tr><td port="p${pin.number}" align="left">${pin.number} · ${escapeHtml(shorten(pin.label, 34))}</td></tr>`);
    }
    lines.push('  </table>');
    lines.push(' </td></tr>');
  }

  if (connector.notes) {
    const note = shorten(connector.notes, 190);
    lines.push(' <tr><td>');
    lines.push('  <table border="0" cellborder="0" cellspacing="0" cellpadding="1"><tr>');
    lines.push(`   <td><font point-size="8">${escapeHtml(note)}</font></td>`);
    lines.push('  </tr></table>');
    lines.push(' </td></tr>');
  }
  lines.push('</table>');
  lines.push(`> fillcolor="${info.fill}" color="#334155" shape=box style="filled"]`);
  return lines.join('\n');
}

function terminalNode(name, label = '') {
  const detail = clean(label) || clean(name).replace(/^__NC_/, '');
  return `\t${dotId(name)} [label=<`
    + '<table border="0" cellborder="0" cellspacing="0" cellpadding="3">'
    + '<tr><td><font point-size="8"><b>SEM LIGAÇÃO</b></font></td></tr>'
    + `<tr><td><font point-size="8">${escapeHtml(shorten(detail, 28))}</font></td></tr>`
    + '</table>> fillcolor="#f8fafc" color="#94a3b8" shape=box style="filled,dashed"]';
}

function warningsFrom(doc, connectors) {
  const appended = [];
  for (const fragment of asArray(doc.tweak?.append)) {
    for (const match of asText(fragment).matchAll(/<TD\b[^>]*>([\s\S]*?)<\/TD>/gi)) {
      const line = clean(decodeHtml(match[1]));
      if (line && !/avisos de seguran/i.test(line)) appended.push(line);
    }
  }

  const candidates = [];
  const pushLines = (value) => {
    for (const raw of decodeHtml(value).split(/\r?\n/)) {
      const line = clean(raw);
      if (line) candidates.push(line);
    }
  };
  pushLines(doc.metadata?.notes);
  for (const connector of connectors.values()) pushLines(connector.notes);

  const startsWithWarning = /^(?:\d+\)?\s*)?(?:nunca|seguran|nao confirmado|obrigat|reservad|desconectad|desacoplad|ohmimetro|enable_gpio|p1-p5)/i;
  const labelledWarning = /(?::|—)\s*(?:nao confirmado|nunca|obrigat|reservad|desconectad|desacoplad|ohmimetro)/i;
  const important = candidates.filter((line) => startsWithWarning.test(line) || labelledWarning.test(line));
  const unique = [...new Set([...appended, ...important])];
  return unique.slice(0, 10);
}

function legendNode(links, doc) {
  const present = new Map();
  for (const link of links) {
    if (!present.has(link.color)) {
      present.set(link.color, { code: '', text: clean(link.type || link.cable) });
    }
  }
  for (const [hex, code, text] of WIRE_LEGEND) {
    if (present.has(hex)) present.set(hex, { code, text: clean(doc.metadata?.legend?.[code] || text) });
  }
  const lines = ['\t__LEGEND [label=<'];
  lines.push('<table border="1" cellborder="1" cellspacing="0" cellpadding="3">');
  lines.push('<tr><td colspan="3" bgcolor="#e2e8f0"><b>LEGENDA DAS CORES</b></td></tr>');
  for (const [hex, info] of present) {
    lines.push('<tr>');
    lines.push(` <td bgcolor="${hex}" width="34">${info.code || '&nbsp;'}</td>`);
    lines.push(` <td align="left"><font point-size="9">${escapeHtml(shorten(info.text, 44))}</font></td>`);
    lines.push('</tr>');
  }
  if (!present.size) lines.push('<tr><td colspan="3">sem cores declaradas</td></tr>');
  lines.push('</table>> fillcolor="#ffffff" color="#64748b" shape=box style="filled"]');
  return lines.join('\n');
}

function warningNode(lines) {
  const out = ['\t__WARNINGS [label=<'];
  out.push('<table border="1" cellborder="1" cellspacing="0" cellpadding="3">');
  out.push('<tr><td bgcolor="#ffe699"><b>AVISOS DE SEGURANÇA — LEIA ANTES DE ENERGIZAR</b></td></tr>');
  const list = lines.length ? lines : ['Nenhum aviso de seguranca declarado no YAML.'];
  for (const line of list) {
    out.push(`<tr><td align="left"><font point-size="9">${escapeHtml(shorten(line, 120))}</font></td></tr>`);
  }
  out.push('</table>> fillcolor="#fff2cc" color="#bf9000" shape=box style="filled"]');
  return out.join('\n');
}

function edgeLine(link, layout) {
  const left = link.from;
  const right = link.to;
  const fromInfo = layout.get(left.name);
  const toInfo = layout.get(right.name);
  const sameRank = fromInfo && toInfo && fromInfo.rank === toInfo.rank;

  let from = dotId(left.name);
  let to = dotId(right.name);
  if (left.kind === 'connector') {
    // Mesmo rank: a porta define quem fica acima. Linha maior = bloco acima.
    const suffix = sameRank
      ? (fromInfo.row > toInfo.row ? ':s' : ':n')
      : ':e';
    from = `${from}:p${left.pin}${suffix}`;
  }
  if (right.kind === 'connector') {
    const suffix = sameRank
      ? (toInfo.row > fromInfo.row ? ':s' : ':n')
      : ':w';
    to = `${to}:p${right.pin}${suffix}`;
  }

  const parts = [
    `color="${link.color}"`,
    'penwidth="2.2"',
    'arrowsize="0.7"',
    'arrowhead="vee"',
  ];
  if (sameRank || left.kind === 'terminal' || right.kind === 'terminal') {
    parts.push('constraint="false"');
  }
  if (link.direct) {
    parts.push('style="dashed"');
  }
  const caption = link.cable
    ? `${link.cable}:${link.wire} · ${link.label}`
    : link.label;
  parts.push(`xlabel=${attr(shorten(caption, 64))}`);
  parts.push('fontcolor="#111827"');
  parts.push('fontsize="8"');
  if (link.type) parts.push(`tooltip=${attr(`${link.type} | ${caption}`)}`);
  return `\t${from} -> ${to} [${parts.join(' ')}]`;
}

/**
 * Converte YAML WireViz em DOT de layout organizado.
 * @returns {{dot: string, stats: object, audit: object, warnings: string[]}}
 */
export function convertWireVizToSchematicDot(text) {
  const { doc, connectors, cables, nets, warnings } = readDocument(text);
  const { links, nc, loops, missing } = buildLinks(nets, connectors, cables, warnPush(warnings));
  const layout = buildLayout(links, nc, connectors);

  const ranks = new Map();
  for (const [name, info] of layout) {
    if (!ranks.has(info.rank)) ranks.set(info.rank, []);
    ranks.get(info.rank).push({ name, row: info.row });
  }

  const out = ['digraph "wireviz_schematic" {'];
  out.push('// Layout organizado gerado a partir de YAML WireViz — conexoes intactas');
  out.push('\tgraph [bgcolor="#ffffff" fontname="Arial" nodesep="0.55" rankdir=LR ranksep="1.45" splines=spline]');
  out.push('\tnode [fontname="Arial" fontsize="10" margin="0.12,0.08" shape=box style=filled]');
  out.push('\tedge [arrowsize="0.7" fontname="Arial" fontsize="8" penwidth="2"]');

  for (const rank of [...ranks.keys()].sort((a, b) => a - b)) {
    const entries = ranks.get(rank).sort((a, b) => a.row - b.row);
    out.push(`\t{ rank=same; ${entries.map((entry) => dotId(entry.name)).join('; ')}; }`);
    for (let index = 0; index + 1 < entries.length; index += 1) {
      // constraint padrao e necessario: com constraint=false o Graphviz ignora
      // a ordem vertical e sobe as fontes acima dos blocos que alimentam.
      out.push(`\t${dotId(entries[index].name)} -> ${dotId(entries[index + 1].name)} [style="invis"]`);
    }
  }

  for (const connector of connectors.values()) {
    out.push(deviceNode(connector, layout.get(connector.name)));
  }
  for (const [name, info] of layout) {
    if (info.kind === 'terminal') out.push(terminalNode(name, info.label));
  }
  out.push(legendNode(links, doc));
  out.push(warningNode(warningsFrom(doc, connectors)));

  for (const link of links) out.push(edgeLine(link, layout));
  for (const item of nc) {
    const fromInfo = layout.get(item.name);
    const toInfo = layout.get(item.terminal);
    const sameRank = Boolean(fromInfo && toInfo && fromInfo.rank === toInfo.rank);
    const suffix = sameRank
      ? (fromInfo.row > toInfo.row ? ':s' : ':n')
      : (toInfo.rank > fromInfo.rank ? ':e' : ':w');
    out.push(`\t${dotId(item.name)}:p${item.pin}${suffix} -> ${dotId(item.terminal)} `
      + '[color="#64748b" constraint="false" label="sem ligação" fontsize="8" '
      + 'fontcolor="#475569" penwidth="1.5" style="dashed"]');
  }
  for (const loop of loops) {
    const info = layout.get(loop.name);
    out.push(`\t${dotId(loop.name)}:p${loop.from}:w -> ${dotId(loop.name)}:p${loop.to}:w `
      + `[color="#475569" constraint="false" dir="none" label="curto interno" `
      + `fontsize="8" fontcolor="#475569" penwidth="1.5" style="dashed"]`);
    if (info) info.hasLoop = true;
  }
  out.push('}');

  return {
    dot: `${out.join('\n')}\n`,
    stats: {
      connectors: connectors.size,
      cables: cables.size,
      connections: nets.length,
      wires: links.length + nc.length,
      edges: links.length,
      disconnected: nc.length,
      loops: loops.length,
    },
    audit: {
      missing: missing.map((item) => `${item.kind}:${item.name}:${item.ref}`),
      ok: missing.length === 0,
    },
    warnings,
  };
}

function warnPush(list) {
  return (message) => {
    if (!list.includes(message)) list.push(message);
  };
}

export default convertWireVizToSchematicDot;
