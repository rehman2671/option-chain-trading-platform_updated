import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyExecutionBlock, validBasketLegs, basketFullyFilled } from '../release/legacyExecutionContainment.js';
import { browserMutationAllowed } from '../release/browserMutationGuard.js';
import { DrawdownController } from '../../quant/risk/drawdownController.js';
import type { StrategyLeg, BasketOrderRecord } from '../../types.js';

const leg: StrategyLeg = {id:'a',type:'CE',action:'BUY',strikePrice:24000,expiry:'2026-11-24',quantity:1,lotSize:65,currentLtp:100,iv:0.2,delta:0.5,gamma:0.01,theta:-1,vega:1};
const basket: BasketOrderRecord = {id:'fixture',strategyId:'fixture-strategy',strategyName:'Fixture',symbol:'NIFTY',status:'COMPLETED',createdAt:'2026-11-24T04:00:00Z',marginRequired:6500,marginAvailable:100000,reconciliationStatus:'IN_SYNC',
 legs:[{legId:'a',type:'CE',action:'BUY',strikePrice:24000,requestedQty:65,filledQty:65,avgFillPrice:100,status:'FILLED',executionSeq:1}]};

test('legacy live containment cannot be released by arbitrary mode values',()=>{
  assert.equal(legacyExecutionBlock('LIVE'),'LEGACY_LIVE_EXECUTION_QUARANTINED');
  for(const value of [null,undefined,'live','LIVE_REAL','',{},1]) assert.equal(legacyExecutionBlock(value),'INVALID_EXECUTION_MODE');
  assert.equal(legacyExecutionBlock('PAPER'),null);
  assert.equal(legacyExecutionBlock('SHADOW'),null);
});
test('basket validation rejects zero/negative/fractional/NaN and duplicate identity inputs',()=>{
  assert.equal(validBasketLegs([leg]),true);
  for(const bad of [[],null,[leg,leg],[{...leg,quantity:0}],[{...leg,quantity:1.5}],[{...leg,lotSize:-1}],[{...leg,currentLtp:NaN}],[{...leg,expiry:'CURRENT'}],[{...leg,action:'INVALID'}],[{...leg,product:'INVALID'}]]) assert.equal(validBasketLegs(bad),false);
});
test('failed or partial exit does not satisfy full completion',()=>{
  assert.equal(basketFullyFilled(basket,[leg]),true);
  assert.equal(basketFullyFilled({...basket,status:'FAILED'},[leg]),false);
  assert.equal(basketFullyFilled({...basket,legs:[{...basket.legs[0],filledQty:20}]},[leg]),false);
  assert.equal(basketFullyFilled({...basket,legs:[{...basket.legs[0],status:'PENDING'}]},[leg]),false);
  assert.equal(basketFullyFilled({...basket,legs:[{...basket.legs[0],legId:'other'}]},[leg]),false);
  assert.equal(basketFullyFilled({...basket,legs:[{...basket.legs[0],avgFillPrice:0}]},[leg]),false);
  assert.equal(basketFullyFilled({...basket,reconciliationStatus:'MISMATCH_DETECTED'},[leg]),false);
});
test('drawdown status projection is read-only and does not manufacture diagnostics',()=>{
  const d=new DrawdownController();
  d.evaluateDrawdown(500000,500000,'a');
  const before=d.readStatus('a');
  assert.equal(before.currentCapital,500000);
  assert.deepEqual(before.diagnosticChecks,[]);
  assert.equal(d.isHalted('a'),false);
  d.evaluateDrawdown(400000,500000,'b');
  assert.equal(d.readStatus('b').isHalted,true);
  assert.equal(d.isHalted('a'),false);
  assert.equal(d.isHalted(),false);
});
test('account-scoped reset never clears another or anonymous paper row',async()=>{
  const {dbEngine}=await import('../db.js');
  const {randomUUID}=await import('node:crypto');
  await dbEngine.initialize();
  const db=dbEngine.getRawDatabase();
  const a='test-a-'+randomUUID(), b='test-b-'+randomUUID(), anon='test-anon-'+randomUUID();
  const now=new Date().toISOString();
  const insert=db.prepare("INSERT INTO paper_positions(id,symbol,strategy_name,strike_price,option_type,action,quantity,lot_size,entry_price,current_price,status,opened_at,user_id) VALUES(?,'NIFTY','fixture',24000,'CE','BUY',65,65,100,100,'OPEN',?,?)");
  try {
    insert.run(a,now,a); insert.run(b,now,b); insert.run(anon,now,null);
    assert.equal(dbEngine.getPaperPositionById(b,a),null);
    assert.equal(dbEngine.getPaperPositionById(anon,a),null);
    assert.equal(dbEngine.closePaperPosition(b,110,650,'fixture',a),false);
    assert.equal(dbEngine.closePaperPosition(anon,110,650,'fixture',a),false);
    assert.throws(()=>dbEngine.clearUserPaperPositions(''),/ACCOUNT_REQUIRED/);
    assert.equal(dbEngine.clearUserPaperPositions(a),1);
    assert.equal(dbEngine.getPaperPositionById(a),null);
    assert.ok(dbEngine.getPaperPositionById(b,b));
    assert.ok(dbEngine.getPaperPositionById(anon));
  } finally {db.prepare('DELETE FROM paper_positions WHERE id IN (?,?,?)').run(a,b,anon);}
});

