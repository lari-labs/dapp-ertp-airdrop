import { M } from '@endo/patterns';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { E } from '@endo/far';
import { Far } from '@endo/marshal';
import { AmountMath, IssuerShape, PurseShape } from '@agoric/ertp';
import { isNat } from '@endo/nat';
import { TimeMath } from '@agoric/time';
import '@agoric/ertp/src/types.js';
import '@agoric/zoe/exported.js';
import './types.js'
import { TimerShape } from '@agoric/zoe/src/typeGuards';
import { makeStateMachine } from '@agoric/zoe/src/contractSupport/stateMachine.js';
import { makeWaker } from './helpers/time.js';
import { makeCancelTokenMaker, startupAssertion } from './helpers/validation.js';
import { Nat } from './adts/index.js';

export const privateArgsShape = harden({
  purse: PurseShape,
  timer: TimerShape
})

/**
 *
 * @typedef {object} ContractTerms
 * @property {import('@endo/marshal').RemotableObject} AirdropUtils
 * @property {bigint} startTime
 * @property {bigint} basePayoutQuantity
 * @property {{Keyword<Brand>}} brands
 * @property {{Keyword<issuer>}} issuers
 */

/**
 * @param {ZCF} zcf
 * @param {{ purse: Purse, timer: import('@agoric/swingset-vat/tools/manual-timer.js').TimerService,}} privateArgs
 * @param {import('@agoric/vat-data').Baggage} baggage
 */
export const start = async (zcf, privateArgs, baggage) => {
  const zone = makeDurableZone(baggage, 'rootZone');

  const terms = zcf.getTerms();

  /** @type {ContractTerms} */
  const {
    AirdropUtils,
    startTime,
    initialState,
    stateTransitions,
    states,
    schedule: distributionSchedule,
    basePayoutQuantity,
    issuers: { Token: tokenIssuer },
  } = terms;

  const createAmount = x => AmountMath.make(tokenIssuer.getBrand(), x);

  assert(startTime > 0n, 'startTime must be a BigInt larger than 0n.');
  const claimedAccountsStore = zone.setStore('claimed users'); const contractStateStore = zone.setStore('contract status');
  
  const stateMachine = makeStateMachine(initialState, stateTransitions)
  console.log('StateMachine:::', { states, stateMachine, stateTransitions, status: stateMachine.getStatus()})
  const cancelTokenMaker = makeCancelTokenMaker('airdrop-campaign');
  stateMachine.transitionTo(states.PREPARED);
  console.log({ stateMachine, stateTransitions });
  const { purse: airdropPurse, timer } = privateArgs;
  startupAssertion(airdropPurse, 'privateArgs.purse');
  startupAssertion(timer, 'privateArgs.timer');

  const makeUnderlyingAirdropKit = zone.exoClassKit(
    'Airdrop Campaign',
    {
      helper: M.interface('Helper', {
        combineNaturalNumbers: M.call().returns(M.nat()),
        cancelTimer: M.call().returns(M.promise()),
        getDistributionEpochDetails: M.call().returns(M.record()),
        updateDistributionMultiplier: M.call(M.any()).returns(M.promise()),
        updateEpochDetails: M.call(M.any(), M.any()).returns(),
      }),
      creator: M.interface('Creator', {
        createPayment: M.call().returns(M.any()),
        prepareAirdropCampaign: M.call().returns(M.promise()),
      }),
      claimer: M.interface('Claimer', {
        claim: M.call().returns(M.promise()),
        getAirdropTokenIssuer: M.call().returns(IssuerShape),
        getStatus: M.call().returns(M.string()),
      }),
    },
    /**
     * @param {import('@agoric/ertp/src/types.js').Purse} tokenPurse
     * @param {[EpochDetails]} schedule
     * @param {import('@endo/marshal').RemotableObject} dsm
     * @param {import('@endo/patterns').CopySet} store
     */
    (tokenPurse, schedule, dsm, store) => ({
      currentCancelToken: null,
      currentEpoch: 0,
      distributionSchedule: schedule,
      currentEpochEndTime: 0n,
      basePayout: basePayoutQuantity,
      earlyClaimBonus: schedule[0].tokenQuantity,
      internalPurse: tokenPurse,
      claimedAccounts: store
    }),
    {
      helper: {
        combineNaturalNumbers() {
          const { earlyClaimBonus, basePayout } = this.state;
          assert(
            isNat(earlyClaimBonus),
            'earlyClaimBonus must be a natural number.',
          );
          assert(
            isNat(basePayout),
            'basePayout must be a natural number.',
          );
          return Nat(earlyClaimBonus).concat(Nat(basePayout)).value
        },
        async cancelTimer() {
          await E(timer).cancel(this.state.currentCancelToken);
        },
        getDistributionEpochDetails() {
          return this.state.distributionSchedule[this.state.currentEpoch];
        },
        updateEpochDetails(absTime, epochIdx) {
          const newEpochDetails = this.state.distributionSchedule[epochIdx];

          this.state.currentEpochEndTime =
            absTime + newEpochDetails.windowLength;

          this.state.earlyClaimBonus =
            this.facets.helper.getDistributionEpochDetails().tokenQuantity;

          this.facets.helper.updateDistributionMultiplier(newEpochDetails);
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
              ({ absValue: latestTsValue }) => {
                this.state.currentEpoch += 1;
                facets.helper.updateEpochDetails(
                  latestTsValue,
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
            createAmount(this.facets.helper.combineNaturalNumbers()),
          );
        },
        async prepareAirdropCampaign() {
          this.state.currentCancelToken = cancelTokenMaker();
          const {
            facets
          } = this;
          console.groupEnd();
          await E(timer).setWakeup(
            TimeMath.absValue(startTime),
            makeWaker('claimWindowOpenWaker', ({ absValue }) => {
              stateMachine.transitionTo(states.OPEN);
              facets.helper.updateEpochDetails(
                absValue,
                this.state.currentEpoch,
              );
            }),
            this.state.cancelToken,
          );
        },
      },
      claimer: {
        getStatus() {
          return stateMachine.getStatus();
        },
        getAirdropTokenIssuer() {
          const { count } = this.state;
          return count;
        },
        claim() {
          assert(
            this.facets.claimer.getStatus() ===  states.OPEN,
            'Claim attempt failed.',
          );
          const airdropPayment = this.facets.creator.createPayment();

          /**
           * @param payment
           */
          const claimHandler =
            payment =>
              /**
               * @param {UserSeat} seat
               * @param offerArgs
               */
              async (seat, offerArgs) => {
                // const payoutPurse = createPurse(tokenIssuer);

                // payoutPurse.deposit(payment);

                seat.exit();
                return harden({
                  message: 'Here is your payout purse - enjoy!',
                  airdrop: payment,
                });
              };
          return zcf.makeInvitation(
            claimHandler(airdropPayment),
            'airdrop claim handler',
          );
        },
      },
    },
  );

  const { creator, claimer } = makeUnderlyingAirdropKit(
    airdropPurse,
    distributionSchedule,
    stateMachine,
    claimedAccountsStore,
  );

  return harden({
    creatorFacet: creator,
    publicFacet: claimer,
  });
};
harden(start);
