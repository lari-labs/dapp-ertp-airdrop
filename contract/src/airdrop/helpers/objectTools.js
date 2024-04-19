// @ts-check
// @jessie-check

/** @import { ERef } from '@endo/eventual-send'; */

export const compose =
  (...fns) =>
  initialValue =>
    fns.reduceRight((acc, val) => val(acc), initialValue);

const { entries, fromEntries, keys } = Object;

/** @type { <T extends Record<string, ERef<any>>>(obj: T) => Promise<{ [K in keyof T]: Awaited<T[K]>}> } */
export const allValues = async obj => {
  // await keyword below leads to "Nested`await`s are not permitted in Jessiees lint jessie.js/no-nested-await"
  // is this "fine" because allValue is used to start contract and is not present in "every day operations".
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

// What is this type?
/** @type {<X, Y>(xs: X[], ys: Y[]) => [X, Y][]} */
export const zip = (xs, ys) => xs.map((x, i) => [x, ys[i]]);

// What is <T> ?
// head :: [x, ...xs] => x
/** @type {<T>(x: T[]) => T} */
const head = ([x, ...xs]) => x;

export const objectToMap = (obj, baggage) =>
  keys(obj).reduce((acc, val) => {
    acc.init(val, obj[val]);
    return acc;
  }, baggage);

export const assign = (a, c) => ({ ...a, ...c });
export const constructObject = (array = []) => array.reduce(assign, {});

export const pair = (a, b) => [b, a];
export const concatenate = (a, o) => ({ ...a, ...o });
