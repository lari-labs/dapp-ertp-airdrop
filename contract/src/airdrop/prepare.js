import { M } from '@endo/patterns';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { E } from '@endo/far';
import { Far } from '@endo/marshal';
import { AmountMath } from '@agoric/ertp';
import { TimeMath, TimestampShape } from '@agoric/time';
import '../../types.js'

/**
 * @typedef {object} EpochDetails
 * @property {bigint} windowLength Length of epoch in seconds. This value is used by the contract's timerService to schedule a wake up that will fire once all of the seconds in an epoch have elapsed
 * @property {bigint} earlyClaimBonus The total number of tokens recieved by each user who claims during a particular epoch.
 * @property {bigint} index The index of a particular epoch.
 * @property {number} inDays Length of epoch formatted in total number of days
 */

const startupAssertion = (arg, keyName) =>
  assert(
    arg,
    `Contract has been started without required property: ${keyName}.`,
  );

const makeWaker = (name, func) => {
  return Far(name, {
    wake: timestamp => func(timestamp),
  });
};

// const createWakeup = async (timer, wakeUpTime, timeWaker, cancelTokenMaker) => {
//   const cancelToken = cancelTokenMaker();
//   await E(timer).setWakeup(wakeUpTime, timeWaker, cancelToken);
// };
const makeCancelTokenMaker = name => {
  let tokenCount = 1;

  return () => Far(`cancelToken-${name}-${(tokenCount += 1)}`, {});
};

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
    basePayoutQuantity,
    brands: { Token: tokenBrand },
    issuers: { Token: tokenIssuer },
  } = terms;

  const createAmount = x => AmountMath.make(tokenBrand, x);

  assert(startTime > 0n, 'startTime must be a BigInt larger than 0n.');
  const claimedAccountsStore = zone.setStore('claimed users', {
    durable: true,
  });
  const [{ stateMachine, states }, distributionSchedule, verify] =
    await Promise.all([
      E(AirdropUtils).getStateMachine(),
      E(AirdropUtils).getSchedule(),
      E(AirdropUtils).getVerificationFn(),
    ]);

  const cancelTokenMaker = makeCancelTokenMaker('airdrop-campaign');
  await stateMachine.transitionTo(states.PREPARED);
  console.log({ stateMachine, states });
  const { purse: airdropPurse, timer } = privateArgs;
  startupAssertion(airdropPurse, 'privateArgs.purse');
  startupAssertion(timer, 'privateArgs.timer');

  const makeUnderlyingAirdropKit = zone.exoClassKit(
    'Airdrop Campaign',
    {
      helper: M.interface('Helper', {
        makeAmountForClaimer: M.call().returns(M.any()),
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
        view: M.call().returns(M.bigint()),
        getStatus: M.call().returns(M.string()),
      }),
    },
    /**
     * @param {Purse} tokenPurse
     * @param {Array} schedule
     * @param stateMachine
     * @param dsm
     * @param store
     */
    (tokenPurse, schedule, dsm, store) => ({
      currentCancelToken: null,
      currentEpoch: 0,
      distributionSchedule: schedule,
      currentEpochEndTime: 0n,
      basePayout: basePayoutQuantity,
      earlyClaimBonus: schedule[0].tokenQuantity,
      internalPurse: tokenPurse,
      claimedAccounts: store,
      dsm: Far('state machine', {
        getStatus() {
          return dsm.getStatus();
        },
        transitionTo(state) {
          return dsm.transitionTo(state);
        },
      }),
    }),
    {
      helper: {
        makeAmountForClaimer() {
          const { earlyClaimBonus, basePayout } = this.state;

          return createAmount(earlyClaimBonus + basePayout);
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
          const {
            facets,
          } = this;
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
            this.facets.helper.makeAmountForClaimer(),
          );
        },
        async prepareAirdropCampaign() {
      
          this.state.currentCancelToken = cancelTokenMaker();
          const {
            facets,
            state: {
              dsm: { transitionTo },
            },
          } = this;
          console.groupEnd();
          await E(timer).setWakeup(
            TimeMath.absValue(startTime),
            makeWaker('claimWindowOpenWaker', ({ absValue }) => {
              transitionTo(states.OPEN);
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
          return this.state.dsm.getStatus();
        },
        view() {
          const { count } = this.state;
          return count;
        },
        claim() {
          assert(
            this.facets.claimer.getStatus() === states.OPEN,
            'Claim attempt failed.',
          );
          const airdropPayment = this.facets.creator.createPayment();

          /**
           * @param payment
           */
          const claimHandler = payment => 
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
