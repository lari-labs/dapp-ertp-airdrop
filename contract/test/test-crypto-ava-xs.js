/**
 * @file XS crypto test
 * run with: yarn ava-xs test/test-crypto-ava-xs.js
 */
// @ts-check
import test from 'ava';
import { pubkeyToAddress } from '../src/check-sig.js';

test('pubkeyToAddress matches cosmjs tests', t => {
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
  for (const { prefix, pubkey, expected } of cases) {
    const actual = pubkeyToAddress(pubkey.value, prefix);
    t.is(actual, expected);
  }
});
