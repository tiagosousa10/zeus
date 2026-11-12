import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";
import http from "node:http";
import https from "node:https";
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
/** Resolve every redirect, reject private networks and pin the checked IP to prevent DNS rebinding. */
export async function safeFetch(
  input: string,
  options: {
    timeout?: number;
    maxBytes?: number;
    headers?: Record<string, string>;
  } = {},
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
            const headers = new Headers();
            for (const k of [
              "content-type",
              "content-range",
              "accept-ranges",
            ]) {
              const v = res.headers[k];
              if (typeof v === "string") headers.set(k, v);
            }
            resolve(
              new Response(
                status === 204 ? null : new Uint8Array(Buffer.concat(chunks)),
                { status, headers },
              ),
            );
          });
        },
      );
      const deadline = setTimeout(
        () => request.destroy(new Error("O fornecedor não respondeu a tempo.")),
        options.timeout || 15000,
      );
      request.on("error", reject);
      request.on("close", () => clearTimeout(deadline));
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
