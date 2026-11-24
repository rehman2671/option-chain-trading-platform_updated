/**
 * Same-origin API helper. Session-scoped bearer fallback preserves hosted
 * iframe login when third-party cookies are unavailable. No persistent
 * localStorage JWTs or application-level cache of authenticated responses.
 */
let memoryToken:string|null=null;
let tokenInitialized=false;
export function getAuthToken():string|null{
  if(typeof window==='undefined')return null;
  // Delete legacy persistent copies independently of sessionStorage access.
  try{window.localStorage.removeItem('auth_token');}catch{}
  if(!tokenInitialized){
    tokenInitialized=true;
    try{memoryToken=window.sessionStorage.getItem('auth_token');}catch{}
  }
  return memoryToken;
}
export function setAuthToken(token:string|null):void{
  if(typeof window==='undefined')return;
  tokenInitialized=true;memoryToken=token;
  try{window.localStorage.removeItem('auth_token');}catch{}
  try{
    if(token)window.sessionStorage.setItem('auth_token',token);
    else window.sessionStorage.removeItem('auth_token');
  }catch{}
}
export function getAuthHeaders(extraHeaders:Record<string,string>={}):Record<string,string>{
  const token=getAuthToken();
  const headers:Record<string,string>={...extraHeaders};
  if(token){headers.Authorization='Bearer '+token;headers['x-auth-token']=token;}
  return headers;
}
/** No auth injection into another origin, including protocol-relative URLs.
 * Reject rather than silently executing a mutation against an unintended host. */
export function isSameOriginApiUrl(url:string,origin:string):boolean{
  try{
    const base=new URL(origin),target=new URL(url,base);
    return (base.protocol==='https:'||base.protocol==='http:')&&target.origin===base.origin&&
      !target.username&&!target.password;
  }catch{return false;}
}
export async function apiFetch(url:string,options:RequestInit={}):Promise<Response>{
  if(typeof window!=='undefined'&&!isSameOriginApiUrl(url,window.location.origin))
    throw Error('Cross-origin API request refused');
  const token=getAuthToken();
  const headers=new Headers(options.headers||{});
  if(token&&!headers.has('Authorization'))headers.set('Authorization','Bearer '+token);
  if(token&&!headers.has('x-auth-token'))headers.set('x-auth-token',token);
  // Cookie-backed requests are authenticated even without a bearer token.
  // A shared URL cache/dedupe key cannot safely represent that identity.
  // Respect the server's no-store policy and avoid replay of old account data.
  return fetch(url,{...options,credentials:options.credentials||'include',headers,cache:'no-store',redirect:'error'});
}
