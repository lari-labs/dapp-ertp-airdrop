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
import {
  fromOnly,
  toOnly,
  atomicRearrange,
  withdrawFromSeat,
} from '@agoric/zoe/src/contractSupport/index.js';
import { makeMarshal } from '@endo/marshal';
import { decodeBase64 } from '@endo/base64';
import { makeWaker, TimeIntervals } from './helpers/time.js';
import {
  handleFirstIncarnation,
  makeCancelTokenMaker,
} from './helpers/validation.js';
import { makeStateMachine } from './helpers/stateMachine.js';
import { createClaimSuccessMsg } from './helpers/messages.js';
import { objectToMap } from './helpers/objectTools.js';

const { keys, values } = Object;

const getLast = x => x.slice(x.length - 1);

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
  totalEpochs: M.bigint(),
  startTime: RelativeTimeRecordShape,
});

/** @type {ContractMeta} */
export const meta = {
  customTermsShape,
  privateArgsShape,
  upgradability: 'canUpgrade',
};

let issuerNumber = 1;

/**
 * @param {string} addr
 * @returns {ERef<DepositFacet>}
 */
const getDepositFacet = addr => {
  assert.typeof(addr, 'string');
  return E(namesByAddress).lookup(addr, 'depositFacet');
};

/**
 * @param {string} addr
 * @param {Payment} pmt
 */
const sendTo = (addr, pmt) => E(getDepositFacet(addr)).receive(pmt);

/**
 * @param zcf
 * @param {string} recipient
 * @param {Issuer[]} issuers
 */
