# TV IPTV · Plano 2 de 3: reprodução pela API e guia de programação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Canais, filmes e episódios da lista reproduzem-se através da API (HLS reescrito, MPEG-TS, ficheiros com Range e remux de mkv/avi), uma ligação de cada vez, e a API serve o guia (agora/seguinte, grelha e guia do canal).

**Architecture:** Novo `safeStream` em `lib/safe-fetch.ts` (as mesmas regras de rede do `safeFetch`, mas sem guardar a resposta em memória). Em `apps/api/src/modules/iptv/`: `account.ts` (dados da conta Xtream e URL de origem de cada conteúdo), `sessions.ts` (sessões de reprodução com token, uma por lista, que fecham a anterior), `hls.ts` (reescrita pura de `.m3u8`), `remux.ts` (ffmpeg a ler por uma ponte local), `play-routes.ts` (rotas de reprodução), `epg.ts` (leitura e índice XMLTV) e `epg-routes.ts`. O browser só vê URLs `/api/iptv/play/<token>/…`; os URLs do fornecedor ficam no servidor.

**Tech Stack:** Hono, zod 4, `node:test` via `tsx --test`, `ffmpeg-static` (já instalado), `safeFetch`/`safeStream`.

**Spec:** `docs/superpowers/specs/2026-11-12-tv-iptv-design.md` (secções «Reprodução» e «Guia»).

**Base:** ramo `feat/tv-iptv-playback`, criado a partir de `feat/tv-iptv` (plano 1).

## Estado após retoma — 12 de Novembro de 2026

- Tarefas 1–9 implementadas. A retoma fechou a revisão HLS pendente e implementou MPEG-TS/Range, remux e guia; estas alterações ainda não têm commit.
- Validação final: `npm test` **115/115**, `npm run typecheck` e `git diff --check` sem erros.
- Revisão adicional: sessões isoladas por Membro + lista; limpeza aborta streams; segmentos binários mal classificados recebem MIME seguro; ffmpeg recusa playlists disfarçadas; erros iniciais do remux preservam o estado 502 e a mensagem de ligações.
- Testes incluem Range 206, remux real com ffmpeg e seek, cancelamento, 181 minutos simulados de emissão, visibilidade e isolamento do guia. XMLTV sintético de cerca de 49 MB / 200 000 programas indexado em aproximadamente 0,5–0,7 s.
- Tarefa 10 concluída após diagnosticar os falsos 404: o fornecedor recusa pedidos sem `User-Agent`. `safeFetch`/`safeStream` enviam agora `Zeus/1.1.3`, preservando valores explícitos do chamador; regressão local passou de 404 a 200.
- Lista real: conta activa (0/1 ligações antes dos testes); vídeo H.264 descodificado pelo ffmpeg (exit 0); trocar sessão responde 410 no token antigo; MP4 responde 206 / 100 bytes; MKV responde MP4 200 com assinatura `ftyp`.
- XMLTV real: HTTP 200, 1 087 canais indexados; pasta Portugal com 207 canais, 205 com programa actual; carga 8 058 ms, cache 1 ms. Os testes de vídeo respeitaram a libertação da ligação única entre pedidos.
- A verificação real usou servidor temporário em loopback com identidade injectada, sem alterar o estado do Membro; autenticação está coberta pelos testes de rotas. URLs e credenciais não foram registados.
- Próximo passo: concluir os nove ecrãs e os testes do plano 3.

## Global Constraints

- Mensagens visíveis em PT-PT; identificadores em inglês.
- **Toda a reprodução IPTV passa pela API** (o fornecedor não envia CORS); as respostas suportam pedidos parciais (`Range`) quando o fornecedor os suporta.
- Credenciais e URLs do fornecedor nunca chegam ao browser: nem em respostas, nem em listas `.m3u8` reescritas, nem em registos, nem em mensagens de erro.
- Toda a ligação ao fornecedor usa `safeFetch` ou `safeStream` (endereços privados recusados, IP fixado), incluindo o que o ffmpeg lê.
- **1 ligação simultânea**: ao mudar de canal ou abrir um filme, a ligação anterior da mesma lista fecha-se primeiro. Fornecedor a recusar por excesso de ligações → «A lista já está a ser usada noutro aparelho (máximo de N ligação(ões)).» (sem N quando desconhecido: «A lista já está a ser usada noutro aparelho.»).
- mkv/avi: remux com o ffmpeg (`ffmpeg-static`), vídeo copiado, áudio para AAC estéreo, MP4 fragmentado.
- Guia: `epgUrl` da lista quando existir, senão `xmltv.php` do Xtream; indexado no servidor; cache 1 h; `get_short_epg` só para canais sem correspondência no XMLTV.
- Conteúdo escondido (plano 1) não se reproduz nem aparece no guia: 404 «Este conteúdo não está disponível.»
- Não quebrar `npm test` nem `npm run typecheck`.

