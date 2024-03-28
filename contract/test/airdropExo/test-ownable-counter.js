/* eslint-disable import/order */
import { test } from '../prepare-test-env-ava.js';
import path from 'path';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import bundleSource from '@endo/bundle-source';
import { E, Far } from '@endo/far';
import { eventLoopIteration } from './utils.js';
import { setup } from '../setupBasicMints.js';

const filename = new URL(import.meta.url).pathname;
const dirname = path.dirname(filename);

export const GET_METHOD_NAMES = '__getMethodNames__';

const root = `${dirname}/ownable-airdrop.js`;

const defaultDistributionArray = [
  { windowLength: 259_200n, tokenQuantity: 10_000n },
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

const makeTimer = (logFn, startTime) =>
  buildManualTimer(logFn, startTime, { eventLoopIteration });
test.before('setup', async t => {
  const {
    memeMint,
    memeIssuer,
    memes,
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

  const schedule = harden(createDistributionConfig());
  const instance = await E(zoe).startInstance(
    installation,
    undefined,
    harden({
      AirdropUtils: Far('AirdropUtils', {
        getSchedule() {
          return schedule
        },
        getVerificationFn() {
          return x => verify(x);
        },
      }),
    }),
    harden({
      count: 3n,
      purse: AIRDROP_PURSE,
      timer: makeTimer(t.log, 0n),
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
    instance,
    creatorFacet: instance.creatorFacet,
    publicFacet: instance.publicFacet,
    invitationIssuer,
    invitationBrand,
    zoe,
    installation,
    bundle,
  };
});
test('zoe - ownable-Airdrop contract', async t => {
  const {
    creatorFacet: firstAirdrop,
    publicFacet: viewAirdrop,
    zoe,
    invitationIssuer,
    invitationBrand,
    installation,
  } = t.context;
  // await t.throwsAsync(
  //   // @ts-expect-error method of underlying that ownable doesn't allow
  //   E(firstAirdrop).toBeAttenuated(),
  //   {
  //     message:
  //       'target has no method "toBeAttenuated", has ["__getInterfaceGuard__","__getMethodNames__", "claim", "getInvitationCustomDetails","incr","makeTransferInvitation"]',
  //   },
  // );

  // the following tests could invoke `firstAirdrop` and `viewAirdrop`
  // synchronously. But we don't in order to better model the user
  // code that might be remote.

  const methods = await E(firstAirdrop)[GET_METHOD_NAMES]();
  t.deepEqual(methods.length, 6);

  t.is(await E(firstAirdrop).incr(), 4n);
  t.is(await E(viewAirdrop).view(), 4n);

  t.deepEqual(await E(firstAirdrop).getInvitationCustomDetails(), {
    count: 4n,
  });

  const invite = await E(firstAirdrop).makeTransferInvitation();

  t.deepEqual(await E(firstAirdrop)[GET_METHOD_NAMES](), [
    '__getInterfaceGuard__',
    '__getMethodNames__',
    'claim',
    'getInvitationCustomDetails',
    'incr',
    'makeTransferInvitation',
  ]);

  await t.throwsAsync(() => E(firstAirdrop).getInvitationCustomDetails(), {
    message: '"OwnableAirdrop_caretaker" revoked',
  });
  await t.throwsAsync(() => E(firstAirdrop).incr(), {
    message: '"OwnableAirdrop_caretaker" revoked',
  });
  t.is(await E(viewAirdrop).view(), 4n);

  const inviteAmount = await E(invitationIssuer).getAmountOf(invite);

  t.deepEqual(inviteAmount, {
    brand: invitationBrand,
    value: [
      {
        description: 'transfer',
        installation,
        handle: inviteAmount.value[0].handle,
        instance: inviteAmount.value[0].instance,
        customDetails: {
          count: 4n,
        },
      },
    ],
  });

  const reviveAirdropSeat = await E(zoe).offer(invite);

  const Airdrop2 = await E(reviveAirdropSeat).getOfferResult();
  t.is(await E(reviveAirdropSeat).hasExited(), true);

  t.is(await E(viewAirdrop).view(), 4n);
  t.deepEqual(await E(Airdrop2).getInvitationCustomDetails(), {
    count: 4n,
  });

  t.is(await E(Airdrop2).incr(), 5n);

  t.is(await E(viewAirdrop).view(), 5n);
  t.deepEqual(await E(Airdrop2).getInvitationCustomDetails(), {
    count: 5n,
  });
});
