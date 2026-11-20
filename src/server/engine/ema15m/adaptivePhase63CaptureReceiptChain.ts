/**
 * Adaptive Swing v2 Phase63 — original strategy-side claimed L1 receipt
 * hash-chain, bound to EVERY original Phase62 native CSV / Phase61 quote.
 *
 * All receipt times, chain seed, key and signatures are operator supplied.
 * An operator can retrospectively build this complete chain; it therefore
 * proves only internal consistency, NOT contemporaneous strategy access,
 * trusted vendor identity, licence, authentic exchange clocks, or fills.
 *
 * OFFLINE PURE AUDIT: no source acquisition, network, broker, order, GTT,
 * NRML stop mutation, horizon recommendation or 15:15 positional exit.
 */
import {createHash,createPublicKey,verify as verifySignature}
  from 'node:crypto';
import {TextDecoder} from 'node:util';
import {
  auditPhase62NativeCsvDualReceipts,
  type Phase62Input,type Phase62IndependentPins,type Phase62Report
} from './adaptivePhase62NativeCsvDualReceipts.js';
import type {Phase61L1CustodyRow}
  from './adaptivePhase61OriginalL1CustodyIntake.js';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{3,119}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
const quoteHash=(row:Phase61L1CustodyRow):string=>digest(
  Buffer.from(JSON.stringify(row),'utf8'));
const digest=(b:Uint8Array):string=>createHash('sha256')
  .update(b).digest('hex');
const hash=(v:unknown):string=>digest(Buffer.from(JSON.stringify(v),'utf8'));
export const hashPhase63Evidence=hash;
const timestamp=(s:unknown):number=>typeof s==='string'&&ISO.test(s)?
  Date.parse(s):NaN;
const int=(n:unknown,min:number,max:number):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
const decode=(s:unknown,max:number):Buffer|null=>{
  if(typeof s!=='string'||!s.length||
    s.length>(max+2)*4/3+4||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))
    return null;
  try{
    const b=Buffer.from(s,'base64');
    return b.length>0&&b.length<=max&&
      b.toString('base64')===s?b:null;
  }catch{return null;}
};
export interface Phase63ReceiptRecord{
  ordinal:number;
  originalSourceRecordId:string;
  originalSourceSequence:number;
  instrumentKey:string;
  originalEventAt:string;
  claimedStrategyReceivedAt:string;
  originalFullQuoteRecordSha256:string;
  previousReceiptLinkSha256:string;
  receiptLinkSha256:string;
}
export interface Phase63CaptureLedger{
  schemaVersion:'ADAPTIVE_PHASE63_COMPLETE_CLAIMED_STRATEGY_RECEIPT_LEDGER_V1';
  source:'UNTRUSTED_OPERATOR_CLAIMED_CONTEMPORANEOUS_CLIENT_CAPTURE';
  initialReceiptSeedSha256:string;
  receipts:Phase63ReceiptRecord[];
}
export function phase63ReceiptLink(
  receipt:Omit<Phase63ReceiptRecord,'receiptLinkSha256'>
):string{
  return digest(Buffer.from(
    'ADAPTIVE_PHASE63_ORIGINAL_L1_STRATEGY_RECEIPT_CHAIN_V1\n'+
    JSON.stringify(receipt),'utf8'));
}
/**
 * Deterministic fixture/owner package constructor, NOT a trustworthy
 * contemporaneous capture method. Callers may fabricate these receipts.
 */
