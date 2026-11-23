/**
 * Synthetic separately claimed vendor/issuer source. No real historical
 * exchange calendar, holiday evidence, vendor license, or broker fills.
 */
import {makePhase68SyntheticFullDurationFixture}
  from './phase68_synthetic_full_duration_fixture.js';
import {
  hashPhase69Evidence,
  type Phase69Input,type Phase69Pins,type Phase69Policy
} from '../../server/engine/ema15m/adaptivePhase69CalendarBlindSpots.js';

const DAY=86400000;
const date=(s:string)=>Date.parse(s+'T00:00:00Z');
const stringDay=(t:number)=>new Date(t).toISOString().slice(0,10);
const weekday=(t:number)=>new Date(t).getUTCDay()>=1&&
  new Date(t).getUTCDay()<=5;
const iso=(s:string,m:number)=>new Date(date(s)+m*60000)
  .toISOString();

export function makePhase69SyntheticBlindSpotFixture(){
  const parent=makePhase68SyntheticFullDurationFixture();
  const policy:Phase69Policy={
    schemaVersion:'ADAPTIVE_PHASE69_PREREGISTERED_WEEKDAY_BLIND_SPOT_AUDIT_V1',
    source:'OFFLINE_OWNER_DECLARED_WEEKDAY_PROBE_NOT_EXCHANGE_VERIFIED',
    potentialSessionRule:
      'MON_FRI_CANDIDATES_INCLUDE_PUBLIC_HOLIDAYS_NOT_OFFICIAL',
    minimumOriginalCloseBidMarksPerDeclaredSession:1,
    maximumCloseBidAgeMinutes:10,
    minimumDisplayedBidDepthLots:1,
    maxCalendarDaysPerOriginalOptionPath:80,
    maximumUnexplainedWeekdayCandidateGapsPerPair:0
  };
  const input:Phase69Input={
    schemaVersion:'ADAPTIVE_PHASE69_FULL_DURATION_CALENDAR_BLIND_SPOTS_V1',
    source:'OFFLINE_ORIGINAL_VENDOR_AND_ISSUER_L1_UNVERIFIED',
    phase68:parent.input,phase68Pins:parent.pins,policy
  };
  const pins:Phase69Pins={
    schemaVersion:'INDEPENDENT_PHASE69_WEEKDAY_ACQUISITION_GAP_PINS_V1',
    expectedPhase68InputSha256:'',
    expectedPhase68PinsSha256:'',
    expectedPrespecifiedGapPolicySha256:'',
    expectedOriginalOosDecisions:4,
    expectedOriginalNoEntryDecisions:2,
    expectedAllOosListedCePePairs:32
  };
  const repin=()=>{
    pins.expectedPhase68InputSha256=hashPhase69Evidence(input.phase68);
    pins.expectedPhase68PinsSha256=hashPhase69Evidence(input.phase68Pins);
    pins.expectedPrespecifiedGapPolicySha256=
      hashPhase69Evidence(input.policy);
  };
  // For ALL data source modifications: keep independent original Phase66
  // fold/decision/full-listed manifest pin frozen (never repinned here).
  const syncSource=()=>{
    const issuer=parent.parent, vendor=issuer.vendor;
    vendor.pins.expectedNativeQuoteRows=vendor.raw.length-1;
    vendor.updateQuotes();
    vendor.updateCalendar();
    vendor.repinOuter();
    issuer.pins.expectedIssuerCalendarSessions=
      issuer.issuerCalendar.sessions.length;
    issuer.updateCalendar();
    issuer.repin();
    parent.repin();
    repin();
  };
  // A purely illustrative fabricated quote archive that fills every
  // weekday candidate session through original listed expiry, including
  // first-next-session close BID marks (the initial Phase66 source has
  // only that next session's OPENING BID marks).
  const fillEveryPotentialWeekdayAndClosingBid=()=>{
    const issuer=parent.parent,vendor=issuer.vendor,
      allDays=new Set([
        ...vendor.calendar.sessions.map(x=>x.sessionDate),
        ...issuer.issuerCalendar.sessions.map(x=>x.sessionDate)
      ]);
    for(const d of vendor.catalog.decisions){
      for(const c of d.originallyListedContracts){
        for(let t=date(d.sessionDate);t<=date(c.expiry);t+=DAY){
          if(weekday(t))allDays.add(stringDay(t));
        }
      }
    }
    const days=[...allDays].sort();
    vendor.calendar.sessions=days.map(sessionDate=>({
      sessionDate,openAt:iso(sessionDate,225),closeAt:iso(sessionDate,600)
    }));
    issuer.issuerCalendar.sessions=vendor.calendar.sessions.map(s=>({...s}));
    const additions:string[][]=[];
    const raws=vendor.raw;
    for(const d of vendor.catalog.decisions){
      for(const c of d.originallyListedContracts){
        for(let t=date(d.sessionDate);t<=date(c.expiry);t+=DAY){
          const s=stringDay(t);
          if(!allDays.has(s))continue;
          // The synthetic ORIGINAL DAY already has 15:25 close marks.
          const already=raws.some(r=>r[2]===c.instrumentKey&&
            r[3].slice(0,10)===s&&r[3].slice(11,16)==='09:55');
          if(already)continue;
          const event=iso(s,595);
          additions.push([
            'SYNTH_EXTRA_FULL_DURATION_'+(raws.length+additions.length),
            String(raws.length+additions.length),
            c.instrumentKey,event,
            new Date(Date.parse(event)+5000).toISOString(),
            '94','95','100','100'
          ]);
        }
      }
    }
    raws.push(...additions);
    syncSource();
  };
  // Removes a weekday session from BOTH pretend vendor & issuer calendars
  // AND its original raw quotes. Local hashes can all be recomputed. This
  // must remain a gap in Phase69's independent weekday candidates, not a
  // false assertion of a complete 8W historical option hold.
  const jointlyDeleteQuotedSession=(sessionDate:string)=>{
    const issuer=parent.parent,vendor=issuer.vendor;
    vendor.calendar.sessions=vendor.calendar.sessions.filter(s=>
      s.sessionDate!==sessionDate);
    issuer.issuerCalendar.sessions=issuer.issuerCalendar.sessions.filter(s=>
      s.sessionDate!==sessionDate);
    const raw=vendor.raw.filter((r,i)=>i===0||
      r[3].slice(0,10)!==sessionDate);
    for(let i=1;i<raw.length;i++)raw[i][1]=String(i);
    vendor.raw.splice(0,vendor.raw.length,...raw);
    syncSource();
  };
  const addWeekendSessionWithoutQuotes=(dateStr:string)=>{
    const issuer=parent.parent,vendor=issuer.vendor;
    const newSession={
      sessionDate:dateStr,openAt:iso(dateStr,225),
      closeAt:iso(dateStr,600)
    };
    vendor.calendar.sessions.push({...newSession});
    issuer.issuerCalendar.sessions.push({...newSession});
    vendor.calendar.sessions.sort((a,b)=>a.sessionDate.localeCompare(
      b.sessionDate));
    issuer.issuerCalendar.sessions.sort((a,b)=>a.sessionDate.localeCompare(
      b.sessionDate));
    syncSource();
  };
  repin();
  return {parent,input,pins,repin,syncSource,
    fillEveryPotentialWeekdayAndClosingBid,jointlyDeleteQuotedSession,
    addWeekendSessionWithoutQuotes};
}
