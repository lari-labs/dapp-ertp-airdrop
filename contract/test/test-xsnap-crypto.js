// @ts-check
import '@endo/init/debug.js';
import { xsnap } from '@agoric/xsnap';
import { encodeBase64 } from '@endo/base64';
import test from 'ava';
import proc from 'node:child_process';
import fsMod from 'node:fs';
import osMod from 'node:os';
import tmpMod from 'tmp';

const { freeze } = Object;

// a TextDecoder has mutable state; only export the (pure) decode function
/** @type { TextDecoder['decode'] } */
export const decode = (decoder => decoder.decode.bind(decoder))(
  new TextDecoder(),
);

/** @type { TextEncoder['encode'] } */
export const encode = (encoder => encoder.encode.bind(encoder))(
  new TextEncoder(),
);

/**
 * @param {{
 *   spawn?: typeof import('child_process').spawn,
 *   os?: string,
 *   fs?: import('fs'),
 *   tmpName?: import('tmp')['tmpName'],
 * }} [io]
 * @returns {import('@agoric/xsnap').XSnapOptions & { messages: string[]}}
 */
export function options(io = {}) {
  const {
    spawn = proc.spawn,
    os = osMod.type(),
    fs = fsMod,
    tmpName = tmpMod.tmpName,
  } = io;

  const messages = [];

  /** @param {Uint8Array} message */
  async function handleCommand(message) {
    messages.push(decode(message));
    return new Uint8Array();
  }

  return freeze({
    name: 'xsnap test worker',
    stderr: 'inherit',
    stdout: 'inherit',
    spawn,
    fs: { ...fs, ...fs.promises, tmpName },
    os,
    handleCommand,
    messages,
  });
}

test('Base64.encode', async t => {
  const opts = options();
  const vat = await xsnap(opts);
  t.teardown(() => vat.terminate());
  await vat.evaluate(`
      const encoder = new TextEncoder();
      globalThis.handleCommand = inputBuffer => {
        const outputString = Base64.encode(inputBuffer);
        const outputUint8Array = encoder.encode(outputString);
        globalThis.issueCommand(outputUint8Array.buffer);
      };
    `);
  const inputUint8Array = new TextEncoder().encode('Hello, World! 😃🌍');
  const expectedOutputString = encodeBase64(inputUint8Array);
  await vat.issueCommand(inputUint8Array);
  t.deepEqual(opts.messages, [expectedOutputString]);
});

test('high resolution timer', async t => {
  const opts = options();
  const vat = await xsnap(opts);
  t.teardown(() => vat.terminate());
  await vat.evaluate(`
    const send = it => issueCommand(new TextEncoder().encode(JSON.stringify(it)).buffer);

    const t = performance.now();
    send(t);
  `);
  const [milliseconds] = opts.messages.map(s => JSON.parse(s));
  t.log({ milliseconds, date: new Date(milliseconds) });
  t.is(typeof milliseconds, 'number');
});

/** @param {number} logn */
function dataStructurePerformance(logn) {
  // eslint-disable-next-line no-bitwise
  const n = 1 << logn;
  const send = it => {
    // eslint-disable-next-line no-undef
    return issueCommand(new TextEncoder().encode(JSON.stringify(it)).buffer);
  };
  const t0 = performance.now();
  for (let i = 0; i < 256; i += 1) {
    const a = [];
    for (let j = 0; j < n; j += 1) {
      a.push(j);
    }
    const m = new Map();
    for (let j = 0; j < n; j += 1) {
      m.set(j, j);
    }
    for (let j = 0; j < n; j += 1) {
      m.get(j);
    }
    const s = new Set();
    for (let j = 0; j < n; j += 1) {
      s.add(j);
    }
    for (let j = 0; j < n; j += 1) {
      s.has(j);
    }
  }
  const t1 = performance.now();
  const dur = t1 - t0;
  // O(n log(n))
  const rate = (n * logn) / dur;
  send({ size: n, dur, rate });
}

// This test fails intermittently due to some amount of noise that we cannot
// completely eliminate.
// Rather than have a very low-probability failing test, we skip this, but
// retain the benchmark for future verification in the unlikely event that the
// performance character of XS collections regresses.

test('Array, Map, Set growth is O(log(n))', async t => {
  const opts = options();
  const vat = await xsnap({ ...opts, meteringLimit: 0 });
  await vat.evaluate(
    `globalThis.dataStructurePerformance = (${dataStructurePerformance})`,
  );

  const run = async size => {
    const {
      meterUsage: { compute },
    } = await vat.evaluate(`dataStructurePerformance(${size})`);
    // @ts-expect-error pop() may return undefined
    const r = JSON.parse(opts.messages.pop());
    t.log({ compute, r });
    return { compute, r };
  };

  const { r: r1 } = await run(8);
  const { r: r2 } = await run(10);
  const { r: r3 } = await run(12);
  t.log({ r2_1: r2.rate / r1.rate, r3_2: r3.rate / r2.rate });
  t.true(r2.rate / r1.rate >= 1);
  t.true(r3.rate / r2.rate >= 1);
});
