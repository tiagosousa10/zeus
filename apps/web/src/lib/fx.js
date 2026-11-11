// Efeitos partilhados do Zeus. GSAP e THREE (r128) são globais carregados por cada página.
const RMQ = matchMedia("(prefers-reduced-motion: reduce)");
const root = document.documentElement;
export const prefersReducedMotion = () => RMQ.matches;
root.classList.toggle("z-rm", RMQ.matches);
RMQ.addEventListener?.("change", (e) =>
  root.classList.toggle("z-rm", e.matches),
);

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const els = (t) =>
  typeof t === "string" ? $$(t) : t instanceof Element ? [t] : [...t];

// Todos os ciclos param com o separador escondido ou com o elemento fora do ecrã.
const loops = new Set();
const io =
  "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        for (const e of entries)
          for (const l of loops)
            if (l.el === e.target) {
              l.seen = e.isIntersecting;
              l.sync();
            }
      })
    : null;
document.addEventListener("visibilitychange", () => {
  root.classList.toggle("z-paused", document.hidden);
  loops.forEach((l) => l.sync());
});
function loop(el, fn) {
  const l = { el, fn, seen: true, on: true, raf: 0, last: 0 };
  const step = (now) => {
    l.raf = requestAnimationFrame(step);
    const dt = Math.min(now - (l.last || now), 50);
    l.last = now;
    fn(now, dt);
  };
  l.sync = () => {
    const run = l.on && l.seen && !document.hidden;
    if (run && !l.raf) {
      l.last = 0;
      l.raf = requestAnimationFrame(step);
    } else if (!run && l.raf) {
      cancelAnimationFrame(l.raf);
      l.raf = 0;
    }
  };
  loops.add(l);
  io?.observe(el);
  l.sync();
  return {
    start() {
      l.on = true;
      l.sync();
    },
    stop() {
      l.on = false;
      l.sync();
    },
    destroy() {
      l.on = false;
      l.sync();
      loops.delete(l);
      io?.unobserve(el);
    },
  };
}

/* Raios: ramificações por deslocamento do ponto médio, 2 pulsos por raio e ≥700 ms entre raios (< 3 clarões/s). */
export const PALETTES = {
  neutral: {
    core: "255,250,240",
    glow: "176,204,255",
    flash: [1, 0.98, 0.94],
    gc: "200,220,255",
  },
  warm: {
    core: "255,244,214",
    glow: "255,176,60",
    flash: [1.15, 0.82, 0.5],
    gc: "255,186,90",
  },
  cool: {
    core: "236,254,255",
    glow: "125,227,240",
    flash: [0.6, 1, 1.15],
    gc: "125,227,240",
  },
};
const MIN_GAP = 700;
// Intensidade de um raio ao longo do tempo: pulso, quebra curta, segundo pulso, decaimento.
export function flick(age, pulses = 2) {
  if (age < 0) return 0;
  if (age < 60) return 1;
  if (pulses > 1) {
    if (age < 115) return 0.22;
    if (age < 175) return 0.85;
    return Math.max(0, 0.85 * (1 - (age - 175) / 380));
  }
  return Math.max(0, 1 - (age - 60) / 420);
}
function boltPath(x1, y1, x2, y2, disp, detail) {
  let pts = [
      [x1, y1],
      [x2, y2],
    ],
    d = disp;
  for (let g = 0; g < detail; g++) {
    const np = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i],
        [bx, by] = pts[i + 1];
      const dx = bx - ax,
        dy = by - ay,
        len = Math.hypot(dx, dy) || 1,
        off = rand(-1, 1) * d;
      np.push(
        [(ax + bx) / 2 - (dy / len) * off, (ay + by) / 2 + (dx / len) * off],
        pts[i + 1],
      );
    }
    pts = np;
    d *= 0.56;
  }
  return pts;
}
function branchOut(pts, out, w, depth) {
  const n = pts.length;
  for (let i = 4; i < n - 3; i++) {
    if (Math.random() > (depth ? 0.035 : 0.07)) continue;
    const [ax, ay] = pts[i],
      [bx, by] = pts[Math.min(n - 1, i + 3)];
    const dir =
      Math.atan2(by - ay, bx - ax) +
      rand(0.35, 0.9) * (Math.random() < 0.5 ? -1 : 1);
    const len = rand(40, 150) * (depth ? 0.6 : 1);
    const p = boltPath(
      ax,
      ay,
      ax + Math.cos(dir) * len,
      ay + Math.sin(dir) * len,
      len * 0.22,
      5,
    );
    out.push({ pts: p, w: w * 0.5 });
    if (depth < 1) branchOut(p, out, w * 0.5, depth + 1);
  }
}

