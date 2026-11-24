import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validEmailInput,validLoginPassword,validNewPassword,validTotp,validMfaSecret,mfaState} from '../release/authInputPolicy.js';
test('credential inputs cannot coerce objects or silently exceed bcrypt byte limit',()=>{
  for(const v of [null,undefined,{},[],1,true,'']){assert.equal(validEmailInput(v),false);assert.equal(validLoginPassword(v),false);}
  assert.equal(validLoginPassword('a'.repeat(72)),true);
  assert.equal(validLoginPassword('a'.repeat(73)),false);
  assert.equal(validNewPassword('é'.repeat(37)),false);
  assert.equal(validNewPassword('short'),false);
  assert.equal(validNewPassword('fixture-password'),true);
  assert.equal(validEmailInput('a'.repeat(255)),false);
});
test('malformed MFA enabled state cannot fall back to password-only login',()=>{
  const secret='ABCDEFGHIJKLMNOP';
  assert.equal(validMfaSecret(secret),true);
  assert.equal(mfaState(1,secret),'REQUIRED');
  assert.equal(mfaState(1,null),'INVALID');
  assert.equal(mfaState(1,'invalid'),'INVALID');
  assert.equal(mfaState(undefined,secret),'INVALID');
  assert.equal(mfaState('1',secret),'INVALID');
  assert.equal(mfaState(0,null),'DISABLED');
  assert.equal(validTotp('012345'),true);
  for(const v of [123456,'12345','1234567','1e1234',null,{}])assert.equal(validTotp(v),false);
});
