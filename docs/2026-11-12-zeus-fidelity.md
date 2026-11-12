# Fidelidade ao desenho aprovado

A primeira implementação React alterava a composição aprovada: barra com 82 px em vez de 68 px, fonte global de 16 px em vez de 17 px, títulos serifados, obras com o mesmo enquadramento genérico e rodapé adicional. Esta revisão recupera a estrutura e CSS dos HTML originais em `prototipos/estilo/zeus/`. Os protótipos não foram modificados.

## Ecrãs corrigidos

| Área | Reposição |
| --- | --- |
| Base | Tokens, fonte do sistema, navegação, ícones SVG, pesquisa, menu, espaçamento e adaptação mobile originais |
| Entrada | Busto iluminado pelo cursor, painel de vidro de 400 px, posições e controlos originais; TOTP com seis campos |
| Onboarding | Seis passos, subida ao Olimpo, nuvens, altitude, painel inferior, idiomas ordenados e raio final |
| Portal | Zeus/wordmark centrados, saudação, TV à esquerda e Cinema à direita, cores e último módulo |
| Cinema | Billboard de altura completa, logótipo, metadados, réguas romanas, filas e cartões |
| Explorar | Ulisses, pesquisa, três linhas de filtros e resultados na composição original |
| Título/Leitor | Guerreiro, folha de Fontes, episódios, Medusa na pausa, cursor/luz, SVGs e menus do leitor |
| TV | Recorte de Hermes, palco, separadores Directo/Guia/Favoritos/Listas, grelha EPG, formulários e cartões |
| Conta | Atena, navegação lateral, égide, códigos de recuperação, idiomas e apresentação das legendas |
| Add-ons | Forja, brasas, lista compacta ordenável, catálogo e modais originais |
| Administração | Conselho dos Deuses, estatísticas, tabelas, convites e modais |
| Estados | Relógio, máscaras, ponteiros, quatro painéis e navegação por fragmento |
| Guia | Galeria completa de componentes, arte, luz, nuvens e raios |

Os dados continuam reais. Mensagens de indisponibilidade, listas vazias, estado do Motor, sessão activa e serviços não configurados não são substituídos pelos exemplos fictícios do protótipo. Fontes de vídeo dependem dos Add-ons aprovados; a grelha TV depende do XMLTV do fornecedor. O catálogo de Add-ons que não contenha metadata de tipos/recursos não activa filtros que não possa cumprir.

## Preferências e interacções

- O Portal aguarda a gravação de `lastModule`; falhas são apresentadas e permitem repetir.
- Idiomas de áudio/legendas, tamanho/cor/fundo, autoplay e previews são guardados. O leitor aplica as preferências disponíveis nas faixas da Fonte.
- Os filtros Torrentio de fornecedores e qualidade chegam ao URL de streams, com valores de qualidade validados na API.
- Pesquisa sem resultados mantém o campo acessível. Grupos TV escondidos deixam de aparecer no Directo e no Guia.
- Favoritos são ordenáveis por teclado e ponteiro/toque. EPG usa foco único e setas para mudar programa/canal.
- Efeitos têm limpeza ao desmontar; movimento reduzido permanece respeitado.

## Verificação

Chrome em 1440×900 e 375×900, com capturas comparativas referência/React e estados intermédios. As fixtures de comparação existem apenas nos testes, sem criar dados de demonstração na aplicação.

- Entrada: medidas iguais nos elementos comparados — wordmark, busto, painel, título, inputs, botão e rodapé.
- Portal: medidas iguais no wordmark, saudação, cartões, área de módulos e rodapé.
- Onboarding: medidas iguais no painel, título, footer, CTA e rail.
- TV: teste reproduzível compara posição, dimensão, fonte e radius da navegação, tabs, televisor, Hermes, aura e identificação do canal, com tolerância inferior a 1 px.
- Estados: teste compara posição/dimensão/fonte do relógio, usando o mesmo texto de estado para evitar variações intrínsecas do log fictício original.
- Restantes páginas: comparação visual de capturas, incluindo mobile, modais, configuração de Add-ons, recuperação e pausa do leitor. Não se afirma igualdade pixel a pixel entre estados animados ou catálogos diferentes.

Comandos:

```sh
npm run typecheck
npx tsc --noEmit -p apps/api/tsconfig.json
npm test
npm run build
npm run test:browser
npm run test:visual
node tests/desktop.mjs
```

`test:browser` percorre bootstrap real → configuração TOTP → seis passos do Onboarding via UI, confirma preferências guardadas e abre 12 páginas protegidas nos dois tamanhos. Usa um schema PostgreSQL temporário, removido no fim. `test:visual` não usa a base de dados, cria servidores próprios e grava capturas/medidas em `/tmp/zeus-fidelity`.

Evidência local complementar desta revisão: `/tmp/zeus-fidelity-entry`, `/tmp/zeus-cinema-visual`, `/tmp/zeus-fidelity-management`. Não são dependências de execução nem ficheiros de produção.
