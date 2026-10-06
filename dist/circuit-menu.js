const circuitMenu = document.querySelector('.circuit-menu');

if (circuitMenu) {
  const header = circuitMenu.closest('.masthead, .topbar');
  const garage = document.querySelector('.garage');
  const toggle = circuitMenu.querySelector('summary');

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
