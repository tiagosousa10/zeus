import { useEffect, useState, type RefObject } from "react";
import type { PlaybackSession } from "../models/playback-helpers";

type VideoRef = RefObject<HTMLVideoElement | null>;

export function PictureInPictureButton({ video }: { video: VideoRef }) {
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const update = () =>
      setActive(document.pictureInPictureElement === element);
    element.addEventListener("enterpictureinpicture", update);
    element.addEventListener("leavepictureinpicture", update);
    return () => {
      element.removeEventListener("enterpictureinpicture", update);
      element.removeEventListener("leavepictureinpicture", update);
      if (document.pictureInPictureElement === element)
        void document.exitPictureInPicture().catch(() => {});
    };
  }, [video]);
  if (!document.pictureInPictureEnabled) return null;
  return (
    <>
      <button
        aria-label={active ? "Sair da janela flutuante" : "Janela flutuante"}
        aria-pressed={active}
        disabled={pending}
        onClick={async () => {
          const element = video.current;
          if (!element) return;
          setNotice("");
          setPending(true);
          try {
            if (document.pictureInPictureElement === element)
              await document.exitPictureInPicture();
            else {
              await element.requestPictureInPicture();
              if (
                !element.isConnected &&
                document.pictureInPictureElement === element
              )
                await document.exitPictureInPicture();
            }
          } catch {
            setNotice(
              "A janela flutuante não está disponível para este vídeo.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        ▣
      </button>
      {notice && <span role="status">{notice}</span>}
    </>
  );
}

export function PlaybackInfo({
  video,
  session,
  onClose,
}: {
  video: VideoRef;
  session: RefObject<PlaybackSession | null>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const update = () => {
      const element = video.current;
      if (!element) return;
      let buffered = 0;
      for (let i = 0; i < element.buffered.length; i++) {
        if (
          element.buffered.start(i) <= element.currentTime &&
          element.currentTime <= element.buffered.end(i)
        )
          buffered = element.buffered.end(i) - element.currentTime;
      }
      const quality = element.getVideoPlaybackQuality?.();
      setValues({
        Formato: session.current
          ? `${session.current.type.toUpperCase()}${session.current.remux ? " · remux" : ""}`
          : "A aguardar vídeo",
        Resolução:
          element.videoWidth && element.videoHeight
            ? `${element.videoWidth} × ${element.videoHeight}`
            : "Indisponível",
        "Vídeo em buffer": `${buffered.toFixed(1)} s`,
        "Frames perdidos": quality
          ? `${quality.droppedVideoFrames} / ${quality.totalVideoFrames}`
          : "Indisponível",
      });
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [video, session]);
  return (
    <section
      className="tv-playback-info"
      aria-label="Informação técnica do vídeo"
    >
      <button onClick={onClose} aria-label="Fechar informação técnica">
        ×
      </button>
      <h3>Informação técnica</h3>
      <dl>
        {Object.entries(values).map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
