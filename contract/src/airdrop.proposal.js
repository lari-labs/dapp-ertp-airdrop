// @ts-check
import { E } from '@endo/far';
import { installContract, startContract } from './airdrop/airdrop.coreEval.js';
import { TimeIntervals } from './airdrop/helpers/time.js';
import { allValues } from './objectTools.js';

const { Fail } = assert;

const contractName = 'airdrop';

/**
 * Core eval script to start contract
 *
 * @param {BootstrapPowers } permittedPowers
 * @param {*} config
 *
 * @typedef {{
 *   brand: PromiseSpaceOf<{ Ticket: Brand }>;
 *   issuer: PromiseSpaceOf<{ Ticket: Issuer }>;
 *   instance: PromiseSpaceOf<{ sellConcertTickets: Instance }>
 * }} StartAirdropCampaign
 */
export const startAirdropCampaignContract = async (permittedPowers, config) => {
  console.log('core eval for', contractName);
  const {
    // must be supplied by caller or template-replaced
    bundleID = Fail`no bundleID`,
  } = config?.options?.[contractName] ?? {};

  const installation = await installContract(permittedPowers, {
    name: contractName,
    bundleID,
  });

  const ist = await allValues({
    brand: permittedPowers.brand.consume.IST,
    issuer: permittedPowers.issuer.consume.IST,
  });

  const timer = await permittedPowers.consume.chainTimerService;

  const timerBrand = await E(timer).getTimerBrand();
  const startTime = harden({
    timerBrand,
    relValue: TimeIntervals.SECONDS.ONE_DAY,
  });
  const endTime = harden({
    timerBrand,
    relValue: TimeIntervals.SECONDS.ONE_DAY * 7n,
  });

  console.log('FIXME: ZCFMint is probably better than mintHolder');
  const { zoe, agoricNames } = permittedPowers.consume;
  const { publicFacet: tokenIssuer } = await E(zoe).startInstance(
    E(agoricNames).lookup('installation', 'mintHolder'),
    undefined,
    { keyword: 'FIXME' },
  );

  await startContract(permittedPowers, {
    name: contractName,
    startArgs: {
      installation,
      issuerKeywordRecord: {
        Price: ist.issuer,
        Token: tokenIssuer, // FIXME
      },
      terms: {
        startTime,
        endTime,
      },
      privateArgs: {
        timer,
        // TODO: think about this approach....
        purse: await E(ist.issuer).makeEmptyPurse(),
      },
    },
  });

  console.log(contractName, '(re)started');
};

/** @type { import("@agoric/vats/src/core/lib-boot").BootstrapManifestPermit } */
export const permit = harden({
  consume: {
    chainTimerService: true,
    agoricNames: true,
    brandAuxPublisher: true,
    startUpgradable: true, // to start contract and save adminFacet
    zoe: true, // to get contract terms, including issuer/brand
  },
  installation: {
    consume: { [contractName]: true },
    produce: { [contractName]: true },
  },
  instance: { produce: { [contractName]: true } },
  issuer: { consume: { IST: true } },
  brand: { consume: { IST: true } },
});

export const main = startAirdropCampaignContract;
