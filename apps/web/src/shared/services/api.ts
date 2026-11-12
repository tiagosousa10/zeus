export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const foreground =
    !init.keepalive &&
    /^(POST|PATCH|PUT|DELETE)$/i.test(init.method || "") &&
    !path.endsWith("/stop") &&
    !path.endsWith("/play") &&
    !(path === "/state" && document.querySelector("video"));
  if (foreground)
    window.dispatchEvent(new CustomEvent("zeus:request", { detail: 1 }));
  try {
    const response = await fetch(`/api${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        body?.message || body?.error || "Não foi possível concluir o pedido.",
        response.status,
        body?.code,
      );
    return body as T;
  } finally {
    if (foreground)
      window.dispatchEvent(new CustomEvent("zeus:request", { detail: -1 }));
  }
}
