// @ts-check
// eslint-disable-next-line import/order
import { test as anyTest } from './airdropData/prepare-test-env-ava.js';
import { createRequire } from 'module';
import { E } from '@endo/far';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
// ??? import { Id, IO, Task } from '../src/airdrop/adts/monads.js';
import { bootAndInstallBundles } from './boot-tools.js';
// import {
//   installContractStarter,
//   startContractStarter,
// } from '../src/start-contractStarter.js';
import { makeBundleCacheContext } from '../tools/bundle-tools.js';
import { TimeMath } from '@agoric/time';

import '@agoric/store/exported.js';
import { TimeIntervals } from '../src/airdrop/helpers/time.js';
import { createTimerService } from '../tools/timer-tools.js';
import { createDistributionConfig } from './utils.js';
import { setup } from './setupBasicMints.js';
import path from 'path';

import { TEST_TREE_DATA } from './data/agoric.accounts.js';
/** @import { Amount, AssetKind, Brand } from '@agoric/ertp/src/types.js'; */
const filename = new URL(import.meta.url).pathname;
const dirname = path.dirname(filename);

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

test.before(async t => (t.context = await makeBundleCacheContext(t)));

const ONE_THOUSAND = 1000n;
const nodeRequire = createRequire(import.meta.url);
const makeBundleId = ({ endoZipBase64Sha512 }) => `b1-${endoZipBase64Sha512}`;
const root = `${dirname}/../../src/airdrop/prepare.js`;
const { memeMint, memeIssuer, memeKit, memes, moola, zoe, vatAdminState } =
  setup();

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

const makeTestContext = async t => {
  const bootKit = await bootAndInstallBundles(t, bundleRoots);
  console.log({ bootKit });
  const { powers, bundles } = bootKit;

  const timer = await powers.consume.chainTimerService;

  const timerBrand = await E(timer).getTimerBrand();

  const relTimeMaker = makeRelTimeMaker(timerBrand);

  const TOTAL_SUPPLY = memes(10_000_000n);

  const createMemeTokenDistributionSchedule = createDistributionConfig();

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

  const schedule = createMemeTokenDistributionSchedule;

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
  const instance = await E(zoe).startInstance(
    airdropInstallation,
    harden({ Token: memeIssuer }),
    harden({
      hash: TEST_TREE_DATA.rootHash,
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

  return {
    primaryPurse: AIRDROP_PURSE,
    makeStartOpts,
    airdropInstallation,
    instance,
  };
};

const setupPurseNotifier = async purse => {
  const notifier = await E(purse).getCurrentAmountNotifier();
  let nextUpdate = E(notifier).getUpdateSince();
  return {
    nextUpdate,
    notifier,
    async checkNotifier() {
      const { value: balance, updateCount } = await nextUpdate;
      console.log('checking notiifer:::', { updateCount, balance });
      nextUpdate = await E(notifier).getUpdateSince(updateCount);
      console.log('nextUpdate:::', { nextUpdate });
    },
  };
};

test('airdrop claim :: eligible participant', async t => {
  const before = t.context;
  await makeTestContext(t);
  await t.is(before, t.context);
});
