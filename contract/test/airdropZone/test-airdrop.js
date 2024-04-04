/* eslint-disable import/order */
import { test as anyTest } from '../prepare-test-env-ava.js';
import path from 'path';

import bundleSource from '@endo/bundle-source';
import { E } from '@endo/far';
import { Far } from '@endo/marshal';


import { makeStateMachine } from '@agoric/zoe/src/contractSupport/stateMachine.js';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { setup } from '../setupBasicMints.js';
import { eventLoopIteration } from './utils.js';
import { getTokenQuantity, getWindowLength } from '../../src/airdrop/helpers/objectTools.js';

const filename = new URL(import.meta.url).pathname;
const dirname = path.dirname(filename);

/** @type {import('ava').TestFn} */
const test = anyTest;

const root = `${dirname}/../../src/airdrop/prepare.js`;

const defaultIntervals = [2_300n, 3_500n, 5_000n, 11_000n, 150_000n, 175_000n];

const defaultDistributionArray = [
  { windowLength: 159_200n, tokenQuantity: 10_000n },
  { windowLength: 864_000n, tokenQuantity: 6_000n },
  { windowLength: 864_000n, tokenQuantity: 3_000n },
  { windowLength: 864_000n, tokenQuantity: 1_500n },
  { windowLength: 864_000n, tokenQuantity: 750n },
];

const verify = address => assert(address[0] !== 'a');

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
const allowedTransitions = [
  [startState, [PREPARED]],
  [PREPARED, [OPEN]],
  [OPEN, [EXPIRED, RESTARTING]],
  [RESTARTING, [OPEN]],
  [EXPIRED, []],
];
const stateMachine = makeStateMachine(startState, allowedTransitions);

const head = ([x] = []) => x;
const tail = ([_, ...xs]) => xs;

const ONE_THOUSAND = 1_000n;

const makeTimer = (logFn, startTime) =>
  buildManualTimer(logFn, startTime, { eventLoopIteration });
