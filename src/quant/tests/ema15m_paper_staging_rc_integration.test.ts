import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {
  checkPaperStagingAdmission,assertPaperStagingAdmission
} from '../../server/release/paperStagingAdmission.js';
import {UpstoxProvider} from '../../server/engine/providers/UpstoxProvider.js';
import {
  performUpstoxTOTPLogin,setManualAccessToken
} from '../../server/engine/upstoxAuthService.js';
import {
  assessEmaLiveProductGate,assessEmaBrokerExitProductGate,
  isMisForcedSquareOffEligible
} from '../../server/engine/ema15m/adaptiveNrmlLiveReleaseInterlock.js';

const safe={
  PAPER_STAGING_MODE:'1',NODE_ENV:'production',
  DATA_PROVIDER:'practice',JWT_SECRET:'a'.repeat(64)
};
const expected='PAPER_STAGING_SETTINGS_OK';
describe('Paper-only staging release-candidate startup and broker denial',()=>{
  it('exact production practice mode with signing key and zero broker tokens admits offline UI',()=>{
    const r=checkPaperStagingAdmission(safe);
    assert.equal(r.admitted,true);
    assert.equal(r.mode,'PAPER_STAGING_RC');
    assert.equal(r.reason,expected);
    for(const flag of [
      'brokerWritesAuthorized','liveNrmlBuySellAuthorized',
      'legacyMisBrokerOrderAuthorized',
      'externalBrokerMarketDataConnected',
      'exchangeFeedLicensedOrAuthenticated',
      'paperStrategyProfitabilityProven'
    ] as const)assert.equal(r[flag],false,flag);
    assert.deepEqual(assertPaperStagingAdmission(safe),r);
  });
  it('missing, malformed or wrong provider mode never authorizes startup',()=>{
    const cases=[
      [{...safe,PAPER_STAGING_MODE:undefined},'PAPER_STAGING_NOT_REQUESTED'],
      [{...safe,PAPER_STAGING_MODE:'true'},'PAPER_STAGING_NOT_REQUESTED'],
      [{...safe,NODE_ENV:'test'},'PAPER_STAGING_NOT_PRODUCTION_RUNTIME'],
      [{...safe,NODE_ENV:'development'},'PAPER_STAGING_NOT_PRODUCTION_RUNTIME'],
      [{...safe,DATA_PROVIDER:'upstox'},'PAPER_STAGING_PRACTICE_PROVIDER_REQUIRED'],
      [{...safe,DATA_PROVIDER:'live'},'PAPER_STAGING_PRACTICE_PROVIDER_REQUIRED'],
      [{...safe,DATA_PROVIDER:''},'PAPER_STAGING_PRACTICE_PROVIDER_REQUIRED'],
      [{...safe,JWT_SECRET:'weak'},'PAPER_STAGING_JWT_SIGNING_SECRET_REQUIRED'],
      [{...safe,JWT_SECRET:undefined},'PAPER_STAGING_JWT_SIGNING_SECRET_REQUIRED']
    ] as const;
    for(const [env,reason] of cases){
      const r=checkPaperStagingAdmission(env);
      assert.equal(r.admitted,false);
      assert.equal(r.reason,reason);
      assert.throws(()=>assertPaperStagingAdmission(env),
        /PAPER_STAGING_STARTUP_DENIED/);
    }
  });
  it('any injected old/new Upstox credential alias DENIES paper startup without leaking it',()=>{
    for(const name of [
      'UPSTOX_ACCESS_TOKEN','UPSTOX_TOKEN',
      'UPSTOX_API_KEY','UPSTOX_API_SECRET',
      'UPSTOX_PIN','UPSTOX_TOTP_SECRET',
      'UPSTOX_MOBILE_NO','UPSTOX_CLIENT_ID',
      'UPSTOX_USER_ID','UPSTOX_TOTP_KEY'
    ]){
      const secret='PHRC1-DO-NOT-PRINT-SECRET';
      const env={...safe,[name]:secret};
      const r=checkPaperStagingAdmission(env);
      assert.equal(r.admitted,false);
      assert.equal(r.reason,'PAPER_STAGING_BROKER_CREDENTIALS_PRESENT');
      const out=JSON.stringify(r);
      assert.equal(out.includes(secret),false);
      assert.equal(out.includes(name),false);
      try{assertPaperStagingAdmission(env);}
      catch(e){assert.equal(String(e).includes(secret),false);}
    }
  });
  it('broker POST and token injection are disabled even on direct service calls',async()=>{
    const prior=process.env.PAPER_STAGING_MODE;
    process.env.PAPER_STAGING_MODE='1';
    try{
      const broker=new UpstoxProvider();
      await assert.rejects(
        broker.placeOrder({quantity:1,product:'NRML',
          instrumentToken:'NSE_FO|FORBIDDEN',action:'BUY'}),
        /PAPER_STAGING_BROKER_ORDER_DISABLED/);
      const login=await performUpstoxTOTPLogin();
      assert.equal(login.success,false);
      assert.equal(login.error,'PAPER_STAGING_BROKER_AUTH_DISABLED');
      const token=await setManualAccessToken('FAKE-REJECT-ME');
      assert.equal(token.success,false);
      assert.match(token.message,/PAPER_STAGING_BROKER_AUTH_DISABLED/);
    }finally{
      if(prior===undefined)delete process.env.PAPER_STAGING_MODE;
      else process.env.PAPER_STAGING_MODE=prior;
    }
  });
  it('runtime entry blocks token routes BEFORE Upstox callbacks and cron',()=>{
    const app=readFileSync('serverApp.ts','utf8');
    const start=app.indexOf('async function startServer() {');
    const admission=app.indexOf('assertPaperStagingAdmission(process.env)',start);
    const db=app.indexOf('await dbEngine.initialize()',start);
    const routes=app.indexOf("app.use('/api/upstox',(req,res,next)=>",start);
    const login=app.indexOf("app.get('/api/upstox/login'",start);
    const manual=app.indexOf("app.post('/api/upstox/set-token'",start);
    const autos=app.indexOf("app.post('/api/upstox/auto-login'",start);
    assert.ok(start>=0&&admission>start&&admission<db);
    assert.match(app,/paperStaging=process\.env\.NODE_ENV==='production'\|\|/);
    assert.match(app,/process\.env\.PAPER_STAGING_MODE==='1'/);
    assert.ok(routes>db&&routes<login&&routes<manual&&routes<autos);
    const paperGuard=app.indexOf("app.use('/api/paper-trading',requireAuth as any)",start);
    const paperRead=app.indexOf("app.get('/api/paper-trading/portfolio'",start);
    const paperWrite=app.indexOf("app.post('/api/paper-trading/start'",start);
    assert.ok(paperGuard>routes&&paperGuard<paperRead&&paperGuard<paperWrite,
      'paper staging must require auth before guest portfolio reads or writes');
    assert.match(app,/if\(!paperStaging\)\s*\{\s*initializeUpstoxAutoRefreshCron/);
    assert.match(app,/if \(!paperStaging && process\.env\.UPSTOX_ACCESS_TOKEN\)/);
    assert.ok(app.includes("app.get('/api/release/status'"));
  });
  it('runtime ignores tracked SQLite/WAL files and builds server.cjs with npm start',()=>{
    const tracked=execFileSync('git',['ls-files'],{encoding:'utf8'})
      .split('\n').filter(x=>/\.(?:sqlite|db)(?:-(?:wal|shm|journal))?$/.test(x));
    assert.deepEqual(tracked,[],'Do not ship or merge runtime account DB blobs in RC branch');
    const gitignore=readFileSync('.gitignore','utf8');
    assert.match(gitignore,/\*\.sqlite/);
    assert.match(gitignore,/\*\.db/);
    const pkg=JSON.parse(readFileSync('package.json','utf8'));
    assert.equal(pkg.scripts.start,'node dist/server.cjs');
    assert.equal(pkg.scripts['smoke:paper-staging'],
      'node scripts/verify_paper_staging_rc.mjs');
  });
  it('paper RC does NOT override NRML release or mislabel legacy MIS as released',()=>{
    assert.equal(assessEmaLiveProductGate('NRML').allowed,false);
    assert.equal(assessEmaBrokerExitProductGate('NRML').allowed,false);
    assert.equal(isMisForcedSquareOffEligible({productType:'NRML',
      status:'OPEN'}),false);
    assert.equal(checkPaperStagingAdmission(safe).brokerWritesAuthorized,false);
  });
});
