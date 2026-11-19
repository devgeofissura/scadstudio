# Notas técnicas e fontes

Verificado em 19/11/2026.

O site oficial do OpenSCAD oferece um pacote experimental WebAssembly para navegador. A listagem do snapshot `OpenSCAD-2026.11.18-WebAssembly-web.zip` informa que é um build experimental, que ainda não oferece Preview, fontes nem GUI e aponta o repositório `DSchroer/openscad-wasm` para instruções de build. O pacote ZIP oficial foi baixado e contém `openscad.js` e `openscad.wasm`; o WASM descompactado mede cerca de 11 MB. [1]

O README do port `openscad-wasm` mostra como importar o módulo ESM, gravar arquivos no `FS`, chamar o CLI com `callMain` e ler a saída STL do filesystem virtual. A integração do projeto foi confirmada por teste local com exportação de um cubo SCAD para STL. [2]

O OpenSCAD Playground é uma aplicação de navegador baseada em um build headless do OpenSCAD em WASM. Sua documentação descreve a compilação no cliente e uma interface web de visualização, corroborando a viabilidade da arquitetura sem servidor de renderização. [3]

O OpenSCAD distribui seu código sob GPL versão 2, com exceção especial indicada no arquivo de licença. O projeto inclui o texto GPL-2, aviso de atribuição e links para o código-fonte oficial. [4]

Limitações herdadas do build oficial: sem Preview, fontes ou GUI; a experiência pode ser mais lenta do que o aplicativo desktop. Referências a assets/includes que não foram carregados para o sistema virtual podem falhar. Como a versão WASM atual é experimental, modelos com recursos avançados devem ser conferidos no OpenSCAD desktop antes de uso de fabricação.

## Referências

[1]: https://openscad.org/downloads.html "OpenSCAD Downloads e builds WebAssembly"
[2]: https://github.com/DSchroer/openscad-wasm "OpenSCAD WASM Port"
[3]: https://github.com/openscad/openscad-playground "OpenSCAD Playground"
[4]: https://github.com/openscad/openscad/blob/master/COPYING "Licença OpenSCAD COPYING"
