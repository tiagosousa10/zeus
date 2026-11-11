# MacStream (app para Mac)

## Passo 0 — Instalar o Node.js (uma única vez)
1. Vai a https://nodejs.org e descarrega a versão **LTS** (botão verde da esquerda). Instala como qualquer app.
2. Abre o **Terminal** (Cmd+Espaço → escreve "Terminal" → Enter) e confirma:
       node -v
   Tem de aparecer algo como `v20.x.x` (ou superior).

## Passo 1 — Pôr a pasta num sítio fácil
1. Faz duplo clique no `macstream-app.zip` (fica uma pasta `macstream-app`).
2. Arrasta a pasta para a **Secretária** (Desktop).

## Passo 2 — Instalar e testar
No Terminal, copia e cola linha a linha (Enter depois de cada uma):

    cd ~/Desktop/macstream-app
    npm install
    npm start

A primeira linha entra na pasta, a segunda descarrega o que a app precisa (demora 1–3 minutos),
a terceira abre a app. Se a janela do MacStream abrir, está a funcionar.

## Passo 3 — Criar a app definitiva (opcional, mas recomendado)
Com a pasta ainda aberta no Terminal (depois de fechar a app):

    npm run dist

Demora alguns minutos. No fim, abre a pasta `dist/mac/` e arrasta `MacStream.app` para **Aplicações**.

Primeira abertura: como a app não é assinada pela Apple, faz **clique direito → Abrir → Abrir**
(só é preciso uma vez). Se aparecer "está danificada", corre no Terminal:

    xattr -cr /Applications/MacStream.app

(Para Macs Apple Silicon M1/M2/M3 usa `npm run dist:arm` em vez de `npm run dist`.)

## Como usar
- Escolhe um filme/série → clica numa fonte → o botão **⚡ Motor da App** liga-se aos peers
  TCP/UDP/DHT e começa a reproduzir enquanto descarrega (a cache é apagada ao fechar).
- Se vires imagem mas **sem som** (áudio AC3/DTS/EAC3), clica em **🔊 Modo compatibilidade**
  (converte o áudio com ffmpeg; nesse modo não há barra de avanço nem progresso guardado).
- IPTV (Xtream/M3U): funciona sem o problema de CORS do Safari.

## Problemas comuns
- "command not found: npm" → o Node.js não ficou instalado; repete o Passo 0 e abre um Terminal novo.
- Fica a "A ligar aos peers" e depois dá erro de 90 s → esse torrent não tem peers ativos; escolhe outra fonte (mais seeders).
- A app precisa de internet (usa o Tailwind, o Cinemeta e o Torrentio online).

## Notas de desempenho (v1.0.1)
- O motor de torrents corre agora num processo separado (a janela já não bloqueia).
- Tailwind compilado (renderer/tailwind.css) em vez do CDN em runtime. Se mudares classes no index.html:
      npx tailwindcss@3 -c tailwind.config.js -i in.css -o renderer/tailwind.css --minify
  (in.css = as 3 linhas @tailwind base/components/utilities)
- Com o player aberto o resto da UI não é desenhado; sem blur nem animações no player.

## Novidades v1.1.0
- Abrir: duplo clique em `iniciar.command` (ou `npm start`).
- Nome e ícone no Dock/menu em modo dev (opcional, macOS): `npm run brand`.
- Teclas no player: `E` episódios • `I` saltar intro • `[` `]` velocidade • `C` legendas • `F` ecrã inteiro • duplo clique = ecrã inteiro.
- Botão direito num episódio = marcar visto/por ver; botão direito numa temporada = marcar toda.
- Bibliotecas (hls, mpegts, webtorrent) e tipos de letra já vão dentro da app (funciona sem rede para a interface).

## Velocidade dos torrents
- Instala SEM `--omit=optional`: `npm install`. O pacote `utp-native` (opcional) permite ligar a muitos mais peers; se não compilar, a instalação continua sem erro.
- O número de "pessoas a partilhar" vem do índice de fontes e costuma estar desatualizado; o que conta são as "fontes" ligadas no topo do player.
