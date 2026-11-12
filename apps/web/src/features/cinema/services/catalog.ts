import type { MediaType, Media } from "../models/media";
const base = "https://v3-cinemeta.strem.io";
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    signal: signal ?? AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new Error("O catálogo não respondeu. Tenta novamente.");
  return response.json() as Promise<T>;
}
export async function catalog(
  type: MediaType,
  options: { search?: string; genre?: string; skip?: number } = {},
  signal?: AbortSignal,
) {
  const parts = [
    options.search && `search=${encodeURIComponent(options.search)}`,
    options.genre && `genre=${encodeURIComponent(options.genre)}`,
    options.skip && `skip=${options.skip}`,
  ].filter(Boolean);
  const { metas } = await get<{ metas?: Media[] }>(
    `/catalog/${type}/top${parts.length ? "/" + parts.join("&") : ""}.json`,
    signal,
  );
  return (metas ?? [])
    .filter((item) => item.id && item.name)
    .map((item) => ({ ...item, type }));
}
export async function metadata(
  type: MediaType,
  id: string,
  signal?: AbortSignal,
) {
  if (!/^tt\d+$/.test(id)) throw new Error("Este título não é válido.");
  const { meta } = await get<{ meta?: Media }>(
    `/meta/${type}/${id}.json`,
    signal,
  );
  if (!meta) throw new Error("Não foi possível encontrar este título.");
  // Optional personal TMDB enrichment keeps the key on the API, never in catalogue requests.
  try {
    const response = await fetch(
      `/api/metadata?${new URLSearchParams({ type, id })}`,
      { credentials: "include", signal: signal ?? AbortSignal.timeout(10000) },
    );
    if (response.ok) {
      const extra = await response.json();
      if (extra.meta)
        return {
          ...meta,
          ...Object.fromEntries(
            Object.entries(extra.meta).filter(
              ([, v]) => v !== undefined && v !== null && v !== "",
            ),
          ),
          type,
        } as Media;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  return { ...meta, type };
}
