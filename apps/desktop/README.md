# Desktop Zeus

Electron apresenta o frontend compilado e gere os processos locais da API e do Motor. O domínio e a persistência de Membros pertencem à API; este pacote trata da integração nativa e da reprodução torrent.

## Estrutura

- `src/main.js`: bootstrap e composição da aplicação; single-instance lock e eventos de arranque/saída.
- `src/controllers/window-controller.js`: janela, geometria persistida, navegação e permissões do renderer.
- `src/controllers/ipc-controller.js`: operações nativas expostas ao renderer, bloqueio de suspensão e eventos de bateria, com limpeza no encerramento.
- `src/services/desktop-runtime.js`: lifecycle dos processos API/Motor, portas loopback persistidas e ambientes mínimos.
- `src/preload.js`: bridge explícita de IPC; sem acesso genérico ao Node, filesystem ou processos.
- `src/engine.js`: composição do Motor e controller HTTP autenticado; preserva a interface `startEngine` usada pelo processo e pelos testes.
- `src/services/torrent-service.js`: cliente WebTorrent lazy, cancelamento, seleção, preload e limites de upload.
- `src/services/media-service.js`: FFmpeg, metadados, transcodificação e limpeza de processos nativos.
- `src/engine-process.js`: bootstrap do utility process do Motor.
- `scripts/`: ferramentas de desenvolvimento, ícones e empacotamento; `electron-builder.cjs`: manifesto do artefacto.

A configuração de perfil e a seleção de variáveis de ambiente são partilhadas com a API em `packages/local-config`; não duplicar essas regras aqui. Os módulos recebem apenas as dependências que variam: Electron no lifecycle/IPC e uma fábrica de cliente no Motor. Não há container de injeção nem classes de encaminhamento.

## Verificação

Na raiz do repositório:

```sh
npx tsx --test apps/desktop/test/*.test.ts
npm run test:desktop
```

Os testes do Motor incluem um cliente WebTorrent real com dados sintéticos locais e descoberta de peers desativada. O teste Electron usa perfil temporário, verifica arranque, persistência, restart e encerramento dos processos. Não usar o perfil pessoal para testes. O empacotamento inclui `src/**/*`, abrangendo os controllers e services sem uma segunda lista de módulos.
