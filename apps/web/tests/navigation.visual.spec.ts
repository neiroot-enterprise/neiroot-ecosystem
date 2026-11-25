import { test, expect, type Page } from '@playwright/test';

const initial = {
  modules: ['company','money','sales','settings'],
  sections: {company:['structure','businesses','employees','organizations','contracts','counterparties','partners'], money:['cash','banks','loans','payroll'], sales:['invoices','acts','catalog'],settings:['fields','access']} as Record<string,string[]>,
};
const first = '11111111-1111-4111-8111-111111111111', second = '33333333-3333-4333-8333-333333333333';
async function setup(page: Page) {
  let active = first;
  const orders: Record<string, typeof initial> = {};
  const writes: {list:string;items:string[]}[] = [];
  const control = { failSave: false, failRead: false, delay: 0, orders, writes };
  await page.route(/^http:\/\/127\.0\.0\.1:5173\/api\//, async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if(path === '/api/v1/session') return route.fulfill({json:{authenticated:true,subject:'navigation-owner',fullName:'Тест Меню',firstName:'Меню',lastName:'Тест',email:'navigation@example.test',phone:'+79990000001',csrfToken:'synthetic',activeTenantId:active,tenants:[{id:first,name:'Тестовая экосистема с длинным названием',role:'user'},{id:second,name:'Другая экосистема',role:'user'}]}});
    if(path === '/api/v1/session/tenant') {active=request.postDataJSON().tenantId;return route.fulfill({status:204});}
    if(path.includes('/me/navigation')) {
      const tenant=path.split('/')[4];
      const current=orders[tenant]??=structuredClone(initial);
      if(request.method()==='GET') {
        if(control.failRead)return route.fulfill({status:503,json:{code:'unavailable',message:'Недоступно',requestId:'synthetic'}});
        return route.fulfill({json:current});
      }
      const list=path.endsWith('/sections')?path.split('/').at(-2)!:'modules';
      const items=request.postDataJSON().items as string[];
      writes.push({list,items});
      if(control.delay)await new Promise(resolve=>setTimeout(resolve,control.delay));
      if(control.failSave)return route.fulfill({status:503,json:{code:'unavailable',message:'Недоступно',requestId:'synthetic'}});
      if(list==='modules')current.modules=items;else current.sections[list]=items;
      return route.fulfill({json:{items}});
    }
    if(path.endsWith('/employees'))return route.fulfill({json:{items:[],total:0,limit:25,offset:0}});
    return route.fulfill({status:403,json:{code:'forbidden',message:'Запрещено',requestId:'synthetic'}});
  });
  return control;
}
const moduleIds = (page:Page) => page.locator('[data-nav-list="modules"]').evaluateAll(items=>items.map(item=>item.getAttribute('data-nav-id')));
const sectionIds = (page:Page,module='company') => page.locator(`[data-nav-list="${module}"]`).evaluateAll(items=>items.map(item=>item.getAttribute('data-nav-id')));
const handle = (page:Page,list:string,id:string) => page.locator(`[data-move-list="${list}"][data-move-id="${id}"]`);
async function keyboardMove(page:Page,list:string,id:string,key:string,finish='Enter') {
  const source=handle(page,list,id);await source.focus();await source.press('Space');await page.keyboard.press(key);await page.keyboard.press(finish);
}

