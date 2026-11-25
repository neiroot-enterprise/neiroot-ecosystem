import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base='https://localhost:8443';
const password='NavigationSynthetic!42';
const initial={modules:['company','money','sales','settings'],sections:{company:['structure','businesses','employees','organizations','contracts','counterparties','partners'],money:['cash','banks','loans','payroll'],sales:['invoices','acts','catalog'],settings:['fields','access']}};
const sql=(query:string)=>execFileSync('docker',['compose','exec','-T','postgres','psql','-U','postgres','-d','core','-At','-v','ON_ERROR_STOP=1'],{cwd:'../..',input:query,encoding:'utf8',windowsHide:true}).trim();

test('Real personal navigation: persistence, browser gestures, accounts, ecosystems, CSRF and API validation',async({browser})=>{
  test.setTimeout(240000);
  const secret=readFileSync('../../.env','utf8').match(/^KEYCLOAK_PROVISIONER_SECRET=(.+)$/m)![1].trim();
  const token=async()=>{
    const response=await fetch(base+'/auth/realms/neiroot/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'client_credentials',client_id:'neiroot-provisioner',client_secret:secret})});
    if(!response.ok)throw Error('Synthetic account setup authentication failed');
    return ((await response.json()) as {access_token:string}).access_token;
  };
  const accounts:{id:string;email:string}[]=[],tenants:string[]=[];
  const contexts:Awaited<ReturnType<typeof browser.newContext>>[]=[];
  const account=async(label:string)=>{
    const email=`navigation-${randomUUID()}@example.test`;
    const phone='+7'+(Date.now()+accounts.length).toString().slice(-10);
    const response=await fetch(base+'/auth/admin/realms/neiroot/users',{method:'POST',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify({username:phone,email,enabled:true,firstName:label,lastName:'Тест',attributes:{full_name:[`Тест ${label}`]},credentials:[{type:'password',value:password,temporary:false}]})});
    if(response.status!==201)throw Error('Synthetic account creation failed');
    const value={id:response.headers.get('location')!.split('/').pop()!,email};accounts.push(value);return value;
  };
  const login=async(email:string)=>{
    const context=await browser.newContext({viewport:{width:1280,height:900}});contexts.push(context);const page=await context.newPage();
    await page.goto(base);await page.locator('#username').fill(email);await page.locator('#password').fill(password);await page.locator('#kc-login').click();
    await expect(page).toHaveURL(/^https:\/\/localhost:8443\/(company\/employees)?$/);
    return page;
  };
  const call=async(page:Page,path:string,method='GET',body?:unknown)=>{
    const session=await(await page.request.get(base+'/api/v1/session')).json();
    return page.request.fetch(base+path,{method,data:body,headers:{Origin:base,'X-CSRF-Token':session.csrfToken}});
  };
  try {
    const a=await account('МенюА'),b=await account('МенюБ');
    const page=await login(a.email);
    const created=await call(page,'/api/v1/onboarding','POST',{name:'Synthetic navigation A'});expect(created.status(),await created.text()).toBe(201);
    const ta=(await created.json()).id;tenants.push(ta);
    const other=await login(b.email);
    const createdB=await call(other,'/api/v1/onboarding','POST',{name:'Synthetic navigation B'});expect(createdB.status(),await createdB.text()).toBe(201);
    const tb=(await createdB.json()).id;tenants.push(tb);
    const path=(id:string)=>`/api/v1/tenants/${id}/me/navigation`;
    expect(await(await call(page,path(ta))).json()).toEqual(initial);
    expect((await call(other,path(ta))).status()).toBe(403);
    expect((await call(other,path(ta)+'/modules','PUT',{items:initial.modules})).status()).toBe(403);
    sql(`INSERT INTO settings.memberships(tenant_id,employee_id,subject,email,role) VALUES('${ta}','${randomUUID()}','${b.id}','${b.email}','user');`);
    await call(page,'/api/v1/session/tenant','POST',{tenantId:ta});
    await page.goto(base+'/company/employees');
    const source=page.locator('[data-move-list="company"][data-move-id="employees"]');await expect(source).toBeEnabled();
    await source.press('Space');await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Порядок меню сохранён.');
    const company=['employees','structure','businesses','organizations','contracts','counterparties','partners'];
    expect((await(await call(page,path(ta))).json()).sections.company).toEqual(company);
    const savedModules=['settings','company','sales','money'];
    const savedSales=['catalog','acts','invoices'];
    const results=await Promise.all([call(page,path(ta)+'/modules','PUT',{items:savedModules}),call(page,path(ta)+'/modules/sales/sections','PUT',{items:savedSales})]);
    results.forEach(response=>expect(response.status()).toBe(200));
    const stored=await(await call(page,path(ta))).json();
    expect(stored).toEqual({modules:savedModules,sections:{...initial.sections,company,sales:savedSales}});
    expect(await(await call(other,path(ta))).json()).toEqual(initial);
    expect(await(await call(other,path(tb))).json()).toEqual(initial);
    expect((await call(other,path(ta)+'/modules/money/sections','PUT',{items:['payroll','cash','banks','loans']})).status()).toBe(200);
    expect((await(await call(other,path(tb))).json()).sections.money).toEqual(initial.sections.money);
    const device=await login(a.email);await device.goto(base+'/company/employees');
    await expect(device.locator('[data-move-list="company"][data-move-id="employees"]')).toBeEnabled();
    expect(await device.locator('[data-nav-list="modules"]').evaluateAll(elements=>elements.map(el=>el.getAttribute('data-nav-id')))).toEqual(savedModules);
    expect(await device.locator('[data-nav-list="company"]').evaluateAll(elements=>elements.map(el=>el.getAttribute('data-nav-id')))).toEqual(company);
    expect((await call(device,path(ta)+'/modules','PUT',{items:['money','company','sales','settings']})).status()).toBe(200);
    await page.reload();await expect(source).toBeEnabled();
    expect(await page.locator('[data-nav-list="modules"]').evaluateAll(elements=>elements.map(el=>el.getAttribute('data-nav-id')))).toEqual(['money','company','sales','settings']);
    for(const items of [[],['company','company'],['unknown']])expect((await call(page,path(ta)+'/modules','PUT',{items})).status()).toBe(422);
    expect((await call(page,path(ta)+'/modules/company/sections','PUT',{items:['catalog']})).status()).toBe(422);
    expect((await call(page,path(ta)+'/modules/unknown/sections','PUT',{items:['catalog']})).status()).toBe(422);
    expect((await call(page,path(ta)+'/modules','PUT',{items:initial.modules,subject:b.id})).status()).toBe(400);
    const csrf=await page.request.put(base+path(ta)+'/modules',{data:{items:initial.modules},headers:{Origin:base}});expect(csrf.status()).toBe(403);
    expect((await call(page,path(tb))).status()).toBe(403);
    await page.goto(base+'/company/catalog');await expect(page).toHaveURL(/\/sales\/catalog$/);
    await page.screenshot({path:'test-results/navigation-real-desktop.png',animations:'disabled'});
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('[data-move-list]')).toHaveCount(0);
    await page.screenshot({path:'test-results/navigation-real-mobile.png',animations:'disabled'});
  } finally {
    for(const context of contexts)await context.close();
    for(const tenant of tenants){if(!/^[a-f0-9-]{36}$/.test(tenant))throw Error('Invalid synthetic cleanup tenant');sql(`BEGIN;DELETE FROM settings.invitations WHERE tenant_id='${tenant}';DELETE FROM settings.memberships WHERE tenant_id='${tenant}';DELETE FROM company.employees WHERE tenant_id='${tenant}';DELETE FROM settings.tenants WHERE id='${tenant}';COMMIT;`);}
    for(const {id} of accounts){const response=await fetch(base+'/auth/admin/realms/neiroot/users/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+await token()}});if(!response.ok)throw Error('Synthetic account cleanup failed');}
  }
});
