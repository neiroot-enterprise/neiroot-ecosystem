import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

const base='https://localhost:8443',password='CatalogSynthetic!42';
const sql=(query:string)=>execFileSync('docker',['compose','exec','-T','postgres','psql','-U','postgres','-d','core','-At','-v','ON_ERROR_STOP=1'],{cwd:'../..',input:query,encoding:'utf8',windowsHide:true}).trim();
test('Real company UI: tree, assignments, organizations, archive, access and mobile',async({browser})=>{
 test.setTimeout(300000);
 const adminPassword=readFileSync('../../.env','utf8').match(/^KEYCLOAK_ADMIN_PASSWORD=(.+)$/m)![1].trim();
 const token=async()=>{const r=await fetch(base+'/auth/realms/master/protocol/openid-connect/token',{method:'POST',body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:'neiroot-local-admin',password:adminPassword})});if(!r.ok)throw Error('Setup authentication failed');return (await r.json() as {access_token:string}).access_token};
 const ids:string[]=[],contexts:Awaited<ReturnType<typeof browser.newContext>>[]=[];let tenant='';
 const account=async(label:string)=>{
  const email=`catalog-${randomUUID()}@example.test`,phone='+7'+(Date.now()+ids.length).toString().slice(-10);
  const r=await fetch(base+'/auth/admin/realms/neiroot/users',{method:'POST',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify({username:phone,email,enabled:true,firstName:label,lastName:'Тест',attributes:{full_name:[`Тест ${label}`]},credentials:[{type:'password',value:password,temporary:false}]})});
  if(r.status!==201)throw Error('Synthetic account creation failed');ids.push(r.headers.get('location')!.split('/').pop()!);return {email,phone};
 };
 const login=async(page:Page,email:string)=>{await page.goto(base);await page.locator('#username').fill(email);await page.locator('#password').fill(password);await page.locator('#kc-login').click()};
 const call=async(page:Page,path:string,method='GET',data?:unknown,key?:string)=>{const s=await(await page.request.get(base+'/api/v1/session')).json();return page.request.fetch(base+path,{method,data,headers:{Origin:base,'X-CSRF-Token':s.csrfToken||'',...(key?{'Idempotency-Key':key}:{})}})};
 const create=async(page:Page,path:string,data:unknown)=>{const r=await call(page,path,'POST',data,randomUUID());expect(r.status(),await r.text()).toBe(201);return r.json()};
 try{
  const owner=await account('Владелец'),context=await browser.newContext({viewport:{width:1440,height:1200}});contexts.push(context);const page=await context.newPage();page.setDefaultTimeout(15000);await login(page,owner.email);
  await page.getByLabel('Название экосистемы').fill('Тест структуры');await page.getByRole('button',{name:'Создать экосистему',exact:true}).click();await expect(page.getByRole('heading',{name:'Сотрудники',exact:true})).toBeVisible();tenant=(await(await page.request.get(base+'/api/v1/session')).json()).activeTenantId;const api=`/api/v1/tenants/${tenant}`;
  const ownerEmployee=(await(await call(page,api+'/employees')).json()).items[0];
  await page.goto(base+'/company/businesses');await page.getByRole('button',{name:'Добавить предприятие',exact:true}).click();await page.getByLabel('Наименование',{exact:true}).fill('Производство');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('heading',{name:'Производство',exact:true})).toBeVisible();const business=page.url().split('/').pop()!,bp=api+'/businesses/'+business;
  const row=(name:string)=>page.locator('.department-row').filter({has:page.getByText(name,{exact:true})});
  const indentation=async(parent:string,child:string,step:number)=>{
   await expect.poll(async()=>{const p=await row(parent).boundingBox(),c=await row(child).boundingBox();return p&&c?Math.round(c.x-p.x):-1}).toBe(step);
   const p=(await row(parent).boundingBox())!,c=(await row(child).boundingBox())!;
   expect(p.width-c.width).toBeCloseTo(step,0);expect(p.x+p.width).toBeCloseTo(c.x+c.width,0);
   const pm=(await row(parent).locator('.department-menu-trigger').boundingBox())!,cm=(await row(child).locator('.department-menu-trigger').boundingBox())!;expect(pm.x).toBeCloseTo(cm.x,0);
  };
  const department=async(name:string,parent?:string)=>{if(parent){await row(parent).locator('.department-menu-trigger').click();await row(parent).getByRole('menuitem',{name:'Добавить подотдел',exact:true}).click()}else await page.getByRole('button',{name:'Добавить отдел',exact:true}).click();await page.getByLabel('Наименование',{exact:true}).fill(name);await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.locator('.department-title').getByText(name,{exact:true})).toBeVisible()};
  await department('Дирекция');await department('Разработка','Дирекция');await department('Продажи');
  const leafName='Тестирование и контроль качества производственных процессов';
  await department(leafName,'Разработка');await department('Операционный отдел','Дирекция');
  const tree=(await(await call(page,bp+'/departments?status=all')).json()).items,director=tree.find((d:any)=>d.name==='Дирекция'),development=tree.find((d:any)=>d.name==='Разработка'),sales=tree.find((d:any)=>d.name==='Продажи');expect(development.parentId).toBe(director.id);
  const leaf=tree.find((d:any)=>d.name===leafName);
  await indentation('Дирекция','Разработка',24);await indentation('Разработка',leafName,24);
  await expect(row(leafName).locator('..').locator('.department-guide')).toHaveCount(1);
  await expect(row('Операционный отдел').locator('..').locator('.department-branch')).toHaveClass(/last/);
  await page.screenshot({path:'test-results/department-tree-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await indentation('Дирекция','Разработка',16);await indentation('Разработка',leafName,16);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/department-tree-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1200});
  await row('Разработка').getByRole('button',{name:'Свернуть Разработка',exact:true}).click();await expect(row(leafName)).toHaveCount(0);await row('Разработка').getByRole('button',{name:'Развернуть Разработка',exact:true}).click();
  await row('Дирекция').getByRole('button',{name:'Свернуть Дирекция',exact:true}).click();await expect(row('Разработка')).toHaveCount(0);await expect(row(leafName)).toHaveCount(0);
  expect((await call(page,bp+`/departments/${leaf.id}/archive`,'POST')).status()).toBe(200);
  await page.reload();await row('Дирекция').getByRole('button',{name:'Свернуть Дирекция',exact:true}).click();await page.getByRole('combobox',{name:/Состояние/}).selectOption('archived');
  await expect(row(leafName).locator('.department-parent-path')).toHaveText('В составе: Дирекция / Разработка');await expect(row(leafName).locator('..').locator('.department-branch')).toHaveCount(0);
  await page.screenshot({path:'test-results/department-tree-archive.png',fullPage:true});await page.getByRole('combobox',{name:/Состояние/}).selectOption('all');await expect(row(leafName)).toHaveCount(0);await row('Дирекция').getByRole('button',{name:'Развернуть Дирекция',exact:true}).click();await indentation('Разработка',leafName,24);
  expect((await call(page,bp+`/departments/${leaf.id}/restore`,'POST',{})).status()).toBe(200);await page.reload();
  await row('Разработка').locator('.department-menu-trigger').click();await row('Разработка').getByRole('menuitem',{name:'На уровень выше',exact:true}).click();await expect.poll(async()=>((await(await call(page,bp+'/departments')).json()).items.find((d:any)=>d.id===development.id)).parentId).toBeNull();
  const rootPosition=(await row('Разработка').boundingBox())!,otherRoot=(await row('Дирекция').boundingBox())!;expect(rootPosition.x).toBeCloseTo(otherRoot.x,0);expect(rootPosition.width).toBeCloseTo(otherRoot.width,0);await indentation('Разработка',leafName,24);
  await row('Разработка').locator('.drag-handle').dragTo(row('Продажи').locator('.department-title'),{targetPosition:{x:180,y:20}});
  await expect.poll(async()=>((await(await call(page,bp+'/departments')).json()).items.find((d:any)=>d.id===development.id)).parentId).toBe(sales.id);
  await indentation('Продажи','Разработка',24);await indentation('Разработка',leafName,24);expect(((await(await call(page,bp+'/departments')).json()).items.find((d:any)=>d.id===leaf.id)).parentId).toBe(development.id);
  expect((await call(page,bp+`/departments/${sales.id}/move`,'POST',{parentId:development.id,beforeId:null})).status()).toBe(422);
  await row('Продажи').locator('.department-menu-trigger').click();await row('Продажи').getByRole('menuitem',{name:'Переименовать',exact:true}).click();await page.getByLabel('Наименование',{exact:true}).fill('Коммерческий отдел');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByText('Коммерческий отдел',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Сотрудники',exact:true}).first().click();await page.getByRole('button',{name:'Назначить сотрудника',exact:true}).click();await page.getByRole('dialog').getByLabel('Поиск сотрудников').fill(owner.email);await page.getByRole('button',{name:'Выбрать',exact:true}).click();await expect(page.getByRole('link',{name:ownerEmployee.fullName,exact:true})).toBeVisible();
  expect((await call(page,bp+`/departments/${development.id}/employees/${ownerEmployee.id}`,'PUT')).status()).toBe(204);expect((await(await call(page,api+`/employees/${ownerEmployee.id}/assignments`)).json()).items).toHaveLength(2);
  // Real employee-card editor: lazy trees, paging, archives and atomic saves.
  const assignmentPath=api+`/employees/${ownerEmployee.id}/assignments`;
  const auxiliary=await create(page,api+'/businesses',{name:'Дополнительный бизнес'});
  const auxiliaryDepartment=await create(page,api+`/businesses/${auxiliary.id}/departments`,{name:'Склад',parentId:null});
  const archivedDepartment=await create(page,bp+'/departments',{name:'Архивный отдел',parentId:null});
  expect((await call(page,bp+`/departments/${archivedDepartment.id}/employees/${ownerEmployee.id}`,'PUT')).status()).toBe(204);
  expect((await call(page,bp+`/departments/${archivedDepartment.id}/archive`,'POST')).status()).toBe(200);
  for(let i=0;i<25;i++)await create(page,api+'/businesses',{name:`Тест пагинации ${i.toString().padStart(2,'0')}`});
  expect((await call(page,assignmentPath,'PATCH',{add:[{businessId:business}],remove:[]})).status()).toBe(422);
  expect((await call(page,assignmentPath,'PATCH',{add:[{businessId:business,departmentId:auxiliaryDepartment.id}],remove:[]})).status()).toBe(404);
  expect((await call(page,assignmentPath,'PATCH',{add:[{businessId:business,departmentId:null}],remove:[{businessId:business,departmentId:null}]})).status()).toBe(422);
  await page.goto(base+`/company/employees/${ownerEmployee.id}`);
  const assignmentPanel=page.locator('.employee-assignments'),editor=page.getByRole('dialog',{name:'Предприятия и отделы сотрудника'});
  const edit=async()=>{await assignmentPanel.getByRole('button',{name:'Изменить',exact:true}).click();await expect(editor).toBeVisible()};
  const findBusiness=async(name:string)=>{await editor.getByLabel('Поиск предприятий').fill(name);await expect(editor.getByRole('checkbox',{name,exact:true})).toBeVisible()};
  const expand=async(name:string)=>{await editor.getByRole('button',{name:`Отделы предприятия «${name}»`,exact:true}).click()};
  await expect(assignmentPanel.getByText('Без привязки к отделу',{exact:true})).toHaveCount(0);
  await edit();await findBusiness('Производство');await expand('Производство');
  await expect(editor.getByRole('checkbox',{name:'Архивный отдел',exact:true})).toBeChecked();await expect(editor.getByRole('checkbox',{name:'Архивный отдел',exact:true})).toBeDisabled();
  await editor.getByRole('checkbox',{name:'Разработка',exact:true}).uncheck();await editor.getByRole('checkbox',{name:'Коммерческий отдел',exact:true}).check();
  await findBusiness('Дополнительный бизнес');await expand('Дополнительный бизнес');
  await editor.getByRole('checkbox',{name:'Склад',exact:true}).focus();await page.keyboard.press('Space');
  await expect(editor.getByRole('checkbox',{name:'Дополнительный бизнес',exact:true})).toBeChecked();
  await expand('Дополнительный бизнес');await expand('Дополнительный бизнес');await expect(editor.getByRole('checkbox',{name:'Склад',exact:true})).toBeChecked();
  await editor.getByLabel('Поиск предприятий').fill('');await expect(editor.getByRole('button',{name:'Далее',exact:true})).toBeEnabled();await editor.getByRole('button',{name:'Далее',exact:true}).click();await expect(editor.getByRole('checkbox',{name:'Производство',exact:true})).toBeChecked();
  await editor.getByRole('button',{name:'Назад',exact:true}).click();await findBusiness('Дополнительный бизнес');await expect(editor.getByRole('checkbox',{name:'Склад',exact:true})).toBeChecked();
  await page.screenshot({path:'test-results/assignments-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/assignments-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1200});
  // A transport failure keeps the draft; the retry uses the real API.
  await page.route(base+assignmentPath,route=>route.request().method()==='PATCH'?route.abort('failed'):route.continue());
  await editor.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(editor.getByRole('alert')).toBeVisible();await expect(editor.getByRole('checkbox',{name:'Склад',exact:true})).toBeChecked();await page.unroute(base+assignmentPath);
  await editor.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(editor).toHaveCount(0);
  expect((await(await call(page,assignmentPath+'?status=all')).json()).items).toHaveLength(5);
  await page.reload();await expect(assignmentPanel.getByRole('link',{name:'Дополнительный бизнес',exact:true})).toBeVisible();await expect(assignmentPanel.getByText('Архивный отдел',{exact:true})).toBeVisible();
  // Discarding a draft leaves both active and archived assignments untouched.
  await edit();await findBusiness('Производство');await editor.getByRole('checkbox',{name:'Производство',exact:true}).uncheck();await expect(editor.getByRole('note')).toContainText('включая архивные');
  await editor.getByRole('checkbox',{name:'Производство',exact:true}).check();await expand('Производство');await expect(editor.getByRole('checkbox',{name:'Архивный отдел',exact:true})).toBeChecked();await editor.getByRole('checkbox',{name:'Производство',exact:true}).uncheck();
  page.once('dialog',dialog=>dialog.dismiss());await page.keyboard.press('Escape');await expect(editor).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());await editor.getByRole('button',{name:'Отмена',exact:true}).click();await expect(editor).toHaveCount(0);expect((await(await call(page,assignmentPath+'?status=all')).json()).items).toHaveLength(5);
  // Removing the last active department keeps enterprise membership.
  await edit();await findBusiness('Дополнительный бизнес');await expand('Дополнительный бизнес');await editor.getByRole('checkbox',{name:'Склад',exact:true}).uncheck();await expect(editor.getByRole('checkbox',{name:'Дополнительный бизнес',exact:true})).toBeChecked();await editor.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(editor).toHaveCount(0);await expect(assignmentPanel.getByText('Без привязки к отделу',{exact:true})).toHaveCount(1);
  // Excluding a business cascades through archived departments as well.
  await edit();await findBusiness('Производство');await editor.getByRole('checkbox',{name:'Производство',exact:true}).uncheck();await findBusiness('Дополнительный бизнес');await editor.getByRole('checkbox',{name:'Дополнительный бизнес',exact:true}).uncheck();await editor.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(editor).toHaveCount(0);await expect(assignmentPanel.getByText('Назначений пока нет',{exact:true})).toBeVisible();
  expect((await(await call(page,assignmentPath+'?status=all')).json()).items).toHaveLength(0);
  await edit();await findBusiness('Производство');await expand('Производство');await editor.getByRole('checkbox',{name:'Разработка',exact:true}).check();await editor.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(editor).toHaveCount(0);expect((await(await call(page,assignmentPath+'?status=all')).json()).items).toHaveLength(2);
  await page.goto(base+'/company/organizations');await page.getByRole('button',{name:'Добавить организацию',exact:true}).click();await page.getByLabel('Наименование',{exact:true}).fill('Организация теста');await page.getByLabel('ИНН',{exact:true}).fill('7707083893');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('heading',{name:'Организация теста',exact:true})).toBeVisible();const organization=page.url().split('/').pop()!;
  await page.getByRole('button',{name:'Связать предприятие',exact:true}).click();await page.getByRole('dialog').getByLabel('Поиск',{exact:true}).fill('Производство');await page.getByRole('button',{name:'Выбрать',exact:true}).click();await expect(page.getByRole('link',{name:'Производство',exact:true})).toBeVisible();
  const second=await create(page,api+'/businesses',{name:'Второе предприятие'});expect((await call(page,api+`/organizations/${organization}/businesses/${second.id}`,'PUT')).status()).toBe(204);const org2=await create(page,api+'/organizations',{name:'Вторая организация',inn:'500100732259'});expect((await call(page,bp+`/organizations/${org2.id}`,'PUT')).status()).toBe(204);expect((await call(page,api+'/organizations','POST',{name:'Неверный',inn:'7707083894'},randomUUID())).status()).toBe(422);
  await page.goto(base+'/company/businesses/'+business);await page.getByRole('button',{name:'В архив',exact:true}).first().click();await page.getByRole('button',{name:'Архивировать',exact:true}).click();await expect(page.getByText('В архиве · Только просмотр')).toBeVisible();expect((await call(page,bp+`/departments/${development.id}/employees/${ownerEmployee.id}`,'PUT')).status()).toBe(409);
  await create(page,api+'/businesses',{name:'Производство'});await page.getByRole('button',{name:'Восстановить',exact:true}).click();await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Наименование уже занято');await page.getByLabel('Наименование',{exact:true}).fill('Восстановленное производство');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await expect(page.getByRole('heading',{name:'Восстановленное производство',exact:true})).toBeVisible();expect((await(await call(page,bp+'/organizations')).json()).total).toBe(2);
  const user=await account('Участник'),invitation=await create(page,api+'/employees',{lastName:'Тест',firstName:'Участник',middleName:'',phone:user.phone,email:user.email,role:'user',mode:'invite'});const userContext=await browser.newContext();contexts.push(userContext);const userPage=await userContext.newPage();await login(userPage,user.email);await userPage.goto(invitation.invitationUrl);await userPage.getByRole('button',{name:'Принять приглашение',exact:true}).click();await expect(userPage.getByRole('heading',{name:'Сотрудники',exact:true})).toBeVisible();await userPage.goto(base+'/company/businesses/'+business);await expect(userPage.getByRole('heading',{name:'Восстановленное производство',exact:true})).toBeVisible();await expect(userPage.getByRole('button',{name:'Добавить отдел',exact:true})).toHaveCount(0);expect((await call(userPage,bp,'PATCH',{name:'Запрещено'})).status()).toBe(403);
  await userPage.goto(base+`/company/employees/${ownerEmployee.id}`);await expect(userPage.locator('.employee-assignments').getByRole('heading',{name:'Предприятия и отделы',exact:true})).toBeVisible();await expect(userPage.locator('.employee-assignments').getByRole('button',{name:'Изменить',exact:true})).toHaveCount(0);expect((await call(userPage,assignmentPath,'PATCH',{add:[],remove:[]})).status()).toBe(403);
  expect((await call(page,bp+`/employees/${ownerEmployee.id}`,'DELETE')).status()).toBe(204);expect((await(await call(page,api+`/employees/${ownerEmployee.id}/assignments?status=all`)).json()).items).toHaveLength(0);
  await page.goto(base+'/company/businesses/'+business);await expect(page.getByRole('heading',{name:'Восстановленное производство',exact:true})).toBeVisible();
  // The same move must work with keyboard controls, without pointer dragging.
  await row('Разработка').locator('.department-menu-trigger').focus();await page.keyboard.press('Enter');await row('Разработка').getByRole('menuitem',{name:'Переместить…',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('dialog').getByLabel('Новый родитель').focus();await page.keyboard.press('Home');await page.keyboard.press('Tab');await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toHaveCount(0);await expect.poll(async()=>((await(await call(page,bp+'/departments')).json()).items.find((d:any)=>d.id===development.id)).parentId).toBeNull();
  expect((await call(page,bp+`/departments/${development.id}/move`,'POST',{})).status()).toBe(422);
  const actions=row('Разработка').getByRole('button',{name:'Действия отдела Разработка',exact:true});
  const before=await row('Разработка').boundingBox();await actions.click();const menu=page.getByRole('menu',{name:'Действия отдела Разработка',exact:true});await expect(menu).toBeVisible();expect((await row('Разработка').boundingBox())!.height).toBe(before!.height);await page.screenshot({path:'test-results/department-menu-desktop.png',fullPage:true});await page.keyboard.press('Escape');await expect(menu).not.toBeVisible();await expect(actions).toBeFocused();
  await actions.focus();await page.keyboard.press('ArrowDown');await expect(menu.getByRole('menuitem',{name:'Сотрудники',exact:true})).toBeFocused();await page.keyboard.press('End');await expect(menu.getByRole('menuitem',{name:'В архив',exact:true})).toBeFocused();await page.keyboard.press('Home');await expect(menu.getByRole('menuitem',{name:'Сотрудники',exact:true})).toBeFocused();await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/catalog-mobile.png',fullPage:true});await actions.click();await expect(menu).toBeVisible();const menuBounds=await menu.boundingBox();expect(menuBounds!.x).toBeGreaterThanOrEqual(0);expect(menuBounds!.x+menuBounds!.width).toBeLessThanOrEqual(390);expect(menuBounds!.y+menuBounds!.height).toBeLessThanOrEqual(844);await page.screenshot({path:'test-results/department-menu-mobile.png',fullPage:true});await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/catalog-desktop.png',fullPage:true});
  // The same action menu is used in the department directory and closes outside.
  await page.goto(base+`/company/businesses/departments?business=${business}`);await row('Разработка').getByRole('button',{name:'Действия отдела Разработка',exact:true}).click();await expect(menu).toBeVisible();await page.getByRole('heading',{name:'Отделы',exact:true}).click();await expect(menu).not.toBeVisible();
  await indentation('Разработка',leafName,24);
  // Deep trees retain every level and scroll inside the tree, not the page.
  let deepParent:string|null=null;
  for(let level=0;level<=14;level++){const item=await create(page,bp+'/departments',{name:`Глубокая структура ${level}`,parentId:deepParent});deepParent=item.id}
  await page.reload();await page.setViewportSize({width:390,height:844});await indentation('Глубокая структура 13','Глубокая структура 14',16);
  const scroller=page.getByRole('region',{name:'Дерево отделов',exact:true});await expect.poll(()=>scroller.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await row('Глубокая структура 14').boundingBox())!.width).toBeGreaterThanOrEqual(220);
  await scroller.evaluate(el=>{el.scrollLeft=el.scrollWidth});await row('Глубокая структура 14').getByRole('button',{name:'Действия отдела Глубокая структура 14',exact:true}).click();await expect(page.getByRole('menu',{name:'Действия отдела Глубокая структура 14',exact:true})).toBeVisible();await page.keyboard.press('Escape');
 }finally{
  for(const context of contexts)await context.close();
  if(tenant){if(!/^[a-f0-9-]{36}$/.test(tenant))throw Error('Invalid cleanup tenant');sql(`BEGIN;DELETE FROM company.catalog_requests WHERE tenant_id='${tenant}';DELETE FROM company.business_organizations WHERE tenant_id='${tenant}';DELETE FROM company.department_employees WHERE tenant_id='${tenant}';DELETE FROM company.business_employees WHERE tenant_id='${tenant}';DELETE FROM company.departments WHERE tenant_id='${tenant}';DELETE FROM company.businesses WHERE tenant_id='${tenant}';DELETE FROM company.organizations WHERE tenant_id='${tenant}';DELETE FROM settings.invitations WHERE tenant_id='${tenant}';DELETE FROM settings.memberships WHERE tenant_id='${tenant}';DELETE FROM company.employees WHERE tenant_id='${tenant}';DELETE FROM settings.tenants WHERE id='${tenant}';COMMIT;`)}
  for(const id of ids){const r=await fetch(base+'/auth/admin/realms/neiroot/users/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+await token()}});if(!r.ok)throw Error('Synthetic account cleanup failed')}
 }
});