test('navigation: defaults, keyboard, independent persistence, rollback, catalog and tenant switch',async({page})=>{
  const state=await setup(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/company\/employees$/);
  await expect(handle(page,'modules','company')).toBeEnabled();
  expect(await moduleIds(page)).toEqual(initial.modules);
  expect(await sectionIds(page)).toEqual(initial.sections.company);
  state.delay=250;
  await keyboardMove(page,'modules','company','ArrowDown');
  await expect(handle(page,'modules','company')).toBeDisabled();
  await expect.poll(()=>moduleIds(page)).toEqual(['money','company','sales','settings']);
  await expect(handle(page,'modules','company')).toBeEnabled();
  await keyboardMove(page,'company','employees','ArrowUp');
  await expect.poll(()=>state.writes.length).toBe(2);
  await expect(handle(page,'company','employees')).toBeEnabled();
  expect(await sectionIds(page)).toEqual(['structure','employees','businesses','organizations','contracts','counterparties','partners']);
  await expect(page).toHaveURL(/\/company\/employees$/);
  await page.reload();await expect(handle(page,'company','employees')).toBeEnabled();
  expect(await moduleIds(page)).toEqual(['money','company','sales','settings']);
  expect((await sectionIds(page))[1]).toBe('employees');
  const count=state.writes.length;
  await keyboardMove(page,'company','employees','ArrowDown','Escape');
  expect(state.writes.length).toBe(count);
  expect((await sectionIds(page))[1]).toBe('employees');
  state.failSave=true;
  await keyboardMove(page,'modules','company','ArrowUp');
  await expect(page.getByRole('alert')).toContainText('Восстановлен предыдущий порядок');
  expect(await moduleIds(page)).toEqual(['money','company','sales','settings']);
  state.failSave=false;
  await page.goto('/company/catalog?view=test#position');
  await expect(page).toHaveURL(/\/sales\/catalog\?view=test#position$/);
  await expect(page.getByRole('heading',{level:1,name:'Номенклатура'})).toBeVisible();
  expect(await sectionIds(page,'sales')).toEqual(initial.sections.sales);
  const ecosystem=page.getByRole('combobox',{name:'Экосистема',exact:true});
  await ecosystem.fill('Другая');await ecosystem.press('ArrowDown');await ecosystem.press('Enter');
  await expect(page).toHaveURL(/\/company\/employees$/);
  await expect(handle(page,'modules','company')).toBeEnabled();
  expect(await moduleIds(page)).toEqual(initial.modules);
});

test('navigation: native pointer transfer, module boundaries, compact icons and keyboard',async({page})=>{
  const state=await setup(page);await page.goto('/company/employees');
  await expect(handle(page,'modules','sales')).toBeEnabled();
  await handle(page,'modules','sales').dragTo(page.locator('[data-nav-list="modules"][data-nav-id="company"]'),{targetPosition:{x:15,y:2}});
  await expect.poll(()=>moduleIds(page)).toEqual(['sales','company','money','settings']);
  await expect(handle(page,'modules','sales')).toBeEnabled();
  await expect(page).toHaveURL(/\/company\/employees$/);
  await handle(page,'company','partners').dragTo(page.locator('[data-nav-list="company"][data-nav-id="structure"]'),{targetPosition:{x:15,y:2}});
  await expect.poll(()=>sectionIds(page)).toEqual(['partners','structure','businesses','employees','organizations','contracts','counterparties']);
  await expect(handle(page,'company','partners')).toBeEnabled();
  const writes=state.writes.length;
  await page.getByRole('button',{name:'Деньги',exact:true}).click();
  const data=await page.evaluateHandle(()=>new DataTransfer());
  await handle(page,'money','cash').dispatchEvent('dragstart',{dataTransfer:data});
  await page.getByRole('button',{name:'Моя экосистема',exact:true}).dispatchEvent('drop',{dataTransfer:data});
  await handle(page,'money','cash').dispatchEvent('dragend',{dataTransfer:data});
  expect(state.writes.length).toBe(writes);
  await page.keyboard.press('Control+b');
  const icon=page.locator('[data-module-button="settings"]');
  await icon.dragTo(page.locator('[data-nav-list="modules"][data-nav-id="sales"]'),{targetPosition:{x:12,y:2}});
  await expect.poll(()=>moduleIds(page)).toEqual(['settings','sales','company','money']);
  await expect(icon).toHaveAttribute('draggable','true');
  await expect.poll(()=>state.writes.length).toBe(writes+1);
  await expect(page.getByRole('status')).toHaveText('Порядок меню сохранён.');
  await icon.focus();await icon.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await expect.poll(()=>moduleIds(page)).toEqual(['sales','settings','company','money']);
  await expect(page.getByRole('status')).toHaveText('Порядок меню сохранён.');
  await page.locator('[data-module-button="company"]').click();
  await expect(page).toHaveURL(/\/company\/partners$/);
  await page.keyboard.press('Control+b');
  await page.setViewportSize({width:1280,height:360});
  const scroller=page.locator('[data-slot="sidebar-content"]');
  await scroller.evaluate(element=>element.scrollTop=0);
  const scrollData=await page.evaluateHandle(()=>new DataTransfer());
  const scrollSource=handle(page,'company','structure');
  await scrollSource.dispatchEvent('dragstart',{dataTransfer:scrollData});
  const bounds=(await scroller.boundingBox())!;
  await page.locator('[data-nav-list="company"][data-nav-id="structure"]').dispatchEvent('dragover',{dataTransfer:scrollData,clientY:bounds.y+bounds.height-3});
  await expect.poll(()=>scroller.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  await scrollSource.dispatchEvent('dragend',{dataTransfer:scrollData});
  await page.setViewportSize({width:1280,height:900});
});

test('navigation: loading retry, future sections, themes and mobile read-only order',async({page})=>{
  const state=await setup(page);state.failRead=true;
  await page.goto('/company/employees');
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить');
  await expect(handle(page,'modules','company')).toBeDisabled();
  state.failRead=false;
  state.orders[first]={modules:['sales','company','money','settings'],sections:{...initial.sections,company:['employees','removed']}};
  await page.getByRole('button',{name:'Повторить',exact:true}).click();
  await expect(handle(page,'modules','company')).toBeEnabled();
  expect(await sectionIds(page)).toEqual(['employees','structure','businesses','organizations','contracts','counterparties','partners']);
  for(const theme of ['light','dark']) {
    await page.evaluate(theme=>localStorage.setItem('neiroot-theme',theme),theme);await page.reload();
    await expect(handle(page,'modules','company')).toBeEnabled();
    await page.screenshot({path:`test-results/navigation-desktop-${theme}.png`,animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('[data-move-list]')).toHaveCount(0);
    expect(await moduleIds(page)).toEqual(['sales','company','money','settings']);
    await expect(page.locator('[data-module-button][draggable="true"]')).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Меню профиля',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/navigation-mobile-${theme}.png`,animations:'disabled'});
    await page.getByRole('link',{name:'Структура экосистемы',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Структура экосистемы',level:1})).toBeVisible();
    await page.setViewportSize({width:1280,height:900});
  }
});
