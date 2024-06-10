import { Far } from '@endo/far';

/**
 * @name makeTreeRemotable
 * @description Factory function that
 *  *
 * unfortunately, merkletree.js produces an object encapsulated with an API that is far more than a simple tree structure.
 * we're faced with the decision to continue with merkletree.js, and take a somewhat graceful approa
 *
 * Ideas
 *  - construct tree by-hand (already have an implementation ready)
 *  -
 */
const makeTreeRemotable = (tree, rootHash) =>
  Far('Merkle Tree', {
    getTree: () => tree,
    getRootHash: () => rootHash,
    getVerificationFn() {
      return (proof, nodeValue) => tree.verify(proof, nodeValue, rootHash);
    },
  });

const generateInt = x => () => Math.floor(Math.random() * (x + 1));

export { generateInt, makeTreeRemotable };
