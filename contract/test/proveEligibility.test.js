/* eslint-disable import/order */
// @ts-check
import { test as anyTest } from './airdropData/prepare-test-env-ava.js';
import { createRequire } from 'module';
import { E, Far } from '@endo/far';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { TimeMath } from '@agoric/time';
// ??? import { Id, IO, Task } from '../src/airdrop/adts/monads.js';
import { bootAndInstallBundles } from '../tools/boot-tools.js';
import { makeBundleCacheContext } from '../tools/bundle-tools.js';

/**
 * 1. add getTree and verifyProof method to TreeRemotable
 * 2. verify validity proof against merkle root
 */
import '@agoric/store/exported.js';
import {
  accounts,
  preparedAccounts,
  TEST_TREE_DATA,
} from './data/agoric.accounts.js';
import { TimeIntervals } from '../src/airdrop/helpers/time.js';
import { setup } from './setupBasicMints.js';
import { Id } from '../src/airdrop/adts/monads.js';
import { compose } from '../src/airdrop/helpers/objectTools.js';
import { makeMarshal } from '@endo/marshal';
import { createClaimSuccessMsg } from '../src/airdrop/helpers/messages.js';
import { makeTreeRemotable } from './data/tree.utils.js';

const head = ([x]) => x;
const parseAccountInfo = ({ pubkey, address }) => ({
  pubkey: pubkey.key,
  address,
});

const defaultClaimaint = {
  // @ts-ignore
  ...parseAccountInfo(head(accounts)),
  proof: head(TEST_TREE_DATA.proofs),
};

const simulateClaim = async (
  t,
  invitation,
  expectedPayout,
  claimAccountDetails = defaultClaimaint,
) => {
  const marshaller = makeMarshal();
  console.log('inside simulateClaim');
  // claimAccountDetails object holds values that are passed into the offer as offerArgs
  // proof should be used to verify proof against tree (e.g. tree.verify(proof, leafValue, hash) where tree is the merkletree, leafValue is pubkey value, and root hash of tree)
  // address is used in conjunction with namesByAddress/namesByAddressAdmin to send tokens to claimain (see https://docs.agoric.com/guides/integration/name-services.html#namesbyaddress-namesbyaddressadmin-and-depositfacet-per-account-namespace)
  const { pubkey, address, proof } = claimAccountDetails;

  const { zoe, memeIssuer: tokenIssuer } = await t.context;

  const offerArgsObject = harden({
    ...claimAccountDetails,
    proof: Far('proof', {
      getProof() {
        return claimAccountDetails.proof;
      },
    }),
  });
  /** @type {UserSeat} */
  const claimSeat = await E(zoe).offer(
    invitation,
    undefined,
    undefined,
    marshaller.toCapData(offerArgsObject),
  );

  t.log('------------ testing claim capabilities -------');
  t.log('-----------------------------------------');
  t.log('AirdropResult', claimSeat);
  t.log('-----------------------------------------');
  t.log('expectedPayout value', expectedPayout);
  t.log('-----------------------------------------');

  //
  t.deepEqual(
    await E(claimSeat).getOfferResult(),
    // Need
    createClaimSuccessMsg(expectedPayout),
  );

  const claimPayment = await E(claimSeat).getPayout('Payment');

  t.deepEqual(await E(tokenIssuer).isLive(claimPayment), true); // any particular reason for isLive check? getAmountOf will do that.
  t.deepEqual(await E(tokenIssuer).getAmountOf(claimPayment), expectedPayout);
};
const filename = new URL(import.meta.url).pathname;

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

test.before(async t => (t.context = await makeBundleCacheContext(t)));

const ONE_THOUSAND = 1000n;
const nodeRequire = createRequire(import.meta.url);
const { memeMint, memeIssuer, memes, moola, zoe } = setup();

// const contractName = 'launchIt';
const airdropName = 'airdropCampaign';
const bundleRoots = {
  // [contractName]: nodeRequire.resolve('../src/launchIt.js'),
  [airdropName]: nodeRequire.resolve('../src/airdrop.contract.js'),
  // contractStarter: nodeRequire.resolve('../src/contractStarter.js'),
};
const createToknSupplyRanges =
  (amountMaker = moola) =>
  (floorSupply, maxCirculatingSupply) => ({
    initialSupply: amountMaker(floorSupply),
    bonusSupply: AmountMath.subtract(
      amountMaker(maxCirculatingSupply),
      amountMaker(floorSupply),
    ),
  });
