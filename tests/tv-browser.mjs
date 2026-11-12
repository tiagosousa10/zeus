import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { tvFixture, settleTV, startTVServer } from "./tv-fixture.mjs";
const directory = process.env.TV_SCREENSHOTS || "/tmp/zeus-tv-browser";
await mkdir(directory, { recursive: true });
const mediaDir = await mkdtemp(join(tmpdir(), "zeus-tv-media-"));
const base = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc=size=320x180:rate=10",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:sample_rate=44100",
  "-t",
  "12",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-pix_fmt",
  "yuv420p",
  "-g",
  "10",
  "-c:a",
  "aac",
];
let browser, server;
try {
  execFileSync(ffmpeg, [
    ...base,
    "-movflags",
    "+faststart",
    join(mediaDir, "file.mp4"),
  ]);
  execFileSync(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    join(mediaDir, "file.mp4"),
    "-c",
    "copy",
    "-f",
    "mpegts",
    join(mediaDir, "stream.ts"),
  ]);
  execFileSync(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    join(mediaDir, "file.mp4"),
    "-c",
    "copy",
    "-hls_time",
    "2",
    "-hls_list_size",
    "0",
    join(mediaDir, "index.m3u8"),
  ]);
  // Same fragmented-MP4 output contract as the API's ffmpeg remux (local source).
  execFileSync(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    join(mediaDir, "stream.ts"),
    "-c",
    "copy",
    "-bsf:a",
    "aac_adtstoasc",
    "-movflags",
    "frag_keyframe+empty_moov+default_base_moof",
    "-f",
    "mp4",
    join(mediaDir, "remux"),
  ]);
  server = await startTVServer(5187);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: "Europe/Lisbon",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__rejections = [];
    addEventListener("unhandledrejection", (e) =>
      window.__rejections.push(String(e.reason)),
    );
  });
  const fixture = await tvFixture(page, {
    largeSearch: true,
    media: async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1);
      let bytes = await readFile(join(mediaDir, name));
      const range = route
        .request()
        .headers()
        .range?.match(/bytes=(\d+)-(\d*)/);
      let headers = {
        "content-type": name.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : name.endsWith(".ts")
            ? "video/mp2t"
            : "video/mp4",
        "access-control-allow-origin": "*",
        "accept-ranges": "bytes",
      };
      if (range) {
        const start = +range[1],
          end = range[2]
            ? Math.min(+range[2], bytes.length - 1)
            : bytes.length - 1;
        headers["content-range"] = `bytes ${start}-${end}/${bytes.length}`;
        bytes = bytes.subarray(start, end + 1);
      }
      return route
        .fulfill({ status: range ? 206 : 200, headers, body: bytes })
        .catch(() => {});
    },
  });
  // Test adapter exposes only the existing context to exercise difficult lifecycle cases.
  await page.route("**/src/features/tv/hooks/state.tsx*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        "return value;",
        "window.__tvFixture = value; return value;",
      ),
    });
  });
  const goto = async (hash) => {
    await page.goto("http://127.0.0.1:5187/tv" + hash);
    await page.reload();
    await page.locator(".tv-app").waitFor();
    await settleTV(page);
  };
  const noOverflow = async (label) =>
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      page.viewportSize().width,
      label + " overflow",
    );
  const modalBoundaryTrap = async () => {
    const dialog = page.getByRole("dialog");
    const focusable = dialog
      .locator(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
      )
      .filter({ visible: true });
    const first = focusable.first(),
      last = focusable.last();
    await last.focus();
    await page.keyboard.press("Tab");
    assert.ok(
      await first.evaluate((e) => e === document.activeElement),
      "Tab at last wraps to first",
    );
    await first.focus();
    await page.keyboard.press("Shift+Tab");
    assert.ok(
      await last.evaluate((e) => e === document.activeElement),
      "Shift+Tab at first wraps to last",
    );
  };
  const shots = [
    ["portal", ""],
    ["live-category", "#section=live&category=pt"],
    ["series", "#section=series"],
    ["series-detail", "#section=series&category=pt&detail=0"],
    ["movies", "#section=movie"],
    ["movie-detail", "#section=movie&category=pt&detail=0"],
    ["guide", "#section=live&guide=1"],
  ];
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, hash] of shots) {
      console.log("Screen", name, width);
      await goto(hash);
      if (name.includes("detail"))
        await page
          .getByRole("heading", {
            name: name === "series-detail" ? "Série 0" : "Filme 0",
            exact: true,
          })
          .waitFor();
      if (name === "live-category")
        await page
          .getByRole("heading", { name: "Portugal", exact: true })
          .waitFor();
      if (name === "guide")
        await page
          .getByRole("heading", { name: "Guia", exact: true })
          .waitFor();
      if (name === "portal") await page.locator(".tv-portal").first().waitFor();
      if (name === "series" || name === "movies") {
        await page.locator(".tv-bento").waitFor();
        assert.ok((await page.locator(".tv-poster").count()) > 0);
      }
      if (name === "guide")
        await page.locator(".tv-guide-row").first().waitFor();
      await settleTV(page);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
        `${name} overflow`,
      );
      await page.screenshot({ path: `${directory}/${name}-${width}.png` });
      if (
        width === 375 &&
        ["series", "series-detail", "movies", "movie-detail"].includes(name)
      ) {
        await page.evaluate(() =>
          window.scrollTo(0, document.documentElement.scrollHeight),
        );
        await settleTV(page);
        await page.screenshot({
          path: `${directory}/${name}-scroll-${width}.png`,
        });
      }
    }
    await goto("");
    const foldersOpener = page.getByRole("button", {
      name: "Gerir pastas",
      exact: true,
    });
    await foldersOpener.focus();
    await foldersOpener.click();
    await page
      .getByRole("heading", { name: "Gerir pastas", exact: true })
      .waitFor();
    await settleTV(page);
    await noOverflow("folders");
    await modalBoundaryTrap();
    await page.screenshot({ path: `${directory}/folders-${width}.png` });
    await page.keyboard.press("Escape");
    assert.ok(
      await foldersOpener.evaluate((e) => e === document.activeElement),
      "folder Esc restores opener",
    );
    const searchOpener = page.locator(".tv-header-tools button").first();
    await searchOpener.focus();
    await page.evaluate(() => window.__tvFixture.openSearch());
    await page
      .getByRole("combobox", { name: "Procurar canais, séries e filmes" })
      .waitFor();
    await settleTV(page);
    assert.equal(await page.locator(".tv-result").count(), 90);
    await noOverflow("search");
    await modalBoundaryTrap();
    await page
      .getByRole("heading", { name: "Procurar na TV", exact: true })
      .waitFor();
    await page.screenshot({ path: `${directory}/search-${width}.png` });
    await page
      .getByRole("combobox", { name: "Procurar canais, séries e filmes" })
      .fill("49999");
    await page
      .locator(".tv-result")
      .filter({ hasText: "Canal 49999" })
      .waitFor();
    assert.equal(await page.locator(".tv-result").count(), 1);
    await page.keyboard.press("Escape");
    assert.ok(
      await searchOpener.evaluate((e) => e === document.activeElement),
      "search Esc restores opener",
    );
    await page.evaluate(() =>
      window.__tvFixture.play({
        section: "live",
        id: "0",
        title: "Canal 0",
        categoryId: "pt",
      }),
    );
    await page.waitForFunction(
      () => document.querySelector("video")?.videoWidth === 320,
    );
    await settleTV(page);
    await page.screenshot({ path: `${directory}/player-${width}.png` });
    assert.equal(
      await page.locator(".tv-live-dot").count(),
      1,
      "live indicator",
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
  }
  console.log("Integration list change");
  // Changing lists while the old category request is in flight cannot leak old rows.
  const pendingCategory = fixture.holdNextCategory();
  await page.goto("http://127.0.0.1:5187/tv?race=1#section=live&category=pt");
  await pendingCategory.started;
  await page
    .getByRole("combobox", { name: "Lista IPTV" })
    .selectOption("other");
  await page.locator(".tv-portal").filter({ hasText: "Portugal" }).click();
  await page
    .locator(".tv-channel")
    .filter({ hasText: "Viagem Canal 0" })
    .waitFor();
  pendingCategory.release();
  await settleTV(page);
  assert.equal(
    await page
      .locator(".tv-channel")
      .filter({ hasText: /^Canal 0/ })
      .count(),
    0,
  );
  fixture.setDelay(0);
  await page
    .getByRole("combobox", { name: "Lista IPTV" })
    .selectOption("fixture");
  await page.locator(".tv-portal").filter({ hasText: "Portugal" }).click();
  await page.locator(".tv-channel").first().waitFor();
  console.log("Integration favorites");
  const star = page.locator(".tv-favorite").first();
  await star.click();
  await page.waitForFunction(
    () => window.__tvFixture.prefs.favorites.live.length === 1,
  );
  await page.evaluate(() => window.__tvFixture.openSearch());
  const search = page.getByRole("combobox", {
    name: "Procurar canais, séries e filmes",
  });
  await search.waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Só Portugal", exact: true })
      .getAttribute("aria-pressed"),
    "false",
    "global search clears folder scope",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "⌕ Procurar em Portugal", exact: true })
    .click();
  await search.waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Só Portugal", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__tvFixture.openSearch());
  await search.waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Só Portugal", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  const countSearch = fixture.requests.filter((r) =>
    r.path.endsWith("/search-index"),
  ).length;
  await page.keyboard.press("Escape");
  await star.click();
  await page.evaluate(() => window.__tvFixture.openSearch());
  await search.waitFor();
  assert.equal(
    fixture.requests.filter((r) => r.path.endsWith("/search-index")).length,
    countSearch,
    "favorite preserves compact index cache",
  );
  await search.focus();
  await page.keyboard.press("ArrowDown");
  await page
    .locator('.tv-result[aria-current="true"]')
    .filter({ hasText: "Canal 00001" })
    .waitFor();
  await page.keyboard.press("ArrowUp");
  await page
    .locator('.tv-result[aria-current="true"]')
    .filter({ hasText: "Canal 00000" })
    .waitFor();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__tvFixture.target?.id === "1");
  await page.waitForFunction(
    () => document.querySelector("video")?.videoWidth === 320,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "⚙ Pastas", exact: true }).click();
  await page
    .getByRole("switch", { name: "Mostrar Portugal", exact: true })
    .click();
  await page.waitForFunction(() =>
    window.__tvFixture.prefs.hidden.live.includes("pt"),
  );
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__tvFixture.openSearch());
  await search.waitFor();
  await search.fill("Canal"); // Other visible sections must remain searchable.
  await page.waitForFunction(
    () => document.querySelectorAll(".tv-result").length === 0,
  );
  assert.equal(
    fixture.requests.filter((r) => r.path.endsWith("/search-index")).length,
    countSearch + 1,
    "visibility renews compact index",
  );
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__tvFixture.openFolders());
  await page
    .getByRole("switch", { name: "Mostrar Portugal", exact: true })
    .click();
  await page.keyboard.press("Escape");
  console.log("Integration cached hidden surfaces");
  await page.evaluate(async () =>
    window.__tvFixture.updatePrefs((p) => ({
      ...p,
      favorites: { ...p.favorites, live: ["0"], movie: ["0"] },
      progress: {
        ...p.progress,
        "movie:0": { position: 30, duration: 120, updatedAt: Date.now() },
      },
    })),
  );
  // Warm the actual visible favourite category and movie hero/continue caches.
  await page.getByRole("button", { name: "★ Favoritos", exact: true }).click();
  await page.locator(".tv-channel").first().waitFor();
  assert.equal(await page.locator(".tv-channel").count(), 1);
  await page.evaluate(() => window.__tvFixture.navigate({ section: "movie" }));
  await page.locator(".tv-bento h1").filter({ hasText: "Filme 0" }).waitFor();
  await page
    .getByRole("progressbar", { name: "Progresso de Filme 0", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Gerir pastas", exact: true }).click();
  await page
    .getByRole("switch", { name: "Mostrar Portugal", exact: true })
    .click();
  await page.waitForFunction(() =>
    window.__tvFixture.prefs.hidden.movie.includes("pt"),
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("heading", { name: "Sem filmes disponíveis", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".tv-bento,.tv-continue-row,.tv-poster").count(),
    0,
    "hide clears cached movie hero, continue and posters",
  );
  await page.evaluate(() =>
    window.__tvFixture.navigate({ section: "live", categoryId: "pt" }),
  );
  await page.locator(".tv-channel").first().waitFor();
  await page.getByRole("button", { name: "⚙ Pastas", exact: true }).click();
  await page
    .getByRole("switch", { name: "Mostrar Portugal", exact: true })
    .click();
  await page.waitForFunction(() =>
    window.__tvFixture.prefs.hidden.live.includes("pt"),
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("heading", { name: "Sem pastas visíveis", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".tv-channel,.tv-portal").count(),
    0,
    "hide removes cached favourites/category cards",
  );
  // Revisit both affected views without reload: cached data must stay hidden.
  for (const view of [
    { section: "movie" },
    { section: "live", categoryId: "pt" },
    { section: "movie", categoryId: "pt" },
  ]) {
    await page.evaluate((v) => window.__tvFixture.navigate(v), view);
    await page
      .getByRole("heading", {
        name:
          view.section === "movie"
            ? "Sem filmes disponíveis"
            : "Sem pastas visíveis",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .locator(
          ".tv-bento,.tv-editorial,.tv-top10,.tv-continue-row,.tv-poster,.tv-channel,.tv-portal",
        )
        .count(),
      0,
      "reopen cannot resurrect hidden cached content",
    );
  }
  assert.deepEqual(
    fixture.getState().tv.fixture.favorites.live,
    ["0"],
    "hide retains preference but removes content",
  );
  assert.equal(fixture.getState().tv.fixture.progress["movie:0"].position, 30);
  // Restore through folder UI and prove retained favourites/progress reappear.
  await page.getByRole("button", { name: "Gerir pastas", exact: true }).click();
  for (const section of ["Filmes", "Ao vivo"]) {
    await page
      .getByRole("dialog")
      .getByRole("button", { name: section, exact: true })
      .click();
    await page
      .getByRole("switch", { name: "Mostrar Portugal", exact: true })
      .click();
  }
  await page.keyboard.press("Escape");
  await page.locator(".tv-bento h1").filter({ hasText: "Filme 0" }).waitFor();
  await page
    .getByRole("progressbar", { name: "Progresso de Filme 0", exact: true })
    .waitFor();
  await goto("#section=series&category=pt&detail=0");
  await page.locator(".tv-detail-aside .tv-primary").click();
  await page.waitForFunction(
    () => window.__tvFixture.target?.episodeId === "e0",
  );
  await page.waitForFunction(
    () => document.querySelector("video")?.videoWidth === 320,
  );
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  console.log("Integration guide retry");
  await page.evaluate(async () => {
    await Promise.all([
      window.__tvFixture.updatePrefs((p) => ({
        ...p,
        favorites: { ...p.favorites, movie: ["0"] },
      })),
      window.__tvFixture.updatePrefs((p) => ({
        ...p,
        progress: {
          ...p.progress,
          "movie:serial": {
            position: 17,
            duration: 120,
            updatedAt: Date.now(),
          },
        },
      })),
    ]);
  });
  assert.deepEqual(fixture.getState().tv.fixture.favorites.movie, ["0"]);
  assert.equal(
    fixture.getState().tv.fixture.progress["movie:serial"].position,
    17,
  );
  fixture.setGuideError(true);
  await goto("#section=live&guide=1");
  await page
    .getByRole("heading", { name: "Não foi possível carregar o guia" })
    .waitFor();
  fixture.setGuideError(false);
  await page
    .getByRole("button", { name: "Tentar de novo", exact: true })
    .click();
  await page.locator(".tv-guide-row").first().waitFor();
  assert.equal(await page.locator(".tv-guide-row").count(), 40);
  await page.setViewportSize({ width: 1440, height: 900 });
  await settleTV(page);
  assert.ok(
    await page
      .locator(".tv-guide-timeline strong")
      .first()
      .evaluate((e) => {
        const a = e.getBoundingClientRect(),
          b = e.parentElement.getBoundingClientRect();
        return a.height > 0 && a.bottom <= b.bottom && a.top >= b.top;
      }),
    "programme title fits its card",
  );
  await page
    .locator(".tv-guide-timeline button")
    .filter({ hasText: "Amanhã" })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Agora", exact: true }).click();
  assert.equal(
    new URLSearchParams(
      fixture.requests.find((r) => r.path.endsWith("/epg/grid")).query,
    ).get("timezone"),
    "Europe/Lisbon",
  );
  // Programme navigation uses interval overlap vertically, with unequal row durations.
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const lane = width === 375 ? ".tv-guide-mobile" : ".tv-guide-timeline";
    const first = page.locator(`.tv-guide-row ${lane} button`).first();
    await first.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.evaluate(
        () => document.activeElement.querySelector("strong").textContent,
      ),
      "Amanhã",
    );
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page.evaluate(
        () => document.activeElement.querySelector("strong").textContent,
      ),
      "Telejornal",
      "vertical navigation selects overlapping long programme",
    );
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll(".tv-guide-row")].indexOf(
          document.activeElement.closest(".tv-guide-row"),
        ),
      ),
      1,
    );
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page.evaluate(
        () => document.activeElement.querySelector("strong").textContent,
      ),
      "Amanhã",
      "vertical time anchor survives a longer intervening programme",
    );
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    assert.equal(
      await page.evaluate(
        () => document.activeElement.querySelector("strong").textContent,
      ),
      "Amanhã",
    );
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await page.evaluate(
        () => document.activeElement.querySelector("strong").textContent,
      ),
      "Telejornal",
    );
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.evaluate(() => window.__tvFixture.openSearch());
    await page
      .getByRole("combobox", { name: "Procurar canais, séries e filmes" })
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(
      await page.getByRole("dialog").count(),
      1,
      "guide info survives search dismissal",
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.evaluate(() => {
      document.body.style.overflow = "auto";
    });
    await first.focus();
    await page.keyboard.press("Enter");
    if (
      (await page
        .getByRole("button", { name: "Controlos do leitor" })
        .getAttribute("aria-expanded")) === "false"
    )
      await page.getByRole("button", { name: "Controlos do leitor" }).click();
    await page
      .locator(".tv-programme-capsule")
      .getByText("Guia exclusivo do canal", { exact: true })
      .waitFor();
    const playerButton = page.getByRole("button", {
      name: "Guia do canal",
      exact: true,
    });
    await playerButton.focus();
    await page.evaluate(() => window.__tvFixture.openSearch());
    await page
      .getByRole("combobox", { name: "Procurar canais, séries e filmes" })
      .waitFor();
    // A button in search must not cause the underlying player to change channels.
    await page.getByRole("dialog").last().getByRole("button").first().focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => window.__tvFixture.target.id), "0");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 1);
    assert.ok(await playerButton.evaluate((e) => e === document.activeElement));
    assert.equal(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
    );
    await playerButton.click();
    await page
      .getByRole("dialog")
      .getByText("Programa curto do fornecedor")
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 1);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(
      await page.evaluate(() => document.body.style.overflow),
      "auto",
    );
    assert.ok(await first.evaluate((e) => e === document.activeElement));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // Selected-channel requests are bounded, cancel on channel changes, and expose no-guide/retry.
  const guideGate = fixture.holdNextChannelGuide();
  const cancelledGuide = page.waitForEvent("requestfailed", (r) =>
    r.url().includes("/epg/channel/pending-guide"),
  );
  await page.evaluate(() =>
    window.__tvFixture.play({
      section: "live",
      id: "pending-guide",
      title: "Pendente",
      categoryId: "pt",
    }),
  );
  await guideGate.started;
  await page.evaluate(() =>
    window.__tvFixture.play({
      section: "live",
      id: "empty",
      title: "Vazio",
      categoryId: "pt",
    }),
  );
  await cancelledGuide;
  guideGate.release();
  await page
    .locator(".tv-programme-capsule")
    .getByText("Sem guia", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Guia do canal", exact: true })
    .click();
  await page
    .getByText("Sem programação disponível.", { exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  fixture.setGuideError(true);
  await page.evaluate(() =>
    window.__tvFixture.play({
      section: "live",
      id: "guide-retry",
      title: "Guia retry",
      categoryId: "pt",
    }),
  );
  await page
    .getByRole("button", { name: "Guia do canal", exact: true })
    .click();
  await page
    .getByText("Não foi possível carregar o guia.", { exact: true })
    .waitFor();
  fixture.setGuideError(false);
  await page
    .getByRole("button", { name: "Tentar de novo", exact: true })
    .click();
  await page
    .getByText("Programa curto do fornecedor", { exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  assert.ok(
    fixture.requests
      .filter((r) => r.path.includes("/epg/channel/"))
      .every((r) => {
        const q = new URLSearchParams(r.query);
        return +q.get("to") - +q.get("from") === 86400000;
      }),
  );
  // Public list editor never hydrates stored secrets; blank replacements preserve them.
  await page.getByRole("button", { name: "Listas IPTV", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar", exact: true })
    .first()
    .click();
  for (const name of ["url", "username", "password", "epgUrl"])
    assert.equal(await page.locator(`[name="${name}"]`).inputValue(), "");
  await page.locator('[name="name"]').fill("Casa editada");
  await page
    .getByRole("button", { name: "Guardar lista", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Casa editada", exact: true })
    .waitFor();
  assert.equal(fixture.getState().iptv[0].password, "fixture-only");
  const refreshBefore = fixture.requests.filter((r) =>
    r.path.endsWith("/refresh"),
  ).length;
  await page
    .getByRole("button", { name: "Editar", exact: true })
    .first()
    .click();
  await page.locator('[name="password"]').fill("replacement-browser-secret");
  await page
    .getByRole("button", { name: "Guardar lista", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Casa editada", exact: true })
    .waitFor();
  assert.equal(
    fixture.getState().iptv[0].password,
    "replacement-browser-secret",
  );
  assert.ok(
    fixture.requests.filter((r) => r.path.endsWith("/refresh")).length >
      refreshBefore,
  );
  await page
    .getByRole("button", { name: "Editar", exact: true })
    .first()
    .click();
  assert.equal(await page.locator('[name="password"]').inputValue(), "");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Listas IPTV", exact: true }).click();
  await page
    .getByRole("button", { name: "＋ Adicionar lista", exact: true })
    .click();
  await page.locator(".tv-list-form select").selectOption("m3u");
  await page.locator('[name="name"]').fill("Lista CRUD");
  await page
    .locator('[name="url"]')
    .fill("https://new.example.test/list?token=new");
  await page
    .locator('[name="epgUrl"]')
    .fill("https://new.example.test/epg?token=new");
  await page
    .getByRole("button", { name: "Guardar lista", exact: true })
    .click();
  const newCard = page
    .locator(".tv-list-card")
    .filter({ hasText: "Lista CRUD" });
  await newCard.waitFor();
  await newCard.getByRole("button", { name: "Editar", exact: true }).click();
  assert.equal(await page.locator('[name="url"]').inputValue(), "");
  assert.equal(await page.locator('[name="epgUrl"]').inputValue(), "");
  await page.getByLabel("Remover guia EPG").check();
  await page
    .getByRole("button", { name: "Guardar lista", exact: true })
    .click();
  await newCard.waitFor();
  assert.equal(
    fixture.getState().iptv.find((l) => l.name === "Lista CRUD").epgUrl,
    "",
  );
  await newCard.getByRole("button", { name: "Remover", exact: true }).click();
  await newCard.waitFor({ state: "detached" });
  assert.ok(!fixture.getState().iptv.some((l) => l.name === "Lista CRUD"));
  assert.ok(
    fixture.patches
      .filter((p) => p.iptv)
      .every((p) => !JSON.stringify(p).includes("fixture-only")),
    "stored secrets are never echoed in mutations",
  );
  await page.keyboard.press("Escape");
  fixture.failNextPlay();
  await page.evaluate(() =>
    window.__tvFixture.play({
      section: "movie",
      id: "failure",
      title: "Falha",
    }),
  );
  await page
    .getByRole("button", { name: "Tentar de novo", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Tentar de novo", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("video")?.videoWidth === 320,
  );
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  fixture.setMode("mp4");
  await page.evaluate(() =>
    window.__tvFixture.play({
      section: "movie",
      id: "slow",
      title: "Demorado",
    }),
  );
  await page.waitForFunction(() =>
    document
      .querySelector(".tv-programme-capsule")
      ?.textContent.includes("Demorado"),
  );
  await page.waitForTimeout(100);
  await page.evaluate(() =>
    window.__tvFixture.play({ section: "movie", id: "fast", title: "Rápido" }),
  );
  await page.waitForFunction(
    () => document.querySelector("video")?.videoWidth === 320,
  );
  await page.waitForTimeout(1600);
  assert.equal(
    await page.evaluate(() => window.__tvFixture.target.id),
    "fast",
    "cancelled start never reopens old target",
  );
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  const decoded = [];
  for (const mode of ["mp4", "hls", "mpegts", "remux"]) {
    fixture.setMode(mode);
    await page.evaluate(
      (m) => window.__tvFixture.play({ section: "movie", id: m, title: m }),
      mode,
    );
    await page.waitForFunction(
      () => document.querySelector("video")?.videoWidth === 320,
      null,
      { timeout: 30000 },
    );
    await page.locator("video").evaluate(async (v) => {
      v.muted = true;
      await v.play();
    });
    await page.waitForFunction(
      () => document.querySelector("video")?.currentTime > 0.3,
    );
    assert.equal(
      await page.locator(".tv-live-dot").count(),
      0,
      "red only live",
    );
    decoded.push(mode);
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
  }
  assert.ok(fixture.stops.length >= 5);
  assert.ok(fixture.starts.every((s) => s.id));
  assert.ok(
    fixture.requests
      .filter((r) => r.path.includes("/categories/"))
      .every((r) => new URLSearchParams(r.query).get("size") !== "50000"),
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(await page.evaluate(() => window.__rejections), []);
  console.log(
    JSON.stringify({
      stackedModalPlayerAndGuide: true,
      guideArrowsDesktopMobile: true,
      selectedChannelGuide: true,
      channelGuideCancellationNoGuideRetry: true,
      publicListCRUD: true,
      secretOnlyRefresh: true,
      mockedMember: true,
      localDecoded: decoded,
      screenshots: 24,
      listChanges: true,
      visibilityInvalidation: true,
      cachedHiddenSurfaces: true,
      keyboardBoundaryTrapAndRestore: true,
      arrowsEnter: true,
      gatedListRace: true,
      serialPreferences: true,
      episodes: true,
      guideRetry: true,
      playbackRetry: true,
      globalSearchScope: true,
      abandonedStart: true,
      search50000: true,
      boundedSearch90: true,
      errors,
      directory,
    }),
  );
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  await rm(mediaDir, { recursive: true, force: true });
}
