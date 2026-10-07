const circuitMenu = document.querySelector('.circuit-menu');

if (circuitMenu) {
  const header = circuitMenu.closest('.masthead, .topbar');
  const garage = document.querySelector('.garage');
  const toggle = circuitMenu.querySelector('summary');
  const panel = circuitMenu.querySelector('.circuit-menu__panel');
  const base = circuitMenu.querySelector('.circuit-menu__panel a')?.getAttribute('href')?.startsWith('../')
    ? '../' : './';
  const circuits = [
    { slug: 'monza', number: '01', name: 'Monza', detail: 'Italie · 5,793 km' },
    { slug: 'singapore', number: '02', name: 'Singapour', detail: 'Marina Bay · 4,927 km' },
    { slug: 'austin', number: '03', name: 'Austin', detail: 'États-Unis · 5,513 km' },
    { slug: 'mexico', number: '04', name: 'Mexico', detail: 'Mexique · 4,304 km' },
    { slug: 'interlagos', number: '05', name: 'Interlagos', detail: 'Brésil · 4,309 km' },
    { slug: 'las-vegas', number: '06', name: 'Las Vegas', detail: 'Nevada · 6,201 km' },
    { slug: 'lusail', number: '07', name: 'Lusail', detail: 'Qatar · 5,419 km' },
  ];

  for (const circuit of circuits) {
    if (!panel) break;
    let link = [...panel.querySelectorAll('a')].find(item =>
      new URL(item.href).pathname.replace(/\/$/, '').endsWith(`/${circuit.slug}`));
    if (!link) {
      link = document.createElement('a');
      link.href = `${base}${circuit.slug}/`;
      const number = document.createElement('span');
      number.className = 'circuit-menu__number';
      const place = document.createElement('span');
      place.className = 'circuit-menu__place';
      const name = document.createElement('strong');
      const detail = document.createElement('small');
      place.append(name, detail);
      link.append(number, place);
    }
    link.querySelector('.circuit-menu__number').textContent = circuit.number;
    link.querySelector('.circuit-menu__place strong').textContent = circuit.name;
    link.querySelector('.circuit-menu__place small').textContent = circuit.detail;
    panel.append(link);
  }

  const currentSlug = window.location.pathname.split('/').filter(Boolean).at(-1);
  for (const link of panel?.querySelectorAll('a') || []) {
    const slug = new URL(link.href).pathname.split('/').filter(Boolean).at(-1);
    if (slug === currentSlug) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const count = circuitMenu.querySelector('.circuit-menu__eyebrow');
  if (count && panel) count.textContent = `CIRCUITS · ${panel.querySelectorAll('a').length}`;
  const currentLabel = circuitMenu.querySelector('.circuit-menu__current');
  const currentCircuit = circuits.find(circuit => circuit.slug === currentSlug);
  if (currentLabel && currentCircuit) currentLabel.textContent = currentCircuit.name;

  for (const link of circuitMenu.querySelectorAll('.circuit-menu__panel a')) {
    const name = link.querySelector('.circuit-menu__place strong')?.textContent;
    const detail = link.querySelector('.circuit-menu__place small')?.textContent;
    if (name) link.setAttribute('aria-label', `${name}${detail ? ` · ${detail}` : ''}${link.hasAttribute('aria-current') ? ' · circuit actuel' : ''}`);
  }

  circuitMenu.addEventListener('toggle', () => {
    header?.classList.toggle('circuit-menu-open', circuitMenu.open);
    if (circuitMenu.open && garage?.open) garage.open = false;
  });

  garage?.addEventListener('toggle', () => {
    if (garage.open) circuitMenu.open = false;
  });

  document.addEventListener('pointerdown', event => {
    if (circuitMenu.open && !circuitMenu.contains(event.target)) circuitMenu.open = false;
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !circuitMenu.open) return;
    circuitMenu.open = false;
    toggle?.focus();
  });
}
