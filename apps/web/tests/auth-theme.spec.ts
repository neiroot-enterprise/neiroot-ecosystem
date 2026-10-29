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
 // Admin credentials are used through Node fetch, outside Playwright traces.
 const config=readFileSync('../../.env','utf8');
 const adminPassword=config.match(/^KEYCLOAK_ADMIN_PASSWORD=(.+)$/m)![1].trim();
 const auth=await fetch(base+'/auth/realms/master/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:'neiroot-local-admin',password:adminPassword})});
 if(!auth.ok)throw new Error('Test cleanup authentication failed');
 const {access_token:token}=await auth.json() as {access_token:string};
 const email=`theme-${randomUUID()}@example.test`,phone='+7'+Date.now().toString().slice(-10);
 const existingEmail='existing-'+email;
 try {
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto(base);await expect(page.locator('#kc-login')).toBeVisible();
  await expect(page.locator('.neiroot-brand img')).toBeVisible();
  await expect(page.locator('.neiroot-brand img')).toHaveAttribute('src',/neiroot-wordmark\.png\?v=20261029-2$/);
  await expect.poll(()=>page.locator('.neiroot-brand img').evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBe(381);
  await expect(page.getByText('Ваше рабочее пространство',{exact:true})).toHaveCount(0);
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
  await expect(page.getByRole('heading',{name:'Создайте пространство'})).toBeVisible();
  const session=await (await page.request.get(base+'/api/v1/session')).json();expect(session.fullName).toBe('Тестовая Регистрация Проверка');expect(session.tenants).toHaveLength(0);
  await logout(page);
  for(const username of [phone,email]) {
   await page.goto(base);await expect(page.locator('#kc-login')).toBeVisible();
   const parallel=await page.context().newPage();
   try {
    await parallel.goto(base);await expect(parallel.locator('#kc-login')).toBeVisible();
    await page.locator('#username').fill(username);await page.locator('#password').fill(password);await page.locator('#kc-login').click();
    await expect(page.getByRole('heading',{name:'Создайте пространство'})).toBeVisible();await logout(page);
   } finally {await parallel.close()}
  }
  // Accounts provisioned with the existing single-name contract must still sign in.
  const created=await fetch(base+'/auth/admin/realms/neiroot/users',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({username:phone+'1',email:existingEmail,enabled:true,attributes:{full_name:['Тестовый Сотрудник']},credentials:[{type:'password',value:password,temporary:false}]})});
  expect(created.status).toBe(201);
  await page.goto(base);await page.locator('#username').fill(existingEmail);await page.locator('#password').fill(password);await page.locator('#kc-login').click();
  await expect(page.getByRole('heading',{name:'Создайте пространство'})).toBeVisible();await logout(page);
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
 await expect(page.locator('.neiroot-brand img')).toBeVisible();
 await expect.poll(()=>page.locator('.neiroot-brand img').evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBeGreaterThan(0);
 await expect(page.locator('#username')).toHaveAttribute('placeholder','+7');
 await page.locator('#username').fill('123@example.test');await page.locator('#password').focus();await expect(page.locator('#username')).toHaveValue('123@example.test');
 await page.locator('#username').clear();
 await page.screenshot({path:'test-results/login-mobile.png',fullPage:true});
});

test('Stale callback shows a recovery page and keeps the JSON error contract',async({page})=>{
 const response=await page.goto(base+'/api/auth/callback?state=invalid');expect(response?.status()).toBe(400);
 await expect(page.getByRole('heading',{name:'Повторите вход'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Войти снова'})).toHaveAttribute('href','/api/auth/login');
 expect((await page.request.get(base+'/api/auth/callback?state=invalid',{headers:{Accept:'application/json'}})).status()).toBe(400);
 await page.getByRole('link',{name:'Войти снова'}).click();await expect(page.locator('#kc-login')).toBeVisible();
});

for (const width of [1280,390]) {
 test(`Login field error matches the compact reference at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto(base);
  await expect(page.locator('#kc-login')).toBeVisible();
  await expect(page.locator('#username')).toHaveAttribute('autocomplete','username');
  expect(await page.locator('#kc-form-login').evaluate(e=>getComputedStyle(e).gap)).toBe('28px');
  expect((await page.locator('#input-error-container-username').boundingBox())!.height).toBe(0);
  await page.locator('#username').fill(`missing-${randomUUID()}@example.test`);
  await page.locator('#password').fill('IncorrectSyntheticPassword!42');
  await page.locator('#kc-login').click();
  const error=page.locator('#input-error-username');
  await expect(error).toContainText('Неправильное имя пользователя или пароль');
  await expect(page.locator('.neiroot-brand img')).toBeVisible();
  await expect.poll(()=>page.locator('.neiroot-brand img').evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBe(381);
  const control=page.locator('#username').locator('..');
  const appearance=await control.evaluate(e=>({outline:getComputedStyle(e).outline,color:getComputedStyle(e).borderColor,background:getComputedStyle(e.querySelector('input')!).backgroundColor}));
  expect(appearance.outline).toBe('rgb(255, 77, 80) solid 2px');
  expect(appearance.color).toBe('rgb(255, 77, 80)');expect(appearance.background).toBe('rgb(255, 255, 255)');
  const icon=await error.evaluate(e=>({width:getComputedStyle(e,'::before').width,mask:getComputedStyle(e,'::before').maskImage,gap:getComputedStyle(e).gap}));
  expect(icon.width).toBe('16px');expect(icon.mask).toContain('data:image/svg+xml');expect(icon.gap).toBe('8px');
  const fieldBox=(await control.boundingBox())!,errorBox=(await error.boundingBox())!;
  expect(errorBox.y-fieldBox.y-fieldBox.height).toBe(8);
  const nextGroup=(await page.locator('#password').locator('xpath=ancestor::div[contains(@class,"pf-v5-c-form__group")]').boundingBox())!;
  expect(nextGroup.y-errorBox.y-errorBox.height).toBe(16);
  await expect(page.locator('#neiroot-login-error')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/login-reference-error-${width}.png`,fullPage:true});
 });
}
