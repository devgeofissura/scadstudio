import OpenSCAD from '../vendor/openscad.js';

let runtimePromise;
let compileIndex = 0;

function emitLog(text) {
  const raw = String(text ?? '').trim();
  if (raw.includes('Could not initialize localization')) return;
  const clean = raw;
  if (clean) self.postMessage({ type: 'log', text: clean });
}

async function getRuntime() {
  if (!runtimePromise) {
    const wasmDirectory = new URL(`${import.meta.env.BASE_URL}vendor/openscad/`, self.location.origin).href;
    runtimePromise = OpenSCAD({
      noInitialRun: true,
      noExitRuntime: true,
      thisProgram: '/workspace/openscad',
      locateFile: (path) => new URL(path, wasmDirectory).href,
      print: emitLog,
      printErr: emitLog,
    }).then((module) => {
      module.FS.mkdir('/workspace');
      module.FS.chdir('/workspace');
      return module;
    });
  }
  return runtimePromise;
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message.type === 'init') {
    try {
      await getRuntime();
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', id: 0, message: error?.message || 'Falha ao carregar OpenSCAD WASM.' });
    }
    return;
  }

  if (message.type !== 'render') return;
  const { id, source, fileName } = message;
  const safeName = String(fileName || 'modelo.scad').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.scad$/i, '') || 'modelo';
  const stem = `${safeName}-${++compileIndex}`;
  const inputPath = `/workspace/${stem}.scad`;
  const outputPath = `/workspace/${stem}.stl`;
  try {
    const module = await getRuntime();
    module.FS.writeFile(inputPath, source);
    try {
      module.callMain([inputPath, '-o', outputPath]);
    } catch (error) {
      if (!(error && error.name === 'ExitStatus' && error.status === 0)) throw error;
    }
    const file = module.FS.readFile(outputPath);
    const transferable = new Uint8Array(file.byteLength);
    transferable.set(file);
    self.postMessage({ type: 'result', id, buffer: transferable.buffer }, [transferable.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error?.message || 'OpenSCAD não conseguiu compilar este arquivo.' });
  } finally {
    try {
      const module = await getRuntime();
      if (module.FS.analyzePath(inputPath).exists) module.FS.unlink(inputPath);
      if (module.FS.analyzePath(outputPath).exists) module.FS.unlink(outputPath);
    } catch {
      // O erro original já foi enviado à interface.
    }
  }
};
