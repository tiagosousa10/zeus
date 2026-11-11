# Protótipos Zeus

Arrancar a partir da raiz do projecto:

```sh
python3 -m http.server 5173 --bind 127.0.0.1 --directory prototipos/estilo
```

Abrir http://127.0.0.1:5173/zeus/ para escolher entre os 13 ecrãs. O percurso começa em `zeus/entrada.html`, passa pelo Portal e abre Cinema ou TV. As propostas iniciais A/B/C continuam disponíveis na raiz do servidor.

## Estado da retoma — 11 de Novembro de 2026

A sessão anterior parou por limite do fornecedor durante a segunda fase dos protótipos. A retoma completou Administração, verificou os restantes ecrãs e corrigiu catálogo/pesquisa, lista de títulos partilhada, controlos do leitor, EPG e formulários. Nessa fase a pasta ainda não tinha Git; o repositório foi posteriormente inicializado em https://github.com/tiagosousa10/zeus.

Validação: 13 ecrãs a 1440 e 375 px, incluindo movimento reduzido, sem erros JavaScript nem overflow horizontal; sintaxe dos scripts e destinos dos links locais verificados. Exercitados fluxos de Fontes → Leitor, velocidade/pausa/episódios, TV/EPG/favoritos, gestão de Membros/Convites/Add-ons e validação da Conta. Verificados também catálogo indisponível e cancelamento de pesquisas consecutivas. A verificação da TV incluiu eventos DOM; os outros fluxos usaram Playwright num Chrome isolado.

## Limites

- São protótipos HTML/CSS/JS, sem autenticação, API ou base de dados novas. O MacStream original continua nos ficheiros da raiz e em `renderer/`.
- O catálogo consulta o Cinemeta; imagens, GSAP, Three.js e vídeo de demonstração dependem de serviços externos. O Cinema tem dados de recurso se o catálogo falhar.
- O leitor mostra Big Buck Bunny. Fontes, canais, EPG, Motor, sessões, TOTP, Convites e gestão são demonstrações. Não são enviados emails nem feitas instalações reais.
- Algumas preferências e a lista de títulos ficam no armazenamento do browser. Outros controlos só mantêm estado até recarregar a página; não introduzir credenciais reais.
- A importação do MacStream é uma proposta visual: a decisão sobre migração de dados continua em aberto.
- Créditos das obras: `zeus/img/CREDITOS.md`. O Gladiador exige atribuição CC BY 2.0. As imagens originais do Zeus têm resolução limitada.

## Trabalho posterior

A implementação React/Vite + Electron, Hono por módulos MVC, Drizzle/PostgreSQL e Better Auth/TOTP/Turnstile ainda não começou. O Motor local na v1 está documentado em `../../docs/adr/0001-motor-local-na-v1.md`. A criação/sincronização dos tickets no projecto Zeus da equipa TIA do Linear também continua pendente; esta retoma não alterou o Linear.

## Implementação aprovada

Os ecrãs foram aprovados pelo utilizador e implementados em `apps/web/` com API em `apps/api/`. Ver o README da raiz para arrancar a aplicação real na porta 5174. Este diretório mantém os protótipos como referência visual.
