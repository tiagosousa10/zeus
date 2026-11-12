import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemberState, type MemberState } from "../../lib/session";
import { defaultPrefs, prefsFor } from "../../../../api/src/modules/iptv/prefs";
import {
  createSerialUpdater,
  decodeView,
  encodeView,
  preferenceChanges,
} from "./helpers";
import { tvAPI, tvKeys } from "./data";
import type {
  IPTVList,
  IPTVListUpdate,
  TVListPrefs,
  PlaybackTarget,
  Section,
  TVView,
} from "./types";
function useTVState() {
  const member = useMemberState(),
    client = useQueryClient();
  const latest = useRef(member.state);
  latest.current = member.state;
  const saveRef = useRef(member.save);
  saveRef.current = member.save;
  const writer = useRef(
    createSerialUpdater<MemberState, MemberState<IPTVListUpdate>>(
      () => latest.current,
      async (next) => {
        const result = await saveRef.current({
          ...(next.tv !== latest.current.tv ? { tv: next.tv } : {}),
          ...(next.iptv !== latest.current.iptv ? { iptv: next.iptv } : {}),
        });
        latest.current = result;
        return result;
      },
    ),
  );
  const [chosen, setChosen] = useState(
      () => sessionStorage.getItem("zeus-tv-list") || "",
    ),
    [view, setView] = useState<TVView>(() => decodeView(location.hash)),
    [target, setTarget] = useState<PlaybackTarget | null>(null),
    [modal, setModal] = useState<"search" | "folders" | "lists" | null>(null),
    [error, setError] = useState(""),
    [searchInFolder, setSearchInFolder] = useState(false);
  const lists = member.state.iptv,
    list = lists.find((l) => l.id === chosen) || lists[0],
    listId = list?.id || "";
  const prefs = listId
    ? prefsFor({ tv: member.state.tv }, listId)
    : defaultPrefs();
  const visibility = JSON.stringify([prefs.hidden, prefs.shownAdult]);
  const summaryQuery = useQuery({
    queryKey: tvKeys.summary(
      listId,
      JSON.stringify([
        prefs.hidden,
        prefs.shownAdult,
        prefs.pinned,
        prefs.order,
      ]),
    ),
    queryFn: ({ signal }) => tvAPI.summary(listId, signal),
    enabled: !!listId,
    retry: false,
  });
  function navigate(next: TVView) {
    setView(next);
    setTarget(null);
    history.pushState(null, "", encodeView(next));
  }
  useEffect(() => {
    const listener = () => {
      setTarget(null);
      setView(decodeView(location.hash));
    };
    addEventListener("hashchange", listener);
    addEventListener("popstate", listener);
    return () => {
      removeEventListener("hashchange", listener);
      removeEventListener("popstate", listener);
    };
  }, []);
  useEffect(() => {
    setTarget(null);
    setModal(null);
  }, [listId]);
  useEffect(() => {
    setTarget(null);
  }, [visibility]);
  useEffect(() => {
    const sections = summaryQuery.data?.sections;
    if (sections && !sections[view.section]) {
      const section = (["live", "series", "movie"] as Section[]).find(
        (s) => sections[s],
      );
      if (section) setView({ section });
    }
  }, [summaryQuery.data, view.section]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchInFolder(false);
        setModal((m) => (m === "search" ? null : "search"));
      }
    };
    addEventListener("keydown", handler);
    return () => removeEventListener("keydown", handler);
  }, []);
  async function updatePrefs(fn: (p: TVListPrefs) => TVListPrefs) {
    const id = listId;
    setError("");
    try {
      let changes = { visibility: false, folders: false, favorites: false };
      await writer.current((s) => {
        const before = prefsFor({ tv: s.tv }, id),
          after = fn(before);
        changes = preferenceChanges(before, after);
        return { ...s, tv: { ...s.tv, [id]: after } };
      });
      if (changes.visibility) {
        client.removeQueries({ queryKey: tvKeys.list(id), type: "inactive" });
      } else if (changes.folders || changes.favorites)
        await client.invalidateQueries({
          queryKey: tvKeys.list(id),
          predicate: (q) =>
            changes.folders
              ? q.queryKey[2] === "summary"
              : ["live", "movie", "series"].includes(String(q.queryKey[2])),
        });
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }
  async function saveLists(fn: (lists: IPTVList[]) => IPTVListUpdate[]) {
    const changed: string[] = [];
    await writer.current((s) => {
      const next = fn(s.iptv);
      for (const old of s.iptv) {
        const updated = next.find((l) => l.id === old.id);
        if (!updated || JSON.stringify(old) !== JSON.stringify(updated))
          changed.push(old.id);
      }
      return { ...s, iptv: next };
    });
    for (const id of changed) {
      if (id === listId) setTarget(null);
      await client.cancelQueries({ queryKey: tvKeys.list(id) });
      client.removeQueries({ queryKey: tvKeys.list(id), type: "inactive" });
      await client.resetQueries({ queryKey: tvKeys.list(id), type: "active" });
      if (latest.current.iptv.some((l) => l.id === id)) await tvAPI.refresh(id);
    }
  }
  async function refresh(id = listId) {
    await tvAPI.refresh(id);
    await client.invalidateQueries({ queryKey: tvKeys.list(id) });
  }
  return {
    list,
    listId,
    lists,
    prefs,
    visibility,
    summary: summaryQuery.data,
    summaryQuery,
    view,
    navigate,
    section: view.section,
    categoryId: view.categoryId,
    setSection: (section: Section) => navigate({ section }),
    setCategory: (categoryId?: string) =>
      navigate({ section: view.section, categoryId }),
    setListId: (id: string) => {
      sessionStorage.setItem("zeus-tv-list", id);
      setChosen(id);
      setTarget(null);
      setModal(null);
      setView({ section: "live" });
    },
    target,
    play: (t: PlaybackTarget) => setTarget(t),
    stop: () => setTarget(null),
    openDetail: (section: Section, id: string) =>
      navigate({ section, detailId: id }),
    modal,
    closeModal: () => setModal(null),
    searchInFolder,
    openSearch: (inFolder = false) => {
      setSearchInFolder(inFolder);
      setModal("search");
    },
    openFolders: () => setModal("folders"),
    openLists: () => setModal("lists"),
    updatePrefs,
    saveLists,
    refresh,
    error,
    loading: member.loading,
    stateError: member.error,
  };
}
type TVContextValue = ReturnType<typeof useTVState>;
const Context = createContext<TVContextValue | null>(null);
export function TVProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useTVState()}>{children}</Context.Provider>;
}
export function useTV() {
  const value = useContext(Context);
  if (!value) throw Error("useTV requer TVProvider");
  return value;
}
