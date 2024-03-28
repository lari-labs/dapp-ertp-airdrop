// @ts-check
// eslint-disable-next-line import/order
import { test as anyTest } from './airdropData/prepare-test-env-ava.js';
import { createRequire } from 'module';
import { E } from '@endo/far';
import { AmountMath, AssetKind } from '@agoric/ertp/src/amountMath.js';
import { makeIssuerKit } from '@agoric/ertp';
import { makeWalletFactory } from './wallet-tools.js';
import { Id, IO, Task } from '../src/airdrop/adts/monads.js';
import { launcherLarry, starterSam } from './market-actors.js';
import {
  makeBundleCacheContext,
  bootAndInstallBundles,
  getBundleId,
} from './boot-tools.js';
import {
  installContractStarter,
  startContractStarter,
} from '../src/start-contractStarter.js';
import { makeStableFaucet } from './power-tools/mintStable.js';
import { makeClientMarshaller } from '../src/marshalTables.js';
import { documentStorageSchema } from './airdropData/storageDoc.js';
import '@agoric/store/exported.js';
import { makeCopyBagFromElements, makeCopySet } from '@endo/patterns';
import { createDistributionConfig } from './utils.js';

const nodeRequire = createRequire(import.meta.url);

const contractName = 'launchIt';
const airdropName = 'airdropCampaign';
const bundleRoots = {
  [contractName]: nodeRequire.resolve('../src/launchIt.js'),
  [airdropName]: nodeRequire.resolve('../src/airdropCampaign.js'),
  contractStarter: nodeRequire.resolve('../src/contractStarter.js'),
};

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

test.before(async t => (t.context = await makeBundleCacheContext(t)));

test.serial('boot, walletFactory, contractStarter', async t => {
  const bootKit = await bootAndInstallBundles(t, bundleRoots);
  const { powers, bundles } = bootKit;
  const { IST } = powers.issuer.consume;
  const walletFactory = await makeWalletFactory(powers.consume, { IST });
  const bundleID = getBundleId(bundles.contractStarter);

  await installContractStarter(powers, {
    options: { contractStarter: { bundleID } },
  });
  await startContractStarter(powers, {});

  const starterInstance = await powers.instance.consume.contractStarter;
  t.is(typeof starterInstance, 'object');
  console.log('t.context ### before', t.context, { shared: t.context.shared });
  Object.assign(t.context.shared, { ...bootKit, walletFactory }); // XXX untyped
  console.log('t.context ### after', t.context, { shared: t.context.shared });
});

test.serial('start launchIt instance to launch token', async t => {
  const { shared } = t.context;
  const { powers, boardAux, bundles } = shared;

  const bundleID = getBundleId(bundles[airdropName]);
  const [MNY, AIRDROPLETS] = [
    makeIssuerKit('MNY'),
    makeIssuerKit('Airdroplets'),
  ];

  const TokenKit = Id(AIRDROPLETS.mint);

  const airdroplets = x => AmountMath.make(AIRDROPLETS.brand, x);

  const [AIRDROP_SUPPLY, airdropPurse] = [
    airdroplets(1_000_000n),
    AIRDROPLETS.issuer.makeEmptyPurse(),
  ];

  const MintTask = await Task.of(
    airdropPurse.deposit(AIRDROPLETS.mint.mintPayment(AIRDROP_SUPPLY)),
  );

  const trace = label => value => {
    console.log(label, '::::', value);
    return value;
  };

  t.deepEqual(await E(airdropPurse).getCurrentAmount(), airdroplets(1000000n));

  const { walletFactory } = t.context.shared;

  const brand = {
    Invitation: await powers.brand.consume.Invitation,
  };
  const timerService = await powers.consume.chainTimerService; // XXX

  /**
   * @type {import('./market-actors.js').WellKnown &
   *  import('./market-actors.js').WellKnownKinds &
   *  import('./market-actors.js').BoardAux}
   */
  const wellKnown = {
    timerService,
    installation: powers.installation.consume,
    instance: powers.instance.consume,
    issuer: powers.issuer.consume,
    brand: powers.brand.consume,
    assetKind: new Map(
      /** @type {[Brand, AssetKind][]} */ ([[brand.Invitation, AssetKind.SET]]),
    ),
    boardAux,
  };

  const { feeMintAccess, zoe } = powers.consume;
  const { bundleCache } = t.context;
  const { mintBrandedPayment } = makeStableFaucet({
    bundleCache,
    feeMintAccess,
    zoe,
  });

  const createTestWallet = prefix => chars => prefix.concat(chars);

  const makeAgTestWallets = createTestWallet('agoric');

  const wallets = {
    airdropOwner: await walletFactory.makeSmartWallet('agoric1airdrop0wner'),
    claimers: await Promise.all(
      ['claimer1', 'claimer2', 'inelgible3', 'cliamer4', 'inelgible5']
        .map(makeAgTestWallets)
        .map(walletFactory.makeSmartWallet),
    ),
    sam: await walletFactory.makeSmartWallet('agoric1sam'),
    larry: await walletFactory.makeSmartWallet('agoric1larry'),
  };

  const getLength = ({ length }) => length;

  t.deepEqual(
    getLength(wallets.claimers),
    5,
    'wallets.claimers should contain the correct number of smart wallets.',
  );
  await E(wallets.sam.deposit).receive(
    await mintBrandedPayment(100n * 1_000_000n),
  );
  const sam = starterSam(t, { wallet: wallets.sam }, wellKnown);

  const installation = await E(sam).install({
    bundleID,
    label: 'memecoinAirdrop',
  });

  // issuerKeywordRecord: { MNY: MNY.issuer },

  t.is(typeof installation, 'object');

  powers.brand.produce.AIRDROPLETS.resolve(AIRDROPLETS.brand);
  powers.issuer.produce.AIRDROPLETS.resolve(AIRDROPLETS.issuer);
  await E(wallets.larry.offers).addIssuer(AIRDROPLETS.issuer);
  assert(await wellKnown.brand.timer, 'no timer brand???');
  await E(wallets.larry.deposit).receive(
    await mintBrandedPayment(20n * 1_000_000n),
  );

  const larry = await launcherLarry(t, { wallet: wallets.larry }, wellKnown);

  const startOpts = {
    customTerms: {
      name: 'memecoinAirdrop',
      rootHash: 'fs2defffdd8s88usd',
      claimWindowLength: 8_640_000n * 28n,
    },
    privateArgs: {
      distributionSchedule: makeCopySet(createDistributionConfig()).payload,
      purse: airdropPurse,
      timer: timerService,
    },
  };
  const instance = await E(larry)
    .launch(installation, startOpts)
    .catch(err => {
      return new Error('Error starting contract', err);
    });

  const timer = powers.consume.chainTimerService;
  const timerBrand = await powers.brand.consume.timer;
  const afterDeadline = { timerBrand, absValue: 11n }; // TODO: coordinate with larry
  await E(timer).advanceTo(afterDeadline);
  t.log('time passed... to', afterDeadline.absValue);

  t.log('TODO: should fan figure out his share of the proceeds?');
  await E(larry).collect();
  // await Promise.all(fans.map(fan => E(fan).redeem(instance)));

  const m = makeClientMarshaller();
  const storage = await powers.consume.chainStorage;
  const note = `boardAux for airdropCampaign, contractStarter instances`;
  await documentStorageSchema(t, storage, { note, marshaller: m });

  const copySet = makeCopySet(createDistributionConfig());

  t.is(copySet, copySet.payload);
});
