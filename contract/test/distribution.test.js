// @ts-check
// eslint-disable-next-line import/order
import crypto from 'crypto';
import { test as anyTest } from './airdropData/prepare-test-env-ava.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

// Helper function to create a hash
const hash = x => crypto.createHash('sha256').update(x).digest('hex');

// Compose function
const compose =
  (...fns) =>
  initialValue =>
    fns.reduceRight((acc, val) => val(acc), initialValue);

// Monoid Factory for All
const All = x => ({
  x,
  concat: ({ x: y }) => All(x && y),
});
All.empty = () => All(true);

// Monoid Factory for Or
const Or = x => ({
  x,
  concat: ({ x: y }) => Or(x || y),
});
Or.empty = () => Or(false);

// Maybe Monad Implementation
const Just = x => ({
  map: f => Just(f(x)),
  fold: (_, g) => g(x),
  isNothing: false,
});

const Nothing = () => ({
  map: _ => Nothing(),
  fold: (f, _) => f(),
  isNothing: true,
});

const Maybe = x => (x != null ? Just(x) : Nothing());

// Coyoneda Monad Implementation
const Coyoneda = (k, x) => ({
  map: f => Coyoneda(x => f(k(x)), x),
  run: F => F.map(k).ap(F.of(x)),
  inspect: () => `Coyoneda(${k}, ${x})`,
});

Coyoneda.lift = F => F.map(x => Coyoneda(x => x, x)).extract();

// Utilizing Coyoneda and Maybe Monads
const decayConstant = Math.log(2) / 24;
const continuousDecay = initialAllocation => t =>
  Maybe(initialAllocation)
    .map(a => a * Math.exp(-decayConstant * t))
    .fold(
      () => 0,
      x => x,
    );

const initialAllocation = totalSupply => allocationPercentage => participants =>
  Maybe(totalSupply)
    .map(ts => (ts * allocationPercentage) / participants)
    .fold(
      () => 0,
      x => x,
    );

const mintTokens = totalSupply =>
  Maybe(totalSupply)
    .map(ts => 0.01 * ts)
    .fold(
      () => 0,
      x => x,
    );

const distributeMintedTokens = claimants => mintedSupply =>
  Maybe(claimants)
    .map(c => mintedSupply / c)
    .fold(
      () => 0,
      m => m * 0.05,
    );

const calculateAllocation =
  totalSupply => allocationPercentage => participants =>
    compose(
      continuousDecay(
        initialAllocation(totalSupply)(allocationPercentage)(participants),
      ),
    );

const expansionAllocation = totalSupply => claimCount => claimants =>
  compose(distributeMintedTokens(claimants), mintTokens)(totalSupply);

const calculateDistributions =
  totalSupply => time => claimCount => claimants => tiers =>
    Maybe(tiers)
      .map(ts =>
        ts.map(({ name, percentage: allocationPercentage, participants }) => ({
          name,
          allocation:
            calculateAllocation(totalSupply)(allocationPercentage)(
              participants,
            )(time) +
            (claimCount % 32500 === 0
              ? expansionAllocation(totalSupply)(claimCount)(claimants)
              : 0),
        })),
      )
      .fold(
        () => [],
        x => x,
      );

// Test Cases
test('initialAllocation calculation', t => {
  const result = initialAllocation(10000)(0.1)(100);
  t.deepEqual(result, 10);
});

test('continuousDecay calculation', t => {
  const result = continuousDecay(10)(12);
  const expected = 10 * Math.exp(-decayConstant * 12);
  t.deepEqual(result, expected);
});

test('mintTokens calculation', t => {
  const result = mintTokens(10000);
  t.deepEqual(result, 100);
});

test('distributeMintedTokens calculation', t => {
  const result = distributeMintedTokens(50)(100);
  t.deepEqual(result, 0.1);
});

test('calculateDistributions Tier 1', t => {
  const totalSupply = 10 ** 13;
  const tiers = [{ name: 'Tier 1', percentage: 0.1, participants: 1000 }];
  const time = 12;
  const claimCount = 32500;
  const claimants = 1000;

  const result =
    calculateDistributions(totalSupply)(time)(claimCount)(claimants)(tiers);
  const expectedAlloc = continuousDecay(initialAllocation(10 ** 13)(0.1)(1000))(
    12,
  );
  const expectedExpansion = expansionAllocation(10 ** 13)(32500)(1000);
  t.is(expectedExpansion, {});
  t.deepEqual(result, [
    { name: 'Tier 1', allocation: expectedAlloc + expectedExpansion },
  ]);
});

test('calculateDistributions multiple tiers', t => {
  const totalSupply = 10 ** 13;
  const tiers = [
    { name: 'Tier 1', percentage: 0.1, participants: 1000 },
    { name: 'Tier 2', percentage: 0.2, participants: 5000 },
    { name: 'Tier 3', percentage: 0.3, participants: 10000 },
    { name: 'Tier 4', percentage: 0.2, participants: 40000 },
    { name: 'Tier 5', percentage: 0.2, participants: 100000 },
  ];
  const time = 12;
  const claimCount = 65000;
  const claimants = 70000;

  const result =
    calculateDistributions(totalSupply)(time)(claimCount)(claimants)(tiers);
  const expected = tiers.map(({ name, percentage, participants }) => ({
    name,
    allocation: continuousDecay(
      initialAllocation(totalSupply)(percentage)(participants),
    )(time),
  }));
  t.deepEqual(result, expected);
});
