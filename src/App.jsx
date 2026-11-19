import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Box,
  Check,
  Code2,
  Download,
  FileCode2,
  Grid3X3,
  LoaderCircle,
  Maximize2,
  Play,
  RotateCcw,
  Upload,
} from 'lucide-react';
import ViewerCanvas from './components/ViewerCanvas.jsx';

const SAMPLE_SOURCE = `// SCAD Studio · suporte demonstrativo
$fn = 64;
base_l = 58;
base_w = 42;
base_h = 5;

module rounded_plate(l, w, h, r) {
  hull() {
    for (x = [-l/2 + r, l/2 - r])
      for (y = [-w/2 + r, w/2 - r])
        translate([x, y, 0]) cylinder(h = h, r = r, center = true);
  }
}

difference() {
  union() {
    rounded_plate(base_l, base_w, base_h, 4);
    translate([0, 0, 13]) cylinder(h = 22, d = 30, center = true);
  }
  translate([0, 0, 13]) cylinder(h = 24, d = 17, center = true);
  for (x = [-20, 20])
    for (y = [-12, 12])
      translate([x, y, 0]) cylinder(h = 10, d = 4.5, center = true);
}
`;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function App() {
  const workerRef = useRef(null);
  const inputRef = useRef(null);
  const requestRef = useRef(0);
  const initialRenderRef = useRef(false);
  const [source, setSource] = useState(SAMPLE_SOURCE);
  const [fileName, setFileName] = useState('exemplo-suporte.scad');
  const [fileSize, setFileSize] = useState(0);
  const [wasmReady, setWasmReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Carregando motor 3D');
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);
  const [stlBytes, setStlBytes] = useState(null);
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [fitKey, setFitKey] = useState(0);
  const [dragging, setDragging] = useState(false);

  const renderSource = useCallback((nextSource = source, nextName = fileName) => {
    if (!workerRef.current || !wasmReady || !nextSource.trim()) return;
    const id = ++requestRef.current;
    setBusy(true);
    setError('');
    setLogs([]);
    setStatus('Compilando geometria');
    setStlBytes(null);
    workerRef.current.postMessage({ type: 'render', id, source: nextSource, fileName: nextName });
  }, [fileName, source, wasmReady]);

  useEffect(() => {
    const worker = new Worker(new URL('./workers/scad.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'ready') {
        setWasmReady(true);
        setStatus('Motor pronto');
        if (!initialRenderRef.current) {
          initialRenderRef.current = true;
          const id = ++requestRef.current;
          setBusy(true);
          setStatus('Preparando modelo de exemplo');
          worker.postMessage({ type: 'render', id, source: SAMPLE_SOURCE, fileName: 'exemplo-suporte.scad' });
        }
      } else if (message.type === 'log') {
        setLogs((current) => [...current, message.text].slice(-80));
      } else if (message.type === 'result' && message.id === requestRef.current) {
        setStlBytes(new Uint8Array(message.buffer));
        setBusy(false);
        setStatus('Modelo compilado');
      } else if (message.type === 'error' && message.id === requestRef.current) {
        setError(message.message || 'Falha ao compilar o arquivo.');
        setBusy(false);
        setStatus('Erro de compilação');
      }
    };
    worker.onerror = (event) => {
      setError(event.message || 'Não foi possível iniciar o motor WebAssembly.');
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
    if (!file.name.toLowerCase().endsWith('.scad')) {
      setError('Escolha um arquivo com extensão .scad.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Este visualizador aceita arquivos de até 10 MB.');
      return;
    }
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error('O arquivo está vazio.');
      setSource(text);
      setFileName(file.name);
      setFileSize(file.size);
      setStlBytes(null);
      setLogs([]);
      setError('');
      setStatus('Arquivo carregado — pronto para compilar');
    } catch (readError) {
      setError(readError.message || 'Não foi possível ler o arquivo.');
    }
  }, []);

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
  };

  const handleDownload = () => {
    if (!stlBytes) return;
    const blob = new Blob([stlBytes], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${fileName.replace(/\.scad$/i, '') || 'modelo'}.stl`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const lineCount = source.split('\n').length;
  const statusClass = error ? 'status-error' : busy ? 'status-busy' : stlBytes ? 'status-ok' : '';

  return (
    <main className={`app-shell ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={handleDrop}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div className="brand-copy"><strong>SCAD<span>STUDIO</span></strong><small>OPENSCAD · WEB VIEWER</small></div>
        </div>
        <div className="topbar-center"><span className="runtime-indicator" />{wasmReady ? 'RENDER LOCAL · WASM' : 'INICIANDO MOTOR'}</div>
        <div className={`status-pill ${statusClass}`}><span className="status-dot" />{status}</div>
      </header>

      <section className="workspace">
        <aside className="source-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">ARQUIVO DE ORIGEM</span><h1>Projeto</h1></div>
            <button className="icon-button" title="Abrir arquivo .scad" onClick={() => inputRef.current?.click()}><Upload size={17} /></button>
            <input ref={inputRef} type="file" accept=".scad,text/plain" hidden onChange={(event) => { loadFile(event.target.files?.[0]); event.target.value = ''; }} />
          </div>

          <button className="file-card" onClick={() => inputRef.current?.click()}>
            <span className="file-icon"><FileCode2 size={17} /></span>
            <span className="file-meta"><strong>{fileName}</strong><small>{fileSize ? formatBytes(fileSize) : 'Exemplo integrado · OpenSCAD'}</small></span>
            <Upload className="file-upload-icon" size={15} />
          </button>

          <div className="source-toolbar"><span><Code2 size={14} /> SCAD</span><span>{lineCount} linhas</span></div>
          <div className="code-frame">
            <div className="line-numbers" aria-hidden="true">{Array.from({ length: lineCount }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
            <textarea
              aria-label="Código OpenSCAD"
              spellCheck="false"
              autoCapitalize="off"
              autoComplete="off"
              value={source}
              onChange={(event) => { setSource(event.target.value); setStlBytes(null); }}
            />
          </div>

          <div className="source-actions">
            <button className="primary-button" onClick={() => renderSource()} disabled={!wasmReady || busy || !source.trim()}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <Play size={16} fill="currentColor" />}
              {busy ? 'Compilando…' : 'Renderizar modelo'}
            </button>
            <p><Check size={13} /> Seu arquivo permanece neste dispositivo.</p>
          </div>
          <div className="panel-footnote"><span className="footnote-dot" /> OpenSCAD WASM experimental · sem Preview ou fontes</div>
        </aside>

        <section className="viewer-panel" aria-label="Visualizador 3D">
          <div className="viewer-toolbar">
            <div className="view-title"><Box size={16} /><span>VISUALIZAÇÃO 3D</span><i /></div>
            <div className="viewer-actions">
              <button className={`tool-button ${showGrid ? 'active' : ''}`} title="Alternar grade" onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={16} /><span>Grade</span></button>
              <button className={`tool-button ${wireframe ? 'active' : ''}`} title="Alternar wireframe" onClick={() => setWireframe((value) => !value)}><Code2 size={16} /><span>Wireframe</span></button>
              <span className="toolbar-divider" />
              <button className="tool-button" title="Ajustar modelo à vista" onClick={() => setFitKey((value) => value + 1)}><Maximize2 size={16} /><span>Ajustar</span></button>
              <button className="tool-button" title="Carregar outro .scad" onClick={() => inputRef.current?.click()}><Upload size={16} /><span>Abrir</span></button>
              <button className="export-button" title="Baixar STL" onClick={handleDownload} disabled={!stlBytes || busy}><Download size={15} /><span>STL</span></button>
            </div>
          </div>

          <div className="viewport-wrap">
            <ViewerCanvas stlBytes={stlBytes} wireframe={wireframe} showGrid={showGrid} fitKey={fitKey} />
            {!stlBytes && !busy && !error && (
              <div className="empty-overlay">
                <div className="empty-icon"><Box size={24} /></div>
                <strong>Seu próximo modelo começa aqui</strong>
                <span>Solte um arquivo .scad ou abra um projeto</span>
                <button onClick={() => inputRef.current?.click()}><Upload size={15} /> Abrir arquivo</button>
              </div>
            )}
            {busy && (
              <div className="render-overlay"><LoaderCircle className="spin" size={26} /><strong>Renderizando geometria</strong><span>O OpenSCAD está trabalhando localmente.</span></div>
            )}
            {dragging && <div className="drop-overlay"><Upload size={26} /><strong>Solte o arquivo .scad</strong><span>O código não será enviado para a nuvem.</span></div>}
            <div className="viewport-hint"><span><i className="hint-orbit" /> Arrastar · orbitar</span><span><i className="hint-zoom" /> Scroll · zoom</span><span><i className="hint-pan" /> Botão direito · mover</span></div>
            {stlBytes && <div className="model-chip"><span className="model-chip-dot" /> MODELO ATIVO <b>·</b> STL {formatBytes(stlBytes.byteLength)}</div>}
          </div>

          <div className={`console-panel ${error ? 'has-error' : ''}`}>
            <div className="console-heading"><div><span className="console-pulse" /><strong>CONSOLE</strong><small>{error ? 'ERRO' : logs.length ? `${logs.length} SAÍDAS` : 'PRONTO'}</small></div><button className="icon-button small" title="Limpar console" onClick={() => { setLogs([]); setError(''); }}><RotateCcw size={14} /></button></div>
            <div className="console-body" aria-live="polite">
              {error ? <div className="console-error"><AlertCircle size={14} /><span>{error}</span></div> : logs.length ? logs.slice(-5).map((line, index) => <div className="console-line" key={`${line}-${index}`}><span>›</span>{line}</div>) : <div className="console-idle">{wasmReady ? 'Aguardando uma compilação. A geometria será exibida neste visor.' : 'Inicializando runtime WebAssembly do OpenSCAD…'}</div>}
            </div>
          </div>
        </section>
      </section>

      <footer className="app-footer"><span>SCAD STUDIO <b>·</b> BUILD 01</span><span><i /> COMPILAÇÃO NO NAVEGADOR</span><a href="/LICENSE" target="_blank" rel="noreferrer">GPL-2 · sem garantia</a><a href="https://openscad.org/downloads.html" target="_blank" rel="noreferrer">OpenSCAD WASM experimental</a></footer>
    </main>
  );
}
