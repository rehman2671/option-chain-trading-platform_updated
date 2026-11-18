import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {
  auditPhase45DualChannelOrderEvents,
  phase45EventChainTip,phase45WitnessMessage,
  type Phase45DualChannelArchive,type Phase45IndependentPins
} from '../../server/engine/ema15m/adaptiveUpstoxPhase45DualChannelOrderEvents.js';
import {
  hashPhase40OfflineArchive,type Phase40OrderEvent
} from '../../server/engine/ema15m/adaptiveUpstoxPhase40OvernightStopAudit.js';
import {makePhase45SyntheticPhase44Fixture}
  from './phase45_synthetic_phase44_fixture.js';

const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const capture=(source:string,seconds:number)=>
  new Date(Date.parse(source.replace(' ','T')+'+05:30')+
    seconds*1000+19800000).toISOString().replace('Z','+05:30');
type Variant='modify'|'replace'|'partial_replace'|'complete'|'cancel_only';
function make(variant:Variant='replace'){
  const old=makePhase45SyntheticPhase44Fixture(variant);
  const wsKey=generateKeyPairSync('ed25519'),
    hookKey=generateKeyPairSync('ed25519');
  const wsDer=wsKey.publicKey.export({
    type:'spki',format:'der'}) as Buffer;
  const hookDer=hookKey.publicKey.export({
    type:'spki',format:'der'}) as Buffer;
  const account=old.pins.expectedAccountScopeId;
  const rows=old.archive.orderSnapshots.flatMap(x=>x.history.response.data);
  const original=(row:Phase40OrderEvent)=>{
    // Upstox can represent the unassigned exchange reference as an
    // empty string; exact row comparison must normalize only that case.
    return JSON.stringify({
      update_type:'order',placed_by:account,
      order_id:row.order_id,
      exchange_order_id:row.exchange_order_id??'',
      instrument_token:row.instrument_token,
      trading_symbol:row.trading_symbol,
      product:row.product,order_type:row.order_type,
      transaction_type:row.transaction_type,
      quantity:row.quantity,filled_quantity:row.filled_quantity,
      status:row.status,order_request_id:row.order_request_id,
      order_timestamp:row.order_timestamp,
      exchange_timestamp:row.exchange_timestamp
    });
  };
  const channels:Phase45DualChannelArchive['channels']=[
    {channel:'PORTFOLIO_ORDER_WEBSOCKET',
      claimedOrigin:'UPSTOX_BROKER_UPDATE_UNVERIFIED',
      transportClaim:'OPERATOR_CLAIMS_TLS_WEBSOCKET',
      orderMessages:rows.map(row=>({
        source:'OPERATOR_CAPTURED_UNVERIFIED' as const,
        rawUtf8Base64:Buffer.from(original(row)).toString('base64'),
        capturedAt:capture(row.order_timestamp,5)
      })),
      witness:{role:'WS_CAPTURE_WITNESS',signedAt:'',
        publicKeySpkiDerBase64:wsDer.toString('base64'),
        signatureBase64:''}
    },
    {channel:'PUBLIC_ORDER_WEBHOOK',
      claimedOrigin:'UPSTOX_BROKER_UPDATE_UNVERIFIED',
      transportClaim:'PUBLIC_UNAUTHENTICATED_WEBHOOK_POST',
      orderMessages:rows.map(row=>({
        source:'OPERATOR_CAPTURED_UNVERIFIED' as const,
        rawUtf8Base64:Buffer.from(original(row)).toString('base64'),
        capturedAt:capture(row.order_timestamp,9)
      })),
      witness:{role:'WEBHOOK_CAPTURE_WITNESS',signedAt:'',
        publicKeySpkiDerBase64:hookDer.toString('base64'),
        signatureBase64:''}
    }
  ];
  const input:Phase45DualChannelArchive={
    schemaVersion:'ADAPTIVE_PHASE45_BROKER_ORDER_UPDATE_PARITY_V1',
    source:'PRIVATE_OPERATOR_ARCHIVE_UNVERIFIED',
    phase44Archive:old.archive,
    phase44IndependentPins:old.pins,
    channels
  };
  const pins:Phase45IndependentPins={
    schemaVersion:'INDEPENDENT_PHASE45_ORDER_UPDATE_PARITY_PINS_V1',
    expectedPhase44ArchiveSha256:'',
    expectedPhase44PinsSha256:'',
    expectedAccountScopeId:account,
    expectedSessionDate:'2026-11-18',
    expectedWsRawBodySha256:[],
    expectedWebhookRawBodySha256:[],
    expectedWsWitnessSpkiSha256:sha(wsDer),
    expectedWebhookWitnessSpkiSha256:sha(hookDer),
    expectedFinalEvidenceChainTipSha256:'',
    expectedChallengeSha256:'ab'.repeat(32),
    maxCaptureDelaySeconds:120,
    maxReviewDelayMinutes:20
  };
  const resign=()=>{
    pins.expectedPhase44ArchiveSha256=
      hashPhase40OfflineArchive(input.phase44Archive);
    pins.expectedPhase44PinsSha256=
      hashPhase40OfflineArchive(input.phase44IndependentPins);
    pins.expectedWsRawBodySha256=channels[0].orderMessages.map(x=>
      sha(Buffer.from(x.rawUtf8Base64,'base64')));
    pins.expectedWebhookRawBodySha256=channels[1].orderMessages.map(x=>
      sha(Buffer.from(x.rawUtf8Base64,'base64')));
    for(const channel of channels){
      const latest=channel.orderMessages.at(-1)!;
      channel.witness.signedAt=new Date(
        Date.parse(latest.capturedAt)+60000+19800000)
        .toISOString().replace('Z','+05:30');
    }
    pins.expectedFinalEvidenceChainTipSha256=
      phase45EventChainTip(input,pins);
    for(const [index,channel] of channels.entries()){
      const key=index===0?wsKey.privateKey:hookKey.privateKey;
      channel.witness.signatureBase64=sign(null,
        phase45WitnessMessage(input,pins,index),key).toString('base64');
    }
  };
  resign();
  return {input,pins,resign,rows};
}
const audit=(f:ReturnType<typeof make>)=>
  auditPhase45DualChannelOrderEvents(f.input,f.pins);
