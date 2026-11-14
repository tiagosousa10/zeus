# Contribuir para a Zeus

Ler primeiro [Arquitetura e desenvolvimento](docs/architecture.md), o vocabulário em `CONTEXT.md` e a especificação da funcionalidade em `docs/superpowers/specs/`.

## Preparar

Node.js 24 ou superior. Executar `npm ci` na raiz: há um único `package-lock.json`, partilhado pelas aplicações. As dependências e os comandos de integração são geridos no `package.json` da raiz. Não criar lockfiles independentes nas aplicações.

## Alterar

- Registar primeiro a tarefa no Storm Tickets (team TIA, projeto Zeus), com critérios e dependências; usar uma branch/worktree por tarefa, identificada pelo ticket.
- Criar commits locais e entregar branch/base, validação e texto do PR; push, criação/aprovação e merge do PR pertencem ao utilizador.
- Associar o PR ao ticket após integração e só concluir após entrega e validação.
- Colocar comportamento perto da funcionalidade que o possui; respeitar a direção das dependências descrita na arquitetura.
- Usar contratos em `packages/contracts` quando dados atravessam API/web. Não importar código interno de outra aplicação.
- Preferir funções pequenas, nomes do domínio e composição. Criar uma abstração quando esconde uma responsabilidade real ou duas implementações realmente variam.
- Não misturar refatoração visual com mudanças de comportamento. Preservar os protótipos aprovados.
- Em correções, acrescentar uma regressão que falhe antes da alteração e passe depois. Testar o comportamento público, incluindo cancelamento, concorrência e autorização quando aplicáveis.
- Usar perfis temporários e fornecedores simulados. Não incluir segredos, dados privados ou fixtures copiados de produção.

## Verificar

```sh
npm run format
npm run lint:fix
npm run check
```

`lint:fix` não resolve todos os problemas: rever o diff e corrigir o restante explicitamente. Não desativar regras globalmente só para obter um build verde. Uma exceção localizada precisa de razão concreta.

Para alterações ao leitor/TV, executar `npm run test:cinema` e/ou `npm run test:tv`. Para processos Electron, IPC, configuração ou caminhos de distribuição, executar `npm run test:desktop`; alterações de empacotamento exigem também testar o pacote real. Os requisitos dos testes browser estão no README.

## Rever e distribuir

A PR descreve o problema, o comportamento resultante, os testes executados e limitações conhecidas. O workflow Checks verifica formatação, lint, types, testes, segurança e build em PR/push. A proteção de merge deve exigir checks verdes quando o plano/configuração GitHub o permitir.

A geração dos instaladores macOS é manual, por arquitetura, no workflow de distribuição. Publicação, assinatura e notarização não são implícitas numa alteração ao código. Nunca publicar um artefacto de teste como release assinada.
