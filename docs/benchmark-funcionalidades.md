# Benchmark de funcionalidades

Varredura ao Stremio (v5, Web, Android), à Netflix (web, TV) e aos principais leitores IPTV (TiviMate, IPTV Smarters Pro, OTT Navigator, Televizo, UHF, iPlayTV, Sparkle TV, Kodi PVR IPTV Simple, Channels DVR), feita a 2026-11-11.

Prioridade para uma app privada com cerca de 5 Membros: **E** = Essencial, **B** = Bom ter, **D** = Dispensável. Origem: S = Stremio, N = Netflix, I = leitores IPTV. Marcado com ✱ o que melhora uma fraqueza conhecida dos concorrentes.

## 1. Entrada

- **E** · Login com email e password, TOTP e recuperação de password (S).
- **E** · Onboarding curto: idioma de áudio e legendas, chave TMDB, escolha de Add-ons e Listas IPTV.
- **B** · Escolher alguns títulos de que gosta para a Início não começar vazia (N).
- **E** · Estado claro do Motor (ligado, desligado, a arrancar), em vez dos avisos confusos do Stremio Web ✱ (S).

## 2. Portal

- **E** · Escolha do Módulo (Cinema ou TV), com o último usado em destaque.
- **B** · Retomar directamente o último título ou Canal a partir do Portal (I: abrir já a tocar).

## 3. Início (Cinema)

- **E** · Billboard de ecrã inteiro com logótipo, sinopse, «Reproduzir» e «Mais informações» (N).
- **B** · Trailer automático sem som no billboard, com interruptor e respeito por «reduzir movimento» (N).
- **E** · Fila «Continuar a ver» com barra de progresso, T1:E3 e remover da fila (N, S).
- **E** · Fila e página «A minha lista», com + e ✓ em qualquer cartão (N, S).
- **E** · Filas por catálogo de Add-on, por género e «Adicionados recentemente», cada uma com «ver tudo» (N, S).
- **B** · «Porque viste X» e «Mais vistos cá em casa» (N).
- **B** · Selo «Novo episódio» nas séries que o Membro segue (S, N).

## 4. Cartão de título

- **E** · Mini-modal ao pousar o rato (≈450 ms de atraso, ≈1,45× em ≈275 ms ease-out, fecho em ≈175 ms), a crescer para dentro nas pontas da fila (N).
- **E** · Acções rápidas: reproduzir, + lista, avaliar e mais informações (N).
- **E** · Equivalente por teclado: foco com Tab ou setas abre o cartão, Enter abre o detalhe (N).
- **E** · Skeletons enquanto as imagens carregam (N).

## 5. Explorar e pesquisa

- **E** · Grelha com filtros por tipo, catálogo, género e ano, a partir dos `extra` do manifesto (S).
- **E** · Pesquisa instantânea em todos os catálogos, tolerante a erros e acentos (N, S).
- **B** · Pesquisa por pessoa e histórico de pesquisas (S, N).
- **B** · Colar um magnet ou URL e reproduzir directamente (S).

## 6. Detalhe do título

- **E** · Modal sobre a página, com URL próprio e fecho por Esc, sem perder a posição da fila (N).
- **E** · Metadados: ano, duração, rating IMDb, géneros, elenco e realizador clicáveis (S, N).
- **E** · Temporadas e episódios com miniatura, data, «Em breve» e progresso; marcar como visto até aqui (S, N).
- **B** · Trailer e «Mais títulos como este» (S, N).

## 7. Fontes

- **E** · Ler o título de cada Fonte e mostrar chips (4K/HDR/DV, codec, tamanho, seeders, idioma) com ordenação e filtros próprios ✱ (S).
- **E** · Selo visual «em cache no Debrid» e filtro «só em cache» ✱ (S).
- **E** · Resultados progressivos («3 de 5 Add-ons responderam») (S).
- **B** · Marcar a última Fonte usada e menu para copiar magnet ou link (S).

## 8. Leitor

- **E** · Retomar exactamente onde parou, sincronizado entre dispositivos (N, S, I).
- **E** · Menu único de áudio e legendas, com a escolha mantida entre episódios (N, S).
- **E** · Atraso de legendas em passos de 100 ms e legendas do OpenSubtitles (S).
- **E** · Próximo episódio com contagem decrescente e autoplay com «Ainda está a ver?» (N, S).
- **E** · Painel de episódios dentro do leitor e controlos que se escondem após ≈3 s (N).
- **E** · Atalhos: espaço, F, M, setas, Esc e `?` para a ajuda (N, S).
- **B** · Saltar intro e resumo com marcadores do IntroDB ✱ (N, S).
- **B** · Miniaturas ao arrastar a barra, aparência das legendas, velocidade e estatísticas do Motor (N, S).
- **B** · AirPlay e abrir num leitor externo (IINA, VLC) sem perder o progresso ✱ (S, I).

## 9. TV (IPTV)

- **E** · Adicionar Lista IPTV por Xtream ou M3U, com EPG XMLTV e desvio horário (I).
- **E** · Actualização automática da lista e do EPG, com carregamento por partes para listas grandes ✱ (I).
- **E** · Grupos, favoritos, esconder, reordenar e renomear grupos e Canais (I).
- **E** · Pesquisa única em Canais, filmes, séries e programas do EPG (I).
- **E** · Guia em grelha com linha do «agora», agora/a seguir e saltos por dia (I).
- **E** · Mudança de Canal rápida (alvo < 2 s) com overlay de agora/a seguir (I).
- **E** · Reconexão automática silenciosa (I).
- **E** · VOD e séries Xtream com «Continuar a ver» (I).
- **E** · Filas ao estilo Netflix: «Em directo agora», favoritos e recentes, com selo «EM DIRECTO» (N).
- **B** · Catch-up a partir da grelha, quando o fornecedor o permitir (I).
- **B** · Picture-in-picture e informação técnica do stream (I).
- **D** · Multiview, DVR e controlo parental (I).

## 10. Add-ons

- **E** · Catálogo de Add-ons com pesquisa e filtro por tipo (S).
- **E** · Instalar, configurar e remover, com ordem por drag & drop persistente ✱ (S).
- **B** · Detalhe do Add-on: versão, tipos, recursos e aviso de confiança (S).

## 11. Conta e definições

- **E** · Idiomas de áudio e legendas por omissão, autoplay e pré-visualizações (N, S).
- **E** · Sessões activas com revogação (N).
- **B** · Histórico de visualização, ocultar do histórico e avaliações (N).
- **B** · Calendário de próximos episódios e notificações de novo episódio (S, N).
- **B** · Integração com Trakt (S, I).

## 12. Acessibilidade e movimento

- **E** · Respeitar `prefers-reduced-motion` e pré-visualizações sempre sem som (N).
- **E** · Anel de foco visível, rótulos acessíveis e testes com o VoiceOver (N).

## Notas técnicas que afectam decisões

- No browser, o IPTV `http` e sem CORS só toca através de um proxy; no Electron não há este problema.
- Partilhar a mesma Lista IPTV por várias pessoas esgota o limite de ligações (`max_connections`) do fornecedor.