function neverUnsafe(r:ReturnType<typeof audit>){
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.productionSafe,false);
  assert.equal(r.brokerAuthenticated,false);
  assert.equal(r.brokerStopInstalled,false);
  assert.equal(r.protectedOvernight,false);
  assert.equal(r.nativeOrderInstruction,null);
  assert.equal(r.brokerReportCrossChannelParityOnly,true);
  assert.equal(r.independentTransportOriginsProven,false);
  assert.equal(r.publicWebhookSpoofingExcluded,false);
  assert.equal(r.websocketHandshakeIndependentlyAuthenticated,false);
  assert.equal(r.exchangeSignedOrderAcknowledgementVerified,false);
  assert.equal(r.independentNseNotisMemberTradeVerification,false);
  assert.equal(r.completeBrokerEventHistoryProven,false);
  assert.equal(r.nativeProtectiveStopContinuityVerified,false);
  assert.equal(r.overnightGapFillGuaranteed,false);
  for(const secret of ['SYNTHETIC_PRIVATE_ACCOUNT_PHASE44',
    'CHILD44_OLD','GTT-SYNTHETIC-PHASE44',
    'EXCHANGE_ID_44_OLD','NSE_FO|SYNTH_25000_CE'])
    assert.ok(!JSON.stringify(r).includes(secret));
}
function blocked(f:ReturnType<typeof make>,reason:string){
  const r=audit(f);neverUnsafe(r);
  assert.notEqual(r.status,'TWO_BROKER_REPORTED_CHANNELS_MATCH_UNVERIFIED',
    JSON.stringify(r));
  assert.deepEqual(r.reasonCodes,[reason]);
}
describe('Phase45 two Upstox-origin CLAIMED update channels vs Phase44',()=>{
  it('real 2 independent Ed25519 capture witness signatures on fake cancel-replace history remain UNVERIFIED',()=>{
    const f=make('replace');
    const r=audit(f);neverUnsafe(r);
    assert.equal(r.status,'TWO_BROKER_REPORTED_CHANNELS_MATCH_UNVERIFIED',
      JSON.stringify(r));
    assert.equal(r.expectedHistoryEvents,7);
    assert.equal(r.websocketMessagesMatched,7);
    assert.equal(r.webhookMessagesMatched,7);
    assert.equal(r.signedChannelClaimsVerified,2);
    assert.equal(r.observedStopMutationEvents,2);
    assert.equal(r.unobservedInterEventWindows,5);
  });
  it('local modification and complete histories can match, without claiming stop ACK',()=>{
    for(const variant of ['modify','complete'] as const){
      const f=make(variant);
      const r=audit(f);neverUnsafe(r);
      assert.equal(r.status,'TWO_BROKER_REPORTED_CHANNELS_MATCH_UNVERIFIED',
        JSON.stringify(r));
    }
  });
  it('public webhook and WebSocket both fabricated consistently still do NOT authenticate server/exchange',()=>{
    const r=audit(make('replace'));neverUnsafe(r);
    assert.equal(r.websocketHandshakeIndependentlyAuthenticated,false);
    assert.equal(r.publicWebhookSpoofingExcluded,false);
    assert.equal(r.exchangeSignedOrderAcknowledgementVerified,false);
  });
  it('changed broker status with new hash and valid resign still disagrees with Phase44',()=>{
    const f=make();
    const second=f.input.channels[1].orderMessages[3];
    const data=JSON.parse(Buffer.from(second.rawUtf8Base64,'base64')
      .toString('utf8')) as {status:string};
    data.status='rejected';
    second.rawUtf8Base64=Buffer.from(JSON.stringify(data))
      .toString('base64');
    f.resign();
    blocked(f,'CHANNEL_ORDER_ID_STATUS_REQUEST_FILL_OR_EXCHANGE_REF_DISAGREES');
  });
  it('wrong exchange ID, quantity, request ID or account scope all fail with fresh signatures',()=>{
    const mutators=[
      (x:Record<string,unknown>)=>{x.exchange_order_id='FORGED_ACK';},
      (x:Record<string,unknown>)=>{x.filled_quantity=65;},
      (x:Record<string,unknown>)=>{x.order_request_id='99';},
      (x:Record<string,unknown>)=>{x.placed_by='OTHER_UCC';}
    ];
    for(const mutate of mutators){
      const f=make();
      const msg=f.input.channels[0].orderMessages[4];
      const data=JSON.parse(Buffer.from(msg.rawUtf8Base64,'base64')
        .toString('utf8')) as Record<string,unknown>;
      mutate(data);
      msg.rawUtf8Base64=Buffer.from(JSON.stringify(data))
        .toString('base64');
      f.resign();
      blocked(f,'CHANNEL_ORDER_ID_STATUS_REQUEST_FILL_OR_EXCHANGE_REF_DISAGREES');
    }
  });
  it('duplicate critical JSON keys fail even with updated SHA and witness',()=>{
    const f=make();
    const msg=f.input.channels[0].orderMessages[0];
    const original=Buffer.from(msg.rawUtf8Base64,'base64').toString('utf8');
    msg.rawUtf8Base64=Buffer.from(
      original.replace(/^\{/,'{"order_id":"SPOOFED",'))
      .toString('base64');
    f.resign();
    blocked(f,'CHANNEL_ORDER_ID_STATUS_REQUEST_FILL_OR_EXCHANGE_REF_DISAGREES');
  });
  it('omitted webhook event, reordered messages or added duplicate never pass',()=>{
    const a=make();a.input.channels[1].orderMessages.pop();
    blocked(a,'MISSING_REORDERED_OR_UNPINNED_CHANNEL_EVENTS');
    const b=make();
    b.input.channels[0].orderMessages.reverse();
    b.resign();
    blocked(b,'CHANNEL_CAPTURE_OR_ORDER_EVENT_TIME_DISAGREES');
    const c=make();
    c.input.channels[1].orderMessages.push(
      {...c.input.channels[1].orderMessages[0]});
    c.resign();
    blocked(c,'MISSING_REORDERED_OR_UNPINNED_CHANNEL_EVENTS');
  });
  it('one raw payload changed without independent hash re-pinning blocks',()=>{
    const f=make();
    const raw=Buffer.from(f.input.channels[1].orderMessages[2]
      .rawUtf8Base64,'base64');
    raw[24]^=1;
    f.input.channels[1].orderMessages[2].rawUtf8Base64=
      raw.toString('base64');
    blocked(f,'ORIGINAL_CHANNEL_MESSAGE_BYTES_HASH_MISMATCH');
  });
  it('capture earlier than event or too late fails even with fresh signature',()=>{
    const a=make();
    a.input.channels[0].orderMessages[0].capturedAt=
      '2026-11-18T10:01:59+05:30';
    a.resign();
    blocked(a,'CHANNEL_CAPTURE_OR_ORDER_EVENT_TIME_DISAGREES');
    const b=make();
    b.input.channels[1].orderMessages[0].capturedAt=
      '2026-11-18T10:20:00+05:30';
    b.resign();
    blocked(b,'CHANNEL_CAPTURE_OR_ORDER_EVENT_TIME_DISAGREES');
  });
  it('stale review signature, forged key, identical signer pins all reject',()=>{
    const a=make();
    a.input.channels[0].witness.signedAt=
      '2026-11-18T14:00:00+05:30';
    blocked(a,'CHANNEL_WITNESS_SIGNATURE_OR_CAPTURE_WINDOW_INVALID');
    const b=make();
    b.input.channels[1].witness.signatureBase64=Buffer.alloc(64,0)
      .toString('base64');
    blocked(b,'CHANNEL_WITNESS_SIGNATURE_OR_CAPTURE_WINDOW_INVALID');
    const c=make();
    c.pins.expectedWebhookWitnessSpkiSha256=
      c.pins.expectedWsWitnessSpkiSha256;
    blocked(c,'PHASE44_ARCHIVE_OR_INDEPENDENT_PIN_SCOPE_INVALID');
  });
  it('wrong channel ordering and forged origin or transport claim reject',()=>{
    const a=make();
    a.input.channels.reverse();
    blocked(a,'MISSING_REORDERED_OR_UNPINNED_CHANNEL_EVENTS');
    const b=make();
    b.input.channels[1].transportClaim=
      'OPERATOR_CLAIMS_TLS_WEBSOCKET';
    blocked(b,'MISSING_REORDERED_OR_UNPINNED_CHANNEL_EVENTS');
    const c=make();
    c.input.channels[0].claimedOrigin=
      'INDEPENDENT_EXCHANGE' as 'UPSTOX_BROKER_UPDATE_UNVERIFIED';
    blocked(c,'MISSING_REORDERED_OR_UNPINNED_CHANNEL_EVENTS');
  });
  it('changed independent event-chain tip or source archive hashes reject',()=>{
    const a=make();
    a.pins.expectedFinalEvidenceChainTipSha256='ff'.repeat(32);
    blocked(a,'EXTERNAL_EVENT_SEQUENCE_CHAIN_TIP_MISMATCH');
    const b=make();
    b.pins.expectedPhase44ArchiveSha256='aa'.repeat(32);
    blocked(b,'PHASE44_ARCHIVE_OR_INDEPENDENT_PIN_SCOPE_INVALID');
  });
  it('tampered or invalid Phase44 native audit must fail before channel checks',()=>{
    const f=make();
    f.input.phase44Archive.orderSnapshots[0].history.response.data[3]
      .status='rejected';
    f.resign();
    blocked(f,'PHASE44_ORDER_MUTATION_REAUDIT_REJECTED');
  });
  it('wrong trading session and inappropriate window cannot upgrade fake receipts',()=>{
    const a=make();
    a.pins.expectedSessionDate='2026-11-19';
    blocked(a,'PHASE44_ACCOUNT_OR_SESSION_SCOPE_MISMATCH');
    const b=make();
    b.pins.maxCaptureDelaySeconds=0;
    blocked(b,'PHASE44_ARCHIVE_OR_INDEPENDENT_PIN_SCOPE_INVALID');
  });
});
