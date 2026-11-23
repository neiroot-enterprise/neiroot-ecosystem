import { TableColumnMenu, useTableColumns } from '@/shared/ui/table-column-menu';
import { ListHeader } from '@/shared/ui/list-header';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ListPagination } from '@/shared/ui/list-pagination';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import {useEffect,useRef,useState,type CSSProperties,type DragEvent} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Link,useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import {api,canManage,type Tenant,type EmployeeList} from '../../shared/api/client';
import {CatalogButton, CatalogInput, CatalogPanel, CatalogModal as Modal} from './catalog-ui';
import {ChevronDown, ChevronRight, GripVertical} from 'lucide-react';
import './catalog.css';
import {Table, TableHeader, TableBody, TableRow, TableHead, TableCell} from '@/shared/ui/table';
import {Badge} from '@/shared/ui/badge';
import {Button} from '@/shared/ui/button';
import {ArrowRight, Building2, Plus} from 'lucide-react';
import type {components} from '../../shared/api/schema.gen';
import {Busy,ErrorMessage,ActionsMenu} from '../../shared/ui/components';

type Item=components['schemas']['CatalogItem'];
type ItemList=components['schemas']['CatalogList'];
type Assignment=components['schemas']['AssignmentView'];
type Assignments=components['schemas']['AssignmentList'];
type Kind='businesses'|'organizations';
type Dirty=(dirty:boolean)=>void;
const noop:Dirty=()=>{};
const root=(tenant:Tenant)=>`/api/v1/tenants/${tenant.id}`;
const title=(kind:Kind)=>kind==='businesses'?'Предприятия':'Организации';
function useData<T>(tenant:Tenant,path:string,keepPrevious=false){return useQuery({queryKey:['catalog',tenant.id,path],queryFn:()=>api<T>(root(tenant)+path),placeholderData:(previous,previousQuery)=>keepPrevious&&previousQuery?.queryKey[1]===tenant.id?previous:undefined})}
function useAction(tenant:Tenant){
 const client=useQueryClient();
 return useMutation({mutationFn:({path,method='POST',data,key}:{path:string;method?:string;data?:unknown;key?:string})=>api<Item>(root(tenant)+path,{method,headers:key?{'Idempotency-Key':key}:undefined,body:data===undefined?undefined:JSON.stringify(data)}),onSuccess:async()=>{await client.invalidateQueries({queryKey:['catalog',tenant.id]})}});
}
function QueryError({error,retry}:{error:unknown;retry:()=>void}){return error?<><ErrorMessage error={error}/><CatalogButton className="button" onClick={retry}>Повторить</CatalogButton></>:null}

