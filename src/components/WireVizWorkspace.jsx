import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  FileCode2,
  LoaderCircle,
  Network,
  Play,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { renderHtml, renderPdf, renderPng } from '../lib/wirevizOutputs.js';

const ACCEPT = '.yaml,.yml,.gv,.dot,.svg,.htm,.html,text/plain';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function kindFor(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.gv') || lower.endsWith('.dot')) return 'dot';
  if (lower.endsWith('.svg')) return 'svg';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  return 'yaml';
}

function extractSvg(text, kind) {
  if (kind !== 'html') return text;
  return text.match(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/i)?.[0] || '';
}

function download(bytes, name, mime) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function WireVizWorkspace({ onStatusChange }) {
  const workerRef = useRef(null);
  const inputRef = useRef(null);
  const requestRef = useRef(0);
  const initialRef = useRef(false);
  const userEditedRef = useRef(false);
  const pendingRef = useRef(null);
  const runRef = useRef(null);
  const [yaml, setYaml] = useState('');
  const [fileName, setFileName] = useState('exemplo-wireviz.yaml');
  const [fileSize, setFileSize] = useState(0);
  const [inputKind, setInputKind] = useState('yaml');
  const [layoutMode, setLayoutMode] = useState('organized');
  const [pngScale, setPngScale] = useState(3);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Carregando motor de diagramas');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [stats, setStats] = useState(null);
  const [result, setResult] = useState(null);
  const [exporting, setExporting] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!onStatusChange) return;
    const cls = error ? 'status-error' : busy || exporting ? 'status-busy' : result ? 'status-ok' : '';
    onStatusChange({ text: status, cls });
  }, [status, error, busy, exporting, result, onStatusChange]);

  const run = useCallback((text, name = fileName, kind = 'yaml', layout = layoutMode) => {
    if (!text || !text.trim()) return;
    if (kind !== 'yaml' && kind !== 'dot') {
      const payload = extractSvg(text, kind);
      if (!payload) {
        setResult(null);
        setStats(null);
        setError('O arquivo HTML não contém um diagrama SVG inline.');
        setBusy(false);
        setStatus('HTML sem diagrama');
        return;
      }
      setResult({ passthrough: payload });
      setStats(null);
      setWarnings([]);
      setError('');
      setBusy(false);
      setStatus('Arquivo carregado — pronto para exportar');
      return;
    }
    if (!workerRef.current) return;
    const id = ++requestRef.current;
    setBusy(true);
    setError('');
    setWarnings([]);
    setResult(null);
    setStatus(kind === 'dot' ? 'Renderizando DOT'
      : layout === 'organized' ? 'Gerando layout organizado' : 'Gerando diagrama');
    workerRef.current.postMessage({
      type: kind === 'dot' ? 'render-dot' : 'convert',
      id,
      text,
      fileName: name,
      layout,
    });
  }, [fileName, layoutMode]);

  runRef.current = run;

  const changeLayout = useCallback((mode) => {
    if (mode === layoutMode) return;
    setLayoutMode(mode);
    const pending = pendingRef.current;
    if (pending?.text) run(pending.text, pending.name, pending.kind, mode);
  }, [layoutMode, run]);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/wireviz.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'ready') {
        setReady(true);
        setStatus('Motor de diagramas pronto');
        if (!initialRef.current) {
          initialRef.current = true;
          if (userEditedRef.current && pendingRef.current) {
            const { text: userText, name, kind } = pendingRef.current;
            runRef.current?.(userText, name, kind);
            return;
          }
          const id = ++requestRef.current;
          setBusy(true);
          fetch('/examples/exemplo-wireviz.yaml')
            .then((response) => {
              if (!response.ok) throw new Error('exemplo indisponível');
              return response.text();
            })
            .then((text) => {
              if (userEditedRef.current) return;
              if (!text.trim()) throw new Error('exemplo vazio');
              setYaml(text);
              setFileName('exemplo-wireviz.yaml');
              setFileSize(new TextEncoder().encode(text).byteLength);
              worker.postMessage({ type: 'convert', id, text, fileName: 'exemplo-wireviz.yaml', layout: 'organized' });
            })
            .catch(() => {
              if (userEditedRef.current) return;
              setError('Não foi possível carregar o exemplo. Abra um arquivo .yaml.');
              setBusy(false);
            });
        }
      } else if (message.type === 'warning') {
        setWarnings((current) => [...current, message.text].slice(-12));
      } else if (message.type === 'result' && message.id === requestRef.current) {
        setResult({ dot: message.dot, svg: message.svg });
        setStats(message.stats || null);
        setWarnings(message.warnings || []);
        setBusy(false);
        setStatus(message.svg ? 'Diagrama pronto' : 'Arquivo pronto');
      } else if (message.type === 'error' && message.id === requestRef.current) {
        setError(message.message || 'Falha ao gerar o diagrama.');
        setBusy(false);
        setStatus('Erro na conversão');
      }
    };
    worker.onerror = (event) => {
      setError(event.message || 'Não foi possível iniciar o motor de diagramas.');
      setBusy(false);
      setStatus('Falha ao iniciar');
    };
    worker.postMessage({ type: 'init' });
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const loadFile = useCallback(async (file) => {
    if (!file) return;
    userEditedRef.current = true;
    pendingRef.current = null;
    const kind = kindFor(file.name);
    if (kind === 'yaml' && !/\.(ya?ml|gv|dot|svg|html?)$/i.test(file.name)) {
      setError('Escolha um projeto WireViz (.yaml/.yml) ou um artefato .gv/.dot/.svg/.html.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Este conversor aceita arquivos de até 10 MB.');
      return;
    }
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error('O arquivo está vazio.');
      setYaml(text);
      setFileName(file.name);
      setFileSize(file.size);
      setInputKind(kind);
      setError('');
      pendingRef.current = { text, name: file.name, kind };
      run(text, file.name, kind);
    } catch (readError) {
      setError(readError.message || 'Não foi possível ler o arquivo.');
    }
  }, [run]);

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
  };

  const previewUrl = useMemo(() => {
    const svg = result?.svg || ((inputKind === 'svg' || inputKind === 'html') ? result?.passthrough : null);
    if (!svg) return '';
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  }, [result, inputKind]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const handleExport = useCallback(async (format) => {
    if (!result) return;
    const svg = result.svg || ((inputKind === 'svg' || inputKind === 'html') ? result.passthrough : '');
    const stem = fileName.replace(/\.[^.]+$/, '') || 'wireviz';
    try {
      setExporting(format);
      setError('');
      if (format === 'dot') {
        const text = result.dot || yaml;
        download(new TextEncoder().encode(text), `${stem}.gv`, 'text/plain;charset=utf-8');
      } else if (format === 'html') {
        if (!svg) throw new Error('Gere um diagrama antes de exportar HTML.');
        download(new TextEncoder().encode(renderHtml(svg, stem)), `${stem}.html`, 'text/html;charset=utf-8');
      } else if (format === 'svg') {
        if (!svg) throw new Error('Gere um diagrama antes de exportar SVG.');
        download(new TextEncoder().encode(svg), `${stem}.svg`, 'image/svg+xml;charset=utf-8');
      } else if (format === 'png') {
        if (!svg) throw new Error('Gere um diagrama antes de exportar PNG.');
        download(await renderPng(svg, pngScale), `${stem}.png`, 'image/png');
      } else if (format === 'pdf') {
        if (!svg) throw new Error('Gere um diagrama antes de exportar PDF.');
        download(await renderPdf(svg), `${stem}.pdf`, 'application/pdf');
      }
    } catch (exportError) {
      setError(`Falha ao exportar ${format.toUpperCase()}: ${exportError.message}`);
    } finally {
      setExporting('');
    }
  }, [fileName, inputKind, pngScale, result, yaml]);

  const lineCount = yaml.split('\n').length;
  const hasSvg = Boolean(result && (result.svg || ((inputKind === 'svg' || inputKind === 'html') && result.passthrough)));

  return (
    <section
      className={`workspace wireviz-workspace ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
      onDrop={handleDrop}
      aria-label="Conversor WireViz"
    >
      <aside className="source-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">PROJETO WIREVIZ</span><h1>Diagrama</h1></div>
          <button className="icon-button" title="Abrir projeto WireViz" onClick={() => inputRef.current?.click()}><Upload size={17} /></button>
          <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(event) => { loadFile(event.target.files?.[0]); event.target.value = ''; }} />
        </div>

        <button className="file-card" onClick={() => inputRef.current?.click()}>
          <span className="file-icon"><FileCode2 size={17} /></span>
          <span className="file-meta"><strong>{fileName}</strong><small>{fileSize ? formatBytes(fileSize) : 'Exemplo integrado · WireViz'}</small></span>
          <Upload className="file-upload-icon" size={15} />
        </button>

        <div className="source-toolbar"><span><FileCode2 size={14} /> {inputKind.toUpperCase()}</span><span>{lineCount} linhas</span></div>
        <div className="code-frame">
          <div className="line-numbers" aria-hidden="true">{Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
          <textarea
            aria-label="Projeto WireViz em YAML"
            spellCheck="false"
            autoCapitalize="off"
            autoComplete="off"
            value={yaml}
            onChange={(event) => {
              const value = event.target.value;
              const name = /\.(ya?ml|gv|dot|svg|html?)$/i.test(fileName)
                ? fileName.replace(/\.[^.]+$/, '.yaml')
                : `${fileName}.yaml`;
              userEditedRef.current = true;
              pendingRef.current = { text: value, name, kind: 'yaml' };
              setYaml(value);
              setInputKind('yaml');
              setFileName(name);
              setResult(null);
            }}
          />
        </div>

        <div className="source-actions">
          <button className="primary-button" onClick={() => run(yaml, fileName, inputKind)} disabled={!ready || busy || !yaml.trim()}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Play size={16} fill="currentColor" />}
            {busy ? 'Gerando…' : 'Gerar diagrama'}
          </button>
          <div className="layout-picker" role="group" aria-label="Layout do diagrama">
            <span>LAYOUT</span>
            <button type="button" className={layoutMode === 'organized' ? 'is-active' : ''} onClick={() => changeLayout('organized')}>Organizado</button>
            <button type="button" className={layoutMode === 'wireviz' ? 'is-active' : ''} onClick={() => changeLayout('wireviz')}>WireViz</button>
          </div>
          <div className="export-scale">
            <span>RESOLUÇÃO PNG</span>
            <select aria-label="Resolução do PNG" value={pngScale} onChange={(event) => setPngScale(Number(event.target.value))}>
              <option value={2}>2×</option>
              <option value={3}>3×</option>
              <option value={4}>4×</option>
            </select>
          </div>
          <p><Check size={13} /> Organizado usa DOT com blocos fixos e preserva todas as ligações do YAML.</p>
        </div>
        <div className="panel-footnote"><span className="footnote-dot" /> Graphviz WASM · conversão local · sem servidor</div>
      </aside>

      <section className="viewer-panel" aria-label="Pré-visualização do diagrama">
        <div className="viewer-toolbar">
          <div className="view-title"><Network size={16} /><span>DIAGRAMA DE LIGAÇÕES</span><i /></div>
          <div className="viewer-actions">
            <button className="tool-button" title="Abrir projeto" onClick={() => inputRef.current?.click()}><Upload size={16} /><span>Abrir</span></button>
            <span className="toolbar-divider" />
            <button className="export-button" title="Baixar DOT" onClick={() => handleExport('dot')} disabled={!result || (!result.dot && inputKind !== 'yaml' && inputKind !== 'dot')}><Download size={15} /><span>DOT</span></button>
            <button className="export-button" title="Baixar SVG" onClick={() => handleExport('svg')} disabled={!hasSvg || Boolean(exporting)}><Download size={15} /><span>SVG</span></button>
            <button className="export-button" title="Baixar PNG" onClick={() => handleExport('png')} disabled={!hasSvg || Boolean(exporting)}>{exporting === 'png' ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}<span>PNG</span></button>
            <button className="export-button export-primary" title="Baixar PDF" onClick={() => handleExport('pdf')} disabled={!hasSvg || Boolean(exporting)}>{exporting === 'pdf' ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}<span>PDF</span></button>
          </div>
        </div>

        <div className="diagram-canvas">
          {previewUrl && <img src={previewUrl} alt="Diagrama de ligações gerado" />}
          {!hasSvg && !busy && !error && (
            <div className="empty-overlay">
              <div className="empty-icon"><FileCode2 size={24} /></div>
              <strong>Seu diagrama aparece aqui</strong>
              <span>Solte um projeto WireViz ou clique em Gerar</span>
              <button onClick={() => inputRef.current?.click()}><Upload size={15} /> Abrir projeto</button>
            </div>
          )}
          {busy && <div className="render-overlay"><LoaderCircle className="spin" size={26} /><strong>Gerando diagrama</strong><span>O Graphviz está desenhando as ligações localmente.</span></div>}
          {dragging && <div className="drop-overlay"><Upload size={26} /><strong>Solte o projeto WireViz</strong><span>YAML, DOT, SVG ou HTML — nada é enviado para a nuvem.</span></div>}
          {stats && <div className="model-chip"><span className="model-chip-dot" /> {stats.connectors} conectores <b>·</b> {stats.cables} cabos <b>·</b> {stats.connections} ligações</div>}
        </div>

        <div className={`console-panel ${error ? 'has-error' : ''}`}>
          <div className="console-heading"><div><span className="console-pulse" /><strong>CONSOLE</strong><small>{error ? 'ERRO' : warnings.length ? `${warnings.length} AVISOS` : 'PRONTO'}</small></div><button className="icon-button small" title="Limpar avisos" onClick={() => { setWarnings([]); setError(''); }}><RotateCcw size={14} /></button></div>
          <div className="console-body" aria-live="polite">
            {error ? <div className="console-error"><AlertCircle size={14} /><span>{error}</span></div>
              : warnings.length ? warnings.slice(-5).map((line, index) => <div className="console-line" key={`${line}-${index}`}><span>!</span>{line}</div>)
                : <div className="console-idle">{ready ? 'Aguardando um projeto. O diagrama será desenhado neste painel.' : 'Inicializando Graphviz WebAssembly…'}</div>}
          </div>
        </div>
      </section>
    </section>
  );
}

