# TV do Zeus: IPTV com Ao vivo, Séries e Filmes — desenho

Data: 2026-11-12. Estado: aprovado em conversa (direcção, linguagem e ecrãs); este documento fixa o que se constrói.
Referência visual obrigatória: [`2026-11-12-tv-iptv/tv-c-final.html`](2026-11-12-tv-iptv/tv-c-final.html) (sistema final e os 8 ecrãs harmonizados) e [`tv-c-guia.html`](2026-11-12-tv-iptv/tv-c-guia.html) (9.º ecrã, guia). Contexto: [`tv-c-ecras.html`](2026-11-12-tv-iptv/tv-c-ecras.html) (percurso completo) e [`tv-c-variantes.html`](2026-11-12-tv-iptv/tv-c-variantes.html) (as 24 variantes de onde saíram as escolhas). Abrir com um servidor estático na pasta, ou directamente no browser.

## Intenção

O utilizador tem uma lista IPTV Xtream grande (49 586 canais em ~42 pastas, mais Filmes e Séries). As apps que usava antes são «arcaicas» no design e na usabilidade. Quer que a TV do Zeus mostre tudo o que a lista tem, organizado pelas pastas da própria lista, com o mesmo nível artístico do resto do Zeus (Apple TV escuro + arte mitológica realista).

Tudo o que vem da IPTV vive dentro da TV. O Cinema (Stremio/Add-ons) fica completamente separado: nada da IPTV aparece no Cinema e vice-versa.

## Objectivos

1. Três secções dentro da TV, por omissão: **Ao vivo**, **Séries** e **Filmes**. Cada secção só aparece se a lista tiver esse tipo de conteúdo (dinâmico por lista).
2. **Pastas dinâmicas**: as categorias da lista (Portugal, Exclusivos, Brasil, Espanha…) viram «portais». Nomes limpos dos enfeites (ex.: `★●· PORTUGAL ●·★` → «Portugal»).
3. **Extrair todos os dados** que a lista disponibiliza: categorias e canais ao vivo, guia (EPG), filmes (capa, sinopse, ano, duração, nota, elenco, qualidade), séries (capa, sinopse, temporadas, episódios com miniatura e sinopse).
4. Os 9 ecrãs aprovados (ver «Ecrãs»), coesos entre si, em desktop, Electron e telemóvel (375 px).
5. Reproduzir canais, filmes e episódios no leitor do Zeus, com progresso guardado por Membro (filmes e episódios) e favoritos (canais, filmes, séries).
6. Gestão de pastas: fixar (até 4), ordenar, esconder — por secção.

## Não-objectivos (desta versão)

- Juntar a IPTV ao Cinema, à pesquisa do Cinema ou aos Add-ons.
- Gravação (DVR), catch-up/«timeshift» (`tv_archive`), multiview.
- Editar a lista do fornecedor; o Zeus só lê.
- Logótipos de marca desenhados por nós: os logótipos vêm da lista; sem logótipo usa-se um monograma.

## Anti-objectivos (falha mesmo que «funcione»)

- Parecer uma app IPTV genérica: listas cinzentas, tabelas densas, ícones de sistema, cores de bandeira saturadas a toda a página.
- Cada ecrã com estilo próprio (mistura de ouro, néon e vidro sem regra).
- Lentidão: abrir a TV não pode descarregar 50 mil canais para o browser de cada vez, nem bloquear o ecrã enquanto carrega.
- Mostrar conteúdo adulto sem o Membro o pedir.
- Credenciais da lista em registos, no histórico do browser ou visíveis no ecrã.

## Decisões do utilizador

- Direcção **C · Portais do Olimpo** (entrada cinematográfica; pastas como portais; Séries/Filmes com cartazes).
- Guia de programação mantém-se como 9.º ecrã, no mesmo estilo de vidro (resposta do utilizador ao revisor).
- Linguagem por ecrã (escolha explícita): 1 Portal **II**, 2 Leitor **II**, 3 Séries **III**, 4 Série **II**, 5 Filmes **III**, 6 Filme **II**, 7 Pesquisa **II**, 8 Pastas **II**.
  - **II · Vidro de Hermes**: vidro, aurora, brilho ciano, profundidade.
  - **III · Constelação**: editorial, números enormes em contorno, título gigante, Top 10, mosaico «bento».
- Separação total entre IPTV e Stremio.
- Verificação de coesão pedida e aceite: os ajustes de harmonização abaixo fazem parte do desenho.

## Sistema visual (vale para todos os ecrãs)

Implementar como tokens e componentes partilhados do módulo TV (o resto do Zeus mantém-se). Valores de referência no mockup final.

