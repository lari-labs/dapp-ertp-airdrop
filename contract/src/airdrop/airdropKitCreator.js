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
import { makeMarshal } from '@endo/marshal';
import { makeWaker, TimeIntervals } from './helpers/time.js';
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
/** @import { ContractMeta } from '../@types/zoe-contract-facet.js'; */
/** @import { Remotable } from '@endo/marshal' */

export const privateArgsShape = harden({
  TreeRemotable: M.remotable('Merkle Tree'),
  purse: PurseShape,
  bonusPurse: PurseShape,
  timer: TimerShape,
});

export const customTermsShape = harden({
  tiers: M.any(),
  startEpoch: M.bigint(),
  totalEpochs: M.bigint(),
  hash: M.opt(M.string()),
  startTime: RelativeTimeRecordShape,
  basePayoutQuantity: AmountShape,
});

/** @type {ContractMeta} */
export const meta = {
  customTermsShape,
  privateArgsShape,
  upgradability: 'canUpgrade',
};

const getKey = baggage => key => baggage.get(key);

const setValue = baggage => key => newValue => baggage.set(key, newValue);

/**
 * @param {TimestampRecord} sourceTs Base timestamp used to as the starting time which a new Timestamp will be created against.
 * @param {RelativeTimeRecordShape} inputTs Relative timestamp spanning the interval of time between sourceTs and the newly created timestamp
 */

const createFutureTs = (sourceTs, inputTs) =>
  TimeMath.absValue(sourceTs) + TimeMath.relValue(inputTs);

/**
 *
 * @typedef {object} ContractTerms
 * @property {bigint} totalEpochs Total number of epochs the airdrop campaign will last for.
 * @property {bigint} startTime Length of time (denoted in seconds) between the time in which the contract is started and the time at which users can begin claiming tokens.
 * @property {bigint} epochLength Length of time for each epoch, denominated in seconds.
 * @property {{ [keyword: string]: Brand }} brands
 * @property {{ [keyword: string]: Issuer }} issuers
 */

/**
 * @param {ZCF<ContractTerms>} zcf
 * @param {{ purse: Purse, bonusPurse: Purse, TreeRemotable: Remotable, timer: TimerService }} privateArgs
 * @param {Baggage} baggage
 */
