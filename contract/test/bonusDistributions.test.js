/* eslint-disable import/order */
// @ts-check
import { test as anyTest } from './airdropData/prepare-test-env-ava.js';
import { createRequire } from 'module';
import { E, Far, passStyleOf } from '@endo/far';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { TimeMath } from '@agoric/time';
import {
  bootAndInstallBundles,
  makeMockTools,
  makeSmartWalletFactory,
} from '../tools/boot-tools.js';
import { getBundleId, makeBundleCacheContext } from '../tools/bundle-tools.js';
import { env as ambientEnv } from 'node:process';
import * as ambientChildProcess from 'node:child_process';
import * as ambientFsp from 'node:fs/promises';
import { extract } from '@agoric/vats/src/core/utils.js';
import { makeE2ETools } from '../tools/e2e-tools.js';

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
import { compose, objectToMap } from '../src/airdrop/helpers/objectTools.js';
import { makeMarshal } from '@endo/marshal';
import { createClaimSuccessMsg } from '../src/airdrop/helpers/messages.js';
import { makeTreeRemotable } from './data/tree.utils.js';
import { trace } from 'console';
import { makeCopySet } from '@endo/patterns';
import { makeStateMachine } from '../src/airdrop/helpers/stateMachine.js';
import { makeRatio, multiplyBy } from '@agoric/zoe/src/contractSupport/ratio.js';
import { makeRelTimeMaker } from './proveEligibility.test.js';

const Id = value => ({
  value,
  map: f => Id(f(value)),
  chain: f => f(value),
  extract: () => value,
  concat: o => Id(value.concat(o.extract())),
  inspect() {
    console.log(
      'Id(',
      typeof this.value === 'object'
        ? Object.entries(this.value).map(x => x)
        : this.value,
      ')',
    );
    return Id(this.value);
  },
});
Id.of = x => Id(x);

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

const makeClaimOfferArgs = ({ pubkey, address, proof } = defaultClaimaint) => ({
  pubkey,
  address,
  proof,
});