- **Fundo**: `#04070a` com **aurora**: dois brilhos radiais com cores do conteúdo + brilho ciano em baixo. Origem das cores: bandeira da pasta (quando o nome corresponde a um país), cores dominantes da capa (série/filme em destaque), ou ciano do Zeus quando não houver.
- **Vidro em 3 níveis**: nível 1 cartões (`rgba(30,32,36,.46)`, blur 22 px), nível 2 docas e painéis (`.62`, blur 30 px, sombra), nível 3 modais (`.78`, blur 40 px, sombra forte). Nunca mais de dois níveis visíveis ao mesmo tempo.
- **Cor de acção única**: ciano `#7de3f0` só para foco, progresso, chip/botão activo. Vermelho `#ff453a` só para «em directo». Sem ouro neste módulo.
- **Tipografia**: SF Pro / sistema; títulos 700–800 com tracking negativo; etiquetas mono em maiúsculas com espaçamento largo; **números em contorno** (traço 1–1,5 px, sem preenchimento) como ponte entre II e III: contagem da pasta («207»), nº do canal («001»), Top 10, contagens de categoria e de pastas.
- **Componentes partilhados**: barra de topo em cápsulas de vidro (ZEUS · Cinema/TV · Ao vivo/Séries/Filmes · Procurar ⌘K · conta), cartão de canal (logótipo, nome, programa actual, seguinte, **anel de progresso**, estrela), cartaz com barra de progresso, chip, botão branco/vidro, anel «Continuar», interruptor, linha de resultado.
- **Movimento**: foco = sobe 4 px, escala 1,02, contorno e brilho ciano. Abrir modal = desfoca/escurece o fundo. Cartaz → detalhe = a capa «voa» para o seu lugar (transição partilhada). Leitor: informação desaparece aos 3 s; volta com rato/toque/setas. Respeitar `prefers-reduced-motion` (sem voo, sem escalas; só opacidade).
- **Acessibilidade**: tudo navegável por teclado e comando (setas, Enter, Esc, ⌘K); foco sempre visível; contraste AA nos textos sobre aurora/vidro.

## Ecrãs

Rotas novas dentro de `/tv` (nomes finais à escolha do construtor, em PT-PT e coerentes com as existentes).

1. **Ao vivo — portais e portal de uma pasta** (II). Entrada: hero com arte e totais (canais, pastas), portais fixados em grande e depois os restantes. Dentro do portal: título grande + contagem em contorno, pesquisa só nesta pasta, chips de filtro (Todos, Favoritos, e etiquetas derivadas dos nomes dos canais: HD, FHD/4K, Notícias, Desporto, Infantis… só as que existirem), botão «Pastas», grelha de cartões de canal. O canal em foco acende.
2. **Leitor ao vivo** (II). Vídeo em ecrã inteiro; cápsula de vidro com canal (nº em contorno), programa, horário e anel; botões Legendas/Áudio/Ecrã inteiro; doca de vidro com carrossel dos canais da pasta (setas ← → mudam de canal sem sair; Esc volta ao portal). Guia do canal quando houver EPG.
3. **Séries — entrada** (III harmonizado). Título gigante da série em destaque, metadados, «Continuar»/«Episódios», chips das categorias de séries da lista com contagem, **Top 10** com números em contorno; por baixo, filas em vidro: Continuar a ver, Adicionadas recentemente, categorias fixadas.
4. **Detalhe de série** (II). Capa desfocada como fundo; painel de vidro nível 2 com capa, botão «T1 · E4», favorito, sinopse, chips (ano, temporadas, nota, idade), separadores de temporada e episódios em cartões com miniatura, progresso; vistos esbatidos.
5. **Filmes — entrada** (III harmonizado). Mosaico «bento»: destaque grande (Reproduzir/Detalhes), cartazes de tamanhos diferentes e cartões de categoria em vidro com contagem em contorno; por baixo, filas por categoria e Continuar a ver.
6. **Detalhe de filme** (II). Imagem livre à esquerda; cartão de vidro flutuante à direita com etiquetas, sinopse, anel «Continuar» (minutos), «Do início», favorito, elenco quando existir.
7. **Pesquisa ⌘K** (II, modal nível 3). Abre em qualquer ecrã da TV. Resultados agrupados Canais / Séries / Filmes com contagens, termo realçado, âmbito «Tudo» ou só a pasta actual, navegação ↑↓ ↵ esc. Pesquisa instantânea (sem esperar pela rede enquanto se escreve).
8. **Gerir pastas** (II, folha modal nível 3). Separadores Ao vivo / Séries / Filmes; cartões arrastáveis com bandeira/cor, contagem em contorno, interruptor mostrar/esconder, até 4 fixadas, «Concluído».
9. **Guia de programação** (II; mockup [`tv-c-guia.html`](2026-11-12-tv-iptv/tv-c-guia.html)). Substitui a grelha da TV actual, no mesmo vidro: separador «Portais | Guia» dentro de Ao vivo; canais em linhas (cartão de vidro nível 1 com número em contorno, logótipo e nome), horas em colunas, linha vermelha do «agora» com a hora, programa em curso aceso a ciano com barra de progresso; chips de dia (ontem, hoje, próximos dias que o guia tiver), filtro de pasta, «Só favoritos» e botão «Agora». Setas movem entre programas e canais; Enter num programa a dar abre o leitor, num programa futuro mostra a ficha (título, horário, descrição). Grelha virtualizada. No telemóvel vira lista de canais com agora/seguinte.