export const start = async (zcf, privateArgs, baggage) => {
  handleFirstIncarnation(baggage, 'LifecycleIteration');
  // XXX why is type not inferred from makeDurableZone???
  /** @type { Zone } */
  const zone = makeDurableZone(baggage, 'rootZone');

  const marshaller = makeMarshal();
  const { purse: airdropPurse, bonusPurse, timer, TreeRemotable } = privateArgs;

  /** @type {ContractTerms} */
  const {
    startEpoch,
    totalEpochs,
    startTime,
    epochLength,
    brands: { Token: tokenBrand },
    issuers: { Token: tokenIssuer },
  } = zcf.getTerms();
  // const tokenMint = zcf.makeZCFMint(tokenName);

  const basePayout = AmountMath.make(tokenBrand, 1000n);

  const getKeyFromBaggage = getKey(baggage);
  const setBaggageValue = setValue(baggage);

  const [t0, handleProofVerification] = await Promise.all([
    E(timer).getCurrentTimestamp(),
    E(TreeRemotable).getVerificationFn(),
  ]);
  await objectToMap(
    {
      // exchange this for a purse created from ZCFMint
      currentEpoch: startEpoch,
      epochLength,
      totalEpochs,
      TreeRemotable,
      bonusPurse,
      purse: airdropPurse,
      tokenIssuer,
      startTime: createFutureTs(t0, startTime),
      claimedAccountsStore: zone.setStore('claimed accounts'),
      airdropStatusTracker: zone.mapStore('airdrop status'),
    },
    baggage,
  );

  const setters = ['currentEpoch'].map(setBaggageValue);

  const [setCurrentEpoch] = setters;

  const [airdropStatus, claimedAccountsStore, currentEpochValue] = [
    'airdropStatusTracker',
    'claimedAccountsStore',
    'currentEpoch',
  ].map(getKeyFromBaggage);

  console.log('AIRDROP STATUS', { airdropStatus, currentEpochValue });
  console.log('baggage::::', { keys: [...baggage.keys()] });
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
      helper: M.interface(
        'Helper',
        {
          // combineAmounts: M.call().returns(AmountShape),
          cancelTimer: M.call().returns(M.promise()),
          updateDistributionMultiplier: M.call(M.any()).returns(M.promise()),
          updateEpochDetails: M.call(M.any(), M.any()).returns(),
        },
        { sloppy: true },
      ),
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
    (tokenPurse, store, startEpoch) => ({
      /** @type { object } */
      currentCancelToken: null,
      currentEpochEndTime: 0n,
      // basePayout,
      // earlyClaimBonus: AmountMath.add(basePayout, 0n),
      internalPurse: tokenPurse,
      claimedAccounts: store,
      currentEpoch: baggage.get('currentEpoch'),
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
        /**
         * @param {TimestampRecord} absTime
         * @param {number} epochIdx
         */
        updateEpochDetails(absTime, epochIdx) {
          const {
            state: { currentEpoch, currentEpochEndTime },
          } = this;
          const { helper } = this.facets;

          console.log('inside updateEpochDetails', {
            absTime,
            epochIdx,
            currentEpoch,
          });

          assert(
            epochIdx < totalEpochs,
            `epochIdx ${epochIdx} is out of bounds`,
          );

          helper.updateDistributionMultiplier(
            TimeMath.addAbsRel(absTime, epochLength),
          );
        },
        async updateDistributionMultiplier(wakeTime) {
          const { facets } = this;
          // const epochDetails = newEpochDetails;

          this.state.currentCancelToken = cancelTokenMaker();

          void E(timer).setWakeup(
            wakeTime,
            makeWaker(
              'updateDistributionEpochWaker',
              /** @param {TimestampRecord} latestTs */
              ({ absValue: latestTs }) => {
                console.log('last epoch:::', {
                  latestTs,
                  currentE: this.state.currentEpoch,
                });
                console.log(
                  'current from baggage',
                  baggage.get('currentEpoch'),
                  [...baggage.keys(), [...baggage.values()]],
                );
                baggage.set('currentEpoch', baggage.get('currentEpoch') + 1n);
                this.state.currentEpoch += 1n;
                facets.helper.updateEpochDetails(
                  latestTs,
                  this.state.currentEpoch,
                );
              },
            ),
          );
          return 'wake up successfully set.';
        },
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
        async makeClaimInvitation() {
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

              const offerArgsInput = marshaller.fromCapData(offerArgs);

              const proof = await E(offerArgsInput.proof).getProof();

              assert(
                !claimedAccountsStore.has(offerArgsInput.address),
                `Allocation for address ${offerArgsInput.address} has already been claimed.`,
              );
              const getLast = x => x.slice(x.length - 1);

              const getTier = getLast(offerArgsInput.pubkey);
              console.log('TIER', getTier);
              claimedAccountsStore.add(offerArgsInput.address, {
                amount,
              });

              console.log('proof', { proof });
              assert(
                handleProofVerification(proof, offerArgsInput.pubkey),
                `Failed to verify the existence of pubkey ${offerArgsInput.pubkey}.`,
              );

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

  const { creator, helper, claimer } = makeUnderlyingAirdropKit(
    airdropPurse,
    baggage.get('airdropStatusTracker'),
    baggage.get('currentEpoch'),
  );

  console.log('START TIME', baggage.get('startTime'));
  const cancelToken = cancelTokenMaker();
  await E(timer).setWakeup(
    baggage.get('startTime'),
    makeWaker('claimWindowOpenWaker', ({ absValue }) => {
      console.log('inside makeWakerxxaa:::', { absValue });

      helper.updateEpochDetails(absValue, 0);

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
