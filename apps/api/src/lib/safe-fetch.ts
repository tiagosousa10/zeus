import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";
import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
const denied = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  denied.addSubnet(ip, prefix, "ipv4");
const ipv6Public = new BlockList();
ipv6Public.addSubnet("2000::", 3, "ipv6");
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4
    ? !denied.check(address, "ipv4")
    : family === 6 &&
        ipv6Public.check(address, "ipv6") &&
        !/^200[12]:/i.test(address) &&
        !/^2001:db8:/i.test(address);
}
type Handler = (
  res: IncomingMessage,
  status: number,
  resolve: (r: Response) => void,
  reject: (e: unknown) => void,
  clearDeadline: () => void,
) => void;

/** Resolve every redirect, reject private networks and pin the checked IP to prevent DNS rebinding. */
async function guardedGet(
  input: string,
  options: {
    timeout?: number;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  },
  onResponse: Handler,
): Promise<Response> {
  let url = new URL(input);
  for (let redirects = 0; redirects < 5; redirects++) {
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("URL não permitido.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await lookup(host, { all: true });
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
      throw new Error("Endereço privado ou reservado não permitido.");
    const chosen = addresses[0];
    const response = await new Promise<Response>((resolve, reject) => {
      const { signal } = options;
      if (signal?.aborted) {
        reject(new Error("Pedido cancelado."));
        return;
      }
      let incoming: IncomingMessage | undefined;
      const request = (url.protocol === "https:" ? https : http).request(
        url,
        {
          method: "GET",
          headers: { "accept-encoding": "identity", ...options.headers },
          lookup: ((_host: any, opts: any, cb: any) =>
            opts.all
              ? cb(null, [chosen])
              : cb(null, chosen.address, chosen.family)) as any,
        },
        (res) => {
          incoming = res;
          const status = res.statusCode || 502;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            resolve(
              new Response(null, {
                status,
                headers: { location: res.headers.location },
              }),
            );
            return;
          }
          onResponse(res, status, resolve, reject, () => clearTimeout(deadline));
        },
      );
      const deadline = setTimeout(
        () => request.destroy(new Error("O fornecedor não respondeu a tempo.")),
        options.timeout || 15000,
      );
      const abort = () => {
        const error = new Error("Pedido cancelado.");
        request.destroy(error);
        incoming?.destroy();
        reject(error);
      };
      signal?.addEventListener("abort", abort, { once: true });
      request.on("error", reject);
      request.on("close", () => {
        clearTimeout(deadline);
        signal?.removeEventListener("abort", abort);
      });
      request.end();
    });
    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("location")
    ) {
      url = new URL(response.headers.get("location")!, url);
      continue;
    }
    return response;
  }
  throw new Error("Demasiados redireccionamentos.");
}

function copyHeaders(res: IncomingMessage, names: string[]): Headers {
  const headers = new Headers();
  for (const k of names) {
    const v = res.headers[k];
    if (typeof v === "string") headers.set(k, v);
  }
  return headers;
}

export function safeFetch(
  input: string,
  options: {
    timeout?: number;
    maxBytes?: number;
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  return guardedGet(input, options, (res, status, resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    res.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > (options.maxBytes || 32 * 1024 * 1024)) {
        res.destroy(new Error("Resposta demasiado grande."));
        return;
      }
      chunks.push(chunk);
    });
    res.on("error", reject);
    res.on("end", () => {
      const headers = copyHeaders(res, [
        "content-type",
        "content-range",
        "accept-ranges",
      ]);
      resolve(
        new Response(
          status === 204 ? null : new Uint8Array(Buffer.concat(chunks)),
          { status, headers },
        ),
      );
    });
  });
}

/** Same guards as safeFetch, but the body is streamed unbuffered; the timeout only covers the headers. */
export function safeStream(
  input: string,
  options: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeout?: number;
  } = {},
): Promise<Response> {
  return guardedGet(input, options, (res, status, resolve, _reject, clearDeadline) => {
    clearDeadline();
    const headers = copyHeaders(res, [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
    ]);
    const body = status === 204 ? null : (Readable.toWeb(res) as ReadableStream);
    if (!body) res.resume();
    resolve(new Response(body, { status, headers }));
  });
}
