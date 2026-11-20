/**
 * Third "exchange" calendar is synthetic and GENERATED from the owner's
 * other two synthetic vendor/issuer archives. Agreement is NOT evidence
 * of independent NSE/BSE issuer identity, licence or official holidays.
 */
import {createHash} from 'node:crypto';
import {makePhase69SyntheticBlindSpotFixture}
  from './phase69_synthetic_calendar_blind_spot_fixture.js';
import {
  hashPhase70Evidence,
  type Phase70Input,type Phase70Pins,
  type Phase70ClaimedExchangeArchive,type Phase70ClaimedCalendarDay
} from '../../server/engine/ema15m/adaptivePhase70SessionExceptionEvidence.js';

const DAY=86400000;
const start=(v:string)=>Date.parse(v+'T00:00:00Z');
const day=(t:number)=>new Date(t).toISOString().slice(0,10);
const wk=(t:number)=>{
  const k=new Date(t).getUTCDay();return k>=1&&k<=5;
};
const b64=(v:unknown)=>Buffer.from(JSON.stringify(v),'utf8')
  .toString('base64');
const sha=(b:Uint8Array)=>createHash('sha256').update(b)
  .digest('hex');
export function makePhase70SyntheticExchangeDayFixture(){
  const previous=makePhase69SyntheticBlindSpotFixture();
  const issuer=previous.parent.parent;
  const generate=():Phase70ClaimedCalendarDay[]=>{
    const all=issuer.vendor.catalog.decisions,
      first=Math.min(...all.map(d=>start(d.sessionDate))),
      last=Math.max(...all.flatMap(d=>
        d.originallyListedContracts.map(c=>start(c.expiry))));
    const sessions=new Map(issuer.issuerCalendar.sessions.map(x=>
      [x.sessionDate,x]));
    const dates:Phase70ClaimedCalendarDay[]=[];
    for(let t=first;t<=last;t+=DAY){
      const ds=day(t),ses=sessions.get(ds),week=wk(t);
      const status:Phase70ClaimedCalendarDay['status']=ses?
        week?'REGULAR_OPEN':'SPECIAL_WEEKEND_OPEN':
        week?'HOLIDAY_CLOSED':'WEEKEND_CLOSED';
      const row:Phase70ClaimedCalendarDay={
        sessionDate:ds,status,
        claimedNoticePublishedAt:'2025-12-01T00:00:00.000Z',
        claimedNoticeReceivedAt:'2025-12-01T00:01:00.000Z'
      };
      if(ses){row.openAt=ses.openAt;row.closeAt=ses.closeAt;}
      dates.push(row);
    }
    return dates;
  };
  const archive:Phase70ClaimedExchangeArchive={
    schemaVersion:'ADAPTIVE_PHASE70_SEPARATE_CLAIMED_EXCHANGE_DAY_ARCHIVE_V1',
    source:'OWNER_CUSTODIED_UNAUTHENTICATED_EXCHANGE_DAY_NOTICES',
    claimedIssuerReference:issuer.issuerCalendar.claimedIssuerReference,
    claimedArchiveReference:'FAKE_EXCHANGE_DAY_SOURCE_FOR_TEST_ONLY',
    coveredFrom:'',coveredThrough:'',days:generate()
  };
  const rebuild=()=>{
    archive.days=generate();
    archive.coveredFrom=archive.days[0].sessionDate;
    archive.coveredThrough=archive.days.at(-1)!.sessionDate;
  };
  rebuild();
  const input:Phase70Input={
    schemaVersion:'ADAPTIVE_PHASE70_ALL_DAY_EXCHANGE_EXCEPTION_REVIEW_V1',
    source:'OWNER_PRIVATE_THIRD_CALENDAR_NOT_ISSUER_AUTHENTICATED',
    phase69:previous.input,phase69Pins:previous.pins,
    separatelySuppliedClaimedExchangeDayArchiveBase64:b64(archive)
  };
  const pins:Phase70Pins={
    schemaVersion:'INDEPENDENT_PHASE70_ALL_DAY_EXCHANGE_EXCEPTION_PINS_V1',
    expectedPhase69InputSha256:'',
    expectedPhase69PinsSha256:'',
    expectedClaimedArchiveRawBytesSha256:'',
    expectedClaimedIssuerReference:archive.claimedIssuerReference,
    expectedClaimedArchiveReference:archive.claimedArchiveReference,
    expectedArchiveCalendarDays:archive.days.length,
    expectedOriginalOosDecisionDays:4,
    expectedOriginalNoEntryDays:2,
    expectedAllListedCePePairs:32
  };
  const updateArchive=()=>{
    input.separatelySuppliedClaimedExchangeDayArchiveBase64=b64(archive);
  };
  const repin=()=>{
    pins.expectedPhase69InputSha256=hashPhase70Evidence(input.phase69);
    pins.expectedPhase69PinsSha256=hashPhase70Evidence(input.phase69Pins);
    pins.expectedClaimedArchiveRawBytesSha256=sha(Buffer.from(
      input.separatelySuppliedClaimedExchangeDayArchiveBase64,'base64'));
  };
  const syncParent=()=>{
    previous.repin();
    repin();
  };
  updateArchive();repin();
  return {previous,issuer,archive,input,pins,
    updateArchive,repin,syncParent,rebuild};
}
