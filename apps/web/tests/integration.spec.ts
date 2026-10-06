import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const base='https://localhost:8443';
const password='NeirootSyntheticTest!42';
type Person={lastName:string;firstName:string;middleName:string;fullName:string;phone:string;email:string};
function person(label:string):Person {const n=Date.now().toString().slice(-8)+Math.floor(Math.random()*100).toString().padStart(2,'0');return {lastName:"Тест",firstName:label,middleName:"",fullName:`Тест ${label}`,phone:`+7${n}`,email:`${label.toLowerCase()}-${randomUUID()}@example.test`}}
async function signup(page:Page,p:Person,invite?:string){
 await page.goto(invite||base);await page.getByRole('link',{name:'Зарегистрироваться',exact:true}).click();
 await expect(page.locator('#lastName')).toBeVisible();await page.screenshot({path:'test-results/keycloak-registration.png'});
 const [lastName,...given]=p.fullName.split(' ');await page.locator('#lastName').fill(lastName);await page.locator('#firstName').fill(given.join(' '));await page.getByRole('button',{name:'Далее',exact:true}).click();
 await page.locator('#username').fill(`${p.phone.slice(0,2)} (${p.phone.slice(2,5)}) ${p.phone.slice(5)}`);
 await page.locator('#email').fill(p.email);
 await page.locator('#password').fill(password);await page.locator('#password-confirm').fill(password);
 await page.locator('input[type="submit"],button[type="submit"]').last().click();
 await expect(page).toHaveURL(invite?/\/invite$/:/^https:\/\/localhost:8443\/$/);
}
async function login(page:Page,username:string){await page.goto(base);await page.locator('#username').fill(username);await page.locator('#password').fill(password);await page.locator('#kc-login').click();await expect(page.getByRole('heading',{name:'Сотрудники',exact:true})).toBeVisible()}
async function api(page:Page,path:string,method='GET',data?:unknown,key?:string){const session=await (await page.request.get(`${base}/api/v1/session`)).json();return page.request.fetch(base+path,{method,data,headers:{Origin:base,'X-CSRF-Token':session.csrfToken||'',...(key?{'Idempotency-Key':key}:{})}})}
async function session(page:Page){return (await page.request.get(`${base}/api/v1/session`)).json()}
async function inviteEmployee(page:Page,tenant:string,p:Person,role='user'){const key=randomUUID();const {fullName,...parts}=p;const payload={...parts,role,mode:'invite'};const res=await api(page,`/api/v1/tenants/${tenant}/employees`,'POST',payload,key);expect(res.status()).toBe(201);const result=await res.json();const retry=await api(page,`/api/v1/tenants/${tenant}/employees`,'POST',payload,key);expect((await retry.json()).employee.id).toBe(result.employee.id);return result}
const token=(link:string)=>new URLSearchParams(new URL(link).hash.slice(1)).get('token')!;