export function CatalogPage({tenant,kind,onDirty}:{tenant:Tenant;kind:Kind;onDirty:Dirty}){
 const location=useLocation(),id=location.pathname.split('/')[3];
 return <div className="enterprise-ui">{kind==='businesses'&&id==='departments'?<DepartmentDirectory tenant={tenant} onDirty={onDirty}/>:id?<CatalogCard key={`${kind}:${id}`} tenant={tenant} kind={kind} id={id} onDirty={onDirty}/>:<CatalogList key={kind} tenant={tenant} kind={kind} onDirty={onDirty}/>}</div>;
}
function CatalogList({tenant,kind,onDirty}:{tenant:Tenant;kind:Kind;onDirty:Dirty}){
 const navigate=useNavigate();const[search,setSearch]=useState(''),[status,setStatus]=useState('active'),[offset,setOffset]=useState(0),[creating,setCreating]=useState(false),[pageSize,setPageSize]=useState(25);
 const organization=kind==='organizations',singular=organization?'организацию':'предприятие',plural=organization?'организаций':'предприятий';
 const columnSettings = useTableColumns(kind);
 const statusColumn = { id: 'status', label: 'Состояние' };
 const toggleColumns = organization ? [{ id: 'inn', label: 'ИНН' }, statusColumn] : [statusColumn];
 const showInn = organization && !columnSettings.hidden.includes('inn');
 const showStatus = !columnSettings.hidden.includes('status');
 const query=useData<ItemList>(tenant,`/${kind}?status=${status}&limit=${pageSize}&offset=${offset}&search=${encodeURIComponent(search)}`,true),action=useAction(tenant);
 return <section className={kind==='businesses'?'catalog-directory':undefined}><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><h1 className="tracking-tight">{title(kind)}</h1><p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{title(kind)} экосистемы «{tenant.name}»</p></div>{canManage(tenant.role)&&<Button onClick={()=>setCreating(true)}><Plus/>Добавить {singular}</Button>}</div>
 {kind==='businesses'&&<CatalogTabs/>}
 <CatalogPanel size="sm" className="enterprise-list">
  <div className="pt-(--card-spacing)">
   <ListHeader
    title={`Список ${plural}`}
    description={query.data ? `Всего ${plural}: ${query.data.total}` : `Поиск и управление ${organization ? 'организациями' : 'предприятиями'}`}
    search={search}
    searchLabel={`Поиск ${plural}`}
    placeholder={organization ? 'Наименование или ИНН' : 'Наименование'}
    onSearchChange={value => { setSearch(value); setOffset(0); }}
    filters={
     <div className="flex items-center gap-2">
      <ArchiveFilter variant="default" value={status} onChange={value => { setStatus(value); setOffset(0); }} />
      <div className={organization ? "hidden sm:block" : undefined}>
       <TableColumnMenu columns={toggleColumns} {...columnSettings} />
      </div>
     </div>
    }
   />
  </div>
 <QueryError error={query.error} retry={()=>void query.refetch()}/>{query.isPending?<Busy/>:query.data&&<><Table className={kind==='organizations'?"hidden table-fixed sm:table":"table-fixed"}><TableHeader><TableRow><TableHead>Наименование</TableHead>{showInn&&<TableHead className="w-28 sm:w-36">ИНН</TableHead>}{showStatus&&<TableHead className="w-24 sm:w-28">Состояние</TableHead>}<TableHead className="w-10 sm:w-12"><span className="sr-only">Карточка</span></TableHead></TableRow></TableHeader><TableBody>{query.data.items.map(item=><TableRow key={item.id}><TableCell className="whitespace-normal"><Link className="flex items-center gap-3 font-medium hover:text-primary" to={`/company/${kind}/${item.id}`}><Building2 className="hidden size-8 shrink-0 rounded-lg bg-muted p-1.5 text-muted-foreground sm:block"/><span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.name}</span></Link></TableCell>{showInn&&<TableCell className="tabular-nums whitespace-normal break-all">{item.inn}</TableCell>}{showStatus&&<TableCell><CatalogStatusBadge archived={item.archived}/></TableCell>}<TableCell><Button variant="ghost" size="icon-sm" render={<Link to={`/company/${kind}/${item.id}`} aria-label={`Открыть ${singular} ${item.name}`}/>}><ArrowRight/></Button></TableCell></TableRow>)}</TableBody></Table>{kind==='organizations'&&<div className="sm:hidden">{query.data.items.map(item=><div key={item.id} className="flex items-center gap-3 border-b px-4 py-3"><div className="min-w-0 flex-1"><Link className="font-medium break-words [overflow-wrap:anywhere] hover:text-primary" to={`/company/organizations/${item.id}`}>{item.name}</Link><p className="mt-1 text-xs text-muted-foreground tabular-nums">ИНН {item.inn}</p><CatalogStatusBadge archived={item.archived} className="mt-2"/></div><Button variant="ghost" size="icon-sm" render={<Link to={`/company/organizations/${item.id}`} aria-label={`Открыть организацию ${item.name}`}/>}><ArrowRight/></Button></div>)}</div>}{!query.data.items.length&&<p className="empty">{search?'Ничего не найдено':status==='archived'?'Архив пуст':'Список пока пуст'}</p>}{query.data.items.length>0&&<ListPagination keepFooterVisible pageIndex={Math.floor(offset/pageSize)} pageSize={pageSize} pageCount={Math.ceil(query.data.total/pageSize)} fetching={query.isFetching} pageSizeLabel={`Количество ${plural} на странице`} onPageChange={page=>setOffset(page*pageSize)} onPageSizeChange={size=>{setPageSize(size);setOffset(0)}}/>}</>}
 </CatalogPanel>{creating&&<NameDialog title={`Добавить ${singular}`} organization={organization} onDirty={onDirty} onClose={()=>setCreating(false)} onSave={async(data,key)=>{const item=await action.mutateAsync({path:`/${kind}`,data,key});onDirty(false);setCreating(false);navigate(`/company/${kind}/${item.id}`)}}/>}</section>;
}
function CatalogStatusBadge({ archived, className = "" }: { archived: boolean; className?: string }) {
 const colors = archived
  ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
  : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300";

 return <Badge variant="secondary" className={`${colors} ${className}`}>{archived ? "В архиве" : "Действует"}</Badge>;
}

