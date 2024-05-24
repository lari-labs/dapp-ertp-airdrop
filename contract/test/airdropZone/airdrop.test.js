// @ts-check
/* eslint-disable-next-line import/order */
import { test as anyTest } from '../prepare-test-env-ava.js';
import path from 'path';
import bundleSource from '@endo/bundle-source';
import { E } from '@endo/far';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { AmountMath } from '@agoric/ertp';
import { TimeMath } from '@agoric/time';
import { setup } from '../setupBasicMints.js';
import { eventLoopIteration } from './utils.js';
import { createClaimSuccessMsg } from '../../src/airdrop/helpers/messages.js';
import { createRealisticTimestamp } from '../../tools/timer-tools.js';
import { createTimerService } from '../../tools/timer-tools.js';
import { TimeIntervals } from '../../src/airdrop/helpers/time.js';
import { makeCopyBag, makeCopyMap } from '@endo/patterns';

const defaultCopyBagElements = [
  ['A', 3n],
  ['B', 4n],
  ['C', 2n],
  ['D', 1n],
  ['E', 5n],
  ['F', 1n],
  ['G', 3n],
];
const makeBagForTest = (elements = defaultCopyBagElements) =>
  makeCopyBag(elements);

const uncurry =
  fn =>
  (...args) =>
    args.reduce((fn, arg) => fn(arg), fn);
const getPropCurried = prop => obj => obj[prop];

/** @import { Amount, AssetKind, Brand } from '@agoric/ertp/src/types.js'; */
const filename = new URL(import.meta.url).pathname;
const dirname = path.dirname(filename);

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const root = `${dirname}/../../src/airdrop/prepare.js`;

const defaultIntervals = [2_300n, 3_500n, 5_000n, 11_000n, 150_000n, 175_000n];

const DAY = 60n * 60n * 24n;

/**
 * The default value for the array parameter, if not provided.
 *
 * @type {Array<{windowLength: bigint, tokenQuantity: import('@agoric/ertp/src/types.js').NatValue}>}
 */
const defaultDistributionArray = [
  // 159_200n = 1 day, 20:13:20
  { windowLength: 159_200n, tokenQuantity: 10_000n },
  { windowLength: 10n * DAY, tokenQuantity: 6_000n },
  { windowLength: 10n * DAY, tokenQuantity: 3_000n },
  { windowLength: 10n * DAY, tokenQuantity: 1_500n },
  { windowLength: 10n * DAY, tokenQuantity: 750n },
];

/**
 * @typedef {object} EpochDetails
 * @property {bigint} windowLength Length of epoch in seconds. This value is used by the contract's timerService to schedule a wake up that will fire once all of the seconds in an epoch have elapsed
 * @property {import('@agoric/ertp/src/types.js').NatValue} tokenQuantity The total number of tokens recieved by each user who claims during a particular epoch.
 * @property {bigint} index The index of a particular epoch.
 * @property {number} inDays Length of epoch formatted in total number of days
 */

/** @param {Brand} tokenBrand the brand of tokens being distributed to addresses marked as eligible to claim. */
export const createDistributionConfig =
  tokenBrand =>
  /**
   * Creates an array of epoch details for context.
   *
   * @param {Array<{windowLength: bigint, tokenQuantity: import('@agoric/ertp/src/types.js').NatValue}>} [array]
   * @returns {EpochDetails[]} An array containing the epoch details.
   */
  (array = defaultDistributionArray) =>
    harden(
      array.map(({ windowLength, tokenQuantity }, index) => ({
        windowLength, // TODO: use a timerBrand just like tokenBrand
        tokenQuantity: AmountMath.make(tokenBrand, tokenQuantity),
        index: BigInt(index),
        inDays: Number(windowLength / DAY),
      })),
    );

