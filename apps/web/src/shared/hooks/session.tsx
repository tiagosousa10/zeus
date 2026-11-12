import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  loadSession,
  loadMemberState,
  saveMemberState,
} from "../services/member";
import type { MemberState } from "../models/member";
import type { IPTVListUpdate } from "../../../../../packages/contracts/member";
const empty: MemberState = {
  preferences: {},
  library: [],
  progress: {},
  iptv: [],
  addons: [],
  onboardingDone: false,
};
export function useSession() {
  const query = useQuery({
    queryKey: ["session"],
    queryFn: () => loadSession(),
    retry: false,
    staleTime: 30000,
  });
  return {
    user: query.data?.user ?? null,
    loading: query.isPending,
    error: query.error,
    refresh: async () => {
      await query.refetch();
    },
  };
}
export function useMemberState() {
  const client = useQueryClient();
  const { user } = useSession();
  const key = useMemo(() => ["member-state", user?.id], [user?.id]);
  const query = useQuery({
    queryKey: key,
    queryFn: () => loadMemberState(),
    enabled: !!user?.twoFactorEnabled,
    retry: false,
  });
  const state = { ...empty, ...query.data };
  const save = useCallback(
    async (patch: Partial<MemberState<IPTVListUpdate>>) => {
      const result = await saveMemberState(patch);
      client.setQueryData(key, result);
      return result;
    },
    [client, key],
  );
  return {
    state,
    save,
    loading: !!user?.twoFactorEnabled && query.isPending,
    error: query.error,
  };
}
