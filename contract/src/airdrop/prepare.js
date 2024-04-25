// @ts-check
import { M, mustMatch } from '@endo/patterns';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { E } from '@endo/far';
import {
  AmountMath,
  AmountShape,
  BrandShape,
  IssuerShape,
  PurseShape,
} from '@agoric/ertp';
import { TimeMath, RelativeTimeRecordShape } from '@agoric/time';
import { TimerShape } from '@agoric/zoe/src/typeGuards.js';
import { depositToSeat } from '@agoric/zoe/src/contractSupport/zoeHelpers.js';
import { makeWaker } from './helpers/time.js';
import {
  handleFirstIncarnation,
  makeCancelTokenMaker,
} from './helpers/validation.js';
import { makeStateMachine } from './helpers/stateMachine.js';
import { createClaimSuccessMsg } from './helpers/messages.js';
import { objectToMap } from './helpers/objectTools.js';

const cancelTokenMaker = makeCancelTokenMaker('airdrop-campaign');

const AIRDROP_STATES = {
  INITIALIZED: 'initialized',
  PREPARED: 'prepared',
  OPEN: 'claim-window-open',
  EXPIRED: 'claim-window-expired',
  CLOSED: 'claiming-closed',
  RESTARTING: 'restarting',
};
const { OPEN, EXPIRED, PREPARED, INITIALIZED, RESTARTING } = AIRDROP_STATES;

/** @import { CopySet } from '@endo/patterns'; */
/** @import { Brand, Issuer, NatValue, Purse } from '@agoric/ertp/src/types.js'; */
/** @import { TimerService, TimestampRecord } from '@agoric/time/src/types.js'; */
/** @import { Baggage } from '@agoric/vat-data'; */
/** @import { Zone } from '@agoric/base-zone'; */
/** @import { ContractMeta } from '../@types/zoe-contract-facet'; */

export const privateArgsShape = harden({
  purse: PurseShape,
  timer: TimerShape,
});

export const customTermsShape = harden({
  startTime: RelativeTimeRecordShape,
  endTime: M.or(RelativeTimeRecordShape, M.null()),
  basePayoutQuantity: AmountShape,
});

/** @type {ContractMeta} */
export const meta = {
  customTermsShape,
  privateArgsShape,
  upgradability: 'canUpgrade',
};

/**
 * @param {TimestampRecord} sourceTs Base timestamp used to as the starting time which a new Timestamp will be created against.
 * @param {RelativeTimeRecordShape} inputTs Relative timestamp spanning the interval of time between sourceTs and the newly created timestamp
 */

const createFutureTs = (sourceTs, inputTs) =>
  TimeMath.absValue(sourceTs) + TimeMath.relValue(inputTs);

/**
 *
 * @typedef {object} ContractTerms
 * @property {bigint} startTime Length of time (denoted in seconds) between the time in which the contract is started and the time at which users can begin claiming tokens.
 * @property {bigint} endTime Length of time that the airdrop will remain open for claiming.
 * @property {{ [keyword: string]: Brand }} brands
 * @property {{ [keyword: string]: Issuer }} issuers
 */

/**
 * @param {ZCF<ContractTerms>} zcf
 * @param {{ purse: Purse, timer: TimerService }} privateArgs
 * @param {Baggage} baggage
 */
