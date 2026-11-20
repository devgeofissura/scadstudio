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

Clique em **WireViz** na barra superior. A aba abre um projeto de exemplo; você pode abrir ou arrastar um `.yaml`/`.yml` no formato [WireViz](https://github.com/wireviz/WireViz), um `.gv`/`.dot` já gerado, ou um `.svg`/`.html`. Clique em **Gerar diagrama** para converter o YAML em Graphviz DOT e renderizar o SVG com Graphviz compilado para WebAssembly. Use os botões **DOT**, **SVG**, **PNG** e **PDF** para baixar as saídas.

O seletor **LAYOUT** controla o DOT gerado:

- **Organizado** (padrão): blocos compactos em posições previsíveis — controladora à esquerda, conversor ao centro, driver e motor à direita, fontes abaixo e um único ponto de GND. Legenda de cores e quadro de avisos em nós separados. Pontos sem ligação (`ENA+`/`ENA-`, por exemplo) e `loops` internos aparecem como stubs explícitos. Nenhuma ligação do YAML é inventada ou omitida.
- **WireViz**: mantém o conversor compatível anterior, com nós de cabo entre os conectores.

O YAML continua sendo apenas a fonte técnica de terminais e conexões; o layout visual é definido pelo DOT. O seletor **RESOLUÇÃO PNG** escolhe 2×, 3× ou 4× antes de exportar. Tudo continua local: sem servidor, telemetria, chamada de rede de terceiros ou execução de scripts vindos do arquivo. O YAML é analisado com parser de esquema restrito e o SVG é higienizado antes da conversão para PDF/PNG. Limite: 10 MB por arquivo.

Verificação local dos conversores (sem navegador):

```bash
node scripts/check-wireviz-schematic.mjs <arquivo.yaml> [outro.yaml ...]
node scripts/check-wireviz-dot.mjs [pastaDeYAMLs] [pastaDeGVs]
node scripts/check-wireviz-render.mjs public/examples/exemplo-wireviz.yaml
```

O primeiro valida o modo organizado ponta a ponta: YAML → DOT → SVG, contagem de arestas, terminais isolados, `loops`, legenda, avisos e auditoria de conexões. O segundo compara o modo WireViz clássico contra `.gv` gerados pelo WireViz 0.4.1 (padrão: `%TEMP%/opencode/wireviz-gv`); sem `.gv` correspondente ele marca `SKIP`. O terceiro valida o pipeline YAML → DOT → SVG do modo clássico.

## Licença e atribuição

O projeto é distribuído sob GNU GPL versão 2. O motor incluído é o build WebAssembly experimental oficial do OpenSCAD, snapshot 2026.11.18. `LICENSE` contém o texto da GPL v2 e `LICENSES/OPENSCAD-WASM-COPYING` registra os termos upstream do port, inclusive a exceção indicada pelos mantenedores. O código-fonte e as instruções estão em [openscad/openscad](https://github.com/openscad/openscad) e [DSchroer/openscad-wasm](https://github.com/DSchroer/openscad-wasm); as informações do build estão na [página oficial de downloads](https://openscad.org/downloads.html).

SCAD Studio não é afiliado nem endossado pelos mantenedores do OpenSCAD.