function Pages({total,offset,onChange}:{total:number;offset:number;onChange:(n:number)=>void}){return <div className="pagination"><span>Всего: {total}</span><div><CatalogButton className="button" disabled={!offset} onClick={()=>onChange(Math.max(0,offset-25))}>Назад</CatalogButton><span>{Math.floor(offset/25)+1}</span><CatalogButton className="button" disabled={offset+25>=total} onClick={()=>onChange(offset+25)}>Далее</CatalogButton></div></div>}
function ArchiveFilter({value,onChange,variant='compact'}:{value:string;onChange:(s:string)=>void;variant?:'compact'|'default'}){
 const items=[{value:'active',label:'Действующие'},{value:'archived',label:'Архив'},{value:'all',label:'Все'}];
 const standard=variant==='default';
 const options=items.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>);
 const select=<Select items={items} value={value} onValueChange={next=>{if(next)onChange(next)}}>
  <SelectTrigger size={standard?'default':'sm'} className={standard?'w-fit data-[size=default]:h-8 aria-expanded:opacity-0':'w-40'} aria-label="Состояние">{standard?<span className="grid"><SelectValue className="col-start-1 row-start-1"/>{items.map(item=><span key={item.value} aria-hidden="true" className="invisible col-start-1 row-start-1">{item.label}</span>)}</span>:<SelectValue/>}</SelectTrigger>
  <SelectContent align="start" alignItemWithTrigger={standard?true:undefined}>{standard?<SelectGroup><SelectLabel>Состояние</SelectLabel>{options}</SelectGroup>:options}</SelectContent>
 </Select>;
 return standard?select:<label className="field">Состояние{select}</label>;
}
function CatalogTabs(){
 const {pathname}=useLocation();
 return <Tabs value={pathname} render={<nav aria-label="Вложенные разделы"/>}>
  <TabsList aria-label="Разделы предприятий">
   {[['/company/businesses','Список предприятий'],['/company/businesses/departments','Отделы']].map(([path,label])=><TabsTrigger key={path} value={path} nativeButton={false} render={<Link to={path} aria-current={pathname===path?'page':undefined}/>}>{label}</TabsTrigger>)}
  </TabsList>
 </Tabs>;
}

