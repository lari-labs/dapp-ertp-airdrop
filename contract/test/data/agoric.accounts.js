import { MerkleTree } from 'merkletreejs';
import { sha256 } from '@noble/hashes/sha256';
import { compose } from '../../src/airdrop/helpers/objectTools.js';

const hashInput = algo => data => algo(data);
const makeSha256Hash = hashInput(sha256);
const getProp = prop => object => object[prop];
const getPubkey = getProp('pubkey');
const getKey = getProp('key');
const withTier = tierFn => o => ({
  ...o,
  tier: tierFn(),
});

const generateInt = x => () => Math.floor(Math.random() * (x + 1));
const mapper = fn => array => array.map(fn);

const mapWithTier = mapper(withTier(generateInt));

const getPubkeyValue = compose(getKey, getPubkey);

const toHexString = value => value.toString('hex');
const getRoot = x => x.getRoot();
const getProof = tree => value => tree.getProof(value);

const getRootHash = compose(toHexString, getRoot);

const accounts = [
  {
    name: 'tg-oracle',
    type: 'local',
    address: 'agoric1we6knu9ukr8szlrmd3229jlmengng9j68zd355',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'AiFAg1ZqtHo7WoheNUAJEScqSLuQCiv7umfToaNjaEv1',
    },
  },
  {
    name: 'tg-test',
    type: 'local',
    address: 'agoric1d3pmtdzem9a8fqe8vkfswdwnuy9hcwjmhlh4zz',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'A5A20phWctpT88lD+jbXxdA06llfvXd0aq3BnkRozDg8',
    },
  },
  {
    name: 'tgrex',
    type: 'local',
    address: 'agoric1zqhk63e5maeqjv4rgcl7lk2gdghqq5w60hhhdm',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'AybVHbbXgexk5dz+RWfch+2a1rCS5IYl5vSJF9l/qE48',
    },
  },
  {
    name: 'u1',
    type: 'local',
    address: 'agoric1p2aqakv3ulz4qfy2nut86j9gx0dx0yw09h96md',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'Anc5HuzkD5coFkPWAgC87lGbfC+SdzCPwRpOajFrGYSZ',
    },
  },
  {
    name: 'user1',
    type: 'local',
    address: 'agoric1xe269y3fhye8nrlduf826wgn499y6wmnv32tw5',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'A4owcrbL34M4lCDua/zhpampsPRJHu5zKp9gc/u8c1YH',
    },
  },
  {
    name: 'user2local',
    type: 'local',
    address: 'agoric1ahsjklvps67a0y7wj0hqs0ekp55hxayppdw5az',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'Anqep1Y/ZxRDMbiZ3ng03JmX3qyTl77x4OnXylI7w46b',
    },
  },
  {
    name: 'victor-da-best',
    type: 'local',
    address: 'agoric1vzqqm5dfdhlxh6n3pgkyp5z5thljklq3l02kug',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'A+Si8+03Q85NQUAsvhW999q8Xw0fON08k3i6iZXg3S7/',
    },
  },
];

const pubkeys = mapWithTier(accounts).map(getPubkeyValue).map(makeSha256Hash);

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
const { tree: testTree } = TEST_TREE_DATA;
export { accounts, pubkeys, testTree, TEST_TREE_DATA };
