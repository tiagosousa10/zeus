import { useEffect, useRef } from "react";
import gsap from "gsap";
import { lightning } from "../../../shared/graphics/fx.js";

// The approved Hermes silhouette uses a luminance key and a teal duotone.
export function TVArt({ guide }: { guide: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bolts = useRef<HTMLCanvasElement>(null);
  const aura = useRef<HTMLDivElement>(null);
  const skyRef = useRef<ReturnType<typeof lightning> | null>(null);
  const inGuide = useRef(guide);
  useEffect(() => {
    skyRef.current?.setAmbient(
      !guide &&
        scrollY < innerHeight * 0.45 &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, [guide]);
  inGuide.current = guide;
  useEffect(() => {
    const el = host.current!,
      hc = canvas.current!,
      ac = aura.current!;
    let cancelled = false,
      frame = 0,
      pointer = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const img = new Image();
    img.src = "/art/img/hermes.webp";
    img
      .decode()
      .then(() => {
        if (cancelled) return;
        const H = 1200,
          W = Math.round((img.naturalWidth * H) / img.naturalHeight);
        const g = hc.getContext("2d", { willReadFrequently: true })!;
        hc.width = W;
        hc.height = H;
        g.drawImage(img, 0, 0, W, H);
        const im = g.getImageData(0, 0, W, H),
          d = im.data,
          E = Math.round(W * 0.05);
        const lum = (i: number) =>
          (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        for (let y = 0; y < H; y++) {
          let bg = 0;
          for (let x = 0; x < E; x++)
            bg += lum((y * W + x) * 4) + lum((y * W + W - 1 - x) * 4);
          bg /= 2 * E;
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4,
              l = lum(i),
              k = clamp((bg - l - 0.06) / 0.14),
              a = k * k * (3 - 2 * k),
              t = clamp(l / 0.42) ** 1.15,
              lo = Math.min(1, t * 1.6),
              hi = Math.max(0, t * 1.6 - 0.6);
            d[i] = 5 + 28 * lo + 200 * hi;
            d[i + 1] = 10 + 96 * lo + 150 * hi;
            d[i + 2] = 12 + 110 * lo + 135 * hi;
            d[i + 3] = 255 * a;
          }
        }
        g.putImageData(im, 0, 0);
        el.classList.add("is-on");
      })
      .catch(() => {
        if (!cancelled) {
          hc.style.background =
            'url("/art/img/hermes.webp") center/contain no-repeat';
          hc.style.filter = "grayscale(1) brightness(.5) contrast(1.6)";
          el.classList.add("is-on");
        }
      });
    const sky = lightning(bolts.current!, {
      palette: "cool",
      ambient: false,
      every: [7000, 14000],
      first: [3500, 6500],
      area: { x: [0.62, 0.96], y: [0.06, 0.32] },
      onFrame: (intensity: number) => {
        hc.style.filter = intensity
          ? `brightness(${1 + intensity * 1.2}) contrast(${1 + intensity * 0.3})`
          : "";
        ac.style.opacity = String(
          (inGuide.current ? 0.25 : 0.55) + intensity * 0.45,
        );
      },
    });
    skyRef.current = sky;
    const draw = () => {
      frame = 0;
      el.style.setProperty("--px", `${pointer * -14}px`);
      el.style.setProperty("--py", `${scrollY * 0.22}px`);
      sky.setAmbient(
        !inGuide.current && scrollY < innerHeight * 0.45 && !reduced,
      );
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pointer = e.clientX / innerWidth - 0.5;
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    if (!reduced) {
      addEventListener("pointermove", move, { passive: true });
      addEventListener("scroll", scroll, { passive: true });
    }
    draw();
    const tween = !reduced
      ? gsap.fromTo(
          el.querySelector(".hermes__rise"),
          { y: 40, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.5, ease: "power3.out" },
        )
      : undefined;
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      sky.destroy();
      skyRef.current = null;
      tween?.kill();
      removeEventListener("pointermove", move);
      removeEventListener("scroll", scroll);
    };
  }, []);
  return (
    <>
      <div className="stage" aria-hidden="true">
        <div className="aura" ref={aura} />
        <div className="hermes" ref={host}>
          <div className="hermes__rise">
            <div className="hermes__float">
              <canvas ref={canvas} />
            </div>
          </div>
        </div>
      </div>
      <canvas className="bolts" ref={bolts} aria-hidden="true" />
    </>
  );
}
