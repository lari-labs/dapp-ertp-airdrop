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
import { TimerShape } from '@agoric/zoe/src/typeGuards';
import { depositToSeat } from '@agoric/zoe/src/contractSupport/zoeHelpers.js';
import { makeWaker } from './helpers/time.js';
import {
  handleFirstIncarnation,
  makeCancelTokenMaker,
} from './helpers/validation.js';
import { makeStateMachine } from './helpers/stateMachine.js';
import { createClaimSuccessMsg } from './helpers/messages.js';
import { getTokenQuantity } from './helpers/objectTools.js';

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
/** @import { Brand, Issuer, Purse } from '@agoric/ertp/src/types.js'; */
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
  schedule: M.array(),
  basePayoutQuantity: AmountShape,
});

/** @type {ContractMeta} */
export const meta = {
  customTermsShape,
  privateArgsShape,
  upgradability: 'canUpgrade',
};

const createFutureTs = (sourceTs, input) =>
  TimeMath.absValue(sourceTs) + TimeMath.relValue(input);

/**
 *
 * @typedef {object} ContractTerms
 * @property {object} states Object holding each possible airdrop state. Properties that exisit within this object help mitigate states being misspelled used when transitioning between states.
 * @property {bigint} startTime Length of time (denoted in seconds) between the time in which the contract is started and the time at which users can begin claiming tokens.
 * @property {string} initialState the state in which the contract's stateMachine will begin in.
 * @property {Array} stateTransitions An array of arrays specifying all possibile state transitions that may occur within the contract's state machine. This value is passed into makeStateMachine a
 * @property {EpochDetails[]} schedule
 * @property {bigint} basePayoutQuantity
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
    schedule: distributionSchedule,
    basePayoutQuantity,
    brands: { Token: tokenBrand },
    issuers: { Token: tokenIssuer },
  } = zcf.getTerms();

  const t0 = await E(timer).getCurrentTimestamp();
  if (!baggage.startTime) {
    baggage.init('startTime', createFutureTs(t0, startTime));
  }
  const claimedAccountsStore = zone.setStore('claimed users');
  // TODO: Inquire about handling state machine operations using a `Map` or `Set` from the Zone API.
  const contractStateStore = zone.setStore('contract status');

  const stateMachine = makeStateMachine(INITIALIZED, [
    [INITIALIZED, [PREPARED]],
    [PREPARED, [OPEN]],
    [OPEN, [EXPIRED, RESTARTING]],
    [RESTARTING, [OPEN]],
    [EXPIRED, []],
  ]);

  const makeUnderlyingAirdropKit = zone.exoClassKit(
    'Airdrop Campaign',
    {
      helper: M.interface('Helper', {
        combineAmounts: M.call().returns(AmountShape),
        cancelTimer: M.call().returns(M.promise()),
        updateDistributionMultiplier: M.call(M.any()).returns(M.promise()),
        updateEpochDetails: M.call(M.any(), M.any()).returns(),
      }),
      creator: M.interface('Creator', {
        createPayment: M.call().returns(M.any()),
      }),
      claimer: M.interface('Claimer', {
        claim: M.call().returns(M.promise()),
        getAirdropTokenIssuer: M.call().returns(IssuerShape),
        getStatus: M.call().returns(M.string()),
      }),
    },
    /**
     * @param {Purse} tokenPurse
     * @param {EpochDetails[]} schedule
     * @param {CopySet} store
     */
    (tokenPurse, schedule, store) => ({
      /** @type { object } */
      currentCancelToken: null,
      currentEpoch: 0,
      distributionSchedule: schedule,
      currentEpochEndTime: 0n,
      basePayout: basePayoutQuantity,
      earlyClaimBonus: getTokenQuantity(schedule),
      internalPurse: tokenPurse,
      claimedAccounts: store,
    }),
    {
      helper: {
        combineAmounts() {
          const { earlyClaimBonus, basePayout } = this.state;
          mustMatch(
            earlyClaimBonus,
            AmountShape,
            'earlyClaimBonus must be an amount.',
          );
          mustMatch(basePayout, AmountShape, 'basePayout must be an amount.');

          return AmountMath.add(earlyClaimBonus, basePayout);
        },
        async cancelTimer() {
          await E(timer).cancel(this.state.currentCancelToken);
        },
        /**
         * @param {TimestampRecord} absTime
         * @param {number} epochIdx
         */
        updateEpochDetails(absTime, epochIdx) {
          const { state } = this;
          const { helper } = this.facets;
          assert(
            epochIdx < state.distributionSchedule.length,
            `epochIdx ${epochIdx} is out of bounds`,
          );
          const newEpochDetails = state.distributionSchedule[epochIdx];

          state.currentEpochEndTime = TimeMath.addAbsRel(
            absTime,
            newEpochDetails.windowLength,
          );
          state.earlyClaimBonus = newEpochDetails.tokenQuantity;

          helper.updateDistributionMultiplier(newEpochDetails);
        },
        async updateDistributionMultiplier(newEpochDetails) {
          const { facets } = this;
          const epochDetails = newEpochDetails;

          const { absValue } = await E(timer).getCurrentTimestamp();
          this.state.currentCancelToken = cancelTokenMaker();

          void E(timer).setWakeup(
            TimeMath.absValue(absValue + epochDetails.windowLength),
            makeWaker(
              'updateDistributionEpochWaker',
              /** @param {TimestampRecord} latestTs */
              latestTs => {
                this.state.currentEpoch += 1;
                facets.helper.updateEpochDetails(
                  latestTs,
                  this.state.currentEpoch,
                );
              },
            ),
          );
          return 'wake up successfully set.';
        },
      },
      creator: {
        createPayment() {
          return this.state.internalPurse.withdraw(
            this.facets.helper.combineAmounts(),
          );
        },
      },
      claimer: {
        getStatus() {
          // premptively exposing status for UI-related purposes.
          return stateMachine.getStatus();
        },
        getAirdropTokenIssuer() {
          return tokenIssuer;
        },
        claim() {
          assert(
            stateMachine.getStatus() === AIRDROP_STATES.OPEN,
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
            claimHandler(this.facets.creator.createPayment()),
            'airdrop claim handler',
          );
        },
      },
    },
  );

  const {
    creator,
    claimer,
    helper: helperFacet,
  } = makeUnderlyingAirdropKit(
    airdropPurse,
    distributionSchedule,
    claimedAccountsStore,
  );

  const cancelToken = cancelTokenMaker();
  // transition from the "initial" state to "prepared" state following
  await E(timer).setWakeup(
    baggage.get('startTime'),
    makeWaker('claimWindowOpenWaker', ({ absValue }) => {
      stateMachine.transitionTo(OPEN);
      helperFacet.updateEpochDetails(absValue, 0);
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