test.beforeEach('setup', async t => {
  const {
    memeMint,
    memeIssuer,
    memeKit,
    memes,
    bucksIssuer,
    bucksMint,
    bucks,
    zoe,
    vatAdminState,
  } = setup();

  const TOTAL_SUPPLY = memes(10_000_000n);
  const AIRDROP_PAYMENT = memeMint.mintPayment(TOTAL_SUPPLY);
  const AIRDROP_PURSE = memeIssuer.makeEmptyPurse();
  AIRDROP_PURSE.deposit(AIRDROP_PAYMENT);
  const invitationIssuer = await E(zoe).getInvitationIssuer();
  const invitationBrand = await E(invitationIssuer).getBrand();

  // Pack the contract.
  const bundle = await bundleSource(root);
  vatAdminState.installBundle('b1-ownable-Airdrop', bundle);
  /** @type {Installation<import('./ownable-airdrop.js').start>} */
  const installation = await E(zoe).installBundleID('b1-ownable-Airdrop');
  const timer = makeTimer(t.log, 0n);
  const schedule = harden(createDistributionConfig());
  const instance = await E(zoe).startInstance(
    installation,
    { Token: memeIssuer },
    harden({
      basePayoutQuantity: ONE_THOUSAND,
      startTime: 10_000n,
      AirdropUtils: Far('AirdropUtils', {
        makeAmount() {
          return x => memes(x);
        },
        getSchedule() {
          return schedule;
        },
        getVerificationFn() {
          return x => verify(x);
        },
        getStateMachine() {
          return { stateMachine, states: AIRDROP_STATES };
        },
      }),
    }),
    harden({
      count: 3n,
      purse: AIRDROP_PURSE,
      timer,
    }),
    'c1-ownable-Airdrop',
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
  t.context = {
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
});

const simulateClaim = async (t, invitation, expectedPayout) => {
  const { zoe, memeIssuer: tokenIssuer, memes } = t.context;
  const claimInviation = await E(zoe).offer(invitation);

  /**
   * Description placeholder
   * @date 4/3/2024 - 8:24:47 PM
   *
   * @typedef {object} AirdropResult
   * @property {string} message
   * @property {Payment} airdrop
   */

  /** @type {AirdropResult} */
  const claimResult = await E(claimInviation).getOfferResult();

  t.log('------------ testing claim capabilities -------');
  t.log('-----------------------------------------');
  t.log('AirdropResult', claimResult);
  t.log('-----------------------------------------');
  t.log('expectedPayout value', expectedPayout);
  t.log('-----------------------------------------');

  t.deepEqual(claimResult.message, 'Here is your payout purse - enjoy!');

  t.deepEqual(await E(tokenIssuer).isLive(claimResult.airdrop), true);
  t.deepEqual(
    await E(tokenIssuer).getAmountOf(claimResult.airdrop),
    memes(expectedPayout),
  );
};

test('zoe - ownable-Airdrop contract', async t => {
  const {
    schedule: distributionSchedule,
    timeIntervals,
    creatorFacet,
    publicFacet,
    timer,
  } = t.context;

  await E(creatorFacet).prepareAirdropCampaign();

  t.deepEqual(
    head(timeIntervals),
    2_300n,
    'head function given an array should return the first item in the array.',
  );
  // the following tests could invoke `creatorFacet` and `publicFacet`
  // synchronously. But we don't in order to better model the user
  // code that might be remote.
  const [TWENTY_THREE_HUNDRED, ELEVEN_THOUSAND] = [2_300n, 11_000n];
  await E(timer).advanceBy(TWENTY_THREE_HUNDRED);
  t.is(
    await E(publicFacet).getStatus(),
    AIRDROP_STATES.PREPARED,
    'Contract state machine should update from initialized to prepared upon successful startup.',
  );


  await E(timer).advanceBy(ELEVEN_THOUSAND);
  t.deepEqual(
    await E(publicFacet).getStatus(),
    AIRDROP_STATES.OPEN,
    `Contract state machine should update from ${AIRDROP_STATES.PREPARED} to ${AIRDROP_STATES.OPEN} when startTime is reached.`,
  );

  let schedule = distributionSchedule;
  const { absValue: absValueAtStartTime } =
    await E(timer).getCurrentTimestamp();

  const add = x => y => x + y;

  let bonusTokenQuantity = getTokenQuantity(schedule);
  const firstEpochLength = getWindowLength(schedule);

  const createDistrubtionWakeupTime =
    add(firstEpochLength)(absValueAtStartTime);
  // lastTimestamp = TimeMath.coerceTimestampRecord(lastTimestamp);

  t.deepEqual(
    createDistrubtionWakeupTime,
    ELEVEN_THOUSAND + TWENTY_THREE_HUNDRED + firstEpochLength,
  );  
  t.is(bonusTokenQuantity, 10_000n);

  await simulateClaim(
    t,
    await E(publicFacet).claim(),
    add(bonusTokenQuantity)(ONE_THOUSAND),
  );
  schedule = tail(distributionSchedule);
  bonusTokenQuantity = getTokenQuantity(schedule);
  await E(timer).advanceBy(180_000n);

  t.deepEqual(
    await E(publicFacet).getStatus(),
    AIRDROP_STATES.OPEN,
    `Contract state machine should update from ${AIRDROP_STATES.PREPARED} to ${AIRDROP_STATES.OPEN} when startTime is reached.`,
  );
  t.is(bonusTokenQuantity, 6_000n);

  await simulateClaim(
    t,
    await E(publicFacet).claim(),
    add(bonusTokenQuantity)(ONE_THOUSAND),
  );

  await E(timer).advanceBy(2_660_000n);
  schedule = tail(distributionSchedule);

  t.log('inside test utilities');


  t.deepEqual(
    head(timeIntervals),
    2_300n,
    'head function given an array should return the first item in the array.',
  );

  await simulateClaim(
    t,
    await E(publicFacet).claim(),
    add(3_000n)(ONE_THOUSAND),
  );
});
