// @ts-check
/* global harden */
import '@agoric/zoe/exported.js';
import { provideAll } from '@agoric/zoe/src/contractSupport/durability.js';
import { M } from '@endo/patterns';
import { makeDurableZone } from '@agoric/zone/durable.js';
import { AmountMath } from '@agoric/ertp';
// import { AmountMath } from './start-memeTokenAirdrop';

/**
 * @type {ContractMeta}
 */
export const meta = {
  upgradability: 'canUpgrade',
  contractTermsShape: M.splitRecord({
    tokenName: M.string(),
    totalSupply: M.gte(0n),
  }),
  privateArgsShape: M.splitRecord({
    timerService: M.eref(M.remotable('TimerService')),
  }),
};

/**
 *
 * @typedef {object} ContractTerms
 * @property {import('@agoric/ertp/src/types').NatValue} totalSupply Total number of tokens to be minted by the contract.
 * @property {{ [keyword: string]: Brand }} brands
 * @property {{ [keyword: string]: Issuer }} issuers
 */

const start = async (zcf, privateArgs, baggage) => {
  const zone = makeDurableZone(baggage, 'mintZone');
  console.log('inside start!');
  const { tokenName, totalSupply } = zcf.getTerms();
  assert(tokenName, 'Contract must be given a tokenName property.');

  const { zcfMint } = await provideAll(baggage, {
    zcfMint: () => zcf.makeZCFMint(tokenName),
  });

  const { issuer, brand } = zcfMint.getIssuerRecord();

  console.group('---------- inside tokenMint Start Fn----------');
  console.log('------------------------');
  console.log('issuer::', issuer);
  console.log('------------------------');
  console.log('brand::', brand);
  console.log('------------------------');

  const mintSeat = zcfMint.mintGains({
    MemeToken: AmountMath.make(brand, totalSupply),
  });
  // const creatorFacet = Far('creatorFacet', {
  //   makeTokenMint: async (options = defaultOptions) =>
  //     await makeZCFMintFunction(zcf, options),
  // });
  console.log('------------------------');

  console.log('zone:::', { zone });
  console.log('------------------------');
  console.log('mintSeat::', mintSeat);
  console.groupEnd();
  const prepareMint = zone.exoClass(
    baggage,
    'ZCF Token Mint',
    undefined,
    () => ({
      tokenName,
    }),
    {
      mintTokens() {},
      getIssuer() {
        return issuer;
      },
    },
  );
  const creatorFacet = prepareMint();
  console.group('---------- inside tokenMint----------');
  console.log('------------------------');
  console.log('creatorFacet::', creatorFacet);
  console.log('------------------------');
  console.log('tokenName::', tokenName);
  console.log('------------------------');
  console.groupEnd();
  return harden({ creatorFacet });
};

harden(start);
export { start };
