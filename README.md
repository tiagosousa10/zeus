# Zeus

Cinema e TV privados para o Mac e para o navegador, com os ecrãs artísticos aprovados em 11 de Novembro de 2026.

## Instalar no Mac

A Zeus 1.2 usa **Electron + SQLite local**. A aplicação empacotada inclui o runtime, a API e o motor de reprodução. Não requer Docker, PostgreSQL, Node.js instalado pelo utilizador nem serviços launchd.

Descarregar o DMG correspondente ao Mac (Apple Silicon `arm64`, Intel `x64`), abrir e arrastar **Zeus.app** para **Aplicações**. A primeira abertura cria os ficheiros locais e apresenta a criação do Administrador/TOTP. Ao sair da Zeus, terminam a API e o Motor iniciados pela aplicação.

Os instaladores são preparados para distribuição nas Releases do GitHub. A geração local não publica automaticamente: a versão pública precisa de assinatura Developer ID e notarização Apple. Um DMG local sem estas credenciais é um artefacto de teste e não tem a mesma experiência de abertura de uma versão assinada.

## Executar a partir do repositório

Requisito: Node.js 24+ com npm. Não é necessário Docker.

```sh
npm ci
npm start
```

`npm start` compila e abre a janela Electron. `apps/desktop/iniciar.command` permite arrancar com duplo clique. Para trabalhar no código com recarregamento automático:

```sh
npm run dev
```

Abrir **http://127.0.0.1:5174**. A API inicializa automaticamente o SQLite e o catálogo de Add-ons. Os dados reais não contêm contas de demonstração. Para actualizar uma instalação anterior com PostgreSQL, seguir primeiro a [migração e distribuição desktop](docs/desktop-distribution.md).

## O que está implementado

- Entrada, Convite, recuperação de password e TOTP com QR/códigos de recuperação.
- Onboarding com subida ao Olimpo, idiomas, chave TMDB, Add-ons e IPTV.
- Portal Cinema/TV com pintura viva e raios, com último módulo persistido.
- Cinema, pesquisa, detalhe/episódios, Fontes e leitor HTTP/HLS/torrents; lista e progresso por Membro. Fontes reais de Add-ons aprovados; sem vídeo de demonstração.
- TV com listas M3U/Xtream privadas, portais por país, filmes/séries e episódios, pastas visíveis/fixadas, pesquisa global Cinema/TV e pesquisa por pasta, favoritos e progresso por lista/Membro. Guia XMLTV paginado quando fornecido.
- Add-ons com ordem, activação e configuração: formulário do SDK quando declarado, adaptador Torrentio, ou URL do manifesto configurado na página do Add-on (guardado cifrado por Membro).
- Catálogo de 358 Add-ons de filmes, séries e legendas, aprovado à partida e carregado por `npm run db:setup` a partir de `apps/api/src/db/addons-seed.json` (varredura dos registos públicos do Stremio a 2026-11-12).
- Legendas dos Add-ons instalados no leitor, convertidas de SRT para WebVTT pela API.
- Conta: dados, password, sessões, TOTP e preferências.
- Administração: Membros, Convites e aprovação de Add-ons importados.
- Estados do Motor e guia da direção visual. Movimento reduzido, teclado e layouts a 375/1440 px.

O catálogo base vem do Cinemeta. A chave TMDB pessoal, se configurada, enriquece metadados através da API. A API usa Hono, Better Auth, Drizzle e SQLite; o estado privado de cada Membro é cifrado. O frontend React/Vite usa TanStack Router/Query, GSAP e Three.js, com páginas carregadas separadamente.

## Configuração local

No Mac, os dados ficam em `~/Library/Application Support/Zeus/`: `zeus.sqlite`, as chaves `auth-secret`, `encryption-key`, `motor-token` e caches. Os ficheiros de base de dados e chaves são privados. Guardar cópia desta pasta **com a Zeus fechada**; não substituir as chaves de uma instalação com dados.

O desktop gere os seus próprios processos e escolhe portas loopback; a porta da API é guardada para preservar links locais entre reinícios. Em desenvolvimento: API 4310, web 5174 e Motor 11471. A base de dados não abre uma porta de rede. A aplicação `.app` usa o perfil guardado e não carrega `.env` do directório de trabalho. O código-fonte pode usar `.env`; `.env.example` documenta as opções, sem segredos fictícios activos.


Resend (`RESEND_API_KEY`, `RESEND_FROM`) permite emails de Convite e recuperação. Sem configuração, os Convites têm link manual e a recuperação informa que não há envio disponível. Turnstile só fica activo com `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY`. Reiniciar os processos após alterar estas variáveis. Nenhum email real foi enviado durante a implementação.

## Limites desta versão local

