import { saveMemberState } from "../../../shared/services/member";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Media, MediaType, ProgressEntry } from "../models/media";
import type { useMemberState } from "../../../shared/hooks/session";

/** Persists media progress and keeps a final snapshot even after React clears the ref. */
export function useCinemaProgress({
  video,
  id,
  type,
  videoId,
  season,
  episode,
  progress,
  save,
  meta,
  onError,
}: {
  video: RefObject<HTMLVideoElement | null>;
  id: string;
  type: MediaType;
  videoId: string;
  season?: number;
  episode?: number;
  progress: Record<string, ProgressEntry>;
  save: ReturnType<typeof useMemberState>["save"];
  meta?: Media;
  onError: (message: string) => void;
}) {
  const stateRef = useRef({ progress, save, meta });
  stateRef.current = { progress, save, meta };
  const lastSave = useRef(0);
  const resumeDone = useRef(false);
  const persist = useCallback(
    (keepalive = false, element = video.current) => {
      const latest = stateRef.current;
      if (
        !element ||
        !latest.meta ||
        !Number.isFinite(element.duration) ||
        element.duration <= 0 ||
        element.currentTime < 1
      )
        return;
      const entry: ProgressEntry = {
        id,
        type,
        name: latest.meta.name,
        poster: latest.meta.poster,
        position: element.currentTime,
        duration: element.duration,
        updatedAt: new Date().toISOString(),
        season,
        episode,
        completed:
          element.ended || element.currentTime / element.duration >= 0.95,
      };
      const patch = { progress: { ...latest.progress, [videoId]: entry } };
      if (keepalive) {
        void saveMemberState(patch, { keepalive: true }).catch(() => {});
      } else
        void latest
          .save(patch)
          .catch(() =>
            onError(
              "Não foi possível guardar o progresso. A reprodução continua.",
            ),
          );
      lastSave.current = Date.now();
    },
    [id, type, season, episode, videoId, video, onError],
  );
  useEffect(() => {
    const element = video.current;
    const flush = () => persist(true, element);
    const onHide = () => {
      if (document.hidden) flush();
    };
    addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      persist(true, element);
    };
  }, [persist, video]);
  return {
    persist,
    persistIfDue: () => {
      if (Date.now() - lastSave.current > 10000) persist();
    },
    resetResume: () => {
      resumeDone.current = false;
    },
    restorePosition: () => {
      const element = video.current;
      if (!element || resumeDone.current) return;
      const saved = stateRef.current.progress[videoId];
      if (
        saved &&
        !saved.completed &&
        saved.position > 0 &&
        saved.position < element.duration - 10
      )
        element.currentTime = saved.position;
      resumeDone.current = true;
    },
  };
}
