# Zeus 1.2.1 — interface, pesquisa e reprodução

Pedido de 12 de Novembro de 2026, a partir das 16 capturas do utilizador.

## Alterações

- Leitor TV com barra compacta, canais recolhidos, botão explícito «Controlos», volume, pausa, procura temporal, saltos de 10 segundos e velocidade para filmes/episódios, Picture-in-Picture quando suportado, áudio/legendas e guia. Movimento do ponteiro não revela os controlos em TV nem Cinema.
- Uma tentativa inicial mais cinco reconexões automáticas para canais, com intervalos 1/2/4/8/10 segundos. Arranque/buffering com vigilância de 20 segundos. Progresso real cancela o watchdog; pausar não provoca reconexões. Fechar/trocar cancela a recuperação, liberta o vídeo e fecha a sessão privada. O orçamento não reinicia em cada evento playing, evitando ciclos infinitos. Reinício manual disponível após esgotar tentativas.
- Série e filme partilham a composição de catálogo. Episódios em miniaturas 16:9, cartões de 180–280 px; painel com largura máxima de 1200 px. Barras de deslocamento discretas.
- «Lista IPTV» identifica o seletor antes apresentado apenas como «zeus». As categorias usam o ícone do fornecedor quando fornecido; bandeira do país ou símbolo temático como alternativa.
- Indicador Zeus comum, pequeno e centrado, em carregamentos de conteúdo, navegação, operações demoradas e reprodução; respeita movimento reduzido. O HTML inicial também apresenta feedback antes de React arrancar.
- Pesquisa global e Explorar partilham a mesma interface, com origem Cinema/TV e lista identificadas em cada resultado. Pesquisa em todas as listas, visibilidade respeitada, título/categoria, acentos, pequenos erros de escrita em IPTV, reconhecimento de tipo/género/ano. Aspas preservam títulos literais. Paginação local e carregamento de mais resultados do Cinema; pedidos canceláveis, duas listas em paralelo, estados parciais quando uma fonte falha. Não usa serviços de IA nem promete conhecer conteúdos que os fornecedores não devolvem.
- Novo retrato original de Zeus para Cinema, WebP ~112 KiB, sem recorte em ziguezague; ícone macOS e favicon com retrato de Zeus do original local de 1024 px.
- Escala desktop de 100% por omissão. Migração única da escala antiga automática; alterações manuais posteriores continuam persistentes.

## Três propostas de pesquisa

1. [Oráculo — pesquisa universal](https://p.superdesign.dev/draft/018e581e-fa96-42d3-bc76-b76521dfaa63): campo central, filtros compactos, resultados com origem.
2. [Atlas — duas colunas](https://p.superdesign.dev/draft/e90a5013-5a05-4e76-a529-65ec942e9bf1): separação visual entre Cinema e TV.
3. [Constelação — navegação lateral](https://p.superdesign.dev/draft/fc7f14f9-26c0-4966-9827-2b28706bc9fc): âmbito lateral e lista única.

A implementação aplica a direção compacta da primeira proposta, com duas colunas na página Explorar. Exemplos utilizáveis: `Mr Robot`, `canais Portugal`, `filmes ação 2024`.

## Diagnóstico e evidência

O diagnóstico anterior identificou rejeição de pedidos sem User-Agent pelo fornecedor; essa correção já existia e foi preservada. Nesta revisão, uma prova real sequencial voltou a devolver HTTP 200 para o canal de teste, com cancelamento do corpo e fecho da base de dados. Isso não prova disponibilidade permanente de todos os canais. O defeito local confirmado era ausência de recuperação automática e de limite de espera no leitor.

- TypeScript e build de produção: passaram.
- 146 testes unitários/API: passaram.
- `test:tv`: frames descodificados e avanço temporal em MP4, HLS, MPEG-TS e MP4 fragmentado; 24 capturas a 1440/375 px; sessões, mudanças, guia, visibilidade e cancelamento; sem erros JS.
- `test:ui`: cinco retries exatos, reinício manual, cancelamento ao fechar, watchdog, navegação entre listas e módulos, pesquisa sintética de 100 mil entradas, cartões/overflow e ponteiro; sem erros JS.
- `test:browser`: bootstrap real → TOTP → onboarding e 12 ecrãs a 1440/375 px, em SQLite temporário.
- `test:visual`: contratos do portal TV e geometria dos Estados preservados a 1440/375 px.
- `test:desktop` com o pacote final: primeiro arranque isolado, SQLite, persistência após reinício e encerramento dos serviços próprios, sem Node/Docker externos; passou.
- `test:performance`: orçamentos passaram; JS inicial TV 501.316 bytes, sem bibliotecas de reprodução no carregamento inicial. WebTorrent continua por carregar no Motor inativo.

Capturas locais: `/tmp/zeus-modern-ui`, `/tmp/zeus-tv-browser`. Os testes não alteram os dados do Membro. A aplicação instalada em `/Applications/Zeus.app` não foi substituída nem encerrada.

## Distribuição

`dist/Zeus-1.2.1-arm64.dmg` é o instalador local Apple Silicon. A assinatura Developer ID e notarização Apple continuam dependentes das credenciais de distribuição; não foi publicada uma release. A validação de arquitetura do FFmpeg foi corrigida para a sintaxe real do `lipo` instalado no Mac.
