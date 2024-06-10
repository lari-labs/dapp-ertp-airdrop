import { MerkleTree } from 'merkletreejs';
import { sha256 } from '@noble/hashes/sha256';
import { compose } from '../../src/airdrop/helpers/objectTools.js';

const Either = (() => {
  const Right = x => ({
    isLeft: false,
    chain: f => f(x),
    ap: other => other.map(x),
    alt: other => Right(x),
    extend: f => f(Right(x)),
    concat: other =>
      other.fold(
        x => other,
        y => Right(x.concat(y)),
      ),
    traverse: (of, f) => f(x).map(Right),
    map: f => Right(f(x)),
    fold: (_, g) => g(x),
    inspect: () => `Right(${x})`,
  });

  const Left = x => ({
    isLeft: true,
    chain: _ => Left(x),
    ap: _ => Left(x),
    extend: _ => Left(x),
    alt: other => other,
    concat: _ => Left(x),
    traverse: (of, _) => of(Left(x)),
    map: _ => Left(x),
    fold: (f, _) => f(x),
    inspect: () => `Left(${x})`,
  });

  const of = Right;
  const tryCatch = f => {
    try {
      return Right(f());
    } catch (e) {
      return Left(e);
    }
  };

  const fromUndefined = x => (x === undefined ? Right(x) : Left(x));

  const fromNullable = x => (x != null ? Right(x) : Left(x));

  return { Right, Left, of, tryCatch, fromNullable, fromUndefined };
})();

const hashInput = algo => data => algo(data);
const makeSha256Hash = hashInput(sha256);
const getProp = prop => object => object[prop];
const getPubkey = getProp('pubkey');
const getKey = getProp('key');

const toHexString = value => value.toString('hex');
const getRoot = x => x.getRoot();
const getProof = tree => value => tree.getProof(value);

const getRootHash = compose(toHexString, getRoot);

const accounts = [
  {
    tier: 1,
    name: 'tg-oracle',
    type: 'local',
    address: 'agoric1we6knu9ukr8szlrmd3229jlmengng9j68zd355',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'AiFAg1ZqtHo7WoheNUAJEScqSLuQCiv7umfToaNjaEv1',
    },
  },
  {
    tier: 2,
    name: 'tg-test',
    type: 'local',
    address: 'agoric1d3pmtdzem9a8fqe8vkfswdwnuy9hcwjmhlh4zz',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'A5A20phWctpT88lD+jbXxdA06llfvXd0aq3BnkRozDg8',
    },
  },
  {
    tier: 0,
    name: 'tgrex',
    type: 'local',
    address: 'agoric1zqhk63e5maeqjv4rgcl7lk2gdghqq5w60hhhdm',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'AybVHbbXgexk5dz+RWfch+2a1rCS5IYl5vSJF9l/qE48',
    },
  },
  {
    tier: 3,
    name: 'u1',
    type: 'local',
    address: 'agoric1p2aqakv3ulz4qfy2nut86j9gx0dx0yw09h96md',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'Anc5HuzkD5coFkPWAgC87lGbfC+SdzCPwRpOajFrGYSZ',
    },
  },
  {
    tier: 3,
    name: 'user1',
    type: 'local',
    address: 'agoric1xe269y3fhye8nrlduf826wgn499y6wmnv32tw5',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'A4owcrbL34M4lCDua/zhpampsPRJHu5zKp9gc/u8c1YH',
    },
  },
  {
    tier: 4,
    name: 'user2local',
    type: 'local',
    address: 'agoric1ahsjklvps67a0y7wj0hqs0ekp55hxayppdw5az',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'Anqep1Y/ZxRDMbiZ3ng03JmX3qyTl77x4OnXylI7w46b',
    },
  },
  {
    tier: 0,
    name: 'victor-da-best',
    type: 'local',
    address: 'agoric1vzqqm5dfdhlxh6n3pgkyp5z5thljklq3l02kug',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'A+Si8+03Q85NQUAsvhW999q8Xw0fON08k3i6iZXg3S7/',
    },
  },
];

// Importing Either from the provided codebase
const { Right, Left } = Either;

// Helper function to safely concatenate properties within Either monad
const concatenateProps = obj =>
  obj && obj.pubkey && obj.tier
    ? Right(`${obj.pubkey.key}${obj.tier}`)
    : Left('Invalid object structure');

const toString = x => String(x);

/**
 * Represents cosmos account information.
 * @typedef {object} EligibleAccountObject
 * @property {string} prefix - The prefix.
 * @property {object} pubkey - The public key.
 * @property {string} pubkey.type - The type of the public key.
 * @property {string} pubkey.value - The value of the public key.
 * @property {number} tier - Number of tier an account falls into.
 */

/** @param {EligibleAccountObject} x */
const formatTier = x => ({ ...x, tier: toString(x.tier) });

// Processing array
const processArray = array =>
  array.map(formatTier).map(obj =>
    concatenateProps(obj).fold(
      e => e,
      r => r,
    ),
  );

const pubkeys = processArray(accounts);
const trace = label => value => {
  console.log(label, '::::', value);
  return value;
};

const getLast = array => array[array.length - 1];
const stringToArray = string => [...string];

const getLastChar = compose(getLast, stringToArray);

// pubkeys
const tree1 = new MerkleTree(
  pubkeys,
  makeSha256Hash,
  // {duplicateOdd: true },
);
const TEST_TREE_DATA = {
  tree: tree1,
  rootHash: getRootHash(tree1),
  leaves: pubkeys,
  proofs: pubkeys.map(getProof(tree1)),
};
const { tree: testTree, proofs } = TEST_TREE_DATA;
const withProof = (o, i) => ({ ...o, proof: proofs[i], pubkey: pubkeys[i] });
const preparedAccounts = accounts.map(withProof).map(formatTier);
export {
  accounts,
  pubkeys,
  preparedAccounts,
  testTree,
  TEST_TREE_DATA,
  getLastChar,
};