## Review Focus

1. Lista `.m3u8` com URIs relativos, absolutos, `EXT-X-KEY`/`EXT-X-MAP`/`EXT-X-MEDIA` com `URI="…"` e listas mestras com variantes → todos os URIs reescritos para `/api/iptv/play/<token>/r/<n>`, nenhum URL do fornecedor no texto devolvido. (Task 5)
2. O Membro abre um canal e logo outro da mesma lista → o pedido ao fornecedor do primeiro é abortado antes de o segundo começar; o token antigo responde 410 «Esta reprodução terminou.» (Task 4)
3. Outro Membro, ou um pedido sem sessão, usa um token válido → 404, sem revelar que o token existe. (Task 4)
4. O browser fecha o separador a meio de um filme ou de um remux → o pedido ao fornecedor e o processo ffmpeg terminam. (Tasks 6 e 7)
5. XMLTV com fusos `+0100`, entidades (`&amp;`, `&#233;`), `<title lang>` repetidos e programas sem `stop` → horas em UTC certas, texto descodificado, primeiro título, programa sem `stop` ignorado. (Task 8)

---

## Ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `apps/api/src/lib/safe-fetch.ts` | Modificar: `safeStream` |
| `apps/api/src/modules/iptv/m3u.ts`, `types.ts`, `cache.ts`, `provider.ts`, `views.ts` | Modificar: episódios M3U, prioridade a canais ao vivo, versão da cache, detalhe de série M3U |
| `apps/api/src/modules/iptv/account.ts` | Conta Xtream (`user_info`) e URL de origem de cada conteúdo |
| `apps/api/src/modules/iptv/sessions.ts` | Sessões de reprodução: token, dono, abortar a anterior, mapa de recursos HLS |
| `apps/api/src/modules/iptv/hls.ts` | Reescrita de `.m3u8` |
| `apps/api/src/modules/iptv/remux.ts` | Ponte local + ffmpeg |
| `apps/api/src/modules/iptv/play-routes.ts` | Rotas `/play` |
| `apps/api/src/modules/iptv/epg.ts` | XMLTV → índice; `get_short_epg` |
| `apps/api/src/modules/iptv/epg-routes.ts` | Rotas do guia |
| `apps/api/src/modules/iptv/routes.ts` | Modificar: montar as novas rotas; erro genérico em `/resource` |
| `apps/api/test/fixtures/upstream.ts` | Fornecedor de streams falso para `safeStream` |
| `apps/api/test/iptv-*.test.ts` | Testes por módulo |

---

### Task 1: `safeStream`

**Files:**
- Modify: `apps/api/src/lib/safe-fetch.ts`
- Test: `apps/api/test/safe-stream.test.ts`

**Interfaces:**
- Produces: `safeStream(input: string, options?: { headers?: Record<string, string>; signal?: AbortSignal; timeout?: number }): Promise<Response>`. Mesmas validações, resolução DNS, IP fixado e redireccionamentos (máx. 5) que `safeFetch`; corpo em `ReadableStream` sem limite de tamanho; cabeçalhos copiados: `content-type`, `content-length`, `content-range`, `accept-ranges`; `timeout` (omissão 15 s) só até chegarem os cabeçalhos; `signal` aborta o pedido em qualquer momento e destrói a ligação.
- A lógica comum (validação, DNS, pedido com IP fixado) passa a uma função interna partilhada pelos dois; `safeFetch` mantém o comportamento.

- [x] **Step 1: Write the failing test**

```ts
test("safeStream refuses private addresses and non-http schemes", async () => {
  await assert.rejects(safeStream("http://127.0.0.1:1/x"), /privado ou reservado/);
  await assert.rejects(safeStream("file:///etc/passwd"), /URL não permitido/);
  await assert.rejects(safeStream("http://user:pw@example.com/"), /URL não permitido/);
});
test("safeFetch keeps refusing private addresses", async () => {
  await assert.rejects(safeFetch("http://10.0.0.1/"), /privado ou reservado/);
});
```

