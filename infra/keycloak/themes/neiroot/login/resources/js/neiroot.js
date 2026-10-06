document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector('.pf-v5-c-login__main');
  const script = document.querySelector('script[src*="neiroot.js"]');
  if (main && script) {
    const brand = document.createElement('div'); brand.className = 'neiroot-brand';
    const img = document.createElement('img'); img.alt = 'NEIROOT';
    img.src = script.src.replace('js/neiroot.js', 'img/neiroot-wordmark.png');
    brand.append(img); main.prepend(brand);
  }
  const language = document.querySelector('.pf-v5-c-login__main-header-utilities');
  if (language) { language.classList.add('neiroot-language'); document.body.append(language); }
  const form = document.querySelector('#kc-register-form');
  const phone = document.querySelector('input[name="username"]');
  if (phone) {
    phone.autocomplete = form ? 'tel' : 'username';
    phone.placeholder = '+7';
    const normalize = () => { if (!phone.value.includes('@')) phone.value = phone.value.replace(/[\s()-]/g, ''); };
    const format = () => {
      if (/[a-zа-я@]/i.test(phone.value)) return;
      const raw = phone.value.replace(/[\s()-]/g, '');
      if (raw.startsWith('+') && !raw.startsWith('+7') && raw !== '+') return;
      let digits = raw.replace(/\D/g, '');
      if (digits.startsWith('8')) digits = '7' + digits.slice(1);
      if (!digits.startsWith('7')) digits = '7' + digits;
      if (digits.length > 11) return;
      const n = digits.slice(1, 11);
      phone.value = '+7' + (n.length ? ' (' + n.slice(0, 3) : '') + (n.length >= 3 ? ')' : '') + (n.length > 3 ? ' ' + n.slice(3, 6) : '') + (n.length > 6 ? '-' + n.slice(6, 8) : '') + (n.length > 8 ? '-' + n.slice(8, 10) : '');
    };
    if (form) { phone.inputMode = 'tel'; if (!phone.value) phone.value = '+7'; }
    phone.addEventListener('input', event => { if (!event.inputType?.startsWith('delete') && (form || phone.value.startsWith('+7'))) format(); });
    phone.addEventListener('blur', () => { if (phone.value && !phone.value.includes('@')) format(); });
    phone.form?.addEventListener('submit', normalize);
  }
  document.querySelectorAll('input[type="password"]').forEach(input => { input.placeholder = document.documentElement.lang.startsWith('ru') ? 'Введите пароль' : 'Enter password'; });
  document.querySelectorAll('[data-password-toggle]').forEach(button => {
    const icon = button.querySelector('i'); if (icon) icon.style.display = 'none';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7'); svg.setAttribute('aria-hidden', 'true');
    for (const d of ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0', 'M3 3l18 18']) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d);
      if (d.startsWith('M3 3')) path.classList.add('password-eye-slash'); svg.append(path);
    }
    button.append(svg);
  });
  if (!form) document.body.classList.add('neiroot-login-page');
  if (!form) return;
  const names = ['lastName', 'firstName', 'middle_name'].map(name => form.elements.namedItem(name));
  const fullName = form.elements.namedItem('full_name');
  if (names.some(input => !input) || !fullName) return;
  const group = input => input.closest('.pf-v5-c-form__group');
  const identity = document.createElement('section'), account = document.createElement('section');
  identity.className = account.className = 'neiroot-step';
  const progress = document.createElement('p'); progress.className = 'neiroot-progress'; progress.setAttribute('aria-live', 'polite');
  form.prepend(progress, identity, account);
  names.forEach(input => identity.append(group(input)));
  names[0].autocomplete = 'family-name'; names[1].autocomplete = 'given-name'; names[2].autocomplete = 'additional-name';
  names[0].required = names[1].required = true;
  names[0].maxLength = names[1].maxLength = 80; names[2].maxLength = 38;
  group(fullName).hidden = true; fullName.type = 'hidden';
  const syncName = () => { fullName.value = names.map(input => input.value.trim()).filter(Boolean).join(' '); };
  names.forEach(input => input.addEventListener('input', syncName)); syncName();
  ['username', 'email', 'password', 'password-confirm'].forEach(name => {
    const input = form.elements.namedItem(name); if (input) { input.required = true; account.append(group(input)); }
  });
  form.elements.namedItem('email').type = 'email';
  form.elements.namedItem('password').minLength = 8;
  const note = form.querySelector('.neiroot-required-note'), submit = form.querySelector('#kc-form-buttons');
  const actions = document.createElement('div'); actions.className = 'neiroot-step-actions';
  const back = document.createElement('button'), next = document.createElement('button');
  back.type = next.type = 'button'; back.className = 'neiroot-secondary'; next.className = 'pf-v5-c-button pf-m-primary';
  back.textContent = form.dataset.back; next.textContent = form.dataset.next;
  actions.append(back, next); submit.before(actions);
  let currentStep = 0;
  let submitting = false;
  const show = (step, focus = true) => {
    currentStep = step; identity.hidden = step !== 0; account.hidden = step !== 1;
    back.hidden = step === 0; next.hidden = step === 1; submit.hidden = step === 0;
    progress.textContent = step === 0 ? form.dataset.identityStep : form.dataset.accountStep;
    (step === 0 ? identity : account).append(note);
    if (focus) (step === 0 ? names[0] : phone)?.focus();
  };
  const validate = container => {
    for (const input of container.querySelectorAll('input')) {
      if (input.required && !input.value.trim()) input.value = '';
      if (!input.reportValidity()) return false;
    }
    return true;
  };
  next.addEventListener('click', () => { if (validate(identity)) { syncName(); show(1); } });
  back.addEventListener('click', () => show(0));
  form.addEventListener('submit', event => {
    if (submitting) { event.preventDefault(); return; }
    syncName();
    if (currentStep === 0) { event.preventDefault(); next.click(); return; }
    if (!validate(identity)) { event.preventDefault(); show(0); return; }
    if (!validate(account)) { event.preventDefault(); return; }
    submitting = true;
    const button = submit.querySelector('input[type="submit"],button[type="submit"]');
    button.disabled = true; button.setAttribute('aria-busy', 'true');
  });
  const identityError = identity.querySelector('[aria-invalid="true"],.pf-m-error');
  const accountError = account.querySelector('[aria-invalid="true"],.pf-m-error');
  show(!identityError && accountError ? 1 : 0, false);
});
