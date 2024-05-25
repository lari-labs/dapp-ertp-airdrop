// @ts-check
// eslint-disable-next-line import/order
import { test as anyTest } from '../prepare-test-env-ava.js';
import '@agoric/store/exported.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;

test.todo('write tests showing lens laws passing');