export function phase63BuildClaimedReceiptLedger(
  originals:Phase61L1CustodyRow[],seed:string
):Phase63CaptureLedger{
  if(!SHA.test(seed))throw Error('INVALID_INDEPENDENT_CHAIN_SEED');
  let previous=seed;
  const receipts=originals.map((r,i)=>{
    const unsigned={
      ordinal:i+1,originalSourceRecordId:r.sourceRecordId,
      originalSourceSequence:r.sourceSequence,
      instrumentKey:r.instrumentKey,
      originalEventAt:r.observedAt,
      claimedStrategyReceivedAt:r.availableAt,
      originalFullQuoteRecordSha256:quoteHash(r),
      previousReceiptLinkSha256:previous
    };
    const receiptLinkSha256=phase63ReceiptLink(unsigned);
    previous=receiptLinkSha256;
    return {...unsigned,receiptLinkSha256};
  });
  return {
    schemaVersion:'ADAPTIVE_PHASE63_COMPLETE_CLAIMED_STRATEGY_RECEIPT_LEDGER_V1',
    source:'UNTRUSTED_OPERATOR_CLAIMED_CONTEMPORANEOUS_CLIENT_CAPTURE',
    initialReceiptSeedSha256:seed,receipts
  };
}
export interface Phase63CaptureSeal{
  schemaVersion:'ADAPTIVE_PHASE63_ORIGINAL_CAPTURE_CHAIN_SEAL_V1';
  signedPhase62ManifestSha256:string;
  phase62OriginalNativeCsvSha256:string;
  completeCaptureLedgerBytesSha256:string;
  initialReceiptSeedSha256:string;
  finalReceiptLinkSha256:string;
  expectedOriginalL1Receipts:number;
  claimedCollectorId:string;
  collectorClaimedSignedAt:string;
}
export const phase63CaptureSealMessage=(s:Phase63CaptureSeal):Buffer=>
  Buffer.from('ADAPTIVE_PHASE63_STRATEGY_RECEIPT_COLLECTOR_SEAL_V1\n'+
    JSON.stringify(s),'utf8');
