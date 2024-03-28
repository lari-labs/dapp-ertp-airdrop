import { gzip } from 'zlib';
import { promisify } from 'util';
import { Buffer } from 'buffer';

/**
 * @typedef {import('fs').promises['readFile']} PromisifiedFSReadFile
 */

/** @param {PromisifiedFSReadFile} readFile */
export const makeCompressFile = readFile => async filePath => {
  const fileContents = await readFile(filePath, 'utf8');
  const buffer = Buffer.from(fileContents, 'utf-8');
  const compressed = await promisify(gzip)(buffer);
  return compressed;
};

const defaultDistributionArray = [
  { windowLength: 259_200n, tokenQuantity: 10_000n },
  { windowLength: 864_000n, tokenQuantity: 6_000n },
  { windowLength: 864_000n, tokenQuantity: 3_000n },
  { windowLength: 864_000n, tokenQuantity: 1_500n },
  { windowLength: 864_000n, tokenQuantity: 750n },
];

export const createDistributionConfig = (array = defaultDistributionArray) =>
  array.map(({ windowLength, tokenQuantity }, index) =>
    harden({
      windowLength,
      tokenQuantity,
      index,
      inDays: windowLength / 86_400n,
    }),
  );

harden(createDistributionConfig);
