import { useState } from "react";
import { isLiveLayout, type LiveLayout } from "../models/live-layout";
const storageKey = "zeus-tv-live-layout";
export function useLiveLayout() {
  const [layout, setLayout] = useState<LiveLayout>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return isLiveLayout(saved) ? saved : "cards";
    } catch {
      return "cards";
    }
  });
  function selectLayout(next: LiveLayout) {
    setLayout(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // The view remains usable when browser storage is unavailable.
    }
  }
  return [layout, selectLayout] as const;
}