test('Real Keycloak + PostgreSQL: registration, credentials, invitations, roles and tenant isolation',async({browser})=>{
 test.setTimeout(180000);const contexts:BrowserContext[]=[];
 const page=async()=>{const c=await browser.newContext();contexts.push(c);return c.newPage()};
 try{
 const owner=person('OwnerA'),other=person('OwnerB'),invited=person('Invited'),direct=person('Direct');
 const a=await page();await signup(a,owner);await a.getByLabel('Название пространства').fill('Тест A');await a.getByRole('button',{name:'Создать пространство',exact:true}).click();await expect(a.getByRole('heading',{name:'Сотрудники',exact:true})).toBeVisible();
 const sa=await session(a),ta=sa.activeTenantId;expect(sa.tenants[0].role).toBe('owner');expect(sa.phone).toBe(owner.phone);expect(sa.fullName).toBe(owner.fullName);
 const repeat=await api(a,'/api/v1/onboarding','POST',{name:'Повтор'});expect((await repeat.json()).id).toBe(ta);
 const cookies=await a.context().cookies();const sid=cookies.find(c=>c.name==='__Host-neiroot')!;expect(sid.httpOnly&&sid.secure).toBe(true);expect(sid.value).toMatch(/^[a-f0-9]{64}$/);
 if(process.env.NEIROOT_TEST_CORE_URL)expect((await a.request.get(process.env.NEIROOT_TEST_CORE_URL+'/api/v1/me')).status()).toBe(401);
 const noCSRF=await a.request.post(base+'/api/v1/session/tenant',{data:{tenantId:ta},headers:{Origin:base}});expect(noCSRF.status()).toBe(403);
 // Create a permanent-password account through the real form and Admin API.
 await a.getByRole('link',{name:'Добавить сотрудника',exact:true}).first().click();await a.getByLabel('Фамилия *',{exact:true}).fill(direct.lastName);await a.getByLabel('Имя *',{exact:true}).fill(direct.firstName);await a.getByLabel('Телефон *',{exact:true}).fill(direct.phone);await a.getByLabel('Email *',{exact:true}).fill(direct.email);await a.getByText('Задать пароль',{exact:true}).click();await a.getByLabel('Пароль *',{exact:true}).fill(password);await a.getByRole('button',{name:'Создать сотрудника',exact:true}).click();await expect(a.getByRole('heading',{name:'Карточка сотрудника',exact:true})).toBeVisible();
 const directID=a.url().split('/').pop()!;
 // Concurrent retries must converge on one card and the same Keycloak account.
 const concurrentPerson=person('Concurrent'),concurrentKey=randomUUID();
 const {fullName:concurrentDisplay,...concurrentParts}=concurrentPerson;const concurrentBody={...concurrentParts,mode:'password',role:'user',password};
 const concurrent=await Promise.all([api(a,`/api/v1/tenants/${ta}/employees`,'POST',concurrentBody,concurrentKey),api(a,`/api/v1/tenants/${ta}/employees`,'POST',concurrentBody,concurrentKey)]);
 expect(concurrent.map(response=>response.status())).toEqual([201,201]);
 const concurrentResults=await Promise.all(concurrent.map(response=>response.json()));expect(concurrentResults[0].employee.id).toBe(concurrentResults[1].employee.id);expect(concurrentResults.every(result=>result.employee.accessState==='active')).toBe(true);
 const d=await page();await login(d,direct.phone);expect((await session(d)).tenants[0].role).toBe('user');
 const e=await page();await login(e,direct.email);
 const forbidden=await api(d,`/api/v1/tenants/${ta}/employees`,'POST',{lastName:'Тест',firstName:'Denied',phone:person('Denied').phone,email:person('Denied').email,role:'admin',mode:'invite'},randomUUID());expect(forbidden.status()).toBe(403);expect((await forbidden.json()).requestId).toMatch(/^[a-f0-9-]{36}$/);
 expect((await api(d,`/api/v1/tenants/${ta}/employees/${directID}/role`,'PATCH',{role:'admin'})).status()).toBe(403);
 // New user registers on an invitation and joins without creating a separate tenant.
 const created=await inviteEmployee(a,ta,invited);expect((await api(a,'/api/v1/invitations/accept','POST',{token:token(created.invitationUrl)})).status()).toBe(403);const i=await page();await signup(i,invited,created.invitationUrl);await i.getByRole('button',{name:'Принять приглашение',exact:true}).click();await expect(i.getByRole('heading',{name:'Сотрудники',exact:true})).toBeVisible();expect((await session(i)).tenants).toHaveLength(1);
 expect((await api(i,'/api/v1/invitations/accept','POST',{token:token(created.invitationUrl)})).status()).toBe(200);
 // An existing owner joins a second tenant by invitation without global credential changes.
 const b=await page();await signup(b,other);await b.getByLabel('Название пространства').fill('Тест B');await b.getByRole('button',{name:'Создать пространство',exact:true}).click();await expect(b.getByRole('heading',{name:'Сотрудники',exact:true})).toBeVisible();const tb=(await session(b)).activeTenantId;
 expect((await api(a,`/api/v1/tenants/${ta}/employees`,'POST',{...other,mode:'password',role:'user',password:'DifferentSynthetic!42'},randomUUID())).status()).toBe(409);
 // The rejected provision left a recoverable card: reissue a link for that card.
 const pending=(await (await api(a,`/api/v1/tenants/${ta}/employees?search=${encodeURIComponent(other.email)}`)).json()).items[0];
 const existingLink=(await (await api(a,`/api/v1/tenants/${ta}/employees/${pending.id}/invitation`,'POST')).json()).invitationUrl;
 await b.goto(existingLink);await b.getByRole('button',{name:'Принять приглашение',exact:true}).click();await expect(b.getByRole('heading',{name:'Сотрудники',exact:true})).toBeVisible();expect((await session(b)).tenants).toHaveLength(2);
 await b.getByLabel('Рабочее пространство',{exact:true}).selectOption(ta);await expect(b.getByText('Команда пространства «Тест A»')).toBeVisible();await expect(b.locator('a.employee-name').filter({hasText:direct.fullName})).toBeVisible();
 await b.getByLabel('Рабочее пространство',{exact:true}).selectOption(tb);await expect(b.getByText('Команда пространства «Тест B»')).toBeVisible();await expect(b.locator('a.employee-name').filter({hasText:direct.fullName})).toHaveCount(0);
 expect((await api(a,`/api/v1/tenants/${tb}/employees`)).status()).toBe(403);expect((await api(b,`/api/v1/tenants/${tb}/employees/${directID}`)).status()).toBe(404);
 const ownerCard=(await (await api(a,`/api/v1/tenants/${ta}/employees?search=${encodeURIComponent(owner.email)}`)).json()).items[0];expect((await api(a,`/api/v1/tenants/${ta}/employees/${ownerCard.id}/role`,'PATCH',{role:'user'})).status()).toBe(403);
 await a.goto(base+`/company/employees/${directID}`);await a.getByLabel('Роль сотрудника',{exact:true}).selectOption('admin');await a.getByRole('button',{name:'Сохранить роль',exact:true}).click();await expect(a.getByRole('status')).toContainText('Роль сохранена');
 const next=await inviteEmployee(d,ta,person('AdminCreated'));expect(next.employee.role).toBe('user');expect((await session(d)).tenants[0].role).toBe('admin');
 // Reissue invalidates the previous link; revoke prevents acceptance.
 const reissued=await api(a,`/api/v1/tenants/${ta}/employees/${next.employee.id}/invitation`,'POST');const link=(await reissued.json()).invitationUrl;
 expect((await api(a,'/api/v1/invitations/resolve','POST',{token:token(next.invitationUrl)})).status()).toBe(410);
 expect((await api(a,`/api/v1/tenants/${ta}/employees/${next.employee.id}/invitation`,'DELETE')).status()).toBe(204);expect((await api(a,'/api/v1/invitations/resolve','POST',{token:token(link)})).status()).toBe(410);
 await a.screenshot({path:'test-results/integrated-employee-card.png',fullPage:true});
 }finally{for(const c of contexts)await c.close()}
});

