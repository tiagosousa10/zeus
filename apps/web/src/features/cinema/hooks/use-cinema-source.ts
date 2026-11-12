import { useEffect, useRef, useState } from "react";
import { loadSources } from "../services/title";
import { startMotor, stopMotor } from "../../motor/services/motor";
import { safeMediaURL, type Stream, type MediaType } from "../models/media";

/** Owns source requests and the lifetime of the member's torrent lease. */
export function useCinemaSource({
  id,
  type,
  videoId,
  selection,
  sourceIndex,
  onReset,
}: {
  id: string;
  type: MediaType;
  videoId: string;
  selection: string | null;
  sourceIndex: string | null;
  onReset: () => void;
}) {
  const [source, setSource] = useState<Stream>();
  const [mediaURL, setMediaURL] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("A preparar a tua Fonte…");
  const [retry, setRetry] = useState(0);
  const reset = useRef(onReset);
  reset.current = onReset;
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setError("");
    setStatus("A obter a Fonte escolhida…");
    setMediaURL("");
    reset.current();
    async function resolveSource() {
      let selected: Stream | undefined;
      const key = selection;
      if (key) {
        try {
          const value = JSON.parse(
            sessionStorage.getItem(`zeus:play:${key}`) ?? "null",
          );
          if (
            value?.id === id &&
            value?.type === type &&
            value?.videoId === videoId &&
            Date.now() - value.createdAt < 1800000
          )
            selected = value.stream;
          sessionStorage.removeItem(`zeus:play:${key}`);
        } catch {
          /* Request approved sources again. */
        }
      }
      if (!selected) {
        const response = await loadSources(type, videoId, controller.signal);
        const index = sourceIndex;
        selected =
          index === null
            ? response.streams.find((s) => !s.externalUrl)
            : response.streams[Number(index)];
      }
      if (selected?.externalUrl)
        throw new Error(
          "Esta Fonte abre fora do Zeus. Volta ao título e escolhe-a lá.",
        );
      if (!selected)
        throw new Error(
          "Não há nenhuma Fonte disponível. Volta ao título para escolher outra.",
        );
      if (cancelled) return;
      setSource(selected);
      const direct = safeMediaURL(selected.url);
      if (direct) {
        setMediaURL(direct);
        setStatus("");
        return;
      }
      if (!selected.infoHash || !/^[a-f0-9]{40}$/i.test(selected.infoHash))
        throw new Error(
          "Esta Fonte não tem um endereço de vídeo compatível. Escolhe outra Fonte.",
        );
      setStatus(
        "O Motor está a procurar os metadados e os primeiros blocos. Pode demorar até 90 segundos.",
      );
      const result = await startMotor(selected.infoHash, selected.fileIdx, {
        signal: controller.signal,
      });
      if (cancelled) return;
      setMediaURL(result.url);
      setStatus("");
    }
    void resolveSource().catch((reason) => {
      if (!cancelled) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível abrir a Fonte.",
        );
        setStatus("");
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, type, videoId, selection, sourceIndex, retry]);
  useEffect(() => {
    if (!source?.infoHash) return;
    const infoHash = source.infoHash;
    const stop = () => {
      void stopMotor(infoHash, { keepalive: true }).catch(() => {});
    };
    addEventListener("pagehide", stop);
    return () => {
      removeEventListener("pagehide", stop);
      stop();
    };
  }, [source?.infoHash]);
  return {
    source,
    mediaURL,
    error,
    setError,
    status,
    retrySource: () => {
      setSource(undefined);
      setRetry((value) => value + 1);
    },
  };
}
