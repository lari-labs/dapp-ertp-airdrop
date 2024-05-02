// @ts-check
import { fromBase64, toBech32 } from '@cosmjs/encoding';
import { sha256 } from '@noble/hashes/sha256';

import { ripemd160 } from '@noble/hashes/ripemd160';

/**
 * @param {string} pubkey in base64
 * @param {string} prefix
 */
export const pubkeyToAddress = (pubkey, prefix) => {
  const pubkeyData = fromBase64(pubkey);
  assert.equal(pubkeyData.byteLength, 33);
  //   console.log('pubkey', Buffer.from(pubkeyData));
  const h1 = sha256.create().update(pubkeyData).digest();
  const h2 = ripemd160.create().update(h1).digest();
  return toBech32(prefix, h2);
};
