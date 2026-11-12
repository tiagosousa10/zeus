# Zeus autónoma para macOS

Decisão autorizada: Electron + SQLite, API/Motor geridos pela app, distribuição DMG sem Docker/Node externos e sem launchd.

- [x] SQLite incluído no Node/Electron, schema versionado, seed automático e transacções isoladas.
- [x] Migrar a aplicação e testes PostgreSQL para SQLite; validar autenticação/TOTP, concorrência, estado cifrado e IPTV.
- [x] Migração PostgreSQL → SQLite por cópia consistente, verificação de chaves e integridade, sem alterar a origem nem substituir destinos existentes.
- [x] Arranque desktop isolado, instância única e limpeza dos processos; desenvolvimento sem Docker.
- [x] Configuração DMG Apple Silicon/Intel, assinatura/notarização e workflow GitHub manual; artefacto arm64 gerado e validado.
- [x] Gerar e testar artefacto local, documentar instalação/migração e limites de distribuição.

Não publicar nem inventar credenciais Apple. As optimizações anteriores em curso fazem parte da árvore de trabalho e serão preservadas.

Validação: 142 testes, typecheck, build, browser com SQLite (PostgreSQL parado), TV e fidelidade visual. DMG arm64 montado read-only, aplicação lançada e reiniciada com perfil temporário; dados e seed persistidos, processos encerrados. FFmpeg incluído executado e arquivo ASAR inspeccionado sem dados privados. Integridade DMG verificada com hdiutil.

Migração local: 1 utilizador, 1 conta, 1 sessão, 1 TOTP, 1 estado privado, 358 Add-ons e 1 sessão verificada. Origem PostgreSQL preservada; contentor parado. Perfil SQLite vazio anterior preservado em backup antes de activar a cópia migrada.

Pendências externas: certificado Developer ID/notarização (não disponíveis), executar o workflow Intel e publicar os instaladores numa Release. Não foram efectuados commit, push ou publicação nesta tarefa.

Instruções: [Distribuição desktop](../../desktop-distribution.md).
