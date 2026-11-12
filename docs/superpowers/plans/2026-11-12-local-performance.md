# Optimização local do Zeus

Objectivo: reduzir código carregado sem necessidade, trabalho em repouso e retenção de recursos, preservando a interface e a reprodução. Não prometer um mínimo absoluto de RAM/CPU; medir os cenários concretos.

- [x] Registar baseline com build de produção, browser isolado e carregamento do motor.
- [x] Carregar HLS apenas quando a fonte o exige; reduzir a importação Three.js aos símbolos efectivamente usados e evitar carregá-lo em reduced-motion.
- [x] Limitar o trabalho gráfico decorativo e a resolução de renderização; manter pausa em segundo plano e limpeza completa.
- [x] Tornar o motor leve em repouso e libertar cliente/conexões ao parar.
- [x] Limitar caches IPTV e remover I/O de ficheiros síncrono dos pedidos; evitar trabalho repetido na pesquisa e polling desnecessário.
- [x] Repetir medições, testes funcionais e revisão do diff; documentar ganhos e limites.

Referências: [Electron Performance](https://www.electronjs.org/docs/latest/tutorial/performance), [Three.js responsive rendering](https://threejs.org/manual/pages/responsive.html), [Three.js rendering on demand](https://threejs.org/manual/pages/rendering-on-demand.html).

Resultados e limitações: [Relatório de desempenho local](../../2026-11-12-local-performance.md).
