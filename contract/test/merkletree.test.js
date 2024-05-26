// @ts-check
// eslint-disable-next-line import/order
import { test as anyTest } from './prepare-test-env-ava.js';
import { MerkleTree } from 'merkletreejs';
import { sha256 } from '@noble/hashes/sha256';
import { accounts, pubkeys, testTree } from './data/agoric.accounts.js';
import { compose } from '../src/airdrop/helpers/objectTools.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

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

const toHexidecimal = value => value.toString('hex');
const getRoot = x => x.getRoot();
const getProof = x => value => x.getProof(value);

const getRootHash = compose(toHexidecimal, getRoot);

const merkleHashAssertions = t => hash => {
  t.deepEqual(
    hash.length === 66,
    true,
    'merkletree should always create a fixed-length root hash',
  );
};

test('merkletree operations', t => {
  const getLength = ({ length }) => length;
  const getProofFromTree = getProof(testTree);

  const treeSize = getLength(testTree.leaves);
  t.deepEqual(
    treeSize === accounts.length,
    true,
    'merkletree constructor given a list of values should create a tree with the correct number of leaves.',
  );

  const root = testTree.getHexRoot();

  const treeRootHash = getRootHash(testTree);
  t.deepEqual(
    root.slice(2),
    treeRootHash,
    'tree.getHexRoot() should contain a substring equal to tree.getRoot().toString("hex")',
  );

  const proofs = pubkeys.map(getProofFromTree);

  const checkProof = (merkleTree, rootHash) => (proof, leafValue) => {
    console.log('CHECKING PROOF ::::::', {
      leafValue,
      testTree: { testTree, leave: testTree.hashFn(leafValue) },
      hashedLeaf: makeSha256Hash(leafValue),
    });
    return merkleTree.verify(proof, leafValue, rootHash);
  };
  const verifyProofAgainstTree = checkProof(
    testTree,
    testTree.getRoot().toString('hex'),
  );

  // accounts.map(getPubkey);

  const handleIndexBasedProofVerification = index =>
    verifyProofAgainstTree(proofs[index], pubkeys[index]);

  t.deepEqual(handleIndexBasedProofVerification(0), true);

  for (const i in accounts) {
    // for...in to get index of every item in accounts array
    t.deepEqual(
      handleIndexBasedProofVerification(i),
      true,
      `proof verification fn for account ${pubkeys[i]} should work properly.`,
    );
  }
});