export interface Phase63Input{
  schemaVersion:'ADAPTIVE_PHASE63_ORIGINAL_RECEIPT_CHAIN_INTAKE_V1';
  source:'OWNER_PRIVATE_UNTRUSTED_STRATEGY_RECEIPT_LEDGER';
  phase62:Phase62Input;
  phase62Pins:Phase62IndependentPins;
  claimedStrategyCaptureLedgerBase64:string;
  captureSeal:Phase63CaptureSeal;
  collectorEd25519PublicSpkiDerBase64:string;
  collectorDetachedSignatureBase64:string;
}
export interface Phase63IndependentPins{
  schemaVersion:'INDEPENDENT_PHASE63_STRATEGY_CAPTURE_RECEIPT_PINS_V1';
  expectedPhase62InputSha256:string;
  expectedPhase62PinsSha256:string;
  expectedCaptureLedgerBytesSha256:string;
  expectedCaptureSealSha256:string;
  expectedCollectorPublicSpkiSha256:string;
  expectedCollectorSignatureSha256:string;
  expectedInitialReceiptSeedSha256:string;
  expectedFinalReceiptLinkSha256:string;
  expectedClaimedCollectorId:string;
  expectedAllOriginalL1ReceiptCount:number;
  maximumAllowedOriginalEventToClaimedCaptureLagSeconds:number;
}
export interface Phase63Report{
  mode:'OFFLINE_COMPLETE_ORIGINAL_L1_STRATEGY_RECEIPT_CHAIN_CONSISTENCY';
  status:'INVALID_EVIDENCE'|'INCOMPLETE_EVIDENCE'|
    'DESCRIPTIVE_SELF_SIGNED_COMPLETE_CAPTURE_CHAIN_ONLY';
  reasonCodes:string[];
  phase62Status:Phase62Report['status']|null;
  syntheticDataset:boolean|null;
  originalNativeQuoteRows:number;
  chainedOriginalSourceQuoteReceipts:number;
  matchedOriginalQuotesAndClaimedAvailableAtReceipts:number;
  originalInstrumentCount:number;
  collectorKeyDistinctFromClaimedPublisherAndWitness:boolean;
  collectorEd25519SignatureMathematicallyValid:boolean;
  allOriginalReceiptHashesLinked:boolean;
  claimedStrategyReceiveTimeInternallyConsistent:boolean;
  contemporaneousReceiptClockIndependentlyAuthenticated:false;
  independentCollectorIdentityVerified:false;
  independentPublisherVendorIdentityVerified:false;
  independentlyLicensedHistoricalOptionL1Verified:false;
  originalNativeExchangeTransportAuthenticated:false;
  officialOptionContractExpirySessionCalendarVerified:false;
  independentlyTrustedReceiptTimeAuthorityVerified:false;
  originalMultiRegimeOosProfitableTradingProven:false;
  ivThetaOvernightGapCalibrationVerified:false;
  brokerNrmlNativeStopGttOvernightAcknowledged:false;
  historicalBestContractRankingAuthorized:false;
  executionAuthorized:false;
  productionSafe:false;
  nativeOrderInstruction:null;
  warnings:string[];
}
const WARN=[
  'FULL_OPERATOR_GENERATED_CAPTURE_LEDGER_CAN_BE_RETROSPECTIVELY_FABRICATED',
  'THIRD_ED25519_KEY_CAN_BE_GENERATED_BY_SAME_OPERATOR_AS_PHASE62_KEYS',
  'CLAIMED_STRATEGY_RECEIVE_TIME_IS_NOT_AN_EXTERNALLY_TRUSTED_TIMESTAMP',
  'HASH_CHAIN_IS_DELETION_ORDER_AND_TAMPER_EVIDENCE_ONLY_AFTER_ANCHORING',
  'APPROVED_VENDOR_ISSUER_ENTITLEMENT_AND_ORIGINAL_CAPTURE_CLOCK_STILL_MISSING',
  'SYNTHETIC_OR_SELF_SIGNED_CAPTURE_DOES_NOT_PROVE_REAL_HISTORICAL_ACCESS',
  'MARKET_BID_ASK_DISPLAYED_QUANTITY_NOT_BROKER_FILL_OR_STOP_PROTECTION',
  'NO_TRUE_MULTIREGIME_OOS_EDGE_OR_OPTION_GREEKS_VALIDATED',
  'NO_NATIVE_NRML_ORDER_STOP_GTT_WRITE_OR_FORCED_POSITIONAL_15_15_EXIT'
];
const empty=():Phase63Report=>({
  mode:'OFFLINE_COMPLETE_ORIGINAL_L1_STRATEGY_RECEIPT_CHAIN_CONSISTENCY',
  status:'INVALID_EVIDENCE',reasonCodes:[],
  phase62Status:null,syntheticDataset:null,
  originalNativeQuoteRows:0,chainedOriginalSourceQuoteReceipts:0,
  matchedOriginalQuotesAndClaimedAvailableAtReceipts:0,
  originalInstrumentCount:0,
  collectorKeyDistinctFromClaimedPublisherAndWitness:false,
  collectorEd25519SignatureMathematicallyValid:false,
  allOriginalReceiptHashesLinked:false,
  claimedStrategyReceiveTimeInternallyConsistent:false,
  contemporaneousReceiptClockIndependentlyAuthenticated:false,
  independentCollectorIdentityVerified:false,
  independentPublisherVendorIdentityVerified:false,
  independentlyLicensedHistoricalOptionL1Verified:false,
  originalNativeExchangeTransportAuthenticated:false,
  officialOptionContractExpirySessionCalendarVerified:false,
  independentlyTrustedReceiptTimeAuthorityVerified:false,
  originalMultiRegimeOosProfitableTradingProven:false,
  ivThetaOvernightGapCalibrationVerified:false,
  brokerNrmlNativeStopGttOvernightAcknowledged:false,
  historicalBestContractRankingAuthorized:false,
  executionAuthorized:false,productionSafe:false,
  nativeOrderInstruction:null,warnings:WARN
});
const fail=(reason:string,status:Phase63Report['status']='INVALID_EVIDENCE',
  fields?:Partial<Phase63Report>):Phase63Report=>({
    ...empty(),...fields,status,reasonCodes:[reason]
  });
