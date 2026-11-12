# Correções da auditoria — 2026-11-12

Implementação sobre o layout atual (`ea01572` como HEAD durante o trabalho), sem commit/push. O [relatório original](2026-11-12-red-team.md) é histórico: os cinco achados confirmados e o bug funcional abaixo foram corrigidos no código. As duas observações Standards também foram tratadas. Revisores independentes verificaram as alterações; duas corridas descobertas nessa revisão ganharam regressões antes do fecho.

## Correções confirmadas

| Item | Correção | Evidência de regressão |
|---|---|---|
| R-001 XMLTV | Scanner monotónico, limites de bytes/tags/programas/profundidade e orçamento de 10 segundos; parsing cooperativo que cede execução. Preserva CDATA e guia grande. | `iptv-epg.test.ts`: malformado, CDATA, responsiveness e 200 mil programas (~42 MB). Falhas anteriores observadas. |
| R-002 remux | Reserva antes da ponte/FFmpeg: 1 por sessão, 2 por Membro, 8 globalmente. Libertação só depois de saída do processo. Um waiter por sessão até 1 segundo tolera seek antes/depois do cancelamento anterior; nunca mata o conversor ativo por pedido concorrente. 429 e Retry-After quando ocupado. | `iptv-remux.test.ts` e `iptv-play-routes.test.ts`: quotas, cancelamento, erros, inversão da ordem de eventos no seek e waiter cancelado. |
| R-003 disco | Cache cifrada com índice de metadados, TTL/LRU, quotas 512 MiB/2048 entradas globais e 128 MiB/512 por Membro. Operações serializadas e escrita atómica 0600; limpeza periódica. | `iptv-disk-cache.test.ts`, `iptv-cache-removal.test.ts`: quotas/IDs rotativos/restart/expiração/concorrência. Remover lista cancela também detalhes que aguardavam catálogo; preserva memória de outras listas/Membros. |
| R-004 reset | `revokeSessionsOnPasswordReset: true`; sessões antigas e verified_session são eliminadas. | `auth-recovery.test.ts`: cookie antes aceite passa a 401, cascata verificada, login posterior ainda exige TOTP. |
| R-005 PostgreSQL antigo | Compose exige password própria; migrador exige URL explícito, sem credencial por omissão. Imagem fixada por digest. | `legacy-migration.test.ts`: sem configuração falha antes de tentar ligar; documentação atualizada. Não modifica passwords de bases existentes. |
| S-001 recuperação | Callback GET parametrizado permitido sem sessão; validação do token permanece em Better Auth. | Fluxo real Better Auth/SQLite, transporte email simulado: link válido, inválido, método incorreto, token usado e acesso privado negado. Sem envio real. |
| Standards/config | Resolver comum em `packages/local-config/`, usado por API e desktop. Rejeita chave de ambiente divergente, preserva chaves, trata criação concorrente. Incluído no pacote. | `local-config.test.ts`: falha da API antes da correção, rejeição/reutilização/permissões após correção. |
| Standards/Player | Separados lifecycle de fontes/motor, transporte/HLS/áudio e persistência em três hooks. Apresentação mantida. | `tests/cinema-playback.mjs`, Chrome real: throttle, flush no unmount, cancelamento pendente e cleanup. Corrige ainda perda do último progresso quando React limpava video.current antes do cleanup. |

## Endurecimento adicional realizado

- AES-GCM exige tag de 16 bytes e IV de 12 bytes, incluindo migração. Testes confirmaram aceitação de tag truncada antes e rejeição depois.
- Subprocessos FFmpeg recebem apenas variáveis de caminhos/locale, sem chaves de autenticação/cifra/email. Motor/API recebem conjuntos de ambiente separados no desktop. Testes com subprocesso real verificam ausência de segredo.
- CSP, anti-framing, nosniff, no-referrer e Permissions-Policy; preservada CSP sandbox específica do relay IPTV. Origens adicionais de desenvolvimento apenas com `ZEUS_DEVELOPMENT=1`, definido por `npm run dev`.
- Electron restringe navegação à origem da aplicação e recusa permissões não usadas; mantém isolamento de contexto e Node desativado no renderer.
- Chave aparente do protótipo substituída por placeholder. Não foi contactado o fornecedor nem reescrito o histórico.
- Workflow `Checks` em PR/push: typecheck, testes, auditoria de dependências, três regras SAST locais, Gitleaks redigido da árvore atual e build. Actions fixadas por SHA. Workflow macOS também fixado por SHA.
- Electron Builder atualizado para 26.18.0; minimatch vulnerável substituído por 11.0.1 nas cadeias 7–10 via override explícito. Packaging macOS arm64 validado.
- WebTorrent atualizado para 3.0.21 com import ESM lazy, inicialização coalescida e cancelamento. Smoke real offline confirma seed/preload/reprodução Range, sem DHT, trackers, LSD, NAT ou UTP externos.