const makeSendInvitation = (zcf, recipient, issuers) => {
  assert.typeof(recipient, 'string');
  mustMatch(issuers, M.arrayOf(IssuerShape));

  for (const i of issuers) {
    if (!Object.values(zcf.getTerms().issuers).includes(i)) {
      zcf.saveIssuer(i, `Issuer${(issuerNumber += 1)}`);
    }
  }

  /** @type {OfferHandler} */
  const handleSend = async seat => {
    const { give } = seat.getProposal();
    const depositFacet = await getDepositFacet(recipient);
    const payouts = await withdrawFromSeat(zcf, seat, give);

    // XXX partial failure? return payments?
    await Promise.all(
      values(payouts).map(pmtP =>
        E.when(pmtP, pmt => E(depositFacet).receive(pmt)),
      ),
    );
    seat.exit();
    return `sent ${keys(payouts).join(', ')}`;
  };

  return zcf.makeInvitation(handleSend, 'send');
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

const makeIndexedKeyVal = (value, index) => ({
  value,
  key: index,
});

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
  const { timer, TreeRemotable } = privateArgs;

  /** @type {ContractTerms} */
  const {
    startTime,
    epochLength,
    bonusSupply = 100_000n,
    baseSupply = 10_000_000n,
    tokenName = 'Tribbles',
    tiers,
  } = zcf.getTerms();
  const tokenMint = await zcf.makeZCFMint(tokenName)


    const { brand : tokenBrand, issuer: tokenIssuer } = await tokenMint.getIssuerRecord()

    const [baseAmount, bonusAmount] = [baseSupply, bonusSupply].map(x => AmountMath.make(tokenBrand, x))

    const primarySeat = tokenMint.mintGains(harden({ Payment: baseAmount }))
    const bonusSeat = (await tokenMint).mintGains({ Payment: bonusAmount })

    
    console.log('primarySeat:::',  primarySeat, primarySeat.getCurrentAllocation())
    console.log('bonusSeat:::', bonusSeat.getCurrentAllocation())

  const trace = label => value => {
    console.log(label, '::::', value);
    return value;
  };


  const getKeyFromBaggage = getKey(baggage);
  const setBaggageValue = setValue(baggage);

  const tiersStore = zone.mapStore('airdrop tiers');
  await objectToMap({ ...tiers, current: tiers[0] }, tiersStore);

  const claimedAccountsSets = [...keys(tiers)].map(x => zone.setStore(x));

  console.log({claimedAccountsSets, rep: [...keys(tiers)].map(x => zone.setStore(x))  })

  const [t0, handleProofVerification] = await Promise.all([
    E(timer).getCurrentTimestamp(),
    E(TreeRemotable).getVerificationFn(),
  ]);

  await objectToMap(
    {
      // exchange this for a purse created from ZCFMint
      currentEpoch: 0,
      currentTier: tiersStore.get('0'),
      airdropTiers: tiers,
      epochLength,
      TreeRemotable,
      tokenIssuer,
      startTime: createFutureTs(t0, startTime),
      claimedAccountsStore: zone.setStore('claimed accounts'),
      airdropStatusTracker: zone.mapStore('airdrop status'),
    },
    baggage,
  );

  const setters = ['currentEpoch'].map(setBaggageValue);

  const [setCurrentEpoch] = setters;

  const [airdropTiers, airdropStatus, claimedAccountsStore, currentEpochValue] =
    [
      'airdropTiers',
      'airdropStatusTracker',
      'claimedAccountsStore',
      'currentEpoch',
    ].map(getKeyFromBaggage);
  console.log('AIRDROPTIERS SET:::', tiersStore, {
    keys: [...tiersStore.keys()],
    values: [...tiersStore.values()],
  });

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
  const claimNumber = 0;

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
        getIssuer: M.call().returns(IssuerShape),

        getStatus: M.call().returns(M.string()),
      }),
    },
    /**
     * @param {Purse} tokenPurse
     * @param {CopySet} store
     * @param currentCancelToken
     */
    (store, currentCancelToken) => ({
      /** @type { object } */
      currentTier: baggage.get('currentTier'),
      currentCancelToken,
      currentEpochEndTime: 0n,
      // basePayout,
      // earlyClaimBonus: AmountMath.add(basePayout, 0n),
      claimedAccounts: store,
      currentEpoch: baggage.get('currentEpoch'),
    }),
    {
      helper: {
        getPayoutAmount(tier) {
          return AmountMath.make(
            tokenBrand,
            BigInt(tiersStore.get('current')[tier]),
          );
        },
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

      
          helper.updateDistributionMultiplier(
            TimeMath.addAbsRel(absTime, epochLength),
          );
        },
        async updateDistributionMultiplier(wakeTime) {
          console.log('WAKE TIME:::', { wakeTime})
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
                baggage.set('currentEpoch', baggage.get('currentEpoch') + 1);
                this.state.currentEpoch = baggage.get('currentEpoch');
                console.log(
                  'this.state.currentEpoch :::',
                  this.state.currentEpoch,
                );

                this.state.currentEpoch <= 0
                  ? tiersStore.get('current')
                  : tiersStore.set(
                      'current',
                      tiersStore.get(String(this.state.currentEpoch)),
                    );

                // debugger

                console.log('LATEST SET:::', tiersStore.get('current'));

                console.log({ latestTs });
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
        /**
         * @param {NatValue} x
         * @param amount
         */
        createPayment(x) {
          return AmountMath.make(tokenBrand, x)
        },
      },
      claimer: {
        getStatus() {
          // premptively exposing status for UI-related purposes.
          return airdropStatus.get('currentStatus');
        },
        getIssuer() {
          return tokenIssuer;
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
            /** @type {OfferHandler} */
            async (seat, offerArgs) => {
              const accountSetStore =
                claimedAccountsSets[this.state.currentEpoch];

              const {proof:proofRo, address, pubkey} = marshaller.fromCapData(offerArgs);
              // assert(address.length > 45, `Address exceeds maximum lenth`);

              // assert(mustMatch(
              //   harden(offerArgsInput),
              //   M.splitRecord({
              //     address: M.string({ stringLengthLimit: 45 }),
              //     pubkey: M.string(),
              //     proof: M.remotable(),
              //   }),
              // ));
              const claimantTier = pubkey.slice(pubkey.length - 1);

              console.log({ claimantTier });

              const proof = await E(proofRo).getProof();

          
              assert(
                !accountSetStore.has(address),
                `Allocation for address ${address} has already been claimed.`,
              );
              const paymentAmount = AmountMath.make(tokenBrand, BigInt(tiersStore.get('current')[claimantTier]));
              // const transferParts  = harden([
              //   [primarySeat, seat, {Payment:paymentAmount}], 
              //   [seat, primarySeat, {Payment:paymentAmount}], 
              // ]);
              const payout =  seat.incrementBy(primarySeat.decrementBy({ Payment: paymentAmount }));
              console.log('primarySeat', { primarySeat, current:payout })
              // atomicRearrange(zcf, harden(
              //   [
              //     fromOnly(primarySeat, { Payment: paymentAmount }),
              //     toOnly(seat, { Payment: paymentAmount })
              //   ]
              // ))

              accountSetStore.add(address, {
                amount: 0,
              });
              

              console.log('AFTER ADDING :::: ', {
                claimCount: claimNumber,
                keys: [...accountSetStore.keys()],
              });
              assert(
                handleProofVerification(proof, pubkey),
                `Failed to verify the existence of pubkey ${pubkey}.`,
              );

              console.log({paymentAmount})
           
              zcf.reallocate(primarySeat, seat)
              seat.exit();
              return createClaimSuccessMsg(paymentAmount);
            };
          return zcf.makeInvitation(claimHandler, 'airdrop claim handler');
        },
      },
    },
  );

  const cancelToken = cancelTokenMaker();
  const { creator, helper, claimer } = makeUnderlyingAirdropKit(
    baggage.get('airdropStatusTracker'),
    cancelToken,
  );

  console.log('START TIME', baggage.get('startTime'));
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
