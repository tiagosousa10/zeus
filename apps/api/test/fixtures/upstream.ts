import type { safeStream } from "../../src/lib/safe-fetch.js";

// `url` simulates the final URL after redirects; an array body is sent as separate chunks; `open` keeps it streaming until abort.
export type FakeResource = {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array | (string | Uint8Array)[];
  url?: string;
  open?: boolean;
};
export type UpstreamCall = {
  url: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export function fakeUpstream(
  routes: Record<string, FakeResource>,
): typeof safeStream & { calls: UpstreamCall[] } {
  const calls: UpstreamCall[] = [];
  const fn = async (
    input: string,
    options: Parameters<typeof safeStream>[1] = {},
  ) => {
    calls.push({
      url: input,
      headers: options.headers,
      signal: options.signal,
    });
    if (options.signal?.aborted) throw new Error("Pedido cancelado.");
    const route = routes[input];
    if (!route) return new Response(null, { status: 404 });
    const chunks = [route.body ?? ""]
      .flat()
      .map((c) => (typeof c === "string" ? new TextEncoder().encode(c) : c));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        if (!route.open) return controller.close();
        options.signal?.addEventListener(
          "abort",
          () => controller.error(new Error("Pedido cancelado.")),
          { once: true },
        );
      },
    });
    const response = new Response(body, {
      status: route.status ?? 200,
      headers: route.headers,
    });
    Object.defineProperty(response, "url", { value: route.url ?? input });
    return response;
  };
  return Object.assign(fn, { calls });
}
