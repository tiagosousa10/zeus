import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
  twoFactorVerified: boolean;
}
import type {
  PublicIPTVList,
  IPTVListUpdate,
} from "../../../api/src/modules/member/public-state";
export interface MemberState<List = PublicIPTVList> {
  preferences: Record<string, any>;
  library: any[];
  progress: Record<string, any>;
  iptv: List[];
  addons: any[];
  onboardingDone: boolean;
  [key: string]: any;
}
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
    queryFn: () => api<{ user: Member | null }>("/session"),
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
  const key = ["member-state", user?.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<MemberState>("/state"),
    enabled: !!user?.twoFactorEnabled,
    retry: false,
  });
  const state = { ...empty, ...query.data };
  async function save(patch: Partial<MemberState<IPTVListUpdate>>) {
    const result = await api<MemberState>("/state", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    client.setQueryData(key, result);
    return result;
  }
  return {
    state,
    save,
    loading: !!user?.twoFactorEnabled && query.isPending,
    error: query.error,
  };
}
