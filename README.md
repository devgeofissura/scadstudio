# SCAD Studio

Aplicação JavaScript com duas ferramentas locais: **SCAD 3D** (abre `.scad`, compila a geometria no navegador e inspeciona em 3D com Three.js) e **WireViz** (importa projetos YAML e gera diagramas de ligações em PDF, SVG, PNG, DOT e HTML). Os arquivos nunca são enviados a um backend.

## Executar localmente

Requer Node.js 20 ou superior. Na pasta do projeto:

```bash
npm install
npm run dev
```

Para verificar o build de produção:

```bash
npm run build
npm run preview
```

O OpenSCAD WebAssembly oficial está em `public/vendor/openscad/`. O motor tem cerca de 11 MB descompactado. Um Web Worker chama o CLI do OpenSCAD para exportar STL no filesystem virtual.

## Publicar na Vercel

1. Coloque esta pasta em um repositório Git seu e importe-o no painel da Vercel.
2. Deixe a detecção de Vite ativa. O `vercel.json` já define `npm run build` e `dist`.
3. Use Node.js 20 ou superior e clique em **Deploy**. A aplicação é estática; não precisa de variáveis de ambiente, banco de dados nem funções serverless.

Também é possível executar pela CLI da Vercel após autenticar sua própria conta:

```bash
npm install
npx vercel
npx vercel --prod
```

Esta entrega não faz deploy na conta do usuário. Os comandos acima publicam no projeto da conta Vercel que os executar.

## Uso

A página abre um suporte de demonstração. Clique em **Abrir** ou arraste um arquivo `.scad` para o visor. Edite o código se quiser e clique em **Renderizar modelo**. Arraste com o botão esquerdo para orbitar, use a roda para zoom e o botão direito para mover. **Ajustar** reenquadra o modelo; **Grade** e **Wireframe** mudam a visualização; **STL** baixa o resultado compilado.

O upload é limitado a 10 MB. Um `.scad` que dependa de assets locais, fontes ou bibliotecas externas pode falhar, pois esses arquivos não são importados automaticamente. O build WebAssembly oficial é experimental e não oferece Preview nem fontes, e pode ser mais lento do que o aplicativo desktop. Para fabricação, confira modelos complexos no OpenSCAD desktop.

### Aba WireViz

Clique em **WireViz** na barra superior. A aba abre um projeto de exemplo; você pode abrir ou arrastar um `.yaml`/`.yml` no formato [WireViz](https://github.com/wireviz/WireViz), um `.gv`/`.dot` já gerado, ou um `.svg`/`.html`. Clique em **Gerar diagrama** para desenhar o grafo com Graphviz compilado para WebAssembly e use os botões **DOT**, **SVG**, **PNG** e **PDF** para baixar as saídas.

O conversor YAML→DOT é uma implementação independente e compatível com o esquema usado pelo WireViz 0.4.1 (`connectors`, `cables`, `connections`, `loops`, `colors`, `wirelabels`). Não há servidor, telemetria, chamada de rede de terceiros nem execução de scripts vindos do arquivo. O YAML é analisado com um parser de esquema restrito; SVG gerado é higienizado antes da conversão para PDF/PNG. Limite: 10 MB por arquivo.

Verificação local dos conversores (sem navegador):

```bash
node scripts/check-wireviz-dot.mjs [pastaDeYAMLs] [pastaDeGVs]
node scripts/check-wireviz-render.mjs public/examples/exemplo-wireviz.yaml
```

O primeiro script compara nomes de nós, arestas, pinos e linhas de cor contra `.gv` gerados pelo WireViz 0.4.1 (padrão: `%TEMP%/opencode/wireviz-gv`). Sem .gv correspondente ele marca `SKIP` em vez de falhar; o segundo valida o pipeline YAML → DOT → SVG.

## Licença e atribuição

O projeto é distribuído sob GNU GPL versão 2. O motor incluído é o build WebAssembly experimental oficial do OpenSCAD, snapshot 2026.11.18. `LICENSE` contém o texto da GPL v2 e `LICENSES/OPENSCAD-WASM-COPYING` registra os termos upstream do port, inclusive a exceção indicada pelos mantenedores. O código-fonte e as instruções estão em [openscad/openscad](https://github.com/openscad/openscad) e [DSchroer/openscad-wasm](https://github.com/DSchroer/openscad-wasm); as informações do build estão na [página oficial de downloads](https://openscad.org/downloads.html).

SCAD Studio não é afiliado nem endossado pelos mantenedores do OpenSCAD.
