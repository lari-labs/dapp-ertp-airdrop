import { M } from '@endo/patterns';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { E } from '@endo/eventual-send';
import { prepareOwnable } from '../../../../src/contractSupport/prepare-ownable.js';

/**
 * @param {ZCF} zcf
 * @param {{ count: bigint}} privateArgs
 * @param {import('@agoric/vat-data').Baggage} baggage
 */
export const start = async (zcf, privateArgs, baggage) => {
  const zone = makeDurableZone(baggage, 'rootZone');
  const { AirdropUtils } = zcf.getTerms();
  const [distributionSchedule, verify] = await Promise.all([
    E(AirdropUtils).getSchedule(),
    E(AirdropUtils).getVerificationFn(),
  ]);
  const { count: startCount = 0n, purse: airdropPurse } = privateArgs;
  assert.typeof(startCount, 'bigint');

  const makeUnderlyingAirdropKit = zone.exoClassKit(
    'OwnableAirdrop',
    {
      airdrop: M.interface(
        'OwnableAirdrop',
        {
          claim: M.call().returns(M.promise()),
          incr: M.call().returns(M.bigint()),
          // required by makePrepareOwnableClass
          getInvitationCustomDetails: M.call().returns(
            harden({
              count: M.bigint(),
            }),
          ),
          toBeAttenuated: M.call().returns(),
        },
        { sloppy: true },
      ),
      viewer: M.interface('ViewAirdrop', {
        view: M.call().returns(M.bigint()),
      }),
    },
    /**
     * @param {bigint} count
     * @param {Purse} tokenPurse
     * @param {Array} schedule
     */
    (count, tokenPurse, schedule) => ({
      count,
      distributionSchedule: harden({
        currentEpoch: 0,
        schedule,
      }),
      internalPurse: tokenPurse,
      claimedAccounts: zone.setStore('claimed users', { durable: true }),
    }),
    {
      airdrop: {
        claim() {
          /** @type {OfferHandler} */
          const claimHandler = async (seat, offerArgs) => {
            // TODO 
          };
          return zcf.makeInvitation(claimHandler, 'airdrop claim handler');
        },
        incr() {
          const {
            internalPurse,
            claimedAccounts,
            distributionSchedule: { schedule, currentEpoch },
          } = this.state;
          console.group('---------- inside incr----------');
          console.log('------------------------');
          console.log('this.state::', claimedAccounts);
          console.log('------------------------');
          console.log('this.distributionSchedule::', schedule);
          console.log('------------------------');
          console.log('this.distributionSchedule[0]::', schedule[currentEpoch]);
          console.log('------------------------');
          console.log(
            'this.state.purse.getCurrentAmount::',
            internalPurse.getCurrentAmount(),
          );
          console.log('------------------------');
          console.groupEnd();

          this.state.count += 1n;
          return this.state.count;
        },
        getInvitationCustomDetails() {
          const { count } = this.state;
          return harden({
            count,
          });
        },
        toBeAttenuated() {},
      },
      viewer: {
        view() {
          const { count } = this.state;
          return count;
        },
      },
    },
  );

  const makeOwnableAirdrop = prepareOwnable(
    zone,
    (...args) => zcf.makeInvitation(...args),
    'OwnableAirdrop',
    /** @type {const} */ (['claim', 'incr', 'getInvitationCustomDetails']),
  );

  const { airdrop: underlyingAirdrop, viewer } = makeUnderlyingAirdropKit(
    startCount,
    airdropPurse,
    distributionSchedule,
  );

  const ownableAirdrop = makeOwnableAirdrop(underlyingAirdrop);

  return harden({
    creatorFacet: ownableAirdrop,
    publicFacet: viewer,
  });
};
harden(start);
