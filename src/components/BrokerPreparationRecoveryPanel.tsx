import React,{useEffect,useState,useRef} from 'react';
import {apiFetch} from '../lib/api.js';
import {parseRecoveryResponse,type RecoveryView} from '../lib/brokerRecoveryView.js';

export const BrokerPreparationRecoveryPanel:React.FC<{ownerId:string}>=({ownerId})=>{
 const [view,setView]=useState<RecoveryView|null>(null);
 const [status,setStatus]=useState<'IDLE'|'LOADING'|'UNAVAILABLE'>('IDLE');
 const [checkedAt,setCheckedAt]=useState<number|null>(null);
 const request=useRef<AbortController|null>(null);
 const refresh=async()=>{
  request.current?.abort();
  const controller=new AbortController();request.current=controller;
  setView(null);setCheckedAt(null);setStatus('LOADING');
  try{
   const res=await apiFetch('/api/auth/broker-preparation/recovery',{signal:controller.signal});
   if(!res.ok)throw Error('Recovery unavailable');
   const parsed=parseRecoveryResponse(await res.json());
   if(!parsed||parsed.status==='UNKNOWN')throw Error('Recovery unavailable');
   if(!controller.signal.aborted){setView(parsed);setCheckedAt(Date.now());setStatus('IDLE');}
  }catch{if(!controller.signal.aborted){setView(null);setStatus('UNAVAILABLE');}}
 };
 useEffect(()=>{
  setView(null);setCheckedAt(null);setStatus('IDLE');
  void refresh();
  return ()=>request.current?.abort();
 },[ownerId]);
 return <section className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h3 className="text-sm font-bold text-slate-100">Broker preparation recovery</h3>
    <p className="text-xs text-slate-400">Owner-scoped local journal • Read-only • Not live broker exposure</p></div>
   <button type="button" disabled={status==='LOADING'} onClick={()=>void refresh()}
    className="px-3 py-2 text-xs rounded-lg border border-slate-600 text-slate-100 disabled:opacity-50">
    {status==='LOADING'?'Checking…':'Refresh recovery'}</button>
  </div>
  {status==='UNAVAILABLE'&&<p role="alert" className="text-xs text-amber-300">Recovery unavailable or access not established. Do not assume there are no pending orders or reservations.</p>}
  {view?.status==='EMPTY'&&<p className="text-xs text-slate-300">No records in this owner’s preparation journal at last check. This does not establish broker account flatness.</p>}
  {view?.status==='REVIEW_REQUIRED'&&<div className="overflow-x-auto">
   <table className="w-full text-xs text-left">
    <thead className="text-slate-400"><tr>{['Intent','Journal state','Review required','Filled units','Reserved','Reservation'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
    <tbody>{view.items.map((r,i)=><tr className="border-t border-slate-700" key={r.intentId+':'+i}>
     <td className="p-2 font-mono">{r.intentId}</td><td className="p-2">{r.intentState??'Unknown'}</td>
     <td className="p-2 text-amber-300">{r.disposition.replaceAll('_',' ')}</td>
     <td className="p-2">{r.filledQuantity??'Unknown'}</td><td className="p-2">{r.reservedPaise===null?'Unknown':(r.reservedPaise/100).toLocaleString('en-IN',{style:'currency',currency:'INR'})}</td>
     <td className="p-2">{r.reservationState??'Unknown'}</td>
    </tr>)}</tbody>
   </table>
  </div>}
  {checkedAt!==null&&<p className="text-xs text-slate-500">Local review checked {new Date(checkedAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})} IST. Refresh before relying on this view.</p>}
  <p className="text-xs text-slate-400">No retry, order placement, account-flat certification, or capital release is available from this panel.</p>
 </section>;
};
