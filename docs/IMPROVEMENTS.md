# Melhorias possíveis — SCAD Studio

> Documento de brainstorming, não é um plano de execução. Serve como cardápio de
> opções: escolha os itens desejados e depois transformamos isso em um plano com
> tarefas e critérios de aceite.
>
> Versão 0.1 · 19/11/2026

## 1. Objetivo

Tornar o SCAD Studio mais confiável, rápido e agradável **sem quebrar a premissa
central**: o arquivo do usuário é compilado no navegador, sem backend, e o site
continua sendo estático na Vercel.

## 2. Contexto e restrições

### Estado atual

- React 18 + Vite 6 + Three.js + Web Worker + OpenSCAD WASM experimental.
- O WASM (~11 MB) e o glue são servidos de `public/vendor/openscad/`.
- Fluxo: escrever `.scad` no FS virtual → `callMain([... '-o', ...stl])` →
  ler STL → `STLLoader` → cena Three.js.
- Já existe layout responsivo, Console, grade, eixos, wireframe, ajuste de câmera
  e download de STL.
- Build de produção validado localmente e publicado na Vercel.

### Restrições duras (não negociáveis)

- Manter a compilação **local**, sem envio do código a servidor ou telemetria.
- Manter o deploy estático e o custo zero (plano Hobby da Vercel).
- Preservar a licença GPL-2 e a atribuição do OpenSCAD.
- Respeitar as limitações do build WASM oficial: sem Preview, sem fontes, sem
  GUI e sem garantia de `include`/`use`/`import` externos.

### Restrições suaves

- Não inflar o bundle inicial nem o tamanho do WASM.
- Funcionar bem em celular (375 px) e desktop (1440 px).
- Preferir mudanças pequenas e reversíveis a reescritas.

## 3. Diagnóstico rápido

Pontos observados no código atual que orientam as prioridades abaixo:

- `worker.onerror` envia erro sem `id`, mas `App.jsx` só aceita mensagens de erro
  com `id === requestRef.current` — uma falha de inicialização pode ficar invisível.
- Logs do worker são globais, sem `id` da requisição; compilações seguidas podem
  misturar mensagens no Console.
- Os números de linha do editor usam `overflow: hidden` enquanto o `textarea` rola
  (`overflow: auto`): em arquivos longos, a numeração desalinha.
- O `requestAnimationFrame` renderiza a cena em 60 fps continuamente, mesmo com a
  câmera parada.
- `@import` de Google Fonts em `styles.css` gera requisição externa, em tensão com
  a promessa de processamento local e com uma CSP restritiva.
- Não há regras `:focus-visible` nem `@media (prefers-reduced-motion)`.
- No breakpoint de 620 px, os botões da barra têm 29 px (alvo recomendado: 44 px)
  e o status vira apenas um ponto colorido (`font-size: 0`).
- O glue `openscad.js` existe duplicado em `src/vendor/` e `public/vendor/`.
- `Cache-Control` do WASM é de 1 dia (`vercel.json`), conservador para um arquivo
  imutável de 11 MB.
- Não há testes automatizados nem CI no repositório.

## 4. Cardápio de melhorias

Legenda de prioridade: **P0** = corrigir/fortalecer o básico; **P1** = ganho claro
de uso; **P2** = diferencial ou investigação maior.

### 4.1 Confiabilidade e compilação

| # | Melhoria | Impacto | Esforço | Prioridade |
|---|----------|---------|---------|------------|
| 1 | Corrigir propagação de erro do worker (`id` no `onerror`, erro de init e `ExitStatus`) com mensagem legível na UI | Alto | Baixo | P0 |
| 2 | Incluir `id` da requisição nos logs e descartar logs de compilações antigas | Médio | Baixo | P0 |
| 3 | Extrair do stdout/stderr do OpenSCAD a linha do erro e destacá-la no editor | Alto | Médio | P1 |
| 4 | Cache por hash do código-fonte: recompilar só quando o texto mudar | Médio | Médio | P1 |
| 5 | Renderização automática opcional com debounce (além do botão deliberado) | Médio | Baixo | P1 |
| 6 | Timeout de compilação, botão cancelar e progresso do download do WASM via `fetch` com stream | Médio | Médio | P1 |
| 7 | Verificar tamanho do STL e memória antes de parsear, com erro amigável para modelos gigantes | Médio | Baixo | P2 |

### 4.2 Arquivos e compatibilidade

