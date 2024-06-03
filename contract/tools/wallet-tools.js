// @ts-check
import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { allValues, mapValues } from '../src/objectTools.js';

export { allValues, mapValues };

const { values } = Object;

/**
 * @param {{
 *   zoe: ERef<ZoeService>;
 *   chainStorage: ERef<StorageNode>;
 *   namesByAddressAdmin: ERef<import('@agoric/vats').NameAdmin>;
 * }} powers
 *
 * @param issuerKeywordRecord
 * @typedef {import('@agoric/smart-wallet').OfferSpec} OfferSpec
 *
 * @typedef {Awaited<ReturnType<Awaited<ReturnType<typeof mockWalletFactory>['makeSmartWallet']>>>} MockWallet
 */
export const mockWalletFactory = (
  { zoe, namesByAddressAdmin },
  issuerKeywordRecord,
) => {
  const DEPOSIT_FACET_KEY = 'depositFacet';

  const { Fail, quote: q } = assert;

  //   const walletsNode = E(chainStorage).makeChildNode('wallet');

  // TODO: provideSmartWallet
  /** @param {string} address */
  const makeSmartWallet = async address => {
    console.group('------- makeSmartWallet ------');
    console.log('-----------------------------');
    console.log('address:::', address);
    const { nameAdmin: addressAdmin } = await E(
      namesByAddressAdmin,
    ).provideChild(address, [DEPOSIT_FACET_KEY]);
    console.log('-----------------------------');

    console.log('addressAdmin:::', addressAdmin);
    const entries = await Promise.all(
      values(issuerKeywordRecord).map(async issuer => {
        const purse = await E(issuer).makeEmptyPurse();
        const brand = await E(issuer).getBrand();
        /** @type {[Brand, Purse]} */
        const entry = [brand, purse];
        return entry;
      }),
    );
    const purseByBrand = new Map(entries);
    console.log('-----------------------------');

    console.log('walletEntries:::', entries);
    console.log('-----------------------------');

    console.groupEnd();
    const invitationBrand = await E(E(zoe).getInvitationIssuer()).getBrand();
    purseByBrand.has(invitationBrand) ||
      Fail`no invitation issuer / purse / brand`;
    const invitationPurse = purseByBrand.get(invitationBrand);
    assert(invitationPurse);

    const depositFacet = Far('DepositFacet', {
      /** @param {Payment} pmt */
      receive: async pmt => {
        const pBrand = await E(pmt).getAllegedBrand();
        if (!purseByBrand.has(pBrand))
          throw Error(`brand not known/supported: ${pBrand}`);
        const purse = purseByBrand.get(pBrand);
        assert(purse);
        return E(purse).deposit(pmt);
      },
    });
    await E(addressAdmin).default(DEPOSIT_FACET_KEY, depositFacet);

    /** @param {ERef<Issuer>} issuer */
    const addIssuer = async issuer => {
      const brand = await E(issuer).getBrand();
      if (purseByBrand.has(brand)) {
        throw Error(`brand already present`);
      }
      const purse = await E(issuer).makeEmptyPurse();
      purseByBrand.set(brand, purse);
    };

    // const updatesNode = E(walletsNode).makeChildNode(address);
    // const currentNode = E(updatesNode).makeChildNode('current');

    const getContractInvitation = invitationSpec => {
      console.log('inside getContractInvitation:::', invitationSpec);
      const {
        instance,
        publicInvitationMaker,
        invitationArgs = [],
      } = invitationSpec;
      const pf = E(zoe).getPublicFacet(instance);
      console.log('pf:::', pf);
      const result = E(pf)[publicInvitationMaker](...invitationArgs);
      console.log('E(pf)[publicInvitationMaker](...invitationArgs);', result);
      return result;
    };

    const getPurseInvitation = async invitationSpec => {
      console.log('inside getPurseInvitation:::', invitationSpec);

      //   const { instance, description } = invitationSpec;
      const invitationAmount = await E(invitationPurse).getCurrentAmount();
      console.log(
        '@@TODO: check invitation amount against instance',
        invitationAmount,
      );
      return E(invitationPurse).withdraw(invitationAmount);
    };

    const offerToInvitationMakers = new Map();

    const getContinuingInvitation = async spec => {
      console.log('inside getContinuingInvitation:::', spec);

      const { previousOffer, invitationMakerName, invitationArgs = [] } = spec;
      const makers =
        offerToInvitationMakers.get(previousOffer) ||
        Fail`${previousOffer} not found`;
      console.log('offerToInvitationMakers ###', {
        previousInvitationMakers: makers,
      });

      return E(makers)[invitationMakerName](...invitationArgs);
    };
    const seatById = new Map();
    const tryExit = id =>
      E(seatById.get(id) || Fail`${id} not found`).tryExit();

    const tracker = value => ({
      value,
      recordStep() {
        this.value += 1;
        console.group('  ####### tracker #########');
        console.log('recording step number:', this.value);
        console.log('###########################');
        console.groupEnd();
      },
      inspect() {
        `tracker(${value})`;
      },
    });
    /** @param {OfferSpec} offerSpec */
    async function* executeOffer(offerSpec) {
      const offerExeuctionTracker = tracker(0);
      offerExeuctionTracker.recordStep();
      console.group('---------- inside executeOffer -----------');
      console.log('----------------------------------------');
      console.log('offerSpec', offerSpec);
      console.log('----------------------------------------');
      const { invitationSpec, proposal = {}, offerArgs } = offerSpec;
      console.log('invitationSpec', invitationSpec);
      console.log('invitationSpec.source', invitationSpec.source);
      console.log('----------------------------------------');
      // Destructuring invitationSpec, proposal, offerArgs from offerSpec
      // Destructuring source from invitationSpec

      const { source } = invitationSpec;
      console.log('source ###', source);
      console.groupEnd();

      const getter =
        {
          contract: getContractInvitation,
          purse: getPurseInvitation,
          continuing: getContinuingInvitation,
        }[source] || Fail`unsupported source: ${source}`;
      console.log('getter::', { getter });
      const invitation = await getter(invitationSpec);
      offerExeuctionTracker.recordStep();

      console.log('inside executeOffer generator ########', {
        offerSpec,
        invitation,
        invitationDetails: await E(zoe)
          .getInvitationDetails(invitation)
          .then(res => ({ handle: res.handle, instance: res.instance })),
      });
      offerExeuctionTracker.recordStep();

      const pmts = await allValues(
        mapValues(proposal.give || {}, async amt => {
          console.log('inide mapValues ###', amt);
          const { brand } = amt;
          if (!purseByBrand.has(brand))
            throw Error(`brand not known/supported: ${brand}`);
          const purse = purseByBrand.get(brand);
          assert(purse);
          return E(purse).withdraw(amt);
        }),
      );
      console.log({ pmts });
      offerExeuctionTracker.recordStep();

      // XXX throwing here is unhandled somehow.
      const seat = await E(zoe).offer(invitation, proposal, pmts, offerArgs);

      console.log('seat.get(offerId)', seatById.get(offerSpec.id));
      seatById.set(offerSpec.id, seat);
      console.log(
        'seat.get(offerId) @@ after seat.set',
        seatById.get(offerSpec.id),
      );

      offerExeuctionTracker.recordStep();
      //   console.log(address, offerSpec.id, 'got seat');
      yield { updated: 'offerStatus', status: offerSpec };
      const result0 = await E(seat).getOfferResult();
      const result = typeof result0 === 'object' ? 'UNPUBLISHED' : result0;
      //   console.log(address, offerSpec.id, 'got result', result);
      yield { updated: 'offerStatus', status: { ...offerSpec, result } };
      if (typeof result0 === 'object' && 'invitationMakers' in result0) {
        offerToInvitationMakers.set(offerSpec.id, result0.invitationMakers);
        console.log(
          "(typeof result0 === 'object' && 'invitationMakers' in result0)",
        );
        console.log('offersMap::', offerToInvitationMakers.get(offerSpec.id));
      }
      const [payouts, numWantsSatisfied] = await Promise.all([
        E(seat).getPayouts(),
        E(seat).numWantsSatisfied(),
      ]);
      yield {
        updated: 'offerStatus',
        status: { ...offerSpec, result, numWantsSatisfied },
      };
      const amts = await allValues(
        mapValues(payouts, pmtP =>
          Promise.resolve(pmtP).then(pmt => depositFacet.receive(pmt)),
        ),
      );
      //   console.log(address, offerSpec.id, 'got payouts', amts);
      yield {
        updated: 'offerStatus',
        status: { ...offerSpec, result, numWantsSatisfied, payouts: amts },
      };
    }

    return {
      deposit: depositFacet,
      offers: Far('Offers', { executeOffer, addIssuer, tryExit }),
      peek: Far('Wallet Peek', {
        purseNotifier: brand =>
          E(
            purseByBrand.get(brand) || Fail`${q(brand)}`,
          ).getCurrentAmountNotifier(),
      }),
    };
  };

  return harden({ makeSmartWallet });
};

