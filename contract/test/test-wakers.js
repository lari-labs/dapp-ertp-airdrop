// @ts-check
// eslint-disable-next-line import/order
import { test as anyTest } from './airdropData/prepare-test-env-ava.js';
import { createRequire } from 'module';
import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

test('timer', async t => {
  const timer = buildManualTimer(x => {
    console.log('logging time', x);
    x;
  }, 0n);
  t.deepEqual(timer, {});
});