harden(createDistributionConfig);
const AIRDROP_STATES = {
  INITIALIZED: 'initialized',
  PREPARED: 'prepared',
  OPEN: 'claim-window-open',
  EXPIRED: 'claim-window-expired',
  CLOSED: 'claiming-closed',
  RESTARTING: 'restarting',
};
const { OPEN, EXPIRED, PREPARED, INITIALIZED, RESTARTING } = AIRDROP_STATES;

const startState = INITIALIZED;

/** @type {<T>(x: T[]) => T} */
const head = ([x] = []) => x;

const ONE_THOUSAND = 1_000n; // why? because i think it makes for a more reliable testing environment. I can reference values such as this one when taking some action, such as depositing a payment into a purse, and then reference the same value in a test assertion.

const ONE_HUNDRED_THOUSAND = ONE_THOUSAND * 100n;

const PurseHolder = purse => ({
  deposit: payment => PurseHolder(purse.deposit(payment)),
  checkBalance: () => purse.getCurrentAmount(),
  makePayment: payment => purse.withdraw(payment),
});

const makePurseHolder = issuer => PurseHolder(issuer.makeEmptyPurse());

const depositIntoPurse = (purse, payment) => purse.deposit(payment);
test('PurseHolder', async t => {
  const { memeKit, memes } = setup();

  const MemePurse = PurseHolder(memeKit.issuer.makeEmptyPurse());

  t.deepEqual(MemePurse.checkBalance(), memes(0n));

  await depositIntoPurse(
    MemePurse,
    memeKit.mint.mintPayment(memes(ONE_HUNDRED_THOUSAND)),
  );
  t.deepEqual(MemePurse.checkBalance(), memes(ONE_HUNDRED_THOUSAND));

  const holderAlice = makePurseHolder(memeKit.issuer);

  t.deepEqual(holderAlice.checkBalance(), memes(0n));
});

const chainTimerService = createTimerService();
const makeTestContext = async t => {
  const { memeMint, memeIssuer, memeKit, memes, zoe, vatAdminState } = setup();

  const TOTAL_SUPPLY = memes(10_000_000n);
  const createMemeTokenDistributionSchedule = createDistributionConfig(
    memeKit.brand,
  );
  const AIRDROP_PAYMENT = memeMint.mintPayment(TOTAL_SUPPLY);
  const AIRDROP_PURSE = memeIssuer.makeEmptyPurse();
  AIRDROP_PURSE.deposit(AIRDROP_PAYMENT);

  const timer = chainTimerService;

  const timerBrand = await E(timer).getTimerBrand();

  const makeRelTimeMaker = () => nat => harden({ timerBrand, relValue: nat });
  const relTimeMaker = makeRelTimeMaker(timerBrand);
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

  // Pack the contract.
  const bundle = await bundleSource(root);
  vatAdminState.installBundle('b1-ownable-Airdrop', bundle);
  /** @type { Installation<typeof import('../../src/airdropCampaign.js').start> } */
  const installation = await E(zoe).installBundleID('b1-ownable-Airdrop');
  const schedule = createMemeTokenDistributionSchedule(); // harden at creation, not consumption
  const instance = await E(zoe).startInstance(
    installation,
    harden({ Token: memeIssuer }),
    harden({
      rootHash: makeBagForTest(),
      basePayoutQuantity: memes(ONE_THOUSAND),
      startTime: relTimeMaker(TimeIntervals.SECONDS.ONE_DAY * 7n),
      endTime: relTimeMaker(ONE_THOUSAND * ONE_THOUSAND),
    }),
    harden({
      purse: AIRDROP_PURSE,
      timer,
    }),
    'c1-ownable-Airdrop',
  );

  t.deepEqual(
    [...Object.keys(instance)],
    [
      'creatorFacet',
      'creatorInvitation',
      'instance',
      'publicFacet',
      'adminFacet',
    ],
  );
  // Alice will create and fund a call spread contract, and give the invitations
  // to Bob and Carol. Bob and Carol will promptly schedule collection of funds.
  // The spread will then mature at a low price, and carol will get paid.

  // Setup Alice
  // Setup Bob
  // Setup Carol

  // // underlying is 2 Simoleans, strike range is 30-50 (doubled)
  // const terms = harden({
  //   expiration: 2n,
  //   underlyingAmount: simoleans(2n),
  //   priceAuthority,
  //   strikePrice1: moola(60n),
  //   strikePrice2: moola(100n),
  //   settlementAmount: bucks(300n),
  //   timer: manualTimer,
  // });
  return {
    memeIssuer,
    memeKit,
    memes,
    timeIntervals: defaultIntervals,
    instance,
    creatorFacet: instance.creatorFacet,
    publicFacet: instance.publicFacet,
    invitationIssuer,
    invitationBrand,
    zoe,
    timer,
    installation,
    bundle,
    schedule,
  };
};
test.beforeEach(async t => {
  const testContext = await makeTestContext(t);
  t.context = await testContext;
});

