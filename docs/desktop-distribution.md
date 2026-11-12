# Zeus desktop autónoma

A partir da versão 1.2, Electron apresenta a interface, SQLite guarda os dados localmente e a aplicação gere a API e o Motor. Sem Docker, PostgreSQL, Node externo ou launchd no uso normal. As portas são locais em `127.0.0.1`; a API escolhe e guarda uma porta no primeiro arranque para preservar links entre reinícios; abrir uma segunda instância foca a primeira. Ao sair, os processos recebem um pedido de encerramento e um limite para terminar.

## Instalar e usar

1. Obter o DMG da arquitectura do Mac: `arm64` para Apple Silicon, `x64` para Intel.
2. Abrir o DMG e arrastar `Zeus.app` para Aplicações; ejectar o volume.
3. Abrir Zeus. A primeira execução cria o SQLite e o catálogo, e apresenta a criação do Administrador/TOTP.
4. Adicionar as próprias listas/fontes. Os dados de cada instalação são independentes; o instalador não contém contas, listas ou chaves do autor.

Os dados e chaves ficam em `~/Library/Application Support/Zeus/`, fora da aplicação. Actualizar `Zeus.app` preserva esta pasta. Para fazer backup, sair completamente da Zeus e copiar a pasta, incluindo `zeus.sqlite`, eventuais ficheiros `-wal`/`-shm` e as três chaves locais. Nunca trocar a chave de cifragem ou autenticação de um perfil com dados. A cifragem do estado privado existente foi preservada; o ficheiro SQLite completo não usa cifragem de disco própria.

## Instalações anteriores com PostgreSQL

A migração é feita uma vez, a partir do repositório antigo, com a Zeus fechada e o PostgreSQL antigo acessível:

```sh
npm ci
npm run db:migrate
npm start
```

O comando usa `ZEUS_LEGACY_DATABASE_URL`, ou `DATABASE_URL` antigo, ou a ligação local anterior da Zeus. Preservar as chaves e a pasta de dados originais. O destino por omissão é `~/Library/Application Support/Zeus/zeus.sqlite`; `ZEUS_DATABASE_PATH` permite indicar outro destino.

A origem é lida numa transacção `REPEATABLE READ READ ONLY`. São copiados utilizadores, hashes de passwords, sessões, TOTP, códigos de recuperação, estado cifrado, convites e catálogo. Datas, booleanos e JSON são convertidos para o schema SQLite. A migração verifica a abertura dos dados cifrados com as chaves existentes, contagens, foreign keys e integridade antes de publicar atomicamente o novo ficheiro. Não altera nem apaga PostgreSQL e recusa substituir qualquer SQLite existente.

Se já existe um SQLite de teste, usar um destino novo com `ZEUS_DATABASE_PATH` e verificar a cópia antes de activar esse perfil. Não apagar uma base existente para contornar a verificação. Depois de confirmar a migração, o contentor antigo pode ser parado com `docker compose stop postgres`; o volume fica preservado. Docker pode continuar a ser usado por outras aplicações.

Se o novo Mac só tem a aplicação `.app`, migrar primeiro no ambiente antigo e copiar a pasta Zeus completa, com a aplicação fechada em ambos. O instalador não contém ferramentas PostgreSQL nem necessita delas no arranque.

## Gerar o DMG

```sh
npm ci
npm run typecheck
npm test
npm run dist:arm     # Apple Silicon
# ou npm run dist:intel num Mac Intel
```

O resultado fica em `apps/desktop/dist/Zeus-<versão>-<arquitectura>.dmg`. O frontend/API já estão compilados; Node/Electron e FFmpeg são incluídos. As dependências exclusivas do frontend e de migração são de desenvolvimento. O empacotamento recusa gerar outra arquitectura no mesmo host para evitar incluir um FFmpeg incompatível.

Para testar o artefacto:

```sh
ZEUS_PACKAGED_APP=apps/desktop/dist/mac-arm64/Zeus.app npm run test:desktop
# Intel: apps/desktop/dist/mac/Zeus.app
```

O teste cria um perfil temporário, confirma primeiro arranque, conta persistida após reinício, catálogo automático e encerramento dos serviços. O PATH da aplicação exclui instalações externas de Node e Docker. Não toca no perfil real.

## Assinatura, notarização e GitHub

`npm run dist` gera por omissão um DMG local **sem assinatura Developer ID nem notarização**. Serve para desenvolvimento/validação. Não deve ser apresentado como uma versão pública que passa Gatekeeper sem intervenção.

Para a distribuição pública, o processo está preparado para um certificado **Developer ID Application** da conta Apple Developer e uma chave App Store Connect com acesso à notarização. Configurar fora do repositório:

- `CSC_LINK`: certificado `.p12` (caminho/base64 suportado pelo electron-builder).
- `CSC_KEY_PASSWORD`: password do certificado.
- `APPLE_API_KEY`: caminho para a chave `.p8`.
- `APPLE_API_KEY_ID` e `APPLE_API_ISSUER`.
- `ZEUS_RELEASE=1`: exige credenciais, assinatura e notarização; falha se estiverem ausentes.

O workflow manual **Build macOS installers** (`.github/workflows/macos-release.yml`) usa runners nativos `macos-15`/`macos-15-intel`, testa e guarda os dois DMG. Para a opção assinada, guardar os mesmos nomes nos GitHub Secrets, excepto a chave `.p8`, que usa `APPLE_API_KEY_BASE64`. O workflow verifica a assinatura e o ticket de notarização. Os ficheiros nunca são publicados automaticamente: depois da validação, anexar os dois DMG a uma Release do GitHub. Não foram criados certificados nem enviada uma versão à Apple nesta adaptação.

Não há actualizações automáticas instaladas nesta versão. Actualizar é descarregar a nova aplicação e substituir a anterior, mantendo o perfil. Os schemas são versionados; uma versão antiga recusa abrir um schema mais recente.

## Validação local desta adaptação

- 142 testes automatizados, incluindo isolamento/rollback SQLite, persistência e migração cifrada com rejeição de chaves erradas/destino existente.
- Browser: autenticação/TOTP e 12 ecrãs em desktop/mobile usando SQLite temporário.
- App Apple Silicon empacotada e lançada a partir do DMG montado read-only: arranque isolado, criação de conta, persistência, restart e limpeza de processos, sem Node/Docker no PATH. FFmpeg incluído executado; integridade do DMG verificada e arquivo da app inspeccionado sem dados privados.
- TV: MP4/HLS/MPEG-TS/remux local, pesquisa de 50 mil itens e fluxos de cancelamento; fidelidade visual desktop/mobile.
- Dados da instalação local migrados por cópia; PostgreSQL preservado e parado após verificação.

O build Intel e a assinatura pública ficam preparados no workflow, mas precisam de execução no runner Intel e das credenciais Apple. A criação de um `.dmg` não demonstra, por si só, a aprovação pelo Gatekeeper.

Referências: [Electron — Packaging](https://www.electronjs.org/docs/latest/tutorial/tutorial-packaging), [Apple — distribuição](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution), [Drizzle Proxy](https://orm.drizzle.team/docs/connect-drizzle-proxy), [Better Auth Drizzle](https://better-auth.com/docs/adapters/drizzle), [GitHub runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
