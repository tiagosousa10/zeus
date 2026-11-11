# Zeus API

Hono em `127.0.0.1:4310`, PostgreSQL/Drizzle, Better Auth 1.7 com TOTP obrigatório. `apps/web` encaminha `/api` para esta porta. As rotas HTTP são os controladores; os serviços concentram autenticação e estado, e `db/schema.ts` define os modelos.

Da raiz:

```sh
node --env-file=.env --import tsx apps/api/src/db/setup.ts
node --env-file=.env --import tsx apps/api/src/index.ts
npx tsc -p apps/api/tsconfig.json
npx tsx --test apps/api/test/integration.test.ts
```

O teste cria e remove apenas um schema PostgreSQL `test_<aleatório>`; não cria Membros na aplicação. Testa concorrência no primeiro arranque, Convites de uso único, TOTP/códigos de recuperação, bloqueio de sessões anteriores à configuração TOTP, isolamento, cifragem e autorização.

## Contratos

- `GET /api/bootstrap` → `{required}`. `POST` com `{name,email,password}` cria o único Administrador inicial e devolve cookie Better Auth. Password mínimo 12 caracteres.
- `POST /api/invites/accept` com `{token,name,password}` cria o Membro e devolve cookie.
- `/api/auth/*` Better Auth: `sign-in/email`, `sign-out`, `two-factor/enable`, `two-factor/verify-totp`, `two-factor/verify-backup-code`, `change-password`, `list-sessions`, `revoke-session`. Registo público e desligar TOTP bloqueados.
- `GET /api/session` → `{user|null}`, incluindo `role`, `active`, `twoFactorEnabled` e `twoFactorVerified`.
- `GET /api/state` → `{preferences,library,progress,iptv,addons,onboardingDone}`. `PATCH` substitui as chaves de topo enviadas e preserva as restantes, numa transação por Membro. O estado integral fica cifrado com AES-256-GCM; é devolvido apenas ao próprio Membro.
- `GET /api/addons` → `{addons}` aprovados. `GET /api/streams?type=movie|series&id=...` consulta apenas Add-ons instalados e aprovados, devolve `{streams,errors}`. Configuração Torrentio: `debridProvider`, `apiKey`, `providers`, `sort`.
- `GET /api/admin/members`, `PATCH /api/admin/members/:id` com `{active}`; `GET/POST /api/admin/invites`, `DELETE /api/admin/invites/:id`; `GET /api/admin/addons`, `POST /api/admin/addons/sync`, `PATCH /api/admin/addons/:id` com `{status:'approved'|'rejected'}`.
- `GET /api/config` → `{turnstileSiteKey,emailConfigured}`. Turnstile: corpo `turnstileToken` no bootstrap/convite e header `x-turnstile-token` no login.

## Configuração

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ZEUS_ENCRYPTION_KEY` (64 caracteres hexadecimais), `ZEUS_WEB_ORIGIN`, `BETTER_AUTH_URL`. Para desenvolvimento sem chaves de ambiente, chaves aleatórias são guardadas em `~/Library/Application Support/Zeus/` no Mac com permissões 0600. Preservar estas chaves junto do backup; mudar a chave de cifragem impede ler o estado existente.

`TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` ativam verificação; `RESEND_API_KEY` + `RESEND_FROM` permitem recuperação de password. Convites usam Resend quando configurado, com idempotência e tentativas limitadas em falhas transitórias. Devolvem sempre o link para copiar e `emailSent`; em falha, `deliveryError` explica o resultado. Sem configuração, `emailSent:false` e partilha manual explícita. Sem Resend, recuperação devolve 503.

O catálogo comunitário importado é o arquivo público `https://stremio-community.github.io/stremio-addons-list/catalog.json`. A API tentada do novo diretório não devolveu JSON; o arquivo pode incluir serviços entretanto indisponíveis. Entradas novas ficam sempre pendentes. A aprovação valida o manifesto atual por fetch com DNS fixado. `configFields` declara os campos genéricos do SDK (text, number, password, checkbox, select); a API valida valores e gera o segmento JSON codificado exigido pelo SDK. Add-ons sem campos declarados usam os valores por omissão; configurações que exigem adaptadores adicionais falham explicitamente.

Documentação usada: [Better Auth TOTP](https://better-auth.com/docs/plugins/2fa), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle). Os dois fatores são verificados também por sessão na API, para impedir que uma sessão aberta antes da adesão a TOTP passe a ter acesso quando outra sessão conclui a adesão.
