/**
 * Only synthetic sample data. Deliberately independent of Phase50-65
 * two-OOS-day fixtures: a genuinely new vendor archive need not match
 * existing synthetic historical option records to reach offline preflight.
 */
import {createHash} from 'node:crypto';
import {
  hashPhase66Evidence,originalPhase66DecisionManifest,
  type Phase66Input,type Phase66IndependentPins,
  type Phase66OriginalCatalog,type Phase66Calendar,
  type Phase66PrespecifiedPolicy,type Phase66NewVendorDelivery,
  type Phase66OriginalDecision
} from '../../server/engine/ema15m/adaptivePhase66StandaloneVendorPreflight.js';

const digest=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const encode=(v:unknown)=>Buffer.from(JSON.stringify(v),'utf8')
  .toString('base64');
const DAY=86400000;
const iso=(s:string,minute:number)=>new Date(
  Date.parse(s+'T00:00:00Z')+minute*60000).toISOString();
const afterDays=(s:string,n:number)=>new Date(
  Date.parse(s+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
const CSV_COLUMNS=[
  'sourceRecordId','sourceSequence','instrumentKey','eventAt',
  'originalAvailableAt','bid','ask','bidQty','askQty'
];
export function makePhase66IndependentSyntheticVendorFixture(){
  const dates=[
    {sessionDate:'2026-02-10',regime:'TREND',entry:'NO_ENTRY'},
    {sessionDate:'2026-02-11',regime:'TREND',entry:'ENTRY_CLAIMED'},
    {sessionDate:'2026-04-14',regime:'RANGE',entry:'NO_ENTRY'},
    {sessionDate:'2026-04-15',regime:'RANGE',entry:'ENTRY_CLAIMED'}
  ] as const;
  const foldA={
    foldId:'FOLD_TREND_2026',
    trainingStart:'2025-02-01',trainingEnd:'2025-09-01',
    testStart:'2026-02-10',testEnd:'2026-02-11'
  };
  const foldB={
    foldId:'FOLD_RANGE_2026',
    trainingStart:'2025-03-01',trainingEnd:'2025-09-01',
    testStart:'2026-04-14',testEnd:'2026-04-15'
  };
  const raw:string[][]=[CSV_COLUMNS];
  const decisions:Phase66OriginalDecision[]=[];
  const windows=[
    {h:'1W',days:6},{h:'2W',days:14},
    {h:'4W',days:28},{h:'8W',days:56}
  ];
  for(let i=0;i<dates.length;i++){
    const d=dates[i],contracts:Phase66OriginalDecision[
      'originallyListedContracts']=[];
    for(const h of windows){
      for(const type of ['CE','PE'] as const){
        const instrumentKey=
          'VENDOR_CANDIDATE_'+(i+1)+'_'+h.h+'_'+type;
        contracts.push({
          instrumentKey,optionType:type,
          expiry:afterDays(d.sessionDate,h.days),
          strikePrice:22000,lotSize:50
        });
        // 04:30 UTC = 10:00 IST; session closes 10:00 UTC.
        // Last ORIGINAL event must arrive BEFORE session close. A 15:30
        // event received at 15:30:05 cannot backfill an eligible exit.
        for(let n=0;n<=11;n++){
          const event=iso(d.sessionDate,n===11?595:270+n*30);
          raw.push(['MOCK_L1_RECORD_'+raw.length,String(raw.length),
            instrumentKey,event,
            new Date(Date.parse(event)+5000).toISOString(),
            '100','101','100','100']);
        }
        // First following session open 03:45 UTC (09:15 IST).
        for(const minute of [225,230]){
          const event=iso(afterDays(d.sessionDate,1),minute);
          raw.push(['MOCK_L1_RECORD_'+raw.length,String(raw.length),
            instrumentKey,event,
            new Date(Date.parse(event)+5000).toISOString(),
            '95','96','100','100']);
        }
      }
    }
    decisions.push({
      sessionDate:d.sessionDate,decisionAt:iso(d.sessionDate,270),
      claimedRegime:d.regime,
      originalEntryDisposition:d.entry,
      originallyListedContracts:contracts
    });
  }
  const catalog:Phase66OriginalCatalog={
    schemaVersion:'ADAPTIVE_PHASE66_NEW_VENDOR_ORIGINAL_OOS_CATALOG_V1',
    source:'OWNER_DECLARED_POINT_IN_TIME_CONTRACT_UNIVERSE_UNVERIFIED',
    folds:[foldA,foldB],decisions
  };
  const calendar:Phase66Calendar={
    schemaVersion:'ADAPTIVE_PHASE66_NEW_VENDOR_DECLARED_SESSION_CALENDAR_V1',
    source:'OWNER_DECLARED_EXCHANGE_SESSIONS_UNVERIFIED',
    sessions:[
      '2026-02-10','2026-02-11','2026-02-12',
      '2026-04-14','2026-04-15','2026-04-16'
    ].map(sessionDate=>({
      sessionDate,openAt:iso(sessionDate,225),
      closeAt:iso(sessionDate,600)
    }))
  };
  const policy:Phase66PrespecifiedPolicy={
    schemaVersion:
      'ADAPTIVE_PHASE66_NEW_VENDOR_PREDECLARED_OOS_QUALITY_POLICY_V1',
    source:'OWNER_PREREGISTERED_THRESHOLDS_UNVERIFIED',
    minimumIndependentTestFolds:2,
    minimumDistinctClaimedRegimes:2,
    minimumDecisionDatesPerClaimedRegime:2,
    maximumHoldCalendarDays:40,
    minimumTrainToFirstTestEmbargoCalendarDays:40,
    minimumOriginalQuotesDecisionToClose:8,
    maximumOriginalDecisionToCloseQuoteGapMinutes:30,
    minimumOriginalQuotesFirstNextOpen:2,
    firstNextOpenWindowMinutes:10,
    maximumOriginalBidAskSpreadPercent:2,
    minimumDisplayedBidAndAskLots:1,
    maximumClaimedEventToClientArrivalLagSeconds:30
  };
  const delivery:Phase66NewVendorDelivery={
    schemaVersion:'ADAPTIVE_PHASE66_UNVERIFIED_NEW_VENDOR_DELIVERY_V1',
    claimedVendorProductReference:'MOCK_VENDOR_OPTION_L1',
    claimedLicenseReference:'MOCK_LICENSE_NOT_VERIFIED',
    sourceCategory:'ORIGINAL_BEST_BID_ASK_DEPTH',
    claimedResearchLicenseScope:'UNVERIFIED_RIGHTS',
    claimedClientReceiveClock:
      'LATER_HISTORICAL_DOWNLOAD_NO_ORIGINAL_CLIENT_CLOCK',
    declaredDatasetKind:'SYNTHETIC_FIXTURE',
    deliveredAt:'2026-07-01T00:00:00.000Z',
    treatDownloadTimeAsOriginalAvailableAt:false
  };
  const csv=()=>raw.map(cols=>cols.join(',')).join('\n')+'\n';
  const input:Phase66Input={
    schemaVersion:'ADAPTIVE_PHASE66_STANDALONE_VENDOR_L1_PREFLIGHT_V1',
    source:'NEW_OWNER_PRIVATE_VENDOR_CANDIDATE_UNVERIFIED',
    newVendorNativeL1CsvBase64:Buffer.from(csv(),'utf8').toString('base64'),
    newVendorFullListedCatalogBase64:encode(catalog),
    newVendorSessionCalendarBase64:encode(calendar),
    claimedResearchEntitlementBytesBase64:Buffer.from(
      'MOCK NOT A REAL LICENCE. OWNER CLAIMS ARE NOT ENTITLEMENTS.',
      'utf8').toString('base64'),
    delivery,policy
  };
  const pins:Phase66IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE66_NEW_VENDOR_SOURCE_AND_OOS_PINS_V1',
    expectedNewNativeCsvBytesSha256:'',
    expectedNewFullListedCatalogBytesSha256:'',
    expectedNewSessionCalendarBytesSha256:'',
    expectedClaimedEntitlementBytesSha256:'',
    expectedDeliveryDeclarationSha256:'',
    expectedPrespecifiedPolicySha256:'',
    expectedOriginalOosDecisionAndFullListedManifestSha256:'',
    expectedNativeQuoteRows:raw.length-1,
    expectedOriginalOosDecisions:decisions.length,
    expectedAllListedOosCePeContractPairs:32
  };
  const repinOuter=()=>{
    pins.expectedNewNativeCsvBytesSha256=digest(
      Buffer.from(input.newVendorNativeL1CsvBase64,'base64'));
    pins.expectedNewFullListedCatalogBytesSha256=digest(
      Buffer.from(input.newVendorFullListedCatalogBase64,'base64'));
    pins.expectedNewSessionCalendarBytesSha256=digest(
      Buffer.from(input.newVendorSessionCalendarBase64,'base64'));
    pins.expectedClaimedEntitlementBytesSha256=digest(
      Buffer.from(input.claimedResearchEntitlementBytesBase64,'base64'));
    pins.expectedDeliveryDeclarationSha256=
      hashPhase66Evidence(input.delivery);
    pins.expectedPrespecifiedPolicySha256=
      hashPhase66Evidence(input.policy);
    // Intentionally NEVER repin the original OOS fold/contract manifest.
  };
  const updateCatalog=()=>{
    input.newVendorFullListedCatalogBase64=encode(catalog);
  };
  const updateCalendar=()=>{
    input.newVendorSessionCalendarBase64=encode(calendar);
  };
  const updateQuotes=()=>{
    input.newVendorNativeL1CsvBase64=
      Buffer.from(csv(),'utf8').toString('base64');
  };
  const operatorRehashOriginalManifest=()=>{
    pins.expectedOriginalOosDecisionAndFullListedManifestSha256=
      hashPhase66Evidence(originalPhase66DecisionManifest(catalog));
  };
  operatorRehashOriginalManifest();
  repinOuter();
  return {
    input,pins,catalog,calendar,raw,repinOuter,
    updateCatalog,updateCalendar,updateQuotes,
    operatorRehashOriginalManifest
  };
}