- [x] **Step 2: Run** `npx tsx --test apps/api/test/safe-stream.test.ts` → FAIL (`safeStream` não exportado).
- [x] **Step 3: Implement** a função partilhada e `safeStream` (corpo via `Readable.toWeb(res)`; `signal` → `request.destroy()`; ao abortar depois da resposta, `res.destroy()`).
- [x] **Step 4: Run** o teste, `npm test` e `npm run typecheck` → PASS.
- [x] **Step 5: Commit** `feat(api): stream upstream responses with the same network guards`

---

### Task 2: Catálogo pronto para reproduzir

**Files:**
- Modify: `apps/api/src/modules/iptv/types.ts`, `m3u.ts`, `cache.ts`, `provider.ts`, `views.ts`
- Test: `apps/api/test/iptv-m3u.test.ts`, `apps/api/test/iptv-views.test.ts`

**Interfaces:**
- `TVEpisode` ganha `source?: string` (só interno). `TVSeries` ganha `episodes?: TVEpisode[]` (só interno, só M3U).
- `normalizeM3U`: entradas de série guardam os episódios na série (`season`/`number` de `SxxExx`/`S01 E04`, `1`/índice quando não houver; `title` = nome completo; `container` da extensão; `source` = URL; id do episódio = 16 hex de `sha256(seriesId|url)`).
- `normalizeM3U` (prioridade): URL com `/live/` ou terminado em `.m3u8`/`.ts` é sempre Ao vivo, mesmo num grupo «Movies…»; só depois vale `/movie/`, `/series/` e o nome do grupo.
- `fetchSeries` para M3U: temporadas a partir de `base.episodes` (ordenadas), sem pedidos.
- `CACHE_VERSION = 2`.
- `views.ts`: `publicSeriesDetail(d: TVSeriesDetail): TVSeriesDetail` tira `source` dos episódios e `episodes` da série; a rota de detalhe de série usa-a; `publicItem` passa a tirar também `episodes`.

- [x] **Step 1: Write the failing tests**

```ts
test("M3U series keep their episodes for playback", () => {
  const c = normalizeM3U(`#EXTM3U
