/* eslint-disable no-shadow */
/** @file utility library for working with lenses (composable getters/setters) */
const accounts = [
  {
    tier: 1,
    name: 'tg-oracle',
    type: 'local',
    address: 'agoric1we6knu9ukr8szlrmd3229jlmengng9j68zd355',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'AiFAg1ZqtHo7WoheNUAJEScqSLuQCiv7umfToaNjaEv1',
    },
  },
  {
    tier: 2,
    name: 'tg-test',
    type: 'local',
    address: 'agoric1d3pmtdzem9a8fqe8vkfswdwnuy9hcwjmhlh4zz',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'A5A20phWctpT88lD+jbXxdA06llfvXd0aq3BnkRozDg8',
    },
  },
  {
    tier: 1,
    name: 'tgrex',
    type: 'local',
    address: 'agoric1zqhk63e5maeqjv4rgcl7lk2gdghqq5w60hhhdm',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'AybVHbbXgexk5dz+RWfch+2a1rCS5IYl5vSJF9l/qE48',
    },
  },
  {
    tier: 3,
    name: 'u1',
    type: 'local',
    address: 'agoric1p2aqakv3ulz4qfy2nut86j9gx0dx0yw09h96md',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'Anc5HuzkD5coFkPWAgC87lGbfC+SdzCPwRpOajFrGYSZ',
    },
  },
  {
    tier: 3,
    name: 'user1',
    type: 'local',
    address: 'agoric1xe269y3fhye8nrlduf826wgn499y6wmnv32tw5',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'A4owcrbL34M4lCDua/zhpampsPRJHu5zKp9gc/u8c1YH',
    },
  },
  {
    tier: 4,
    name: 'user2local',
    type: 'local',
    address: 'agoric1ahsjklvps67a0y7wj0hqs0ekp55hxayppdw5az',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'Anqep1Y/ZxRDMbiZ3ng03JmX3qyTl77x4OnXylI7w46b',
    },
  },
  {
    tier: 1,
    name: 'victor-da-best',
    type: 'local',
    address: 'agoric1vzqqm5dfdhlxh6n3pgkyp5z5thljklq3l02kug',
    pubkey: {
      type: '/cosmos.crypto.secp256k1.PubKey',
      key: 'A+Si8+03Q85NQUAsvhW999q8Xw0fON08k3i6iZXg3S7/',
    },
  },
];

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

const pubkeyLens = lensProp('pubkey');
accounts.map(x => view(pubkeyLens, x));

export { lensPath, view, set };
