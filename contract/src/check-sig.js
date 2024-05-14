// @ts-check
import { decodeBase64 } from '@endo/base64';
import { bech32 } from 'bech32';
import { sha256 } from '@noble/hashes/sha256';

import { ripemd160 } from '@noble/hashes/ripemd160';

// https://github.com/cosmos/cosmjs/blob/main/packages/encoding/src/bech32.ts#L3C1-L6C2
export function toBech32(prefix, data, limit) {
  const address = bech32.encode(prefix, bech32.toWords(data), limit);
  return address;
}

/**
 * @param {string} pubkey in base64
 * @param {string} prefix
 */
export const pubkeyToAddress = (pubkey, prefix) => {
  const pubkeyData = decodeBase64(pubkey);
  assert.equal(pubkeyData.byteLength, 33);
  //   console.log('pubkey', Buffer.from(pubkeyData));
  const h1 = sha256.create().update(pubkeyData).digest();
  const h2 = ripemd160.create().update(h1).digest();
  return toBech32(prefix, h2);
};
