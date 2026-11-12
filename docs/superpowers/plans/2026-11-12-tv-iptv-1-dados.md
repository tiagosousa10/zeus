# TV IPTV · Plano 1 de 3: dados da lista na API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A API lê listas Xtream e M3U, normaliza Ao vivo / Filmes / Séries num formato único do Zeus, guarda-as em cache e serve pastas, páginas, detalhes e um índice de pesquisa, já filtrados pelas preferências de cada Membro.

**Architecture:** Novo código em `apps/api/src/modules/iptv/`, em ficheiros pequenos: nomes (limpeza, país, adultos, etiquetas), normalização Xtream e M3U, fornecedor (pedidos com `safeFetch` injectável), cache (memória + disco cifrado), preferências TV no estado do Membro e vistas (funções puras sobre catálogo + preferências). As rotas ficam finas por cima das vistas. A rota antiga `/api/iptv/resource` e o ecrã TV actual não mudam neste plano.

**Tech Stack:** Hono, zod 4, `node:test` via `tsx --test`, `safeFetch`, `encrypt`/`decrypt` de `lib/crypto.ts`.

**Spec:** `docs/superpowers/specs/2026-11-12-tv-iptv-design.md`

**Sequência:** Plano 1 (este, dados) → Plano 2 (reprodução pela API e guia EPG) → Plano 3 (os 9 ecrãs). Cada plano termina com software testável.

## Global Constraints

- Mensagens visíveis em PT-PT; identificadores em inglês.
- O pedido ao fornecedor faz-se na API com `safeFetch`, nunca no browser.
- Credenciais da lista (utilizador, palavra-passe, URLs M3U com credenciais) nunca saem da API: nem em respostas, nem em registos, nem em mensagens de erro, nem em claro no disco.
- Cache: catálogo 6 h, detalhe de filme/série 12 h; «Actualizar lista» força a releitura.
- Secções só aparecem se a lista tiver esse tipo de conteúdo.
- Adultos (termos: adult, adultos, xxx, 18+, +18, for adults, porn) começam escondidos; escondido não entra em pesquisa, Top 10, destaques nem contagens principais (as contagens dizem «N escondidas» à parte).
- Até 4 pastas fixadas por secção.
- IPTV e Cinema/Add-ons totalmente separados: nada deste módulo toca em `modules/addons`.
- Não quebrar `npm test`, `npm run typecheck` nem a rota `/api/iptv/resource` (o ecrã actual depende dela até ao Plano 3).

## Review Focus

1. Fornecedor Xtream com credenciais erradas devolve `{"user_info":{"auth":0}}` com 200 → erro claro «A lista recusou o utilizador ou a palavra-passe.», nunca um catálogo vazio. (Task 4)
2. Dois pedidos simultâneos à mesma lista sem cache (ex.: secções + índice de pesquisa ao abrir a TV) → um só carregamento ao fornecedor, que só aceita 1 ligação. (Task 4)
3. Lista alterada no estado (outro URL, utilizador ou palavra-passe com o mesmo `id`) → a cache antiga não é reutilizada. (Task 4)
4. Campos do fornecedor com tipos trocados (`"rating": ""`, `"added": "1700000000"`, `category_id` numérico, `backdrop_path` string ou array, `episodes` como objecto ou array) → normalização sem excepções, campos em falta ficam `undefined`. (Task 2)
5. Categoria adulta escondida e um item com nome adulto numa pasta normal → nenhum deles aparece na página da pasta, na pesquisa nem nas contagens, e o detalhe responde 404. (Tasks 5 e 6)

---

## Ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `apps/api/src/modules/iptv/types.ts` | Tipos normalizados do Zeus |
| `apps/api/src/modules/iptv/names.ts` | `cleanFolderName`, `detectCountry`, `isAdult`, `channelTags` |
| `apps/api/src/modules/iptv/xtream.ts` | URLs `player_api.php` e normalização das respostas Xtream |
| `apps/api/src/modules/iptv/m3u.ts` | M3U → catálogo (Ao vivo, e Filmes/Séries quando existirem) |
| `apps/api/src/modules/iptv/provider.ts` | Carrega catálogo e detalhes do fornecedor; `fetch` injectável |
| `apps/api/src/modules/iptv/cache.ts` | Cache memória + disco cifrado, TTL, deduplicação |
| `apps/api/src/modules/iptv/prefs.ts` | Esquema zod das preferências TV e regras de visibilidade/ordem |
| `apps/api/src/modules/iptv/views.ts` | Vistas: secções, página de pasta, detalhe, índice de pesquisa |
| `apps/api/src/modules/iptv/routes.ts` | Modificar: novas rotas finas por cima de `views.ts` |
| `apps/api/src/modules/member/routes.ts`, `service.ts` | Modificar: chave `tv` no estado |
| `apps/api/src/lib/config.ts` | Modificar: exportar `dataDir` |
| `apps/api/test/fixtures/xtream.ts` | Respostas Xtream falsas e `fakeFetch` |
| `apps/api/test/iptv-*.test.ts` | Testes por módulo |