export function lightning(canvas, opts = {}) {
  const o = {
    palette: "neutral",
    ambient: true,
    every: [4200, 9000],
    first: [2500, 5000],
    area: { x: [0.04, 0.96], y: [0.1, 0.48] },
    onStrike: null,
    ...opts,
  };
  const ctx = canvas.getContext("2d");
  let W = 1,
    H = 1,
    bolts = [],
    last = -1e9,
    dirty = false,
    intensity = 0;
  let nextAt = performance.now() + rand(...o.first);
  const size = () => {
    const r = canvas.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width || 1;
    H = r.height || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const ro = new ResizeObserver(size);
  ro.observe(canvas);
  size();

  // target: {x,y} em px do canvas, ou um elemento (atinge o topo dele).
  function strike(target, so = {}) {
    const now = performance.now();
    if (prefersReducedMotion() || now - last < MIN_GAP) return false;
    last = now;
    if (target instanceof Element) {
      const r = target.getBoundingClientRect(),
        c = canvas.getBoundingClientRect();
      target = {
        x: r.left - c.left + r.width / 2 + rand(-0.15, 0.15) * r.width,
        y: r.top - c.top + 4,
      };
    }
    const end = target || {
      x: rand(...o.area.x) * W,
      y: rand(...o.area.y) * H,
    };
    const start = so.from || {
      x: end.x + rand(-0.15, 0.15) * W,
      y: rand(-40, H * 0.03),
    };
    const main = boltPath(
      start.x,
      start.y,
      end.x,
      end.y,
      Math.hypot(end.x - start.x, end.y - start.y) * 0.16,
      7,
    );
    const paths = [{ pts: main, w: so.width || 1 }];
    branchOut(main, paths, so.width || 1, 0);
    const key = so.palette || o.palette,
      pulses = so.pulses || 2;
    bolts.push({
      paths,
      born: now,
      pulses,
      pal: PALETTES[key] || PALETTES.neutral,
    });
    nextAt = now + rand(...o.every);
    o.onStrike?.({
      x: end.x,
      y: end.y,
      palette: key,
      pulses,
      color: (PALETTES[key] || PALETTES.neutral).flash,
    });
    return true;
  }
  function draw(now) {
    if (!bolts.length) {
      if (dirty) {
        ctx.clearRect(0, 0, W, H);
        dirty = false;
      }
      intensity = 0;
      return;
    }
    ctx.clearRect(0, 0, W, H);
    dirty = true;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let max = 0;
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i],
        age = now - b.born;
      if (age > 720) {
        bolts.splice(i, 1);
        continue;
      }
      const I = flick(age, b.pulses);
      if (I <= 0.002) continue;
      max = Math.max(max, I);
      for (const p of b.paths) {
        ctx.beginPath();
        ctx.moveTo(p.pts[0][0], p.pts[0][1]);
        for (let k = 1; k < p.pts.length; k++)
          ctx.lineTo(p.pts[k][0], p.pts[k][1]);
        for (const [lw, a, col] of [
          [16, 0.045, b.pal.glow],
          [7, 0.13, b.pal.glow],
          [2.6, 0.5, b.pal.glow],
          [1.15, 0.95, b.pal.core],
        ]) {
          ctx.lineWidth = lw * p.w;
          ctx.strokeStyle = `rgba(${col},${a * I * (p.w < 1 ? 0.8 : 1)})`;
          ctx.stroke();
        }
      }
    }
    intensity = max;
  }
  const lp = loop(canvas, (now) => {
    if (o.ambient && now > nextAt)
      now - nextAt > 2000 ? (nextAt = now + rand(...o.first)) : strike();
    draw(now);
    o.onFrame?.(intensity);
  });
  return {
    strike,
    setPalette(p) {
      o.palette = p;
    },
    setAmbient(on) {
      o.ambient = on;
      nextAt = performance.now() + rand(...o.first);
    },
    get intensity() {
      return intensity;
    },
    destroy() {
      lp.destroy();
      ro.disconnect();
      ctx.clearRect(0, 0, W, H);
    },
  };
}

