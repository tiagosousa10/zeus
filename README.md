# Zeus

Cinema e TV privados para o Mac e para o navegador, com os ecrãs artísticos aprovados em 11 de Novembro de 2026.

## Abrir

Requisitos: Node.js 24+, npm e Docker em execução.

```sh
npm install
npm run dev
```

Abrir **http://127.0.0.1:5174**. O comando inicia PostgreSQL, aplica o schema, arranca a API, o Motor local e o frontend. O primeiro acesso cria o Administrador e configura TOTP; guardar os códigos de recuperação. A base de dados não contém contas de demonstração.

Para abrir no Electron:

```sh
npm start
```

O comando prepara a base de dados e os builds antes de abrir a aplicação. `iniciar.command` continua a permitir duplo clique no Mac.

## O que está implementado

- Entrada, Convite, recuperação de password e TOTP com QR/códigos de recuperação.
- Onboarding com subida ao Olimpo, idiomas, chave TMDB, Add-ons e IPTV.
- Portal Cinema/TV com pintura viva e raios, com último módulo persistido.
- Cinema, pesquisa, detalhe/episódios, Fontes e leitor HTTP/HLS/torrents; lista e progresso por Membro. Fontes reais de Add-ons aprovados; sem vídeo de demonstração.
- TV com listas M3U/Xtream privadas, portais por país, filmes/séries e episódios, pastas visíveis/fixadas, pesquisa compacta, favoritos e progresso por lista/Membro. Guia XMLTV paginado quando fornecido.
- Add-ons com ordem, activação e configuração: formulário do SDK quando declarado, adaptador Torrentio, ou URL do manifesto configurado na página do Add-on (guardado cifrado por Membro).
- Catálogo de 358 Add-ons de filmes, séries e legendas, aprovado à partida e carregado por `npm run db:setup` a partir de `apps/api/src/db/addons-seed.json` (varredura dos registos públicos do Stremio a 2026-11-12).
- Legendas dos Add-ons instalados no leitor, convertidas de SRT para WebVTT pela API.
- Conta: dados, password, sessões, TOTP e preferências.
- Administração: Membros, Convites e aprovação de Add-ons importados.
- Estados do Motor e guia da direção visual. Movimento reduzido, teclado e layouts a 375/1440 px.

O catálogo base vem do Cinemeta. A chave TMDB pessoal, se configurada, enriquece metadados através da API. A API usa Hono, Better Auth, Drizzle e PostgreSQL; o estado privado de cada Membro é cifrado. O frontend React/Vite usa TanStack Router/Query, GSAP e Three.js, com páginas carregadas separadamente.

## Configuração local

PostgreSQL usa a porta local 55439 e o volume Docker `zeus_zeus_postgres`. API: 4310. Web: 5174. Motor: 11471, limitado a loopback e protegido por um token no novo arranque.

As chaves locais ficam em `~/Library/Application Support/Zeus/` no Mac, com permissões privadas. Desenvolvimento e Electron usam as mesmas chaves. `.env` permite configuração explícita; não alterar nem perder `BETTER_AUTH_SECRET` e `ZEUS_ENCRYPTION_KEY` de uma instalação com dados. Guardar um backup destas chaves junto do backup PostgreSQL. `ZEUS_MOTOR_TOKEN` autentica a ligação API → Motor. `.env.example` documenta as variáveis; os valores exemplificativos não são chaves válidas para uma instalação.

Resend (`RESEND_API_KEY`, `RESEND_FROM`) permite emails de Convite e recuperação. Sem configuração, os Convites têm link manual e a recuperação informa que não há envio disponível. Turnstile só fica activo com `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY`. Reiniciar os processos após alterar estas variáveis. Nenhum email real foi enviado durante a implementação.

## Limites desta versão local

- O Motor legado suporta uma reprodução torrent de cada vez; uma segunda conta recebe um aviso de ocupado. O Motor funciona apenas neste Mac.
- A TV reproduz exclusivamente através de URLs privados `/api/iptv/play/...`, com proxy HLS/ficheiro/MPEG-TS e remux quando necessário. Uma reprodução por lista. Formatos/codecs incompatíveis, DRM ou limites da subscrição podem impedir a emissão; não há promessa de compatibilidade universal.
- Os Add-ons do catálogo são serviços de terceiros e podem deixar de responder; os que exigem chave só funcionam com o URL configurado. Os importados pela sincronização comunitária continuam a precisar de aprovação.
- Não há DVR, multiview nem aplicação Android nesta fase.
- Não há importação de dados do MacStream; a interface antiga e o seu perfil foram removidos. Do MacStream ficaram apenas o Motor de torrents e a sua lista de trackers públicos.
- Resend/Turnstile e fornecedores privados exigem as tuas credenciais. A QA isolada usa media H.264/AAC gerada localmente e API simulada; a validação separada do backend com fornecedor privado está documentada em [Plano 2, estado verificado](docs/superpowers/plans/2026-11-12-tv-iptv-2-reproducao.md), sem credenciais nos resultados. Não foram iniciados torrents externos.
- Não foi criado instalador assinado nem publicada uma versão num servidor. Os tickets no Linear continuam por sincronizar. Repositório: https://github.com/tiagosousa10/zeus. A implementação é revista em Pull Requests antes de integrar em `main`.

## Verificação

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:visual
npm run test:tv
```

Os testes API e browser criam schemas PostgreSQL temporários e removem-nos ao terminar. Não usam contas da base principal. O teste de browser verifica criação do Administrador → TOTP → onboarding e todas as páginas em desktop/mobile. `node tests/desktop.mjs` verifica a Entrada no Electron (primeiro arranque ou login), sem criar contas; usa o servidor de desenvolvimento se já estiver activo, ou o build local.

`test:visual` inicia servidores isolados nas portas 5181/5182: valida estrutura/cores/overflow do novo portal TV e preserva a comparação exacta de geometria e navegação dos Estados com o HTML aprovado. Capturas e medidas ficam em `/tmp/zeus-fidelity`. `test:tv` usa Vite isolado na porta 5187 e API/Membro simulados: nove ecrãs e portal de entrada a 1440/375, pesquisa compacta de 50 mil itens (90 resultados por página), mudanças de lista, visibilidade, favoritos, episódios, gravações concorrentes, erros/retry e cancelamento. Gera H.264/AAC temporário e confirma frames e avanço de tempo em MP4, HLS, MPEG-TS e MP4 fragmentado local (contrato remux); o remux real da API tem cobertura nos testes API e na validação separada do Plano 2. Capturas ficam em `/tmp/zeus-tv-browser`. Ambos requerem Google Chrome e não alteram a base de dados.

## Referências guardadas

- Escolhas definitivas: `docs/superpowers/specs/2026-11-11-zeus-approved.md`.
- Plano e validação: `docs/superpowers/plans/2026-11-11-zeus-screens.md`.
- Protótipos aprovados: `prototipos/estilo/zeus/`.
- Revisão de fidelidade: `docs/2026-11-12-zeus-fidelity.md`.
- Créditos: `apps/web/public/art/img/CREDITOS.md`.
- API: `apps/api/README.md`.
