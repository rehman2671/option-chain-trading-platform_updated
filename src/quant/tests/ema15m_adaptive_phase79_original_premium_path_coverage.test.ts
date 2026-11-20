import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
  auditPhase79OriginalPremiumPathCoverage,hashPhase79Object,
  type Phase79Input,type Phase79Pins,type Phase79Report,
  type Phase79DeclaredSession
} from '../../server/engine/ema15m/adaptivePhase79OriginalPremiumPathCoverage.js';
import {createHash} from 'node:crypto';

const HEAD=['sourceRecordId','sourceSequence','instrumentKey','eventAt',
  'originalAvailableAt','bid','ask','bidQty','askQty'];
const utcDay=(s:string)=>Date.parse(s+'T00:00:00Z');
const addDay=(s:string,n:number)=>new Date(utcDay(s)+n*86400000)
  .toISOString().slice(0,10);
const ist=(date:string,hour:number,minute:number)=>
  `${date}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+05:30`;
const digest=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const rounds=[{h:'1W',days:7},{h:'2W',days:14},
  {h:'4W',days:28},{h:'8W',days:56}] as const;

type Fixture=ReturnType<typeof fixture>;
function fixture(){
  const start='2026-11-19',end='2027-01-15';
  const sessions:Phase79DeclaredSession[]=[];
  for(let d=start;d<=end;d=addDay(d,1)){
    const dow=new Date(utcDay(d)).getUTCDay();
    if(dow!==0&&dow!==6)sessions.push({sessionDate:d,
      openAt:ist(d,9,15),closeAt:ist(d,15,30)});
  }
  const decisions=(['2026-11-19','2026-11-20'] as const).map(d=>({
    sessionDate:d,decisionAt:ist(d,9,30),
    claimedRegime:d.endsWith('19')?'RANGE' as const:'TREND' as const,
    originalEntryDisposition:d.endsWith('19')?'NO_ENTRY' as const:'ENTRY_CLAIMED' as const,
    originallyListedContracts:rounds.flatMap(({h,days})=>
      (['CE','PE'] as const).map(side=>({
        instrumentKey:`OPT_${d.replaceAll('-','')}_${h}_${side}`,
        optionType:side,expiry:addDay(d,days),strikePrice:22000,lotSize:50
      })))
  }));
  const catalog:Phase79Input['originalCatalog']={
    schemaVersion:'ADAPTIVE_PHASE66_NEW_VENDOR_ORIGINAL_OOS_CATALOG_V1',
    source:'OWNER_DECLARED_POINT_IN_TIME_CONTRACT_UNIVERSE_UNVERIFIED',
    folds:[],decisions
  };
  const rows:string[][]=[];
  let n=0;
  const append=(key:string,date:string,h:number,m:number,bid:number,ask:number,depth=100)=>{
    n++;
    const seq=rows.filter(r=>r[2]===key&&r[3].startsWith(date)).length+1;
    const event=ist(date,h,m);
    rows.push([`REC-${n}`,String(seq),key,event,event,String(bid),
      String(ask),String(depth),String(depth)]);
  };
  for(const decision of decisions){
    const isEntry=decision.originalEntryDisposition==='ENTRY_CLAIMED';
    for(const c of decision.originallyListedContracts){
      append(c.instrumentKey,decision.sessionDate,9,28,99,100);
      if(isEntry)append(c.instrumentKey,decision.sessionDate,10,0,170,171);
      for(const s of sessions){
        if(s.sessionDate<decision.sessionDate||s.sessionDate>c.expiry)continue;
        if(isEntry&&s.sessionDate==='2026-11-23')
          append(c.instrumentKey,s.sessionDate,9,16,120,121);
        append(c.instrumentKey,s.sessionDate,15,29,
          isEntry&&s.sessionDate==='2026-11-20'?160:100,
          isEntry&&s.sessionDate==='2026-11-20'?161:101);
      }
    }
  }
  const input:Phase79Input={
    schemaVersion:'PHASE79_OFFLINE_ALL_ORIGINAL_LISTED_PREMIUM_PATH_V1',
    source:'PRIVATE_OPERATOR_SUPPLIED_NATIVE_OPTION_L1_NOT_AUTHENTICATED',
    datasetKind:'SYNTHETIC_FIXTURE',
    originalNativeL1Csv:new Uint8Array(),originalCatalog:catalog,
    declaredSessions:sessions,
    policy:{source:'OWNER_PREDECLARED_QUOTE_AVAILABILITY_NOT_LIVE_TRADING',
      minBestBidAndAskDepthLots:1,maxDecisionQuoteAgeSeconds:180,
      maxClaimedEventToArrivalSeconds:180,
      closingBidWindowMinutes:3,nextOpenBidWindowMinutes:5,
      armingGainPremiumPoints:50,givebackAlertPremiumPoints:20,
      targetAlertPremiumPoints:100}
  };
  const pins:Phase79Pins={
    schemaVersion:'PHASE79_SEPARATELY_FROZEN_ORIGINAL_UNIVERSE_PINS_V1',
    expectedNativeCsvSha256:'',expectedOriginalCatalogSha256:'',
    expectedDeclaredSessionsSha256:'',expectedPolicySha256:'',
    expectedOriginalDecisionDates:2,expectedOriginalNoEntryDecisions:1,
    expectedOriginallyListedPairs:16,expectedOriginallyNoEntryPairs:8
  };
  const rebuild=()=>{input.originalNativeL1Csv=Buffer.from(
    [HEAD.join(','),...rows.map(r=>r.join(','))].join('\n')+'\n','utf8');};
  const repin=()=>{
    pins.expectedNativeCsvSha256=digest(input.originalNativeL1Csv);
    pins.expectedOriginalCatalogSha256=hashPhase79Object(input.originalCatalog);
    pins.expectedDeclaredSessionsSha256=hashPhase79Object(input.declaredSessions);
    pins.expectedPolicySha256=hashPhase79Object(input.policy);
  };
  rebuild();repin();
  return {input,pins,rows,rebuild,repin};
}
const audit=(f:Fixture)=>auditPhase79OriginalPremiumPathCoverage(f.input,f.pins);
const neverTrades=(r:Phase79Report)=>{
  assert.equal(r.sourceAndResearchLicenceIndependentlyAuthenticated,false);
  assert.equal(r.originalStrategyClientReceiveClockAuthenticated,false);
  assert.equal(r.officialExchangeExpiryAndSessionCalendarAuthenticated,false);
  assert.equal(r.actualEntryAndExitFillsVerified,false);
  assert.equal(r.quotedBidsAreNotExecutableStopFills,true);
  assert.equal(r.realOutOfSampleOptionReturnOrProfitabilityProven,false);
  assert.equal(r.noClaimedDataAutomaticallyBecomesBrokerPositions,true);
  assert.equal(r.noEntryAlternativesNeverHypotheticalPurchases,true);
  assert.equal(r.fullPaidOptionPremiumDebitMayBeLost,true);
  assert.equal(r.nativeBrokerNrmlGttStopChildAckVerified,false);
  assert.equal(r.bestContractOrHorizonAuthorized,false);
  assert.equal(r.existingMis1515Unchanged,true);
  assert.equal(r.forced1515PositionalExit,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  for(const c of r.cells){
    assert.equal(c.entryClaimedPositionsActuallyExecuted,0);
    assert.equal(c.historicalMarketOriginAuthenticated,false);
    assert.equal(c.selectedBestContractOrHorizon,false);
  }
  assert.ok(!JSON.stringify(r).includes('OPT_'));
};
function rejected(f:Fixture,code:string){
  const r=audit(f);neverTrades(r);
  assert.ok(r.status==='INVALID_EVIDENCE'||r.status==='INCOMPLETE_EVIDENCE',
    JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(code),JSON.stringify(r));
}

describe('Phase79 all-original 1W 2W 4W 8W CE/PE L1 marks: coverage not fills',()=>{
  it('covers full originally listed CE PE / no-entry universe across all 4 horizons; still synthetic and unauthenticated',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED');
    assert.equal(r.originalDecisionDates,2);
    assert.equal(r.originalNoEntryDecisions,1);
    assert.equal(r.originallyListedPairs,16);
    assert.equal(r.originallyNoEntryPairs,8);
    assert.equal(r.originalEntryClaimedPairs,8);
    assert.equal(r.claimedAsOfEntryAskPairs,8);
    assert.equal(r.entryPairsMissingClaimedAsOfAsk,0);
    assert.equal(r.quotedUnderTargetPremiumGivebackPairs,8);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,8);
    assert.equal(r.listedPairsWithMissingDeclaredSessionCloseBid,0);
    assert.equal(r.syntheticDataset,true);
    assert.equal(r.cells.reduce((a,c)=>a+c.originalNoEntryPairs,0),8);
  });
  it('real-looking candidate label and new self-pins never authenticate vendor/source or profitability',()=>{
    const f=fixture();f.input.datasetKind='UNVERIFIED_EXTERNAL_SOURCE_CANDIDATE';
    const r=audit(f);neverTrades(r);
    assert.equal(r.syntheticDataset,false);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED');
    assert.equal(r.realOutOfSampleOptionReturnOrProfitabilityProven,false);
  });
  it('a +70 quoted peak then +20 premium mark is a giveback, never a sold stop at trail 150',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.quotedUnderTargetPremiumGivebackPairs,8);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,8);
    assert.ok(!('realizedPnL' in r));
  });
  it('a peak above +100 premium target cannot count as under-target giveback',()=>{
    const f=fixture();
    for(const r of f.rows)if(r[3].includes('2026-11-20T10:00')){
      r[5]='210';r[6]='211';
    }
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.quotedUnderTargetPremiumGivebackPairs,0);
  });
  it('an apparent first next-open BID below trail does not mean gap if first BID was high',()=>{
    const f=fixture();
    for(const r of f.rows)if(r[3].includes('2026-11-23T09:16')){
      r[5]='160';r[6]='161';
    }
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,0);
    assert.equal(r.quotedUnderTargetPremiumGivebackPairs,8); // later close 100
  });
  it('a first next-open BID missing cannot be replaced by later close as a gap',()=>{
    const f=fixture();
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][3].includes('2026-11-23T09:16'))f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,0);
  });
  it('event-time hindsight must not invent a giveback when the high quote was received after the lower quote',()=>{
    const f=fixture();
    const key='OPT_20261120_1W_CE';
    const high=f.rows.find(row=>row[2]===key&&
      row[3].includes('2026-11-20T10:00'))!;
    high[4]=ist('2026-11-20',10,3); // high arrives after 10:01 low
    const closing=f.rows.find(row=>row[2]===key&&
      row[3].includes('2026-11-20T15:29'))!;
    closing[1]='4'; // preserve source sequence with injected third event
    f.rows.push(['REC-INJECTED','3',key,ist('2026-11-20',10,1),
      ist('2026-11-20',10,1),'120','121','100','100']);
    for(const row of f.rows){
      if(row[2]===key&&row[3]>ist('2026-11-20',10,1)&&
         row!==high){row[5]='170';row[6]='171';}
    }
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    // Processing by event time would falsely count high 170 -> BID 120.
    // Claimed receive-time replay sees 120 first, then 170, never a giveback.
    assert.equal(r.quotedUnderTargetPremiumGivebackPairs,7);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,7);
  });
  it('a first opening BID received after bounded next-open window is not a verified gap observation',()=>{
    const f=fixture();
    const row=f.rows.find(r=>r[2].includes('20261120_1W_PE')&&
      r[3].includes('2026-11-23T09:16'))!;
    row[4]=ist('2026-11-23',9,22);
    f.input.policy.maxClaimedEventToArrivalSeconds=600;
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,7);
  });
  it('arrival after original decision must not masquerade as original as-of ASK',()=>{
    const f=fixture();
    const row=f.rows.find(r=>r[2].includes('_1W_CE')&&
      r[3].includes('2026-11-20T09:28'))!;
    row[4]=ist('2026-11-20',9,31);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.claimedAsOfEntryAskPairs,7);
    assert.equal(r.entryPairsMissingClaimedAsOfAsk,1);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
  });
  it('one zero BID-depth closing mark censors option history, never fabricates an exit at stop',()=>{
    const f=fixture();
    const row=f.rows.find(r=>r[2].includes('20261120_2W_PE')&&
      r[3].includes('2026-11-20T15:29'))!;
    row[7]='0';row[8]='0';
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.listedPairsWithMissingDeclaredSessionCloseBid,1);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
  });
  it('dropping NO_ENTRY quotes still counts their original missing coverage, not executed NO_ENTRY trades',()=>{
    const f=fixture();
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][2].includes('20261119_8W_CE'))f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.originallyNoEntryPairs,8);
    assert.equal(r.originalEntryClaimedPairs,8);
    assert.equal(r.listedPairsWithMissingDeclaredSessionCloseBid,1);
  });
  it('removing last-expiry-region calendar cannot claim complete positional quote coverage',()=>{
    const f=fixture();
    f.input.declaredSessions=f.input.declaredSessions.filter(s=>
      s.sessionDate<='2026-12-04');
    // Drop now out-of-calendar quote rows (still incomplete declared expiry).
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][3].slice(0,10)>'2026-12-04')f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.ok(r.listedPairsWithMissingDeclaredSessionCloseBid>0);
  });
  it('any raw source content change without separate CSV SHA pin is invalid',()=>{
    const f=fixture();f.rows[0][5]='88';f.rebuild();
    rejected(f,'PHASE79_POLICY_OR_SEPARATE_RAW_SOURCE_PINS_INVALID');
  });
  it('any original listed contract catalog change without separate pin is invalid',()=>{
    const f=fixture();f.input.originalCatalog.decisions[0]
      .originallyListedContracts[0].strikePrice+=50;
    rejected(f,'PHASE79_POLICY_OR_SEPARATE_RAW_SOURCE_PINS_INVALID');
  });
  it('even after independently re-pinning, dropping one NO_ENTRY contract fails original denominator',()=>{
    const f=fixture();f.input.originalCatalog.decisions[0]
      .originallyListedContracts.pop();f.repin();
    rejected(f,'PHASE79_ORIGINAL_DECISION_OR_LISTED_UNIVERSE_INVALID');
  });
  it('each original NO_ENTRY decision must preserve every 1W/2W/4W/8W CE and PE side even when counts stay eight',()=>{
    const f=fixture();
    const d=f.input.originalCatalog.decisions[0];
    const duplicate=structuredClone(d.originallyListedContracts[1]);
    duplicate.instrumentKey='OPT_20261119_DUPLICATE_2W_CE';
    d.originallyListedContracts[0]=duplicate;
    f.repin();
    rejected(f,'PHASE79_ORIGINAL_DECISION_MISSING_HORIZON_OR_SIDE');
  });
  it('invalid ask below bid is never a legitimate quote',()=>{
    const f=fixture();f.rows[0][5]='150';f.rows[0][6]='100';
    f.rebuild();f.repin();
    rejected(f,'PHASE79_INVALID_NATIVE_BID_ASK_DEPTH_OR_SOURCE_CLOCK');
  });
  it('negative original event-to-client availableAt clock lag is invalid',()=>{
    const f=fixture();f.rows[0][4]=ist('2026-11-19',9,27);
    f.rebuild();f.repin();
    rejected(f,'PHASE79_INVALID_NATIVE_BID_ASK_DEPTH_OR_SOURCE_CLOCK');
  });
  it('duplicate original record ID is invalid, even when data points look favorable',()=>{
    const f=fixture();f.rows[1][0]=f.rows[0][0];f.rebuild();f.repin();
    rejected(f,'PHASE79_DUPLICATED_OR_MALFORMED_NATIVE_QUOTE');
  });
  it('replayed per-instrument-per-session sequence fails closed',()=>{
    const f=fixture();f.rows[1][1]=f.rows[0][1];f.rebuild();f.repin();
    rejected(f,'PHASE79_OUTSIDE_DECLARED_SESSION_OR_REPLAYED_SEQUENCE');
  });
  it('duplicated declared trading session cannot make more apparent quote coverage',()=>{
    const f=fixture();f.input.declaredSessions.push({...f.input.declaredSessions[0]});
    f.repin();rejected(f,'PHASE79_DUPLICATE_INVALID_OR_CROSS_DAY_SESSION');
  });
  it('one malformed original as-of quote cannot be promoted into an actual fill',()=>{
    const f=fixture();f.rows[0][4]='2030-01-01T09:28:00+05:30';
    f.rebuild();f.repin();
    rejected(f,'PHASE79_INVALID_NATIVE_BID_ASK_DEPTH_OR_SOURCE_CLOCK');
  });
  it('changing predeclared premium alert threshold without separate policy pin fails',()=>{
    const f=fixture();f.input.policy.targetAlertPremiumPoints=200;
    rejected(f,'PHASE79_POLICY_OR_SEPARATE_RAW_SOURCE_PINS_INVALID');
  });
  it('missing an original 1W horizon is invalid even if operator repins a smaller universe',()=>{
    const f=fixture();
    for(const d of f.input.originalCatalog.decisions)
      d.originallyListedContracts=d.originallyListedContracts.filter(c=>
        !c.instrumentKey.includes('_1W_'));
    f.pins.expectedOriginallyListedPairs=12;
    f.pins.expectedOriginallyNoEntryPairs=6;
    f.repin();
    rejected(f,'PHASE79_ORIGINAL_DECISION_OR_LISTED_UNIVERSE_INVALID');
  });

  // Phase81: quoted receive-time availability must not time-travel into
  // the closing auction or cover an overnight opening data blackout.
  it('Phase81 baseline has first next-open BID after newly armed peak; no invented missing-open censor',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.entryPairsMissingBoundedNextOpenAfterNewArmedPeak,0);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED');
  });
  it('Phase81 closing quote received AFTER session close cannot cover the close despite valid event time and depth',()=>{
    const f=fixture();
    const row=f.rows.find(x=>x[2]==='OPT_20261120_1W_CE'&&
      x[3].includes('2026-11-20T15:29'))!;
    row[4]=ist('2026-11-20',15,31);
    f.input.policy.maxClaimedEventToArrivalSeconds=600;
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.listedPairsWithMissingDeclaredSessionCloseBid,1);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
  });
  it('Phase81 zero displayed BID price with positive quoted depth cannot masquerade as a sellable closing BID',()=>{
    const f=fixture();
    const row=f.rows.find(x=>x[2]==='OPT_20261120_2W_CE'&&
      x[3].includes('2026-11-20T15:29'))!;
    row[5]='0';row[6]='1'; // nominal depth remains positive
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.listedPairsWithMissingDeclaredSessionCloseBid,1);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
  });
  it('Phase81 stale post-close low BID cannot invent intraday +70 to +20 premium giveback',()=>{
    const f=fixture(),key='OPT_20261120_1W_CE';
    const late=f.rows.find(x=>x[2]===key&&
      x[3].includes('2026-11-20T15:29'))!;
    for(const row of f.rows){
      if(row[2]===key&&row[3]>ist('2026-11-20',10,0)&&row!==late){
        row[5]='170';row[6]='171';
      }
    }
    late[5]='50';late[6]='51';
    late[4]=ist('2026-11-20',15,31);
    f.input.policy.maxClaimedEventToArrivalSeconds=600;
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.quotedUnderTargetPremiumGivebackPairs,7);
    assert.equal(r.listedPairsWithMissingDeclaredSessionCloseBid,1);
  });
  it('Phase81 missing first depth-qualified bounded next-open BID after a new armed peak is censor, not no overnight gap',()=>{
    const f=fixture(),key='OPT_20261120_1W_CE';
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][2]===key&&f.rows[i][3].includes('2026-11-23T09:16'))
        f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsMissingBoundedNextOpenAfterNewArmedPeak,1);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,7);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
    assert.ok(r.reasonCodes.includes('MISSING_FIRST_BOUNDED_NEXT_OPEN_BID_CENSORS_OVERNIGHT_GAP_INFERENCE'));
  });
  it('Phase81 opening quote received after bounded window does not prove opening-gap absence',()=>{
    const f=fixture();
    const row=f.rows.find(x=>x[2]==='OPT_20261120_1W_CE'&&
      x[3].includes('2026-11-23T09:16'))!;
    row[4]=ist('2026-11-23',9,22);
    f.input.policy.maxClaimedEventToArrivalSeconds=600;
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsMissingBoundedNextOpenAfterNewArmedPeak,1);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,7);
  });
  it('Phase81 a newly higher armed peak in a later session requires that following session first open too',()=>{
    const f=fixture();
    const row=f.rows.find(x=>x[2]==='OPT_20261120_1W_CE'&&
      x[3].includes('2026-11-23T09:16'))!;
    row[5]='190';row[6]='191';
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsMissingBoundedNextOpenAfterNewArmedPeak,1);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
  });
  it('Phase81 zero-depth first open is censored even though a later closing BID is available',()=>{
    const f=fixture();
    const row=f.rows.find(x=>x[2]==='OPT_20261120_1W_CE'&&
      x[3].includes('2026-11-23T09:16'))!;
    row[7]='0';row[8]='0';
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsMissingBoundedNextOpenAfterNewArmedPeak,1);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,7);
  });
});