/**
 * Seat-like API from updates
 * @param {*} updates
 */
export const seatLike = updates => {
  console.log('inside seatLike:::', updates);
  const sync = {
    result: makePromiseKit(),
    payouts: makePromiseKit(),
  };
  (async () => {
    try {
      console.log('inside try...catch');
      console.log('current sync:::', sync);
      // XXX an error here is somehow and unhandled rejection
      for await (const update of updates) {
        if (update.updated !== 'offerStatus') continue;
        console.log('-------- for await (update of updates ) -------');
        const { result, payouts } = update.status;
        console.log('update.status', {
          status: update.status,
          update,
          statusCheck: Object.hasOwn(update.status, 'result'),
          payoutsCheck: Object.hasOwn(update.status, 'payouts'),
          resultIn: 'result' in update.status,
          payoutsIn: 'payouts' in update.status,
          syncResult: sync.result,
        });
        if ('result' in update.status) sync.result.resolve(result);
        if ('payouts' in update.status) sync.payouts.resolve(payouts);
      }
    } catch (reason) {
      sync.result.reject(reason);
      sync.payouts.reject(reason);
      throw reason;
    }
  })();
  return harden({
    getOfferResult: () => sync.result.promise,
    getPayouts: () => sync.payouts.promise,
  });
};

export const makeWalletFactory = async (
  { zoe, namesByAddressAdmin, chainStorage },
  issuers,
) => {
  const invitationIssuer = await E(zoe).getInvitationIssuer();
  const walletFactory = mockWalletFactory(
    { zoe, namesByAddressAdmin, chainStorage },
    { Invitation: invitationIssuer, ...issuers },
  );
  return walletFactory;
};
