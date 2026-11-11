# Sistema Zeus

Tudo o que um ecrã novo precisa: `zeus.css` (tokens e componentes), `fx.js` (efeitos), `nav.js` (barra de topo). Exemplos vivos de cada peça em `../guia.html`: copia os padrões de lá.

## Cabeça da página

```html
<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Zeus, Cinema</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="shared/zeus.css">
</head>
<body>
<main class="z-page">…</main>
<!-- modais (.z-modal) fora do <main> -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" integrity="sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" integrity="sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu" crossorigin="anonymous"></script><!-- só se usar livingPainting ou clouds -->
<script type="module">
import { mountNav } from './shared/nav.js';
import { rows, modal, toast, reveal } from './shared/fx.js';
import { loadData, poster, backdrop } from '../data.js';
mountNav({ active: 'cinema', page: 'inicio' });
</script>
</body>
</html>
```

## Barra de topo

`mountNav({ active: 'cinema' | 'tv', page })` injeta o `<header class="z-nav">` no topo do `body` e devolve `{ el, setMotor(state, label?), destroy }`.
`page` marca o link atual: `inicio`, `explorar`, `lista`, `canais`, `guia`, `conta`, `addons`, `admin`.
`setMotor('ok' | 'busy' | 'off')` muda o chip do Motor. Usa `.z-page` (ou `padding-top: var(--nav-h)`) quando o ecrã não abre com uma imagem por baixo da barra.

## Classes

- Tipografia: `.z-display`, `.z-t1`, `.z-t2`, `.z-t3`, `.z-lede`, `.z-callout`, `.z-foot`, `.z-muted`, `.z-faint`, `.z-num`.
- Superfícies: `.z-glass` (+ `.z-panel`), `.z-surface`, `.z-divider`.
- Botões: `.z-btn` com `--primary` (um por zona), `--secondary`, `--ghost`, `--danger`, `--sm`, `--block`; `aria-busy="true"` mostra o spinner; `.z-icon-btn`, `.z-link`.
- Campos: `.z-field > .z-label + .z-input` (`--mono`, `aria-invalid`), `.z-input-wrap`, `.z-help(.is-error|.is-ok)`, `.z-msg`, `.z-search`.
- Escolhas: `.z-chip[aria-pressed]` + `.z-chip__n`, `.z-switch[role=switch][aria-checked]`, `.z-seg` (rádios ou links com `aria-current`), `.z-tabs`.
- Dados: `.z-tag` (`--mono`, `--strong`, `--cache`, `--gold`), `.z-badge--live` («EM DIRECTO»), `--cache` («em cache»), `--last` («Último usado»), `.z-status[data-state]`, `.z-progress` com `--p`.
- Filas: `.z-row > .z-row__title + .z-track > .z-card.z-card--poster|--wide > .z-card__art > img + .z-card__fallback`. Os dados da pré-visualização vão em `data-title`, `data-meta` (separado por `|`), `data-backdrop`, `data-progress`. Depois `rows(contentor)`; as ações chegam como evento `z:action`.
- Modal: `.z-modal[hidden] > .z-scrim[data-close] + .z-sheet[role=dialog]` com `.z-sheet__close`, `.z-sheet__hero`, `.z-sheet__body`; `modal(el).open(origem)`. Fontes: `.z-src-list > .z-src`.
- Esqueletos: `.z-sk`, `--title`, `--line`. Aviso: `toast('Adicionado à tua lista.')`.
- Arte: `.z-art` (`--left`, `--right`, `--billboard`, `--center`, `--fixed`, `.is-muted`, `.is-dim`) com `<img>`; enquadramento em `--pos` ou `.z-pos-top|face|left|right|bottom`; máscaras `.z-mask-x|y|radial|b`; camadas `.z-vignette`, `.z-grain`, `.z-bolts`, `.z-flash`.
- Cartão tvOS: `tilt(el)` + `.is-warm` / `.is-cool`.

## Efeitos (`fx.js`)

| Função | Para quê |
|---|---|
| `lightning(canvas, { palette, ambient, every, onStrike, onFrame })` | Raios. Devolve `{ strike(alvo?, { palette, pulses, width }), setPalette, setAmbient, intensity, destroy }`. `alvo` é `{x,y}` em px do canvas ou um elemento. |
| `livingPainting(el, url, { focus, anchor, figure })` | Pintura viva. Devolve `{ state, flash(pt, cor), setMood(-1..1), destroy }`. Valores por omissão afinados para `zeus-5.webp`. |
| `cursorLight(elComImg, { rest, orbit, tint })` | Luz do cursor sobre mármore. `{ setTint, setMode, destroy }`. |
| `tilt(el)` | Elevar, inclinar e reflexo. |
| `clouds(canvas)` | Nuvens. `set(0..1)` sobe a câmara. |
| `grain(el, { opacity, fps })` | Grão de película animado. |
| `reveal(alvos, { delay, stagger })` | Entrada em cascata com GSAP. |
| `rows(raiz)`, `modal(el)`, `toast(msg)` | Filas Netflix, folha de detalhe, aviso. |
| `prefersReducedMotion()` | Movimento reduzido. |

Todos os ciclos param sozinhos com o separador escondido ou o elemento fora do ecrã; as animações CSS também (`html.z-paused`).

Liga raio e pintura assim: `lightning(c, { onStrike: p => pintura.flash(p, p.color, p.pulses) })`.

## Imagens (`../img/`)

- `zeus-5`: trono, tempestade fria à esquerda e carmesim à direita. Portal e ecrãs de escolha.
- `zeus-6`: busto em fundo preto. Entrada e ecrãs de conta.
- `zeus-3`: rosto com raios, dourado. Momentos de confirmação.
- `zeus-2`: Olimpo nas nuvens. Primeiros passos e estados de conclusão.
- `zeus-4`: relógio. Estados do sistema, espera, vazio.

## Regras artísticas

- Uma figura por ecrã. Nunca duas estátuas visíveis ao mesmo tempo.
- A imagem acaba sempre em preto: `.z-art` com gradiente para o lado do texto, ou máscara. Nunca uma aresta dura.
- O drama vem da luz: raios, clarões, luz do cursor, Ken Burns lento. A interface por cima fica calma, legível e sem decoração.
- Frio (`--accent`, paleta `cool`) para a TV; quente (`--gold`, paleta `warm`) para o Cinema; neutro no resto.
- Um momento orquestrado por ecrã, por exemplo a entrada. Hover e cliques respondem com elevação, nunca com efeitos soltos.
- Texto em português de Portugal, frases curtas, verbos claros: «Reproduzir», «Adicionar à lista», «Tentar outra vez».

## Fotossensibilidade e movimento reduzido

- No máximo três clarões por segundo: `lightning` já impõe 700 ms entre raios e dois pulsos por raio. Não crie clarões fora dele.
- Clarões de ecrã inteiro (`.z-flash`) só uma vez por ação do utilizador e com opacidade até 0,9.
- Com `prefers-reduced-motion`: sem raios, sem WebGL, sem inclinação, sem ciclos. Ficam imagens estáticas e fades curtos. `fx.js` põe `html.z-rm`, que pode usar no CSS.
