# Web

Frontend React servido pelo Vite no browser e pelo Electron na aplicação desktop. Os mesmos ecrãs usam a API local; código web não importa implementações da API nem do desktop.

## Organização

- `src/main.tsx`: arranque React e configuração da cache de queries.
- `src/app/routes.tsx`: rotas, carregamento diferido, verificação de sessão e composição da aplicação.
- `src/features/`: funcionalidades. Cada uma contém apenas as pastas de que precisa: `pages` para ecrãs, `components` para UI própria, `hooks` para estado e ciclos de vida React, `services` para pedidos e integrações, `models` para tipos e regras, `styles` para CSS.
- `src/shared/`: UI genérica, sessão do membro, transporte HTTP, gráficos, modelos e estilos comuns. Não depende de funcionalidades nem de `app`.
- `../../packages/contracts/`: contratos e regras puras partilhados com a API, sem servidor ou base de dados.

As funcionalidades principais são `cinema`, `tv`, `auth`, `account`, `admin`, `addons`, `onboarding`, `portal` e `motor`. `design-guide` contém o guia visual. `shell` compõe navegação e pesquisa entre Cinema, TV e Motor; é o ponto explícito de composição entre funcionalidades. As funcionalidades não importam `app`.

Os ecrãs chamam serviços da sua funcionalidade: URLs, serialização, parâmetros e detalhes HTTP ficam nos serviços. O catálogo de add-ons é partilhado com o onboarding. A TV concentra os pedidos em `services/data.ts`. Os hooks dos leitores possuem as ligações de media, cancelamento, progresso e limpeza; não transferir estes ciclos de vida para componentes de apresentação. A escolha inicial de episódio/formulário usa o estado atual sem reinicializar durante gravações de progresso ou edição.

Não criar pastas vazias, barrels globais ou wrappers que apenas reproduzam a interface de outro módulo. Extrair código partilhado quando houver consumidores reais; manter JSX e CSS da funcionalidade juntos.

## Validação

A partir da raiz do repositório:

```sh
npm run typecheck
npx eslint apps/web/src
npm run test:cinema
npm run test:tv
```

Os testes de browser usam fornecedores simulados e verificam as rotas reais, a reprodução, o cancelamento e os ecrãs em desktop/mobile. Os testes puros de TV, pesquisa e playlists ficam em `tests/*.test.ts`. Ao mover módulos, atualizar também os imports do servidor virtual em `tests/cinema-playback.mjs` e a instrumentação de estado em `tests/tv-browser.mjs`.
