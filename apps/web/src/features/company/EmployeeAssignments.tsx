import {useEffect,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {api,canManage,type Tenant} from '../../shared/api/client';
import type {components} from '../../shared/api/schema.gen';
import {Busy,ErrorMessage,Modal} from '../../shared/ui/components';

type Assignment=components['schemas']['AssignmentView'];
type Reference=components['schemas']['AssignmentReference'];
type Changes=components['schemas']['UpdateEmployeeAssignmentsInput'];
type Item=components['schemas']['CatalogItem'];
type ItemList=components['schemas']['CatalogList'];
type Selection=Map<string,Reference>;
type Dirty=(value:boolean)=>void;
const targetKey=(a:{businessId:string;departmentId?:string|null})=>`${a.businessId}:${a.departmentId||''}`;
const root=(tenant:Tenant)=>`/api/v1/tenants/${tenant.id}`;
function useCatalog<T>(tenant:Tenant,path:string){return useQuery({queryKey:['catalog',tenant.id,path],queryFn:()=>api<T>(root(tenant)+path)})}
function RetryError({error,retry}:{error:unknown;retry:()=>void}){return error?<><ErrorMessage error={error}/><button type="button" className="button" onClick={retry}>Повторить</button></>:null}

export function EmployeeAssignments({tenant,id,onDirty}:{tenant:Tenant;id:string;onDirty:Dirty}){
 const query=useCatalog<components['schemas']['AssignmentList']>(tenant,`/employees/${id}/assignments?status=all`);
 const[editing,setEditing]=useState<Assignment[]>(),[notice,setNotice]=useState('');
 const groups=new Map<string,{membership?:Assignment;departments:Assignment[]}>();
 for(const a of query.data?.items||[]){const group=groups.get(a.businessId)||{departments:[]};if(a.departmentId)group.departments.push(a);else group.membership=a;groups.set(a.businessId,group)}
 return <div className="panel catalog-panel employee-assignments" aria-labelledby="employee-assignments-title"><div className="catalog-toolbar"><h2 id="employee-assignments-title">Предприятия и отделы</h2>{canManage(tenant.role)&&<button className="button" disabled={!query.data||query.isFetching||!!query.error} onClick={()=>{setNotice('');setEditing([...(query.data?.items||[])])}}>Изменить</button>}</div>
 <RetryError error={query.error} retry={()=>void query.refetch()}/>{query.isPending?<Busy/>:query.data&&!query.data.items.length?<p className="empty">Назначений пока нет</p>:<ul className="assignment-groups">{[...groups].map(([businessId,group])=>{const membership=group.membership||group.departments[0];return <li key={businessId}><div className="assignment-business"><Link to={`/company/businesses/${businessId}`}>{membership.businessName}</Link>{group.membership?.archived&&<span className="status pending">Архив</span>}</div>{group.departments.length?<ul>{group.departments.map(a=><li key={a.departmentId}><span>{a.departmentName}</span>{a.archived&&<span className="status pending">Архив</span>}</li>)}</ul>:<p className="field-help">Без привязки к отделу</p>}</li>})}</ul>}
 {notice&&<p role="status" className="success-note">{notice}</p>}
 {editing&&<AssignmentEditor tenant={tenant} employeeId={id} initial={editing} onDirty={onDirty} onClose={()=>setEditing(undefined)} onSaved={()=>{setEditing(undefined);setNotice('Назначения сохранены')}}/>}</div>;
}

function AssignmentEditor({tenant,employeeId,initial,onDirty,onClose,onSaved}:{tenant:Tenant;employeeId:string;initial:Assignment[];onDirty:Dirty;onClose:()=>void;onSaved:()=>void}){
 const client=useQueryClient();
 const[original]=useState<Selection>(()=>new Map(initial.map(a=>[targetKey(a),{businessId:a.businessId,departmentId:a.departmentId||null}])));
 const[selected,setSelected]=useState<Selection>(()=>new Map(original));
 const[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[expanded,setExpanded]=useState<Set<string>>(new Set());
 const query=useCatalog<ItemList>(tenant,`/businesses?status=all&limit=25&offset=${offset}&search=${encodeURIComponent(search)}`);
 const changes:Changes={add:[...selected].filter(([k])=>!original.has(k)).map(([,a])=>a),remove:[...original].filter(([k,a])=>!selected.has(k)&&(!a.departmentId||selected.has(targetKey({businessId:a.businessId})))).map(([,a])=>a)};
 const dirty=changes.add.length>0||changes.remove.length>0;
 const mutation=useMutation({mutationFn:()=>api<void>(`${root(tenant)}/employees/${employeeId}/assignments`,{method:'PATCH',body:JSON.stringify(changes)}),onSuccess:async()=>{onDirty(false);await client.invalidateQueries({queryKey:['catalog',tenant.id]});onSaved()}});
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false)},[dirty,onDirty]);
 const close=()=>{if(!mutation.isPending&&(!dirty||window.confirm('Отменить несохранённые изменения?')))onClose()};
 const toggle=(businessId:string,departmentId:string|null,checked:boolean)=>setSelected(previous=>{
  const next=new Map(previous),target={businessId,departmentId};
  if(checked){
   next.set(targetKey({businessId}),{businessId,departmentId:null});next.set(targetKey(target),target);
   // Rechecking membership must restore its read-only archived assignments.
   for(const a of initial)if(a.businessId===businessId&&a.departmentId&&a.archived)next.set(targetKey(a),{businessId,departmentId:a.departmentId});
  }
  else if(departmentId)next.delete(targetKey(target));else for(const[k,a]of next)if(a.businessId===businessId)next.delete(k);
  return next;
 });
 const removed=changes.remove.filter(a=>!a.departmentId),selectedBusinesses=[...selected.values()].filter(a=>!a.departmentId).length;
 return <Modal title="Предприятия и отделы сотрудника" onClose={close}><form className="assignment-editor" onSubmit={e=>{e.preventDefault();if(dirty&&!mutation.isPending)mutation.mutate()}}>
 <p className="field-help">Отметьте предприятия и отделы. Выбор отдела добавляет сотрудника в предприятие, без назначения в подотделы.</p>
 <label className="field assignment-search">Поиск предприятий<input autoFocus value={search} onChange={e=>{setSearch(e.target.value);setOffset(0)}}/></label>
 <p className="field-help" role="status">Выбрано предприятий: {selectedBusinesses} · отделов: {selected.size-selectedBusinesses}</p>
 <div className="assignment-options"><RetryError error={query.error} retry={()=>void query.refetch()}/>{query.isPending?<Busy/>:query.data&&<>
 {query.data.items.map(b=><div key={b.id} className="assignment-option"><div className="assignment-business-choice"><label className="assignment-check"><input type="checkbox" checked={selected.has(targetKey({businessId:b.id}))} disabled={mutation.isPending||b.archived} onChange={e=>toggle(b.id,null,e.target.checked)}/><span>{b.name}</span></label>{b.archived&&<span className="status pending">Архив</span>}<button type="button" className="button" aria-label={`Отделы предприятия «${b.name}»`} aria-expanded={expanded.has(b.id)} onClick={()=>setExpanded(old=>{const next=new Set(old);next.has(b.id)?next.delete(b.id):next.add(b.id);return next})}>{expanded.has(b.id)?'Свернуть':'Отделы'}</button></div>
 {expanded.has(b.id)&&<DepartmentChoices tenant={tenant} business={b} selected={selected} saving={mutation.isPending} onToggle={toggle}/>}</div>)}
 {!query.data.items.length&&<p className="empty">{search?'Предприятия не найдены':'Предприятий пока нет'}</p>}
 <div className="pagination"><span>Всего: {query.data.total}</span><div><button type="button" className="button" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-25))}>Назад</button><span>{Math.floor(offset/25)+1}</span><button type="button" className="button" disabled={offset+25>=query.data.total} onClick={()=>setOffset(offset+25)}>Далее</button></div></div>
 </>}</div>
 {!!removed.length&&<div className="assignment-warning" role="note">Сотрудник будет исключён из предприятий: {removed.map(a=>initial.find(i=>i.businessId===a.businessId)?.businessName||'Предприятие').join(', ')}. Все назначения в их отделах, включая архивные, будут сняты. Карточка сотрудника сохранится.</div>}
 <ErrorMessage error={mutation.error}/><div className="form-actions"><button className="button primary" disabled={!dirty||mutation.isPending}>{mutation.isPending?'Сохраняем…':'Сохранить'}</button><button type="button" className="button" disabled={mutation.isPending} onClick={close}>Отмена</button></div>
 </form></Modal>;
}

