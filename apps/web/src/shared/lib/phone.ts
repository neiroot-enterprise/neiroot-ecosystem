export const normalizePhone=(value:string)=>value.replace(/[\s()-]/g,'');
export function formatPhone(value:string):string {
 if (/[a-zа-я@]/i.test(value)) return value;
 const raw=normalizePhone(value);
 if(raw.startsWith('+')&&!raw.startsWith('+7')&&raw!=='+')return raw;
 let digits=raw.replace(/\D/g,'');
 if(digits.startsWith('8'))digits='7'+digits.slice(1);
 if(!digits.startsWith('7'))digits='7'+digits;
 if(digits.length>11)return raw;
 const number=digits.slice(1,11);
 return '+7'+(number.length?' ('+number.slice(0,3):'')+(number.length>=3?')':'')+(number.length>3?' '+number.slice(3,6):'')+(number.length>6?'-'+number.slice(6,8):'')+(number.length>8?'-'+number.slice(8,10):'');
}
