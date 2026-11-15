import {useState} from 'react';
import {Moon,Sun} from 'lucide-react';
import {Button} from '@/shared/ui/button';

const storageKey='neiroot-theme';
type Theme='light'|'dark';

function applyTheme(theme:Theme){
 document.documentElement.classList.toggle('dark',theme==='dark');
 document.documentElement.style.colorScheme=theme;
 localStorage.setItem(storageKey,theme);
 const meta=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
 meta?.setAttribute('content',theme==='dark'?'#111512':'#f6f7f8');
}

export function ThemeToggle({showLabel=false,className}:{showLabel?:boolean;className?:string}){
 const[theme,setTheme]=useState<Theme>(()=>document.documentElement.classList.contains('dark')?'dark':'light');
 const next=theme==='dark'?'light':'dark';
 return <Button className={className} type="button" variant="ghost" size={showLabel?'default':'icon'} aria-label={next==='dark'?'Включить тёмную тему':'Включить светлую тему'} title={next==='dark'?'Тёмная тема':'Светлая тема'} onClick={()=>{setTheme(next);applyTheme(next)}}>{theme==='dark'?<Sun/>:<Moon/>}{showLabel&&(theme==='dark'?'Светлая тема':'Тёмная тема')}</Button>;
}
