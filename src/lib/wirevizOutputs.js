// Saídas do conversor WireViz. Tudo roda no navegador: nenhum SVG é enviado
// a um servidor e nenhum script contido no SVG é executado.

function decodeEntities(text) {
  return text.replace(/&[a-z]+;/gi, ' ').replace(/&#\d+;/g, ' ');
}

export function sanitizeSvg(svgText) {
  if (typeof svgText !== 'string' || !svgText.trim()) {
    throw new Error('SVG vazio ou inválido.');
  }
  return svgText
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<script\b[^>]*\/?>(?:[\s\S]*?<\/script\s*>)?/gi, '')
    .replace(/<(?:foreignObject|iframe|object|embed|link|meta)\b[^>]*\/?>(?:[\s\S]*?<\/\w+\s*>)?/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*(?:"(?!#|data:image\/)[^"]*"|'(?!#|data:image\/)[^']*'|[^\s>]+)/gi, '')
    .replace(/url\(\s*(['"]?)(?!#|data:image\/)[^)]+\1\s*\)/gi, 'none');
}

export function svgDimensions(svgText) {
  const clean = sanitizeSvg(svgText);
  const root = clean.match(/<svg\b[^>]*>/i)?.[0] || '';
  const viewBox = root.match(/viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i);
  if (viewBox) {
    const width = Number.parseFloat(viewBox[1]);
    const height = Number.parseFloat(viewBox[2]);
    if (width > 0 && height > 0) return { width, height };
  }
  const width = Number.parseFloat(root.match(/\bwidth\s*=\s*["']\s*([\d.]+)/i)?.[1]);
  const height = Number.parseFloat(root.match(/\bheight\s*=\s*["']\s*([\d.]+)/i)?.[1]);
  if (width > 0 && height > 0) return { width, height };
  return { width: 960, height: 640 };
}

function svgToImage(svgText) {
  const clean = sanitizeSvg(svgText);
  const blob = new Blob([clean], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('O navegador não conseguiu ler o SVG gerado.')); };
    image.src = url;
  });
}

export async function renderPng(svgText, scale = 2) {
  const clean = sanitizeSvg(svgText);
  const { width, height } = svgDimensions(clean);
  const image = await svgToImage(clean);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.min(8192, Math.round(width * scale)));
  canvas.height = Math.max(1, Math.min(8192, Math.round(height * scale)));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível codificar o PNG.'));
    }, 'image/png');
  });
}

function bytesToBase64(bytes) {
  const view = new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < view.length; index += chunk) {
    binary += String.fromCharCode(...view.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export async function renderPdf(svgText) {
  const clean = sanitizeSvg(svgText);
  const { width, height } = svgDimensions(clean);
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const doc = new jsPDF({ unit: 'pt', format: [width, height], compress: true });
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, width, height, 'F');
  const parsed = new DOMParser().parseFromString(clean, 'image/svg+xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement.nodeName.toLowerCase() !== 'svg') {
    throw new Error('SVG inválido para conversão vetorial.');
  }
  try {
    await svg2pdf(parsed.documentElement, doc, { x: 0, y: 0, width, height });
  } catch (vectorError) {
    // Diagramas muito grandes podem usar recursos não suportados pelo conversor
    // vetorial. Nesse caso entrega um PDF em raster, com o mesmo conteúdo.
    const png = await renderPng(clean, 2);
    const rasterDoc = new jsPDF({ unit: 'pt', format: [width, height], compress: true });
    rasterDoc.addImage(bytesToBase64(await png.arrayBuffer()), 'PNG', 0, 0, width, height);
    return rasterDoc.output('arraybuffer');
  }
  return doc.output('arraybuffer');
}

export function renderHtml(svgText, title = 'WireViz') {
  const clean = sanitizeSvg(svgText);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${decodeEntities(title).replace(/[<>&"']/g, '')}</title>
<style>body{margin:0;background:#fff;font-family:Arial,sans-serif}main{padding:16px}svg{max-width:100%;height:auto}</style>
</head>
<body><main>${clean}</main></body>
</html>
`;
}