#EXTINF:-1 group-title="Séries",Tróia S01 E04
http://p.test/series/u/p/77.mp4
#EXTINF:-1 group-title="Séries",Tróia S01E02
http://p.test/series/u/p/75.mkv`, "http://p.test/l.m3u", 0);
  const s = c.series.items[0];
  assert.deepEqual(s.episodes!.map((e) => [e.season, e.number, e.container]), [[1, 4, "mp4"], [1, 2, "mkv"]]);
  assert.equal(s.episodes![0].source, "http://p.test/series/u/p/77.mp4");
});
test("live URLs win over movie-like group names", () => {
  const c = normalizeM3U(`#EXTM3U
#EXTINF:-1 group-title="24/7 Movies",Cinema 24h
http://p.test/live/u/p/9.m3u8`, "http://p.test/l.m3u", 0);
  assert.equal(c.live.items.length, 1);
  assert.equal(c.movie.items.length, 0);
});
test("series detail sent to the browser has no sources", () => {
  const d = publicSeriesDetail({ id: "s", categoryId: "c", name: "T", adult: false, cast: [], episodes: [], seasons: [{ number: 1, name: "Temporada 1", episodes: [{ id: "e", season: 1, number: 1, title: "x", container: "mp4", source: "http://p.test/u/p/1.mp4" }] }] });
  assert.equal(JSON.stringify(d).includes("p.test"), false);
});
```

Mais: em `iptv-cache.test.ts`, `fetchSeries` M3U devolve as temporadas ordenadas (T1 E2 antes de T1 E4) sem chamar `fakeFetch`.

- [x] **Step 2: Run** os testes focados → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** os testes focados, `npm test`, `npm run typecheck` → PASS.
- [x] **Step 5: Commit** `feat(api): keep M3U episodes and prefer live URLs when classifying`

---

### Task 3: Conta e URL de origem

**Files:**
- Create: `apps/api/src/modules/iptv/account.ts`
- Modify: `apps/api/src/modules/iptv/cache.ts` (`getAccount`, TTL 1 h, sem disco)
- Test: `apps/api/test/iptv-account.test.ts`

**Interfaces:**
- `interface Account { formats: ("m3u8" | "ts")[]; maxConnections?: number; activeConnections?: number; expiresAt?: number }`.
- `fetchAccount(list: IPTVList): Promise<Account>`: Xtream → `player_api.php` sem `action` (usar `xtreamUrl(list, "")` sem o parâmetro `action`, ou uma variante interna), lê `user_info.allowed_output_formats`, `max_connections`, `active_cons`, `exp_date` (segundos → ms); `auth` 0/«0» → erro de credenciais do plano 1. M3U → `{ formats: [] }` sem pedido.
- `getAccount(userId, list): Promise<Account>` em `cache.ts` (memória, 1 h). `cached` ganha a opção `disk = true`.
- `type Target = { section: "live"; id: string } | { section: "movie"; id: string } | { section: "series"; id: string; episodeId: string }`.
- `type Upstream = { url: string; kind: "hls" | "ts" | "file"; container: string }`.
- `upstreamFor(list: IPTVList, catalog: TVCatalog, detail: TVSeriesDetail | undefined, account: Account, target: Target): Upstream | undefined`:
  - Xtream ao vivo: `${origin}/live/${user}/${pass}/${id}.m3u8` (`hls`) se `formats` incluir `m3u8` ou estiver vazio; senão `.ts` (`ts`).
  - Xtream filme: `${origin}/movie/${user}/${pass}/${id}.${container}` (`file`); episódio: `${origin}/series/${user}/${pass}/${episodeId}.${container}` (`file`), com o `container` do episódio em `detail`.
  - M3U: `source` do item/episódio; `kind` = `hls` se o caminho terminar em `.m3u8`, `ts` se ao vivo noutros casos, `file` para filmes/episódios.
  - `origin` = `new URL(list.url).origin`; utilizador e palavra-passe com `encodeURIComponent`.
  - Item inexistente → `undefined`.

- [x] **Step 1: Write the failing test** — para a lista da fixture: canal `101` → `https://tv.example.test/live/u/segredo-123/101.m3u8` e `kind: "hls"`; com `formats: ["ts"]` → `.ts` e `kind: "ts"`; filme mkv → `kind: "file"`, `container: "mkv"`; episódio → caminho `/series/`; M3U ao vivo `.ts` → `kind: "ts"`; `fetchAccount` com `{"user_info":{"auth":1,"max_connections":"1","active_cons":"0","allowed_output_formats":["m3u8","ts"],"exp_date":"1800000000"}}` → `{ formats: ["m3u8","ts"], maxConnections: 1, activeConnections: 0, expiresAt: 1800000000000 }`; `auth: "0"` → rejeita com «recusou o utilizador ou a palavra-passe».
- [x] **Step 2: Run** `npx tsx --test apps/api/test/iptv-account.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** o teste, `npm test`, `npm run typecheck` → PASS.
- [x] **Step 5: Commit** `feat(api): read Xtream account limits and build upstream stream URLs`

---

### Task 4: Sessões de reprodução

**Files:**
- Create: `apps/api/src/modules/iptv/sessions.ts`
- Test: `apps/api/test/iptv-sessions.test.ts`

**Interfaces:**
- `interface PlaySession { token: string; userId: string; listId: string; upstream: Upstream; account: Account; signal: AbortSignal; ended: boolean; resources: Map<string, string>; onEnd: Set<() => void> }`.
- `createSession(userId: string, listId: string, upstream: Upstream, account: Account): PlaySession`: token = 32 bytes aleatórios em base64url; termina primeiro qualquer sessão activa com o mesmo `listId` (de qualquer Membro: a ligação é da conta do fornecedor).
- `findSession(token: string, userId: string): PlaySession | undefined | "ended"`: token desconhecido ou de outro Membro → `undefined`; terminado → `"ended"` (só para o dono).
- `endSession(s: PlaySession): void`: aborta `signal`, corre `onEnd`, marca `ended`; terminadas ficam 10 min para responder 410 e depois saem do registo.
- `addResource(s: PlaySession, url: string): string` → id curto sequencial; o mapa guarda no máximo 2 000 entradas (as mais antigas saem).
- Sessões sem pedidos há 2 h terminam (verificado ao criar ou procurar; relógio injectável `setSessionClock`).

- [x] **Step 1: Write the failing test**

```ts
test("a new session on the same list ends the previous one first", () => {
  const a = createSession("u1", "l1", up, acc);
  let closed = false; a.onEnd.add(() => (closed = true));
  const b = createSession("u1", "l1", up, acc);
  assert.equal(a.signal.aborted, true);
  assert.equal(closed, true);
  assert.equal(findSession(a.token, "u1"), "ended");
  assert.equal(findSession(b.token, "u1"), b);
});
test("tokens are private to their member", () => {
  const s = createSession("u1", "l2", up, acc);
  assert.equal(findSession(s.token, "u2"), undefined);
  assert.equal(findSession("nope", "u1"), undefined);
});
test("resource map is capped at 2000 entries", () => {
  const s = createSession("u1", "l3", up, acc);
  for (let i = 0; i < 2100; i++) addResource(s, `https://cdn.test/${i}.ts`);
  assert.equal(s.resources.size, 2000);
});
test("idle sessions end after 2 h", () => { /* setSessionClock: criar, avançar 2 h + 1 ms, findSession → "ended" */ });
```

- [x] **Step 2: Run** `npx tsx --test apps/api/test/iptv-sessions.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** o teste → PASS.
- [x] **Step 5: Commit** `feat(api): one IPTV playback session per list with private tokens`