const naiveAddressCreator = initialId => {
  initialId += 1;
  return string => `agoric123445${string}-${initialId}`;
};

const makeAddress = naiveAddressCreator(0);

const simulateClaim = async (
  t,
  invitation,
  expectedPayout,
  walletAddress = makeAddress('abcd'),
) => {
  console.log({ context: t.context, invitation, expectedPayout });
  const { zoe, memeIssuer: tokenIssuer } = await t.context;
  /** @type {UserSeat} */
  const claimSeat = await E(zoe).offer(invitation, undefined, undefined, {
    walletAddress,
    proof: walletAddress,
  });

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
test('Outdated Airdrop campaign approach', async t => {
  const {
    schedule: distributionSchedule,
    timeIntervals,
    publicFacet,
    timer,
    memes,
  } = await t.context;

  t.deepEqual(
    await E(publicFacet).getStatus(),
    AIRDROP_STATES.PREPARED,
    'Contract state machine should update from initialized to prepared upon successful startup.',
  );
  t.deepEqual(
    head(timeIntervals),
    2_300n,
    // are we really testing the head() function here? why not in its own test?
    'head function given an array should return the first item in the array.',
  );
  // the following tests could invoke `creatorFacet` and `publicFacet`
  // synchronously. But we don't in order to better model the user
  // code that might be remote.
  const [TWENTY_THREE_HUNDRED, ELEVEN_THOUSAND] = [2_300n, 11_000n]; // why?

  // Advancing the timer past the set start time.
  await E(timer).advanceBy(TimeIntervals.SECONDS.ONE_DAY * 8n);
  t.deepEqual(
    await E(publicFacet).getStatus(),
    AIRDROP_STATES.OPEN,
    `Contract should maintain its prepared status until startTime is reached.`,
  );

  await simulateClaim(
    t,
    await E(publicFacet).makeClaimInvitation(),
    memes(1000n),
    makeAddress('ef'),
  );

  await E(timer).advanceBy(180_000n);

  t.deepEqual(
    await E(publicFacet).getStatus(),
    AIRDROP_STATES.OPEN,
    `Contract state machine should update from ${AIRDROP_STATES.PREPARED} to ${AIRDROP_STATES.OPEN} when startTime is reached.`,
  );

  await simulateClaim(
    t,
    await E(publicFacet).makeClaimInvitation(),
    memes(1000n),
    makeAddress('efgg'),
  );

  await E(timer).advanceBy(2_660_000n);

  t.log('inside test utilities');

  t.deepEqual(
    head(timeIntervals),
    2_300n,
    // are we really testing the head() function here? why not in its own test?
    'head function given an array should return the first item in the array.',
  );

  await simulateClaim(
    t,
    await E(publicFacet).makeClaimInvitation(),
    memes(1000n),
    makeAddress('xyz'),
  );
});

test.todo('Airdrop Claim before contract status has been marked as open');
