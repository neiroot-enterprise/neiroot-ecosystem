import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const base='https://localhost:8443';
const password='SyntheticThemeCheck!42';
async function logout(page:Page){
 const session=await (await page.request.get(base+'/api/v1/session')).json();
 const response=await page.request.post(base+'/api/auth/logout',{headers:{Origin:base,'X-CSRF-Token':session.csrfToken}});
 expect(response.status()).toBe(204);
}
test('Auth theme: two steps, real registration and phone/email login',async({page})=>{
 test.setTimeout(90000);
 // Keep the realm-scoped provisioning token outside Playwright traces.
 const config=readFileSync('../../.env','utf8');
 const secret=config.match(/^KEYCLOAK_PROVISIONER_SECRET=(.+)$/m)?.[1].trim();
 if(!secret)throw new Error('Test provisioning client configuration is missing');
 const auth=await fetch(base+'/auth/realms/neiroot/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'client_credentials',client_id:'neiroot-provisioner',client_secret:secret})});
 if(!auth.ok)throw new Error(`Test provisioning authentication failed (${auth.status})`);
 const {access_token:token}=await auth.json() as {access_token:string};
 const email=`theme-${randomUUID()}@example.test`,phone='+7'+Date.now().toString().slice(-10);
 const existingEmail='existing-'+email;
 try {
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto(base);await expect(page.locator('#kc-login')).toBeVisible();
  await expect(page.locator('#kc-header-wrapper')).toHaveCSS('background-image',/neiroot-wordmark\.png\?v=20261029-2/);
  await expect(page.getByText('Ваше рабочее экосистему',{exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Зарегистрироваться',exact:true}).click();
  await expect(page.locator('#lastName')).toBeVisible();await expect(page.locator('#username')).toBeHidden();
  await page.getByRole('button',{name:'Далее',exact:true}).click();await expect(page.locator('#lastName')).toBeFocused();
  await page.locator('#lastName').fill('Тестовая');await page.locator('#firstName').fill('Регистрация');
  await page.locator('#middle_name').fill('Проверка');
  await page.screenshot({path:'test-results/registration-step1-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Далее',exact:true}).click();await expect(page.locator('#username')).toBeFocused();
  await page.locator('#username').fill('123');await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);await page.locator('#password-confirm').fill(password);
  await page.getByRole('button',{name:'Назад',exact:true}).click();await expect(page.locator('#middle_name')).toHaveValue('Проверка');
  await page.getByRole('button',{name:'Далее',exact:true}).click();await expect(page.locator('#email')).toHaveValue(email);
  await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();await expect(page.locator('#input-error-username')).toBeVisible();
  await expect(page.locator('#username')).toHaveAttribute('autocomplete','tel');
  await expect(page.locator('#email')).toHaveValue(email);
  await page.locator('#username').fill(phone);await page.locator('#password').fill(password);await page.locator('#password-confirm').fill(password);
  await expect(page.locator('#username')).toHaveValue(/\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}/);
  await page.screenshot({path:'test-results/registration-step2-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Создайте экосистему'})).toBeVisible();
  const session=await (await page.request.get(base+'/api/v1/session')).json();
  expect(session).toMatchObject({
   fullName:'Тестовая Регистрация Проверка',firstName:'Регистрация',lastName:'Тестовая',tenants:[],
  });
  await logout(page);
  for(const username of [phone,email]) {
   await page.goto(base);await expect(page.locator('#kc-login')).toBeVisible();
   const parallel=await page.context().newPage();
   try {
    await parallel.goto(base);await expect(parallel.locator('#kc-login')).toBeVisible();
    await page.locator('#username').fill(username);await page.locator('#password').fill(password);await page.locator('#kc-login').click();
    await expect(page.getByRole('heading',{name:'Создайте экосистему'})).toBeVisible();await logout(page);
   } finally {await parallel.close()}
  }
  // Accounts provisioned with the existing single-name contract must still sign in.
  const created=await fetch(base+'/auth/admin/realms/neiroot/users',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({username:phone+'1',email:existingEmail,enabled:true,attributes:{full_name:['Тестовый Сотрудник']},credentials:[{type:'password',value:password,temporary:false}]})});
  expect(created.status).toBe(201);
  await page.goto(base);await page.locator('#username').fill(existingEmail);await page.locator('#password').fill(password);await page.locator('#kc-login').click();
  await expect(page.getByRole('heading',{name:'Создайте экосистему'})).toBeVisible();await logout(page);
 } finally {
  const headers={Authorization:`Bearer ${token}`};
  for(const cleanupEmail of [email,existingEmail]) {
  const response=await fetch(base+'/auth/admin/realms/neiroot/users?exact=true&email='+encodeURIComponent(cleanupEmail),{headers});
  if(!response.ok)throw new Error('Test account lookup failed');
  const users=await response.json() as {id:string}[];
  for(const user of users){const removed=await fetch(base+'/auth/admin/realms/neiroot/users/'+user.id,{method:'DELETE',headers});if(!removed.ok)throw new Error('Test account cleanup failed');}
  }
 }
});
test('Auth theme: narrow screen, white fields, language and back to login',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark'});
 await page.goto(base);await page.getByRole('link',{name:'Зарегистрироваться',exact:true}).click();
 await expect(page.locator('#lastName')).toBeVisible();
 expect(await page.locator('#lastName').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
 expect(await page.locator('.pf-v5-c-login__main').evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThan(300);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const title=await page.locator('#kc-page-title').boundingBox(),lang=await page.locator('#login-select-toggle').boundingBox();expect(lang!.y+lang!.height).toBeLessThan(title!.y);
 await page.locator('#lastName').fill('Тест');await page.locator('#firstName').fill('Безотчества');
 await page.locator('#firstName').press('Enter');await expect(page.locator('#username')).toBeVisible();
 await expect(page.locator('#username')).toHaveValue('+7');
 expect(await page.locator('#username').evaluate(e=>getComputedStyle(e).height)).toBe('60px');
 expect(await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(143, 195, 158)');
 await page.locator('#username').fill('+79990000000');await expect(page.locator('#username')).toHaveValue('+7 (999) 000-00-00');
 await page.locator('#username').press('Backspace');await expect(page.locator('#username')).toHaveValue('+7 (999) 000-00-0');
 await page.locator('#username').fill('+442079460123');await expect(page.locator('#username')).toHaveValue('+442079460123');
 await page.screenshot({path:'test-results/registration-step2-mobile.png',fullPage:true});
 await page.getByRole('link',{name:/Назад к логину/}).click();await expect(page.locator('#kc-login')).toBeVisible();
 await expect(page.locator('#kc-header-wrapper')).toBeVisible();
 await expect(page.locator('#username')).toHaveAttribute('placeholder','+7');
 await page.locator('#username').fill('123@example.test');await page.locator('#password').focus();await expect(page.locator('#username')).toHaveValue('123@example.test');
 await page.locator('#username').clear();
 await page.screenshot({path:'test-results/login-mobile.png',fullPage:true});
 const language=page.getByRole('button',{name:'Язык',exact:true});
 await expect(language).toHaveAccessibleDescription('Русский');
 const initialLanguageBox=await language.boundingBox();
 const initialBrandBox=await page.locator('#kc-header-wrapper').boundingBox();
 expect(initialLanguageBox?.width).toBe(128);
 await language.click();
 await expect(page.getByRole('listbox',{name:'Язык',exact:true}).getByRole('option')).toHaveText(['Английский','Русский']);
 await page.getByRole('option',{name:'Английский',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('lang',/^en/);
 await expect(page.locator('#kc-login')).toBeVisible();
 const englishLanguage=page.getByRole('button',{name:'Language',exact:true});
 await expect(englishLanguage).toHaveAccessibleDescription('English');
 const englishLanguageBox=await englishLanguage.boundingBox();
 expect(englishLanguageBox).toEqual(initialLanguageBox);
 expect(await page.locator('#kc-header-wrapper').boundingBox()).toEqual(initialBrandBox);
 await englishLanguage.click();
 await page.getByRole('option',{name:'Russian',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Авторизация',exact:true})).toBeVisible();
 expect(await page.locator('#kc-header-wrapper').boundingBox()).toEqual(initialBrandBox);
});

test('Login logo renders in place without the theme script',async({page})=>{
 await page.setViewportSize({width:390,height:900});
 await page.route('**/js/neiroot.js?*',route=>route.abort());
 await page.goto(base);
 const brand=page.locator('#kc-header-wrapper');
 await expect(brand).toHaveText('NEIROOT');
 await expect(brand).toHaveCSS('height','20px');
 await expect(brand).toHaveCSS('background-image',/neiroot-wordmark\.png/);
 const initialBox=await brand.boundingBox();
 expect(initialBox?.x).toBe(12);
 await page.unroute('**/js/neiroot.js?*');
 await page.reload();
 await expect(page.getByRole('button',{name:'Язык',exact:true})).toBeVisible();
 expect(await brand.boundingBox()).toEqual(initialBox);
});

test('Stale callback shows a recovery page and keeps the JSON error contract',async({page})=>{
 const response=await page.goto(base+'/api/auth/callback?state=invalid');expect(response?.status()).toBe(400);
 await expect(page.getByRole('heading',{name:'Повторите вход'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Войти снова'})).toHaveAttribute('href','/api/auth/login');
 expect((await page.request.get(base+'/api/auth/callback?state=invalid',{headers:{Accept:'application/json'}})).status()).toBe(400);
 await page.getByRole('link',{name:'Войти снова'}).click();await expect(page.locator('#kc-login')).toBeVisible();
});

for (const width of [1280,390]) {
 test(`Login uses the Base Nova layout and preserves field errors at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto(base);
  await expect(page.locator('#kc-login')).toBeVisible();
  await expect(page.locator('#username')).toHaveAttribute('autocomplete','username');
  await expect(page.getByRole('heading',{name:'Авторизация',exact:true})).toBeVisible();
  await expect(page.locator('#kc-page-title')).toHaveCSS('text-align','center');
  const header=page.locator('header#kc-header');
  const brand=header.getByText('NEIROOT',{exact:true});
  const language=header.getByRole('button',{name:'Язык',exact:true});
  await expect(header).toHaveCSS('height','56px');
  await expect(header).toHaveCSS('border-bottom-width','1px');
  await expect(brand).toHaveCSS('height','20px');
  await expect(page.locator('.pf-v5-c-login__main .neiroot-brand')).toHaveCount(0);
  await expect(language).toHaveCSS('height','32px');
  const theme=header.locator('.neiroot-theme-toggle');
  await expect(theme).toHaveCSS('height','32px');
  await expect(theme).toHaveAccessibleName('Включить тёмную тему');
  const headerBox=(await header.boundingBox())!, brandBox=(await brand.boundingBox())!, languageBox=(await language.boundingBox())!;
  const themeBox=(await theme.boundingBox())!;
  const inset=width>=768 ? 16 : 12;
  expect(brandBox.x-headerBox.x).toBe(inset);
  expect(headerBox.x+headerBox.width-themeBox.x-themeBox.width).toBe(inset);
  expect(themeBox.x-languageBox.x-languageBox.width).toBe(8);
  expect(themeBox.y).toBe(languageBox.y);
  await page.locator('#username').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(theme).toBeFocused();
  await page.keyboard.press('Space');
  await expect(theme).toHaveAccessibleName('Включить светлую тему');
  await expect(header).toHaveCSS('background-color','rgb(23, 28, 24)');
  await expect(page.locator('#username').locator('..')).not.toHaveCSS('background-color','rgb(255, 255, 255)');
  await page.goto(base);
  await expect(theme).toHaveAccessibleName('Включить светлую тему');
  await theme.click();
  await expect(header).toHaveCSS('background-color','rgb(255, 255, 255)');
  await theme.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(language).toBeFocused();
  await expect(language).toHaveCSS('outline-color','rgb(47, 125, 74)');
  await expect(language).toHaveCSS('outline-width','2px');
  await expect(language.locator('..')).toHaveCSS('outline-style','none');
  await page.keyboard.press('Space');
  const languageList=page.getByRole('listbox',{name:'Язык',exact:true});
  const currentLanguage=languageList.getByRole('option',{name:'Русский',exact:true});
  await expect(currentLanguage).toBeFocused();
  await expect(currentLanguage).toHaveAttribute('aria-selected','true');
  await expect(currentLanguage).toHaveCSS('background-color','rgb(232, 244, 236)');
  const englishOption=(await languageList.getByRole('option',{name:'Английский',exact:true}).boundingBox())!;
  const russianOption=(await currentLanguage.boundingBox())!;
  expect(russianOption.y-englishOption.y-englishOption.height).toBe(1);
  await expect(language).toHaveCSS('opacity','0');
  const popup=(await languageList.locator('..').boundingBox())!;
  expect(popup.y).toBeGreaterThanOrEqual(0);
  expect(popup.x+popup.width).toBeCloseTo(languageBox.x+languageBox.width,0);
  await page.screenshot({path:`test-results/login-language-${width}.png`,fullPage:true});
  await page.keyboard.press('ArrowUp');
  await expect(languageList.getByRole('option',{name:'Английский',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(languageList).toBeHidden();
  await expect(language).toBeFocused();
  await expect(language).toHaveCSS('opacity','1');
  await expect(page.locator('.pf-v5-c-login__main')).toHaveCSS('border-radius','12px');
  await expect(page.locator('.pf-v5-c-login__main')).toHaveCSS('padding','16px');
  await expect(page.locator('.pf-v5-c-login__container')).toHaveCSS('max-width','384px');
  await expect(page.locator('#kc-login')).toHaveCSS('height','40px');
  await expect(page.locator('#kc-login')).toHaveCSS('background-color','rgb(47, 125, 74)');
  await expect(page.locator('#username').locator('..')).toHaveCSS('height','40px');
  await expect(page.locator('#username')).toHaveCSS('font-size',width>=768 ? '14px' : '16px');
  await expect(page.locator('#username')).toHaveCSS('padding-inline-start','12px');
  await expect(page.locator('#password').locator('xpath=ancestor::div[contains(@class,"pf-v5-c-input-group")][last()]')).toHaveCSS('height','40px');
  await expect(page.locator('#kc-form-login')).toHaveCSS('gap','20px');
  const usernameBox=(await page.locator('#username').locator('..').boundingBox())!;
  const buttonBox=(await page.locator('#kc-login').boundingBox())!;
  expect(buttonBox.x).toBe(usernameBox.x);
  expect(buttonBox.width).toBe(usernameBox.width);
  const usernameLabel=(await page.locator('label[for="username"]').boundingBox())!;
  const passwordLabel=(await page.locator('label[for="password"]').boundingBox())!;
  const passwordBox=(await page.locator('#kc-form-login .pf-v5-c-input-group').boundingBox())!;
  expect(usernameBox.y-usernameLabel.y-usernameLabel.height).toBe(8);
  expect(passwordBox.y-passwordLabel.y-passwordLabel.height).toBe(8);
  expect(passwordLabel.y-usernameBox.y-usernameBox.height).toBe(20);
  expect(buttonBox.y-passwordBox.y-passwordBox.height).toBe(20);
  expect(await page.locator('#username').evaluate(async input=>{
   const fonts=await document.fonts.load('400 14px "Onest Variable"','Телефон Email');
   return getComputedStyle(input).fontFamily.startsWith('"Onest Variable"') && fonts.every(font=>font.status==='loaded') && fonts.length>=2;
  })).toBe(true);
  await page.locator('#username').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#password')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'Показать пароль'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#password')).toHaveAttribute('type','text');
  await page.keyboard.press('Enter');
  await expect(page.locator('#password')).toHaveAttribute('type','password');
  await page.getByRole('heading',{name:'Авторизация',exact:true}).click();
  await page.screenshot({path:`test-results/login-base-nova-${width}.png`,fullPage:true});
  expect((await page.locator('#input-error-container-username').boundingBox())!.height).toBe(0);
  await page.locator('#username').fill(`missing-${randomUUID()}@example.test`);
  await page.locator('#password').fill('IncorrectSyntheticPassword!42');
  await page.locator('#kc-login').click();
  const error=page.locator('#input-error-username');
  await expect(error).toContainText('Неправильное имя пользователя или пароль');
  await expect(page.locator('#kc-header-wrapper')).toBeVisible();
  const control=page.locator('#username').locator('..');
  const appearance=await control.evaluate(e=>({outline:getComputedStyle(e).outline,color:getComputedStyle(e).borderColor,background:getComputedStyle(e).backgroundColor}));
  expect(appearance.outline).toBe('rgb(255, 77, 80) solid 2px');
  expect(appearance.color).toBe('rgb(255, 77, 80)');expect(appearance.background).toBe('rgb(255, 255, 255)');
  const icon=await error.evaluate(e=>({width:getComputedStyle(e,'::before').width,mask:getComputedStyle(e,'::before').maskImage,gap:getComputedStyle(e).gap}));
  expect(icon.width).toBe('16px');expect(icon.mask).toContain('data:image/svg+xml');expect(icon.gap).toBe('8px');
  const fieldBox=(await control.boundingBox())!,errorBox=(await error.boundingBox())!;
  expect(errorBox.y-fieldBox.y-fieldBox.height).toBe(8);
  const nextGroup=(await page.locator('#password').locator('xpath=ancestor::div[contains(@class,"pf-v5-c-form__group")]').boundingBox())!;
  expect(nextGroup.y-errorBox.y-errorBox.height).toBe(20);
  await expect(page.locator('#neiroot-login-error')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/login-reference-error-${width}.png`,fullPage:true});
 });
}
