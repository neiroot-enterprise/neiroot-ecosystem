function enhanceLanguageSelect(select, label) {
  select.setAttribute('aria-label', label);
  if (!('showPopover' in HTMLElement.prototype) || select.options.length < 2) return;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'neiroot-language-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-expanded', 'false');

  const current = document.createElement('span');
  current.id = 'neiroot-language-current';
  current.className = 'neiroot-language-value';
  current.textContent = select.selectedOptions[0].textContent;
  trigger.setAttribute('aria-describedby', current.id);

  const popup = document.createElement('div');
  popup.id = 'neiroot-language-popup';
  popup.className = 'neiroot-language-popup';
  popup.popover = 'auto';
  trigger.setAttribute('aria-controls', popup.id);

  const title = document.createElement('div');
  title.className = 'neiroot-language-label';
  title.textContent = label;
  const list = document.createElement('div');
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label);

  const options = Array.from(select.options, (option, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'neiroot-language-option';
    item.tabIndex = -1;
    item.textContent = option.textContent;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(option.selected));
    item.addEventListener('click', () => {
      popup.hidePopover();
      trigger.focus();
      if (index === select.selectedIndex) return;
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    list.append(item);
    return item;
  });

  trigger.append(current);
  popup.append(title, list);
  select.parentElement.hidden = true;
  select.closest('.neiroot-language').append(trigger, popup);

  function open() {
    if (popup.matches(':popover-open')) return;
    const anchor = trigger.getBoundingClientRect();
    popup.style.right = `${document.documentElement.clientWidth - anchor.right}px`;
    popup.showPopover({ source: trigger });
    const selected = options[select.selectedIndex];
    const offset = selected.getBoundingClientRect().top - popup.getBoundingClientRect().top;
    const alignedTop = anchor.top + (anchor.height - selected.offsetHeight) / 2 - offset;
    popup.style.top = `${Math.max(4, Math.min(alignedTop, window.innerHeight - popup.offsetHeight - 4))}px`;
    selected.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', open);
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    }
  });
  popup.addEventListener('beforetoggle', event => {
    trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
  });
  list.addEventListener('keydown', event => {
    const index = options.indexOf(document.activeElement);
    switch (event.key) {
      case 'ArrowDown': options[(index + 1) % options.length].focus(); break;
      case 'ArrowUp': options[(index - 1 + options.length) % options.length].focus(); break;
      case 'Home': options[0].focus(); break;
      case 'End': options[options.length - 1].focus(); break;
      case 'Escape':
        popup.hidePopover();
        trigger.focus();
        break;
      default: return;
    }
    event.preventDefault();
  });
  popup.addEventListener('focusout', event => {
    if (event.relatedTarget && !popup.contains(event.relatedTarget) && popup.matches(':popover-open')) {
      popup.hidePopover();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector('.pf-v5-c-login__main');
  const script = document.querySelector('script[src*="neiroot.js"]');
  const header = document.querySelector('#kc-form-login') ? document.querySelector('#kc-header') : null;

  if (!header && main && script) {
    const brand = document.createElement('div');
    brand.className = 'neiroot-brand';
    const img = document.createElement('img');
    img.alt = 'NEIROOT';
    img.src = new URL('../img/neiroot-wordmark.png?v=20261029-2', script.src).href;
    brand.append(img);
    main.prepend(brand);
  }
  const language = document.querySelector('.pf-v5-c-login__main-header-utilities');
  if (language) {
    language.classList.add('neiroot-language');
    (header ?? document.body).append(language);
    if (header) {
      const label = document.documentElement.lang.startsWith('ru') ? 'Язык' : 'Language';
      const select = language.querySelector('select');
      if (select) enhanceLanguageSelect(select, label);
    }
  }

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
