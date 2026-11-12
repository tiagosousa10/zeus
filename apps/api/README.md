# API Zeus

API Hono local, organizada por funcionalidade em `src/modules`. `src/app.ts` compõe middleware e routers; `src/index.ts` inicia o servidor.

Cada módulo mantém perto as suas responsabilidades:

- `routes.ts` regista caminhos, guards e handlers nomeados.
- `controllers.ts` interpreta e valida entradas HTTP, chama operações e apresenta resultados.
- `models.ts` define schemas e tipos do domínio; `service.ts` contém operações e integrações. Autenticação separa a configuração Better Auth das operações de conta, e membros separam persistência de validação das definições.
- IPTV tem `controllers/`, `models/` e `services/`, porque inclui catálogo, guia e reprodução. Os serviços de reprodução recebem identificadores, intervalos e sinais de cancelamento, sem dependência de Hono. O adaptador de media usa `Request`/`Response` nativos para preservar streaming, Range e cancelamento.

`middleware/` aplica política de origem, limites do corpo, headers e tradução de falhas para HTTP. Serviços lançam `DomainError` para falhas esperadas; mensagens internas inesperadas não chegam ao cliente. `db/` mantém schema Drizzle, migrações, transações e persistência SQLite. `lib/` contém infraestrutura partilhada como cifra, fetch protegido e cache limitada.

`packages/contracts` contém DTOs e regras puras partilhadas com a interface web. O frontend não importa implementação da API. Os schemas Zod e credenciais dos fornecedores permanecem na API.

A suite `npm run test --workspace @zeus/api` exercita as rotas reais com SQLite temporário e integrações simuladas, incluindo autenticação/TOTP, recuperação, isolamento de membros, fornecedores, guia, quotas e cancelamento de reprodução. `npx tsc -p apps/api/tsconfig.json --noEmit` verifica os tipos.
