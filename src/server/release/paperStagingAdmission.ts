/**
 * Paper/staging RC startup admission. Not a production trading release.
 *
 * An accidental .env, broker secret injection or provider toggle MUST
 * reject the process before opening a database or accepting HTTP.
 * The rule is only active when PAPER_STAGING_MODE=1; main/live behavior
 * remains unchanged until separately reviewed and released.
 *
 * No token values, passwords, account IDs or secret lengths are returned.
 */
import path from 'node:path';

const forbiddenBrokerEnv=[
  'UPSTOX_ACCESS_TOKEN','UPSTOX_TOKEN',
  'UPSTOX_API_KEY','UPSTOX_API_SECRET',
  'UPSTOX_PIN','UPSTOX_TOTP_SECRET',
  'UPSTOX_MOBILE_NO','UPSTOX_CLIENT_ID',
  'UPSTOX_USER_ID','UPSTOX_TOTP_KEY'
] as const;

export type PaperStagingAdmission={
  admitted:boolean;
  mode:'PAPER_STAGING_RC'|'NOT_PAPER_STAGING';
  reason:
    'PAPER_STAGING_SETTINGS_OK'|
    'PAPER_STAGING_NOT_REQUESTED'|
    'PAPER_STAGING_NOT_PRODUCTION_RUNTIME'|
    'PAPER_STAGING_PRACTICE_PROVIDER_REQUIRED'|
    'PAPER_STAGING_BROKER_CREDENTIALS_PRESENT'|
    'PAPER_STAGING_JWT_SIGNING_SECRET_REQUIRED'|
    'PAPER_STAGING_DATA_VOLUME_DIRECTORY_REQUIRED';
  brokerWritesAuthorized:false;
  liveNrmlBuySellAuthorized:false;
  legacyMisBrokerOrderAuthorized:false;
  externalBrokerMarketDataConnected:false;
  exchangeFeedLicensedOrAuthenticated:false;
  paperStrategyProfitabilityProven:false;
};
function info(
  admitted:boolean,mode:PaperStagingAdmission['mode'],
  reason:PaperStagingAdmission['reason']
):PaperStagingAdmission{
  return {
    admitted,mode,reason,brokerWritesAuthorized:false,
    liveNrmlBuySellAuthorized:false,legacyMisBrokerOrderAuthorized:false,
    externalBrokerMarketDataConnected:false,
    exchangeFeedLicensedOrAuthenticated:false,
    paperStrategyProfitabilityProven:false
  };
}

export function checkPaperStagingAdmission(
  env:Readonly<Record<string,string|undefined>>
):PaperStagingAdmission{
  if(env.PAPER_STAGING_MODE!=='1')
    return info(false,'NOT_PAPER_STAGING','PAPER_STAGING_NOT_REQUESTED');
  if(env.NODE_ENV!=='production')
    return info(false,'PAPER_STAGING_RC',
      'PAPER_STAGING_NOT_PRODUCTION_RUNTIME');
  if(env.DATA_PROVIDER?.trim().toLowerCase()!=='practice')
    return info(false,'PAPER_STAGING_RC',
      'PAPER_STAGING_PRACTICE_PROVIDER_REQUIRED');
  if(forbiddenBrokerEnv.some(key=>Boolean(env[key]?.trim())))
    return info(false,'PAPER_STAGING_RC',
      'PAPER_STAGING_BROKER_CREDENTIALS_PRESENT');
  if(typeof env.JWT_SECRET!=='string'||env.JWT_SECRET.length<32)
    return info(false,'PAPER_STAGING_RC',
      'PAPER_STAGING_JWT_SIGNING_SECRET_REQUIRED');
  // Staging runtime data must reside under an explicitly mounted absolute
  // directory, not in the source tree, deploy bundle or temp folder.
  // This is a path contract, NOT proof the directory is a durable volume.
  const dbDir=env.PAPER_STAGING_DB_DIR;
  if(typeof dbDir!=='string'||!path.isAbsolute(dbDir)||
     path.normalize(dbDir)==='/'||dbDir.trim()!==dbDir||
     dbDir.includes('\\0')||dbDir.includes('..')||
     dbDir.length>1024)
    return info(false,'PAPER_STAGING_RC',
      'PAPER_STAGING_DATA_VOLUME_DIRECTORY_REQUIRED');
  return info(true,'PAPER_STAGING_RC','PAPER_STAGING_SETTINGS_OK');
}
/** Startup guard: never disclose which credential or its value. */
export function assertPaperStagingAdmission(
  env:Readonly<Record<string,string|undefined>>
):PaperStagingAdmission{
  const result=checkPaperStagingAdmission(env);
  if(!result.admitted)
    throw Error('PAPER_STAGING_STARTUP_DENIED: '+result.reason);
  return result;
}
