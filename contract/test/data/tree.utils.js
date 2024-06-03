import { Far } from '@endo/far';

const makeTreeRemotable = (tree, rootHash) =>
  Far('Merkle Tree', {
    getTree: () => tree,
    getRootHash: () => rootHash,
    getVerificationFn() {
      return (proof, nodeValue) => tree.verify(proof, nodeValue, rootHash);
    },
  });

export { makeTreeRemotable };