## Dependência ainda sinalizada — exceção explícita

`npm audit` passou de 17 entradas para **4 entradas transitivas do mesmo advisory**, [GHSA-2p57-rm9w-gvfp](https://github.com/advisories/GHSA-2p57-rm9w-gvfp), em `ip@2.0.1` via `bittorrent-tracker@11.2.3` / WebTorrent 3.0.21. Mesmo a versão atual do tracker mantém a dependência sem correção publicada do pacote ip.

O código oficial exato do tracker usa `ip` apenas em `lib/server/parse-udp.js`, chamando `toString`; não chama `isPublic/isPrivate`, e o Motor não instancia tracker Server. Não foi demonstrado alcance da função vulnerável. **Não foi declarado corrigido o pacote ip.** `npm run audit:dependencies` apresenta o advisory e admite apenas esse ID com estas três versões exatas. Outra versão ou outro advisory falha o check e exige revisão. A exceção não elimina o aviso de `npm audit` nem aceita indiscriminadamente futuros avisos.

## Validação executada

- `npm run typecheck`: passou.
- `npm test`: **178 testes, 178 passaram, zero falhas/skips** na execução final.
- `npm run build`: frontend e API passaram. Aviso existente de chunks grandes (Three/HLS); sem erro de compilação.
- `npm run test:cinema`: Chrome real, caracterização de persistência/lifecycle/HLS passou.
- `npm run test:tv`: desktop/mobile, 24 capturas, listas/visibilidade/pesquisa/guia/retries e formatos MP4/HLS/MPEG-TS/remux simulados, sem erros de consola.
- `npm run test:desktop`: Electron compilado, perfil temporário, criação/TOTP/SQLite/seed/restart e término dos serviços passou.
- Electron Builder 26.18.0, `--mac --arm64 --dir --publish never`, modo sem assinatura: aplicação empacotada criada. Teste `ZEUS_PACKAGED_APP=... npm run test:desktop` passou, sem Node/Docker externos no PATH.
- `npm run audit:dependencies`: 1 advisory único revisto, zero não revistos; exceção acima expressa no output.
- Semgrep com `.semgrep.yml`: 3 regras, 117 ficheiros analisados, zero alertas. Esta cobertura dirigida não substitui o sweep completo anterior.
- Gitleaks 8.30.1 sobre cópia dos ficheiros atuais versionados/por adicionar (sem ignorados locais): zero fugas detetadas. O histórico não foi saneado.
- `git diff --check`: passou.

## Limites e ações operacionais

As alterações estão na working tree, sem commit, push, publicação, assinatura ou notarização. O instalador Intel não foi produzido nesta máquina; o workflow mantém runners por arquitetura. Os checks GitHub foram preparados, não executados remotamente; proteção de branch continua dependente do plano/configuração do repositório.

Se o PostgreSQL antigo estiver em uso com a password anterior, é necessário rodá-la dentro da base existente e atualizar a ligação: alterar Compose não muda passwords já inicializadas. A documentação explica o procedimento. Não foi tocada nenhuma base real.

A chave aparente antiga do protótipo continua no histórico. Se o proprietário confirmar que era uma credencial real, deve revogá-la no fornecedor; não se verificou validade nem se usou a chave. Não foram inventados resultados de rotação.

Recomendações de auditoria contínua, SBOM de cada distribuição, expansão de telemetria e redução adicional de entitlements permanecem melhorias operacionais, não achados exploráveis confirmados. Não foram apresentadas como remediações executadas.
