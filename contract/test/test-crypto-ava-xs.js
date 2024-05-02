/**
 * @file XS crypto test
 * run with: yarn ava-xs test/test-crypto-ava-xs.js
 */
// @ts-check
import test from 'ava';
import { pubkeyToAddress } from '../src/check-sig.js';

const cases = [
  {
    prefix: 'cosmos',
    pubkey: {
      type: 'tendermint/PubKeySecp256k1',
      value: 'AtQaCqFnshaZQp6rIkvAPyzThvCvXSDO+9AzbxVErqJP',
    },
    expected: 'cosmos1h806c7khnvmjlywdrkdgk2vrayy2mmvf9rxk2r',
  },
];

test('pubkeyToAddress matches cosmjs tests', t => {
  for (const { prefix, pubkey, expected } of cases) {
    const actual = pubkeyToAddress(pubkey.value, prefix);
    t.is(actual, expected);
  }
});

/** @param {number} logn */
const hashBench = logn => {
  const [{ prefix, pubkey }] = cases;

  const n = 1 << logn;
  for (let i = 0; i < n; i += 1) {
    pubkeyToAddress(pubkey.value, prefix);
  }
  return { size: n };
};

test('pubkeyToAddress performance', t => {
  console.log('pubkeyToAddress performance start');
  for (const n of [8, 12, 14]) {
    hashBench(n);
    console.log(n, 'end', 1 << n);
  }
  t.pass();
});
