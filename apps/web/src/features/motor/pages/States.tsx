import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { motorStatus } from "../services/motor";
import { useMemberState } from "../../../shared/hooks/session";
import "../styles/states.css";
export default function States() {
  const query = useQuery({
    queryKey: ["motor-status"],
    queryFn: () => motorStatus(),
    refetchInterval: 5000,
    retry: false,
  });
  const { state, loading } = useMemberState();
  const fromHash = () =>
    ["motor", "sessao", "vazio", "offline"].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : "motor";
  const [tab, changeTab] = useState(fromHash);
  function setTab(value: string) {
    changeTab(value);
    history.replaceState(null, "", `#${value}`);
  }
  useEffect(() => {
    const sync = () => changeTab(fromHash());
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, []);
  const noise = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (tab !== "offline" || !noise.current) return;
    const canvas = noise.current,
      ctx = canvas.getContext("2d")!;
    const draw = () => {
      if (document.hidden) return;
      const image = ctx.createImageData(180, 180);
      for (let i = 0; i < image.data.length; i += 4) {
        const n = Math.random() * 255;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = n;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    };
    draw();
    const timer = !matchMedia("(prefers-reduced-motion: reduce)").matches
      ? setInterval(draw, 140)
      : undefined;
    return () => clearInterval(timer);
  }, [tab]);
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
  const tabs = [
    ["motor", "Motor"],
    ["sessao", "Sessão"],
    ["vazio", "Continuar a ver"],
    ["offline", "Ligação"],
  ];
  return (
    <div className="states-page">
      <header className="top">
        <a className="mark" href="/portal" aria-label="Zeus, voltar ao Portal">
          ZEUS
        </a>
        <div
          className="tabs"
          role="tablist"
          aria-label="Estados do sistema"
          onKeyDown={(e) => {
            const i = tabs.findIndex(([id]) => id === tab),
              n = (
                {
                  ArrowRight: i + 1,
                  ArrowLeft: i - 1,
                  Home: 0,
                  End: 3,
                } as Record<string, number>
              )[e.key];
            if (n !== undefined) {
              e.preventDefault();
              const id = tabs[(n + 4) % 4][0];
              setTab(id);
              document.getElementById(`t-${id}`)?.focus();
            }
          }}
        >
          {tabs.map(([id, label]) => (
            <button
              className="tab"
              role="tab"
              key={id}
              id={`t-${id}`}
              aria-controls={`p-${id}`}
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <main className="stage" data-state={tab}>
        <div className="visual" aria-hidden="true">
          <div className="clock">
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
                <circle
                  className="ticks"
                  cx="505"
                  cy="375"
                  r="425"
                  pathLength="240"
                  strokeDasharray="0.6 3.4"
                />
                {(active || online) && (
                  <circle
                    className="ring"
                    cx="505"
                    cy="375"
                    r="366"
                    pathLength="100"
                    strokeDasharray={`${active ? progress * 100 : 100} 100`}
                    transform="rotate(-90 505 375)"
                  />
                )}
                {checking && (
                  <circle
                    className="ring"
                    cx="505"
                    cy="375"
                    r="366"
                    pathLength="100"
                    strokeDasharray="15 85"
                  />
                )}
                <g className="hands">
                  <path
                    className="h"
                    data-hand="hour"
                    d="M496 395 L499 150 L505 124 L511 150 L514 395Z"
                  />
                  <path
                    className="h"
                    data-hand="minute"
                    d="M499 405 L501 70 L505 44 L509 70 L511 405Z"
                  />
                  <line
                    className="s"
                    data-hand="second"
                    x1="505"
                    y1="430"
                    x2="505"
                    y2="30"
                  />
                </g>
              </g>
            </svg>
            <canvas className="grain" ref={noise} width="180" height="180" />
            <div className="band" />
          </div>
        </div>
        <div className="panels">
          <section
            role="tabpanel"
            id="p-motor"
            aria-labelledby="t-motor"
            hidden={tab !== "motor"}
            tabIndex={0}
          >
            <h1>
              {checking
                ? "O Motor está a arrancar"
                : online
                  ? "O Motor está pronto"
                  : "O Motor está desligado"}
            </h1>
            <p>
              {checking
                ? "Na primeira vez demora uns segundos. Estamos a verificar a ligação ao Motor."
                : online
                  ? "A ligação está pronta. Podes continuar no Cinema e escolher o que queres ver."
                  : "Abre o Zeus no teu Mac para ligar o Motor. Depois, tenta novamente."}
            </p>
            <div className="status" aria-live="polite">
              <b>
                {active
                  ? `${Math.round(progress * 100)}%`
                  : online
                    ? "Ligado"
                    : checking
                      ? "…"
                      : "Desligado"}
              </b>
              <span>
                {active
                  ? "a transferir"
                  : checking
                    ? "a preparar"
                    : online
                      ? "pronto para reproduzir"
                      : "sem resposta"}
              </span>
            </div>
            <ol className="log" aria-label="Registo do Motor">
              <li className={checking ? "cur" : ""}>
                A verificar a ligação ao Motor
              </li>
              {!checking && (
                <li className={online ? "ok" : ""}>
                  {online
                    ? "Ligação estabelecida"
                    : query.error?.message || "O Motor não respondeu"}
                </li>
              )}
              {active && (
                <>
                  <li>{query.data?.numPeers ?? 0} peers ligados</li>
                  <li>
                    {Math.round((query.data?.downloadSpeed ?? 0) / 1024)} KB/s
                  </li>
                </>
              )}
              {query.dataUpdatedAt > 0 && (
                <li>
                  <time>
                    {new Date(query.dataUpdatedAt).toLocaleTimeString("pt-PT")}
                  </time>
                  Última resposta
                </li>
              )}
            </ol>
            <button
              className="btn ghost"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Verificar outra vez
            </button>
          </section>
          <section
            role="tabpanel"
            id="p-sessao"
            aria-labelledby="t-sessao"
            hidden={tab !== "sessao"}
            tabIndex={0}
          >
            <h1>A sessão está activa</h1>
            <p>
              A tua conta está ligada. Podes gerir os teus dados e a
              autenticação na Conta.
            </p>
            <a className="btn primary" href="/conta">
              Abrir a Conta
            </a>
            <p className="small">
              As tuas listas, add-ons e progresso continuam guardados.
            </p>
          </section>
          <section
            role="tabpanel"
            id="p-vazio"
            aria-labelledby="t-vazio"
            hidden={tab !== "vazio"}
            tabIndex={0}
          >
            <div className="home">
              <h2>Continuar a ver</h2>
              <div className="row">
                <div className="empty">
                  <div className="medal" aria-hidden="true">
                    <svg viewBox="0 0 128 128">
                      <circle
                        cx="64"
                        cy="64"
                        r="61"
                        pathLength="100"
                        strokeDasharray="72 100"
                        transform="rotate(-90 64 64)"
                      />
                    </svg>
                  </div>
                  <div>
                    <p>
                      {loading
                        ? "A carregar o teu progresso…"
                        : watching.length
                          ? `${watching.length} títulos à tua espera.`
                          : "O tempo é teu. Começa algo para ver."}
                    </p>
                    <a className="btn primary" href="/cinema">
                      {watching.length
                        ? "Continuar no Cinema"
                        : "Explorar o Cinema"}
                    </a>
                  </div>
                </div>
                {[1, 2, 3].map((n) => (
                  <div key={n} className="ghostcard" aria-hidden="true" />
                ))}
              </div>
              <div className="rest" aria-hidden="true">
                <h2>Em destaque no Cinema</h2>
                <div className="row">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div className="ghostcard" key={n} />
                  ))}
                </div>
              </div>
            </div>
          </section>
          <section
            role="tabpanel"
            id="p-offline"
            aria-labelledby="t-offline"
            hidden={tab !== "offline"}
            tabIndex={0}
          >
            <h1>
              {network ? "A ligação está disponível" : "Sem ligação à internet"}
            </h1>
            <p>
              {network
                ? "O dispositivo está ligado à rede. Se uma emissão não responder, verifica o fornecedor ou tenta outro canal."
                : "Verifica o Wi-Fi ou o cabo de rede. O teu progresso continua guardado na conta."}
            </p>
            <button
              className="btn primary"
              aria-busy={query.isFetching}
              onClick={() => {
                setNetwork(navigator.onLine);
                void query.refetch();
              }}
            >
              <span className="spin" />
              Tentar outra vez
            </button>
            <p className="small" aria-live="polite">
              {query.isFetching
                ? "A verificar…"
                : online
                  ? "Ligação ao Motor confirmada."
                  : "Não foi possível contactar o Motor."}
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