**Telemóvel (375 px)**: barra compacta, cartões de canal em lista, doca do leitor horizontal, detalhe de série em coluna (ver mockup). Sem overflow horizontal.

**Estados**: sem listas (convite para adicionar lista, como hoje), a carregar (esqueletos em vidro, nunca ecrã vazio), erro do fornecedor (mensagem PT-PT clara + tentar de novo), secção vazia, sem guia («Sem guia» no cartão), pasta sem canais.

## Dados

### A lista real (medida a 2026-11-12, sem registar credenciais)

- Xtream activo; formatos `m3u8` e `ts`; **1 ligação simultânea**.
- Ao vivo: 16 categorias, 4 999 canais (1,6 MB, 0,4 s); 2 824 com `epg_channel_id`; 1 categoria adulta.
- Filmes: 19 categorias, 4 594 filmes (3,7 MB); contentores mp4 4 240, mkv 352, avi 2. `get_vod_info` traz capa, fundo, sinopse, elenco, realizador, género, duração, nota, idade, trailer e TMDB id.
- Séries: 28 categorias, 1 226 séries (1,0 MB); `get_series_info` traz temporadas e episódios (mp4 na amostra).
- `get_short_epg` responde; `xmltv.php` tem **42,5 MB**.
- O fornecedor **não envia CORS**: o browser não pode ler a lista nem o HLS directamente.

### Leitura da lista

- **Xtream** (`player_api.php`): `get_live_categories`, `get_live_streams`, `get_vod_categories`, `get_vod_streams`, `get_vod_info`, `get_series_categories`, `get_series`, `get_series_info`; guia por `get_short_epg` (canal em foco/leitor) e/ou `xmltv.php` quando não houver `epgUrl` explícito. As pastas usam os **nomes** das categorias (hoje o Zeus mostra o `category_id`).
- **M3U**: canais pelo `group-title`. Filmes/Séries quando a lista os trouxer no M3U (URLs com `/movie/` ou `/series/`, ou grupos com esses nomes); sem isso, a lista M3U só tem Ao vivo.
- **Várias listas**: mantém-se o seletor de lista existente; as secções e pastas são da lista activa. Não há fusão de listas nesta versão.

### Na API (servidor)

- O pedido ao fornecedor faz-se na API (como hoje, com `safeFetch`), nunca no browser.
- **Cache por lista** em memória/disco local com validade (ex.: catálogo 6–12 h, EPG 1 h), para a TV abrir sem voltar a descarregar tudo; botão «Actualizar lista» força a releitura.
- **Respostas por partes**: categorias com contagens; canais/filmes/séries **por categoria e paginados**; detalhe de série/filme sob pedido; um **índice compacto para a pesquisa** (id, tipo, nome, pasta) descarregado uma vez e guardado no browser.
- **Normalização** num só formato do Zeus (canal, filme, série, episódio, categoria), com testes, para os ecrãs não conhecerem o formato do fornecedor.

### No estado cifrado do Membro

- Por lista: pastas fixadas/ordem/escondidas por secção, favoritos (canais, filmes, séries), progresso de filmes e episódios, último canal. Nada disto altera a lista do fornecedor.
- **Adultos**: categorias cujo nome contenha termos de conteúdo adulto (ex.: adult, adultos, xxx, 18+, +18, for adults, porn) começam **escondidas**; o Membro pode mostrá-las em «Gerir pastas». O mesmo teste aplica-se aos nomes de canais, filmes e séries dentro de pastas normais (escondidos com a pasta adulta).
- **Escondido é escondido em todo o lado**: pastas e itens escondidos não entram na pesquisa ⌘K, no Top 10, nos destaques, no mosaico nem nas contagens principais (as contagens indicam «N escondidas» à parte). A filtragem faz-se no servidor por Membro, e o índice de pesquisa no browser renova-se quando a visibilidade muda.
- **Países**: detecção de país pelo nome da pasta (PT/EN/ES/FR: «Portugal», «Brasil/Brazil», «Spain/Espanha», «France/França», «Belgium/Bélgica», «Holanda/Netherlands»…), para a bandeira e a aurora; sem correspondência usa o ciano.

### Reprodução