| # | Melhoria | Impacto | Esforço | Prioridade |
|---|----------|---------|---------|------------|
| 8 | Aceitar vários arquivos e montar o FS virtual com caminhos relativos (`include`, `use`, `import`) | Alto | Alto | P1 |
| 9 | Arrastar pasta/com múltiplos arquivos preservando a estrutura de diretórios | Médio | Alto | P2 |
| 10 | Incluir um pacote de bibliotecas comuns (ex.: MCAD) acessível no FS virtual | Médio | Médio | P2 |
| 11 | Detectar `text()` e avisar que fontes não existem neste build WASM | Médio | Baixo | P1 |
| 12 | Testar exportação `3MF`/`AMF`/`OBJ` para preservar cor de múltiplos objetos | Alto | Médio | P2 |

### 4.3 Editor de código

| # | Melhoria | Impacto | Esforço | Prioridade |
|---|----------|---------|---------|------------|
| 13 | Substituir o `textarea` por CodeMirror 6 com syntax highlight, autocomplete e indentação OpenSCAD | Alto | Médio | P1 |
| 14 | Corrigir o desalinhamento dos números de linha (ou embuti-los no editor) | Médio | Baixo | P0 |
| 15 | Atalhos: `Ctrl/Cmd+Enter` compilar, `Ctrl/Cmd+O` abrir, `Ctrl/Cmd+S` salvar `.scad` | Médio | Baixo | P1 |
| 16 | Divisor redimensionável entre editor e visor; botão de maximizar o editor | Médio | Médio | P2 |
| 17 | Rascunho local em `localStorage` e histórico simples de versões | Médio | Médio | P2 |

### 4.4 Visualizador 3D

| # | Melhoria | Impacto | Esforço | Prioridade |
|---|----------|---------|---------|------------|
| 18 | Render sob demanda (invalidar só quando câmera/cena muda) em vez de 60 fps contínuos | Alto (bateria/CPU) | Baixo | P0 |
| 19 | Presets de câmera (topo/frente/direita/isométrica), gizmo de eixos e transição suave no "Ajustar" | Médio | Médio | P1 |
| 20 | Preservar a câmera entre compilações em vez de reenquadrar sempre | Médio | Baixo | P1 |
| 21 | Medição de distâncias, caixa envoltória e dimensões em mm (grade em escala real) | Alto | Médio | P1 |
| 22 | Plano de corte (clipping) para inspecionar interiores; modos sólido/transparente | Alto | Médio | P2 |
| 23 | Seleção de face/triângulo com coordenadas e exportação PNG do viewport | Médio | Médio | P2 |
| 24 | Estatísticas do modelo: triângulos, tempo de compilação e bounding box | Médio | Baixo | P1 |
| 25 | Sombras e oclusão ambiente (SSAO) — avaliar custo GPU antes de adotar | Médio | Alto | P2 |

### 4.5 UX, acessibilidade e responsividade

| # | Melhoria | Impacto | Esforço | Prioridade |
|---|----------|---------|---------|------------|
| 26 | `:focus-visible` visível em todos os controles e `aria-label` nos botões-só-ícone | Alto | Baixo | P0 |
| 27 | `role="alert"` no erro de compilação; anúncio de início/fim da compilação para leitores de tela | Alto | Baixo | P0 |
| 28 | Respeitar `prefers-reduced-motion` (parar spinner/pulso/transições) | Médio | Baixo | P0 |
| 29 | Mobile: alvos de toque ≥ 44 px e status com texto, não apenas cor | Alto | Baixo | P1 |
| 30 | Tema claro opcional ("papel técnico"), já considerado no `plan.md` | Médio | Médio | P2 |
| 31 | Galeria de exemplos e onboarding com primeiros passos | Médio | Médio | P2 |
| 32 | Console filtrável, expansível e com botão "copiar tudo" | Médio | Médio | P2 |
| 33 | Toasts discretos para arquivo carregado, STL baixado e erro de leitura | Baixo | Baixo | P2 |

### 4.6 Performance, cache e privacidade