function parseJson<T>(bytes:Buffer):T|null{
  try{
    const v=JSON.parse(
      new TextDecoder('utf8',{fatal:true}).decode(bytes));
    return v&&typeof v==='object'&&!Array.isArray(v)?v as T:null;
  }catch{return null;}
}
function verifyCollector(
  der:Buffer,signature:Buffer,seal:Phase63CaptureSeal
):boolean{
  if(signature.length!==64)return false;
  try{
    const key=createPublicKey({key:der,format:'der',type:'spki'});
    return key.asymmetricKeyType==='ed25519'&&
      Buffer.from(key.export({format:'der',type:'spki'})).equals(der)&&
      verifySignature(null,phase63CaptureSealMessage(seal),
        key,signature);
  }catch{return false;}
}
export function auditPhase63OriginalCaptureReceiptChain(
  input:Phase63Input,pins:Phase63IndependentPins
):Phase63Report{
  if(!input||input.schemaVersion!==
      'ADAPTIVE_PHASE63_ORIGINAL_RECEIPT_CHAIN_INTAKE_V1'||
    input.source!=='OWNER_PRIVATE_UNTRUSTED_STRATEGY_RECEIPT_LEDGER'||
    !pins||pins.schemaVersion!==
      'INDEPENDENT_PHASE63_STRATEGY_CAPTURE_RECEIPT_PINS_V1'||
    !input.phase62||!input.phase62Pins||
    ![
      pins.expectedPhase62InputSha256,
      pins.expectedPhase62PinsSha256,
      pins.expectedCaptureLedgerBytesSha256,
      pins.expectedCaptureSealSha256,
      pins.expectedCollectorPublicSpkiSha256,
      pins.expectedCollectorSignatureSha256,
      pins.expectedInitialReceiptSeedSha256,
      pins.expectedFinalReceiptLinkSha256
    ].every(x=>typeof x==='string'&&SHA.test(x))||
    !ID.test(pins.expectedClaimedCollectorId??'')||
    !int(pins.expectedAllOriginalL1ReceiptCount,1,300000)||
    !int(pins.maximumAllowedOriginalEventToClaimedCaptureLagSeconds,
      0,300)||
    pins.expectedPhase62InputSha256!==hash(input.phase62)||
    pins.expectedPhase62PinsSha256!==hash(input.phase62Pins))
    return fail('PHASE63_ORIGINAL_PARENT_SOURCE_OR_RECEIPT_PINS_INVALID');
  const seal=input.captureSeal;
  if(!seal||typeof seal!=='object'||
    Object.keys(seal).length!==8||
    seal.schemaVersion!=='ADAPTIVE_PHASE63_ORIGINAL_CAPTURE_CHAIN_SEAL_V1'||
    ![
      seal.signedPhase62ManifestSha256,
      seal.phase62OriginalNativeCsvSha256,
      seal.completeCaptureLedgerBytesSha256,
      seal.initialReceiptSeedSha256,seal.finalReceiptLinkSha256
    ].every(x=>typeof x==='string'&&SHA.test(x))||
    seal.expectedOriginalL1Receipts!==
      pins.expectedAllOriginalL1ReceiptCount||
    seal.claimedCollectorId!==pins.expectedClaimedCollectorId||
    !Number.isFinite(timestamp(seal.collectorClaimedSignedAt))||
    hash(seal)!==pins.expectedCaptureSealSha256||
    seal.initialReceiptSeedSha256!==
      pins.expectedInitialReceiptSeedSha256||
    seal.finalReceiptLinkSha256!==
      pins.expectedFinalReceiptLinkSha256)
    return fail('PHASE63_COLLECTOR_SEAL_OR_INDEPENDENT_ROOT_INVALID');
  const ledgerBytes=decode(
      input.claimedStrategyCaptureLedgerBase64,45_000_000),
    keyBytes=decode(input.collectorEd25519PublicSpkiDerBase64,512),
    signature=decode(input.collectorDetachedSignatureBase64,256);
  if(!ledgerBytes||!keyBytes||!signature)
    return fail('PHASE63_ORIGINAL_CAPTURE_RECEIPT_OR_SIGNER_BYTES_ABSENT');
  if(digest(ledgerBytes)!==pins.expectedCaptureLedgerBytesSha256||
    digest(ledgerBytes)!==seal.completeCaptureLedgerBytesSha256||
    digest(keyBytes)!==pins.expectedCollectorPublicSpkiSha256||
    digest(signature)!==pins.expectedCollectorSignatureSha256)
    return fail('PHASE63_RECEIPT_LOG_PUBLIC_KEY_OR_SIGNATURE_HASH_DISAGREES');
  const phase62=input.phase62;
  const publisher=decode(
    phase62.publisherEd25519PublicKeySpkiDerBase64,512),
    witness=decode(phase62.witnessEd25519PublicKeySpkiDerBase64,512);
  if(!publisher||!witness||keyBytes.equals(publisher)||
    keyBytes.equals(witness))
    return fail('PHASE63_COLLECTOR_KEY_NOT_DISTINCT_FROM_SOURCE_WITNESS');
  if(!verifyCollector(keyBytes,signature,seal))
    return fail('PHASE63_COLLECTOR_SIGNATURE_NOT_VALID_FOR_EXACT_SOURCE');
  const signed:Partial<Phase63Report>={
    collectorKeyDistinctFromClaimedPublisherAndWitness:true,
    collectorEd25519SignatureMathematicallyValid:true
  };
  if(seal.signedPhase62ManifestSha256!==
      hash(phase62.signedManifest)||
    seal.phase62OriginalNativeCsvSha256!==
      phase62.signedManifest.originalCsvSha256)
    return fail('PHASE63_COLLECTOR_SEAL_NOT_BOUND_TO_PHASE62_MANIFEST_CSV',
      'INCOMPLETE_EVIDENCE',signed);
  let old:Phase62Report;
  try{old=auditPhase62NativeCsvDualReceipts(
    phase62,input.phase62Pins);}
  catch{return fail('PHASE62_PREEXISTING_SOURCE_REAUDIT_EXCEPTION',
    'INCOMPLETE_EVIDENCE',signed);}
  const parent:Partial<Phase63Report>={
    ...signed,phase62Status:old.status,
    syntheticDataset:old.syntheticDataset,
    originalNativeQuoteRows:old.nativeCsvQuoteRows
  };
  if(old.status!==
      'DESCRIPTIVE_TWO_CLAIMED_ED25519_SIGNATURES_AND_NATIVE_CSV_CONSISTENT_UNVERIFIED'||
    old.nativeCsvQuoteRows!==pins.expectedAllOriginalL1ReceiptCount||
    old.rowsMatchingOriginalPhase61CustodyAndPhase50!==
      pins.expectedAllOriginalL1ReceiptCount)
    return fail('PHASE62_ORIGINAL_NATIVE_CSV_SOURCE_REAUDIT_INCOMPLETE',
      'INCOMPLETE_EVIDENCE',parent);
  const ledger=parseJson<Phase63CaptureLedger>(ledgerBytes);
  if(!ledger||ledger.schemaVersion!==
      'ADAPTIVE_PHASE63_COMPLETE_CLAIMED_STRATEGY_RECEIPT_LEDGER_V1'||
    ledger.source!==
      'UNTRUSTED_OPERATOR_CLAIMED_CONTEMPORANEOUS_CLIENT_CAPTURE'||
    Object.keys(ledger).length!==4||
    ledger.initialReceiptSeedSha256!==
      pins.expectedInitialReceiptSeedSha256||
    !Array.isArray(ledger.receipts)||
    ledger.receipts.length!==pins.expectedAllOriginalL1ReceiptCount)
    return fail('PHASE63_COMPLETE_ORIGINAL_RECEIPT_COUNT_OR_SEED_INVALID',
      'INCOMPLETE_EVIDENCE',parent);
  const custodyBytes=decode(
    phase62.phase61.originalL1QuoteEnvelopeBase64,25_000_000);
  if(!custodyBytes)
    return fail('PHASE61_ORIGINAL_CUSTODY_FOR_CAPTURE_JOIN_MISSING',
      'INCOMPLETE_EVIDENCE',parent);
  let original:Phase61L1CustodyRow[];
  try{
    const body=new TextDecoder('utf8',{fatal:true})
      .decode(custodyBytes);
    if(!body.endsWith('\n'))throw Error('Missing final original LF');
    original=body.slice(0,-1).split('\n').map(s=>
      JSON.parse(s) as Phase61L1CustodyRow);
  }catch{return fail('PHASE63_ORIGINAL_SOURCE_QUOTE_LEDGER_PARSE_FAILED',
    'INCOMPLETE_EVIDENCE',parent);}
  if(original.length!==pins.expectedAllOriginalL1ReceiptCount)
    return fail('PHASE63_ORIGINAL_SOURCE_AND_RECEIPT_DENOMINATOR_MISMATCH',
      'INCOMPLETE_EVIDENCE',parent);
  const instruments=new Set<string>(),
    lastReceiptByInstrument=new Map<string,number>();
  let previous=ledger.initialReceiptSeedSha256;
  let matched=0;
  for(let i=0;i<ledger.receipts.length;i++){
    const receipt=ledger.receipts[i],r=original[i];
    if(!receipt||typeof receipt!=='object'||
      Object.keys(receipt).length!==9||
      receipt.ordinal!==i+1||
      receipt.originalSourceRecordId!==r.sourceRecordId||
      receipt.originalSourceSequence!==r.sourceSequence||
      receipt.instrumentKey!==r.instrumentKey||
      receipt.originalEventAt!==r.observedAt||
      receipt.originalFullQuoteRecordSha256!==quoteHash(r)||
      receipt.claimedStrategyReceivedAt!==r.availableAt)
      return fail('PHASE63_CLAIMED_CAPTURE_RECEIPT_DIFFERS_FROM_ORIGINAL_L1',
        'INCOMPLETE_EVIDENCE',{...parent,
          chainedOriginalSourceQuoteReceipts:ledger.receipts.length,
          matchedOriginalQuotesAndClaimedAvailableAtReceipts:matched});
    const event=timestamp(receipt.originalEventAt),
      available=timestamp(receipt.claimedStrategyReceivedAt);
    if(!Number.isFinite(event)||!Number.isFinite(available)||
      available<event||
      available-event>
        pins.maximumAllowedOriginalEventToClaimedCaptureLagSeconds*1000||
      (lastReceiptByInstrument.get(receipt.instrumentKey)??-Infinity)>
        available)
      return fail('PHASE63_CAPTURE_TIME_NOT_ORIGINAL_OR_CAUSALLY_ORDERED',
        'INCOMPLETE_EVIDENCE',{...parent,
          chainedOriginalSourceQuoteReceipts:ledger.receipts.length,
          matchedOriginalQuotesAndClaimedAvailableAtReceipts:matched});
    const {
      receiptLinkSha256,...withoutLink
    }=receipt;
    if(receipt.previousReceiptLinkSha256!==previous||
      typeof receiptLinkSha256!=='string'||
      !SHA.test(receiptLinkSha256)||
      receiptLinkSha256!==phase63ReceiptLink(withoutLink))
      return fail('PHASE63_COMPLETE_ORIGINAL_RECEIPT_HASH_CHAIN_BROKEN',
        'INCOMPLETE_EVIDENCE',{...parent,
          chainedOriginalSourceQuoteReceipts:ledger.receipts.length,
          matchedOriginalQuotesAndClaimedAvailableAtReceipts:matched});
    previous=receiptLinkSha256;
    lastReceiptByInstrument.set(receipt.instrumentKey,available);
    instruments.add(receipt.instrumentKey);matched++;
  }
  if(previous!==seal.finalReceiptLinkSha256||
    previous!==pins.expectedFinalReceiptLinkSha256||
    // Even a later legally generated signed historical export is NOT
    // proof that the operator could access those ticks on OOS day.
    timestamp(seal.collectorClaimedSignedAt)<
      Math.max(...ledger.receipts.map(r=>
        timestamp(r.claimedStrategyReceivedAt))))
    return fail('PHASE63_INDEPENDENT_FINAL_CHAIN_ROOT_OR_SEAL_TIME_MISMATCH',
      'INCOMPLETE_EVIDENCE',{...parent,
        chainedOriginalSourceQuoteReceipts:ledger.receipts.length,
        matchedOriginalQuotesAndClaimedAvailableAtReceipts:matched});
  return {...empty(),...parent,
    status:'DESCRIPTIVE_SELF_SIGNED_COMPLETE_CAPTURE_CHAIN_ONLY',
    reasonCodes:[
      'ALL_CLAIMED_ORIGINAL_RECEIPT_BYTES_AND_SOURCE_TIMES_COHERENT_ONLY',
      'THIRD_OPERATOR_SIGNED_CHAIN_NOT_PROOF_OF_INDEPENDENT_RECEIPT_CLOCK',
      'INDEPENDENT_VENDOR_IDENTITY_AND_HISTORICAL_FNO_ENTITLEMENT_STILL_MISSING'
    ],
    chainedOriginalSourceQuoteReceipts:ledger.receipts.length,
    matchedOriginalQuotesAndClaimedAvailableAtReceipts:matched,
    originalInstrumentCount:instruments.size,
    allOriginalReceiptHashesLinked:true,
    claimedStrategyReceiveTimeInternallyConsistent:true
  };
}