test('Keycloak registration on narrow screen, validation and keyboard',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(base);await page.getByRole('link',{name:'Зарегистрироваться',exact:true}).click();await expect(page.locator('#lastName')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#lastName').fill('Тест');await page.locator('#firstName').fill('формы');await page.getByRole('button',{name:'Далее',exact:true}).click();
 await page.locator('#username').fill('123');await page.locator('#email').fill('synthetic@example.test');await page.locator('#password').fill(password);await page.locator('#password-confirm').fill(password);await page.locator('input[type="submit"],button[type="submit"]').last().click();await expect(page.locator('#input-error-username')).toBeVisible();
 await page.locator('#username').focus();await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('BODY');await page.screenshot({path:'test-results/keycloak-mobile.png',fullPage:true});
 expect((await page.request.get(base+'/api/auth/callback?state=invalid')).status()).toBe(400);
});

test('Native runtime: Keycloak outage, idempotent recovery and persistence across restart',async({browser})=>{
 test.skip(process.env.NEIROOT_NATIVE_FAULT_TEST!=='1','Only runs against the explicitly managed isolated native environment');test.setTimeout(240000);
 const context=await browser.newContext(),a=await context.newPage();const owner=person('FailureOwner'),employee=person('Recovery');let paused=false;
 const script=(name:string)=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('../../scripts/'+name)],{timeout:180000,stdio:'ignore',windowsHide:true});
 const restart=()=>{script('stop-test-runtime.ps1');script('start-test-runtime.ps1');paused=false};
 try{
 await signup(a,owner);await a.getByLabel('Название пространства').fill('Тест сбоя');await a.getByRole('button',{name:'Создать пространство',exact:true}).click();await expect(a.getByRole('heading',{name:'Сотрудники',exact:true})).toBeVisible();const t=(await session(a)).activeTenantId,key=randomUUID(),body={lastName:employee.lastName,firstName:employee.firstName,middleName:employee.middleName,phone:employee.phone,email:employee.email,mode:'password',role:'user',password};
 script('stop-test-keycloak.ps1');paused=true;
 const failed=await api(a,`/api/v1/tenants/${t}/employees`,'POST',body,key);expect(failed.status()).toBe(503);expect((await failed.json()).code).toBe('identity_unavailable');
 const pending=(await (await api(a,`/api/v1/tenants/${t}/employees?search=${encodeURIComponent(employee.email)}`)).json()).items;expect(pending).toHaveLength(1);expect(pending[0].accessState).toBe('error');
 expect((await api(a,`/api/v1/tenants/${t}/employees`,'POST',body,key)).status()).toBe(503);
 restart();expect((await session(a)).activeTenantId).toBe(t);
 const recovered=await api(a,`/api/v1/tenants/${t}/employees`,'POST',body,key);expect(recovered.status()).toBe(201);const result=await recovered.json();expect(result.employee.id).toBe(pending[0].id);expect(result.employee.accessState).toBe('active');
 const retry=await api(a,`/api/v1/tenants/${t}/employees`,'POST',{...body,password:'ChangedSynthetic!42'},key);expect((await retry.json()).employee.id).toBe(result.employee.id);
 const c=await browser.newContext();try{const loginPage=await c.newPage();await login(loginPage,employee.email)}finally{await c.close()}
 expect((await api(a,'/api/auth/logout','POST')).status()).toBe(204);expect((await session(a)).authenticated).toBe(false);
 }finally{if(paused)restart();await context.close()}
});
