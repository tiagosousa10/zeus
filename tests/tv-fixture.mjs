// Isolated UI contracts: all API responses are synthetic; no database/provider credentials.
import { mockMember } from "./visual-fixtures.mjs";
export const tvState = {
  iptv: [
    {
      id: "fixture",
      name: "Casa",
      type: "xtream",
      url: "https://fixture.example.test",
      username: "fixture",
      password: "fixture-only",
    },
    {
      id: "other",
      name: "Viagem",
      type: "m3u",
      url: "https://other.example.test/list.m3u",
    },
  ],
  tv: {},
};
export async function tvFixture(page, { media, largeSearch = false } = {}) {
  const member = await mockMember(page, tvState),
    now = Date.now(),
    requests = [],
    starts = [],
    stops = [];
  const poster = "/art/img/zeus-6.webp";
  const category = {
    id: "pt",
    name: "Portugal",
    country: "PT",
    count: 49,
    pinned: true,
    hidden: false,
  };
  const item = (section, i) => ({
    id: String(i),
    name: `${section === "live" ? "Canal" : section === "movie" ? "Filme" : "Série"} ${i}`,
    categoryId: "pt",
    number: i + 1,
    tags: ["HD"],
    poster,
    year: 2024,
    rating: 8,
    added: now - i,
    container: "mp4",
    adult: false,
  });
  const items = Object.fromEntries(
    ["live", "movie", "series"].map((s) => [
      s,
      Array.from({ length: 49 }, (_, i) => item(s, i)),
    ]),
  );
  let categoryGate, channelGuideGate;
  const hiddenFor = (section) =>
    member.getState().tv?.fixture?.hidden?.[section]?.includes("pt");
  let delay = 0,
    guideError = false,
    mode = "mp4",
    compatibilityAvailable = false,
    failedPlay = false;
  await page.route("**/api/iptv/**", async (route) => {
    const u = new URL(route.request().url()),
      p = u.pathname;
    if (!p.startsWith("/api/iptv/")) return route.continue();
    requests.push({
      path: p,
      query: u.search,
      method: route.request().method(),
    });
    let json = {};
    if (p.includes("/play/") && !p.endsWith("/stop")) {
      if (!media)
        return route.fulfill({ status: 502, body: "No media fixture" });
      return media(route);
    }
    if (p.endsWith("/stop")) {
      stops.push(p);
      json = { stopped: true };
    } else if (p.endsWith("/play")) {
      const body = route.request().postDataJSON();
      starts.push(body);
      const token = `${mode}-${starts.length}`;
      if (body.id === "slow") await new Promise((r) => setTimeout(r, 1500));
      if (failedPlay) {
        failedPlay = false;
        return route.fulfill({
          status: 502,
          json: { error: "Fornecedor indisponível." },
        });
      }
      const playbackMode = body.compatibility ? "remux" : mode;
      json = {
        token,
        compatibilityAvailable,
        compatible: body.compatibility === true,
        type: playbackMode === "remux" ? "mp4" : playbackMode,
        url: `/api/iptv/play/${token}/${playbackMode === "hls" ? "index.m3u8" : playbackMode === "mpegts" ? "stream.ts" : playbackMode === "remux" ? "remux" : "file.mp4"}`,
        remux: playbackMode === "remux",
      };
    } else if (p.endsWith("/search-index")) {
      json = [
        ...(hiddenFor("live")
          ? []
          : Array.from({ length: largeSearch ? 50000 : 120 }, (_, i) => ({
              k: "l",
              id: String(i),
              n: `Canal ${String(i).padStart(5, "0")}`,
              c: "Portugal",
            }))),
        ...["movie", "series"].flatMap((section) =>
          hiddenFor(section)
            ? []
            : items[section].map((x) => ({
                k: section === "movie" ? "m" : "s",
                id: x.id,
                n: x.name,
                c: "Portugal",
              })),
        ),
      ];
    } else if (p.endsWith("/epg/now"))
      json = Object.fromEntries(
        (hiddenFor("live") ? [] : items.live).map((x) => [
          x.id,
          {
            now: {
              title: "Telejornal",
              start: now - 1200000,
              stop: now + 1800000,
            },
            next: {
              title: "O mundo",
              start: now + 1800000,
              stop: now + 5400000,
            },
          },
        ]),
      );
    else if (p.includes("/epg/channel/")) {
      if (channelGuideGate) {
        const gate = channelGuideGate;
        channelGuideGate = undefined;
        gate.startedResolve();
        await gate.response;
      }
      if (guideError)
        return route.fulfill({
          status: 502,
          json: { error: "Guia indisponível." },
        });
      json = p.endsWith("/empty")
        ? []
        : [
            {
              title: "Guia exclusivo do canal",
              start: now - 1200000,
              stop: now + 1800000,
              description: "Programa curto do fornecedor",
            },
            {
              title: "Seguinte exclusivo",
              start: now + 1800000,
              stop: now + 5400000,
            },
          ];
    } else if (p.endsWith("/epg/grid")) {
      if (guideError)
        return route.fulfill({
          status: 502,
          json: { error: "Guia indisponível." },
        });
      const from = +u.searchParams.get("from"),
        to = +u.searchParams.get("to");
      json = {
        availableDays: [new Date().toLocaleDateString("en-CA")],
        availability: { from, to, timezone: u.searchParams.get("timezone") },
        channels: (hiddenFor("live") ? [] : items.live)
          .slice(0, 40)
          .map((x) => ({
            ...x,
            programmes: [
              {
                title: "Telejornal",
                start: now - (x.id === "1" ? 2400000 : 1200000),
                stop: now + (x.id === "1" ? 3600000 : 1800000),
              },
              {
                title: "Amanhã",
                start: now + (x.id === "1" ? 3600000 : 1800000),
                stop: now + 5400000,
              },
            ],
          })),
        total: 49,
        page: 0,
        size: 40,
      };
    } else if (p.includes("/categories/")) {
      const s = p.split("/")[5],
        all =
          p.includes("/fixture/") && hiddenFor(s) ? [] : items[s] || items.live;
      const filtered =
        u.searchParams.get("favorites") === "1"
          ? all.filter((x) =>
              member.getState().tv?.fixture?.favorites?.[s]?.includes(x.id),
            )
          : all;
      const n = u.searchParams.has("anchor")
        ? Math.floor(+u.searchParams.get("anchor") / 48)
        : +(u.searchParams.get("page") || 0);
      json = {
        items: filtered
          .slice(n * 48, n * 48 + 48)
          .map((x) =>
            p.includes("/other/") ? { ...x, name: "Viagem " + x.name } : x,
          ),
        total: filtered.length,
        page: n,
        size: 48,
      };
      if (categoryGate && p.includes("/fixture/")) {
        const gate = categoryGate;
        categoryGate = undefined;
        gate.startedResolve();
        await gate.response;
      }
      if (delay && p.includes("/fixture/"))
        await new Promise((r) => setTimeout(r, delay));
    } else if (/\/series\/[^/]+$/.test(p))
      json = {
        ...item("series", p.split("/").at(-1)),
        plot: "Os portais guardam histórias de coragem e descoberta.",
        genre: "Drama",
        cast: ["Ana Silva"],
        seasons: [
          {
            number: 1,
            name: "Temporada 1",
            episodes: Array.from({ length: 12 }, (_, i) => ({
              id: `e${i}`,
              season: 1,
              number: i + 1,
              title: `O caminho ${i + 1}`,
              thumb: poster,
              durationMin: 2,
              container: "mp4",
            })),
          },
        ],
      };
    else if (/\/movie\/[^/]+$/.test(p))
      json = {
        ...item("movie", p.split("/").at(-1)),
        backdrop: poster,
        plot: "Uma viagem através de um mundo desconhecido.",
        genre: "Aventura",
        durationMin: 2,
        age: "12+",
        cast: ["Ana Silva", "Rui Costa"],
      };
    else if (/^\/api\/iptv\/lists\/[^/]+$/.test(p)) {
      const hidden = member.getState().tv?.[p.split("/").at(-1)]?.hidden || {};
      json = {
        fetchedAt: now,
        sections: Object.fromEntries(
          ["live", "movie", "series"].map((s) => [
            s,
            {
              categories: [
                { ...category, hidden: hidden[s]?.includes("pt") || false },
              ],
              total: 49,
              hiddenCount: hidden[s]?.length || 0,
            },
          ]),
        ),
      };
    }
    return route.fulfill({ json }).catch(() => {});
  });
  return {
    ...member,
    requests,
    starts,
    stops,
    setDelay: (v) => (delay = v),
    holdNextChannelGuide: () => {
      let startedResolve, release;
      const started = new Promise((r) => (startedResolve = r)),
        response = new Promise((r) => (release = r));
      channelGuideGate = { startedResolve, response };
      return { started, release };
    },
    holdNextCategory: () => {
      let startedResolve, release;
      const started = new Promise((r) => (startedResolve = r)),
        response = new Promise((r) => (release = r));
      categoryGate = { startedResolve, response };
      return { started, release };
    },
    setMode: (v) => (mode = v),
    setCompatibilityAvailable: (v) => (compatibilityAvailable = v),
    failNextPlay: () => (failedPlay = true),
    setGuideError: (v) => (guideError = v),
  };
}
export async function settleTV(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime < 5000)
        .map((a) => a.finished.catch(() => {})),
    );
    await Promise.all(
      [...document.images]
        .filter(
          (i) =>
            i.getBoundingClientRect().top < innerHeight &&
            i.getBoundingClientRect().bottom > 0,
        )
        .map((i) => {
          i.loading = "eager";
          return i.decode().catch(() => {});
        }),
    );
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
  });
}
export async function startTVServer(port) {
  const { spawn } = await import("node:child_process");
  const child = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.ts"],
    { env: { ...process.env, WEB_PORT: String(port) }, stdio: "ignore" },
  );
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error("Vite exited");
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw Error("Vite timeout");
}
