# Desempenho local — 12 de Novembro de 2026

Comparação com `3fc194b`, antes das optimizações. Chrome headless, build de produção, API/Membro simulados, viewport 1440×900 e DPR 2. Nenhum fornecedor IPTV ou torrent externo foi contactado. Os bytes de JavaScript são os conteúdos descomprimidos efectivamente carregados, não todos os ficheiros gerados pelo build.

| Cenário                                               |       Antes |    Depois |                          Diferença |
| ----------------------------------------------------- | ----------: | --------: | ---------------------------------: |
| JavaScript inicial da TV                              | 1 059 291 B | 481 559 B |                             −54,5% |
| JavaScript do Portal, movimento reduzido              | 1 178 143 B | 436 139 B |                             −63,0% |
| JavaScript do Portal, animado                         | 1 178 143 B | 972 383 B |                             −17,5% |
| Módulo Three.js                                       |   742 801 B | 536 244 B |                             −27,8% |
| Desenhos WebGL/s no Portal                            |        60,5 |      30,5 |                    cerca de metade |
| Píxeis nos buffers dos fundos do Portal               |  10 368 000 | 3 999 086 |                             −61,4% |
| Píxeis nos buffers, movimento reduzido                |   5 184 000 |         1 |                      buffer mínimo |
| RSS do processo Node após importar o Motor, mediana   |     72,4 MB |   50,1 MB |                             −30,8% |
| Importação do módulo do Motor, mediana de 5 execuções |    586,8 ms |    5,3 ms | trabalho adiado até ser necessário |

As execuções anteriores da importação do Motor variaram entre 326 e 1 384 ms; as posteriores ficaram entre 4,5 e 6,6 ms. Esta medição é apenas `require('./engine.js')`, não o arranque completo do Electron. O custo do WebTorrent continua a existir na primeira reprodução torrent. A duração de trabalho da thread principal no Portal durante uma janela de 2 segundos foi 118 → 54 ms; é uma amostra diagnóstica, dependente da máquina, carga e renderizador gráfico. Não equivale a uma redução garantida de CPU, bateria ou RAM de toda a aplicação.

## Alterações

- HLS carregado apenas ao reproduzir uma fonte que o exige, tanto na TV como no Cinema. Importações atrasadas respeitam o cancelamento ao sair ou mudar de fonte.
- Exportações Three.js limitadas às classes usadas pelos efeitos. Movimento reduzido usa a imagem estática e não importa o runtime gráfico.
- Fundos decorativos limitados a 30 fps, DPR máximo 1,5 e cerca de 2 milhões de píxeis por canvas. Texto, interface e vídeo mantêm a sua resolução e cadência. Pausa fora do ecrã/em segundo plano, resposta a movimento reduzido e libertação de contextos WebGL ao desmontar.
- WebTorrent importado apenas quando há reprodução/preload. Parar fecha o cliente, cancela esperas de metadados, remove listeners e termina os subprocessos FFmpeg associados. A cache de faixas tem no máximo 32 entradas e é limpa ao parar.
- Cache IPTV em memória com LRU, máximo 128 entradas e orçamento de 64 MiB de peso **estimado**. Entradas expiradas são removidas ao consultar e a cada minuto. Este orçamento não limita o heap global, cargas em curso ou a cache em disco.
- Leitura/escrita da cache de ficheiros assíncrona; ficheiros cifrados escritos por substituição atómica, com permissões privadas. Pedidos concorrentes partilham a leitura/carregamento. Mantêm-se o isolamento por Membro/lista/credenciais e os TTL existentes.
- Estado do Motor consultado por uma query partilhada, cancelável e sem polling em segundo plano. Pesquisa TV reutiliza resultados/contagens durante a navegação por teclado; catálogos sem progresso a retomar não pedem o índice completo de pesquisa.

## Validação e repetição

`npm run typecheck`, `npm test` (139 testes), build web/API, `test:browser`, `test:tv` e `test:visual` passaram. A TV confirmou frames e avanço de tempo em MP4, HLS, MPEG-TS e MP4 fragmentado local, incluindo cancelamento/retry e pesquisa com 50 mil itens. O teste de browser cobriu autenticação e 12 ecrãs em desktop/mobile. `node tests/desktop.mjs` confirmou a Entrada no Electron com frontend compilado, sem alterar contas.

`npm run test:performance` recompila os assets e aplica limites reproduzíveis: nenhum HLS/MPEG-TS ao navegar na TV, JavaScript inicial abaixo de 550 kB, nenhum Three.js em movimento reduzido, renderização activa até 32 desenhos/s no Portal, orçamento dos buffers e pausa/retoma ao mudar a preferência de movimento. Verifica também que o Motor em repouso não importa WebTorrent. Não aplica limites de tempo/heap frágeis entre máquinas.

Dados completos: [antes](performance/2026-11-12-before.json) e [depois](performance/2026-11-12-after.json). As capturas do Portal foram inspeccionadas. Para medições comparáveis, executar sem outras tarefas pesadas e com a porta 5198 livre.

HLS e Three.js ainda originam chunks acima de 500 kB, carregados a pedido. O aviso do bundler mantém-se: não foi aumentado o limite para o ocultar, nem removido suporte de reprodução. Não houve medição prolongada de bateria/GPU no Electron nem alteração das dependências PostgreSQL/Docker. Estas alterações reduzem custos concretos; não demonstram um mínimo absoluto de recursos em todos os equipamentos.

Referências técnicas: [Electron — Performance](https://www.electronjs.org/docs/latest/tutorial/performance), [Three.js — Responsive rendering](https://threejs.org/manual/pages/responsive.html) e [Rendering on demand](https://threejs.org/manual/pages/rendering-on-demand.html).
