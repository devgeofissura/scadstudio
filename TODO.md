# TODO — critérios de entrega

- [x] **Abrir arquivos SCAD:** o usuário consegue selecionar ou arrastar um arquivo `.scad`; o nome é exibido e o código é carregado no painel. Arquivos inválidos ou vazios geram uma mensagem compreensível.
- [x] **Compilar no navegador:** a aplicação usa o OpenSCAD WebAssembly para produzir a geometria no próprio dispositivo, sem enviar o arquivo a um serviço remoto; erros de compilação são apresentados no console da interface.
- [x] **Inspecionar o modelo em 3D:** a geometria aparece em um visor com órbita, zoom e pan; existem ações para enquadrar o modelo e alternar grade e wireframe.
- [x] **Entregar para Vercel:** o projeto tem comando de build estático, saída `dist/`, configuração Vercel e instruções em português para importar o projeto; não declarar deploy realizado sem confirmação.
- [x] **Avisos do motor:** a interface e a documentação identificam o build WASM do OpenSCAD como experimental, informam que o processamento é local e incluem atribuição/licença GPL e links de código-fonte.
