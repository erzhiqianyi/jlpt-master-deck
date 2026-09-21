import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyFirebaseIdentity } from './firebase-auth.mjs';

test('Firebase identity checks signature, project, expiry and authentication timestamps', async () => {
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const other=await generateKeyPair('RS256');
  const now=Math.floor(Date.now()/1000);
  const sign=(claims={},key=privateKey)=>new SignJWT({sub:'test-uid',iss:'https://securetoken.google.com/jlpt-master-deck',aud:'jlpt-master-deck',iat:now,exp:now+3600,auth_time:now,...claims}).setProtectedHeader({alg:'RS256'}).sign(key);
  assert.equal((await verifyFirebaseIdentity(await sign(),'jlpt-master-deck',publicKey)).sub,'test-uid');
  for (const claims of [{aud:'different-project'},{iss:'https://attacker.example'},{exp:now-1},{exp:undefined},{iat:now+60},{auth_time:now+60},{sub:''}]) {
    await assert.rejects(verifyFirebaseIdentity(await sign(claims),'jlpt-master-deck',publicKey));
  }
  await assert.rejects(verifyFirebaseIdentity(await sign({},other.privateKey),'jlpt-master-deck',publicKey));
});
