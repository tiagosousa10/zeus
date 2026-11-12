import { useQuery } from "@tanstack/react-query";
import { motorStatus } from "../services/motor";

/** Share one foreground-only heartbeat across the navigation and Portal. */
export function useMotorStatus() {
  const query = useQuery({
    queryKey: ["motor", "status"],
    queryFn: ({ signal }) => motorStatus(signal),
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  return query.isError ? false : (query.data?.ok ?? null);
}
