import { DomainError } from "../../lib/domain-error.js";
import { getState, patchState } from "./service.js";
import { db } from "../../db/client.js";
import { addon } from "../../db/schema.js";
import { configFields, validateConfig } from "../addons/config.js";
import { streamEndpoint } from "../addons/stream-service.js";
import { eq } from "drizzle-orm";

import { publicState } from "./models.js";

export const readMemberState = async (memberId: string) =>
  publicState(await getState(memberId));

export const updateMemberState = async (
  memberId: string,
  input: import("./models.js").MemberPatchData,
) => {
  const body = input;

  if (body.addons) {
    const approved = await db
      .select()
      .from(addon)
      .where(eq(addon.status, "approved"));
    for (const entry of body.addons) {
      const a = approved.find((a) => a.id === entry.id);
      if (!a)
        throw new DomainError("invalid", {
          error: "Só podes instalar Add-ons aprovados.",
        });
      if (entry.manifestUrl) {
        const configured = new URL(entry.manifestUrl);
        if (
          configured.protocol !== "https:" ||
          configured.hostname !== new URL(a.manifestUrl).hostname ||
          !configured.pathname.endsWith("/manifest.json")
        )
          throw new DomainError("invalid", {
            error:
              "Cola o URL do manifesto gerado na página de configuração deste Add-on.",
          });
        delete entry.config;
        continue;
      }
      if (entry.enabled === false) continue;
      const fields = configFields(a.configFields);
      if (
        a.configurationRequired &&
        !fields.length &&
        new URL(a.manifestUrl).hostname !== "torrentio.strem.fun"
      )
        throw new DomainError("invalid", {
          error:
            "Este Add-on precisa do URL gerado na sua página de configuração.",
        });
      try {
        if (fields.length)
          entry.config = validateConfig(fields, entry.config || {});
        else
          streamEndpoint(
            a.manifestUrl,
            entry.config || {},
            "movie",
            "tt0000000",
          );
      } catch (e) {
        throw new DomainError("invalid", {
          error: e instanceof Error ? e.message : "Configuração inválida.",
        });
      }
    }
  }
  return publicState(await patchState(memberId, body, true));
};
