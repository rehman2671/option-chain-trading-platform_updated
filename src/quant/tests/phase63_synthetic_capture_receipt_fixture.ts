/**
 * Synthetic Phase63 fixture: all three Ed25519 keys are generated locally.
 * Correct signatures and hash-chain structure do not create vendor identity,
 * source clock, exchange entitlement, or live NRML approval.
 */
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {
  makePhase62SyntheticDualSourceFixture
} from './phase62_synthetic_native_csv_dual_receipt_fixture.js';
import {
  phase63BuildClaimedReceiptLedger,phase63CaptureSealMessage,
  hashPhase63Evidence,type Phase63Input,type Phase63IndependentPins,
  type Phase63CaptureLedger
} from '../../server/engine/ema15m/adaptivePhase63CaptureReceiptChain.js';

const sha=(b:Uint8Array)=>createHash('sha256')
  .update(b).digest('hex');
export function makePhase63SyntheticCaptureFixture(
  variant:'FLAT'|'GIVEBACK'|'GAP'='FLAT'
){
  const parent=makePhase62SyntheticDualSourceFixture(variant);
  const rows=parent.phase61.rows();
  const seed='8f'.repeat(32);
  const ledger=phase63BuildClaimedReceiptLedger(rows,seed);
  const collector=generateKeyPairSync('ed25519');
  const pub=collector.publicKey.export({format:'der',type:'spki'});
  const ledgerBytes=()=>Buffer.from(JSON.stringify(ledger),'utf8');
  const lastLink=()=>ledger.receipts.at(-1)!.receiptLinkSha256;
  const input:Phase63Input={
    schemaVersion:'ADAPTIVE_PHASE63_ORIGINAL_RECEIPT_CHAIN_INTAKE_V1',
    source:'OWNER_PRIVATE_UNTRUSTED_STRATEGY_RECEIPT_LEDGER',
    phase62:parent.input,
    phase62Pins:parent.pins,
    claimedStrategyCaptureLedgerBase64:ledgerBytes().toString('base64'),
    captureSeal:{
      schemaVersion:'ADAPTIVE_PHASE63_ORIGINAL_CAPTURE_CHAIN_SEAL_V1',
      signedPhase62ManifestSha256:
        hashPhase63Evidence(parent.input.signedManifest),
      phase62OriginalNativeCsvSha256:
        parent.input.signedManifest.originalCsvSha256,
      completeCaptureLedgerBytesSha256:sha(ledgerBytes()),
      initialReceiptSeedSha256:seed,
      finalReceiptLinkSha256:lastLink(),
      expectedOriginalL1Receipts:rows.length,
      claimedCollectorId:'SYNTHETIC_SELF_SIGNED_CLIENT_COLLECTOR',
      collectorClaimedSignedAt:new Date().toISOString()
    },
    collectorEd25519PublicSpkiDerBase64:Buffer.from(pub).toString('base64'),
    collectorDetachedSignatureBase64:''
  };
  const pins:Phase63IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE63_STRATEGY_CAPTURE_RECEIPT_PINS_V1',
    expectedPhase62InputSha256:'',
    expectedPhase62PinsSha256:'',
    expectedCaptureLedgerBytesSha256:'',
    expectedCaptureSealSha256:'',
    expectedCollectorPublicSpkiSha256:'',
    expectedCollectorSignatureSha256:'',
    expectedInitialReceiptSeedSha256:seed,
    expectedFinalReceiptLinkSha256:lastLink(),
    expectedClaimedCollectorId:input.captureSeal.claimedCollectorId,
    expectedAllOriginalL1ReceiptCount:rows.length,
    maximumAllowedOriginalEventToClaimedCaptureLagSeconds:30
  };
  const replaceLedger=(next:Phase63CaptureLedger)=>{
    input.claimedStrategyCaptureLedgerBase64=
      Buffer.from(JSON.stringify(next),'utf8').toString('base64');
  };
  const refreshSeal=()=>{
    input.captureSeal.signedPhase62ManifestSha256=
      hashPhase63Evidence(input.phase62.signedManifest);
    input.captureSeal.phase62OriginalNativeCsvSha256=
      input.phase62.signedManifest.originalCsvSha256;
    input.captureSeal.completeCaptureLedgerBytesSha256=sha(
      Buffer.from(input.claimedStrategyCaptureLedgerBase64,'base64'));
    input.captureSeal.finalReceiptLinkSha256=
      ledger.receipts.at(-1)!.receiptLinkSha256;
  };
  const signSeal=()=>{
    input.collectorDetachedSignatureBase64=sign(
      null,phase63CaptureSealMessage(input.captureSeal),
      collector.privateKey).toString('base64');
  };
  const repin=()=>{
    pins.expectedPhase62InputSha256=hashPhase63Evidence(input.phase62);
    pins.expectedPhase62PinsSha256=hashPhase63Evidence(input.phase62Pins);
    pins.expectedCaptureLedgerBytesSha256=sha(
      Buffer.from(input.claimedStrategyCaptureLedgerBase64,'base64'));
    pins.expectedCaptureSealSha256=
      hashPhase63Evidence(input.captureSeal);
    pins.expectedCollectorPublicSpkiSha256=sha(
      Buffer.from(input.collectorEd25519PublicSpkiDerBase64,'base64'));
    pins.expectedCollectorSignatureSha256=sha(
      Buffer.from(input.collectorDetachedSignatureBase64,'base64'));
  };
  const signAndRepin=()=>{signSeal();repin();};
  signAndRepin();
  return {
    parent,input,pins,ledger,replaceLedger,refreshSeal,signSeal,repin,
    signAndRepin,
    repinAllNested:()=>{
      parent.rePinAllNested();
      refreshSeal();signAndRepin();
    }
  };
}
