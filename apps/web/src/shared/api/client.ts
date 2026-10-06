import type {components} from './schema.gen';
export type Employee=components['schemas']['Employee'];
export type Tenant=components['schemas']['Tenant'];
export type Session=components['schemas']['Session'];
export type AuthenticatedSession=components['schemas']['AuthenticatedSession'];
export type EmployeeList=components['schemas']['EmployeeList'];
export type CreateEmployeeInput=components['schemas']['CreateEmployeeInput'];
export type CreateEmployeeResult=components['schemas']['CreateEmployeeResult'];
export type Invitation=components['schemas']['Invitation'];
let csrfToken='';
export function setCSRF(token:string){csrfToken=token}
export class APIError extends Error{constructor(public code:string,message:string,public status:number){super(message)}}
export async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 const headers=new Headers(options.headers);if(options.body)headers.set('Content-Type','application/json');if(options.method&&options.method!=='GET'&&csrfToken)headers.set('X-CSRF-Token',csrfToken);
 const response=await fetch(path,{...options,headers,credentials:'same-origin'});
 if(!response.ok){let data:Partial<components['schemas']['APIError']>={};try{data=await response.json()}catch{};if(response.status===401)window.dispatchEvent(new Event('neiroot:session-expired'));throw new APIError(data.code||'request_failed',data.message||'Не удалось выполнить действие. Попробуйте ещё раз.',response.status)}
 if(response.status===204)return undefined as T;return response.json();
}
export const roleNames={owner:'Владелец',admin:'Администратор',user:'Пользователь'} as const;
export function canManage(role?:string){return role==='owner'||role==='admin'}