const makeMemesSupply = createToknSupplyRanges(memes);
test('airdropRanges object', async t => {
  // There are a number of ways to calculate this (most of which are likely better)
  // Arriving at 10_500_00k....
  // - floorSupply: 10 Million
  // - bonus mints: vehice for minor increase in circulating supply of token. 1% per epoch, or 100k per epoch.
  // 10_500_000k = 5 * (1/100 * 10_0000) 1% of floor supply
  //
  const memesSupply = makeMemesSupply(10_000_000n, 10_500_000n);
  t.deepEqual(
    memesSupply.initialSupply,
    memes(10_000_000n),
    'should contain information about the minimum circulating supply',
  );
  t.deepEqual(
    memesSupply.bonusSupply,
    memes(500_000n),
    'should contain information about the maximum ciruclating supply',
  );

  const combinedSupply = AmountMath.add(
    memesSupply.initialSupply,
    memesSupply.bonusSupply,
  );
  t.deepEqual(
    combinedSupply,
    memes(10_500_000n),
    'should expose inputs for calculating the maximum circulating supply.',
  );
});

export const makeRelTimeMaker = brand => nat =>
  harden({ timerBrand: brand, relValue: nat });

const PurseHolder = purse => ({
  purse,
  deposit(payment) {
    console.log('inside deposit', this.purse);
    this.purse.deposit(payment);
    return PurseHolder(this.purse);
  },
  checkBalance() {
    console.log('inside checkBalanace', this.purse);
    return this.purse.getCurrentAmount();
  },
  makePayment(amount) {
    return this.purse.withdraw(amount);
  },
});

const mintToPurse = mint => amount => purse =>
  purse.deposit(mint.mintPayment(amount));
const mintMemesToPurse = mintToPurse(memeMint);
const makeTestContext = async t => {
  const bootKit = await bootAndInstallBundles(t, bundleRoots);
  console.log({ bootKit });
  const { powers, bundles } = bootKit;

  const timer = await powers.consume.chainTimerService;

  const timerBrand = await E(timer).getTimerBrand();

  const relTimeMaker = makeRelTimeMaker(timerBrand);

  const TOTAL_SUPPLY = memes(10_000_000n);

  const MemePurse = PurseHolder(memeIssuer.makeEmptyPurse());

  // t.deepEqual(
  //   await MemePurse.map(x => x.deposit(memeMint.mintPayment(memes(10_000n)))),
  //   MemePurse.inspect(),
  // );

  mintMemesToPurse(memes(500_000n))(MemePurse);
  t.deepEqual(MemePurse.checkBalance(), memes(500_000n));

  const AIRDROP_PAYMENT = memeMint.mintPayment(TOTAL_SUPPLY);
  const AIRDROP_PURSE = memeIssuer.makeEmptyPurse();
  AIRDROP_PURSE.deposit(AIRDROP_PAYMENT);

  const startTime = relTimeMaker(TimeIntervals.SECONDS.ONE_DAY * 7n);
  t.deepEqual(TimeMath.relValue(startTime), 86400000n * 7n);
  const isFrozen = x => Object.isFrozen(x);

  t.deepEqual(
    isFrozen(AIRDROP_PURSE),
    true,
    'Purse being passed into contract via privateArgs must be frozen.',
  );
  t.deepEqual(
    isFrozen(timer),
    true,
    'Timer being passed into contract via privateArgs must be frozen.',
  );

  const invitationIssuer = await E(zoe).getInvitationIssuer();
  const invitationBrand = await E(invitationIssuer).getBrand();

  const { airdropCampaign } = bundles;

  const airdropInstallation = await E(zoe).install(airdropCampaign);

  const defaultCustomTerms = {
    hash: TEST_TREE_DATA.rootHash,
    basePayoutQuantity: memes(ONE_THOUSAND),
    startTime: relTimeMaker(TimeIntervals.SECONDS.ONE_DAY * 7n),
    endTime: relTimeMaker(ONE_THOUSAND * ONE_THOUSAND),
  };
  const defaultPrivateArgs = {
    purce: AIRDROP_PURSE,
    timer,
  };

  const makeStartOpts = ({
    customTerms = defaultCustomTerms,
    privateArgs = defaultPrivateArgs,
  }) => ({ ...harden(customTerms), ...harden(privateArgs) });

  const testTreeRemotable = makeTreeRemotable(
    TEST_TREE_DATA.tree,
    TEST_TREE_DATA.rootHash,
  );
  const instance = await E(zoe).startInstance(
    airdropInstallation,
    harden({ Token: memeIssuer }),
    harden({
      TreeRemotable: testTreeRemotable,
      hash: TEST_TREE_DATA.rootHash,
      basePayoutQuantity: memes(ONE_THOUSAND),
      startTime: relTimeMaker(TimeIntervals.SECONDS.ONE_DAY * 7n),
      endTime: relTimeMaker(ONE_THOUSAND * ONE_THOUSAND),
    }),
    harden({
      purse: AIRDROP_PURSE,
      bonusPurse: MemePurse.purse,
      timer,
    }),
    'c1-ownable-Airdrop',
  );

  t.context = {
    ...t.context,
    invitationIssuer,
    invitationBrand,
    memeIssuer,
    zoe,
    timer,
    primaryPurse: AIRDROP_PURSE,
    testTreeRemotable,
    makeStartOpts,
    airdropInstallation,
    instance,
    publicFacet: instance.publicFacet,
  };
};

