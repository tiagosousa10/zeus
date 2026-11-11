import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Page } from "../components/Layout";
import { api, ApiError } from "../lib/api";
import { useMemberState } from "../lib/session";
import "./portal.css";
type MotorStatus = {
  ok: boolean;
  active?: boolean;
  numPeers?: number;
  downloadSpeed?: number;
  progress?: number;
};
export default function States() {
  const query = useQuery({
    queryKey: ["motor-status"],
    queryFn: () => api<MotorStatus>("/motor/status"),
    refetchInterval: 5000,
    retry: false,
  });
  const { state, loading } = useMemberState();
  const [network, setNetwork] = useState(navigator.onLine);
  const online = !query.isError && !!query.data?.ok;
  const checking = query.isPending;
  const active = online && query.data?.active;
  const progress = Math.min(1, Math.max(0, query.data?.progress ?? 0));
  const clock = useRef<SVGSVGElement>(null);
  const maskId = `clock-mask-${useId().replace(/:/g, "")}`;
  const gradientId = `${maskId}-gradient`,
    blurId = `${maskId}-blur`;
  const watching = Object.values(state.progress).filter(
    (entry: any) =>
      entry?.position > 0 &&
      !entry.completed &&
      (!entry.duration || entry.position / entry.duration < 0.95),
  );
  useEffect(() => {
    const connected = () => setNetwork(navigator.onLine);
    addEventListener("online", connected);
    addEventListener("offline", connected);
    return () => {
      removeEventListener("online", connected);
      removeEventListener("offline", connected);
    };
  }, []);
  useEffect(() => {
    const host = clock.current;
    if (!host) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const draw = () => {
      const date = new Date(),
        second = date.getSeconds(),
        minute = date.getMinutes() + second / 60,
        hour = (date.getHours() % 12) + minute / 60;
      host
        .querySelector("[data-hand=hour]")
        ?.setAttribute("transform", `rotate(${hour * 30} 505 375)`);
      host
        .querySelector("[data-hand=minute]")
        ?.setAttribute("transform", `rotate(${minute * 6} 505 375)`);
      host
        .querySelector("[data-hand=second]")
        ?.setAttribute("transform", `rotate(${second * 6} 505 375)`);
    };
    draw();
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      if (online && !document.hidden && !reduced.matches) {
        draw();
        timer = setInterval(draw, 1000);
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, [online]);
  const apiResponded =
    (!!query.data && !query.error) || query.error instanceof ApiError;
  const title = checking
    ? "Cada instante conta."
    : online
      ? "O tempo é teu."
      : !network
        ? "A ligação fez uma pausa."
        : "O mundo pode esperar.";
  return (
    <Page>
      <section className="state-stage">
        <div className="state-copy">
          <p className="eyebrow">ZEUS · ESTADO DO MOTOR</p>
          <h1>{title}</h1>
          <p>
            {checking
              ? "A verificar a ligação ao Motor do teu Mac."
              : online
                ? active
                  ? "O Motor está a obter a tua história. O tempo e os dados que vês aqui são reais."
                  : "O Motor está disponível no teu Mac. Escolhe uma história para começar."
                : !network
                  ? "O browser está sem ligação à rede. Verifica a ligação e tenta novamente."
                  : "O Motor local não está disponível. Abre o Zeus no Mac ou inicia o serviço local para reproduzir torrents."}
          </p>
          {active && (
            <div className="state-reading">
              <strong>{Math.round(progress * 100)}%</strong>
              <span>da transferência actual</span>
            </div>
          )}
          <div className="button-row">
            <button
              className="z-btn z-btn--primary"
              disabled={query.isFetching}
              aria-busy={query.isFetching}
              onClick={() => {
                void query.refetch();
              }}
            >
              {query.isFetching ? "A verificar…" : "Verificar novamente"}
            </button>
            <a href="/portal" className="z-btn z-btn--secondary">
              Voltar ao Portal
            </a>
          </div>
          <section className="state-health" aria-label="Estado da ligação">
            <p
              className={`state-signal ${online ? "is-online" : ""}`}
              role="status"
            >
              {checking
                ? "A verificar a API e o Motor…"
                : `API: ${apiResponded ? "respondeu" : "sem resposta"} · Motor: ${online ? "ligado" : "indisponível"}`}
            </p>
            {active && (
              <>
                <p>
                  {query.data?.numPeers ?? 0} peers ·{" "}
                  {Math.round((query.data?.downloadSpeed ?? 0) / 1024)} KB/s
                </p>
                <progress
                  className="state-progress"
                  value={progress}
                  max="1"
                  aria-label="Transferência actual"
                />
              </>
            )}
            <p>
              Os links directos podem ser reproduzidos sem o Motor, se o
              fornecedor permitir o acesso pelo browser.
            </p>
            {query.dataUpdatedAt > 0 && (
              <time dateTime={new Date(query.dataUpdatedAt).toISOString()}>
                Última resposta do Motor às{" "}
                {new Date(query.dataUpdatedAt).toLocaleTimeString("pt-PT")}
              </time>
            )}
          </section>
        </div>
        <div
          className={`state-clock ${!online && !checking ? "is-offline" : ""}`}
          aria-hidden="true"
        >
          <img src="/art/img/zeus-4.webp" alt="" />
          <svg viewBox="0 0 1024 1024" ref={clock}>
            <defs>
              <radialGradient id={gradientId}>
                <stop offset="0" stopColor="#000" />
                <stop offset=".84" stopColor="#000" />
                <stop offset="1" stopColor="#000" stopOpacity="0" />
              </radialGradient>
              <filter id={blurId}>
                <feGaussianBlur stdDeviation="10" />
              </filter>
              <mask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width="1024"
                height="1024"
              >
                <rect width="1024" height="1024" fill="#fff" />
                <ellipse
                  cx="458"
                  cy="318"
                  rx="228"
                  ry="300"
                  fill={`url(#${gradientId})`}
                />
                <path
                  filter={`url(#${blurId})`}
                  fill="#000"
                  d="M0 640 L170 580 L300 572 L420 640 L560 610 L620 470 L760 450 L1024 560 L1024 1024 L0 1024Z"
                />
              </mask>
            </defs>
            <g mask={`url(#${maskId})`}>
              {active && (
                <circle
                  className="state-clock__ring"
                  cx="505"
                  cy="375"
                  r="366"
                  pathLength="100"
                  strokeDasharray={`${progress * 100} 100`}
                  transform="rotate(-90 505 375)"
                />
              )}
              {checking && (
                <circle
                  className="state-clock__ring state-clock__checking"
                  cx="505"
                  cy="375"
                  r="366"
                  pathLength="100"
                  strokeDasharray="15 85"
                />
              )}
              <g className="state-clock__hands">
                <path
                  data-hand="hour"
                  d="M496 395 L499 150 L505 124 L511 150 L514 395Z"
                />
                <path
                  data-hand="minute"
                  d="M499 405 L501 70 L505 44 L509 70 L511 405Z"
                />
                <line data-hand="second" x1="505" y1="430" x2="505" y2="30" />
              </g>
            </g>
          </svg>
        </div>
      </section>
      {!loading && (
        <section className="state-continue">
          <div className="state-continue__medal" aria-hidden="true" />
          <div>
            <h2>
              {watching.length
                ? "A tua história continua."
                : "O tempo é teu. Começa algo para ver."}
            </h2>
            <p>
              {watching.length
                ? `${watching.length} ${watching.length === 1 ? "título à tua espera" : "títulos à tua espera"}. O teu progresso ficou guardado.`
                : "Quando começares um filme ou episódio, o teu progresso fica na conta."}
            </p>
            <a className="z-btn z-btn--secondary" href="/cinema">
              {watching.length ? "Continuar no Cinema" : "Explorar o Cinema"}
            </a>
          </div>
        </section>
      )}
    </Page>
  );
}
