# Avisos de terceiros

## OpenSCAD WebAssembly

O diretório `public/vendor/openscad/` contém o build WebAssembly oficial experimental OpenSCAD snapshot 2026.11.18 (`openscad.js` e `openscad.wasm`). O módulo ESM importável por Web Worker está em `src/vendor/openscad.js`. O código OpenSCAD está licenciado sob GNU GPL versão 2, com a exceção especial presente no arquivo oficial `COPYING`; o texto GPL versão 2 está incluído em `LICENSE`.

O código-fonte do OpenSCAD está disponível em https://github.com/openscad/openscad e as instruções/port WASM estão em https://github.com/DSchroer/openscad-wasm. O README do port descreve a API ESM, o filesystem virtual e a invocação do CLI. A versão WebAssembly experimental pode ser obtida a partir da página oficial de downloads em https://openscad.org/downloads.html. Consulte esses projetos para obter o código-fonte correspondente e os scripts de construção conforme a GPL.

As alterações feitas neste projeto consistem na integração do módulo via Web Worker e na interface de visualização; o motor original não foi modificado. OpenSCAD é um projeto de software livre independente. SCAD Studio não é afiliado nem endossado pelos mantenedores do OpenSCAD.
