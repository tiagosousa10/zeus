import gsap from "gsap";
import {
  lightning,
  livingPainting,
  cursorLight,
  tilt,
  clouds,
  grain,
  reveal,
  rows,
  toast,
  prefersReducedMotion,
  PALETTES,
} from "../lib/fx.js";
import { catalog, poster, backdrop, titleHref } from "../lib/catalog";
export function mountGuide(root) {
  const $ = (s, r = root) => r.querySelector(s),
    $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const RM = prefersReducedMotion();
  let timeline, entrance;
  const lifecycle = new AbortController();
  const timers = new Set();
  const listen = (element, type, listener) =>
    element.addEventListener(type, listener, { signal: lifecycle.signal });
  const later = (callback, delay) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
    return timer;
  };
  const resources = [];
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  /* Herói: pintura viva + raios + cartões tvOS que mudam o tom */
  const painting = livingPainting($("#painting"), "/art/img/zeus-5.webp");
  const wm = $("#wm"),
    wmGlow = $(".z-wordmark__glow", wm);
  const sky = lightning($("#bolts"), {
    onStrike: (p) => {
      painting.flash(p, p.color, p.pulses);
      wmGlow.style.setProperty("--gc", PALETTES[p.palette].gc);
    },
    onFrame: (I) => {
      wmGlow.style.opacity = (I * 0.9).toFixed(3);
    },
  });
  let hovering = 0;
  $$(".g-module").forEach((card) => {
    resources.push(tilt(card));
    const mood = +card.dataset.mood,
      key = mood > 0 ? "warm" : "cool";
    const on = () => {
      hovering++;
      painting.setMood(mood);
      sky.setPalette(key);
      sky.setAmbient(true);
    };
    const off = () => {
      hovering = Math.max(0, hovering - 1);
      later(() => {
        if (!hovering) {
          painting.setMood(0);
          sky.setPalette("neutral");
        }
      }, 60);
    };
    listen(card, "pointerenter", on);
    listen(card, "focus", on);
    listen(card, "pointerleave", off);
    listen(card, "blur", off);
  });
  if (!RM && window.gsap) {
    painting.state.exposure = 0;
    painting.state.zoom = 1.14;
    gsap.set(wm, { opacity: 0, "--ls": "1.3em", filter: "blur(10px)" });
    timeline = gsap
      .timeline()
      .to(
        painting.state,
        { exposure: 1, duration: 2.6, ease: "power2.out" },
        0.1,
      )
      .to(painting.state, { zoom: 1, duration: 3.4, ease: "power3.out" }, 0.1)
      .to(
        wm,
        {
          opacity: 1,
          "--ls": "0.64em",
          filter: "blur(0px)",
          duration: 1.8,
          ease: "expo.out",
        },
        0.7,
      )
      .call(
        () => {
          sky.strike({ x: innerWidth * 0.2, y: innerHeight * 0.28 });
          wm.classList.add("is-lit");
        },
        null,
        1.15,
      );
    entrance = reveal($$(".g-hero__copy, .g-module"), { delay: 1.5 });
  }

  /* Controlos */
  listen(root, "click", (e) => {
    const t = e.target.closest("[data-toast]");
    if (t) toast(t.dataset.toast);
    const s = e.target.closest("[data-switch]");
    if (s)
      s.setAttribute("aria-checked", s.getAttribute("aria-checked") !== "true");
    const r = e.target.closest("[data-reveal]");
    if (r) {
      const f = root.querySelector("#" + r.dataset.reveal),
        show = f.type === "password";
      f.type = show ? "text" : "password";
      r.textContent = show ? "Ocultar" : "Mostrar";
      r.setAttribute("aria-pressed", show);
    }
  });
  listen($("#busy"), "click", (e) => {
    const b = e.currentTarget;
    b.setAttribute("aria-busy", "true");
    b.textContent = "A entrar…";
    later(() => {
      b.removeAttribute("aria-busy");
      b.textContent = "Entrar";
    }, 1600);
  });
  listen($("#g-langs"), "click", (e) => {
    const b = e.target.closest(".z-chip");
    if (!b) return;
    const on = b.getAttribute("aria-pressed") !== "true";
    if (!on && $$('[aria-pressed="true"]', b.parentElement).length === 1)
      return;
    b.setAttribute("aria-pressed", on);
    $(".z-chip__n", b)?.remove();
    $$('[aria-pressed="true"]', b.parentElement).forEach((c, i) => {
      (
        $(".z-chip__n", c) ||
        c.insertAdjacentElement(
          "afterbegin",
          Object.assign(document.createElement("span"), {
            className: "z-chip__n",
          }),
        )
      ).textContent = i + 1;
    });
  });
  $$('.z-tabs[role="tablist"] [role="tab"]').forEach((t) =>
    listen(t, "click", () =>
      $$('[role="tab"]', t.parentElement).forEach((x) =>
        x.setAttribute("aria-selected", x === t),
      ),
    ),
  );

  /* Arte */
  const art = $("#g-art");
  $$("#g-scrim input").forEach((r) =>
    listen(r, "change", () => {
      art.classList.remove("z-art--left", "z-art--right", "z-art--center");
      if (r.value) art.classList.add(r.value);
    }),
  );
  let film = null;
  listen($("#g-mute"), "click", (e) => {
    const on = e.currentTarget.getAttribute("aria-checked") !== "true";
    e.currentTarget.setAttribute("aria-checked", on);
    art.classList.toggle("is-muted", on);
  });
  listen($("#g-grain"), "click", (e) => {
    const on = e.currentTarget.getAttribute("aria-checked") !== "true";
    e.currentTarget.setAttribute("aria-checked", on);
    if (on) film = grain(art.parentElement, { opacity: 0.16 });
    else {
      film?.destroy();
      film = null;
    }
  });

  /* Luz */
  const bust = cursorLight($("#g-bust"));

  /* Nuvens */
  const cl = clouds($("#g-clouds")),
    oly = $("#g-olympus");
  const alt = (p) => {
    cl.set(p);
    oly.style.transform = `translate3d(0,${(-38 + 36 * p).toFixed(1)}%,0)`;
    $("#g-alt-v").textContent =
      Math.round(p * 2918).toLocaleString("pt-PT") + " m";
  };
  listen($("#g-alt"), "input", (e) => alt(e.target.value / 100));
  alt(0);

  /* Raios manuais */
  const storm = lightning($("#g-bolts"), { ambient: false });
  $$("[data-strike]").forEach((b) =>
    listen(b, "click", () => {
      if (!storm.strike(null, { palette: b.dataset.strike }) && RM)
        toast("Os raios estão desligados com movimento reduzido.");
    }),
  );

  let stopped = false;
  let rowController;
  const rowsEl = $("#rows");
  const escAttr = (value) => esc(value);
  Promise.all([
    catalog("movie", {}, lifecycle.signal),
    catalog("series", {}, lifecycle.signal),
  ])
    .then((lists) => {
      if (stopped) return;
      rowsEl.innerHTML = lists
        .map(
          (items, index) =>
            `<section class="z-row"><h3 class="z-row__title">${index ? "Séries populares" : "Filmes populares"}</h3><div class="z-track">${items
              .slice(0, 20)
              .map(
                (item) =>
                  `<a class="z-card z-card--poster" href="${escAttr(titleHref(item))}" data-title="${escAttr(item.name)}" data-backdrop="${escAttr(backdrop(item))}"><span class="z-card__art"><img src="${escAttr(poster(item))}" alt="" loading="lazy"><span class="z-card__fallback">${esc(item.name)}</span></span></a>`,
              )
              .join("")}</div></section>`,
        )
        .join("");
      rowsEl.removeAttribute("aria-busy");
      rowController = rows(rowsEl);
      listen(rowsEl, "z:action", (event) => {
        location.href = event.detail.card.href;
      });
    })
    .catch(() => {
      if (!stopped) {
        rowsEl.removeAttribute("aria-busy");
        rowsEl.innerHTML =
          '<p class="z-muted">O catálogo não respondeu. Reabre o guia para tentar novamente.</p>';
      }
    });
  return () => {
    stopped = true;
    lifecycle.abort();
    timers.forEach(clearTimeout);
    timers.clear();
    timeline?.kill();
    entrance?.kill();
    painting.destroy();
    sky.destroy();
    storm.destroy();
    cl.destroy();
    bust.destroy();
    film?.destroy();
    rowController?.hide(true);
    resources.forEach((r) => r?.destroy());
  };
}
