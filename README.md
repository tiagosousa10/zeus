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
- TV com listas M3U/Xtream privadas, grupos, pesquisa, favoritos, reprodução e guia XMLTV quando fornecido.
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
- A TV reproduz os endereços do fornecedor no leitor. Fornecedores que bloqueiem CORS, formatos incompatíveis, DRM ou limites da subscrição podem impedir a emissão; não há promessa de compatibilidade com todos os fornecedores.
- Os Add-ons do catálogo são serviços de terceiros e podem deixar de responder; os que exigem chave só funcionam com o URL configurado. Os importados pela sincronização comunitária continuam a precisar de aprovação.
- Não há DVR, multiview nem aplicação Android nesta fase.
- Não há importação de dados do MacStream; a interface antiga e o seu perfil foram removidos. Do MacStream ficaram apenas o Motor de torrents e a sua lista de trackers públicos.
- Resend/Turnstile e fornecedores privados exigem as tuas credenciais. A validação de reprodução usou um vídeo local de teste, sem iniciar torrents externos nem consumir listas IPTV privadas.
- Não foi criado instalador assinado nem publicada uma versão num servidor. Os tickets no Linear continuam por sincronizar. Repositório: https://github.com/tiagosousa10/zeus. A implementação é revista em Pull Requests antes de integrar em `main`.

## Verificação

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
npm run test:visual
```

Os testes API e browser criam schemas PostgreSQL temporários e removem-nos ao terminar. Não usam contas da base principal. O teste de browser verifica criação do Administrador → TOTP → onboarding e todas as páginas em desktop/mobile. `node tests/desktop.mjs` verifica a Entrada no Electron (primeiro arranque ou login), sem criar contas; usa o servidor de desenvolvimento se já estiver activo, ou o build local.

`test:visual` inicia servidores isolados nas portas 5181/5182, usa fixtures apenas no browser e compara medidas com os HTML aprovados. Verifica navegação, TV/guia por teclado, favoritos por toque, persistência das listas e estados. Capturas e medidas ficam em `/tmp/zeus-fidelity`. Requer Google Chrome instalado; não altera a base de dados.

## Referências guardadas

- Escolhas definitivas: `docs/superpowers/specs/2026-11-11-zeus-approved.md`.
- Plano e validação: `docs/superpowers/plans/2026-11-11-zeus-screens.md`.
- Protótipos aprovados: `prototipos/estilo/zeus/`.
- Revisão de fidelidade: `docs/2026-11-12-zeus-fidelity.md`.
- Créditos: `apps/web/public/art/img/CREDITOS.md`.
- API: `apps/api/README.md`.
