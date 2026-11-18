const circuitMenu = document.querySelector('.circuit-menu');

if (circuitMenu) {
  const header = circuitMenu.closest('.masthead, .topbar');
  const garage = document.querySelector('.garage');
  const toggle = circuitMenu.querySelector('summary');
  const panel = circuitMenu.querySelector('.circuit-menu__panel');
  const base = circuitMenu.querySelector('.circuit-menu__panel a')?.getAttribute('href')?.startsWith('../')
    ? '../' : './';
  const circuits = [
    { slug: 'albert-park', number: '01', name: 'Albert Park', detail: 'Australie · 5,278 km' },
    { slug: 'shanghai', number: '02', name: 'Shanghai', detail: 'Chine · 5,451 km' },
    { slug: 'suzuka', number: '03', name: 'Suzuka', detail: 'Japon · 5,807 km' },
    { slug: 'miami', number: '04', name: 'Miami', detail: 'États-Unis · 5,412 km' },
    { slug: 'montreal', number: '05', name: 'Montréal', detail: 'Canada · 4,361 km' },
    { slug: 'monaco', number: '06', name: 'Monaco', detail: 'Monaco · 3,337 km' },
    { slug: 'barcelona', number: '07', name: 'Barcelone', detail: 'Espagne · 4,657 km' },
    { slug: 'spielberg', number: '08', name: 'Spielberg', detail: 'Autriche · 4,326 km' },
    { slug: 'silverstone', number: '09', name: 'Silverstone', detail: 'Grande-Bretagne · 5,891 km' },
    { slug: 'spa', number: '10', name: 'Spa-Francorchamps', detail: 'Belgique · 7,004 km' },
    { slug: 'hungaroring', number: '11', name: 'Hungaroring', detail: 'Hongrie · 4,381 km' },
    { slug: 'zandvoort', number: '12', name: 'Zandvoort', detail: 'Pays-Bas · 4,259 km' },
    { slug: 'monza', number: '13', name: 'Monza', detail: 'Italie · 5,793 km' },
    { slug: 'madrid', number: '14', name: 'Madrid', detail: 'Madring · 5,414 km' },
    { slug: 'baku', number: '15', name: 'Baku', detail: 'Azerbaïdjan · 6,003 km' },
    { slug: 'sepang', number: '16', name: 'Sepang', detail: 'Malaisie · 5,543 km' },
    { slug: 'singapore', number: '17', name: 'Singapour', detail: 'Marina Bay · 4,927 km' },
    { slug: 'austin', number: '18', name: 'Austin', detail: 'États-Unis · 5,513 km' },
    { slug: 'mexico', number: '19', name: 'Mexico', detail: 'Mexique · 4,304 km' },
    { slug: 'interlagos', number: '20', name: 'Interlagos', detail: 'Brésil · 4,309 km' },
    { slug: 'las-vegas', number: '21', name: 'Las Vegas', detail: 'Nevada · 6,201 km' },
    { slug: 'lusail', number: '22', name: 'Lusail', detail: 'Qatar · 5,419 km' },
    { slug: 'yas-marina', number: '23', name: 'Yas Marina', detail: 'Abou Dhabi · 5,281 km' },
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