function DepartmentChoices({tenant,business,selected,saving,onToggle}:{tenant:Tenant;business:Item;selected:Selection;saving:boolean;onToggle:(b:string,d:string|null,checked:boolean)=>void}){
 const query=useCatalog<ItemList>(tenant,`/businesses/${business.id}/departments?status=all`);
 const children=new Map<string,Item[]>();for(const d of query.data?.items||[]){const key=d.parentId||'',list=children.get(key)||[];list.push(d);children.set(key,list)}
 for(const list of children.values())list.sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
 const rows:{item:Item;depth:number}[]=[],stack=(children.get('')||[]).map(item=>({item,depth:0})).reverse();
 while(stack.length){const row=stack.pop()!;rows.push(row);for(const child of [...(children.get(row.item.id)||[])].reverse())stack.push({item:child,depth:row.depth+1})}
 return <div className="assignment-departments"><RetryError error={query.error} retry={()=>void query.refetch()}/>{query.isPending?<Busy/>:query.data&&!rows.length?<p className="field-help">Отделов пока нет</p>:rows.map(({item:d,depth})=><div className="assignment-department" key={d.id} style={{paddingLeft:`${Math.min(depth,6)*12}px`}}><label className="assignment-check"><input type="checkbox" checked={selected.has(targetKey({businessId:business.id,departmentId:d.id}))} disabled={saving||business.archived||d.effectiveArchived} onChange={e=>onToggle(business.id,d.id,e.target.checked)}/><span>{d.name}</span></label>{(business.archived||d.effectiveArchived)&&<span className="status pending">Архив</span>}</div>)}</div>;
}