function NameDialog({title:heading,initial,organization=false,onDirty=noop,onSave,onClose}:{title:string;initial?:Item;organization?:boolean;onDirty?:Dirty;onSave:(data:{name:string;inn?:string},key:string)=>Promise<void>;onClose:()=>void}){
 const[name,setName]=useState(initial?.name||''),[inn,setInn]=useState(initial?.inn||''),[error,setError]=useState<unknown>(),[saving,setSaving]=useState(false);const key=useRef(crypto.randomUUID());
 const dirty=name!==(initial?.name||'')||inn!==(initial?.inn||'');
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false)},[dirty,onDirty]);
 const [discard,setDiscard]=useState(false);
 const close=()=>{if(saving)return;if(!dirty)onClose();else setDiscard(true)};
 return <><Modal title={heading} onClose={close}><form onSubmit={async e=>{e.preventDefault();setSaving(true);setError(undefined);try{await onSave({name:name.trim(),...(organization?{inn}: {})},key.current)}catch(err){setError(err)}finally{setSaving(false)}}}><div className="field"><label htmlFor="catalog-name">Наименование</label><CatalogInput id="catalog-name" autoFocus required maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></div>{organization&&<div className="field"><label htmlFor="catalog-inn">ИНН</label><CatalogInput id="catalog-inn" required inputMode="numeric" pattern="([0-9]{10}|[0-9]{12})" maxLength={12} value={inn} onChange={e=>setInn(e.target.value)} aria-describedby="inn-help"/><small id="inn-help">10 цифр для юридического лица или 12 для ИП.</small></div>}<ErrorMessage error={error}/><div className="form-actions"><CatalogButton className="button primary" disabled={saving||!name.trim()}>{saving?'Сохраняем…':'Сохранить'}</CatalogButton><CatalogButton type="button" className="button" disabled={saving} onClick={close}>Отмена</CatalogButton></div></form></Modal>{discard&&<Modal confirmation title="Отменить изменения?" onClose={()=>setDiscard(false)}><p>Несохранённые изменения будут потеряны.</p><div className="form-actions"><CatalogButton className="button danger" onClick={onClose}>Отменить</CatalogButton><CatalogButton className="button" onClick={()=>setDiscard(false)}>Продолжить редактирование</CatalogButton></div></Modal>}</>;
}
function ArchiveDialog({name,onSave,onClose}:{name:string;onSave:()=>Promise<void>;onClose:()=>void}){
 const[error,setError]=useState<unknown>(),[saving,setSaving]=useState(false);
 return <Modal confirmation title="Архивировать?" onClose={()=>{if(!saving)onClose()}}><p>«{name}» и вложенная структура исчезнут из рабочих списков. Назначения сотрудников и связи сохранятся. Объект можно восстановить из архива.</p><ErrorMessage error={error}/><div className="form-actions"><CatalogButton className="button danger" disabled={saving} onClick={async()=>{setSaving(true);try{await onSave()}catch(err){setError(err)}finally{setSaving(false)}}}>Архивировать</CatalogButton><CatalogButton className="button" disabled={saving} onClick={onClose}>Отмена</CatalogButton></div></Modal>;
}
function CatalogCard({tenant,kind,id,onDirty}:{tenant:Tenant;kind:Kind;id:string;onDirty:Dirty}){
 const query=useData<Item>(tenant,`/${kind}/${id}`),action=useAction(tenant);const[tab,setTab]=useState(kind==='businesses'?'departments':'businesses'),[dialog,setDialog]=useState<'edit'|'archive'|'restore'>();
 if(query.isPending)return <Busy/>;if(query.error||!query.data)return <QueryError error={query.error} retry={()=>void query.refetch()}/>;
 const item=query.data,manage=canManage(tenant.role)&&!item.archived;
 return <section><Link className="back" to={`/company/${kind}`}>← {title(kind)}</Link><div className="section-heading"><div><h1>{item.name}</h1>{kind==='organizations'&&<p>ИНН {item.inn}</p>}{item.archived&&<p className="status pending">В архиве · Только просмотр</p>}</div><div className="catalog-actions">{manage&&<><CatalogButton className="button" onClick={()=>setDialog('edit')}>{kind==='organizations'?'Редактировать':'Переименовать'}</CatalogButton><CatalogButton className="button danger" onClick={()=>setDialog('archive')}>В архив</CatalogButton></>}{canManage(tenant.role)&&item.archived&&<CatalogButton className="button primary" onClick={()=>setDialog('restore')}>Восстановить</CatalogButton>}</div></div>
 {kind==='businesses'?<><nav className="tabs" aria-label="Карточка предприятия">{[['departments','Отделы'],['employees','Сотрудники'],['organizations','Организации']].map(([key,label])=><CatalogButton key={key} aria-pressed={tab===key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</CatalogButton>)}</nav>{tab==='departments'?<DepartmentTree tenant={tenant} business={item} onDirty={onDirty}/>:tab==='employees'?<AssignmentPanel tenant={tenant} business={item}/>:<RelationPanel tenant={tenant} item={item} kind="businesses"/>}</>:<RelationPanel tenant={tenant} item={item} kind="organizations"/>}
 {(dialog==='edit'||dialog==='restore')&&<NameDialog title={dialog==='restore'?'Восстановить: проверьте наименование':kind==='organizations'?'Изменить организацию':'Переименовать предприятие'} initial={item} organization={kind==='organizations'&&dialog==='edit'} onDirty={onDirty} onClose={()=>setDialog(undefined)} onSave={async data=>{await action.mutateAsync({path:`/${kind}/${id}${dialog==='restore'?'/restore':''}`,method:dialog==='restore'?'POST':'PATCH',data});setDialog(undefined)}}/>}
 {dialog==='archive'&&<ArchiveDialog name={item.name} onClose={()=>setDialog(undefined)} onSave={async()=>{await action.mutateAsync({path:`/${kind}/${id}/archive`});setDialog(undefined)}}/>}</section>;
}
function DepartmentDirectory({tenant,onDirty}:{tenant:Tenant;onDirty:Dirty}){
 const[params,setParams]=useSearchParams(),id=params.get('business')||'';
 const query=useData<ItemList>(tenant,'/businesses?status=all&limit=100');
 const[selected,setSelected]=useState<Item>();
 useEffect(()=>{setSelected(query.data?.items.find(b=>b.id===id))},[query.data,id]);
 return <section className="catalog-directory"><div className="section-heading"><h1>Отделы</h1></div><CatalogTabs/><BusinessSelector tenant={tenant} value={id} onSelect={b=>{setSelected(b);setParams({business:b.id})}}/>{selected?<DepartmentTree key={selected.id} tenant={tenant} business={selected} onDirty={onDirty}/>:id?<SelectedBusiness tenant={tenant} id={id} onDirty={onDirty}/>:<p className="empty">Выберите предприятие для просмотра дерева отделов.</p>}</section>;
}
function SelectedBusiness({tenant,id,onDirty}:{tenant:Tenant;id:string;onDirty:Dirty}){const q=useData<Item>(tenant,`/businesses/${id}`);return q.isPending?<Busy/>:q.data?<DepartmentTree tenant={tenant} business={q.data} onDirty={onDirty}/>:<QueryError error={q.error} retry={()=>void q.refetch()}/>}
function BusinessSelector({tenant,value,onSelect}:{tenant:Tenant;value:string;onSelect:(item:Item)=>void}){
 const[search,setSearch]=useState(''),[offset,setOffset]=useState(0);const query=useData<ItemList>(tenant,`/businesses?status=all&limit=25&offset=${offset}&search=${encodeURIComponent(search)}`);
 return <details className="panel catalog-panel"><summary>Выбрать предприятие{value?' · Выбрано':''}</summary><div className="catalog-toolbar"><label className="field">Поиск предприятий<CatalogInput value={search} onChange={e=>{setSearch(e.target.value);setOffset(0)}}/></label></div><QueryError error={query.error} retry={()=>void query.refetch()}/>{query.isPending?<Busy/>:query.data&&<><div className="catalog-options">{query.data.items.map(b=><CatalogButton key={b.id} className="button" onClick={e=>{onSelect(b);e.currentTarget.closest('details')?.removeAttribute('open')}}>{b.name}{b.archived?' (архив)':''}</CatalogButton>)}</div><Pages total={query.data.total} offset={offset} onChange={setOffset}/></>}</details>;
}

function departmentRows(all:Item[],status:string,collapsed:Set<string>){
 const byId=new Map(all.map(d=>[d.id,d])),children=new Map<string|null,Item[]>();
 for(const item of all){const parent=item.parentId||null,list=children.get(parent)||[];list.push(item);children.set(parent,list)}
 for(const list of children.values())list.sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
 const visible=new Set(all.filter(d=>status==='all'||d.effectiveArchived===(status==='archived')).map(d=>d.id));
 type Row={item:Item;depth:number;parentId:string|null;hiddenParentPath:string;last:boolean;guides:number[];hasChildren:boolean};
 const rows:Row[]=[],rendered=new Map<string,Row>(),stack=[...(children.get(null)||[])].reverse();
 // Keep traversal iterative, including when a filter hides intermediate parents.
 while(stack.length){
  const item=stack.pop()!;
  if(visible.has(item.id)){
   const parent=item.parentId?rendered.get(item.parentId):undefined;
   const names:string[]=[],seen=new Set<string>();let parentId=item.parentId;
   if(parentId&&!visible.has(parentId))while(parentId&&!seen.has(parentId)){seen.add(parentId);const p=byId.get(parentId);if(!p)break;names.unshift(p.name);parentId=p.parentId}
   const row:Row={item,depth:parent?parent.depth+1:0,parentId:parent?.item.id||null,hiddenParentPath:names.join(' / '),last:true,guides:[],hasChildren:false};
   rows.push(row);rendered.set(item.id,row);if(parent)parent.hasChildren=true;
  }
  if(!visible.has(item.id)||!collapsed.has(item.id))for(const child of [...(children.get(item.id)||[])].reverse())stack.push(child);
 }
 const lastChild=new Map<string|null,Row>();for(const row of rows){const previous=lastChild.get(row.parentId);if(previous)previous.last=false;lastChild.set(row.parentId,row)}
 for(const row of rows){let parent=row.parentId?rendered.get(row.parentId):undefined;while(parent){if(parent.depth>0&&!parent.last)row.guides.push(parent.depth);parent=parent.parentId?rendered.get(parent.parentId):undefined}}
 return {rows,ordered:(parent:string|null)=>children.get(parent)||[]};
}

function DepartmentTree({tenant,business,onDirty}:{tenant:Tenant;business:Item;onDirty:Dirty}){
 const[status,setStatus]=useState(business.archived?'all':'active'),[collapsed,setCollapsed]=useState<Set<string>>(new Set()),[dragging,setDragging]=useState(''),[drop,setDrop]=useState<{id:string;zone:string}>(),[notice,setNotice]=useState('');
 const[dialog,setDialog]=useState<{type:'create'|'rename'|'restore'|'archive'|'move'|'employees';item?:Item;parentId?:string}>();
 const query=useData<ItemList>(tenant,`/businesses/${business.id}/departments?status=all`),action=useAction(tenant);
 useEffect(()=>{setStatus(business.archived?'all':'active')},[business.archived]);
 const all=query.data?.items||[],byId=new Map(all.map(d=>[d.id,d])),manage=canManage(tenant.role)&&!business.archived;
 const {rows,ordered}=departmentRows(all,status,collapsed);
 const siblings=(d:Item)=>ordered(d.parentId||null).filter(x=>!x.effectiveArchived);
 const move=async(d:Item,parentId:string|null,beforeId:string|null)=>{await action.mutateAsync({path:`/businesses/${business.id}/departments/${d.id}/move`,data:{parentId,beforeId}});setNotice(`Отдел «${d.name}» перемещён`)};
 const attempt=(work:()=>Promise<unknown>)=>{void work().catch(()=>{/* Mutation error remains visible until the next attempt. */})};
 const dropAt=(event:DragEvent<HTMLElement>,target:Item)=>{
  event.preventDefault();event.stopPropagation();const source=byId.get(event.dataTransfer.getData('text/plain')||dragging);setDrop(undefined);setDragging('');if(!source||source.id===target.id)return;
  const rect=event.currentTarget.getBoundingClientRect(),fraction=(event.clientY-rect.top)/rect.height;
  const peers=siblings(target),index=peers.findIndex(d=>d.id===target.id);
  attempt(()=>move(source,fraction<.25||fraction>.75?target.parentId||null:target.id,fraction<.25?target.id:fraction>.75?peers[index+1]?.id||null:null));
 };
 return <CatalogPanel className="panel catalog-panel"><div className="catalog-toolbar"><h2>Отделы {business.name}</h2><ArchiveFilter value={status} onChange={setStatus}/>{manage&&<CatalogButton className="button primary" onClick={()=>setDialog({type:'create'})}>Добавить отдел</CatalogButton>}</div><p className="field-help">Перетащите за маркер ↕: верх строки — перед отделом, середина — внутрь, низ — после. Те же действия доступны в меню.</p>
 <QueryError error={query.error} retry={()=>void query.refetch()}/><ErrorMessage error={action.error}/>{notice&&<p role="status" className="success-note">{notice}</p>}
 {query.isPending?<Busy/>:!rows.length?<p className="empty">{status==='archived'?'В архиве нет отделов':'Отделов пока нет'}</p>:<div className="department-tree-scroll" role="region" aria-label="Дерево отделов" tabIndex={0}><ul className="department-tree" aria-label="Иерархия отделов" style={{'--max-depth':rows.reduce((max,row)=>Math.max(max,row.depth),0)} as CSSProperties}>{rows.map(({item:d,depth,last,guides,hasChildren,hiddenParentPath})=>{
 const active=manage&&!d.effectiveArchived,peers=siblings(d),index=peers.findIndex(x=>x.id===d.id),parent=d.parentId?byId.get(d.parentId):undefined;
 return <li key={d.id} className="department-node" style={{'--depth':depth} as CSSProperties}>
 {guides.map(level=><span key={level} className="department-guide" aria-hidden="true" style={{'--guide-level':level} as CSSProperties}/>)}
 {depth>0&&<span className={`department-branch${last?' last':''}`} aria-hidden="true"/>}{hasChildren&&<span className="department-stem" aria-hidden="true"/>}
 <div className={`department-row ${drop?.id===d.id?'drop-'+drop.zone:''}`} onDragOver={event=>{if(active){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect(),f=(event.clientY-rect.top)/rect.height;setDrop({id:d.id,zone:f<.25?'before':f>.75?'after':'inside'})}}} onDrop={event=>{if(active)dropAt(event,d)}}>
 <div className="department-title"><CatalogButton className="icon-button" aria-label={`${collapsed.has(d.id)?'Развернуть':'Свернуть'} ${d.name}`} aria-expanded={!collapsed.has(d.id)} disabled={!ordered(d.id).length} onClick={()=>setCollapsed(old=>{const next=new Set(old);next.has(d.id)?next.delete(d.id):next.add(d.id);return next})}>{collapsed.has(d.id)?<ChevronRight size={16}/>:<ChevronDown size={16}/>}</CatalogButton>{active&&<span className="drag-handle" title="Перетащить отдел" draggable onDragStart={event=>{setDragging(d.id);event.dataTransfer.setData('text/plain',d.id);event.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{setDragging('');setDrop(undefined)}} aria-hidden="true"><GripVertical size={16}/></span>}<strong>{d.name}</strong>{d.effectiveArchived&&<span className="status pending">Архив</span>}
 <ActionsMenu label={`Действия отдела ${d.name}`} actions={[
 {label:'Сотрудники',onSelect:()=>setDialog({type:'employees',item:d})},
 ...(active?[
 {label:'Добавить подотдел',onSelect:()=>setDialog({type:'create',parentId:d.id})},
 {label:'Переименовать',onSelect:()=>setDialog({type:'rename',item:d})},
 {label:'Выше',disabled:action.isPending||index<=0,onSelect:()=>attempt(()=>move(d,d.parentId||null,peers[index-1].id))},
 {label:'Ниже',disabled:action.isPending||index<0||index===peers.length-1,onSelect:()=>attempt(()=>move(d,d.parentId||null,peers[index+2]?.id||null))},
 {label:'На уровень выше',disabled:action.isPending||!parent,onSelect:()=>{if(parent){const upper=siblings(parent),i=upper.findIndex(x=>x.id===parent.id);attempt(()=>move(d,parent.parentId||null,upper[i+1]?.id||null))}}},
 {label:'Переместить…',onSelect:()=>setDialog({type:'move',item:d})},
 {label:'В архив',danger:true,onSelect:()=>setDialog({type:'archive',item:d})}
 ]:[]),
 ...(manage&&d.archived&&!business.archived&&(!parent||!parent.effectiveArchived)?[{label:'Восстановить',onSelect:()=>setDialog({type:'restore',item:d})}]:[])
 ]}/></div>{hiddenParentPath&&<p className="field-help department-parent-path">В составе: {hiddenParentPath}</p>}</div></li>;
 })}</ul></div>}
 {dialog&&['create','rename','restore'].includes(dialog.type)&&<NameDialog title={dialog.type==='create'?'Добавить отдел':dialog.type==='restore'?'Восстановить отдел: проверьте наименование':'Переименовать отдел'} initial={dialog.item} onDirty={onDirty} onClose={()=>setDialog(undefined)} onSave={async(data,key)=>{const type=dialog.type;await action.mutateAsync({path:`/businesses/${business.id}/departments${type==='create'?'':`/${dialog.item!.id}${type==='restore'?'/restore':''}`}`,method:type==='rename'?'PATCH':'POST',data:{...data,...(type==='create'?{parentId:dialog.parentId||null}:{})},key:type==='create'?key:undefined});setDialog(undefined)}}/>}
 {dialog?.type==='archive'&&<ArchiveDialog name={dialog.item!.name} onClose={()=>setDialog(undefined)} onSave={async()=>{await action.mutateAsync({path:`/businesses/${business.id}/departments/${dialog.item!.id}/archive`});setDialog(undefined)}}/>}
 {dialog?.type==='move'&&<MoveDialog item={dialog.item!} all={all} onClose={()=>setDialog(undefined)} onSave={async parent=>{await move(dialog.item!,parent,null);setDialog(undefined)}}/>}
 {dialog?.type==='employees'&&<Modal title={`Сотрудники отдела «${dialog.item!.name}»`} onClose={()=>setDialog(undefined)}><AssignmentPanel tenant={tenant} business={business} department={dialog.item}/></Modal>}
 </CatalogPanel>;
}
function MoveDialog({item,all,onSave,onClose}:{item:Item;all:Item[];onSave:(parent:string|null)=>Promise<void>;onClose:()=>void}){
 const[parent,setParent]=useState(item.parentId||''),[error,setError]=useState<unknown>(),[saving,setSaving]=useState(false);const excluded=new Set([item.id]);let changed=true;while(changed){changed=false;for(const d of all){if(d.parentId&&excluded.has(d.parentId)&&!excluded.has(d.id)){excluded.add(d.id);changed=true}}}
 const path=(d:Item)=>{const names=[d.name],seen=new Set([d.id]);let p=d.parentId;while(p&&!seen.has(p)){seen.add(p);const parent=all.find(x=>x.id===p);if(!parent)break;names.unshift(parent.name);p=parent.parentId}return names.join(' / ')};
 return <Modal title={`Переместить «${item.name}»`} onClose={()=>{if(!saving)onClose()}}><form onSubmit={async e=>{e.preventDefault();setSaving(true);try{await onSave(parent||null)}catch(err){setError(err)}finally{setSaving(false)}}}><label className="field">Новый родитель<select value={parent} onChange={e=>setParent(e.target.value)}><option value="">Корень предприятия</option>{all.filter(d=>!d.effectiveArchived&&!excluded.has(d.id)).map(d=><option key={d.id} value={d.id}>{path(d)}</option>)}</select></label><p>Отдел вместе с подотделами будет добавлен в конец выбранного уровня.</p><ErrorMessage error={error}/><CatalogButton className="button primary" disabled={saving}>Переместить</CatalogButton></form></Modal>;
}

function AssignmentPanel({tenant,business,department}:{tenant:Tenant;business:Item;department?:Item}){
 const[adding,setAdding]=useState(false),[remove,setRemove]=useState<Assignment>();const path=`/businesses/${business.id}${department?`/departments/${department.id}`:''}/employees`;
 const query=useData<Assignments>(tenant,path+'?status=all'),action=useAction(tenant),manage=canManage(tenant.role)&&!business.archived&&!department?.effectiveArchived;
 return <CatalogPanel className="catalog-panel"><div className="catalog-toolbar"><h2>Сотрудники{department?' отдела':' предприятия'}</h2>{manage&&<CatalogButton className="button primary" onClick={()=>setAdding(true)}>Назначить сотрудника</CatalogButton>}</div><QueryError error={query.error} retry={()=>void query.refetch()}/><ErrorMessage error={action.error}/>{query.isPending?<Busy/>:query.data?.items.length?<ul className="catalog-link-list">{query.data.items.map(a=><li key={a.employeeId}><Link to={`/company/employees/${a.employeeId}`}>{a.employeeName}</Link>{manage&&<CatalogButton className="button" onClick={()=>setRemove(a)}>Снять назначение</CatalogButton>}</li>)}</ul>:<p className="empty">Нет назначенных сотрудников</p>}
 {adding&&<EmployeePicker tenant={tenant} excluded={new Set(query.data?.items.map(a=>a.employeeId))} onClose={()=>setAdding(false)} onSelect={async id=>{await action.mutateAsync({path:`${path}/${id}`,method:'PUT'});setAdding(false)}}/>}
 {remove&&<ConfirmAction title="Снять назначение?" text={department?`Сотрудник «${remove.employeeName}» останется в предприятии и других отделах.`:`Сотрудник «${remove.employeeName}» будет исключён из предприятия и всех его отделов, включая архивные. Карточка сотрудника сохранится.`} onClose={()=>setRemove(undefined)} onSave={async()=>{await action.mutateAsync({path:`${path}/${remove.employeeId}`,method:'DELETE'});setRemove(undefined)}}/>}</CatalogPanel>;
}
function ConfirmAction({title,text,onSave,onClose}:{title:string;text:string;onSave:()=>Promise<void>;onClose:()=>void}){const[error,setError]=useState<unknown>(),[saving,setSaving]=useState(false);return <Modal confirmation title={title} onClose={()=>{if(!saving)onClose()}}><p>{text}</p><ErrorMessage error={error}/><div className="form-actions"><CatalogButton className="button danger" disabled={saving} onClick={async()=>{setSaving(true);try{await onSave()}catch(err){setError(err)}finally{setSaving(false)}}}>Подтвердить</CatalogButton><CatalogButton className="button" disabled={saving} onClick={onClose}>Отмена</CatalogButton></div></Modal>}
function EmployeePicker({tenant,excluded,onSelect,onClose}:{tenant:Tenant;excluded:Set<string>;onSelect:(id:string)=>Promise<void>;onClose:()=>void}){
 const[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[error,setError]=useState<unknown>(),[saving,setSaving]=useState(false);const query=useData<EmployeeList>(tenant,`/employees?search=${encodeURIComponent(search)}&limit=25&offset=${offset}`);
 return <Modal title="Выбрать сотрудника" onClose={()=>{if(!saving)onClose()}}><label className="field">Поиск сотрудников<CatalogInput autoFocus value={search} onChange={e=>{setSearch(e.target.value);setOffset(0)}}/></label><QueryError error={query.error} retry={()=>void query.refetch()}/><ErrorMessage error={error}/>{query.isPending?<Busy/>:query.data&&<><ul className="catalog-link-list">{query.data.items.map(e=><li key={e.id}><span>{e.fullName}<small className="muted"> · {e.email}</small></span><CatalogButton className="button" disabled={saving||excluded.has(e.id)} onClick={async()=>{setSaving(true);try{await onSelect(e.id)}catch(err){setError(err)}finally{setSaving(false)}}}>{excluded.has(e.id)?'Назначен':'Выбрать'}</CatalogButton></li>)}</ul>{!query.data.items.length&&<p>Сотрудники не найдены.</p>}<Pages total={query.data.total} offset={offset} onChange={setOffset}/></>}</Modal>;
}

function RelationPanel({tenant,item,kind}:{tenant:Tenant;item:Item;kind:Kind}){
 const other:Kind=kind==='businesses'?'organizations':'businesses',path=`/${kind}/${item.id}/${other}`;
 const[adding,setAdding]=useState(false),[status,setStatus]=useState(item.archived?'all':'active'),[offset,setOffset]=useState(0),[remove,setRemove]=useState<Item>();
 const query=useData<ItemList>(tenant,path+`?status=${status}&limit=25&offset=${offset}`),action=useAction(tenant),manage=canManage(tenant.role)&&!item.archived;
 return <CatalogPanel className="panel catalog-panel"><div className="catalog-toolbar"><h2>{title(other)}</h2><ArchiveFilter value={status} onChange={s=>{setStatus(s);setOffset(0)}}/>{manage&&<CatalogButton className="button primary" onClick={()=>setAdding(true)}>Связать {kind==='businesses'?'организацию':'предприятие'}</CatalogButton>}</div><QueryError error={query.error} retry={()=>void query.refetch()}/><ErrorMessage error={action.error}/>{query.isPending?<Busy/>:query.data&&<><ul className="catalog-link-list">{query.data.items.map(link=><li key={link.id}><Link to={`/company/${other}/${link.id}`}>{link.name}{link.effectiveArchived?' (архив)':''}</Link>{manage&&!link.effectiveArchived&&<CatalogButton className="button" onClick={()=>setRemove(link)}>Снять связь</CatalogButton>}</li>)}</ul>{!query.data.items.length&&<p className="empty">Связей пока нет</p>}<Pages total={query.data.total} offset={offset} onChange={setOffset}/></>}
 {adding&&<ItemPicker tenant={tenant} kind={other} onClose={()=>setAdding(false)} onSelect={async id=>{await action.mutateAsync({path:`${path}/${id}`,method:'PUT'});setAdding(false)}}/>}
 {remove&&<ConfirmAction title="Снять связь?" text={`Связь с «${remove.name}» будет снята. Оба объекта сохранятся.`} onClose={()=>setRemove(undefined)} onSave={async()=>{await action.mutateAsync({path:`${path}/${remove.id}`,method:'DELETE'});setRemove(undefined)}}/>}</CatalogPanel>;
}
function ItemPicker({tenant,kind,onSelect,onClose}:{tenant:Tenant;kind:Kind;onSelect:(id:string)=>Promise<void>;onClose:()=>void}){
 const[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[error,setError]=useState<unknown>(),[saving,setSaving]=useState(false);const query=useData<ItemList>(tenant,`/${kind}?status=active&limit=25&offset=${offset}&search=${encodeURIComponent(search)}`);
 return <Modal title={`Выбрать: ${title(kind)}`} onClose={()=>{if(!saving)onClose()}}><label className="field">Поиск<CatalogInput autoFocus value={search} onChange={e=>{setSearch(e.target.value);setOffset(0)}}/></label><QueryError error={query.error} retry={()=>void query.refetch()}/><ErrorMessage error={error}/>{query.isPending?<Busy/>:query.data&&<><ul className="catalog-link-list">{query.data.items.map(item=><li key={item.id}><span>{item.name}{item.inn?` · ${item.inn}`:''}</span><CatalogButton className="button" disabled={saving} onClick={async()=>{setSaving(true);try{await onSelect(item.id)}catch(err){setError(err)}finally{setSaving(false)}}}>Выбрать</CatalogButton></li>)}</ul>{!query.data.items.length&&<p>Ничего не найдено.</p>}<Pages total={query.data.total} offset={offset} onChange={setOffset}/></>}</Modal>;
}
