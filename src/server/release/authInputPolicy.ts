/** Shared authentication input boundaries. Never coerce untrusted objects to credentials. */
export const validEmailInput=(v:unknown):v is string=>typeof v==='string'&&v.length<=254&&v.trim().length>0;
export const validLoginPassword=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&Buffer.byteLength(v,'utf8')<=72;
export const validNewPassword=(v:unknown):v is string=>validLoginPassword(v)&&v.length>=8;
export const validTotp=(v:unknown):v is string=>typeof v==='string'&&/^\d{6}$/.test(v.trim());
export const validMfaSecret=(v:unknown):v is string=>typeof v==='string'&&/^[A-Z2-7]{16,128}$/.test(v.trim());
export function mfaState(enabled:unknown,secret:unknown):'REQUIRED'|'DISABLED'|'INVALID'{
  if(enabled===0)return 'DISABLED';
  if(enabled===1&&validMfaSecret(secret))return 'REQUIRED';
  return 'INVALID';
}
