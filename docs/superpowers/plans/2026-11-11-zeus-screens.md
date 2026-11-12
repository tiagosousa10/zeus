# Zeus Screens Implementation Plan

**Goal:** Implementar todos os ecrãs aprovados na aplicação web/Electron e guardar as escolhas.
**Architecture:** React partilhado, Hono modular, Drizzle/PostgreSQL e Motor local existente. Componentes visuais comuns mantêm fidelidade ao protótipo.
**Tech Stack:** React, Vite, TanStack Router/Query, GSAP, Three.js, Hono, Better Auth, Drizzle, PostgreSQL, Electron.
**Spec:** docs/superpowers/specs/2026-11-11-zeus-approved.md

## Global Constraints

PT-PT; utilizadores são Membros; nenhum envio externo real durante testes; respeitar movimento reduzido; guardar segredos só no servidor.

## Review Focus

- Estado isolado por Membro e autorização de Administração.
- Catálogo/reprodução indisponíveis devem mostrar erro e permitir nova tentativa.
- Sessões com TOTP incompleto não podem aceder a dados.
- URLs IPTV/configuração não podem produzir execução de HTML ou acesso arbitrário ao servidor.
- Navegação e animações não podem acumular ciclos entre páginas.

## Tasks

- [x] Fundação: apps/web, assets aprovados, componentes Art/Nav, roteamento, cliente API, testes de build.
- [x] API: persistência por Membro, Better Auth, bootstrap/convites, catálogo/configuração e estado; testes de isolamento.
- [x] Cinema: início/explorar/título/leitor, catálogo e Fontes reais, progresso/lista persistidos, testes.
- [x] Gestão: entrada/onboarding/addons/conta/admin ligados à API, sem dados de demonstração.
- [x] Portal/TV/Estados: listas/canais reais, feedback Motor, navegação completa.
- [x] Electron: servir build novo, arrancar API/Motor, manter legado por comando explícito.
- [x] Validação: types/build/testes, browser desktop/mobile, fluxos e revisão final.

## Contratos entre módulos

Frontend `lib/api.ts`: `api<T>(path, init?)` com prefixo /api, credentials include e Error em resposta não OK.
`lib/session.tsx`: `useSession()` retorna `{user, loading, refresh}`; user id/name/email/role/twoFactorEnabled. `useMemberState()` retorna `{state, save(patch), loading}`; state com preferences, library, progress, iptv, addons, onboardingDone. PATCH /api/state funde chaves de topo. Auth Better Auth /api/auth/*.
Componentes `Art` props `{image,title?,eyebrow?,children?,className?}` e `Page` props children. `Nav` com links /portal /cinema /explorar /tv /addons /conta /admin. CSS partilhado aprovado em public/art/shared.
Páginas exportam default React component. Rotas /entrada /onboarding /portal /cinema /explorar /titulo /leitor /tv /addons /conta /admin /estados /guia. Query strings para id,type e fonte.

## Resultado e revisão

Implementação concluída dos 13 ecrãs em React, integrada com API/PostgreSQL e Electron. Testes API isolados e browser com schemas temporários. A revisão independente identificou e levou à correção do acesso ao segredo TOTP por sessões não verificadas, do bloqueio após aceitação de Convites, da divergência de chaves entre modos de arranque, da chave TMDB sem utilização e da omissão de legendas nas Fontes. O Motor recebeu autenticação local, isolamento de estado e controlo de concorrência.

A pasta recebida não tinha Git. Após autorização do utilizador, o repositório foi inicializado em https://github.com/tiagosousa10/zeus, com uma base em `main` e implementação em branch própria para revisão por PR. Sem envio real de emails, importação de dados antigos, publicação ou sincronização Linear. Limitações externas documentadas no README da raiz.
