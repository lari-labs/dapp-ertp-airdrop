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
