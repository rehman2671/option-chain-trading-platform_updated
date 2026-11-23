/**
 * Read-only offline verification of an externally persisted/simulated NRML
 * positional journal. No writes, no broker connectivity or orders.
 *
 * npx tsx scripts/audit-adaptive-positional-paper.ts journal.json \
 *   --as-of 2026-11-16T09:30:00.000Z \
 *   --policy policy.json \
 *   --calendar official-session-fixture.json
 */
import { readFile,stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  replayAdaptivePositionalPaperJournal,
  type PaperPositionalJournal,type PositionalPaperPolicy
} from '../src/server/engine/ema15m/adaptivePositionalPaperJournal.js';
import type { DeclaredTradingSession } from
  '../src/server/engine/ema15m/adaptiveSessionIntegrity.js';

async function jsonFile(file:string,maxBytes:number):Promise<unknown>{
  const path=resolve(file);
  const st=await stat(path);
  if(!st.isFile()||st.size<2||st.size>maxBytes)
    throw new Error('MISSING_OR_OVERSIZED_OFFLINE_PAPER_INPUT');
  return JSON.parse(await readFile(path,'utf8')) as unknown;
}
function args():{
  journalPath:string;at:string;policyPath:string;calendarPath:string
}{
  const raw=process.argv.slice(2);
  if(raw.length!==7||!raw[0]||raw[0].startsWith('-'))
    throw new Error('USAGE: <journal.json> --as-of <ISO> --policy <policy.json> --calendar <calendar.json>');
  const opts=new Map<string,string>();
  for(let i=1;i<raw.length;i+=2){
    const key=raw[i],value=raw[i+1];
    if(!['--as-of','--policy','--calendar'].includes(key)||opts.has(key)||
       !value||value.startsWith('--'))
      throw new Error('INVALID_OR_DUPLICATE_OFFLINE_PAPER_FLAG');
    opts.set(key,value);
  }
  if(opts.size!==3)throw new Error('MISSING_OFFLINE_PAPER_FLAG');
  return{
    journalPath:raw[0],at:opts.get('--as-of')!,
    policyPath:opts.get('--policy')!,calendarPath:opts.get('--calendar')!
  };
}
async function main(){
  const a=args();
  const [journal,policy,calendar]=await Promise.all([
    jsonFile(a.journalPath,10*1024*1024),
    jsonFile(a.policyPath,128*1024),
    jsonFile(a.calendarPath,256*1024)
  ]);
  const result=replayAdaptivePositionalPaperJournal(
    journal as PaperPositionalJournal,a.at,
    policy as PositionalPaperPolicy,
    calendar as DeclaredTradingSession[]
  );
  // This summary intentionally omits account ID, instrument key and
  // individual quote/evidence records. It cannot approve any order.
  console.log(JSON.stringify(result,null,2));
  if(result.status==='INVALID_JOURNAL'||
     result.status==='WAITING_FOR_RECONCILIATION'||
     result.status==='BLOCKED_PROTECTION'||
     result.status==='PAPER_CLOSED_PENDING_RECONCILIATION')
    process.exitCode=1;
}
main().catch(error=>{
  console.error('OFFLINE_POSITIONAL_PAPER_AUDIT_ERROR: '+
    (error instanceof Error?error.message:'UNKNOWN_ERROR'));
  process.exitCode=1;
});
