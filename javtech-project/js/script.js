// Mobile hamburger menu (state + event)
const hamburger = document.querySelector('.hamburger');
const navLinks  = document.querySelector('.nav-links');

if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      navLinks.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });
}

const contactForm = document.getElementById('contactForm');

if (contactForm) {
  let pendingId;
  contactForm.addEventListener('input', () => { pendingId = undefined; });
  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!contactForm.reportValidity()) return;
    const button = contactForm.querySelector('button[type="submit"]');
    if (button.disabled) return;
    const status = document.getElementById('formStatus');
    const fields = Object.fromEntries(new FormData(contactForm));
    pendingId ||= crypto.randomUUID();
    const inputs = [...contactForm.querySelectorAll('input, textarea')];
    inputs.forEach(input => { input.readOnly = true; });
    button.disabled = true;
    contactForm.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    status.textContent = 'Sending…';
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, id: pendingId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) {
        status.textContent = result.error || 'Unable to send. Please try again.';
        return;
      }
      contactForm.reset();
      pendingId = undefined;
      status.textContent = 'Your message has been received. Thank you!';
    } catch (error) {
      status.textContent = error.name === 'AbortError'
        ? 'The request timed out. Please try again.'
        : 'Unable to send your message. Check your details and connection, then try again.';
    } finally {
      clearTimeout(timeout);
      inputs.forEach(input => { input.readOnly = false; });
      contactForm.removeAttribute('aria-busy');
      button.disabled = false;
    }
  });
}
