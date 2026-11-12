import { useCallback, useEffect, useRef, type RefObject } from "react";
import type Hls from "hls.js";

/** Attaches HLS/native media and releases listeners, decoder and source on cleanup. */
export function useCinemaMedia({
  video,
  mediaURL,
  stateLoading,
  preferences,
  setError,
  setWaiting,
}: {
  video: RefObject<HTMLVideoElement | null>;
  mediaURL: string;
  stateLoading: boolean;
  preferences: Record<string, unknown>;
  setError: (message: string) => void;
  setWaiting: (waiting: boolean) => void;
}) {
  const hlsPlayer = useRef<Hls | null>(null);
  const audioPreferences = useRef<string[]>([]);
  audioPreferences.current = Array.isArray(preferences.audioLanguages)
    ? preferences.audioLanguages.map(String)
    : [String(preferences.language || "pt-PT"), "original"];
  const applyAudio = useCallback(() => {
    const hls = hlsPlayer.current;
    if (hls?.audioTracks.length) {
      const index = preferredTrack(
        hls.audioTracks.map((t) => ({
          language: t.lang || "",
          original: t.default,
        })),
        audioPreferences.current,
        hls.audioTrack,
      );
      if (index >= 0 && index !== hls.audioTrack) hls.audioTrack = index;
      return;
    }
    const native = (video.current as NativeAudioVideo | null)?.audioTracks;
    if (!native?.length) return;
    const list = Array.from(native);
    const index = preferredTrack(
      list.map((t) => ({ language: t.language, original: t.kind === "main" })),
      audioPreferences.current,
      list.findIndex((t) => t.enabled),
    );
    if (index >= 0) list.forEach((track, i) => (track.enabled = i === index));
  }, [video]);
  useEffect(() => {
    applyAudio();
  }, [preferences.audioLanguages, preferences.language, applyAudio]);
  useEffect(() => {
    const element = video.current;
    if (!element || !mediaURL || stateLoading) return;
    let hls: Hls | undefined;
    const native = (element as NativeAudioVideo).audioTracks;
    native?.addEventListener("addtrack", applyAudio);
    element.addEventListener("loadedmetadata", applyAudio);
    let cancelled = false;
    async function attach() {
      if (
        /\.m3u8(?:$|\?)/i.test(mediaURL) &&
        !element!.canPlayType("application/vnd.apple.mpegurl")
      ) {
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;
        if (Hls.isSupported()) {
          hls = new Hls();
          hlsPlayer.current = hls;
          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, applyAudio);
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal && !cancelled) {
              setWaiting(false);
              setError(
                "A Fonte HLS deixou de responder ou usa um formato incompatível. Tenta novamente ou escolhe outra Fonte.",
              );
            }
          });
          hls.loadSource(mediaURL);
          hls.attachMedia(element!);
          return;
        }
      }
      element!.src = mediaURL;
      element!.load();
    }
    void attach().catch(() => {
      if (!cancelled)
        setError("Não foi possível carregar o leitor. Tenta novamente.");
    });
    return () => {
      cancelled = true;
      native?.removeEventListener("addtrack", applyAudio);
      element.removeEventListener("loadedmetadata", applyAudio);
      hls?.destroy();
      hlsPlayer.current = null;
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [mediaURL, stateLoading, video, applyAudio, setError, setWaiting]);
}

type NativeAudioTrack = { language: string; kind?: string; enabled: boolean };
type NativeAudioVideo = HTMLVideoElement & {
  audioTracks?: ArrayLike<NativeAudioTrack> & EventTarget;
};
export function preferredTrack(
  tracks: { language: string; original?: boolean }[],
  languages: string[],
  current: number,
) {
  for (const language of languages) {
    if (language === "original") {
      const original = tracks.findIndex((t) => t.original);
      return original >= 0 ? original : current;
    }
    const normalized = language.toLowerCase().replace("_", "-");
    const exact = tracks.findIndex(
      (t) => t.language.toLowerCase().replace("_", "-") === normalized,
    );
    if (exact >= 0) return exact;
    const base = normalized.split("-")[0];
    const match = tracks.findIndex(
      (t) => t.language.toLowerCase().split(/[-_]/)[0] === base,
    );
    if (match >= 0) return match;
  }
  return -1;
}
