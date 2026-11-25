import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseRecoveryResponse} from '../../lib/brokerRecoveryView.js';
import {apiFetch,getAuthToken,setAuthToken,isSameOriginApiUrl} from '../../lib/api.js';
const item={intentId:'intent-a',intentState:'CLAIMED_UNRESOLVED',filledQuantity:null,reservedPaise:326000,
 reservationState:'HELD',disposition:'RECONCILIATION_REQUIRED',brokerOrderId:'private-id'};
const envelope={status:'REVIEW_REQUIRED',items:[item],orderAuthorized:false,capitalReleaseAuthorized:false};
test('recovery view preserves unknown and review states; does not expose broker order IDs',()=>{
 const result=parseRecoveryResponse(envelope);assert.ok(result);
 assert.equal(result.items[0].reservedPaise,326000);
 assert.equal('brokerOrderId' in result.items[0],false);
 assert.equal(parseRecoveryResponse({...envelope,status:'EMPTY',items:[]})?.status,'EMPTY');
 assert.equal(parseRecoveryResponse({...envelope,status:'UNKNOWN',items:[]})?.status,'UNKNOWN');
 for(const raw of [null,{}, {...envelope,status:'EMPTY'}, {...envelope,items:[]},
  {...envelope,orderAuthorized:true},{...envelope,capitalReleaseAuthorized:true},
  {...envelope,items:[{...item,reservedPaise:-1}]},{...envelope,items:[{...item,disposition:'RELEASED'}]},
  {...envelope,items:[{...item,reservationState:'RELEASED'}]}])
  assert.equal(parseRecoveryResponse(raw),null);
});
test('browser API origin checks reject external, credentials and protocol-relative attacks',()=>{
 const origin='https://app.example.invalid';
 for(const url of ['/api/auth/me','https://app.example.invalid/api/auth/me'])assert.equal(isSameOriginApiUrl(url,origin),true);
 for(const url of ['https://other.example.invalid/api','//other.example.invalid/api','https://app.example.invalid.evil.invalid/api',
  'https://user@app.example.invalid/api','javascript:alert(1)','http://app.example.invalid/api'])
  assert.equal(isSameOriginApiUrl(url,origin),false);
});
test('session-scoped fallback deletes legacy local token, never caches GET and refuses external request',async()=>{
 const local=new Map([['auth_token','legacy-local']]),session=new Map([['auth_token','session-only']]);
 const storage=(m:Map<string,string>)=>({getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>m.set(k,v),removeItem:(k:string)=>m.delete(k)});
 const prior=Object.getOwnPropertyDescriptor(globalThis,'window'),oldFetch=globalThis.fetch;
 let calls=0;
 try{
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{origin:'https://app.example.invalid'},localStorage:storage(local),sessionStorage:storage(session)}});
  assert.equal(getAuthToken(),'session-only');assert.equal(local.has('auth_token'),false);
  globalThis.fetch=async(_input,init)=>{
   calls++;assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'include');
   const token=new Headers(init?.headers).get('authorization');
   return new Response(JSON.stringify({calls,token}),{headers:{'Cache-Control':'no-store'}});
  };
  setAuthToken('new-token');assert.equal(session.get('auth_token'),'new-token');assert.equal(local.has('auth_token'),false);
  const first=await (await apiFetch('/api/auth/me')).json();
  const second=await (await apiFetch('/api/auth/me')).json();
  assert.equal(first.calls,1);assert.equal(second.calls,2);assert.equal(second.token,'Bearer new-token');
  await assert.rejects(apiFetch('https://other.example.invalid/api'),/Cross-origin/);assert.equal(calls,2);
  setAuthToken(null);assert.equal(getAuthToken(),null);assert.equal(session.has('auth_token'),false);
  assert.equal((await (await apiFetch('/api/auth/me')).json()).token,null);
 }finally{
  setAuthToken(null);globalThis.fetch=oldFetch;
  if(prior)Object.defineProperty(globalThis,'window',prior);else Reflect.deleteProperty(globalThis,'window');
 }
});
