import {useEffect,useId,useRef,type ReactNode} from 'react';
import {X,LoaderCircle,Copy,CheckCircle2,MoreHorizontal} from 'lucide-react';
import {useState} from 'react';
export function Brand(){return <div className="brand"><img src="/neiroot-wordmark.png?v=20261005-2" alt="NEIROOT"/></div>}
export function Busy({text='Загрузка…'}:{text?:string}){return <div className="busy" role="status"><LoaderCircle className="spin" size={22}/>{text}</div>}
export function ErrorMessage({error}:{error:unknown}){return error?<div role="alert" className="error-banner">{error instanceof Error?error.message:'Не удалось загрузить данные.'}</div>:null}
export function ActionsMenu({label,actions}:{label:string;actions:{label:string;onSelect:()=>void;disabled?:boolean;danger?:boolean}[]}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),[open,setOpen]=useState(false);
 const close=(focus=false)=>{menu.current?.hidePopover();if(focus)trigger.current?.focus()};
 const position=()=>{
  const popup=menu.current,button=trigger.current;if(!popup||!button||!popup.matches(':popover-open'))return;
  const anchor=button.getBoundingClientRect(),rect=popup.getBoundingClientRect();
  popup.style.left=`${Math.max(8,Math.min(anchor.right-rect.width,innerWidth-rect.width-8))}px`;
  const top=anchor.bottom+6+rect.height<=innerHeight-8?anchor.bottom+6:anchor.top-rect.height-6;
  popup.style.top=`${Math.max(8,Math.min(top,innerHeight-rect.height-8))}px`;
 };
 const show=(last=false)=>{
  const popup=menu.current,button=trigger.current;if(!popup||!button)return;
  popup.showPopover();position();
  const items=popup.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');items[last?items.length-1:0]?.focus();
 };
 useEffect(()=>{const reposition=(event:Event)=>{if(event.target instanceof Node&&menu.current?.contains(event.target))return;position()};window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);return()=>{window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true)}},[]);
 return <><button ref={trigger} type="button" className="icon-button department-menu-trigger" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={()=>open?close(true):show()} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();show(e.key==='ArrowUp')}}}><MoreHorizontal size={20}/></button>
 <div id={id} ref={menu} popover="auto" role="menu" aria-label={label} className="action-menu" onToggle={e=>setOpen(e.currentTarget.matches(':popover-open'))} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return}
  if(e.key==='Tab'){close();return}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
  e.preventDefault();const items=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=items.indexOf(document.activeElement as HTMLButtonElement);
  const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();
 }}>{actions.map(action=><button key={action.label} type="button" role="menuitem" className={action.danger?'danger':undefined} disabled={action.disabled} onClick={()=>{close(true);action.onSelect()}}>{action.label}</button>)}</div></>;
}
export function Modal({title,children,onClose,drawer=false}:{title:string;children:ReactNode;onClose:()=>void;drawer?:boolean}){const titleId=useId();const ref=useRef<HTMLDialogElement>(null);const opener=useRef<HTMLElement|null>(null);useEffect(()=>{const dialog=ref.current;if(!opener.current)opener.current=document.activeElement as HTMLElement;dialog?.showModal();return()=>{dialog?.close();queueMicrotask(()=>opener.current?.focus())}},[]);return <dialog aria-labelledby={titleId} className={drawer?'drawer':undefined} ref={ref} onCancel={event=>{event.preventDefault();onClose()}} onClick={event=>{if(event.target===ref.current)onClose()}}><div className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X/></button></div>{children}</dialog>}
export function InvitationLink({url}:{url:string}){const[copied,setCopied]=useState(false);const[error,setError]=useState('');return <div className="invitation-box"><p>Передайте персональную ссылку сотруднику. Она действует 7 дней.</p><label htmlFor="invitation-link">Ссылка приглашения</label><textarea id="invitation-link" value={url} readOnly rows={3}/><button className="button primary" onClick={async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);setError('')}catch{setError('Выделите и скопируйте ссылку вручную.')}}}>{copied?<CheckCircle2 size={18}/>:<Copy size={18}/>} {copied?'Скопировано':'Копировать ссылку'}</button>{error&&<p role="alert">{error}</p>}</div>}
