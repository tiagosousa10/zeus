export async function tvFixture(page) {
  await page.route("**/api/iptv/resource?**", (r) => {
    const epg = new URL(r.request().url()).searchParams.has("kind");
    const date = new Date();
    date.setMinutes(0, 0, 0);
    const stamp = (d) =>
      d.toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
    const channels = [
      ["Cinema Mais", "Filmes", "CM"],
      ["Notícias 24", "Notícias", "N24"],
      ["Arena 1", "Desporto", "A1"],
      ["Planeta", "Documentários", "Pl"],
      ["Séries Um", "Séries", "S1"],
    ];
    const body = epg
      ? '<?xml version="1.0"?><tv>' +
        channels
          .map(([name, g, id]) =>
            Array.from(
              { length: 24 },
              (_, i) =>
                `<programme channel="${id}" start="${stamp(new Date(+date + (i - 12) * 3600000))}" stop="${stamp(new Date(+date + (i - 11) * 3600000))}"><title>${g === "Filmes" ? "Heat (1995)" : g === "Notícias" ? "Jornal da Noite" : name + " em directo"}</title><desc>Programação de teste isolada.</desc></programme>`,
            ).join(""),
          )
          .join("") +
        "</tv>"
      : "#EXTM3U\n" +
        channels
          .map(
            ([name, g, id]) =>
              `#EXTINF:-1 tvg-id="${id}" group-title="${g}",${name}\nhttps://media.example.test/${id}.m3u8`,
          )
          .join("\n");
    return r.fulfill({
      contentType: epg ? "application/xml" : "text/plain",
      body,
    });
  });
}
export const tvState = {
  iptv: [
    {
      id: "visual",
      name: "Casa",
      type: "m3u",
      url: "https://media.example.test/list.m3u",
      epgUrl: "https://media.example.test/epg.xml",
    },
  ],
  preferences: { favoriteChannels: ["CM", "N24", "A1", "Pl", "S1"] },
};
