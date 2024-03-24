// @ts-check
import { test as anyTest } from './airdropData/prepare-test-env-ava.js';
import { createRequire } from 'module';

import { E } from '@endo/far';
import { makeWalletFactory } from './wallet-tools.js';
import { AmountMath, AssetKind } from '@agoric/ertp/src/amountMath.js';
import { makeIssuerKit } from '@agoric/ertp';
import { makeFan, launcherLarry, starterSam } from './market-actors.js';
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

const nodeRequire = createRequire(import.meta.url);

const contractName = 'launchIt';
const bundleRoots = {
  [contractName]: nodeRequire.resolve('../src/launchIt.js'),
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

test.serial('airdrop -- happy path', async t => {
  const { shared } = t.context;
  const { powers, boardAux, bundles } = shared;

  const bundleID = getBundleId(bundles[contractName]);
  const MNY = makeIssuerKit('MNY');

  const { walletFactory } = t.context.shared;

  const brand = {
    Invitation: await powers.brand.consume.Invitation,
  };
  /**
   * @type {import('./market-actors.js').WellKnown &
   *  import('./market-actors.js').WellKnownKinds &
   *  import('./market-actors.js').BoardAux}
   */
  const wellKnown = {
    timerService: await powers.consume.chainTimerService, // XXX
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
  const wallet = {
    sam: await walletFactory.makeSmartWallet('agoric1sam'),
    larry: await walletFactory.makeSmartWallet('agoric1larry'),
  };
  await E(wallet.sam.deposit).receive(
    await mintBrandedPayment(100n * 1_000_000n),
  );
  const sam = starterSam(t, { wallet: wallet.sam }, wellKnown);

  const installation = await E(sam).install({ bundleID, label: 'launchIt' });

  // issuerKeywordRecord: { MNY: MNY.issuer },

  t.is(typeof installation, 'object');

  powers.brand.produce.MNY.resolve(MNY.brand);
  powers.issuer.produce.MNY.resolve(MNY.issuer);
  await E(wallet.larry.offers).addIssuer(MNY.issuer);
  assert(await wellKnown.brand.timer, 'no timer brand???');
  await E(wallet.larry.deposit).receive(
    await mintBrandedPayment(20n * 1_000_000n),
  );
  const larry = await launcherLarry(t, { wallet: wallet.larry }, wellKnown);
  const instance = await E(larry).∑w(installation);

  const makeFanWallet = async ix => {
    const wallet = await walletFactory.makeSmartWallet(`agoric1fan${ix}`);
    await E(wallet.offers).addIssuer(MNY.issuer);
    await E(wallet.deposit).receive(
      await E(MNY.mint).mintPayment(AmountMath.make(MNY.brand, 125n)),
    );
    return wallet;
  };
  const range = n => [...Array(n).keys()];
  let current = 0;
  const fans = await Promise.all(
    range(12).map(async ix => {
      const wallet = await makeFanWallet(ix);
      const quantity = 3 + ((ix * 23) % 47);
      current += 1;
      console.log('making fan wallet:::::', wallet, { quantity, current });
      return makeFan(t, { wallet, ix, qty: BigInt(quantity) }, wellKnown);
    }),
  );
  await Promise.all(fans.map(fan => E(fan).deposit(instance)));

  const timer = powers.consume.chainTimerService;
  const timerBrand = await powers.brand.consume.timer;
  const afterDeadline = { timerBrand, absValue: 11n }; // TODO: coordinate with larry
  await E(timer).advanceTo(afterDeadline);
  t.log('time passed... to', afterDeadline.absValue);

  t.log('TODO: should fan figure out his share of the proceeds?');
  await E(larry).collect();
  await Promise.all(fans.map(fan => E(fan).redeem(instance)));

  const m = makeClientMarshaller();
  const storage = await powers.consume.chainStorage;
  const note = `boardAux for launchIt, contractStarter instances`;
  await documentStorageSchema(t, storage, { note, marshaller: m });
});

test.serial('start launchIt instance to launch token', async t => {
  const { shared } = t.context;
  const { powers, boardAux, bundles } = shared;

  const bundleID = getBundleId(bundles[contractName]);
  const MNY = makeIssuerKit('MNY');

  const { walletFactory } = t.context.shared;

  const brand = {
    Invitation: await powers.brand.consume.Invitation,
  };
  /**
   * @type {import('./market-actors.js').WellKnown &
   *  import('./market-actors.js').WellKnownKinds &
   *  import('./market-actors.js').BoardAux}
   */
  const wellKnown = {
    timerService: await powers.consume.chainTimerService, // XXX
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
  const wallet = {
    sam: await walletFactory.makeSmartWallet('agoric1sam'),
    larry: await walletFactory.makeSmartWallet('agoric1larry'),
  };
  await E(wallet.sam.deposit).receive(
    await mintBrandedPayment(100n * 1_000_000n),
  );
  const sam = starterSam(t, { wallet: wallet.sam }, wellKnown);

  const installation = await E(sam).install({ bundleID, label: 'launchIt' });

  // issuerKeywordRecord: { MNY: MNY.issuer },

  t.is(typeof installation, 'object');

  powers.brand.produce.MNY.resolve(MNY.brand);
  powers.issuer.produce.MNY.resolve(MNY.issuer);
  await E(wallet.larry.offers).addIssuer(MNY.issuer);
  assert(await wellKnown.brand.timer, 'no timer brand???');
  await E(wallet.larry.deposit).receive(
    await mintBrandedPayment(20n * 1_000_000n),
  );
  const larry = await launcherLarry(t, { wallet: wallet.larry }, wellKnown);
  const instance = await E(larry).∑w(installation);

  const makeFanWallet = async ix => {
    const wallet = await walletFactory.makeSmartWallet(`agoric1fan${ix}`);
    await E(wallet.offers).addIssuer(MNY.issuer);
    await E(wallet.deposit).receive(
      await E(MNY.mint).mintPayment(AmountMath.make(MNY.brand, 125n)),
    );
    return wallet;
  };
  const range = n => [...Array(n).keys()];
  let current = 0;
  const fans = await Promise.all(
    range(12).map(async ix => {
      const wallet = await makeFanWallet(ix);
      const quantity = 3 + ((ix * 23) % 47);
      current += 1;
      console.log('making fan wallet:::::', wallet, { quantity, current });
      return makeFan(t, { wallet, ix, qty: BigInt(quantity) }, wellKnown);
    }),
  );
  await Promise.all(fans.map(fan => E(fan).deposit(instance)));

  const timer = powers.consume.chainTimerService;
  const timerBrand = await powers.brand.consume.timer;
  const afterDeadline = { timerBrand, absValue: 11n }; // TODO: coordinate with larry
  await E(timer).advanceTo(afterDeadline);
  t.log('time passed... to', afterDeadline.absValue);

  t.log('TODO: should fan figure out his share of the proceeds?');
  await E(larry).collect();
  await Promise.all(fans.map(fan => E(fan).redeem(instance)));

  const m = makeClientMarshaller();
  const storage = await powers.consume.chainStorage;
  const note = `boardAux for launchIt, contractStarter instances`;
  await documentStorageSchema(t, storage, { note, marshaller: m });
});
