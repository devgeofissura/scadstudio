# Plano — SCAD Studio

## Objetivo e abordagem

Criar uma aplicação JavaScript estática, pronta para ser importada na Vercel, para abrir arquivos `.scad`, compilá-los localmente no navegador e visualizar o resultado em 3D interativo. O motor será o build WebAssembly oficial experimental do OpenSCAD, versão snapshot 2026.11.18. Um Web Worker executará o CLI do OpenSCAD, escreverá o código em seu sistema de arquivos virtual e exportará STL; o cliente carregará esse STL com Three.js. Assim, não há API, armazenamento remoto ou processamento do arquivo pelo servidor. O build oficial declara suporte experimental e ausência de preview, fontes e GUI; importações de arquivos auxiliares não serão garantidas nesta primeira versão.

A aplicação será React + Vite, com build estático (`dist/`) e configuração de rewrite SPA para Vercel. Dependências de runtime: `three`, React e `lucide-react`; ferramenta de build: Vite. O módulo WASM e o respectivo glue JS ficarão servidos na mesma origem, em `public/vendor/openscad/`, evitando chamadas a serviços de terceiros durante o uso. A distribuição incorporará os avisos e o texto da GPL-2.0 do OpenSCAD.

## Estrutura do projeto

- `src/App.jsx`: interface, seleção/soltura do arquivo, editor simples, estado de renderização e mensagens.
- `src/components/ViewerCanvas.jsx`: cena Three.js, grade, eixos, controles orbitais, ajuste ao modelo e modo wireframe.
- `src/workers/scad.worker.js`: inicialização do OpenSCAD WASM, compilação para STL no FS virtual e retorno do binário.
- `src/vendor/openscad.js`: glue ESM oficial importado pelo Worker.
- `public/vendor/openscad/openscad.wasm`: motor OpenSCAD WASM oficial.
- `public/examples/`: modelo demonstrativo carregado inicialmente.
- `public/manus-routes.json`: declaração da rota raiz para inspeção automática.
- `docs/`: referências técnicas e instruções de implantação.

## Design

Estilos alternativos considerados: brutalismo editorial de bancada — 0,07; estação de CAD escura e instrumental — 0,06; atelier claro com papel técnico — 0,04. Escolha: estação de CAD escura e instrumental.

- **Movimento de design:** workstation CAD industrial contemporânea, com hierarquia inspirada em instrumentos de medição.
- **Princípios centrais:** o modelo ocupa o primeiro plano; controles são explícitos; estado de compilação é sempre legível; o arquivo permanece local.
- **Filosofia de cor:** carvão e azul-petróleo reduzem distração, ciano marca geometria/seleção e âmbar sinaliza ação e atividade.
- **Paradigma de layout:** bancada dividida em uma faixa compacta de arquivo/código e uma área ampla de inspeção 3D, com painel de console recolhível/visível abaixo.
- **Elementos de assinatura:** grade técnica discreta no plano XY; marca linear de eixos; chip de status com ponto luminoso.
- **Filosofia de interação:** arrastar arquivo para abrir; compilar por ação deliberada; orbitar, aproximar e deslocar naturalmente; botão de ajuste reencaixa o modelo.
- **Animação:** transições curtas de 140–200 ms; sem animação contínua decorativa; indicadores de progresso simples durante a compilação.
- **Tipografia:** Manrope para interface e IBM Plex Mono para código, métricas e console; hierarquia compacta com títulos médios e rótulos técnicos em caixa alta.
- **Essência da marca:** uma bancada web rápida para inspecionar modelos OpenSCAD sem instalar o desktop; personalidade precisa, direta e técnica.
- **Voz da marca:** instruções curtas e objetivas. Exemplos: “Solte um arquivo .scad para iniciar.” e “O modelo é compilado neste navegador.”
- **Wordmark e símbolo:** “SCAD” em peso forte com um contorno cúbico/axonométrico traçado ao lado; evitar ícones CAD genéricos sem significado.
- **Cor proprietária:** ciano elétrico `#51D8E8`, reservado para geometria, foco e controles primários.

## Fora do escopo inicial

Login, biblioteca em nuvem, colaboração, renderização do Preview OpenSCAD em tempo real, resolução automática de `include/use/import` externos e deploy em uma conta Vercel do usuário. A entrega inclui código e instruções para importar/deploy, não uma publicação não autorizada.