const simulateClaim = async (
  t,
  invitation,
  expectedPayout,
  claimAccountDetails = makeClaimOfferArgs(),
) => {
  const marshaller = makeMarshal();
  console.log('inside simulateClaim');
  // claimAccountDetails object holds values that are passed into the offer as offerArgs
  // proof should be used to verify proof against tree (e.g. tree.verify(proof, leafValue, hash) where tree is the merkletree, leafValue is pubkey value, and root hash of tree)
  // address is used in conjunction with namesByAddress/namesByAddressAdmin to send tokens to claimain (see https://docs.agoric.com/guides/integration/name-services.html#namesbyaddress-namesbyaddressadmin-and-depositfacet-per-account-namespace)
  const { pubkey, address, proof } = claimAccountDetails;
  console.log({ pubkey });
  const { zoe, memeIssuer: tokenIssuer } = await t.context;

  const offerArgsObject = harden({
    ...claimAccountDetails,
    proof: claimAccountDetails,
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

  t.log('tests pass for account:', claimAccountDetails.address);
};
const filename = new URL(import.meta.url).pathname;

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

const ONE_THOUSAND = 1000n;
const nodeRequire = createRequire(import.meta.url);
const { memeMint, memeIssuer, memeKit ,memes, moola, zoe } = setup();

// const contractName = 'launchIt';
const airdropName = 'airdropCampaign';
const bundleRoots = {
  // [contractName]: nodeRequire.resolve('../src/launchIt.js'),
  [airdropName]: nodeRequire.resolve('../src/airdrop.contract.js'),
  // contractStarter: nodeRequire.resolve('../src/contractStarter.js'),
};
const makeTimerPowers = async ({ consume }) => {
  const timer = await consume.chainTimerService;

  const timerBrand = await E(timer).getTimerBrand();
  const relTimeMaker = makeRelTimeMaker(timerBrand);

  const relTime = relTimeMaker(TimeIntervals.SECONDS.ONE_DAY);

  return {
    timer,
    timerBrand,
    relTime,
    relTimeMaker,
  };
};
// Example usage with AIRDROP_TIERS:
const AIRDROP_TIERS = {
  0: [1000, 800, 650, 500, 350],
  1: [600, 480, 384, 307, 245],
  2: [480, 384, 307, 200, 165],
  3: [300, 240, 192, 153, 122],
  4: [100, 80, 64, 51, 40],
  5: [15, 13, 11, 9, 7],
};
/** @param {import('ava').ExecutionContext} t */
const setupTestContext = async t => {
  const bc = await makeBundleCacheContext(t);

  const { E2E } = ambientEnv;
  const { execFileSync, execFile } = ambientChildProcess;
  const { writeFile } = ambientFsp;

  /** @type {import('../tools/agd-lib.js').ExecSync} */
  const dockerExec = (file, args, opts = { encoding: 'utf-8' }) => {
    const workdir = '/workspace/contract';
    const execArgs = ['compose', 'exec', '--workdir', workdir, 'agd'];
    opts.verbose &&
      console.log('docker compose exec', JSON.stringify([file, ...args]));
    return execFileSync('docker', [...execArgs, file, ...args], opts);
  };

  console.time('makeTestTools');
  console.timeLog('makeTestTools', 'start');
  // installBundles,
  // runCoreEval,
  // provisionSmartWallet,
  // runPackageScript???
  const tools = await (E2E
    ? makeE2ETools(t, bc.bundleCache, {
        execFileSync: dockerExec,
        execFile,
        fetch,
        setTimeout,
        writeFile,
      })
    : makeMockTools(t, bc.bundleCache));
  console.timeEnd('makeTestTools');

  return { ...tools, ...bc };
};
const TOKEN_SUPPLY = {
  BASE_SUPPLY: 10_000_000n
}

test('bonus mint ratios', t => {
  const bonusRatio = makeRatio(1n, memeKit.brand);


})

const makeTestContext = async t => {
  const bootKit = await bootAndInstallBundles(t, bundleRoots);
  const walletFactory = makeSmartWalletFactory(bootKit.powers);
  const { powers, bundles } = bootKit;

  const timer = await powers.consume.chainTimerService;

  const timerBrand = await E(timer).getTimerBrand();

  const relTimeMaker = makeRelTimeMaker(timerBrand);
  const TOTAL_SUPPLY = memes(TOKEN_SUPPLY.BASE_SUPPLY);
  const bonusRatio = makeRatio(1n, memeKit.brand)
  t.deepEqual(multiplyBy(TOTAL_SUPPLY, bonusRatio), memes(100_000n))

  // t.deepEqual(
  //   await MemePurse.map(x => x.deposit(memeMint.mintPayment(memes(10_000n)))),
  //   MemePurse.inspect(),
  // );



  const AIRDROP_PAYMENT = memeMint.mintPayment(TOTAL_SUPPLY);
  const AIRDROP_PURSE = memeIssuer.makeEmptyPurse();
  AIRDROP_PURSE.deposit(AIRDROP_PAYMENT);

  const startTime = relTimeMaker(TimeIntervals.SECONDS.ONE_DAY);
  t.deepEqual(TimeMath.relValue(startTime), TimeIntervals.SECONDS.ONE_DAY);
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

  const objectToSymbolArray = obj =>
    Object.entries(obj).map(([key, value], index) => [index, value]);

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
      tiers: AIRDROP_TIERS,
      startEpoch: 0,
      totalEpochs: 5,
      epochLength: TimeIntervals.SECONDS.ONE_DAY,
      hash: TEST_TREE_DATA.rootHash,
      basePayoutQuantity: memes(ONE_THOUSAND),
      startTime: relTimeMaker(TimeIntervals.SECONDS.ONE_DAY * 3n),
    }),
    harden({
      purse: AIRDROP_PURSE,
      bonusPurse: MemePurse.purse,
      TreeRemotable: testTreeRemotable,
      timer,
    }),
    'c1-ownable-Airdrop',
  );

  return {
    ...t.context,
    walletFactory,
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

test.before(async t => {
  t.context = await setupTestContext(t);

  const testSetup = await makeTestContext(t);

  const { installBundles } = testSetup;
  console.time('installBundles');
  console.timeLog('installBundles', Object.keys(bundleRoots).length, 'todo');
  const bundles = await installBundles(bundleRoots, (...args) =>
    console.timeLog('installBundles', ...args),
  );
  console.timeEnd('installBundles');

  const id = `b1-${bundles.airdropCampaign.endoZipBase64Sha512}`;

  const shortId = id.slice(0, 8);
  t.log('postalService', shortId);
  t.is(id.length, 3 + 128, 'bundleID length');
  t.regex(id, /^b1-.../);

  Object.assign(t.context, { ...testSetup, shared: { bundles } });
  console.log('context :: after', t.context);
});


const handleValidateProof =
  (tree = TEST_TREE_DATA.tree, hash = TEST_TREE_DATA.rootHash) =>
  (proof = preparedAccounts[0].proof, nodeValue = preparedAccounts[0].pubkey) =>
    tree.verify(proof, nodeValue, hash);
