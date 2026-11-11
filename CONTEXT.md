# Zeus

Aplicação privada, para desktop e web, para ver filmes, séries e canais de IPTV a partir de várias fontes.

## Language

### Pessoas e acesso

**Membro**:
Pessoa com conta na aplicação, que só existe porque aceitou um Convite.
_Avoid_: Utilizador, cliente, user, Perfil (não há Perfis: cada pessoa é um Membro)

**Administrador**:
Membro que pode emitir Convites, desactivar Membros e gerir o que é partilhado por todos; o primeiro Membro é sempre Administrador.
_Avoid_: Admin, owner, superuser

**Convite**:
Autorização de uso único, emitida por um Administrador, que permite a uma pessoa criar a sua conta.
_Avoid_: Invite link, registo

### Navegação

**Portal**:
Ecrã que o Membro vê depois de entrar, onde escolhe para que Módulo quer ir.
_Avoid_: Launcher, hub, dashboard, painel de entrada

**Módulo**:
Área autónoma da aplicação com a sua própria navegação, escolhida no Portal.
_Avoid_: Workspace, secção, app

**Cinema**:
Módulo dos filmes e séries obtidos através de Add-ons.
_Avoid_: Cine, Stremio, VOD

**TV**:
Módulo dos Canais em directo e do conteúdo das Listas IPTV do Membro.
_Avoid_: IPTV (como nome do Módulo), Pro, Live

### IPTV

**Lista IPTV**:
Ligação de um Membro a um fornecedor de IPTV (Xtream ou M3U), privada e invisível para os restantes Membros.
_Avoid_: Playlist, subscrição, fonte IPTV

**Canal**:
Emissão em directo disponível numa Lista IPTV.
_Avoid_: Stream, live

### Add-ons

**Add-on**:
Serviço externo, compatível com o protocolo Stremio, que fornece catálogos, metadados, Fontes ou legendas.
_Avoid_: Plugin, extensão, addon

**Catálogo de Add-ons**:
Lista de todos os Add-ons conhecidos, importada de um registo público, em que cada Add-on está pendente, aprovado ou rejeitado pelo Administrador.
_Avoid_: Loja, marketplace, registo

**Add-on instalado**:
Add-on aprovado que um Membro escolheu usar, com a sua configuração privada.
_Avoid_: Add-on activo, subscrição

### Reprodução

**Fonte**:
Forma concreta de obter o vídeo de um filme ou episódio, devolvida por um Add-on: um torrent ou um link directo.
_Avoid_: Stream, link, source

**Motor**:
Serviço que obtém o vídeo de uma Fonte ou de um Canal e o entrega por HTTP ao leitor.
_Avoid_: Engine, servidor de torrents, streaming server, backend

## Escolhas aprovadas — 11 de Novembro de 2026

O utilizador aprovou todos os ecrãs artísticos Zeus e pediu a implementação. A direção definitiva é Apple TV escuro + organização Netflix + arte mitológica animada. Não reabrir a seleção A/B/C. Especificação e decisões: `docs/superpowers/specs/2026-11-11-zeus-approved.md`.
