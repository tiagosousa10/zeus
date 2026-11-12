import { DomainError } from "../../lib/domain-error.js";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { addon } from "../../db/schema.js";
import { configFields } from "./config.js";
import { safeFetch } from "../../lib/safe-fetch.js";

export const listApprovedAddons = async () => ({
  addons: await db.select().from(addon).where(eq(addon.status, "approved")),
});

export const listAllAddons = async () => ({
  addons: await db.select().from(addon),
});

export const updateAddon = async (
  id: string,
  input: import("./models.js").UpdateAddonInputData,
) => {
  const b = input;

  const [current] = await db.select().from(addon).where(eq(addon.id, id));
  if (!current)
    throw new DomainError("not_found", { error: "Add-on não encontrado." });
  let fields = current.configFields,
    required = current.configurationRequired;
  if (b.status === "approved") {
    try {
      const response = await safeFetch(current.manifestUrl, {
        timeout: 10000,
        maxBytes: 512 * 1024,
      });
      if (!response.ok) throw new Error();
      const manifest = (await response.json()) as any;
      if (
        typeof manifest.id !== "string" ||
        typeof manifest.name !== "string" ||
        !Array.isArray(manifest.resources)
      )
        throw new Error();
      fields = configFields(manifest.config);
      required = manifest.behaviorHints?.configurationRequired === true;
    } catch {
      throw new DomainError("upstream", {
        error:
          "Não foi possível validar o manifesto atual deste Add-on. Tenta novamente antes de aprovar.",
      });
    }
  }
  const [a] = await db
    .update(addon)
    .set({ ...b, configFields: fields, configurationRequired: required })
    .where(eq(addon.id, current.id))
    .returning();
  return { addon: a };
};

export const syncAddons = async () => {
  const response = await fetch(
    "https://stremio-community.github.io/stremio-addons-list/catalog.json",
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok)
    throw new DomainError("upstream", {
      error: "O registo público não está disponível.",
    });
  const payload = await response.json();
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.addons)
      ? payload.addons
      : null;
  if (!items)
    throw new DomainError("upstream", {
      error: "Formato do registo público não suportado.",
    });
  let count = 0;
  for (const value of items.slice(0, 2000)) {
    const url =
      value.manifestUrl ||
      value.manifest_url ||
      value.url ||
      value.transportUrl;
    if (typeof url !== "string" || !url.startsWith("https://")) continue;
    const name = value.name || value.manifest?.name;
    if (typeof name !== "string") continue;
    await db
      .insert(addon)
      .values({
        id:
          typeof value.manifest?.id === "string"
            ? value.manifest.id
            : typeof value.id === "string"
              ? value.id
              : url,
        name: name.slice(0, 200),
        description: String(
          value.description || value.manifest?.description || "",
        ).slice(0, 2000),
        manifestUrl: url,
        status: "pending",
        configFields: configFields(value.manifest?.config),
        configurationRequired:
          value.manifest?.behaviorHints?.configurationRequired === true,
        configurable:
          value.manifest?.behaviorHints?.configurable === true ||
          value.manifest?.behaviorHints?.configurationRequired === true,
        resources: (Array.isArray(value.manifest?.resources)
          ? value.manifest.resources
          : []
        )
          .map((r: any) => (typeof r === "string" ? r : r?.name))
          .filter((r: any) => r === "stream" || r === "subtitles"),
      })
      .onConflictDoNothing();
    count++;
  }
  return { imported: count };
};