/* Pintura viva: plano Three.js com Ken Burns, paralaxe do cursor, distorção só no céu, grão, vinheta e clarão. */
const PAINT_FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes, uPan, uFlashPos, uFocus;
uniform vec3 uRect, uFlashCol;
uniform vec4 uFig[3];
uniform float uDpr, uTime, uZoom, uExposure, uFlash, uMood;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3. - 2.*f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.03; a *= .5; } return v; }
float ell(vec2 p, vec4 e){ vec2 d = (p - e.xy)/e.zw; return dot(d, d); }
void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 uv = (px - uRect.xy - uPan) / uRect.z;
  uv = uFocus + (uv - uFocus) / uZoom;
  float t = uTime;
  float sky = smoothstep(1., 1.7, min(min(ell(uv, uFig[0]), ell(uv, uFig[1])), ell(uv, uFig[2])));
  vec2 q = uv*3.;
  vec2 warp = vec2(fbm(q + vec2(t*.035, t*.01)), fbm(q + vec2(5.2, 1.3) - vec2(t*.02, t*.03))) - .5;
  float heat = (noise(vec2(uv.x*38., uv.y*12. - t*.7)) - .5) * smoothstep(.62, .95, uv.x);
  vec2 suv = uv + sky*(warp*.02 + vec2(heat*.005, 0.));
  float fade = smoothstep(0., .2, suv.x)*smoothstep(1., .74, suv.x)*smoothstep(0., .1, suv.y)*smoothstep(.9, .66, suv.y);
  float focus = smoothstep(.12, .7, distance(suv*vec2(1., 1.15), uFocus*vec2(1., 1.15)));
  float r = (1. - fade + focus*.5) * .004;
  vec3 c = texture2D(uTex, suv).rgb*.36
    + texture2D(uTex, suv + vec2( r,  r)).rgb*.16 + texture2D(uTex, suv + vec2(-r,  r)).rgb*.16
    + texture2D(uTex, suv + vec2( r, -r)).rgb*.16 + texture2D(uTex, suv + vec2(-r, -r)).rgb*.16;
  float drift = fbm(uv*2.2 + vec2(t*.025, -t*.012));
  c *= 1. + sky*(drift - .5)*.45;
  float warm = max(uMood, 0.), cool = max(-uMood, 0.);
  float right = sky*smoothstep(.55, .95, uv.x), left = sky*smoothstep(.5, .05, uv.x);
  c += vec3(.34, .04, .02) * right * warm * (.15 + drift*.7);
  c = mix(c, c*vec3(1.1, .95, .86), warm*.45);
  c += vec3(.0, .26, .32) * left * cool * (.2 + drift*.7);
  float l = dot(c, vec3(.299, .587, .114));
  c = mix(c, vec3(l)*vec3(.86, 1.02, 1.1), cool*.4);
  float lit = uFlash*(.28 + .95*exp(-distance(uv, uFlashPos)*3.2));
  c = mix(c, (c - .5)*(1. + .35*uFlash) + .5, uFlash*.6);
  c += c*lit*uFlashCol*1.3 + uFlashCol*lit*.05*sky;
  c *= fade * uExposure;
  vec2 sq = gl_FragCoord.xy/uRes - .5;
  c *= 1. - smoothstep(.3, .85, length(sq*vec2(1., 1.2)))*.5;
  c += (hash(gl_FragCoord.xy + fract(t*7.)*91.) - .5) * .05 * (.35 + fade);
  gl_FragColor = vec4(max(c, 0.), 1.);
}`;
// Valores por omissão afinados para zeus-5.webp (cara a 50% 13%, silhueta em 3 elipses).
export function livingPainting(container, imgUrl, opts = {}) {
  const o = {
    focus: { x: 0.5, y: 0.13 },
    anchor: { x: 0.5, y: 0.31 },
    anchorNarrow: { x: 0.5, y: 0.2 },
    figure: [
      [0.52, 0.62, 0.42, 0.46],
      [0.5, 0.17, 0.11, 0.16],
      [0.6, 0.36, 0.28, 0.16],
    ],
    size: (W, H) =>
      W < 700
        ? Math.max(H, W * 1.5)
        : Math.max(H * 1.28, Math.min(W * 0.82, H * 1.5)),
    kenBurns: 0.045,
    parallax: [16, 10],
    ...opts,
  };
  const RM = prefersReducedMotion();
  container.classList.add("z-painting");
  const still = new Image();
  still.className = "z-painting__still";
  still.alt = "";
  still.decoding = "async";
  still.src = imgUrl;
  const canvas = document.createElement("canvas");
  container.append(still, canvas);
  still.decode?.().then(
    () => still.classList.add("is-on"),
    () => {},
  );
  const state = { zoom: 1, exposure: 1, mood: 0 };
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 },
    pan = { x: 0, y: 0 },
    fl = { t: -1e9, pulses: 2, uv: [0.3, 0.3], col: [1, 1, 1] };
  let W = 1,
    H = 1,
    S = 1,
    T = { x: 0, y: 0 },
    gl = null,
    destroyed = false;

  if (!RM && window.THREE) {
    try {
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      });
      const u = {
        uTex: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: 1 },
        uRect: { value: new THREE.Vector3() },
        uPan: { value: new THREE.Vector2() },
        uFocus: { value: new THREE.Vector2(o.focus.x, o.focus.y) },
        uFig: { value: o.figure.map((f) => new THREE.Vector4(...f)) },
        uTime: { value: 0 },
        uZoom: { value: 1 },
        uExposure: { value: 1 },
        uMood: { value: 0 },
        uFlash: { value: 0 },
        uFlashPos: { value: new THREE.Vector2(0.3, 0.3) },
        uFlashCol: { value: new THREE.Vector3(1, 1, 1) },
      };
      const scene = new THREE.Scene();
      scene.add(
        new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new THREE.ShaderMaterial({
            uniforms: u,
            depthTest: false,
            depthWrite: false,
            vertexShader:
              "void main(){ gl_Position = vec4(position.xy, 0., 1.); }",
            fragmentShader: PAINT_FRAG,
          }),
        ),
      );
      gl = { renderer, scene, cam: new THREE.Camera(), u, ready: false };
      new THREE.TextureLoader().load(
        imgUrl,
        (tex) => {
          if (destroyed || !gl) {
            tex.dispose();
            return;
          }
          tex.flipY = false;
          tex.minFilter = THREE.LinearFilter;
          tex.generateMipmaps = false;
          u.uTex.value = tex;
          gl.ready = true;
          canvas.classList.add("is-on");
          container.classList.add("has-gl");
        },
        undefined,
        () => {
          gl = null;
          canvas.remove();
        },
      );
    } catch {
      gl = null;
      canvas.remove();
    }
  } else canvas.remove();

  function layout() {
    const r = container.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width || 1;
    H = r.height || 1;
    S = o.size(W, H);
    const a = W < 700 ? o.anchorNarrow : o.anchor;
    T = { x: W * a.x - S * o.focus.x, y: H * a.y - S * o.focus.y };
    Object.assign(still.style, {
      left: T.x + "px",
      top: T.y + "px",
      width: S + "px",
      height: S + "px",
    });
    if (gl) {
      gl.renderer.setPixelRatio(dpr);
      gl.renderer.setSize(W, H, false);
      gl.renderer.getDrawingBufferSize(gl.u.uRes.value);
      gl.u.uDpr.value = dpr;
      gl.u.uRect.value.set(T.x, T.y, S);
    }
  }
  const ro = new ResizeObserver(layout);
  ro.observe(container);
  layout();

  const onMove = (e) => {
    if (e.pointerType !== "mouse") return;
    const r = container.getBoundingClientRect();
    ptr.tx = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5) * 2;
    ptr.ty = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5) * 2;
  };
  if (!RM) addEventListener("pointermove", onMove, { passive: true });

  const toUV = (x, y) => {
    const u = (x - T.x - pan.x) / S,
      v = (y - T.y - pan.y) / S,
      z = gl ? gl.u.uZoom.value : 1;
    return [o.focus.x + (u - o.focus.x) / z, o.focus.y + (v - o.focus.y) / z];
  };
  // pt em px do contentor; color = PALETTES[x].flash. Chamar a partir de lightning({onStrike}).
  function flash(
    pt = { x: W * 0.3, y: H * 0.3 },
    color = PALETTES.neutral.flash,
    pulses = 2,
  ) {
    if (RM) return;
    fl.t = performance.now();
    fl.uv = toUV(pt.x, pt.y);
    fl.col = color;
    fl.pulses = pulses;
  }
  const lp = loop(container, (now) => {
    const t = now / 1000,
      I = flick(now - fl.t, fl.pulses);
    ptr.x += (ptr.tx - ptr.x) * 0.045;
    ptr.y += (ptr.ty - ptr.y) * 0.045;
    pan.x = -ptr.x * o.parallax[0];
    pan.y = -ptr.y * o.parallax[1];
    if (gl && gl.ready) {
      const u = gl.u;
      u.uTime.value = t;
      u.uZoom.value =
        state.zoom *
        (1 + o.kenBurns * (0.5 - 0.5 * Math.cos((t * Math.PI * 2) / 52)));
      u.uExposure.value = state.exposure;
      u.uMood.value = state.mood;
      u.uPan.value.set(
        pan.x + Math.sin(t * 0.05) * 10,
        pan.y + Math.cos(t * 0.04) * 6,
      );
      u.uFlash.value = I * 0.95;
      u.uFlashPos.value.set(...fl.uv);
      u.uFlashCol.value.set(...fl.col);
      gl.renderer.render(gl.scene, gl.cam);
    } else if (!gl) {
      still.style.filter =
        I > 0
          ? `brightness(${(1 + I * 0.7).toFixed(3)}) contrast(${(1 + I * 0.2).toFixed(3)})`
          : "";
      still.style.opacity = (0.88 * state.exposure).toFixed(3);
    }
  });
  if (RM) lp.stop();
  let moodTween = null;
  return {
    state,
    flash,
    setMood(v) {
      if (!window.gsap || RM) {
        state.mood = v;
        return;
      }
      moodTween?.kill();
      moodTween = gsap.to(state, {
        mood: v,
        duration: 0.9,
        ease: "power2.out",
      });
    },
    destroy() {
      destroyed = true;
      moodTween?.kill();
      lp.destroy();
      ro.disconnect();
      removeEventListener("pointermove", onMove);
      if (gl) {
        gl.u.uTex.value?.dispose();
        gl.scene.traverse((obj) => {
          obj.geometry?.dispose();
          obj.material?.dispose();
        });
        gl.renderer.dispose();
        gl = null;
      }
      container.replaceChildren();
    },
  };
}

/* Luz do cursor: um recorte nítido da imagem segue o cursor; parado, orbita devagar. */
export function cursorLight(el, opts = {}) {
  const o = {
    size: 0.62,
    rest: [0.34, 0.3],
    orbit: [0.47, 0.38, 0.13, 0.09],
    idle: 3500,
    tint: 0,
    ...opts,
  };
  const img = el.querySelector("img");
  el.classList.add("z-light");
  el.style.setProperty("--lamp", o.size);
  const breath = document.createElement("div"),
    lamp = document.createElement("div");
  breath.className = "z-light__breath";
  lamp.className = "z-light__lamp";
  const lit = img.cloneNode();
  lit.className = "z-light__lit";
  lit.alt = "";
  img.classList.add("z-light__base");
  lamp.innerHTML =
    '<div class="z-light__tint"></div><div class="z-light__bloom"></div>';
  lamp.prepend(lit);
  el.append(breath);
  breath.append(img, lamp);
  const tint = lamp.firstElementChild.nextElementSibling;
  tint.style.opacity = o.tint;
  const L = { x: 0, y: 0, tx: 0, ty: 0, last: -1e9, S: 1 };
  const place = (x, y) => {
    const h = (L.S * o.size) / 2;
    lamp.style.transform = `translate3d(${x - h}px,${y - h}px,0)`;
    lit.style.transform = `translate3d(${h - x}px,${h - y}px,0)`;
  };
  const rest = () => {
    L.x = L.tx = o.rest[0] * L.S;
    L.y = L.ty = o.rest[1] * L.S;
    place(L.x, L.y);
  };
  const ro = new ResizeObserver(() => {
    L.S = el.offsetWidth;
    rest();
  });
  ro.observe(el);
  L.S = el.offsetWidth;
  rest();
  if (prefersReducedMotion())
    return {
      setTint(v, c) {
        tint.style.opacity = v;
        if (c) tint.style.background = c;
      },
      setMode(m) {
        Object.assign(o, m);
        rest();
      },
      destroy() {
        ro.disconnect();
      },
    };

  const onMove = (e) => {
    const r = el.getBoundingClientRect();
    L.tx = ((e.clientX - r.left) * L.S) / r.width;
    L.ty = ((e.clientY - r.top) * L.S) / r.height;
    L.last = performance.now();
  };
  const onLeave = () => {
    L.last = -1e9;
  };
  addEventListener("pointermove", onMove, { passive: true });
  root.addEventListener("pointerleave", onLeave);
  const lp = loop(el, (now, dt) => {
    const active = now - L.last < o.idle;
    if (!active) {
      const t = (now / 1000) * 0.42,
        m = o.orbit;
      L.tx = L.S * (m[0] + m[2] * Math.cos(t * 0.5));
      L.ty = L.S * (m[1] + m[3] * Math.sin(t * 0.8));
    }
    const k = 1 - Math.exp(-dt / (active ? 140 : 600));
    L.x += (L.tx - L.x) * k;
    L.y += (L.ty - L.y) * k;
    place(L.x, L.y);
  });
  return {
    setTint(v, color) {
      tint.style.opacity = v;
      if (color) tint.style.background = color;
    },
    setMode(m) {
      Object.assign(o, m);
      L.last = -1e9;
    },
    destroy() {
      lp.destroy();
      ro.disconnect();
      removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    },
  };
}

/* Cartão tvOS: eleva, inclina até 9°/11° e o reflexo segue o rato. O resto está em .z-tilt. */
export function tilt(el) {
  el.classList.add("z-tilt");
  if (!el.querySelector(":scope > .z-glare"))
    el.insertAdjacentHTML(
      "afterbegin",
      '<span class="z-glare" aria-hidden="true"></span>',
    );
  const set = (k, v) => el.style.setProperty(k, v);
  const move = (e) => {
    if (prefersReducedMotion() || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect(),
      x = (e.clientX - r.left) / r.width,
      y = (e.clientY - r.top) / r.height;
    el.classList.add("is-tracking");
    set("--rx", ((0.5 - y) * 9).toFixed(2) + "deg");
    set("--ry", ((x - 0.5) * 11).toFixed(2) + "deg");
    set("--gx", (x * 100).toFixed(1) + "%");
    set("--gy", (y * 100).toFixed(1) + "%");
  };
  const leave = () => {
    el.classList.remove("is-tracking");
    set("--rx", "0deg");
    set("--ry", "0deg");
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerleave", leave);
  return {
    destroy() {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    },
  };
}

/* Nuvens: sprites Three.js em camadas; set(p) sobe a câmara de 0 (base) a 1 (cume). */
export function clouds(canvas, opts = {}) {
  const o = {
    count: 84,
    height: 56,
    colors: ["#27324a", "#8a9bb8", "#fff1dc"],
    ...opts,
  };
  const RM = prefersReducedMotion();
  const noop = { set() {}, destroy() {} };
  if (!window.THREE) return noop;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
    });
  } catch {
    return noop;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene(),
    cam = new THREE.PerspectiveCamera(55, 1, 0.1, 200),
    Hh = o.height;
  cam.position.set(0, 0, 24);
  const tex = [0, 1, 2].map((seed) => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    let s = seed * 9301 + 49297;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 16; i++) {
      const x = 128 + (rnd() - 0.5) * 120,
        y = 140 + (rnd() - 0.5) * 56,
        r = 34 + rnd() * 52;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,.5)");
      gr.addColorStop(0.6, "rgba(255,255,255,.18)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    }
    g.globalCompositeOperation = "destination-in";
    const edge = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    edge.addColorStop(0, "#fff");
    edge.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = edge;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  });
  const [dusk, mid, gold] = o.colors.map((c) => new THREE.Color(c));
  const sprites = [];
  for (let i = 0; i < o.count; i++) {
    const y = -14 + Math.random() * (Hh + 26);
    let x = (Math.random() - 0.5) * 74;
    if (y > Hh - 12 && Math.abs(x) < 15)
      x = Math.sign(x || 1) * (15 + Math.random() * 18);
    const z = -58 + Math.random() * 68,
      t = clamp(y / Hh, 0, 1),
      near = z > -6;
    const col =
      t < 0.5
        ? dusk.clone().lerp(mid, t * 2)
        : mid.clone().lerp(gold, (t - 0.5) * 2);
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex[i % 3],
        color: col,
        transparent: true,
        depthWrite: false,
        opacity: near ? 0.22 : 0.6 - (0.22 * (z + 58)) / 52,
      }),
    );
    const k = (near ? 16 : 10) + Math.random() * 20;
    sp.scale.set(k * 1.6, k * 0.9, 1);
    sp.position.set(x, y, z);
    sp.userData.v =
      (Math.random() * 0.6 + 0.2) * (Math.random() < 0.5 ? -1 : 1);
    scene.add(sp);
    sprites.push(sp);
  }
  let mx = 0;
  const render = () => renderer.render(scene, cam);
  const size = () => {
    const w = canvas.clientWidth || 1,
      h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    render();
  };
  const ro = new ResizeObserver(size);
  ro.observe(canvas);
  const onMove = (e) => {
    mx = e.clientX / innerWidth - 0.5;
  };
  if (!RM && matchMedia("(pointer:fine)").matches)
    addEventListener("pointermove", onMove, { passive: true });
  const lp = loop(canvas, (now, dt) => {
    for (const sp of sprites) {
      sp.position.x += (sp.userData.v * dt) / 1000;
      if (sp.position.x > 44) sp.position.x = -44;
      else if (sp.position.x < -44) sp.position.x = 44;
    }
    cam.position.x += (mx * 1.6 - cam.position.x) * 0.04;
    render();
  });
  if (RM) lp.stop();
  return {
    set(p) {
      cam.position.y = clamp(p, 0, 1) * Hh;
      render();
    },
    destroy() {
      lp.destroy();
      ro.disconnect();
      removeEventListener("pointermove", onMove);
      sprites.forEach((sp) => sp.material.dispose());
      tex.forEach((texture) => texture.dispose());
      renderer.dispose();
    },
  };
}

/* Grão de película animado (canvas), para estados degradados como «sem ligação». */
export function grain(el, opts = {}) {
  const o = { opacity: 0.16, fps: 12, ...opts };
  const c = document.createElement("canvas");
  c.width = c.height = 180;
  c.className = "z-grain z-grain--canvas";
  c.style.opacity = o.opacity;
  c.setAttribute("aria-hidden", "true");
  el.append(c);
  const g = c.getContext("2d"),
    img = g.createImageData(180, 180);
  const paint = () => {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i + 1] = d[i + 2] = (Math.random() * 255) | 0;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  };
  paint();
  let acc = 0;
  const lp = loop(c, (now, dt) => {
    if ((acc += dt) >= 1000 / o.fps) {
      acc = 0;
      paint();
    }
  });
  if (prefersReducedMotion()) lp.stop();
  return {
    el: c,
    destroy() {
      lp.destroy();
      c.remove();
    },
  };
}

/* Entrada em cascata. Com movimento reduzido só faz fade. */
export function reveal(targets, opts = {}) {
  const list = els(targets);
  if (!window.gsap || !list.length) return null;
  // fromTo explícito: um from() leria a opacidade a meio de uma transição CSS e ficaria a 0.
  if (prefersReducedMotion())
    return gsap.fromTo(
      list,
      { opacity: 0 },
      { opacity: 1, duration: 0.6, stagger: 0.05, ease: "none" },
    );
  return gsap.fromTo(
    list,
    { opacity: 0, y: opts.y ?? 18 },
    {
      opacity: 1,
      y: 0,
      duration: opts.duration ?? 1.1,
      stagger: opts.stagger ?? 0.09,
      delay: opts.delay ?? 0.1,
      ease: "expo.out",
      clearProps: "transform",
    },
  );
}

/* Filas Netflix: setas paginam (650 ms), teclado entre cartões, pré-visualização ao fim de 450 ms a 1,45×. */
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.9v14.2c0 .8.9 1.3 1.6.9l11-7.1a1 1 0 0 0 0-1.8l-11-7.1C7.9 3.6 7 4.1 7 4.9z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  right:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
};
export { ICON };
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// Por omissão a pré-visualização lê data-title, data-meta (separado por |), data-backdrop, data-progress e data-in-list do cartão.
function defaultPreview(card) {
  const d = card.dataset,
    src = d.backdrop || card.querySelector("img")?.src || "",
    inList = d.inList === "true";
  return `<div class="z-preview__art">${src ? `<img src="${esc(src)}" alt="">` : ""}${d.progress ? `<span class="z-progress"><i style="--p:${esc(d.progress)}"></i></span>` : ""}</div>
    <div class="z-preview__body"><div class="z-preview__actions">
      <button tabindex="-1" data-act="play" aria-label="Reproduzir">${ICON.play}</button>
      <button tabindex="-1" data-act="list" aria-pressed="${inList}" aria-label="A minha lista">${inList ? ICON.check : ICON.plus}</button>
      <button tabindex="-1" data-act="more" aria-label="Mais informações">${ICON.down}</button>
    </div><div class="z-preview__title">${esc(d.title || card.getAttribute("aria-label"))}</div>${
      d.meta
        ? `<div class="z-meta">${d.meta
            .split("|")
            .map((m) => `<span>${esc(m)}</span>`)
            .join("")}</div>`
        : ""
    }</div>`;
}
let pv = null,
  pvCard = null,
  pvTimer = 0,
  pvOpen = false;
function showPreview(card) {
  const G = window.gsap,
    RM = prefersReducedMotion();
  if (!card.isConnected || !G) return;
  const art = card.querySelector(".z-card__art") || card,
    track = card.closest(".z-track");
  const a = art.getBoundingClientRect(),
    tr = track.getBoundingClientRect();
  const W = Math.max(a.width * 1.45, 280);
  pv.innerHTML = (card.closest(".z-row")?._render || defaultPreview)(card);
  G.killTweensOf(pv);
  G.set(pv, { scale: 1, opacity: 0, width: W });
  const H = pv.offsetHeight,
    artH = (W * 9) / 16;
  const edge =
    a.left - tr.left < a.width * 0.9
      ? "left"
      : tr.right - a.right < a.width * 0.9
        ? "right"
        : "center";
  let left =
    edge === "left"
      ? a.left
      : edge === "right"
        ? a.right - W
        : a.left + a.width / 2 - W / 2;
  left = clamp(left, 8, innerWidth - W - 8);
  const top = clamp(a.top + a.height / 2 - artH / 2, 8, innerHeight - H - 8);
  const ox =
    edge === "left"
      ? a.left - left
      : edge === "right"
        ? a.right - left
        : a.left + a.width / 2 - left;
  G.set(pv, {
    x: left,
    y: top,
    transformOrigin: `${ox}px ${a.top + a.height / 2 - top}px`,
  });
  pv.classList.add("is-open");
  pvCard = card;
  pvOpen = true;
  G.fromTo(
    pv,
    { scale: RM ? 1 : a.width / W },
    { scale: 1, duration: RM ? 0 : 0.275, ease: "power2.out" },
  );
  G.to(pv, { opacity: 1, duration: RM ? 0.15 : 0.12, ease: "none" });
}
function hidePreview(instant) {
  clearTimeout(pvTimer);
  if (!pvOpen) return;
  const G = window.gsap,
    RM = prefersReducedMotion();
  pvOpen = false;
  pv.classList.remove("is-open");
  const art = pvCard?.isConnected
    ? pvCard.querySelector(".z-card__art") || pvCard
    : null;
  pvCard = null;
  G.killTweensOf(pv);
  if (instant || !art) return G.set(pv, { opacity: 0 });
  G.to(pv, {
    scale: RM ? 1 : art.offsetWidth / pv.offsetWidth,
    opacity: 0,
    duration: 0.175,
    ease: "power2.in",
  });
}
function initPreview() {
  pv = document.createElement("div");
  pv.className = "z-preview";
  pv.setAttribute("aria-hidden", "true");
  document.body.append(pv);
  pv.addEventListener("mouseleave", (e) => {
    if (!pvCard?.contains(e.relatedTarget)) hidePreview();
  });
  pv.addEventListener("click", (e) => {
    const card = pvCard,
      btn = e.target.closest("[data-act]");
    if (!card) return;
    if (!btn || btn.dataset.act === "more") {
      hidePreview(true);
      return card.click();
    }
    if (btn.dataset.act === "list") {
      const on = card.dataset.inList !== "true";
      card.dataset.inList = on;
      btn.setAttribute("aria-pressed", on);
      btn.innerHTML = on ? ICON.check : ICON.plus;
    }
    card.dispatchEvent(
      new CustomEvent("z:action", {
        bubbles: true,
        detail: { action: btn.dataset.act, card },
      }),
    );
  });
  addEventListener("resize", () => {
    hidePreview(true);
    $$(".z-row[data-wired]").forEach((r) => r._upd?.());
  });
  addEventListener("scroll", () => hidePreview(true), { passive: true });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hidePreview();
  });
}
// Cartões: .z-card dentro de .z-track; o clique no cartão é da página. Ações da pré-visualização chegam como evento «z:action».
export function rows(rootEl = document, opts = {}) {
  const RM = prefersReducedMotion(),
    HOVER = matchMedia("(hover: hover) and (pointer: fine)").matches,
    G = window.gsap;
  if (!pv) initPreview();
  const hide = hidePreview;

  function page(track, dir) {
    hide(true);
    const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    const to = clamp(
      track.scrollLeft + dir * (track.clientWidth - pad * 2),
      0,
      track.scrollWidth - track.clientWidth,
    );
    if (G)
      G.to(track, {
        scrollLeft: to,
        duration: RM ? 0 : 0.65,
        ease: "power2.inOut",
        overwrite: true,
      });
    else track.scrollTo({ left: to, behavior: RM ? "auto" : "smooth" });
  }
  function wire(row) {
    row.dataset.wired = "";
    row._render = opts.render;
    const track = row.querySelector(".z-track");
    let body = row.querySelector(".z-row__body");
    if (!body) {
      body = document.createElement("div");
      body.className = "z-row__body";
      track.before(body);
      body.append(track);
    }
    if (!body.querySelector(".z-arrow")) {
      const name =
        row.querySelector(".z-row__title")?.textContent.trim() || "esta fila";
      body.insertAdjacentHTML(
        "afterbegin",
        `<button class="z-arrow z-arrow--prev" type="button" aria-label="Anteriores em ${esc(name)}">${ICON.left}</button>`,
      );
      body.insertAdjacentHTML(
        "beforeend",
        `<button class="z-arrow z-arrow--next" type="button" aria-label="Seguintes em ${esc(name)}">${ICON.right}</button>`,
      );
    }
    const upd = () => {
      body.classList.toggle("is-start", track.scrollLeft < 4);
      body.classList.toggle(
        "is-end",
        track.scrollLeft + track.clientWidth > track.scrollWidth - 4,
      );
    };
    body.addEventListener("click", (e) => {
      const a = e.target.closest(".z-arrow");
      if (a) page(track, a.classList.contains("z-arrow--next") ? 1 : -1);
    });
    track.addEventListener(
      "scroll",
      () => {
        upd();
        hide(true);
      },
      { passive: true },
    );
    track.addEventListener("keydown", (e) => {
      const cards = $$(".z-card:not([hidden])", track),
        i = cards.indexOf(e.target.closest(".z-card"));
      if (i < 0) return;
      const n = {
        ArrowRight: i + 1,
        ArrowLeft: i - 1,
        Home: 0,
        End: cards.length - 1,
      }[e.key];
      if (n === undefined || !cards[n]) return;
      e.preventDefault();
      hide(true);
      cards[n].focus({ preventScroll: true });
      cards[n].scrollIntoView({
        inline: "nearest",
        block: "nearest",
        behavior: RM ? "auto" : "smooth",
      });
    });
    track.addEventListener(
      "error",
      (e) => {
        if (e.target.tagName === "IMG") e.target.remove();
      },
      true,
    );
    if (HOVER) {
      track.addEventListener("mouseover", (e) => {
        const card = e.target.closest(".z-card");
        if (!card || card === pvCard || card.contains(e.relatedTarget)) return;
        clearTimeout(pvTimer);
        pvTimer = setTimeout(() => showPreview(card), 450);
      });
      track.addEventListener("mouseout", (e) => {
        const card = e.target.closest(".z-card");
        if (!card || card.contains(e.relatedTarget)) return;
        clearTimeout(pvTimer);
        if (pvCard === card && !pv.contains(e.relatedTarget)) hide();
      });
    }
    row._upd = upd;
    upd();
  }
  const refresh = () => $$(".z-row:not([data-wired])", rootEl).forEach(wire);
  refresh();
  return { refresh, hide };
}

/* Modal/folha: abre a crescer a partir do elemento de origem; Escape e o fundo fecham; o resto da página fica inert. */
export function modal(el) {
  const sheet = el.querySelector(".z-sheet"),
    scrim = el.querySelector(".z-scrim"),
    G = window.gsap;
  const others = (on) =>
    [...document.body.children].forEach((c) => {
      if (c !== el && !c.contains(el) && !c.matches(".z-toast")) c.inert = on;
    });
  let origin = null;
  const delta = (o, s) => ({
    x: o.left + o.width / 2 - (s.left + s.width / 2),
    y: o.top + o.height / 2 - (s.top + s.height / 2),
    scale: Math.max(0.15, o.width / s.width),
    opacity: 0,
  });
  function open(from) {
    origin = from || document.activeElement;
    el.hidden = false;
    others(true);
    root.style.overflow = "hidden";
    sheet.scrollTop = 0;
    const RM = prefersReducedMotion(),
      o = from?.getBoundingClientRect?.(),
      s = sheet.getBoundingClientRect();
    if (G) {
      G.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      G.fromTo(
        sheet,
        RM || !o?.width ? { opacity: 0, scale: RM ? 1 : 0.96 } : delta(o, s),
        { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.3, ease: "power3.out" },
      );
    }
    (sheet.querySelector("[autofocus],.z-sheet__close") || sheet).focus({
      preventScroll: true,
    });
  }
  function close() {
    if (el.hidden) return;
    const done = () => {
      el.hidden = true;
      G?.set(sheet, { clearProps: "all" });
      others(false);
      root.style.overflow = "";
      origin?.isConnected && origin.focus({ preventScroll: true });
    };
    if (!G) return done();
    const o =
        origin?.isConnected && origin.offsetParent
          ? origin.getBoundingClientRect()
          : null,
      RM = prefersReducedMotion();
    G.to(scrim, { opacity: 0, duration: 0.25 });
    G.to(sheet, {
      ...(!RM && o?.width
        ? delta(o, sheet.getBoundingClientRect())
        : { opacity: 0, scale: RM ? 1 : 0.96 }),
      duration: 0.25,
      ease: "power2.in",
      onComplete: done,
    });
  }
  el.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.hidden) close();
  });
  return { open, close };
}

/* Aviso curto no fundo do ecrã. */
let toastEl = null,
  toastTimer = 0;
export function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "z-toast";
    toastEl.setAttribute("role", "status");
    document.body.append(toastEl);
  }
  toastEl.textContent = msg;
  if (!window.gsap) {
    toastEl.style.opacity = 1;
  } else {
    gsap.killTweensOf(toastEl);
    gsap.fromTo(
      toastEl,
      { opacity: 0, y: prefersReducedMotion() ? 0 : 14 },
      { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" },
    );
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () =>
      window.gsap
        ? gsap.to(toastEl, { opacity: 0, duration: 0.25 })
        : (toastEl.style.opacity = 0),
    2400,
  );
}
