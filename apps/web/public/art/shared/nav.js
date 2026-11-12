// Barra de topo partilhada. Uso: mountNav({ active: 'cinema' | 'tv', page: 'inicio' })
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
  grid: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>'),
};
const LINKS = {
  cinema: [['inicio', 'Início', 'cinema.html'], ['explorar', 'Explorar', 'explorar.html'], ['lista', 'A minha lista', 'cinema.html#lista']],
  tv: [['canais', 'Canais', 'tv.html'], ['guia', 'Guia', 'tv.html#guia']],
};
const MENU = [['conta', 'Conta', 'conta.html'], ['addons', 'Add-ons', 'addons.html'], ['admin', 'Administração', 'admin.html']];
const MOTOR = { ok: 'Motor ligado', busy: 'Motor a arrancar', off: 'Motor desligado' };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// page: 'inicio' | 'explorar' | 'lista' | 'canais' | 'guia' | 'conta' | 'addons' | 'admin' (ou nada).
export function mountNav({ active = 'cinema', page = '', user = { name: 'Inês Duarte', email: 'ines.duarte@exemplo.pt' }, motor = 'ok' } = {}) {
  const cur = k => k === page ? ' aria-current="page"' : '';
  const initials = user.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const q = active === 'tv' ? 'tv.html' : 'explorar.html';
  const nav = document.createElement('header');
  nav.className = 'z-nav';
  nav.innerHTML = `
    <a class="z-wordmark" href="portal.html" aria-label="Zeus, voltar ao Portal">ZEUS</a>
    <nav class="z-seg" aria-label="Módulo">
      <a href="cinema.html"${active === 'cinema' ? ' aria-current="page"' : ''}>Cinema</a>
      <a href="tv.html"${active === 'tv' ? ' aria-current="page"' : ''}>TV</a>
    </nav>
    <nav class="z-tabs z-nav__links" aria-label="${active === 'tv' ? 'Secções de TV' : 'Secções de Cinema'}">
      ${LINKS[active].map(([k, label, href]) => `<a href="${href}"${cur(k)}>${label}</a>`).join('')}
    </nav>
    <div class="z-nav__end">
      <button class="z-icon-btn" type="button" data-nav-search aria-label="Pesquisar" aria-expanded="false" aria-controls="z-nav-search">${I.search}</button>
      <a class="z-status" href="estados.html" data-state="${motor}" aria-live="polite">${MOTOR[motor]}</a>
      <a class="z-icon-btn z-nav__portal" href="portal.html" aria-label="Portal">${I.grid}</a>
      <button class="z-avatar" type="button" data-nav-menu aria-haspopup="menu" aria-expanded="false" aria-controls="z-nav-menu" aria-label="Menu da conta, ${esc(user.name)}">${esc(initials)}</button>
    </div>
    <form class="z-search z-nav__search" id="z-nav-search" role="search" action="${q}" hidden>
      ${I.search}<input type="search" name="q" placeholder="${active === 'tv' ? 'Canais e programas' : 'Filmes e séries'}" aria-label="Pesquisar ${active === 'tv' ? 'canais e programas' : 'filmes e séries'}" autocomplete="off">
    </form>
    <div class="z-menu" id="z-nav-menu" role="menu" aria-label="Conta" hidden>
      <div class="z-menu__head"><b>${esc(user.name)}</b>${esc(user.email)}<br><span class="z-status" data-state="${motor}">${MOTOR[motor]}</span></div>
      ${MENU.map(([k, label, href]) => `<a class="z-menu__item" role="menuitem" href="${href}"${cur(k)}>${label}</a>`).join('')}
      <a class="z-menu__item" role="menuitem" href="portal.html">Portal</a>
      <hr>
      <a class="z-menu__item" role="menuitem" href="entrada.html">Sair</a>
    </div>`;
  document.body.prepend(nav);

  const $ = s => nav.querySelector(s);
  const searchBtn = $('[data-nav-search]'), form = $('#z-nav-search'), input = form.querySelector('input');
  const menuBtn = $('[data-nav-menu]'), menu = $('#z-nav-menu'), items = [...menu.querySelectorAll('[role="menuitem"]')];
  const status = [...nav.querySelectorAll('.z-status')];
  const pop = (el, btn, open) => {
    el.hidden = !open; btn.setAttribute('aria-expanded', open);
    if (open && window.gsap) gsap.fromTo(el, { opacity: 0, y: -8, scale: .98 }, { opacity: 1, y: 0, scale: 1, duration: .3, ease: 'power3.out' });
  };
  const closeAll = () => { pop(form, searchBtn, false); pop(menu, menuBtn, false); };

  searchBtn.addEventListener('click', () => {
    const open = form.hidden;
    closeAll(); pop(form, searchBtn, open);
    if (open) input.focus();
  });
  menuBtn.addEventListener('click', () => {
    const open = menu.hidden;
    closeAll(); pop(menu, menuBtn, open);
    if (open) items[0].focus();
  });
  menuBtn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && menu.hidden) { e.preventDefault(); menuBtn.click(); }
  });
  menu.addEventListener('keydown', e => {
    const i = items.indexOf(document.activeElement);
    const n = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (n === undefined) return;
    e.preventDefault(); items[(n + items.length) % items.length].focus();
  });
  form.addEventListener('submit', e => { if (!input.value.trim()) e.preventDefault(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!menu.hidden) { pop(menu, menuBtn, false); menuBtn.focus(); }
    else if (!form.hidden) { pop(form, searchBtn, false); searchBtn.focus(); }
  });
  document.addEventListener('pointerdown', e => { if (!nav.contains(e.target)) closeAll(); });

  const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  return {
    el: nav,
    // state: 'ok' | 'busy' | 'off'
    setMotor(state, label = MOTOR[state]) { status.forEach(s => { s.dataset.state = state; s.textContent = label; }); },
    destroy() { removeEventListener('scroll', onScroll); nav.remove(); },
  };
}
