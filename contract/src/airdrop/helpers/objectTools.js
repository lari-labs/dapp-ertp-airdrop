// @ts-check

/** @import { ERef } from '@endo/eventual-send'; */

const { entries, fromEntries } = Object;

/** @type { <T extends Record<string, ERef<any>>>(obj: T) => Promise<{ [K in keyof T]: Awaited<T[K]>}> } */
export const allValues = async obj => {
  const es = await Promise.all(
    entries(obj).map(async ([k, v]) => [k, await v]),
  );
  return fromEntries(es);
};

/** @type { <V, U, T extends Record<string, V>>(obj: T, f: (v: V) => U) => { [K in keyof T]: U }} */
export const mapValues = (obj, f) =>
  fromEntries(
    entries(obj).map(([p, v]) => {
      const entry = [p, f(v)];
      return entry;
    }),
  );

/** @type {<X, Y>(xs: X[], ys: Y[]) => [X, Y][]} */
export const zip = (xs, ys) => xs.map((x, i) => [x, ys[i]]);

/** @type {<T>(x: T[]) => T} */
const head = ([x, ...xs]) => x;

const composeM =
  method =>
  (...ms) =>
    ms.reduce((f, g) => x => g(x)[method](f));

/** @type { <O extends { windowLength: unknown }>(o: O[]) => O['windowLength'] } */
const getWindowLength = x => head(x).windowLength;
/** @type { <O extends { tokenQuantity: unknown }>(o: O[]) => O['tokenQuantity'] } */
const getTokenQuantity = x => head(x).tokenQuantity;

export { getWindowLength, getTokenQuantity, head };
