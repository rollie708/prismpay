const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('.mobile-menu');
const flowButton = document.querySelector('#flow-button');
const paymentPanel = document.querySelector('#payment-panel');

const setScrolled = () => header?.classList.toggle('scrolled', window.scrollY > 12);
setScrolled();
window.addEventListener('scroll', setScrolled, { passive: true });

menuToggle?.addEventListener('click', () => {
  const open = mobileMenu.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.querySelector('b').textContent = open ? 'Close menu' : 'Open menu';
});
mobileMenu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  mobileMenu.classList.remove('open');
  menuToggle?.setAttribute('aria-expanded', 'false');
}));

flowButton?.addEventListener('click', () => {
  const expanded = flowButton.getAttribute('aria-expanded') === 'true';
  flowButton.setAttribute('aria-expanded', String(!expanded));
  flowButton.querySelector('span').textContent = expanded ? '↓' : '↑';
  flowButton.firstChild.textContent = expanded ? 'Explore Example Flow ' : 'Example Flow Revealed ';
  paymentPanel?.classList.toggle('revealed', !expanded);
});

// Keep the example interface intentionally local and illustrative: no wallet, quote, or transaction calls are made.