- O Motor legado suporta uma reprodução torrent de cada vez; uma segunda conta recebe um aviso de ocupado. O Motor funciona apenas neste Mac.
- A TV reproduz exclusivamente através de URLs privados `/api/iptv/play/...`, com proxy HLS/ficheiro/MPEG-TS e remux quando necessário. Uma reprodução por lista. Formatos/codecs incompatíveis, DRM ou limites da subscrição podem impedir a emissão; não há promessa de compatibilidade universal.
- Os Add-ons do catálogo são serviços de terceiros e podem deixar de responder; os que exigem chave só funcionam com o URL configurado. Os importados pela sincronização comunitária continuam a precisar de aprovação.
- Não há DVR, multiview nem aplicação Android nesta fase.
- Não há importação de dados do MacStream; a interface antiga e o seu perfil foram removidos. Do MacStream ficaram apenas o Motor de torrents e a sua lista de trackers públicos.
- Resend/Turnstile e fornecedores privados exigem as tuas credenciais. A QA isolada usa media H.264/AAC gerada localmente e API simulada; a validação separada do backend com fornecedor privado está documentada em [Plano 2, estado verificado](docs/superpowers/plans/2026-11-12-tv-iptv-2-reproducao.md), sem credenciais nos resultados. Não foram iniciados torrents externos.
- O DMG está configurado; assinatura/notarização e publicação dependem das credenciais Apple e do lançamento da versão. Os tickets no Linear continuam por sincronizar. Repositório: https://github.com/tiagosousa10/zeus. A implementação é revista em Pull Requests antes de integrar em `main`.

## Verificação

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:visual
npm run test:tv
npm run test:ui
npm run test:header
npm run test:performance
npm run test:desktop
```

Os testes API e browser usam ficheiros SQLite temporários e não precisam de PostgreSQL. O teste de browser verifica criação do Administrador → TOTP → onboarding e todas as páginas em desktop/mobile. `test:desktop` usa um perfil temporário: confirma primeiro arranque, criação de conta, seed automático, persistência após reinício e encerramento dos processos. Com `ZEUS_PACKAGED_APP=/caminho/Zeus.app`, testa a aplicação empacotada, com Node/Docker externos fora do PATH.


`test:visual` inicia servidores isolados nas portas 5181/5182: valida estrutura/cores/overflow do novo portal TV e preserva a comparação exacta de geometria e navegação dos Estados com o HTML aprovado. Capturas e medidas ficam em `/tmp/zeus-fidelity`. `test:tv` usa Vite isolado na porta 5187 e API/Membro simulados: nove ecrãs e portal de entrada a 1440/375, pesquisa compacta de 50 mil itens (90 resultados por página), mudanças de lista, visibilidade, favoritos, episódios, gravações concorrentes, erros/retry e cancelamento. Gera H.264/AAC temporário e confirma frames e avanço de tempo em MP4, HLS, MPEG-TS e MP4 fragmentado local (contrato remux); o remux real da API tem cobertura nos testes API e na validação separada do Plano 2. Capturas ficam em `/tmp/zeus-tv-browser`. Ambos requerem Google Chrome e não alteram a base de dados.

`test:performance` compila o frontend e mede os assets de produção com API simulada, sem contactar fornecedores privados. Verifica os limites de carregamento inicial, renderização decorativa, movimento reduzido e carregamento do Motor. Requer Google Chrome e a porta 5198 livre; grava JSON e capturas em `/tmp/zeus-performance*`. Para usar diariamente o build de produção, abrir com `npm start`; `npm run dev` inclui ferramentas de desenvolvimento. Ganhos medidos, orçamentos de cache e limites estão no [relatório de desempenho local](docs/2026-11-12-local-performance.md).

## Referências guardadas

- Escolhas definitivas: `docs/superpowers/specs/2026-11-11-zeus-approved.md`.
- Plano e validação: `docs/superpowers/plans/2026-11-11-zeus-screens.md`.
- Protótipos aprovados: `prototipos/estilo/zeus/`.
- Revisão de fidelidade: `docs/2026-11-12-zeus-fidelity.md`.
- Créditos: `apps/web/public/art/img/CREDITOS.md`.
- API: `apps/api/README.md`.

## Gerar instaladores

```sh
npm run dist:arm    # num Mac Apple Silicon
npm run dist:intel  # num Mac Intel
```

Resultado: `apps/desktop/dist/Zeus-1.2.6-arm64.dmg` ou `apps/desktop/dist/Zeus-1.2.6-x64.dmg`. Cada arquitectura é gerada no seu próprio runner para incluir o FFmpeg correcto. O workflow manual **Build macOS installers** gera ambos no GitHub Actions, testa os pacotes e guarda os DMG como artefactos; não publica automaticamente. Ver [assinatura, migração e lançamento](docs/desktop-distribution.md).

## Interface e reprodução — 1.2.1

Pesquisa conjunta em Cinema e em todas as listas IPTV, filtros por módulo/tipo/género/ano e exemplos clicáveis. O leitor TV tem controlos compactos, menu explícito, cinco novas tentativas automáticas, vigilância de arranque/buffering e fecho das sessões anteriores. Detalhes, exemplos visuais e evidência de validação: [revisão da interface e reprodução](docs/2026-11-12-interface-playback.md).

`npm run test:ui` valida a pesquisa entre módulos/listas, 100 mil entradas sintéticas com DOM limitado, layouts desktop/mobile, limite de cinco retries, reinício manual, cancelamento, watchdog de arranque e menus que não abrem com movimento do rato. Requer Chrome e a porta 5191 livre.

### Cabeçalho e janela — 1.2.2

Cinema e TV partilham a estrutura de navegação, incluindo posição do logo, módulos, pesquisa e conta. As cores podem variar; a geometria e os pontos de adaptação à largura são comuns. A barra de janela macOS é nativa e fica fora da área web, protegendo o conteúdo mesmo com zoom. `npm run test:header` compara medidas em oito larguras (320–1440 px) e verifica ausência de sobreposições. `test:desktop` confirma separação entre a barra nativa e o conteúdo com zoom a 80%, 100% e 140%.