test('airdrop purses', async t => {
  const { initialSupply, bonusSupply } = makeMemesSupply(
    1_000_000n,
    1_500_000n,
  );

  const [primaryPurse, secondaryPurse] = [
    memeIssuer.makeEmptyPurse().deposit(memeMint.mintPayment(initialSupply)),
    memeIssuer.makeEmptyPurse().deposit(memeMint.mintPayment(bonusSupply)),
  ]
    .map(PurseHolder)
    .map(Id);

  const getProp = prop => obj => obj[prop];
  const getValue = getProp('value');
  const getPurse = getProp('purse');

  const getBalance = compose(getPurse, getValue);

  t.deepEqual([primaryPurse, secondaryPurse].map(getBalance), [
    initialSupply,
    bonusSupply,
  ]);
});

const handleValidateProof =
  (tree = TEST_TREE_DATA.tree, hash = TEST_TREE_DATA.rootHash) =>
  (proof = preparedAccounts[0].proof, nodeValue = preparedAccounts[0].pubkey) =>
    tree.verify(proof, nodeValue, hash);

test('merkle tree verification', t => {
  const verifyAgainstTestTree = handleValidateProof();

  t.deepEqual(
    verifyAgainstTestTree(),
    true,
    'verifyAgainstTestTree function given default arguments, should return true',
  );

  t.deepEqual(
    verifyAgainstTestTree(
      preparedAccounts[1].proof,
      preparedAccounts[1].pubkey,
    ),
    true,
    'handleValidateProof function given a proof and its corresponding account should return true',
  );

  t.deepEqual(
    verifyAgainstTestTree(preparedAccounts[0].proof, 'notarealpubkey'),
    false,
    'handleValidateProof function given proof and a pubkey value that does not exist in the tree should return false',
  );
});

test('airdrop claim :: eligible participant', async t => {
  await makeTestContext(t);

  const { publicFacet, timer, testTreeRemotable } = await t.context;

  const validateFn = await E(testTreeRemotable).getVerificationFn();
  const [first, second, third, ...rest] = preparedAccounts;

  await preparedAccounts.map(({ proof }, index) =>
    proof.map(({ data }) =>
      t.deepEqual(
        Buffer.isBuffer(data),
        true,
        `proof generated for account ${index} should be a Buffer.`,
      ),
    ),
  );

  t.deepEqual(
    validateFn(first.proof, first.pubkey),
    true,
    'TreeRemotable should expose function that properly verifies a proof against a Merkle tree',
  );
  await E(timer).advanceTo(2719838800n);

  await simulateClaim(
    t,
    await E(publicFacet).makeClaimInvitation(),
    memes(1000n),
    first,
  );

  await simulateClaim(
    t,
    await E(publicFacet).makeClaimInvitation(),
    memes(1000n),
    second,
  );
  await simulateClaim(
    t,
    await E(publicFacet).makeClaimInvitation(),
    memes(1000n),
    third,
  );
});

test.todo('compare cliam amounts for different tiers');

test.todo('claim attempts after the last epoch has ended');

test.todo('bonus mints');

test.todo('token burning mechanisms');
