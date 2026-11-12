import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

/** Share one foreground-only heartbeat across the navigation and Portal. */
export function useMotorStatus() {
  const query = useQuery({
    queryKey: ["motor", "status"],
    queryFn: ({ signal }) => api<{ ok: boolean }>("/motor/status", { signal }),
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  return query.isError ? false : (query.data?.ok ?? null);
}