test('cookie mutations enforce same origin without denying non-cookie bearer callers',()=>{
  const base={method:'POST',hasSessionCookie:true,requestOrigin:'https://app.example.invalid'};
  assert.equal(browserMutationAllowed({...base,origin:base.requestOrigin}),true);
  assert.equal(browserMutationAllowed({...base,origin:'https://other.example.invalid'}),false);
  assert.equal(browserMutationAllowed({...base,origin:'null'}),false);
  assert.equal(browserMutationAllowed({...base,fetchSite:'cross-site'}),false);
  assert.equal(browserMutationAllowed({...base,hasSessionCookie:false,origin:'https://other.example.invalid'}),true);
  assert.equal(browserMutationAllowed({...base,method:'GET',origin:'https://other.example.invalid'}),true);
});
test('password, status, MFA and logout-style revocation invalidate prior session versions',async()=>{
  const {dbEngine}=await import('../db.js');
  const {randomUUID}=await import('node:crypto');
  await dbEngine.initialize();
  const db=dbEngine.getRawDatabase();
  const id='test-session-'+randomUUID();
  db.prepare("INSERT INTO users(id,email,name,role,is_active,password_hash,email_verified) VALUES(?,?,?,'OPERATOR',1,?,1)").run(id,id+'@example.invalid','Fixture','hash');
  try{
    assert.equal(dbEngine.getUserSessionVersion(id),0);
    dbEngine.setUserPassword(id,'new-hash');
    assert.equal(dbEngine.getUserSessionVersion(id),1);
    dbEngine.setUserMfaSecret(id,null,false);
    assert.equal(dbEngine.getUserSessionVersion(id),2);
    dbEngine.setUserActiveStatus(id,false);
    assert.equal(dbEngine.getUserSessionVersion(id),null);
    dbEngine.setUserActiveStatus(id,true);
    assert.equal(dbEngine.getUserSessionVersion(id),4);
    dbEngine.revokeUserSessions(id);
    assert.equal(dbEngine.getUserSessionVersion(id),5);
  }finally{db.prepare('DELETE FROM users WHERE id=?').run(id);}
});

test('atomic paper group rolls back earlier leg when a later leg collides or cannot be written',async()=>{
  const {dbEngine}=await import('../db.js');
  const {randomUUID}=await import('node:crypto');
  await dbEngine.initialize();
  const db=dbEngine.getRawDatabase();
  const user='test-batch-'+randomUUID(), first='test-leg-'+randomUUID(), second='test-leg-'+randomUUID();
  const make=(id:string):import('../../types.js').PaperPosition=>({
    id,symbol:'NIFTY',strategyName:'fixture',strategyGroupId:user,strikePrice:24000,type:'CE',action:'BUY',
    quantity:65,lotSize:65,entryPrice:100,currentPrice:100,pnl:0,pnlPercent:0,status:'OPEN',
    openedAt:new Date().toISOString(),expiry:'2026-11-24'
  });
  try{
    assert.throws(()=>dbEngine.createPaperPositionsAtomically([make(first),make(first)],user),/DUPLICATE/);
    assert.equal(dbEngine.getPaperPositionById(first,user),null);
    dbEngine.createPaperPositionsAtomically([make(first),make(second)],user);
    assert.ok(dbEngine.getPaperPositionById(first,user));
    assert.ok(dbEngine.getPaperPositionById(second,user));
    assert.throws(()=>dbEngine.createPaperPositionsAtomically([make(first)],user),/DUPLICATE/);
    assert.ok(dbEngine.getPaperPositionById(first,user));
  }finally{db.prepare('DELETE FROM paper_positions WHERE id IN (?,?)').run(first,second);}
});