---

### Task 1: Nomes — limpeza de pastas, país, adultos e etiquetas

**Files:**
- Create: `apps/api/src/modules/iptv/names.ts`
- Test: `apps/api/test/iptv-names.test.ts`

**Interfaces:**
- Produces: `cleanFolderName(raw: string): string`, `detectCountry(name: string): string | undefined` (código ISO 3166-1 alfa-2 em maiúsculas), `isAdult(name: string): boolean`, `channelTags(name: string): ChannelTag[]` com `type ChannelTag = "HD" | "FHD/4K" | "Notícias" | "Desporto" | "Infantis"`.

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFolderName, detectCountry, isAdult, channelTags } from "../src/modules/iptv/names.js";

test("folder names lose decorations and shouting", () => {
  assert.equal(cleanFolderName("★●· PORTUGAL ●·★"), "Portugal");
  assert.equal(cleanFolderName("  Exclusivos  "), "Exclusivos");
  assert.equal(cleanFolderName("|| SPORT TV ||"), "Sport TV");
  assert.equal(cleanFolderName("HBO"), "HBO");
  assert.equal(cleanFolderName("4K UHD"), "4K UHD");
  assert.equal(cleanFolderName("★★★"), "★★★");
});
test("country detection in PT, EN, ES and FR", () => {
  for (const [name, code] of [
    ["Portugal", "PT"], ["Brasil", "BR"], ["Brazil", "BR"], ["Spain", "ES"], ["Espanha", "ES"],
    ["França", "FR"], ["France", "FR"], ["Bélgica", "BE"], ["Belgium", "BE"], ["Holanda", "NL"], ["Netherlands", "NL"],
  ]) assert.equal(detectCountry(name), code, name);
  assert.equal(detectCountry("Exclusivos"), undefined);
  assert.equal(detectCountry("Portugal Low"), "PT");
});
test("adult terms are detected as words", () => {
  for (const n of ["ADULTOS", "For Adults", "XXX Gold", "Canal 18+", "+18 Noite", "Porn Hub"]) assert.equal(isAdult(n), true, n);
  for (const n of ["Notícias 24", "Desporto", "Sexta-feira 13", "Adultério (filme)"]) assert.equal(isAdult(n), false, n);
});
test("channel tags derive from channel names", () => {
  assert.deepEqual(channelTags("RTP1 HD"), ["HD"]);
  assert.deepEqual(channelTags("SPORT TV 1 FHD"), ["FHD/4K", "Desporto"]);
  assert.deepEqual(channelTags("Canal 4K UHD"), ["FHD/4K"]);
  assert.deepEqual(channelTags("CNN Portugal"), ["Notícias"]);
  assert.deepEqual(channelTags("Panda Kids"), ["Infantis"]);
  assert.deepEqual(channelTags("RTP2"), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/api/test/iptv-names.test.ts`
Expected: FAIL com «Cannot find module .../names.js».

- [ ] **Step 3: Implement `names.ts`**

- `cleanFolderName`: tira dos extremos tudo o que não seja letra, dígito, `+` ou `(`/`)`; junta espaços; se o nome inteiro estiver em maiúsculas, palavras com mais de 3 letras passam a «Capitalizada» e as de 3 ou menos ficam como estão. Se a limpeza deixar o nome vazio, devolve o original sem espaços nos extremos.
- `detectCountry`: mapa de sinónimos sem acentos e em minúsculas (no mínimo os 11 do teste, mais os usuais da lista real: UK/Reino Unido, Itália/Italy, Alemanha/Germany, EUA/USA, Canadá, Polónia, Roménia, Turquia, Árabe não conta como país); procura por palavra inteira.
- `isAdult`: regex por palavra inteira, sem distinguir maiúsculas: `adult(s|os)?`, `for adults`, `xxx`, `porn\w*`, `18\+`, `\+18`. «Adultério» não pode coincidir.
- `channelTags`: ordem fixa `HD`, `FHD/4K`, `Notícias`, `Desporto`, `Infantis`; `HD` só quando não há `FHD`/`4K`/`UHD`. Termos: notícias/news/cnn/informação; sport/desporto/deportes/eleven/dazn/eurosport; kids/infantil/panda/cartoon/disney junior/nick jr.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/api/test/iptv-names.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/iptv/names.ts apps/api/test/iptv-names.test.ts
git commit -m "feat(api): clean IPTV folder names and detect country, adult and tags"
```

---

### Task 2: Tipos e normalização Xtream

**Files:**
- Create: `apps/api/src/modules/iptv/types.ts`, `apps/api/src/modules/iptv/xtream.ts`, `apps/api/test/fixtures/xtream.ts`
- Test: `apps/api/test/iptv-xtream.test.ts`

**Interfaces:**
- Consumes: Task 1 (`cleanFolderName`, `detectCountry`, `isAdult`, `channelTags`).
- Produces (`types.ts`):

```ts
export type Section = "live" | "movie" | "series";
export interface TVCategory { id: string; section: Section; name: string; country?: string; adult: boolean; count: number }
export interface TVChannel { id: string; categoryId: string; name: string; number?: number; logo?: string; epgId?: string; tags: ChannelTag[]; adult: boolean; source?: string }
export interface TVMovie { id: string; categoryId: string; name: string; poster?: string; year?: number; rating?: number; added?: number; container: string; adult: boolean; source?: string }
export interface TVSeries { id: string; categoryId: string; name: string; poster?: string; year?: number; rating?: number; added?: number; adult: boolean }
export interface TVEpisode { id: string; season: number; number: number; title: string; thumb?: string; plot?: string; durationMin?: number; container: string }
export interface TVMovieDetail extends TVMovie { backdrop?: string; plot?: string; cast: string[]; director?: string; genre?: string; durationMin?: number; age?: string; trailer?: string; tmdbId?: string }
export interface TVSeriesDetail extends TVSeries { backdrop?: string; plot?: string; cast: string[]; genre?: string; seasons: { number: number; name: string; episodes: TVEpisode[] }[] }
export interface SectionData<T> { categories: TVCategory[]; items: T[] }
export interface TVCatalog { fetchedAt: number; live: SectionData<TVChannel>; movie: SectionData<TVMovie>; series: SectionData<TVSeries> }
```

`source` é só para uso interno (URL M3U) e nunca sai nas respostas.

- Produces (`xtream.ts`): `xtreamUrl(list: { url: string; username?: string; password?: string }, action: string, params?: Record<string, string>): string`; `normalizeXtreamCatalog(raw: { liveCategories: unknown; live: unknown; vodCategories: unknown; vod: unknown; seriesCategories: unknown; series: unknown }, now: number): TVCatalog`; `normalizeVodInfo(raw: unknown, base: TVMovie): TVMovieDetail`; `normalizeSeriesInfo(raw: unknown, base: TVSeries): TVSeriesDetail`.
- Produces (fixture): `xtreamFixture` (objecto com as 6 respostas de catálogo + `vodInfo` + `seriesInfo`) e `fakeFetch(routes: (url: URL) => unknown | Response): typeof safeFetch` que devolve JSON com 200 e conta chamadas em `fakeFetch.calls: URL[]`.

- [ ] **Step 1: Write the fixture and the failing test**

A fixture tem: 3 categorias ao vivo (`"1": "★●· PORTUGAL ●·★"`, `"2": "ADULTOS"`, `"3": "Exclusivos"`); 4 canais (RTP1 HD em 1 com `stream_id: 101`, `epg_channel_id: "rtp1.pt"` e `num: 1`; SIC em 1; «XXX Gold» em 3; «Canal 18» em 2); 1 categoria de filmes com 2 filmes (um com `rating: ""` e `added: "1700000000"`, outro com `rating: "7.6"`, `container_extension: "mkv"`); 1 categoria de séries com 1 série; `vodInfo` com `backdrop_path` como **string**; `seriesInfo` com `episodes` como **objecto** `{"1": [...], "2": [...]}`, episódio 2 da T1 sem `info`.

```ts
test("Xtream catalog is normalized into Zeus sections", () => {
  const c = normalizeXtreamCatalog(xtreamFixture.catalog, 1000);
  assert.equal(c.fetchedAt, 1000);
  assert.deepEqual(c.live.categories.map((x) => [x.id, x.name, x.country, x.adult, x.count]), [
    ["1", "Portugal", "PT", false, 2], ["2", "Adultos", undefined, true, 1], ["3", "Exclusivos", undefined, false, 1],
  ]);
  const rtp = c.live.items.find((x) => x.name === "RTP1 HD")!;
  assert.deepEqual([rtp.id, rtp.categoryId, rtp.number, rtp.epgId, rtp.tags], ["101", "1", 1, "rtp1.pt", ["HD"]]);
  assert.equal(c.live.items.find((x) => x.name === "XXX Gold")!.adult, true);
  const [a, b] = c.movie.items;
  assert.deepEqual([a.rating, a.added, a.container], [undefined, 1700000000, "mp4"]);
  assert.deepEqual([b.rating, b.container], [7.6, "mkv"]);
  assert.equal(c.series.items.length, 1);
});
test("details tolerate string/array fields and missing episode info", () => {
  const c = normalizeXtreamCatalog(xtreamFixture.catalog, 0);
  const m = normalizeVodInfo(xtreamFixture.vodInfo, c.movie.items[0]);
  assert.equal(typeof m.backdrop, "string");
  assert.ok(Array.isArray(m.cast));
  const s = normalizeSeriesInfo(xtreamFixture.seriesInfo, c.series.items[0]);
  assert.deepEqual(s.seasons.map((x) => [x.number, x.episodes.length]), [[1, 2], [2, 1]]);
  assert.equal(s.seasons[0].episodes[1].plot, undefined);
});
test("player_api URL keeps credentials only in the query", () => {
  const u = new URL(xtreamUrl({ url: "https://tv.example.test:8080/", username: "u", password: "p" }, "get_series_info", { series_id: "9" }));
  assert.equal(u.pathname, "/player_api.php");
  assert.deepEqual([...u.searchParams], [["username", "u"], ["password", "p"], ["action", "get_series_info"], ["series_id", "9"]]);
});
test("garbage payloads produce empty sections, not exceptions", () => {
  const c = normalizeXtreamCatalog({ liveCategories: null, live: {}, vodCategories: "x", vod: [null, 1], seriesCategories: [], series: [{}] }, 0);
  assert.deepEqual([c.live.items.length, c.movie.items.length, c.series.items.length], [0, 0, 0]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/api/test/iptv-xtream.test.ts`
Expected: FAIL (módulo em falta).

- [ ] **Step 3: Implement `types.ts` and `xtream.ts`**

Ids sempre `String(...)`. Números com helper `num(v)` → `undefined` se `NaN` ou vazio. `container` por omissão `"mp4"`. `count` = número de itens normalizados nessa categoria; categorias referidas por itens mas ausentes da lista de categorias são criadas com o nome «Outros». Itens sem nome ou sem id são descartados. `year` a partir de `releaseDate`/`releasedate`/`year`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/api/test/iptv-xtream.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/iptv/types.ts apps/api/src/modules/iptv/xtream.ts apps/api/test/fixtures/xtream.ts apps/api/test/iptv-xtream.test.ts
git commit -m "feat(api): normalize Xtream live, movie and series payloads"
```

---

### Task 3: M3U no servidor

**Files:**
- Create: `apps/api/src/modules/iptv/m3u.ts`
- Test: `apps/api/test/iptv-m3u.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2 (`TVCatalog`).
- Produces: `normalizeM3U(text: string, base: string, now: number): TVCatalog`.

- [ ] **Step 1: Write the failing test**

```ts
const text = `#EXTM3U
#EXTINF:-1 tvg-id="rtp1.pt" tvg-logo="https://l.test/rtp.png" group-title="★ PORTUGAL ★",RTP1 HD
http://p.test/live/u/p/1.ts
#EXTINF:-1 group-title="Filmes Acção",Titãs (2026)
http://p.test/movie/u/p/9.mkv
#EXTINF:-1 group-title="Séries",Tróia S01 E04
http://p.test/series/u/p/77.mp4
#EXTINF:-1,Sem grupo
javascript:alert(1)`;
test("M3U becomes live, movie and series sections without exposing URLs as ids", () => {
  const c = normalizeM3U(text, "http://p.test/list.m3u", 5);
  assert.deepEqual(c.live.categories.map((x) => [x.name, x.country, x.count]), [["Portugal", "PT", 1]]);
  assert.equal(c.live.items[0].epgId, "rtp1.pt");
  assert.equal(c.live.items[0].source, "http://p.test/live/u/p/1.ts");
  assert.ok(!c.live.items[0].id.includes("p.test"));
  assert.deepEqual([c.movie.items[0].name, c.movie.items[0].year, c.movie.items[0].container], ["Titãs", 2026, "mkv"]);
  assert.equal(c.series.items.length, 1);
});
test("ids are stable across reloads", () => {
  assert.equal(normalizeM3U(text, "http://p.test/list.m3u", 1).live.items[0].id, normalizeM3U(text, "http://p.test/list.m3u", 2).live.items[0].id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/api/test/iptv-m3u.test.ts`
Expected: FAIL (módulo em falta).

- [ ] **Step 3: Implement `normalizeM3U`**

Reaproveita o parsing de atributos de `apps/web/src/lib/iptv.ts:parseM3U` (só `http:`/`https:`). Secção: caminho com `/movie/` → `movie`, `/series/` → `series`, senão `live`. Id do item = primeiros 16 caracteres hex de `sha256(url)`; id da categoria = `sha256(secção + group-title)` (16 hex). Filmes: `(AAAA)` no fim do nome vira `year` e sai do nome. Séries M3U: nesta versão, cada entrada é uma série com o nome sem o sufixo `SxxExx`, agrupando episódios com o mesmo nome (o detalhe de série M3U fica para o Plano 2 se a lista real o exigir).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/api/test/iptv-m3u.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/iptv/m3u.ts apps/api/test/iptv-m3u.test.ts
git commit -m "feat(api): build IPTV sections from M3U lists on the server"
```

---

### Task 4: Fornecedor e cache

**Files:**
- Create: `apps/api/src/modules/iptv/provider.ts`, `apps/api/src/modules/iptv/cache.ts`
- Modify: `apps/api/src/lib/config.ts` (exportar `dataDir: dir` em `config`)
- Test: `apps/api/test/iptv-cache.test.ts`

**Interfaces:**
- Consumes: Tasks 2 e 3; `safeFetch`; `encrypt`/`decrypt`.
- Produces:
  - `type IPTVList = { id: string; name: string; type: "m3u" | "xtream"; url: string; username?: string; password?: string; epgUrl?: string }` (em `types.ts`).
  - `class ProviderError extends Error` com mensagens PT-PT: «A lista recusou o utilizador ou a palavra-passe.» e «O fornecedor da lista não respondeu. Tenta de novo.»
  - `setProviderFetch(f: typeof safeFetch): void` (só testes).
  - `fetchCatalog(list: IPTVList, now: number): Promise<TVCatalog>`; `fetchMovie(list, base: TVMovie): Promise<TVMovieDetail>`; `fetchSeries(list, base: TVSeries): Promise<TVSeriesDetail>`.
  - `getCatalog(userId: string, list: IPTVList, opts?: { force?: boolean }): Promise<TVCatalog>`; `getMovie(userId, list, id: string)`, `getSeries(userId, list, id: string)` (devolvem `undefined` se o id não existir no catálogo); `setClock(f: () => number): void` (só testes).

- [ ] **Step 1: Write the failing test**

O teste define `process.env.ZEUS_DATA_DIR` para uma pasta temporária **antes** de importar os módulos (import dinâmico), e usa `fakeFetch` com a fixture da Task 2.

```ts
test("catalog is cached for 6 h and refreshed on force", async () => {
  let t = 0; setClock(() => t);
  const f = fakeFetch(xtreamRoutes); setProviderFetch(f);
  await getCatalog("u1", list); await getCatalog("u1", list);
  assert.equal(f.calls.length, 6);
  t += 6 * 3600_000 - 1; await getCatalog("u1", list); assert.equal(f.calls.length, 6);
  t += 2; await getCatalog("u1", list); assert.equal(f.calls.length, 12);
  await getCatalog("u1", list, { force: true }); assert.equal(f.calls.length, 18);
});
test("concurrent loads share one provider load", async () => {
  const f = fakeFetch(xtreamRoutes); setProviderFetch(f);
  await Promise.all([getCatalog("u2", list), getCatalog("u2", list), getCatalog("u2", list)]);
  assert.equal(f.calls.length, 6);
});
test("changing credentials with the same list id bypasses the cache", async () => {
  const f = fakeFetch(xtreamRoutes); setProviderFetch(f);
  await getCatalog("u3", list); await getCatalog("u3", { ...list, password: "other" });
  assert.equal(f.calls.length, 12);
});
test("disk cache survives a restart and holds no credentials in clear", async () => {
  setProviderFetch(fakeFetch(xtreamRoutes)); await getCatalog("u4", list);
  const files = readdirSync(join(dataDir, "iptv-cache"));
  assert.ok(files.length > 0);
  for (const name of files) assert.ok(!readFileSync(join(dataDir, "iptv-cache", name), "utf8").includes(list.password!));
  clearMemoryCache(); const f = fakeFetch(xtreamRoutes); setProviderFetch(f);
  await getCatalog("u4", list); assert.equal(f.calls.length, 0);
});
test("wrong Xtream credentials are an error, not an empty list", async () => {
  setProviderFetch(fakeFetch(() => ({ user_info: { auth: 0 } })));
  await assert.rejects(getCatalog("u5", list), /recusou o utilizador ou a palavra-passe/);
});
test("provider failure messages never contain the list URL or password", async () => {
  setProviderFetch(async () => { throw new Error("connect ECONNREFUSED " + list.url); });
  await assert.rejects(getCatalog("u6", list), (e: Error) => !e.message.includes(list.password!) && !e.message.includes("tv.example.test"));
});
```

`xtreamRoutes(url)` devolve a resposta da fixture conforme `url.searchParams.get("action")`; `list` é `{ id: "l1", name: "Casa", type: "xtream", url: "https://tv.example.test/", username: "u", password: "segredo-123" }`. `clearMemoryCache(): void` é exportado de `cache.ts` só para testes.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/api/test/iptv-cache.test.ts`
Expected: FAIL (módulos em falta).

- [ ] **Step 3: Implement `provider.ts` and `cache.ts`**

- Xtream: 6 pedidos **em sequência** (`get_live_categories`, `get_live_streams`, `get_vod_categories`, `get_vod_streams`, `get_series_categories`, `get_series`), `safeFetch` com `timeout: 60000`, `maxBytes: 64 MiB`. Antes do catálogo, se a resposta de `get_live_categories` for um objecto com `user_info.auth === 0`, lança o erro de credenciais. Qualquer outra falha vira `ProviderError` com a mensagem genérica (a original não se propaga).
- M3U: um pedido a `list.url`, depois `normalizeM3U`.
- Chave da cache: `sha256(userId|list.id|list.type|list.url|username|password)` em hex. Memória: `Map<key, { value, expires }>`; em curso: `Map<key, Promise>`. Disco: `config.dataDir/iptv-cache/<key>.bin` com `encrypt({ value, expires })`, permissões `0o600`; ficheiro ilegível é ignorado.
- Detalhes: chave `key + ":movie:" + id` / `":series:" + id`, TTL 12 h, mesmo mecanismo.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/api/test/iptv-cache.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/iptv/provider.ts apps/api/src/modules/iptv/cache.ts apps/api/src/modules/iptv/types.ts apps/api/src/lib/config.ts apps/api/test/iptv-cache.test.ts
git commit -m "feat(api): load IPTV catalogs once and cache them encrypted"
```

---

### Task 5: Preferências TV no estado do Membro

**Files:**
- Create: `apps/api/src/modules/iptv/prefs.ts`
- Modify: `apps/api/src/modules/member/routes.ts` (chave `tv` no esquema `patch`), `apps/api/src/modules/member/service.ts` (`emptyState` com `tv: {}`)
- Test: `apps/api/test/iptv-prefs.test.ts`

**Interfaces:**
- Consumes: `Section`, `TVCategory` (Task 2).
- Produces:

```ts
export const tvListPrefs: z.ZodType<TVListPrefs>; // .strict()
export const tvPrefs: z.ZodType<Record<string, TVListPrefs>>; // máx. 100 listas
export interface TVListPrefs {
  pinned: Record<Section, string[]>;      // máx. 4 por secção
  order: Record<Section, string[]>;
  hidden: Record<Section, string[]>;
  shownAdult: Record<Section, string[]>;  // pastas adultas que o Membro escolheu mostrar
  favorites: Record<Section, string[]>;
  progress: Record<string, { position: number; duration: number; updatedAt: number }>; // chave "movie:<id>" ou "episode:<id>"
  lastChannel?: string;
}
export function defaultPrefs(): TVListPrefs;
export function prefsFor(state: { tv?: Record<string, unknown> }, listId: string): TVListPrefs; // preenche o que faltar com defaultPrefs()
export function isCategoryHidden(c: TVCategory, p: TVListPrefs): boolean;
export function adultItemsVisible(section: Section, p: TVListPrefs): boolean; // true se houver alguma pasta adulta mostrada na secção
export function orderCategories(cs: TVCategory[], p: TVListPrefs): (TVCategory & { pinned: boolean; hidden: boolean })[];
```

- [ ] **Step 1: Write the failing test**

```ts
const cats = [cat("1", "Portugal"), cat("2", "For Adults", true), cat("3", "Brasil"), cat("4", "Espanha")];
test("adult folders start hidden and can be shown", () => {
  const p = defaultPrefs();
  assert.equal(isCategoryHidden(cats[1], p), true);
  assert.equal(adultItemsVisible("live", p), false);
  p.shownAdult.live = ["2"];
  assert.equal(isCategoryHidden(cats[1], p), false);
  assert.equal(adultItemsVisible("live", p), true);
});
test("pinned first, then saved order, then provider order", () => {
  const p = { ...defaultPrefs(), pinned: { ...defaultPrefs().pinned, live: ["4"] }, order: { ...defaultPrefs().order, live: ["3", "1"] } };
  assert.deepEqual(orderCategories(cats, p).map((c) => [c.id, c.pinned, c.hidden]), [["4", true, false], ["3", false, false], ["1", false, false], ["2", false, true]]);
});
test("schema caps pins at 4 and rejects unknown keys", () => {
  const ok = defaultPrefs();
  ok.pinned.live = ["1", "2", "3", "4"];
  assert.ok(tvListPrefs.safeParse(ok).success);
  ok.pinned.live.push("5");
  assert.equal(tvListPrefs.safeParse(ok).success, false);
  assert.equal(tvListPrefs.safeParse({ ...defaultPrefs(), extra: 1 }).success, false);
});
test("prefsFor fills in missing parts", () => {
  assert.deepEqual(prefsFor({ tv: { l1: { favorites: { live: ["9"] } } } }, "l1").favorites.live, ["9"]);
  assert.deepEqual(prefsFor({}, "l1"), defaultPrefs());
});
```

(`cat(id, name, adult = false)` cria um `TVCategory` de `live` com `count: 1`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/api/test/iptv-prefs.test.ts`
Expected: FAIL (módulo em falta).

- [ ] **Step 3: Implement `prefs.ts` and wire `tv` into the member state**

Em `member/routes.ts`, acrescentar `tv: tvPrefs.optional()` ao `patch`. Em `service.ts`, `emptyState()` ganha `tv: {}`. Listas de ids com máx. 10 000 entradas; `progress` com máx. 5 000 chaves.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test apps/api/test/iptv-prefs.test.ts && npm test && npm run typecheck`
Expected: PASS em tudo (o teste de integração existente continua verde).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/iptv/prefs.ts apps/api/src/modules/member/routes.ts apps/api/src/modules/member/service.ts apps/api/test/iptv-prefs.test.ts
git commit -m "feat(api): keep per-list TV folders, favourites and progress in member state"
```

---

### Task 6: Vistas e rotas

**Files:**
- Create: `apps/api/src/modules/iptv/views.ts`
- Modify: `apps/api/src/modules/iptv/routes.ts` (manter `/resource`, juntar as novas rotas)
- Test: `apps/api/test/iptv-views.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4 e 5.
- Produces (`views.ts`, funções puras sobre catálogo + preferências):

```ts
export interface CategoryView { id: string; name: string; country?: string; count: number; pinned: boolean; hidden: boolean }
export interface SectionView { categories: CategoryView[]; total: number; hiddenCount: number }
export function sectionsView(c: TVCatalog, p: TVListPrefs): { fetchedAt: number; sections: Partial<Record<Section, SectionView>> };
export function categoryPage(c: TVCatalog, p: TVListPrefs, section: Section, categoryId: string, page: number, size: number):
  { items: (TVChannel | TVMovie | TVSeries)[]; total: number; page: number; size: number } | undefined; // undefined = pasta escondida ou inexistente
export function searchIndex(c: TVCatalog, p: TVListPrefs): { k: "l" | "m" | "s"; id: string; n: string; c: string }[];
export function visibleItem(c: TVCatalog, p: TVListPrefs, section: Section, id: string): TVChannel | TVMovie | TVSeries | undefined;
export function publicItem<T extends { source?: string }>(item: T): Omit<T, "source">;
```

- Produces (rotas, todas com `requireMember`, `listId` procurado em `getState(member).iptv`, 404 «Lista IPTV não encontrada.»):
  - `GET /api/iptv/lists/:listId` → `sectionsView`
  - `POST /api/iptv/lists/:listId/refresh` → `getCatalog(..., { force: true })` e depois `sectionsView`
  - `GET /api/iptv/lists/:listId/:section/categories/:categoryId?page=0&size=60` → `categoryPage` (`size` entre 1 e 200; 404 se `undefined`)
  - `GET /api/iptv/lists/:listId/search-index` → `searchIndex`
  - `GET /api/iptv/lists/:listId/movie/:id` e `/series/:id` → detalhe via `getMovie`/`getSeries`, só se `visibleItem` o aceitar (senão 404 «Este conteúdo não está disponível.»)
  - `ProviderError` → 502 com a mensagem dela; `section` inválida → 400.
  - Todas as respostas passam itens por `publicItem`.

- [ ] **Step 1: Write the failing test**

```ts
const c = normalizeXtreamCatalog(xtreamFixture.catalog, 0);
test("sections count only what is visible and say how much is hidden", () => {
  const v = sectionsView(c, defaultPrefs());
  assert.deepEqual(Object.keys(v.sections), ["live", "movie", "series"]);
  assert.equal(v.sections.live!.total, 2);         // Portugal 2; Exclusivos tem só «XXX Gold» (adulto); Adultos escondida
  assert.equal(v.sections.live!.hiddenCount, 1);
});
test("adult items in normal folders stay out of pages, search and details", () => {
  const p = defaultPrefs();
  assert.equal(categoryPage(c, p, "live", "3", 0, 60)!.total, 0);
  assert.equal(categoryPage(c, p, "live", "2", 0, 60), undefined);
  assert.ok(!searchIndex(c, p).some((e) => /XXX|Canal 18/.test(e.n)));
  const gold = c.live.items.find((x) => x.name === "XXX Gold")!;
  assert.equal(visibleItem(c, p, "live", gold.id), undefined);
});
test("pages are sliced and keep provider order", () => {
  const page = categoryPage(c, defaultPrefs(), "live", "1", 0, 1)!;
  assert.deepEqual([page.total, page.items.length, page.items[0].name], [2, 1, "RTP1 HD"]);
});
test("a section without content is absent", () => {
  const empty = { ...c, series: { categories: [], items: [] } };
  assert.equal(sectionsView(empty, defaultPrefs()).sections.series, undefined);
});
test("public items never carry the M3U source", () => {
  assert.equal("source" in publicItem({ id: "1", source: "http://p.test/u/p/1.ts" }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/api/test/iptv-views.test.ts`
Expected: FAIL (módulo em falta).

- [ ] **Step 3: Implement `views.ts` and the routes**

`total` e `count` de cada `CategoryView` contam só itens visíveis (sem adultos quando `adultItemsVisible` é falso). `hiddenCount` = número de pastas escondidas na secção. O índice de pesquisa usa `c` = nome limpo da pasta. Validar `page`/`size` com zod (`z.coerce.number().int()`).

- [ ] **Step 4: Run the whole suite**

Run: `npx tsx --test apps/api/test/iptv-views.test.ts && npm test && npm run typecheck`
Expected: PASS em tudo.

- [ ] **Step 5: Verify against the real list (manual, without logging credentials)**

Com `npm run dev` a correr e sessão iniciada no browser, abrir `http://127.0.0.1:5174/api/iptv/lists/<id da lista>` e confirmar: 3 secções; ~16 pastas Ao vivo com nomes limpos; 1 pasta adulta escondida; segundo pedido instantâneo (cache). Anotar só contagens, nunca URLs.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/iptv/views.ts apps/api/src/modules/iptv/routes.ts apps/api/test/iptv-views.test.ts
git commit -m "feat(api): serve IPTV sections, folder pages, details and search index"
```
