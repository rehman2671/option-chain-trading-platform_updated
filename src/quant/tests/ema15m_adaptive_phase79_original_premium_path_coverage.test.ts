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

  // Phase82: frozen original contract IDs must be immutable through time.
  // Operator pins are only self-checks: re-pinning contradictions is blocked.
  it('Phase82 rejects native CSV quote instrument absent from every originally listed alternative',()=>{
    const f=fixture();
    const when=ist('2026-11-20',9,20);
    f.rows.push(['REC-UNLISTED','1','UNLISTED_OTHER_INDEX_OPTION',when,when,
      '99','100','100','100']);
    f.rebuild();f.repin();
    rejected(f,'PHASE82_NATIVE_L1_ROW_OUTSIDE_FROZEN_LISTED_CONTRACT_UNIVERSE');
  });
  it('Phase82 quote for listed option arriving on a day after declared expiry is never a valid next-contract price',()=>{
    const f=fixture(),when=ist('2026-11-27',9,20);
    f.rows.push(['REC-EXPIRED','1','OPT_20261119_1W_CE',when,when,
      '99','100','100','100']);
    f.rebuild();f.repin();
    rejected(f,'PHASE82_NATIVE_L1_QUOTE_AFTER_DECLARED_OPTION_EXPIRY');
  });
  it('Phase82 cross-decision reused token with changed expiry is an identity conflict, not a different holding horizon',()=>{
    const f=fixture();
    f.input.originalCatalog.decisions[1].originallyListedContracts[0].instrumentKey=
      f.input.originalCatalog.decisions[0].originallyListedContracts[0].instrumentKey;
    f.repin();
    rejected(f,'PHASE82_REUSED_CONTRACT_TOKEN_CONTRADICTS_EXPIRY_SIDE_STRIKE_OR_LOT');
  });
  it('Phase82 cross-decision reuse of a CE token for a PE is an identity conflict',()=>{
    const f=fixture(),a=f.input.originalCatalog.decisions[0].originallyListedContracts[0],
      b=f.input.originalCatalog.decisions[1].originallyListedContracts[1];
    b.instrumentKey=a.instrumentKey;
    b.expiry=a.expiry;
    f.repin();
    rejected(f,'PHASE82_REUSED_CONTRACT_TOKEN_CONTRADICTS_EXPIRY_SIDE_STRIKE_OR_LOT');
  });
  it('Phase82 rejects source token reusing a different strike even with same expiry, right and lot',()=>{
    const f=fixture(),a=f.input.originalCatalog.decisions[0].originallyListedContracts[0],
      b=f.input.originalCatalog.decisions[1].originallyListedContracts[0];
    b.instrumentKey=a.instrumentKey;
    b.expiry=a.expiry;
    b.strikePrice+=100;
    f.repin();
    rejected(f,'PHASE82_REUSED_CONTRACT_TOKEN_CONTRADICTS_EXPIRY_SIDE_STRIKE_OR_LOT');
  });
  it('Phase82 rejects source token reusing different lot size despite same right, strike and expiry',()=>{
    const f=fixture(),a=f.input.originalCatalog.decisions[0].originallyListedContracts[0],
      b=f.input.originalCatalog.decisions[1].originallyListedContracts[0];
    b.instrumentKey=a.instrumentKey;
    b.expiry=a.expiry;
    b.lotSize=25;
    f.repin();
    rejected(f,'PHASE82_REUSED_CONTRACT_TOKEN_CONTRADICTS_EXPIRY_SIDE_STRIKE_OR_LOT');
  });
  it('Phase82 an original decision before the declared market opens cannot be an executable option decision',()=>{
    const f=fixture();
    f.input.originalCatalog.decisions[0].decisionAt=ist('2026-11-19',9,14);
    f.repin();
    rejected(f,'PHASE79_ORIGINAL_DECISION_OR_LISTED_UNIVERSE_INVALID');
  });
  it('Phase82 a claimed original decision after the declared close cannot be replayed as daytime as-of',()=>{
    const f=fixture();
    f.input.originalCatalog.decisions[1].decisionAt=ist('2026-11-20',15,31);
    f.repin();
    rejected(f,'PHASE79_ORIGINAL_DECISION_OR_LISTED_UNIVERSE_INVALID');
  });
  it('Phase82 non-finite/zero original strike cannot silently create an ambiguous contract identity',()=>{
    for(const strike of [0,Number.NaN,Number.POSITIVE_INFINITY]){
      const f=fixture();
      f.input.originalCatalog.decisions[0].originallyListedContracts[0].strikePrice=strike;
      f.repin();
      rejected(f,'PHASE79_OPTION_CONTRACT_LOT_EXPIRY_OR_SIDE_INVALID');
    }
  });
  it('Phase82 same immutable option legitimately listed on consecutive original decisions is not rejected',()=>{
    const f=fixture(),a=f.input.originalCatalog.decisions[0].originallyListedContracts[0],
      b=f.input.originalCatalog.decisions[1].originallyListedContracts[0],
      oldToken=b.instrumentKey;
    b.instrumentKey=a.instrumentKey;
    b.expiry=a.expiry;
    // The original source already has older session observations for the
    // shared token; remove now-unlisted second token's redundant raw rows.
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][2]===oldToken)f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
    assert.equal(r.originallyListedPairs,16);
    assert.equal(r.originalNoEntryDecisions,1);
    assert.equal(r.entryPairsMissingClaimedAsOfAsk,1);
  });

  // Phase83: an as-of BID/ASK is a BOOK STATE, not the last historical row
  // that happens to have enough depth. Illiquid updates supersede it.
  it('Phase83 baseline remains complete with zero stale/illiquid quote updates',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.entryPairsWithObservedIlliquidBidUpdate,0);
    assert.equal(r.entryCandidateStaleLateQuoteObservationsIgnored,0);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED');
  });
  it('Phase83 decision cannot use an older valid ASK after a newer zero-ASK/zero-depth book update',()=>{
    const f=fixture(),key='OPT_20261120_1W_CE',
      event=ist('2026-11-20',9,29);
    for(const row of f.rows)if(row[2]===key&&row[3]>event&&
      row[3].startsWith('2026-11-20'))row[1]=String(Number(row[1])+1);
    f.rows.push(['REC-83-ASKZERO','2',key,event,event,'0','0','0','0']);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsMissingClaimedAsOfAsk,1);
    assert.equal(r.claimedAsOfEntryAskPairs,7);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
  });
  it('Phase83 decision latest ASK with sublot size supersedes an older valid ASK',()=>{
    const f=fixture(),key='OPT_20261120_1W_CE',
      event=ist('2026-11-20',9,29);
    for(const row of f.rows)if(row[2]===key&&row[3]>event&&
      row[3].startsWith('2026-11-20'))row[1]=String(Number(row[1])+1);
    f.rows.push(['REC-83-ASKDEPTH','2',key,event,event,'99','100','100','0']);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsMissingClaimedAsOfAsk,1);
  });
  it('Phase83 same-millisecond newer source sequence can supersede decision ASK liquidity',()=>{
    const f=fixture(),key='OPT_20261120_1W_CE',
      event=ist('2026-11-20',9,28);
    for(const row of f.rows)if(row[2]===key&&row[3]>event&&
      row[3].startsWith('2026-11-20'))row[1]=String(Number(row[1])+1);
    f.rows.push(['REC-83-ASKSEQ','2',key,event,event,'0','0','0','0']);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsMissingClaimedAsOfAsk,1);
  });
  it('Phase83 closing BID is censored when latest book update is no-bid despite earlier valid closing quote',()=>{
    const f=fixture(),key='OPT_20261120_1W_CE',
      event=ist('2026-11-20',15,30);
    f.rows.push(['REC-83-NOBID','4',key,event,event,'0','0','0','0']);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.listedPairsWithMissingDeclaredSessionCloseBid,1);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
  });
  it('Phase83 newest closing BID with sublot depth cannot borrow earlier displayed lot depth',()=>{
    const f=fixture(),key='OPT_20261120_1W_CE',
      event=ist('2026-11-20',15,30);
    f.rows.push(['REC-83-SUBLOT','4',key,event,event,'160','161','1','1']);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.listedPairsWithMissingDeclaredSessionCloseBid,1);
  });
  it('Phase83 out-of-order late OLD low bid is not a new +70 to +20 premium reversal',()=>{
    const f=fixture(),key='OPT_20261120_1W_CE';
    for(const row of f.rows)if(row[2]===key){
      if(row[3]>ist('2026-11-20',10,0)){
        row[5]='170';row[6]='171';
      }
      if(row[3].includes('2026-11-20T15:29'))row[1]='5';
    }
    const eventOld=ist('2026-11-20',10,1),
      eventNew=ist('2026-11-20',10,2);
    f.rows.push(['REC-83-STALELOW','3',key,eventOld,
      ist('2026-11-20',10,3),'120','121','100','100']);
    f.rows.push(['REC-83-NEWHIGH','4',key,eventNew,
      eventNew,'170','171','100','100']);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryCandidateStaleLateQuoteObservationsIgnored,1);
    assert.equal(r.quotedUnderTargetPremiumGivebackPairs,7);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
    assert.ok(r.reasonCodes.includes('OUT_OF_ORDER_LATE_STALE_QUOTE_EVENTS_EXCLUDED_FROM_PREMIUM_PATH'));
    assert.equal(r.cells.reduce((acc,c)=>
      acc+c.entryCandidateStaleLateQuoteObservationsIgnored,0),1);
  });
  it('Phase83 post-peak displayed BID disappears: an illiquid update must censor risk not manufacture a guaranteed stop fill',()=>{
    const f=fixture(),key='OPT_20261120_1W_CE',
      event=ist('2026-11-20',10,1);
    const close=f.rows.find(row=>row[2]===key&&
      row[3].includes('2026-11-20T15:29'))!;
    close[1]='4';
    f.rows.push(['REC-83-BIDBLACKOUT','3',key,event,event,'0','0','0','0']);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsWithObservedIlliquidBidUpdate,1);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
    assert.ok(r.reasonCodes.includes('POST_DECISION_NO_BID_OR_SUBLOT_DEPTH_CENSORS_EXIT_LIQUIDITY'));
    assert.equal(r.cells.reduce((acc,c)=>
      acc+c.entryClaimedPairsWithObservedIlliquidBidUpdate,0),1);
  });

  // Phase84: normalized impossible dates are never an exchange observation.
  // Source event sequences cannot contradict event-time ordering, even when
  // the original CSV arrives out of order or the operator freshly re-pins it.
  it('Phase84 normal valid IST source dates and sequence chronology remain descriptive only',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED');
  });
  it('Phase84 impossible November 31 source event and receipt may not normalize into December 1 market data',()=>{
    const f=fixture();
    const row=f.rows.find(x=>x[3].includes('2026-12-01T15:29'))!;
    assert.ok(row);
    row[3]=row[3].replace('2026-12-01','2026-11-31');
    row[4]=row[4].replace('2026-12-01','2026-11-31');
    f.rebuild();f.repin();
    rejected(f,'PHASE79_INVALID_NATIVE_BID_ASK_DEPTH_OR_SOURCE_CLOCK');
  });
  it('Phase84 impossible November 31 trading-session open/close cannot masquerade as December 1',()=>{
    const f=fixture();
    const session=f.input.declaredSessions.find(x=>x.sessionDate==='2026-12-01')!;
    assert.ok(session);
    session.openAt=session.openAt.replace('2026-12-01','2026-11-31');
    session.closeAt=session.closeAt.replace('2026-12-01','2026-11-31');
    f.repin();
    rejected(f,'PHASE79_DUPLICATE_INVALID_OR_CROSS_DAY_SESSION');
  });
  it('Phase84 per-session sequence inversion rejects newer sequence stamped before older event',()=>{
    const f=fixture(),key='OPT_20261120_1W_CE';
    const older=f.rows.find(x=>x[2]===key&&x[3].includes('2026-11-20T10:00'))!;
    assert.ok(older);
    older[1]='4'; // closing 15:29 retains sequence 3
    f.rebuild();f.repin();
    rejected(f,'PHASE84_ORIGINAL_SOURCE_SEQUENCE_EVENT_CLOCK_INVERSION');
  });
  it('Phase84 shuffling CSV row placement alone must not create a false exchange-sequence inversion',()=>{
    const f=fixture();f.rows.reverse();f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED');
    assert.equal(r.quotedUnderTargetPremiumGivebackPairs,8);
  });
  it('Phase84 valid UTC-normalized timestamps can represent same original option observations',()=>{
    const f=fixture();
    const row=f.rows.find(x=>x[2]==='OPT_20261120_1W_CE'&&
      x[3].includes('2026-11-20T09:28'))!;
    row[3]='2026-11-20T03:58:00Z';
    row[4]='2026-11-20T03:58:00Z';
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED');
    assert.equal(r.claimedAsOfEntryAskPairs,8);
  });
  it('Phase84 valid offset-minus timestamps should not be mistaken for a normalized impossible date',()=>{
    const f=fixture();
    const row=f.rows.find(x=>x[2]==='OPT_20261120_1W_PE'&&
      x[3].includes('2026-11-20T09:28'))!;
    row[3]='2026-11-19T22:28:00-05:30';
    row[4]='2026-11-19T22:28:00-05:30';
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.claimedAsOfEntryAskPairs,8);
  });
  it('Phase84 source sequence is scoped to instrument AND trading session; next day may reset to 1',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.parsedNativeQuoteRows>16,true);
  });

  // Phase85: indexed all-listed session-close coverage must preserve exactly
  // the old causally correct observed counts, including NO_ENTRY and censored.
  it('Phase85 baseline index preserves original 1W-8W CE/PE close denominators and risk counts',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED');
    assert.equal(r.missingDeclaredSessionCloseBidObservations,0);
    assert.equal(r.listedPairsWithMissingDeclaredSessionCloseBid,0);
    assert.equal(r.quotedUnderTargetPremiumGivebackPairs,8);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,8);
    assert.equal(r.entryPairsMissingBoundedNextOpenAfterNewArmedPeak,0);
  });
  it('Phase85 session manifest order does not change indexed closing coverage or risk aggregates',()=>{
    const f=fixture(),baseline=audit(f);
    f.input.declaredSessions.reverse();f.repin();
    const shuffled=audit(f);neverTrades(shuffled);
    assert.deepEqual(shuffled,baseline);
  });
  it('Phase85 1200 additional in-session option ticks cannot change already observed closing outcomes',()=>{
    const f=fixture(),baseline=audit(f),
      key='OPT_20261120_1W_CE',date='2026-11-23';
    const closing=f.rows.find(r=>r[2]===key&&
      r[3].includes(date+'T15:29'))!;
    assert.ok(closing);
    closing[1]='1202'; // 09:16 opening sequence 1; 1200 ticks 2..1201.
    const start=Date.parse(ist(date,10,0));
    for(let i=0;i<1200;i++){
      const when=new Date(start+i*1000).toISOString();
      f.rows.push(['REC85-TICK-'+i,String(i+2),key,when,when,
        '160','161','100','100']);
    }
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.status,baseline.status);
    assert.equal(r.originallyListedPairs,baseline.originallyListedPairs);
    assert.equal(r.missingDeclaredSessionCloseBidObservations,
      baseline.missingDeclaredSessionCloseBidObservations);
    assert.equal(r.quotedUnderTargetPremiumGivebackPairs,
      baseline.quotedUnderTargetPremiumGivebackPairs);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,
      baseline.quotedNextOpenGapThroughTrailPairs);
    assert.equal(r.parsedNativeQuoteRows,baseline.parsedNativeQuoteRows+1200);
    assert.deepEqual(r.cells,baseline.cells);
  });
  it('Phase85 closing index does not borrow earlier liquid book state after later zero-BID update',()=>{
    const f=fixture(),key='OPT_20261120_1W_CE',
      when=ist('2026-11-20',15,30);
    f.rows.push(['REC85-CLOSE-ZERO','4',key,when,when,'0','0','0','0']);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.missingDeclaredSessionCloseBidObservations,1);
    assert.equal(r.listedPairsWithMissingDeclaredSessionCloseBid,1);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
  });
  it('Phase85 missing closing BID in NO_ENTRY alternative remains censored without any purchased option',()=>{
    const f=fixture();
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][2]==='OPT_20261119_8W_PE'&&
         f.rows[i][3].includes('2026-12-01T15:29'))
        f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.originallyNoEntryPairs,8);
    assert.equal(r.originalNoEntryDecisions,1);
    assert.equal(r.missingDeclaredSessionCloseBidObservations,1);
    assert.equal(r.listedPairsWithMissingDeclaredSessionCloseBid,1);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
    assert.equal(r.cells.reduce((sum,c)=>sum+c.originalNoEntryPairs,0),8);
  });

  // Phase86: a BUYABLE ASK is not evidence of an immediately SELLABLE BID.
  // Large same-snapshot spreads must not be hidden by the quoted +50 arming
  // threshold or turn into a hypothetical executed exit.
  it('Phase86 baseline quoted entry ASK/BID depth and small spread remain non-censored',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.entryPairsWithUnmarketableDecisionBid,0);
    assert.equal(r.entryPairsWithDecisionSpreadAtLeastArmingGain,0);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED');
  });
  it('Phase86 positive ASK but zero BID and no BID depth is not sellable at the decision',()=>{
    const f=fixture(),row=f.rows.find(x=>x[2]==='OPT_20261120_1W_CE'&&
      x[3].includes('2026-11-20T09:28'))!;
    row[5]='0';row[7]='0';f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.claimedAsOfEntryAskPairs,8);
    assert.equal(r.entryPairsMissingClaimedAsOfAsk,0);
    assert.equal(r.entryPairsWithUnmarketableDecisionBid,1);
    assert.equal(r.entryPairsWithDecisionSpreadAtLeastArmingGain,1);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
    assert.ok(r.reasonCodes.includes('ENTRY_ASK_WITH_NO_SAME_SNAPSHOT_MARKETABLE_BID_EXIT_LIQUIDITY'));
    assert.equal(r.cells.reduce((n,c)=>
      n+c.entryClaimedPairsWithUnmarketableDecisionBid,0),1);
    assert.equal(r.nativeBrokerNrmlGttStopChildAckVerified,false);
  });
  it('Phase86 ASK buy depth cannot substitute for BID sell-side lot depth',()=>{
    const f=fixture(),row=f.rows.find(x=>x[2]==='OPT_20261120_2W_PE'&&
      x[3].includes('2026-11-20T09:28'))!;
    row[7]='1';row[8]='100';f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsWithUnmarketableDecisionBid,1);
    assert.equal(r.entryPairsWithDecisionSpreadAtLeastArmingGain,0);
  });
  it('Phase86 full-depth but >= +50 quoted round-trip spread is a severe entry risk, not a fill',()=>{
    const f=fixture(),row=f.rows.find(x=>x[2]==='OPT_20261120_4W_CE'&&
      x[3].includes('2026-11-20T09:28'))!;
    row[5]='40';row[6]='100';f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsWithUnmarketableDecisionBid,0);
    assert.equal(r.entryPairsWithDecisionSpreadAtLeastArmingGain,1);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
    assert.ok(r.reasonCodes.includes('ENTRY_QUOTED_BID_ASK_SPREAD_AT_LEAST_FROZEN_ARMING_GAIN'));
  });
  it('Phase86 spread exactly equal to predeclared premium arming gain triggers censor',()=>{
    const f=fixture(),row=f.rows.find(x=>x[2]==='OPT_20261120_8W_PE'&&
      x[3].includes('2026-11-20T09:28'))!;
    row[5]='50';f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsWithDecisionSpreadAtLeastArmingGain,1);
  });
  it('Phase86 smaller spread than the pinned arming threshold does not use an invented risk cutoff',()=>{
    const f=fixture(),row=f.rows.find(x=>x[2]==='OPT_20261120_8W_PE'&&
      x[3].includes('2026-11-20T09:28'))!;
    row[5]='51';f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsWithDecisionSpreadAtLeastArmingGain,0);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED');
  });
  it('Phase86 policy re-pinning changes the frozen arming comparator rather than hardcoding 50',()=>{
    const f=fixture(),row=f.rows.find(x=>x[2]==='OPT_20261120_8W_PE'&&
      x[3].includes('2026-11-20T09:28'))!;
    row[5]='40';f.input.policy.armingGainPremiumPoints=80;
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsWithDecisionSpreadAtLeastArmingGain,0);
  });
  it('Phase86 wide spread in an original NO_ENTRY alternative does not manufacture a hypothetical purchase',()=>{
    const f=fixture(),row=f.rows.find(x=>x[2]==='OPT_20261119_1W_CE'&&
      x[3].includes('2026-11-19T09:28'))!;
    row[5]='0';row[7]='0';f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.originallyNoEntryPairs,8);
    assert.equal(r.entryPairsWithUnmarketableDecisionBid,0);
    assert.equal(r.entryPairsWithDecisionSpreadAtLeastArmingGain,0);
    assert.equal(r.originalEntryClaimedPairs,8);
  });

  // Phase87: the owner-declared session calendar can omit a weekday WITH
  // no original quote rows for that day. This is a POSSIBLE missing trading
  // session, not proof an exchange was open rather than on official holiday.
  it('Phase87 contiguous synthetic weekday sessions have no candidate omitted weekdays',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.originalPairsWithPotentialUndeclaredWeekdays,0);
    assert.equal(r.potentialUndeclaredWeekdayObservations,0);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_L1_COVERAGE_NOT_AUTHENTICATED');
  });
  it('Phase87 missing an interior Tuesday is censored despite all DECLARED daily closes remaining',()=>{
    const f=fixture(),missing='2026-12-01';
    f.input.declaredSessions=f.input.declaredSessions
      .filter(s=>s.sessionDate!==missing);
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][3].startsWith(missing))f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.missingDeclaredSessionCloseBidObservations,0);
    assert.equal(r.originalPairsWithPotentialUndeclaredWeekdays,12);
    assert.equal(r.potentialUndeclaredWeekdayObservations,12);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
    assert.ok(r.reasonCodes.includes('POTENTIAL_UNDECLARED_WEEKDAY_REQUIRES_OFFICIAL_HOLIDAY_CALENDAR'));
    assert.equal(r.cells.reduce((n,c)=>
      n+c.originalPairsWithPotentialUndeclaredWeekdays,0),12);
    assert.equal(r.cells.reduce((n,c)=>
      n+c.potentialUndeclaredWeekdayObservations,0),12);
    assert.equal(r.originallyNoEntryPairs,8);
    assert.equal(r.actualEntryAndExitFillsVerified,false);
  });
  it('Phase87 omission of last Friday expiry session is detected even if previous Thursday is within 4-day expiry tolerance',()=>{
    const f=fixture(),missing='2027-01-15';
    f.input.declaredSessions=f.input.declaredSessions
      .filter(s=>s.sessionDate!==missing);
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][3].startsWith(missing))f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.missingDeclaredSessionCloseBidObservations,0);
    assert.equal(r.originalPairsWithPotentialUndeclaredWeekdays,2);
    assert.equal(r.potentialUndeclaredWeekdayObservations,2);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
  });
  it('Phase87 two missing adjacent weekdays censor each affected pair once but count both missing observations',()=>{
    const f=fixture(),gone=new Set(['2026-12-01','2026-12-02']);
    f.input.declaredSessions=f.input.declaredSessions
      .filter(s=>!gone.has(s.sessionDate));
    for(let i=f.rows.length-1;i>=0;i--)
      if(gone.has(f.rows[i][3].slice(0,10)))f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.originalPairsWithPotentialUndeclaredWeekdays,12);
    assert.equal(r.potentialUndeclaredWeekdayObservations,24);
    assert.equal(r.missingDeclaredSessionCloseBidObservations,0);
  });
  it('Phase87 does not invent missing weekend sessions and still does not authenticate official holidays',()=>{
    const f=fixture(),r=audit(f);neverTrades(r);
    assert.equal(r.originalPairsWithPotentialUndeclaredWeekdays,0);
    assert.equal(r.officialExchangeExpiryAndSessionCalendarAuthenticated,false);
    assert.equal(r.externalEvidenceRequired.some(x=>x.includes('EXCHANGE')),true);
  });

  // Phase88: a later DECLARED session is not necessarily the next possible
  // exchange session if an unlisted weekday might have traded in between.
  it('Phase88 normal Friday to Monday opening on continuous declared weekdays preserves original quote gap evidence',()=>{
    const r=audit(fixture());neverTrades(r);
    assert.equal(r.entryPairsWithUnresolvedOvernightCalendarTransition,0);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,8);
    assert.equal(r.entryPairsMissingBoundedNextOpenAfterNewArmedPeak,0);
  });
  it('Phase88 missing Monday blocks Friday to Tuesday inferred first-open gap after all eight armed option peaks',()=>{
    const f=fixture(),gone='2026-11-23';
    f.input.declaredSessions=f.input.declaredSessions.filter(s=>s.sessionDate!==gone);
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][3].startsWith(gone))f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,0);
    assert.equal(r.entryPairsWithUnresolvedOvernightCalendarTransition,8);
    assert.equal(r.originalPairsWithPotentialUndeclaredWeekdays,16);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
    assert.ok(r.reasonCodes.includes('ARMED_OVERNIGHT_NEXT_OPEN_UNRESOLVED_BY_POTENTIAL_MISSING_SESSION'));
    assert.equal(r.cells.reduce((n,c)=>
      n+c.entryClaimedPairsWithUnresolvedOvernightCalendarTransition,0),8);
  });
  it('Phase88 a valid Tuesday morning low BID still cannot pretend it is the FIRST Monday open after a Friday premium peak',()=>{
    const f=fixture(),gone='2026-11-23',key='OPT_20261120_1W_CE',
      next='2026-11-24',open=ist(next,9,16);
    f.input.declaredSessions=f.input.declaredSessions.filter(s=>s.sessionDate!==gone);
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][3].startsWith(gone))f.rows.splice(i,1);
    const close=f.rows.find(x=>x[2]===key&&
      x[3].includes(next+'T15:29'))!;
    assert.ok(close);
    close[1]='2';
    f.rows.push(['REC88-TUES-OPEN','1',key,open,open,'120','121','100','100']);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,0);
    assert.equal(r.entryPairsWithUnresolvedOvernightCalendarTransition,8);
    assert.equal(r.entryPairsMissingBoundedNextOpenAfterNewArmedPeak,0);
    assert.equal(r.status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
  });
  it('Phase88 missing Tuesday after a real Monday bounded opening quote does not erase the earlier observed Friday to Monday gap',()=>{
    const f=fixture(),gone='2026-11-24';
    f.input.declaredSessions=f.input.declaredSessions.filter(s=>s.sessionDate!==gone);
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][3].startsWith(gone))f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,8);
    assert.equal(r.entryPairsWithUnresolvedOvernightCalendarTransition,0);
    assert.equal(r.originalPairsWithPotentialUndeclaredWeekdays,16);
  });
  it('Phase88 armed peak at end of supplied session list with potential next weekday before expiry is censored, not an assumed uneventful overnight',()=>{
    const f=fixture(),last='2026-11-20';
    f.input.declaredSessions=f.input.declaredSessions.filter(s=>s.sessionDate<=last);
    for(let i=f.rows.length-1;i>=0;i--)
      if(f.rows[i][3].slice(0,10)>last)f.rows.splice(i,1);
    f.rebuild();f.repin();
    const r=audit(f);neverTrades(r);
    assert.equal(r.entryPairsWithUnresolvedOvernightCalendarTransition,8);
    assert.equal(r.quotedNextOpenGapThroughTrailPairs,0);
    assert.equal(r.realOutOfSampleOptionReturnOrProfitabilityProven,false);
    assert.equal(r.nativeBrokerNrmlGttStopChildAckVerified,false);
  });
});