---

### Task 5: Iniciar reprodução e HLS reescrito

**Files:**
- Create: `apps/api/src/modules/iptv/hls.ts`, `apps/api/src/modules/iptv/play-routes.ts`, `apps/api/test/fixtures/upstream.ts`
- Modify: `apps/api/src/modules/iptv/routes.ts` (montar `playRoutes`; `/resource` devolve só «Não foi possível carregar a lista.» em 502)
- Test: `apps/api/test/iptv-hls.test.ts`, `apps/api/test/iptv-play-routes.test.ts`

**Interfaces:**
- `rewritePlaylist(text: string, base: string, link: (absoluteUrl: string) => string): string` — cada linha de URI e cada `URI="…"` passa a `link(new URL(uri, base).href)`; o resto do texto fica igual.
- `setUpstreamFetch(f: typeof safeStream): void` em `play-routes.ts` (testes).
- Rotas (todas com `requireMember`):
  - `POST /api/iptv/lists/:listId/play` corpo `{ section, id, episodeId? }` (zod; `episodeId` obrigatório para `series`) → valida visibilidade com `visibleItem` (404 «Este conteúdo não está disponível.»), obtém `getAccount`, detalhe de série quando preciso, `upstreamFor`, `createSession` → `{ token, type: "hls" | "mpegts" | "mp4", url, remux: boolean }` com `url` = `/api/iptv/play/<token>/index.m3u8` (hls), `/live.ts` (ts), `/file` (mp4/m4v/mov/webm) ou `/remux.mp4` (mkv, avi e outros).
  - `GET /api/iptv/play/:token/index.m3u8` → pede a lista ao fornecedor com `safeFetch` (máx. 2 MiB), reescreve com `link = (u) => "/api/iptv/play/<token>/r/" + addResource(s, u)`, devolve `application/vnd.apple.mpegurl`. A base para URIs relativos é o URL final depois de redireccionamentos (o fornecedor costuma redireccionar para outro servidor).
  - `GET /api/iptv/play/:token/r/:id` → se o recurso for outra lista (`.m3u8` no caminho ou `content-type` mpegurl), reescreve igual; senão `safeStream` com o `Range` do pedido e o `signal` da sessão combinado com o do pedido.
  - Erros do fornecedor: 401/403/429/458/509, ou 404 em `index.m3u8` com `account.activeConnections >= account.maxConnections` → 502 com a mensagem de ligações dos Global Constraints; outros → 502 «O fornecedor não respondeu. Tenta de novo.»; sessão terminada → 410 «Esta reprodução terminou.»; token desconhecido → 404.

- [x] **Step 1: Write the failing tests**

`iptv-hls.test.ts`:

```ts
const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000
low/index.m3u8
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio/pt.m3u8"
#EXT-X-KEY:METHOD=AES-128,URI="https://keys.test/k?u=user&p=pass"
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.0,
https://cdn.test/hls/user/pass/seg1.ts
seg2.ts`;
test("every URI is rewritten and nothing upstream is left", () => {
  const seen: string[] = [];
  const out = rewritePlaylist(master, "https://edge.test/live/x/index.m3u8", (u) => (seen.push(u), `/p/${seen.length}`));
  assert.deepEqual(seen, [
    "https://edge.test/live/x/low/index.m3u8", "https://edge.test/live/x/audio/pt.m3u8", "https://keys.test/k?u=user&p=pass",
    "https://edge.test/live/x/init.mp4", "https://cdn.test/hls/user/pass/seg1.ts", "https://edge.test/live/x/seg2.ts",
  ]);
  assert.ok(!/edge\.test|cdn\.test|keys\.test|pass/.test(out));
  assert.match(out, /#EXTINF:6\.0,/);
});
```

`iptv-play-routes.test.ts` (harness de `iptv-routes.test.ts`; `setProviderFetch(fakeFetch(xtreamRoutes))` com `user_info` na resposta sem `action`; `setUpstreamFetch` com respostas falsas de `fixtures/upstream.ts`):
- `POST /play` canal `101` → 200, `type: "hls"`, `url` a acabar em `/index.m3u8`, o JSON não contém `segredo-123` nem `tv.example.test`.
- `GET` desse `url` → 200, corpo sem `tv.example.test`, `segredo-123`, `cdn.test`; um `r/<id>` do corpo → 200 com o conteúdo do segmento falso.
- Segundo `POST /play` (outro canal) → o primeiro `url` responde 410 e o pedido falso do primeiro segmento em curso viu `signal.aborted === true`.
- Outro Membro com o mesmo `url` → 404.
- Fornecedor responde 509 à lista → 502 com «já está a ser usada noutro aparelho (máximo de 1 ligação(ões))».
- Pasta adulta escondida: `POST /play` de «Canal 18» → 404.
- `GET /api/iptv/resource` com o fornecedor a falhar → 502 «Não foi possível carregar a lista.» (sem a mensagem original).

- [x] **Step 2: Run** os dois testes → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** os testes, `npm test`, `npm run typecheck` → PASS.
- [x] **Step 5: Commit** `feat(api): start IPTV playback and proxy rewritten HLS through the API`

---

### Task 6: MPEG-TS ao vivo e ficheiros com Range

**Files:**
- Modify: `apps/api/src/modules/iptv/play-routes.ts`
- Test: `apps/api/test/iptv-play-routes.test.ts`

**Interfaces:**
- `GET /api/iptv/play/:token/live.ts` → `safeStream` sem `Range`, `content-type: video/mp2t`, `cache-control: no-store`.
- `GET /api/iptv/play/:token/file` → `safeStream` com o `Range` do pedido; devolve o estado (200/206) e `content-type`, `content-length`, `content-range`, `accept-ranges` do fornecedor; se o fornecedor não mandar `content-type`, usa o do `container` (`video/mp4`, `video/webm`, `video/quicktime`).
- Os dois abortam o pedido ao fornecedor quando o browser fecha (`c.req.raw.signal`) ou quando a sessão termina.

- [x] **Step 1: Write the failing tests** — `Range: bytes=0-99` num filme mp4 → 206, `content-range: bytes 0-99/1000`, 100 bytes; fechar o pedido do browser a meio de `live.ts` (abortar o `AbortController` do `app.request`) → o `signal` visto pelo fornecedor falso fica `aborted`; `live.ts` depois de nova sessão na mesma lista → 410.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** os testes, `npm test`, `npm run typecheck` → PASS.
- [x] **Step 5: Commit** `feat(api): stream live MPEG-TS and range requests for IPTV files`

---

### Task 7: Remux de mkv/avi

**Files:**
- Create: `apps/api/src/modules/iptv/remux.ts`
- Modify: `apps/api/src/modules/iptv/play-routes.ts`
- Test: `apps/api/test/iptv-remux.test.ts`

**Interfaces:**
- `startBridge(s: PlaySession, open: (range?: string, signal?: AbortSignal) => Promise<Response>): Promise<string>` — servidor HTTP em `127.0.0.1`, porta aleatória, caminho secreto de 32 bytes; serve o ficheiro do fornecedor com `Range` (através de `open`, que usa `safeStream`); fecha-se em `s.onEnd`. Devolve o URL local.
- `remux(input: string, startSec: number, signal: AbortSignal): ReadableStream<Uint8Array>` — `ffmpeg-static` com `-hide_banner -loglevel error`, `-ss <t> -noaccurate_seek` quando `t > 0`, `-i <input>`, `-map 0:v:0 -map 0:a:0? -c:v copy -c:a aac -b:a 192k -ac 2 -avoid_negative_ts make_zero -movflags frag_keyframe+empty_moov+default_base_moof -f mp4 pipe:1` (os mesmos argumentos que `engine.js` usa no Motor); `signal` mata o processo (`SIGKILL`).
- `GET /api/iptv/play/:token/remux.mp4?t=<segundos>` → `video/mp4`, `cache-control: no-store`, sem `Range`; o pedido do browser fechado mata o ffmpeg.

- [x] **Step 1: Write the failing test** — gerar no teste um mkv de 2 s com o próprio `ffmpeg-static` (`-f lavfi -i testsrc=duration=2:size=160x120:rate=10 -f lavfi -i sine=duration=2 -c:v mpeg4 -c:a ac3 out.mkv`), servi-lo pelo `open` falso, chamar `remux` e verificar que os bytes 4–8 da saída são `ftyp`; com `t=1` também sai `ftyp`; abortar a meio → o processo ffmpeg termina (exit em menos de 2 s) e a ponte fecha quando a sessão termina (pedido ao URL local falha).
- [x] **Step 2: Run** `npx tsx --test apps/api/test/iptv-remux.test.ts` → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** o teste, `npm test`, `npm run typecheck` → PASS.
- [x] **Step 5: Commit** `feat(api): remux IPTV mkv and avi files to fragmented MP4`

---

### Task 8: Guia — leitura e índice XMLTV

**Files:**
- Create: `apps/api/src/modules/iptv/epg.ts`
- Modify: `apps/api/src/modules/iptv/cache.ts` (`getGuide`, TTL 1 h, sem disco)
- Test: `apps/api/test/iptv-epg.test.ts`

**Interfaces:**
- `interface Programme { start: number; stop: number; title: string; description?: string }`.
- `type GuideIndex = Map<string, Programme[]>` (chave = id do canal XMLTV em minúsculas; programas ordenados por `start`).
- `parseXmltv(text: string, from: number, to: number): GuideIndex` — só guarda programas que se sobrepõem a `[from, to]`; datas `AAAAMMDDhhmmss ±hhmm` (sem fuso = UTC); entidades XML e numéricas descodificadas; primeiro `<title>`; `<desc>` opcional; programas sem `stop` ou com `stop <= start` ignorados.
- `fetchGuide(list: IPTVList, now: number): Promise<GuideIndex>` — URL = `list.epgUrl` ou, em Xtream, `${origin}/xmltv.php?username=…&password=…`; M3U sem `epgUrl` → índice vazio; `safeFetch` com `timeout: 120000`, `maxBytes: 160 MiB`; janela = ontem 00:00 UTC até `now + 7 dias`. Erros → `ProviderError` genérico.
- `getGuide(userId, list): Promise<GuideIndex>` em `cache.ts`.
- `nowNext(index: GuideIndex, epgId: string | undefined, now: number): { now?: Programme; next?: Programme }`.
- `programmesBetween(index: GuideIndex, epgId: string | undefined, from: number, to: number): Programme[]`.
- `fetchShortEpg(list: IPTVList, streamId: string): Promise<Programme[]>` — Xtream `get_short_epg&stream_id=…&limit=10`; `title`/`description` vêm em base64 e são descodificados; `start_timestamp`/`stop_timestamp` em segundos; M3U → `[]`.

- [x] **Step 1: Write the failing test**

```ts
const xml = `<?xml version="1.0"?><tv>
<programme start="20261112200000 +0100" stop="20261112210000 +0100" channel="RTP1.pt"><title lang="pt">Telejornal &amp; Mais</title><title lang="en">News</title><desc>Caf&#233;</desc></programme>
<programme start="20261112210000 +0100" stop="20261112220000 +0100" channel="rtp1.pt"><title>Prós e Contras</title></programme>
<programme start="20261112220000 +0100" channel="rtp1.pt"><title>Sem fim</title></programme>
<programme start="20261101000000" stop="20261101010000" channel="rtp1.pt"><title>Antigo</title></programme></tv>`;
const at = (s: string) => Date.parse(s);
test("XMLTV is parsed in UTC with entities decoded and a time window", () => {
  const idx = parseXmltv(xml, at("2026-11-12T00:00:00Z"), at("2026-11-19T00:00:00Z"));
  const p = idx.get("rtp1.pt")!;
  assert.deepEqual(p.map((x) => [x.title, new Date(x.start).toISOString()]), [
    ["Telejornal & Mais", "2026-11-12T19:00:00.000Z"], ["Prós e Contras", "2026-11-12T20:00:00.000Z"],
  ]);
  assert.equal(p[0].description, "Café");
});
test("now and next", () => {
  const idx = parseXmltv(xml, 0, Infinity);
  const nn = nowNext(idx, "RTP1.pt", at("2026-11-12T19:30:00Z"));
  assert.deepEqual([nn.now?.title, nn.next?.title], ["Telejornal & Mais", "Prós e Contras"]);
  assert.deepEqual(nowNext(idx, undefined, 0), {});
});
test("short EPG titles are base64", async () => { /* fakeFetch com {epg_listings:[{title:"VGVsZWpvcm5hbA==",description:"",start_timestamp:"1794510000",stop_timestamp:"1794513600"}]} → title "Telejornal" */ });
```

- [x] **Step 2: Run** `npx tsx --test apps/api/test/iptv-epg.test.ts` → FAIL.
- [x] **Step 3: Implement** — percorrer o texto com uma regex global por `<programme …>…</programme>` (sem DOM); um ficheiro de 42 MB tem de ser indexado em menos de 3 s (medir no Step 4 com um XMLTV sintético de 200 000 programas gerado no teste).
- [x] **Step 4: Run** o teste, `npm test`, `npm run typecheck` → PASS.
- [x] **Step 5: Commit** `feat(api): index XMLTV guides on the server`

---

### Task 9: Rotas do guia

**Files:**
- Create: `apps/api/src/modules/iptv/epg-routes.ts`
- Modify: `apps/api/src/modules/iptv/routes.ts` (montar)
- Test: `apps/api/test/iptv-epg-routes.test.ts`

**Interfaces (todas com `requireMember`, lista do Membro, conteúdo escondido excluído):**
- `GET /api/iptv/lists/:listId/epg/now?category=<id>` → `{ [channelId]: { now?: Programme; next?: Programme } }` para os canais visíveis dessa pasta (só os que têm guia).
- `GET /api/iptv/lists/:listId/epg/grid?category=<id>&from=<ms>&to=<ms>&page=0&size=40` → `{ channels: { id, name, number?, logo?, programmes: Programme[] }[]; total; page; size }`; `to - from` no máximo 24 h (400 se maior); `category` opcional («todas as pastas visíveis»); `favorites=1` filtra pelos favoritos `live` das preferências.
- `GET /api/iptv/lists/:listId/epg/channel/:id?from&to` → `Programme[]`; se o índice não tiver o canal, usa `fetchShortEpg` (Xtream).
- Sem guia na lista (M3U sem `epgUrl`) → respostas vazias, não erro. Erros do fornecedor → 502 com a mensagem do `ProviderError`.

- [x] **Step 1: Write the failing tests** — com o harness das rotas e um XMLTV falso servido por `fakeFetch` para `xmltv.php`: `now` da pasta Portugal devolve agora/seguinte de `101` (RTP1, `epg_channel_id: "rtp1.pt"`) e nada para SIC; `grid` com janela de 25 h → 400; `grid` com `favorites=1` sem favoritos → `channels: []`; canal sem correspondência → resultado de `get_short_epg`; canal adulto escondido → 404 em `epg/channel/:id`; a resposta nunca contém `segredo-123`.
- [x] **Step 2: Run** → FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4: Run** os testes, `npm test`, `npm run typecheck` → PASS.
- [x] **Step 5: Commit** `feat(api): serve now/next, guide grid and channel guide`

---

### Task 10: Verificação com a lista real (controlador)

- [x] Com a lista real, por script (só contagens e estados, nunca URLs): `POST /play` de um canal de Portugal → `ffprobe` ao `index.m3u8` servido pela API num servidor local mostra vídeo h264; um filme mp4 → 206 com `Range`; um filme mkv → `remux.mp4` começa por `ftyp`; segundo canal fecha o primeiro (410); guia: número de canais com programa agora na pasta Portugal e tempo de indexação do `xmltv.php`.
- [x] Registar os resultados no ledger; problemas reais voltam como tarefas de correcção.
