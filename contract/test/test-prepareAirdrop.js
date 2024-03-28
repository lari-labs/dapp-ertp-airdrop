// @ts-check
/* global assert */
/* eslint-disable import/order -- https://github.com/endojs/endo/issues/1235 */
import { test as anyTest } from './airdropData/prepare-test-env-ava.js';
import path from 'path';
import bundleSource from '@endo/bundle-source';
import { E } from '@endo/eventual-send';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import { AmountMath, makeIssuerKit } from '@agoric/ertp';
import { Far } from '@endo/marshal';
import { wallets as testWallets } from './airdropData/2kwallets.js';
import { setUpZoeForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { makeFakeMarshaller } from '@agoric/notifier/tools/testSupports.js';
import { makeFakeStorageKit } from '@agoric/internal/src/storage-test-utils.js';
import {
  AIRDROP_ADMIN_MESSAGES,
  CLAIM_MESSAGES,
} from '../src/airdrop/helpers/messages.js';
import { oneDay } from '../src/airdrop/helpers/time.js';
import { createHash } from 'crypto';
import { createRequire } from 'module';
import {
  bootAndInstallBundles,
  getBundleId,
  makeBundleCacheContext,
} from './boot-tools.js';
import { createDistributionConfig } from './utils.js';
import { makeCopySet } from '@endo/patterns';

const makeSha256 = input => createHash('sha256').update(input).digest('hex');

const defaultAccount = { address: 'string', amount: 0 };
/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

const nodeRequire = createRequire(import.meta.url);

const bundleRoots = {
  postalSvc: nodeRequire.resolve('../src/postalSvc.js'),
  airdropCampaign: nodeRequire.resolve('../src/airdropCampaign.js'),
};

test.before(async t => (t.context = await makeBundleCacheContext(t)));

const verify =
  root =>
  (proof = [''], account = defaultAccount) => {
    let hashBuf = Buffer.from(
      makeSha256(account.address + account.amount).toString(),
    );

    proof.forEach(proofElem => {
      const proofBuf = Buffer.from(proofElem, 'hex');
      if (hashBuf < proofBuf) {
        hashBuf = Buffer.from(
          makeSha256(Buffer.concat([hashBuf, proofBuf]).toString()),
        );
      } else {
        hashBuf = Buffer.from(
          makeSha256(Buffer.concat([proofBuf, hashBuf]).toString()),
        );
      }
    });

    return root === hashBuf.toString('hex');
  };

// test('verify inclusion proof', async t => {
//   const treeRoot =
//     '51aa9b2495ebb5235a3c6ebe37550ab100979eaa5371e87e14611699a023cc3b';
//   const proof = [
//     '395301e5eea92fe2d042469a3d591e8a9b60be83b3671b9bdccae5b5a1333487',
//     'a9255facf82dfdc7587f1acb32584631bc451b8681c289c920946786810d11ff',
//     'e05363877cfd6b974c1c61c11a1c90b6f5ee9f8f3858d0536ec5cde262f6012a',
//     'd34fb57f4fdf3dbbf480ca3dcf445a3286505bab22addba8cf3261ce85fa59ce',
//     '702f8ec43029a165df18b6a49df18ac40710ec1683394af11d457078c0ac78d7',
//     '54d7a4efd03fabac46616afc953f39103b27a9817dc78ac78537ab050f0ba143',
//     '27c1a815457aba1d0fe070a064c8e66002f4c76dbdb7be668f6fc50ce27c7e47',
//     'd3b9118364345043f1b374da688878ee01ecb4035710bfa1638bc2d5baa328e4',
//   ];

//   const address = 'cosmos1rsffgqju8cuvrnvvxk2yw2q0ylwzk8mg6ly4gw';
//   const actual = verify(treeRoot)(proof, { address, amount: 2000 });

//   await t.deepEqual(
//     actual,
//     true,
//     'verify function should return true for a valid address.',
//   );
// });

const makePrivatePowers = (o = {}) => ({
  marshaller: Far('fake marshaller', { ...makeFakeMarshaller() }),
  storageNode: makeFakeStorageKit('governedPsmTest').rootNode,
  ...o,
});

const dummyWallets = [
  'cosmos1p00xhl9ysacadcduxglhavstr8yvh9hfzk6z6w',
  'cosmos1yquxnvua4me07zxyq85fnxkdg9htqvn90x8m7h',
  'cosmos1l8ccn5mvam289seaxlyghx57d8v2m4wm6ulttw',
  'cosmos1rsffgqju8cuvrnvvxk2yw2q0ylwzk8mg6ly4gw',
  'cosmos1s4nhzkq3ch39me9lclcp4ynk2ywntlcwf887kw',
  'cosmos12qu2l5kf0qpy3jhe42ny55fjqd9n060c2nvw3h',
  'cosmos1sndu8k4j539qzler2p0vqgguqkp2lp2wztlc0p',
  'cosmos1r9pz0v0qwj7pkvx5ww2q3cmhwh0assswevxzrz',
  'cosmos13r67v3nk24654e2l372rexk7uxhxutu92ugyt3',
  'cosmos17w9swykduq93glcx2mldsszulprawretga4sqj',
];

const wallets = testWallets.map(x => x.pubkey);

const filename = new URL(import.meta.url).pathname;
const dirname = path.dirname(filename);

const sourcePath = file => dirname.concat(file);

const rootContractPath = `${dirname}/../src/airdrop/contract.js`;
const prepareAirdrop = `${dirname}/../src/airdrop/prepareAirdropKit.js`;

const createTimerLogger = logger => {
  let i = 0;
  return value => {
    i += 1;
    logger('timer logger:::', { iter: i, value });
    return value;
  };
};

const timerLogger = createTimerLogger(console.log);

const timer = buildManualTimer(timerLogger);

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
const makeBundleId = ({ endoZipBase64Sha512 }) => `b1-${endoZipBase64Sha512}`;

test('prepareAirdrop', async t => {
  const { bundles, powers } = await bootAndInstallBundles(t, bundleRoots);
  const bundleIds = Object.entries(bundles).map(([key, val]) => ({
    key,
    bundleId: makeBundleId(val),
  }));
  const [postSvcBundle, airdropBundle] = bundleIds;
  const { feeMintAccess, zoe } = powers.consume;
  const invitationIssuer = await E(zoe).getInvitationIssuer();

  const timerService = await powers.consume.chainTimerService;

  console.log({
    bundleIds,
    b: await `b1-${bundles.endoZipBase64Sha512}`,
  });

  const { airdropCampaign } = bundles;

  const ids = {
    airdropCampaign: `b1-${airdropCampaign.endoZipBase64Sha512}`,
  };

  const airdropInstallation = await E(zoe).installBundleID(
    airdropBundle.bundleId,
  );

  const issuerKit = makeIssuerKit('Airdroplets');

  const airdropIssuerKeywordRecord = harden({
    Airdroplets: issuerKit.issuer,
  });

  const { bundleCache } = t.context;

  const defaultPrivateArgs = {
    claimPeriodEndTime: oneDay * 28, // 4 Weeks
    tokenBrand: issuerKit.brand,
    tokenIssuer: issuerKit.issuer,
    powers: makePrivatePowers({ timerService: timer }),
  };
  const makePrivateArgs = (o = defaultPrivateArgs) => ({
    ...o,
    ...defaultPrivateArgs,
  });

  const merkleTreeDetails = {
    root: 'bdc991f6708c800b107ff2f9abc9d2ed3ed0a13a1585e31beab7e96fee1b1e95',
  };

  const airdropPurse = issuerKit.issuer.makeEmptyPurse();
  const airdroplets = (x = 0n) => AmountMath.make(issuerKit.brand, x);

  const TOTAL_AIRDROP_SUPPLY = airdroplets(1_000_000n);
  await airdropPurse.deposit(issuerKit.mint.mintPayment(TOTAL_AIRDROP_SUPPLY));

  t.deepEqual(airdropPurse.getCurrentAmount(), airdroplets(1_000_000n));
  const startOpts = {
    customTerms: {
      name: 'memecoinAirdrop',
      rootHash: 'fs2defffdd8s88usd',
      claimWindowLength: 8_640_000n * 28n,
    },
    privateArgs: {
      claimWindowStartTime: BigInt(oneDay * 7),
      distributionSchedule: makeCopySet(createDistributionConfig()).payload,
      purse: airdropPurse,
      timer: timerService,
    },
  };

  const head = ([x, ...xs]) => x;

  const airdropInstance = await E(zoe).startInstance(
    airdropInstallation,
    airdropIssuerKeywordRecord,
    harden(startOpts.customTerms),
    harden(startOpts.privateArgs),
    // @ts-ignore
  );

  const { creatorFacet, publicFacet } = airdropInstance;

  const walletData = wallets;
  const getLength = ({ length }) => length;

  t.deepEqual(getLength(walletData) === 2000, true);
  t.deepEqual(
    await E(creatorFacet).addEligibleUsers(walletData.slice(0, 50)),
    AIRDROP_ADMIN_MESSAGES.ADD_ACCOUNTS_SUCCESS(walletData.slice(0, 50)),
  );

  const { brand: airdropBrand, issuer } = issuerKit;

  const internalPurse = await E(creatorFacet).getPurse();
  t.deepEqual(internalPurse.getCurrentAmount(), airdroplets(0n));

  t.is(
    await E(publicFacet).getTreeRoot(),
    'fs2defffdd8s88usd',
    'public facet should expose a method for obtaining the merkle root',
  );

  const twoThousandAirdroplets = airdroplets(2000n);
  const handleMint = mint => amount => mint.mintPayment(amount);
  const mintAirdropTokenPayment = handleMint(issuerKit.mint);

  const initialDeposit = mintAirdropTokenPayment(twoThousandAirdroplets);

  t.deepEqual(await issuer.getAmountOf(initialDeposit), twoThousandAirdroplets);

  t.deepEqual(
    await E(creatorFacet).depositAirdropPayment(initialDeposit),
    'Deposit success!',
  );

  const openClaimingWindowInvitation =
    await E(creatorFacet).makeOpenClaimingWindow();

  t.deepEqual(
    await E(invitationIssuer).isLive(openClaimingWindowInvitation),
    true,
  );

  const adminPurse = await E(creatorFacet).getPurse();

  const purseNotifier = await setupPurseNotifier(adminPurse);
  t.deepEqual(adminPurse.getCurrentAmount(), twoThousandAirdroplets);

  const { nextUpdate } = await purseNotifier;

  t.deepEqual(await nextUpdate, {
    updateCount: 1n,
    value: twoThousandAirdroplets,
  });

  const twentyMillionAirdroplets = airdroplets(20_000_000n);

  const twentyMillionAirdropletsPayment = mintAirdropTokenPayment(
    twentyMillionAirdroplets,
  );
  const openAirdropInvittion = await E(zoe).offer(
    openClaimingWindowInvitation,
    { give: { Deposit: twentyMillionAirdroplets } },
    { Deposit: twentyMillionAirdropletsPayment },
  );

  t.deepEqual(await E(openAirdropInvittion).getOfferResult(), {});
  t.deepEqual(
    await E(adminPurse).getCurrentAmount(),
    AmountMath.add(twentyMillionAirdroplets, twoThousandAirdroplets),
  );

  t.throwsAsync(() => E(publicFacet).claim('iamnotavalidpublickey'), {
    message: CLAIM_MESSAGES.INELIGIBLE_ACCOUNT_ERROR,
  });

  const claimSeat = await E(publicFacet).claim(walletData[20]);

  // Need to finish implementing
  t.deepEqual(
    claimSeat.message,
    'Token claim success.',
    'claim method:: invoked with a valid public key :: should return an object with a message property.',
  );

  t.deepEqual(
    await E(claimSeat.payout).getCurrentAmount(),
    airdroplets(2_000n),
    'claim method:: invoked with a valid public key :: should return an object with a payout property which references a newly created purse.',
  );
});

/**
 * Frontend
 *
 * Sign a transaction confirming their address.
 *
 *
 *
 */

/**
 * Scenarios I need to test for:
 *
 *
 *
 * Merkle Root
 * Merkle Tree Verifications
 *
 */

test.todo('claim seat -- notifier bonuses');
