// @ts-check
import { makeIssuerKit, AmountMath } from '@agoric/ertp';
import { makeScalarMapStore } from '@agoric/store';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import { makeZoeForTest } from '@agoric/zoe/tools/setup-zoe.js';

/** @import { Amount, AssetKind, AssetValueForKind, Brand, IssuerKit } from '@agoric/ertp/src/types.js'; */
/** @import { MapStore } from '@agoric/store'; */

export const setup = () => {
  // XXX why don't we infer the return type of makeIssuerKit???
  /** @type { IssuerKit<'nat'>} */
  const memeKit = makeIssuerKit('memes');

  /** @type { IssuerKit<'nat'>} */
  const moolaKit = makeIssuerKit('moola');
  /** @type { IssuerKit<'nat'>} */
  const simoleanKit = makeIssuerKit('simoleans');
  /** @type { IssuerKit<'nat'>} */
  const bucksKit = makeIssuerKit('bucks');
  const allIssuerKits = {
    memes: memeKit,
    moola: moolaKit,
    simoleans: simoleanKit,
    bucks: bucksKit,
  };
  /** @type {MapStore<string, Brand<'nat'>>} */
  const brands = makeScalarMapStore('brandName');

  for (const [k, brand] of Object.entries(allIssuerKits)) {
    brands.init(k, brand);
  }

  const { admin: fakeVatAdmin, vatAdminState } = makeFakeVatAdmin();
  const zoe = makeZoeForTest(fakeVatAdmin);

  /** @type {<K extends AssetKind>(brand: Brand<K>) => (value: AssetValueForKind<K>) => Amount<K>} */
  const makeSimpleMake = brand => value => AmountMath.make(brand, value);

  const result = {
    memeIssuer: memeKit.issuer,
    memeMint: memeKit.mint,
    memeKit,
    moolaIssuer: moolaKit.issuer,
    moolaMint: moolaKit.mint,
    moolaKit,
    simoleanIssuer: simoleanKit.issuer,
    simoleanMint: simoleanKit.mint,
    simoleanKit,
    bucksIssuer: bucksKit.issuer,
    bucksMint: bucksKit.mint,
    bucksKit,
    brands,
    memes: makeSimpleMake(memeKit.brand),
    moola: makeSimpleMake(moolaKit.brand),
    simoleans: makeSimpleMake(simoleanKit.brand),
    bucks: makeSimpleMake(bucksKit.brand),
    zoe,
    vatAdminState,
  };
  harden(result);
  return result;
};
harden(setup);
