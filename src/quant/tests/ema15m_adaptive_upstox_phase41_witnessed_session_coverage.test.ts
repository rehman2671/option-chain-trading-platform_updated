import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {
  auditPhase41WitnessedSessionCoverage,
  hashPhase41Calendar,phase41GenesisSha256,
  phase41LinkSha256,phase41WitnessMessage,
  type Phase41Archive,type Phase41Calendar,
  type Phase41ChainLink,type Phase41IndependentPins
} from '../../server/engine/ema15m/adaptiveUpstoxPhase41WitnessedSessionCoverage.js';
import {
  hashPhase40OfflineArchive,type Phase40OvernightPair,
  type Phase40GttCapture
} from '../../server/engine/ema15m/adaptiveUpstoxPhase40OvernightStopAudit.js';

const H=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const UCC='SYNTHETIC_PRIVATE_UCC_41',
  GTT='GTT-SYNTHETIC-STOP-PHASE41',
  OPT='NSE_FO|SYNTH-24000-CE',
  SOURCE_URL='https://www.nseindia.in/resources/exchange-communication-holidays';
const micro=(s:string)=>Date.parse(s)*1000;
const stamp=(ms:number)=>new Date(ms).toISOString()
  .replace('Z','+00:00');
const plus=(s:string,min:number)=>new Date(Date.parse(s)+min*60000)
  .toISOString().replace('Z','+00:00');
const dateInIst=(t:number)=>new Date(t+19800000).toISOString()
  .slice(0,10);
