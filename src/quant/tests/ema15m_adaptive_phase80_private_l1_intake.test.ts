import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmodSync,mkdtempSync,readFileSync,rmSync,symlinkSync,
  writeFileSync,linkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  auditPhase80PrivateOriginalL1,readPhase80PrivateFileSet,
  reviewPhase80OwnerPrivateFiles,
  type Phase80Input,type Phase80Pins,type Phase80PrivatePaths,
  type Phase80Report
} from '../../server/engine/ema15m/adaptivePhase80PrivateL1Intake.js';
import {hashPhase79Object} from '../../server/engine/ema15m/adaptivePhase79OriginalPremiumPathCoverage.js';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const ist=(d:string,hh:number,mm:number)=>`${d}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00+05:30`;
const day=(start:string,d:number)=>new Date(Date.parse(start+'T00:00:00Z')+
  86400000*d).toISOString().slice(0,10);
const HEAD=['sourceRecordId','sourceSequence','instrumentKey','eventAt',
  'originalAvailableAt','bid','ask','bidQty','askQty'];
function fixture(){
  const dates=['2026-11-19','2026-11-20'];
  const decisions=dates.map((d,i)=>({
    sessionDate:d,decisionAt:ist(d,9,30),
    claimedRegime:i===0?'RANGE' as const:'TREND' as const,
    originalEntryDisposition:i===0?'NO_ENTRY' as const:'ENTRY_CLAIMED' as const,
    originallyListedContracts:([7,14,28,56] as const).flatMap((days,j)=>(['CE','PE'] as const).map(side=>({
      instrumentKey:`OPT${i}H${j}${side}`,optionType:side,
      expiry:day(d,days),strikePrice:24000,lotSize:50
    })))
  }));
  const rows:string[][]=[];
  for(const d of decisions){
    for(const c of d.originallyListedContracts){
      const t=ist(d.sessionDate,9,28);
      rows.push([`RAW-${rows.length+1}`,'1',c.instrumentKey,t,t,
        '99','100','100','100']);
    }
  }
  const csv=Buffer.from([HEAD.join(','),...rows.map(r=>r.join(','))].join('\n')+'\n');
  const catalog:Phase80Input['phase79']['originalCatalog']={
    schemaVersion:'ADAPTIVE_PHASE66_NEW_VENDOR_ORIGINAL_OOS_CATALOG_V1',
    source:'OWNER_DECLARED_POINT_IN_TIME_CONTRACT_UNIVERSE_UNVERIFIED',
    folds:[],decisions
  };
  const declaredSessions=dates.map(d=>({sessionDate:d,
    openAt:ist(d,9,15),closeAt:ist(d,15,30)}));
  const policy:Phase80Input['phase79']['policy']={
    source:'OWNER_PREDECLARED_QUOTE_AVAILABILITY_NOT_LIVE_TRADING',
    minBestBidAndAskDepthLots:1,maxDecisionQuoteAgeSeconds:180,
    maxClaimedEventToArrivalSeconds:180,closingBidWindowMinutes:3,
    nextOpenBidWindowMinutes:5,armingGainPremiumPoints:50,
    givebackAlertPremiumPoints:20,targetAlertPremiumPoints:100
  };
  const input:Phase80Input={
    schemaVersion:'PHASE80_PRIVATE_FILE_BACKED_L1_REVIEW_V1',
    sourceDeclaration:{
      schemaVersion:'PHASE80_PRIVATE_ORIGINAL_VENDOR_SOURCE_DECLARATION_V1',
      source:'OWNER_SUPPLIED_VENDOR_AND_LEGAL_RIGHTS_UNVERIFIED',
      datasetKind:'UNVERIFIED_EXTERNAL_SOURCE_CANDIDATE',
      claimedSourceCategory:'NATIVE_OPTION_BEST_BID_ASK_DEPTH',
      claimedAcquisitionMode:'RETROSPECTIVE_ARCHIVE',
      claimedOfflineResearchRight:'OWNER_ASSERTS_LOCAL_RESEARCH_ALLOWED',
      claimedArchiveDeliveredAt:ist('2027-03-01',9,30),
      originalClientReceiptClockIndependentlyVerified:false,
      genuineVendorAndResearchGrantIndependentlyVerified:false,
      officialExchangeCalendarIndependentlyVerified:false,
      brokerStopOrFillIndependentlyVerified:false,
      permittedToSendLiveTradingOrders:false
    },
    phase79:{
      schemaVersion:'PHASE79_OFFLINE_ALL_ORIGINAL_LISTED_PREMIUM_PATH_V1',
      source:'PRIVATE_OPERATOR_SUPPLIED_NATIVE_OPTION_L1_NOT_AUTHENTICATED',
      datasetKind:'UNVERIFIED_EXTERNAL_SOURCE_CANDIDATE',
      originalNativeL1Csv:csv,originalCatalog:catalog,
      declaredSessions,policy
    }
  };
  const pins:Phase80Pins={
    schemaVersion:'PHASE80_SEPARATE_OFFLINE_SOURCE_AND_OOS_PINS_V1',
    expectedSourceDeclarationSha256:'',
    phase79:{
      schemaVersion:'PHASE79_SEPARATELY_FROZEN_ORIGINAL_UNIVERSE_PINS_V1',
      expectedNativeCsvSha256:'',expectedOriginalCatalogSha256:'',
      expectedDeclaredSessionsSha256:'',expectedPolicySha256:'',
      expectedOriginalDecisionDates:2,expectedOriginalNoEntryDecisions:1,
      expectedOriginallyListedPairs:16,expectedOriginallyNoEntryPairs:8
    }
  };
  const repin=()=>{
    pins.expectedSourceDeclarationSha256=hashPhase79Object(input.sourceDeclaration);
    pins.phase79.expectedNativeCsvSha256=sha(input.phase79.originalNativeL1Csv);
    pins.phase79.expectedOriginalCatalogSha256=hashPhase79Object(input.phase79.originalCatalog);
    pins.phase79.expectedDeclaredSessionsSha256=hashPhase79Object(input.phase79.declaredSessions);
    pins.phase79.expectedPolicySha256=hashPhase79Object(input.phase79.policy);
  };
  repin();
  return {input,pins,repin};
}
const audit=(f:ReturnType<typeof fixture>)=>auditPhase80PrivateOriginalL1(f.input,f.pins);
function neverTrading(r:Phase80Report){
  assert.equal(r.sourceLicenceOrVendorIndependentlyVerified,false);
  assert.equal(r.originalStrategyClientReceiptProofVerified,false);
  assert.equal(r.retrospectiveReceiptIsNotOriginalHistoricalClientClock,true);
  assert.equal(r.officialExchangeFOMasterVerified,false);
  assert.equal(r.actualOptionEntryOrExitFillVerified,false);
  assert.equal(r.optionStopOrGttNativeExchangeAckVerified,false);
  assert.equal(r.fullPaidLongOptionPremiumDebitMayBeLost,true);
  assert.equal(r.realMultiCycleOosProfitabilityProven,false);
  assert.equal(r.canRankOrBuyOneToEightWeekContracts,false);
  assert.equal(r.sourceFilesMayNeverBePublishedInRepository,true);
  assert.equal(r.existingMis1515Unchanged,true);
  assert.equal(r.forced1515NrmlExit,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.ok(!JSON.stringify(r).includes('OPT0H'));
  assert.ok(!JSON.stringify(r).includes('2026-11-19'));
}
function blocked(f:ReturnType<typeof fixture>,reason:string){
  const r=audit(f);neverTrading(r);
  assert.ok(!r.status.startsWith('DESCRIPTIVE_'),JSON.stringify(r));
  assert.ok(r.reasonCodes.includes(reason),JSON.stringify(r));
}
function privateFiles(f:ReturnType<typeof fixture>){
  const dir=mkdtempSync(join(tmpdir(),'adaptive-phase80-'));
  chmodSync(dir,0o700);
  const set=(name:string,value:Uint8Array|string)=>{
    const full=join(dir,name);
    writeFileSync(full,value,{mode:0o600});chmodSync(full,0o600);
    return full;
  };
  const p:Phase80PrivatePaths={
    nativeCsv:set('original.csv',f.input.phase79.originalNativeL1Csv),
    catalogJson:set('catalog.json',JSON.stringify(f.input.phase79.originalCatalog)),
    sessionsJson:set('sessions.json',JSON.stringify(f.input.phase79.declaredSessions)),
    policyJson:set('policy.json',JSON.stringify(f.input.phase79.policy)),
    sourceDeclarationJson:set('declaration.json',JSON.stringify(f.input.sourceDeclaration)),
    independentPinsJson:set('pins.json',JSON.stringify(f.pins))
  };
  return {dir,p,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}

describe('Phase80 owner-private file-backed original option L1 intake (offline only)',()=>{
  it('retrospective original-looking BID/ASK bytes remain descriptive, NOT causal strategy evidence',()=>{
    const r=audit(fixture());neverTrading(r);
    assert.equal(r.status,'DESCRIPTIVE_RETROSPECTIVE_ONLY_NO_ORIGINAL_CLIENT_CAUSAL_PROOF');
    assert.equal(r.phase79Status,'DESCRIPTIVE_CENSORED_ORIGINAL_L1_NOT_TRADING');
    assert.equal(r.originalDecisionDates,2);
    assert.equal(r.originalNoEntryDecisions,1);
    assert.equal(r.originallyListedPairs,16);
    assert.equal(r.originallyNoEntryPairs,8);
    assert.equal(r.parsedNativeQuoteRows,16);
    assert.equal(r.entryPairsMissingClaimedAsOfAsk,0);
    assert.equal(r.sourceCategoryIsOriginalNativeL1,true);
    assert.equal(r.claimedAcquisitionIsRetrospective,true);
    assert.ok(r.claimedRegimeCells.every(x=>['TREND','RANGE'].includes(x.claimedRegime)));
  });
  it('claimed contemporaneous capture is NOT independently verified origin or client clock',()=>{
    const f=fixture();f.input.sourceDeclaration.claimedAcquisitionMode='CONTEMPORANEOUS_CAPTURE';f.repin();
    const r=audit(f);neverTrading(r);
    assert.equal(r.status,'DESCRIPTIVE_CLAIMED_COVERAGE_NOT_AUTHENTICATED');
    assert.equal(r.claimedAcquisitionIsRetrospective,false);
    assert.ok(r.reasonCodes.includes('CLAIMED_CONTEMPORANEOUS_CLIENT_RECEIPT_NOT_EXTERNALLY_ATTESTED'));
  });
  it('synthetic label cannot be elevated into real external vendor',()=>{
    const f=fixture();f.input.sourceDeclaration.datasetKind='SYNTHETIC_FIXTURE';
    f.input.phase79.datasetKind='SYNTHETIC_FIXTURE';f.repin();
    const r=audit(f);neverTrading(r);assert.equal(r.syntheticDataset,true);
  });
  it('changing original raw csv after pinning is rejected by upstream Phase79',()=>{
    const f=fixture();f.input.phase79.originalNativeL1Csv=Buffer.from('sourceRecordId');
    blocked(f,'PHASE80_ORIGINAL_L1_PATH_AUDIT_NOT_COMPLETE');
  });
  it('changing source declaration without independent pin rejects',()=>{
    const f=fixture();f.input.sourceDeclaration.claimedAcquisitionMode='CONTEMPORANEOUS_CAPTURE';
    blocked(f,'PHASE80_MISSING_OR_TAMPERED_SOURCE_DECLARATION_AND_PINS');
  });
  it('trades-only, end-of-day and reconstructed quotes never count as native BID/ASK depth',()=>{
    for(const category of ['TRADE_ONLY','END_OF_DAY','RECONSTRUCTED_QUOTES'] as const){
      const f=fixture();f.input.sourceDeclaration.claimedSourceCategory=category;f.repin();
      blocked(f,'PHASE80_NON_NATIVE_L1_NO_RESEARCH_RIGHTS_OR_UNKNOWN_ACQUISITION');
    }
  });
  it('unknown or denied research-use right fails closed',()=>{
    const f=fixture();f.input.sourceDeclaration.claimedOfflineResearchRight='RIGHTS_UNKNOWN_OR_NOT_GRANTED';f.repin();
    blocked(f,'PHASE80_NON_NATIVE_L1_NO_RESEARCH_RIGHTS_OR_UNKNOWN_ACQUISITION');
  });
  it('unknown acquisition cannot impersonate original contemporaneous receipt',()=>{
    const f=fixture();f.input.sourceDeclaration.claimedAcquisitionMode='UNKNOWN';f.repin();
    blocked(f,'PHASE80_NON_NATIVE_L1_NO_RESEARCH_RIGHTS_OR_UNKNOWN_ACQUISITION');
  });
  it('operator cannot simply assert verified client receipts, vendor rights, exchange calendar or broker fills',()=>{
    for(const key of ['originalClientReceiptClockIndependentlyVerified',
      'genuineVendorAndResearchGrantIndependentlyVerified',
      'officialExchangeCalendarIndependentlyVerified',
      'brokerStopOrFillIndependentlyVerified',
      'permittedToSendLiveTradingOrders'] as const){
      const f=fixture();(f.input.sourceDeclaration as unknown as Record<string,unknown>)[key]=true;
      f.repin();blocked(f,'PHASE80_UNTRUSTED_SOURCE_DECLARATION_CLAIMS_VERIFIED_DATA');
    }
  });
  it('unknown free text regime cannot leak private records through aggregate report',()=>{
    const f=fixture();
    (f.input.phase79.originalCatalog.decisions[0] as {claimedRegime:string}).claimedRegime='ACCOUNT_TOKEN_SHOULD_NOT_PRINT';
    f.repin();const r=audit(f);neverTrading(r);
    assert.ok(r.reasonCodes.includes('PHASE80_UNKNOWN_OR_SENSITIVE_REGIME_LABEL'));
    assert.ok(!JSON.stringify(r).includes('ACCOUNT_TOKEN_SHOULD_NOT_PRINT'));
  });
  it('incomplete frozen NO_ENTRY denominator cannot be silently repaired',()=>{
    const f=fixture();f.input.phase79.originalCatalog.decisions[0].originallyListedContracts.pop();f.repin();
    blocked(f,'PHASE80_ORIGINAL_L1_PATH_AUDIT_NOT_COMPLETE');
  });
  it('empty or malformed version envelope is redacted invalid',()=>{
    const f=fixture();(f.pins as {schemaVersion:string}).schemaVersion='LIVE_MARKET';
    blocked(f,'PHASE80_MISSING_OR_TAMPERED_SOURCE_DECLARATION_AND_PINS');
  });
  it('six separate private 0600 files in 0700 dir load deterministically outside repo',()=>{
    const f=fixture(),{p,cleanup}=privateFiles(f);
    try{
      const v=readPhase80PrivateFileSet(p,process.cwd());
      assert.equal(sha(v.input.phase79.originalNativeL1Csv),f.pins.phase79.expectedNativeCsvSha256);
      assert.deepEqual(v.pins,f.pins);
      const result=reviewPhase80OwnerPrivateFiles(p,process.cwd());neverTrading(result);
      assert.ok(result.status.startsWith('DESCRIPTIVE_'));
    }finally{cleanup();}
  });
  it('missing private file denies all and never prints an OS error or path',()=>{
    const f=fixture(),{p,cleanup}=privateFiles(f);
    try{
      const r=reviewPhase80OwnerPrivateFiles({...p,nativeCsv:'/nonexistent-private-source'},process.cwd());
      neverTrading(r);assert.equal(r.status,'REJECTED_PRIVATE_EVIDENCE');
      assert.deepEqual(r.reasonCodes,['PHASE80_PRIVATE_FILE_ACCESS_OR_PARSE_REJECTED_REDACTED']);
    }finally{cleanup();}
  });
  it('world-readable or group-readable source file is rejected',()=>{
    const f=fixture(),{p,cleanup}=privateFiles(f);
    try{
      chmodSync(p.nativeCsv,0o644);
      assert.equal(reviewPhase80OwnerPrivateFiles(p,process.cwd()).status,'REJECTED_PRIVATE_EVIDENCE');
      chmodSync(p.nativeCsv,0o600);
      chmodSync(p.sessionsJson,0o640);
      assert.equal(reviewPhase80OwnerPrivateFiles(p,process.cwd()).status,'REJECTED_PRIVATE_EVIDENCE');
    }finally{cleanup();}
  });
  it('public parent dir is rejected even with 0600 private file',()=>{
    const f=fixture(),{dir,p,cleanup}=privateFiles(f);
    try{
      chmodSync(dir,0o755);
      assert.equal(reviewPhase80OwnerPrivateFiles(p,process.cwd()).status,'REJECTED_PRIVATE_EVIDENCE');
    }finally{cleanup();}
  });
  it('symlinked raw CSV does not impersonate a source file',()=>{
    const f=fixture(),{dir,p,cleanup}=privateFiles(f);
    try{
      const name=join(dir,'symlink.csv');symlinkSync(p.nativeCsv,name);
      const r=reviewPhase80OwnerPrivateFiles({...p,nativeCsv:name},process.cwd());
      assert.equal(r.status,'REJECTED_PRIVATE_EVIDENCE');
    }finally{cleanup();}
  });
  it('hard-linked alias of same raw source cannot masquerade as second independent file',()=>{
    const f=fixture(),{dir,p,cleanup}=privateFiles(f);
    try{
      const name=join(dir,'alias.csv');linkSync(p.nativeCsv,name);
      const r=reviewPhase80OwnerPrivateFiles({...p,catalogJson:name},process.cwd());
      assert.equal(r.status,'REJECTED_PRIVATE_EVIDENCE');
    }finally{cleanup();}
  });
  it('relative paths and paths inside repository fail before parsing',()=>{
    const f=fixture(),{dir,p,cleanup}=privateFiles(f);
    try{
      assert.equal(reviewPhase80OwnerPrivateFiles({...p,nativeCsv:'./source.csv'},process.cwd()).status,'REJECTED_PRIVATE_EVIDENCE');
      // Pretend the private directory itself is the repository checkout.
      assert.equal(reviewPhase80OwnerPrivateFiles(p,dir).status,'REJECTED_PRIVATE_EVIDENCE');
    }finally{cleanup();}
  });
  it('JSON modification with pinned raw CSV still fails with redacted output',()=>{
    const f=fixture(),{p,cleanup}=privateFiles(f);
    try{
      const a=JSON.parse(readFileSync(p.sessionsJson,'utf8')) as unknown[];
      a.pop();writeFileSync(p.sessionsJson,JSON.stringify(a),{mode:0o600});
      const r=reviewPhase80OwnerPrivateFiles(p,process.cwd());neverTrading(r);
      assert.equal(r.status,'BLOCKED_SOURCE_SCOPE');
      assert.ok(!JSON.stringify(r).includes('2026-11-19'));
    }finally{cleanup();}
  });
  it('invalid JSON does not disclose parser input or file path',()=>{
    const f=fixture(),{p,cleanup}=privateFiles(f);
    try{
      writeFileSync(p.independentPinsJson,'<vendor-secret NOT_JSON>',{mode:0o600});
      const r=reviewPhase80OwnerPrivateFiles(p,process.cwd());neverTrading(r);
      assert.equal(r.status,'REJECTED_PRIVATE_EVIDENCE');
      assert.ok(!JSON.stringify(r).includes('vendor-secret'));
    }finally{cleanup();}
  });
  it('file loading cannot equate two input paths to same inode',()=>{
    const f=fixture(),{p,cleanup}=privateFiles(f);
    try{
      assert.equal(reviewPhase80OwnerPrivateFiles({...p,policyJson:p.catalogJson},process.cwd()).status,'REJECTED_PRIVATE_EVIDENCE');
    }finally{cleanup();}
  });
  it('private source paths must not escape into report on missing rights',()=>{
    const f=fixture();f.input.sourceDeclaration.claimedOfflineResearchRight='RIGHTS_UNKNOWN_OR_NOT_GRANTED';f.repin();
    const {p,cleanup}=privateFiles(f);
    try{
      const r=reviewPhase80OwnerPrivateFiles(p,process.cwd());neverTrading(r);
      assert.ok(!JSON.stringify(r).includes(p.nativeCsv));
      assert.equal(r.status,'BLOCKED_SOURCE_SCOPE');
    }finally{cleanup();}
  });

  it('Phase86 private archive keeps entry BID/spread risk in redacted counts without raw option IDs',()=>{
    const f=fixture();
    const rows=Buffer.from(f.input.phase79.originalNativeL1Csv).toString('utf8')
      .trimEnd().split('\n');
    const index=rows.findIndex(r=>r.includes(',OPT1H0CE,'));
    assert.ok(index>=1);
    const columns=rows[index].split(',');
    columns[5]='0';columns[7]='0';columns[6]='100';columns[8]='100';
    rows[index]=columns.join(',');
    f.input.phase79.originalNativeL1Csv=Buffer.from(rows.join('\n')+'\n');
    f.repin();
    const r=audit(f);neverTrading(r);
    assert.equal(r.status,'DESCRIPTIVE_RETROSPECTIVE_ONLY_NO_ORIGINAL_CLIENT_CAUSAL_PROOF');
    assert.equal(r.entryPairsWithUnmarketableDecisionBid,1);
    assert.equal(r.entryPairsWithDecisionSpreadAtLeastArmingGain,1);
    assert.equal(r.claimedRegimeCells.reduce((n,c)=>
      n+c.entryClaimedPairsWithUnmarketableDecisionBid,0),1);
    assert.equal(r.claimedRegimeCells.reduce((n,c)=>
      n+c.entryClaimedPairsWithDecisionSpreadAtLeastArmingGain,0),1);
    assert.ok(!JSON.stringify(r).includes('OPT1H0CE'));
    assert.equal(r.executionAuthorized,false);
    assert.equal(r.actualOptionEntryOrExitFillVerified,false);
  });

  it('Phase87 owner-private truncated calendar reports candidate weekday holes in redacted aggregates, never official exchange holidays',()=>{
    const f=fixture(),r=audit(f);neverTrading(r);
    assert.equal(r.status,'DESCRIPTIVE_RETROSPECTIVE_ONLY_NO_ORIGINAL_CLIENT_CAUSAL_PROOF');
    assert.equal(r.originalPairsWithPotentialUndeclaredWeekdays,16);
    assert.ok(r.potentialUndeclaredWeekdayObservations>=16);
    assert.equal(r.claimedRegimeCells.reduce((n,c)=>
      n+c.originalPairsWithPotentialUndeclaredWeekdays,0),
      r.originalPairsWithPotentialUndeclaredWeekdays);
    assert.equal(r.claimedRegimeCells.reduce((n,c)=>
      n+c.potentialUndeclaredWeekdayObservations,0),
      r.potentialUndeclaredWeekdayObservations);
    assert.ok(!JSON.stringify(r).includes('OPT0H'));
    assert.ok(!JSON.stringify(r).includes('2026-11-19'));
    assert.equal(r.officialExchangeFOMasterVerified,false);
    assert.equal(r.productionSafe,false);
  });

  it('Phase88 private retrospective report forwards unresolved armed calendar transitions without raw contracts or dates',()=>{
    const f=fixture(),date='2026-11-20',ts=ist(date,10,0);
    f.input.phase79.originalNativeL1Csv=Buffer.concat([
      f.input.phase79.originalNativeL1Csv,
      Buffer.from('RAW-PH88-PEAK,2,OPT1H0CE,'+ts+','+ts+
        ',170,171,100,100\n')
    ]);
    f.repin();
    const r=audit(f);neverTrading(r);
    assert.equal(r.entryPairsWithUnresolvedOvernightCalendarTransition,1);
    assert.equal(r.claimedRegimeCells.reduce((n,c)=>
      n+c.entryClaimedPairsWithUnresolvedOvernightCalendarTransition,0),1);
    assert.ok(!JSON.stringify(r).includes('OPT1H0CE'));
    assert.ok(!JSON.stringify(r).includes('RAW-PH88-PEAK'));
    assert.equal(r.actualOptionEntryOrExitFillVerified,false);
    assert.equal(r.productionSafe,false);
  });

  it('Phase89 private original L1 review reports first bounded opening zero-BID blackout after later recovery, without leaking source bytes',()=>{
    const f=fixture(),friday='2026-11-20',monday='2026-11-23',
      peakAt=ist(friday,10,0),firstAt=ist(monday,9,15),
      recoveryAt=ist(monday,9,16);
    f.input.phase79.declaredSessions.push({sessionDate:monday,
      openAt:ist(monday,9,15),closeAt:ist(monday,15,30)});
    const extra=[
      ['RAW-P89-PEAK','2','OPT1H0CE',peakAt,peakAt,'170','171','100','100'],
      ['RAW-P89-FIRST-ZERO','1','OPT1H0CE',firstAt,firstAt,'0','121','0','100'],
      ['RAW-P89-RECOVERY','2','OPT1H0CE',recoveryAt,recoveryAt,'120','121','100','100']
    ];
    f.input.phase79.originalNativeL1Csv=Buffer.concat([
      f.input.phase79.originalNativeL1Csv,
      Buffer.from(extra.map(row=>row.join(',')).join('\n')+'\n')
    ]);
    f.repin();
    const r=audit(f);neverTrading(r);
    assert.equal(r.entryPairsWithFirstBoundedNextOpenIlliquidBid,1);
    assert.equal(r.entryPairsMissingBoundedNextOpenAfterNewArmedPeak,1);
    assert.equal(r.claimedRegimeCells.reduce((n,c)=>
      n+c.entryClaimedPairsWithFirstBoundedNextOpenIlliquidBid,0),1);
    assert.ok(!JSON.stringify(r).includes('OPT1H0CE'));
    assert.ok(!JSON.stringify(r).includes('RAW-P89-FIRST-ZERO'));
    assert.ok(!JSON.stringify(r).includes('2026-11-23'));
    assert.equal(r.actualOptionEntryOrExitFillVerified,false);
    assert.equal(r.productionSafe,false);
  });
});