| # | Melhoria | Impacto | Esforço | Prioridade |
|---|----------|---------|---------|------------|
| 34 | Self-host das fontes (remover `@import` do Google): zero chamada externa, CSP estrita e funcionamento offline | Alto | Baixo | P0 |
| 35 | `Cache-Control` imutável para `/vendor/openscad/*` com versão no caminho ou query string | Médio | Baixo | P0 |
| 36 | Lazy-load do Three.js via `import()` dinâmico para acelerar o primeiro pint | Médio | Baixo | P1 |
| 37 | Service worker/PWA para cache offline da UI e do motor WASM | Médio | Médio | P2 |
| 38 | Remover a cópia redundante de `openscad.js` em `public/` | Baixo | Baixo | P1 |
| 39 | Orçamento de performance + Vercel Speed Insights / Web Vitals | Médio | Baixo | P1 |
| 40 | CSP em `vercel.json` e auditoria de rede para confirmar "nenhuma requisição a terceiros" | Alto | Médio | P1 |

### 4.7 Engenharia e documentação

| # | Melhoria | Impacto | Esforço | Prioridade |
|---|----------|---------|---------|------------|
| 41 | Testes do worker (mock do FS) e teste e2e Playwright: abrir → compilar → baixar STL | Alto | Médio | P1 |
| 42 | GitHub Actions: `npm ci`, `npm run build`, lint e testes a cada push | Alto | Baixo | P1 |
| 43 | ESLint + Prettier e migração gradual para TypeScript | Médio | Médio | P2 |
| 44 | Monitoramento de erros do cliente sem telemetria do código do usuário | Médio | Médio | P2 |
| 45 | Páginas de Troubleshooting, arquitetura e limitações do WASM | Médio | Baixo | P1 |

### 4.8 Diferenciais (P2)

| # | Melhoria | Impacto | Esforço | Prioridade |
|---|----------|---------|---------|------------|
| 46 | Customizer: detectar `// [min:step:max]` e gerar sliders que recompilam | Alto | Alto | P2 |
| 47 | Comparação lado a lado de duas versões do mesmo modelo | Médio | Alto | P2 |
| 48 | Compartilhamento por URL com o código no fragmento (somente opt-in explícito) | Médio | Médio | P2 |
| 49 | Modo lote: fila de vários `.scad` com exportação ZIP de STLs | Médio | Alto | P2 |

## 5. Recomendação

**Começar por um "Iteração 1 — fundação confiável"**, reunindo os itens de
maior retorno com esforço baixo:

1. Itens **1, 2, 14** — erros e logs corretos, editor alinhado.
2. Itens **18, 26, 27, 28** — render sob demanda e acessibilidade básica.
3. Itens **34, 35** — fontes locais e cache do WASM (privacidade e velocidade).
4. Itens **41, 42** — testes e CI para travar o que foi conquistado.

Em seguida, a Iteração 2 atacaria o editor (13, 15), as ferramentas de inspeção
(19–21, 24) e o suporte a `include`/`use` (8, 11). Os itens P2 ficam para depois
de validar a demanda real.

Justificativa: o produto já entrega a proposta central; o maior risco hoje não é
faltar recurso, e sim **falhas silenciosas, dependência externa de fontes e
acessibilidade insuficiente**. Corrigir isso aumenta a confiança sem mudar a
arquitetura nem o custo.

## 6. Perguntas em aberto

| Pergunta | Como responder |
|----------|----------------|
| O CLI WASM aceita `-o saida.3mf` / `.amf` / `.obj`? | Teste rápido com o mesmo cubo usado em `docs/TECHNICAL_NOTES.md` |
| Os erros do OpenSCAD no WASM trazem número de linha? | Capturar `printErr` de um SCAD com erro proposital |
| Qual STL o navegador aguenta antes de travar? | Gerar modelo com milhões de triângulos e medir |
| A Vercel já comprime (Brotli) o `.wasm`? | Inspecionar `Content-Encoding` no deploy publicado |
| Vale oferecer suporte offline/PWA? | Decisão de produto — perguntar aos usuários |
| O tema claro é desejado ou o dark é identidade fixa? | Decisão de produto |
| Há interesse real em Customizer? | Decisão de produto; influencia o item 46 |

## 7. Critérios de sucesso sugeridos

- Nenhuma falha de compilação termina sem mensagem útil na interface.
- Zero requisições a domínios de terceiros (validado na aba Network e com CSP).
- Carregamento inicial < 2 s em conexão rápida; progresso visível durante o WASM.
- 100% dos controles com nome acessível e foco visível; navegação completa por teclado.
- Build e testes verdes no CI a cada push em `main`.
- Sem regressão da promessa central: o arquivo nunca sai do dispositivo.
