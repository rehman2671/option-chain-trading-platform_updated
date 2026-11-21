import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {resolveUniqueBrokerNetPosition} from
  '../../server/engine/ema15m/adaptiveUniqueBrokerPositionEvidence.js';
import {assessBrokerRemainingSellQuantity} from
  '../../server/engine/ema15m/adaptiveLiveSellQuantityGuard.js';
import {auditNrmlRestartQuarantine} from
  '../../server/engine/ema15m/adaptiveNrmlRestartQuarantine.js';
import {assessEmaLiveProductGate} from
  '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const key='NSE_FO|PH96_LONG_CALL',other='NSE_FO|PH96_OTHER_CONTRACT';
const record=(net:unknown=100,product:unknown='D',instrumentKey:unknown=key)=>({
  instrument_token:instrumentKey,product,net_quantity:net
});
const inspect=(rows:unknown,product:unknown='NRML')=>
  resolveUniqueBrokerNetPosition(rows,key,product);
const locked=(r:ReturnType<typeof inspect>)=>{
  const json=JSON.stringify(r);
  assert.ok(!json.includes(key));
  assert.ok(!json.includes(other));
  assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
};
describe('Phase96 exact-one native portfolio snapshot, not duplicate summation or missing-as-zero',()=>{
  it('one exact D row for NRML returns broker-reported long 100',()=>{
    const r=inspect([record()]);locked(r);
    assert.deepEqual(r,{verified:true,netQuantity:100,issue:null});
  });
  it('one exact I row for MIS returns native intraday net 50',()=>{
    const r=inspect([record(50,'I')],'MIS');locked(r);
    assert.deepEqual(r,{verified:true,netQuantity:50,issue:null});
  });
  it('broker decimal digits 50 are accepted without unsafe JS number coercion',()=>{
    const r=inspect([record('50')]);locked(r);
    assert.equal(r.verified,true);assert.equal(r.netQuantity,50);
  });
  it('explicit single broker net 0 remains observable zero, but cannot authorise a live SELL',()=>{
    const r=inspect([record(0)]);locked(r);
    assert.equal(r.verified,true);assert.equal(r.netQuantity,0);
    const sizing=assessBrokerRemainingSellQuantity({
      originalPositionQuantity:100,previousConfirmedSellFills:0,
      lotSize:50,brokerNetQuantity:r.netQuantity
    });
    assert.equal(sizing.allowed,false);
  });
  it('zero portfolio rows means contract not visible, NOT an authoritative zero holding',()=>{
    const r=inspect([]);locked(r);
    assert.deepEqual(r,{
      verified:false,netQuantity:null,issue:'BROKER_POSITION_NOT_VISIBLE'
    });
  });
  it('failed, null, object and non-array broker portfolio are not a complete snapshot',()=>{
    for(const rows of [null,undefined,{},'[]',true]){
      const r=inspect(rows);locked(r);
      assert.equal(r.verified,false);
      assert.equal(r.issue,'POSITION_SOURCE_MISSING_OR_TRUNCATED');
    }
  });
  it('two identical 50 D rows cannot be summed into a fictitious valid 100 holding',()=>{
    const r=inspect([record(50),record(50)]);locked(r);
    assert.equal(r.verified,false);
    assert.equal(r.issue,'DUPLICATE_OR_OTHER_PRODUCT_POSITION');
    assert.equal(r.netQuantity,null);
  });
  it('two D rows 100 and 0 still represent ambiguous positions, not a unique 100',()=>{
    const r=inspect([record(100),record(0)]);locked(r);
    assert.equal(r.verified,false);
    assert.equal(r.issue,'DUPLICATE_OR_OTHER_PRODUCT_POSITION');
  });
  it('one NRML D and one MIS I for the exact instrument fail either product review',()=>{
    for(const product of ['MIS','NRML'] as const){
      const r=inspect([record(100,'D'),record(50,'I')],product);locked(r);
      assert.equal(r.verified,false);
      assert.equal(r.issue,'DUPLICATE_OR_OTHER_PRODUCT_POSITION');
    }
  });
  it('a matching instrument on opposite product alone is not the requested product',()=>{
    for(const [desired,actual] of [['NRML','I'],['MIS','D']] as const){
      const r=inspect([record(100,actual)],desired);locked(r);
      assert.equal(r.verified,false);
    }
  });
  it('unrecognised broker product, lowercase mode and null product fail closed',()=>{
    for(const value of ['nrml','CNC','',null,undefined]){
      const r=inspect([record(100)],value);locked(r);
      assert.equal(r.verified,false);
      assert.equal(r.issue,'INVALID_EXACT_INSTRUMENT_OR_PRODUCT');
    }
    for(const value of ['',null,undefined,100]){
      const r=resolveUniqueBrokerNetPosition([record()],value,'NRML');locked(r);
      assert.equal(r.verified,false);
    }
  });
  it('null and malformed entries anywhere in the broker portfolio are not ignored',()=>{
    for(const bad of [null,undefined,42,{},[],{instrument_token:''}]){
      const r=inspect([record(),bad]);locked(r);
      assert.equal(r.verified,false);
      assert.equal(r.issue,'MALFORMED_BROKER_POSITION_RECORD');
    }
  });
  it('wrong unrelated instrument row cannot be substituted for target',()=>{
    const r=inspect([record(100,'D',other)]);locked(r);
    assert.equal(r.issue,'BROKER_POSITION_NOT_VISIBLE');
  });
  it('other valid option instruments may coexist in the portfolio',()=>{
    const r=inspect([record(100,'D',other),record(50)]);
    locked(r);assert.equal(r.verified,true);assert.equal(r.netQuantity,50);
  });
  it('instrument matching is exact and case sensitive, not a substring/underlying guess',()=>{
    for(const actual of [key.toLowerCase(),key+'_OTHER',key.slice(0,-1)]){
      const r=inspect([record(100,'D',actual)]);locked(r);
      assert.equal(r.verified,false);
      assert.equal(r.issue,'BROKER_POSITION_NOT_VISIBLE');
    }
  });
  it('negative/unsafe/fractional and non-finite broker net values fail closed',()=>{
    for(const q of [-50,1.2,NaN,Infinity,-Infinity,
      Number.MAX_SAFE_INTEGER+1]){
      const r=inspect([{...record(100),net_quantity:q}]);locked(r);
      assert.equal(r.verified,false);
      assert.equal(r.issue,'INVALID_OR_SHORT_BROKER_NET_QUANTITY');
    }
  });
  it('null, booleans, exponent, padded or decimal strings never coerce into a trusted quantity',()=>{
    for(const q of [null,undefined,true,false,'',' ','05','0050',
      '5e1','50.0','-50','+50','50 ',' 50','Infinity','NaN']){
      const r=inspect([{...record(100),net_quantity:q}]);locked(r);
      assert.equal(r.verified,false);
      assert.equal(r.issue,'INVALID_OR_SHORT_BROKER_NET_QUANTITY');
    }
  });
  it('string beyond max safe integer is blocked',()=>{
    const r=inspect([record('9007199254740993')]);locked(r);
    assert.equal(r.verified,false);
  });
  it('overlong instrument and oversized portfolio source are rejected before scans',()=>{
    const long='NSE_FO|'+'X'.repeat(300);
    const r=resolveUniqueBrokerNetPosition([record()],long,'NRML');locked(r);
    assert.equal(r.issue,'INVALID_EXACT_INSTRUMENT_OR_PRODUCT');
    const huge=Array.from({length:10001},()=>record(0,'D',other));
    const big=inspect(huge);locked(big);
    assert.equal(big.issue,'POSITION_SOURCE_MISSING_OR_TRUNCATED');
  });
  it('the live SELL remaining-size guard never treats ambiguous portfolio result as valid 100',()=>{
    for(const rows of [[],[record(50),record(50)],
      [record(100,'D'),record(0,'I')],null]){
      const broker=inspect(rows);locked(broker);
      const sizing=assessBrokerRemainingSellQuantity({
        originalPositionQuantity:100,previousConfirmedSellFills:0,
        lotSize:50,brokerNetQuantity:broker.netQuantity
      });
      assert.equal(sizing.allowed,false);
      assert.equal(sizing.remainingQuantity,0);
    }
  });
  it('verified matching 50-unit NRML row yields exactly 50 remaining SELL only',()=>{
    const broker=inspect([record(50)]);locked(broker);
    assert.equal(broker.verified,true);
    const sizing=assessBrokerRemainingSellQuantity({
      originalPositionQuantity:100,previousConfirmedSellFills:50,
      lotSize:50,brokerNetQuantity:broker.netQuantity
    });
    assert.equal(sizing.allowed,true);
    assert.equal(sizing.remainingQuantity,50);
  });
  it('NRML restart quarantine rejects duplicate broker D rows even if totals equal local 100',()=>{
    const audit=auditNrmlRestartQuarantine({
      expectedAccountId:'PH96_BROKER_ACCT',
      expectedPositionId:'PH96_JOURNAL_ID',
      journalPositions:[{
        id:'PH96_JOURNAL_ID',brokerAccountId:'PH96_BROKER_ACCT',
        brokerInstrumentKey:key,productType:'NRML',status:'OPEN',
        quantity:100,lotSize:50,exitFilledQuantity:0
      }],
      entryAttempt:{id:'PH96_ENTRY',brokerAccountId:'PH96_BROKER_ACCT',
        brokerInstrumentKey:key,orderStatus:'COMPLETE'},
      brokerConnected:true,brokerAccountId:'PH96_BROKER_ACCT',
      brokerPositions:[record(50),record(50)],
      brokerOrderBook:[],brokerGttOrders:[]
    });
    assert.equal(audit.brokerNetMatchesJournalRemainder,false);
    assert.equal(audit.status,'BROKER_OR_JOURNAL_CONFLICT');
    assert.ok(audit.reasonCodes.includes(
      'BROKER_NRML_POSITION_SOURCE_NOT_UNIQUE_OR_TRUSTWORTHY'));
    assert.equal(audit.duplicateSellRetryAuthorized,false);
    assert.equal(audit.liveNrmlBuyAuthorized,false);
    assert.ok(!JSON.stringify(audit).includes('PH96_BROKER_ACCT'));
  });
  it('NRML restart quarantine rejects correct D 100 plus another I product 50',()=>{
    const audit=auditNrmlRestartQuarantine({
      expectedAccountId:'PH96_BROKER_ACCT',
      expectedPositionId:'PH96_JOURNAL_ID',
      journalPositions:[{
        id:'PH96_JOURNAL_ID',brokerAccountId:'PH96_BROKER_ACCT',
        brokerInstrumentKey:key,productType:'NRML',status:'OPEN',
        quantity:100,lotSize:50,exitFilledQuantity:0
      }],
      entryAttempt:{id:'PH96_ENTRY',brokerAccountId:'PH96_BROKER_ACCT',
        brokerInstrumentKey:key,orderStatus:'COMPLETE'},
      brokerConnected:true,brokerAccountId:'PH96_BROKER_ACCT',
      brokerPositions:[record(100,'D'),record(50,'I')],
      brokerOrderBook:[],brokerGttOrders:[]
    });
    assert.equal(audit.brokerNetMatchesJournalRemainder,false);
    assert.ok(audit.reasonCodes.includes('SAME_OPTION_HAS_OTHER_PRODUCT_POSITION'));
    assert.equal(audit.liveNrmlBuyAuthorized,false);
  });
});
