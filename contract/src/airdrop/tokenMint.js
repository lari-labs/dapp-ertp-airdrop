// @ts-check
/* global harden */
import '@agoric/zoe/exported.js';
import { provideAll } from '@agoric/zoe/src/contractSupport/durability.js';
import { M } from '@endo/patterns';
import { prepareExoClass, provide } from '@agoric/vat-data';

/**
 * @type {ContractMeta}
 */
export const meta = {
  upgradability: 'canUpgrade',
  privateArgsShape: M.splitRecord({
    timerService: M.eref(M.remotable('TimerService')),
    powers: {
      storageNode: M.remotable('StorageNode'),
      marshaller: M.remotable('Marshaller'),
    },
  }),
};

const start = async (zcf, _, baggage) => {
  const { tokenName } = zcf.getTerms();
  assert(tokenName, 'Contract must be given a tokenName property.');

  const { zcfMint } = await provideAll(baggage, {
    zcfMint: () => zcf.makeZCFMint(tokenName),
  });

  const { issuer } = zcfMint.getIssuerRecord();
  // const creatorFacet = Far('creatorFacet', {
  //   makeTokenMint: async (options = defaultOptions) =>
  //     await makeZCFMintFunction(zcf, options),
  // });

  prepareExoClass(
    baggage,
    'ZCF Token Mint',
    undefined,
    () => ({
      tokenName,
    }),
    {
      getIssuer() {
        return issuer;
      },
    },
  );
  const creatorFacet = provide(baggage, 'ERTP Mint', () =>
    zcf.makeZCFMint(zcf.getTerms().tokenName),
  );
  return harden({ creatorFacet });
};

harden(start);
export { start };
