/* eslint-disable import/order, import/no-extraneous-dependencies */
// @ts-check
import { test as anyTest } from './airdropData/prepare-test-env-ava.js';
// eslint-disable import/no-extraneous-dependencies
import * as secp from '@noble/secp256k1';
// 2. node.js 18 and older, requires polyfilling globalThis.crypto
import { webcrypto } from 'node:crypto';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
// @ts-ignore
if (!globalThis.crypto) globalThis.crypto = webcrypto;
secp.etc.hmacSha256Sync = (k, ...m) =>
  hmac(sha256, k, secp.etc.concatBytes(...m));
secp.etc.hmacSha256Async = (k, ...m) =>
  Promise.resolve(secp.etc.hmacSha256Sync(k, ...m));

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

const { verify } = secp;

const runTestHashing = async t => {
  // keys, messages & other inputs can be Uint8Arrays or hex strings
  // Uint8Array.from([0xde, 0xad, 0xbe, 0xef]) === 'deadbeef'
  const privKey = secp.utils.randomPrivateKey(); // Secure random private key
  // sha256 of 'hello world'
  const msgHash =
    'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
  const pubKey = secp.getPublicKey(privKey);
  const signature = await secp.signAsync(msgHash, privKey); // Sync methods below
  t.deepEqual(verify(signature, msgHash, pubKey), true);

  const alicesPubkey = secp.getPublicKey(secp.utils.randomPrivateKey());
  secp.getSharedSecret(privKey, alicesPubkey); // Elliptic curve diffie-hellman
  signature.recoverPublicKey(msgHash); // Public key recovery
};

test('sepk256k1 import', async t => {
  await runTestHashing(t);
});

test.todo(
  'tests cryptography-related operations required for full functionality',
);