- Ao vivo: HLS com `hls.js` (já usado) e, quando o fornecedor só der MPEG-TS, `mpegts.js` ou pedir `.m3u8` ao fornecedor Xtream.
- Filmes/episódios: ficheiro directo do fornecedor (mp4/mkv) no leitor do Zeus; progresso gravado como no Cinema mas em espaço próprio da IPTV.
- **Toda a reprodução IPTV passa pela API/Motor** (o fornecedor não envia CORS): a API serve o HLS/TS e os ficheiros com pedidos parciais (Range), reescrevendo as listas `.m3u8`. As credenciais ficam no servidor e nunca chegam ao browser.
- **mkv/avi** (8 % dos filmes): remux com o ffmpeg que o Motor já usa para torrents; mp4 directo pelo proxy.
- **1 ligação simultânea**: ao mudar de canal ou abrir um filme, a ligação anterior fecha-se primeiro; se o fornecedor recusar por excesso de ligações, mensagem clara em PT-PT.
- **Guia**: o `xmltv.php` (42 MB) é lido e indexado no servidor e guardado em cache (1 h); os cartões recebem só «agora/seguinte» das pastas pedidas. `get_short_epg` fica como recurso para canais sem correspondência.

## Restrições

- Stack existente: React/Vite (TanStack Router/Query), GSAP/Three.js disponíveis, API Hono, estado do Membro cifrado em PostgreSQL. PT-PT em toda a UI.
- Respeitar a direcção visual aprovada do Zeus (`2026-11-11-zeus-approved.md`) e a arte realista (nada de pinturas clássicas).
- Não quebrar o resto: Cinema, Add-ons, Conta, Admin e o teste completo no browser (`npm run test:browser`).
- Desempenho: 50 mil canais sem bloquear a UI (virtualizar grelhas/listas longas; carregar por categoria).
- Fase 1 local (127.0.0.1 / Electron); sem dependências de serviços externos além do fornecedor IPTV.

## Decisões minhas (para o utilizador validar ao ler)

1. Números em contorno também nos ecrãs de vidro; entradas III com aurora e chips de vidro (harmonização).
2. Aurora a partir da bandeira/capa; ciano quando não houver.
3. Pastas de adultos escondidas por omissão.
4. Até 4 pastas fixadas por secção.
5. Leitor ao vivo abre em ecrã inteiro; Esc volta ao portal.
6. Cache local da lista com «Actualizar lista» manual.
7. Sem fusão de várias listas; seletor da lista activa.
8. Reprodução sempre pela API/Motor (sem CORS no fornecedor; credenciais no servidor); mkv/avi por remux ffmpeg.
9. «Escondido» vale para pesquisa, Top 10, destaques e contagens; filtro de adultos também por nome de item.
10. Gestão de listas (adicionar, editar, apagar, «Actualizar lista») num modal de vidro «Listas IPTV», aberto a partir da entrada da TV e do estado vazio.

## Correcções ao mockup (verificação visual de 2026-11-12)

O mockup é a referência, mas estes defeitos não passam para a implementação:

- Números em contorno: a SF Pro variável mostra contornos internos sobrepostos (um «risco» dentro do «2»); usar uma fonte estática ou SVG para estes números.
- Arte do leitor: a imagem de Zeus com anjinhos parece pintura clássica; usar arte realista, como no resto do Zeus.
- Doca do leitor: os cartões não podem ficar cortados; nome e número do canal sempre visíveis.
- Episódios e canais em sequência (sem saltos como no mockup) e miniaturas de episódio que pareçam cenas, não recortes de estátuas.
- Gerir pastas: a folha ajusta-se ao conteúdo, sem metade vazia.
- Telemóvel: a contagem em contorno não pode passar da margem.

## Deixado ao construtor

- Nomes de rotas e de componentes, divisão em ficheiros, biblioteca de virtualização.
- Algoritmo de cor dominante da capa e mapa de cores de bandeiras.
- Heurística das etiquetas de filtro (HD, Notícias…) a partir dos nomes.
- Formato exacto da cache e tempos de validade dentro dos intervalos indicados.
- Como compor o Top 10 (ex.: mais recentes/«added» da lista ou mais vistos pelo Membro) quando o fornecedor não der popularidade.

## Verificação esperada

- Testes unitários: normalização Xtream/M3U, limpeza de nomes de pastas, detecção de país e de adultos, etiquetas de filtro.
- Testes da API com um fornecedor Xtream falso (categorias, paginação, detalhe, cache, erros).
- Teste no browser com a lista falsa: os 9 ecrãs a 1440 e 375 px, teclado (setas, Enter, Esc, ⌘K), sem overflow nem erros de consola.
- Comparação visual com `tv-c-final.html`.
- Verificação manual com a lista real do utilizador (sem registar credenciais).