const sessionRows=[
  {date:'2026-11-20',sessionKind:'REGULAR' as const,
   openingAt:'2026-11-20T09:15:00+05:30',
   closingAt:'2026-11-20T15:40:00+05:30'},
  {date:'2026-11-23',sessionKind:'REGULAR' as const,
   openingAt:'2026-11-23T09:15:00+05:30',
   closingAt:'2026-11-23T15:40:00+05:30'},
  {date:'2026-11-24',sessionKind:'REGULAR' as const,
   openingAt:'2026-11-24T09:15:00+05:30',
   closingAt:'2026-11-24T15:40:00+05:30'}
];
function capture(at:string):Phase40GttCapture{
  return {
    origin:'OPERATOR_ARCHIVED_UNVERIFIED',
    method:'GET',path:'/v3/order/gtt',
    query:{gtt_order_id:GTT},capturedAt:at,
    httpStatus:200,response:{status:'success',data:[{
      gtt_order_id:GTT,type:'SINGLE',product:'D',
      exchange:'NFO',instrument_token:OPT,
      trading_symbol:'SYNTH_OPTION_CE',quantity:65,
      created_at:micro('2026-11-19T11:00:00+05:30'),
      expires_at:micro('2026-12-25T15:40:00+05:30'),
      rules:[{
        strategy:'STOPLOSS',status:'SCHEDULED',
        trigger_type:'BELOW',trigger_price:215.5,
        transaction_type:'SELL',order_id:null,message:null
      }]
    }]}
  };
}
function makePair(i:number):Phase40OvernightPair{
  const from=sessionRows[i],to=sessionRows[i+1];
  const pre=new Date(Date.parse(from.closingAt)-5*60000)
    .toISOString().replace('Z','+00:00');
  const post=new Date(Date.parse(to.openingAt)+5*60000)
    .toISOString().replace('Z','+00:00');
  return {sessionDate:from.date,preCloseAt:from.closingAt,
    nextSessionDate:to.date,nextOpenAt:to.openingAt,
    beforeClose:capture(pre),afterOpen:capture(post)};
}
function fixture(){
  const captureKey=generateKeyPairSync('ed25519'),
    reviewKey=generateKeyPairSync('ed25519');
  const captureDer=captureKey.publicKey.export({
    type:'spki',format:'der'}) as Buffer;
  const reviewDer=reviewKey.publicKey.export({
    type:'spki',format:'der'}) as Buffer;
  const calendar:Phase41Calendar={
    schemaVersion:'ADAPTIVE_PHASE41_OPERATOR_TRANSCRIBED_EXCHANGE_SESSIONS_V1',
    source:'OPERATOR_TRANSCRIBED_EXCHANGE_NOTICE_UNVERIFIED',
    exchange:'NFO',referencedSourceUrl:SOURCE_URL,
    referencedOriginalSourceSha256:'ab'.repeat(32),
    sessions:structuredClone(sessionRows)
  };
  const pairs=[makePair(0),makePair(1)];
  const calHash=hashPhase41Calendar(calendar);
  const pins:Phase41IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE41_WITNESS_AND_CALENDAR_PINS_V1',
    accountScopeId:UCC,gttOrderId:GTT,
    referencedOriginalSourceSha256:calendar.referencedOriginalSourceSha256,
    expectedExchange:'NFO',expectedCalendarSha256:calHash,
    expectedSessionDates:calendar.sessions.map(r=>r.date),
    expectedFirstSession:calendar.sessions[0].date,
    expectedLastSession:calendar.sessions.at(-1)!.date,
    expectedCaptureKeySpkiSha256:H(captureDer),
    expectedReviewKeySpkiSha256:H(reviewDer),
    expectedGenesisSha256:phase41GenesisSha256(calHash,UCC,GTT),
    expectedLastLinkSha256:'00'.repeat(32),
    maxWitnessDelayMinutes:30
  };
  const archive:Phase41Archive={
    schemaVersion:'ADAPTIVE_PHASE41_DUAL_WITNESS_SESSION_CHAIN_V1',
    source:'PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED',
    calendar,phase40Gtt:{
      schemaVersion:'ADAPTIVE_V2_PHASE40_OVERNIGHT_GTT_V1',
      source:'OFFLINE_OPERATOR_ARCHIVE_UNVERIFIED',
      position:{
        accountScopeId:UCC,productType:'NRML',instrumentKey:OPT,
        tradingSymbol:'SYNTH_OPTION_CE',gttOrderId:GTT,
        lotSize:65,expectedLongQuantity:65,
        expectedStopTriggerPrice:215.5
      },
      maxCheckpointDistanceMinutes:15,
      declaredOvernightPairs:2,overnightPairs:pairs
    },links:[]
  };
  const resign=()=>{
    archive.links=[];
    const newHash=hashPhase41Calendar(archive.calendar);
    let previous=phase41GenesisSha256(newHash,UCC,GTT);
    pins.expectedCalendarSha256=newHash;
    pins.expectedGenesisSha256=previous;
    for(let i=0;i<archive.phase40Gtt.overnightPairs.length;i++){
      const pair=archive.phase40Gtt.overnightPairs[i];
      const witnessedAt=plus(pair.afterOpen.capturedAt,10);
      const link:Phase41ChainLink={
        sequence:i,previousLinkSha256:previous,
        calendarSha256:newHash,
        pairSha256:hashPhase40OfflineArchive(pair),
        sessionFrom:pair.sessionDate,
        sessionTo:pair.nextSessionDate,
        witnessedAt,witnessSignatures:[]
      };
      const payload=phase41WitnessMessage(link);
      link.witnessSignatures=[
        {role:'CAPTURE_OPERATOR',
         publicKeySpkiDerBase64:captureDer.toString('base64'),
         signatureBase64:sign(null,payload,captureKey.privateKey)
           .toString('base64'),signedAt:witnessedAt},
        {role:'INDEPENDENT_REVIEWER',
         publicKeySpkiDerBase64:reviewDer.toString('base64'),
         signatureBase64:sign(null,payload,reviewKey.privateKey)
           .toString('base64'),signedAt:witnessedAt}
      ];
      archive.links.push(link);previous=phase41LinkSha256(link);
    }
    pins.expectedLastLinkSha256=previous;
  };
  resign();
  return {archive,pins,resign};
}
function safe(r:ReturnType<typeof auditPhase41WitnessedSessionCoverage>){
  assert.equal(r.productionSafe,false);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.exchangeNativeStopAckVerified,false);
  assert.equal(r.guaranteedStopExecution,false);
  assert.equal(r.stopContinuityProven,false);
  assert.equal(r.brokerOriginAuthenticated,false);
  assert.equal(r.officialExchangeCalendarAuthenticated,false);
  assert.equal(r.officiallyCompleteSessionCoverageEstablished,false);
  assert.equal(r.independentWitnessHumanIdentityAuthenticated,false);
  assert.equal(JSON.stringify(r).includes(UCC),false);
  assert.equal(JSON.stringify(r).includes(GTT),false);
}
describe('Phase41 dual-witness complete-declared-session gap gate',()=>{
  it('two real pinned Ed25519 keys sign 2 of 2 consecutive boundary pairs',()=>{
    const {archive,pins}=fixture();
    const r=auditPhase41WitnessedSessionCoverage(archive,pins);
    safe(r);
    assert.equal(r.status,
      'DECLARED_CALENDAR_ALL_BOUNDARIES_DUAL_SIGNED_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.declaredSessionsReviewed,3);
    assert.equal(r.witnessedBoundaryPairs,2);
    assert.equal(r.verifiedEd25519Signatures,4);
    assert.equal(r.unobservedOvernightIntervals,2);
    assert.equal(r.pinnedWitnessKeySignaturesCryptographicallyValid,true);
  });
  it('missing Monday-to-Tuesday pair fails rather than inferring continuity',()=>{
    const {archive,pins}=fixture();
    archive.links.pop();
    archive.phase40Gtt.overnightPairs.pop();
    archive.phase40Gtt.declaredOvernightPairs=1;
    const r=auditPhase41WitnessedSessionCoverage(archive,pins);
    safe(r);
    assert.equal(r.status,'INVALID_EVIDENCE');
    assert.deepEqual(r.reasons,
      ['CALENDAR_SCOPE_INDEPENDENT_PINS_OR_SESSION_LIST_MISMATCH']);
  });
  it('operator omission of middle session fails independent dates/count',()=>{
    const {archive,pins}=fixture();
    archive.calendar.sessions.splice(1,1);
    archive.phase40Gtt.overnightPairs.splice(0,1);
    archive.phase40Gtt.declaredOvernightPairs=1;
    const r=auditPhase41WitnessedSessionCoverage(archive,pins);
    safe(r);assert.equal(r.status,'INVALID_EVIDENCE');
  });
  it('if independent calendar pins are maliciously rewritten, cannot certify official calendar',()=>{
    const {archive,pins}=fixture();
    const r=auditPhase41WitnessedSessionCoverage(archive,pins);
    assert.equal(r.officialExchangeCalendarAuthenticated,false);
    assert.equal(r.officiallyCompleteSessionCoverageEstablished,false);
  });
  it('tampering archived GTT response invalidates signed pair digest',()=>{
    const {archive,pins}=fixture();
    archive.phase40Gtt.overnightPairs[1].afterOpen.response
      .data[0].rules[0].status='CANCELLED';
    const r=auditPhase41WitnessedSessionCoverage(archive,pins);
    safe(r);
    assert.deepEqual(r.reasons,
      ['MISSING_REORDERED_OR_TAMPERED_SESSION_BOUNDARY']);
  });
  it('real signed archived cancelled GTT remains rejected by Phase40',()=>{
    const {archive,pins,resign}=fixture();
    archive.phase40Gtt.overnightPairs[1].afterOpen.response
      .data[0].rules[0].status='FAILED';
    resign();
    const r=auditPhase41WitnessedSessionCoverage(archive,pins);
    safe(r);
    assert.deepEqual(r.reasons,['PHASE40_GTT_CHECKPOINT_STATE_NOT_ACCEPTED']);
  });
  it('forged or changed pinned reviewer signature fails',()=>{
    const {archive,pins}=fixture();
    archive.links[0].witnessSignatures[1].signatureBase64=
      Buffer.alloc(64,0x22).toString('base64');
    const r=auditPhase41WitnessedSessionCoverage(archive,pins);
    safe(r);
    assert.deepEqual(r.reasons,
      ['INDEPENDENT_ED25519_WITNESS_SIGNATURE_INVALID']);
  });
  it('one actor reused as both reviewer and operator must not pass',()=>{
    const {archive,pins}=fixture();
    pins.expectedReviewKeySpkiSha256=pins.expectedCaptureKeySpkiSha256;
    const r=auditPhase41WitnessedSessionCoverage(archive,pins);
    safe(r);assert.equal(r.status,'INVALID_EVIDENCE');
  });
  it('mismatched witness key pin, key roles or repeated signature blocks fail',()=>{
    const a=fixture();
    a.pins.expectedReviewKeySpkiSha256='99'.repeat(32);
    assert.equal(auditPhase41WitnessedSessionCoverage(
      a.archive,a.pins).status,'BLOCKED_OR_UNKNOWN');
    const b=fixture();
    b.archive.links[0].witnessSignatures[0].role='INDEPENDENT_REVIEWER';
    assert.deepEqual(auditPhase41WitnessedSessionCoverage(
      b.archive,b.pins).reasons,
      ['INDEPENDENT_ED25519_WITNESS_SIGNATURE_INVALID']);
    const c=fixture();
    c.archive.links[0].witnessSignatures.push(
      {...c.archive.links[0].witnessSignatures[0]});
    assert.deepEqual(auditPhase41WitnessedSessionCoverage(
      c.archive,c.pins).reasons,['MISSING_DISTINCT_WITNESS_SIGNATURE_ROLES']);
  });
  it('chain link reordering or stale independent chain tip fails',()=>{
    const a=fixture();a.archive.links.reverse();
    safe(auditPhase41WitnessedSessionCoverage(a.archive,a.pins));
    assert.equal(auditPhase41WitnessedSessionCoverage(
      a.archive,a.pins).status,'BLOCKED_OR_UNKNOWN');
    const b=fixture();
    b.pins.expectedLastLinkSha256='aa'.repeat(32);
    assert.deepEqual(auditPhase41WitnessedSessionCoverage(
      b.archive,b.pins).reasons,['INDEPENDENT_CHAIN_TIP_MISMATCH']);
  });
  it('late witness receipt and cross-day timestamp spoof fail',()=>{
    const a=fixture();
    a.archive.links[0].witnessedAt=
      plus(a.archive.phase40Gtt.overnightPairs[0].afterOpen.capturedAt,50);
    assert.deepEqual(auditPhase41WitnessedSessionCoverage(
      a.archive,a.pins).reasons,
      ['WITNESS_RECORDING_OUTSIDE_PINNED_POST_OPEN_WINDOW']);
    const b=fixture();
    b.archive.calendar.sessions[1].openingAt='2026-11-24T09:15:00+05:30';
    assert.equal(auditPhase41WitnessedSessionCoverage(
      b.archive,b.pins).status,'INVALID_EVIDENCE');
  });
  it('mismatch exchange-session close/open time is rejected even with resigned witness',()=>{
    const {archive,pins,resign}=fixture();
    archive.calendar.sessions[1].closingAt='2026-11-23T15:35:00+05:30';
    // Keep signed pairs under old timing, but resign all their hashes.
    resign();
    pins.expectedSessionDates=archive.calendar.sessions.map(s=>s.date);
    const r=auditPhase41WitnessedSessionCoverage(archive,pins);
    safe(r);assert.deepEqual(r.reasons,
      ['MISSING_REORDERED_OR_TAMPERED_SESSION_BOUNDARY']);
  });
  it('support special sessions only by explicitly including their pinned date/time',()=>{
    const {archive,pins}=fixture();
    assert.equal(archive.calendar.sessions.some(x=>x.sessionKind==='SPECIAL'),
      false);
    assert.equal(auditPhase41WitnessedSessionCoverage(archive,pins)
      .officialExchangeCalendarAuthenticated,false);
    const x=fixture();
    x.archive.calendar.sessions[1].sessionKind='SPECIAL';
    x.resign();
    const result=auditPhase41WitnessedSessionCoverage(x.archive,x.pins);
    safe(result);
    assert.equal(result.status,
      'DECLARED_CALENDAR_ALL_BOUNDARIES_DUAL_SIGNED_UNVERIFIED');
  });
});