export const start = async (zcf, privateArgs, baggage) => {
  handleFirstIncarnation(baggage, 'LifecycleIteration');
  // XXX why is type not inferred from makeDurableZone???
  /** @type { Zone } */
  const zone = makeDurableZone(baggage, 'rootZone');

  const { purse: airdropPurse, timer } = privateArgs;

  /** @type {ContractTerms} */
  const {
    startTime,
    // schedule: distributionSchedule,
    endTime,
    brands: { Token: tokenBrand },
    issuers: { Token: tokenIssuer },
  } = zcf.getTerms();

  const basePayout = AmountMath.make(tokenBrand, 1000n);

  const t0 = await E(timer).getCurrentTimestamp();

  await objectToMap(
    {
      purse: airdropPurse,
      tokenIssuer,
      startTime: createFutureTs(t0, startTime),
      claimedAccountsStore: zone.setStore('claimed accounts'),
      airdropStatusTracker: zone.mapStore('airdrop status'),
    },
    baggage,
  );
  const airdropStatus = baggage.get('airdropStatusTracker');
  airdropStatus.init('currentStatus', INITIALIZED);

  const stateMachine = makeStateMachine(
    INITIALIZED,
    [
      [INITIALIZED, [PREPARED]],
      [PREPARED, [OPEN]],
      [OPEN, [EXPIRED, RESTARTING]],
      [RESTARTING, [OPEN]],
      [EXPIRED, []],
    ],
    baggage.get('airdropStatusTracker'),
  );

  const makeUnderlyingAirdropKit = zone.exoClassKit(
    'Airdrop Campaign',
    {
      helper: M.interface('Helper', {
        combineAmounts: M.call().returns(AmountShape),
        cancelTimer: M.call().returns(M.promise()),
        // updateDistributionMultiplier: M.call(M.any()).returns(M.promise()),
        // updateEpochDetails: M.call(M.any(), M.any()).returns(),
      }),
      creator: M.interface('Creator', {
        createPayment: M.call().returns(M.any()),
      }),
      claimer: M.interface('Claimer', {
        makeClaimInvitation: M.call().returns(M.promise()),
        getAirdropTokenIssuer: M.call().returns(IssuerShape),
        getStatus: M.call().returns(M.string()),
      }),
    },
    /**
     * @param {Purse} tokenPurse
     * @param {CopySet} store
     */
    (tokenPurse, store) => ({
      /** @type { object } */
      currentCancelToken: null,
      currentEpochEndTime: 0n,
      // basePayout,
      // earlyClaimBonus: AmountMath.add(basePayout, 0n),
      internalPurse: tokenPurse,
      claimedAccounts: store,
    }),
    {
      helper: {
        // combineAmounts() {
        //   const { earlyClaimBonus, basePayout } = this.state;
        //   mustMatch(
        //     earlyClaimBonus,
        //     AmountShape,
        //     'earlyClaimBonus must be an amount.',
        //   );
        //   mustMatch(basePayout, AmountShape, 'basePayout must be an amount.');

        //   return AmountMath.add(earlyClaimBonus, basePayout);
        // },
        async cancelTimer() {
          await E(timer).cancel(this.state.currentCancelToken);
        },
      },
      creator: {
        /** @param {NatValue} x */
        createPayment(x) {
          return airdropPurse.withdraw(AmountMath.make(tokenBrand, x));
        },
      },
      claimer: {
        getStatus() {
          // premptively exposing status for UI-related purposes.
          return airdropStatus.get('currentStatus');
        },
        getAirdropTokenIssuer() {
          return tokenIssuer;
        },
        makeClaimInvitation() {
          assert(
            airdropStatus.get('currentStatus') === AIRDROP_STATES.OPEN,
            'Claim attempt failed.',
          );
          /**
           * @param {import('@agoric/ertp/src/types.js').Payment} payment
           */
          const claimHandler =
            payment =>
            /** @type {OfferHandler} */
            async (seat, offerArgs) => {
              const amount = await E(tokenIssuer).getAmountOf(payment);
              // TODO: add assertion checking whether users exists
              baggage
                .get('airdropStatusTracker')
                .init(offerArgs.walletAddress, amount);

              await depositToSeat(
                zcf,
                seat,
                { Payment: amount },
                { Payment: payment },
              );
              seat.exit();
              return createClaimSuccessMsg(amount);
            };
          return zcf.makeInvitation(
            claimHandler(this.facets.creator.createPayment(1000n)),
            'airdrop claim handler',
          );
        },
      },
    },
  );

  const { creator, claimer } = makeUnderlyingAirdropKit(
    airdropPurse,
    baggage.get('airdropStatusTracker'),
  );

  const cancelToken = cancelTokenMaker();
  await E(timer).setWakeup(
    baggage.get('startTime'),
    makeWaker('claimWindowOpenWaker', ({ absValue }) => {
      console.log('inside makeWaker:::', { absValue });
      stateMachine.transitionTo(OPEN);
    }),
    cancelToken,
  );

  stateMachine.transitionTo(PREPARED);

  return harden({
    creatorFacet: creator,
    publicFacet: claimer,
  });
};
harden(start);
