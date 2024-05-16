// @ts-check
import '@endo/init/debug.js';
import test from 'ava';
import { decodeBase64 } from '@endo/base64';
import { Secp256k1Signature } from '@cosmjs/crypto';
import { checkSig } from '../src/check-sig.js';

const case0 = /** @type {const} */ ({
  sig: {
    pub_key: {
      type: 'tendermint/PubKeySecp256k1',
      value: 'AgX1pQy65LmFCazXlahDxmgoDXxaiVFRwOnxj5Wo8ZCo',
    },
    signature:
      'dkLyG9X1GvJ8rq7zSSOpEWiyLsjnOcsGWbLJUs0R35BmxKfUHGQLIjBLMuFZ1uDPYMk6SkA16ftmsfnFZA3xzA==',
  },
  signer: 'agoric1ldmtatp24qlllgxmrsjzcpe20fvlkp448zcuce',
});

test('can construct cosmjs sig from keplr sig', t => {
  const actual = decodeBase64(case0.sig.signature);
  t.is(actual.length, 64);

  const csig = Secp256k1Signature.fromFixedLength(actual);
  t.true(csig.r() instanceof Uint8Array);
  t.true(csig.s() instanceof Uint8Array);
});

test('checkSig', async t => {
  await t.notThrowsAsync(checkSig(case0.sig, case0.signer));
});
