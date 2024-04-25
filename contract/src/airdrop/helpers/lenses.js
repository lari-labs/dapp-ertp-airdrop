/* eslint-disable no-shadow */
/** @file utility library for working with lenses (composable getters/setters) */

const curry = (f, arity = f.length, ...args) =>
  arity <= args.length
    ? f(...args)
    : (...argz) => curry(f, arity, ...args, ...argz);

const always = a => b => a;

const compose =
  (...fns) =>
  args =>
    fns.reduceRight((x, f) => f(x), args);

const getFunctor = x =>
  harden({
    value: x,
    map: f => getFunctor(x),
  });

const setFunctor = x =>
  harden({
    value: x,
    map: f => setFunctor(f(x)),
  });

const prop = curry((k, obj) => (obj ? obj[k] : undefined));

const assoc = curry((k, v, obj) => ({ ...obj, [k]: v }));

const lens = curry(
  (getter, setter) => F => target =>
    F(getter(target)).map(focus => setter(focus, target)),
);

const lensProp = k => lens(prop(k), assoc(k));

const lensPath = path => compose(...path.map(lensProp));

const view = curry((lens, obj) => lens(getFunctor)(obj).value);

const over = curry((lens, f, obj) => lens(y => setFunctor(f(y)))(obj).value);

const set = curry((lens, val, obj) => over(lens, always(val), obj));

export { lensPath, view, set };
