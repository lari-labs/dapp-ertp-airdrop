// @ts-check
// eslint-disable-next-line import/order
import { test as anyTest } from './airdropData/prepare-test-env-ava.js';
import * as store from '@agoric/store';
import { createRequire } from 'module';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeBundleCacheContext>>>} */
const test = anyTest;
/**
 * @name makeStateMachine
 * @description makeStateMachine is a factory function for creating state machines that are constrained to a pre-determined set of possibile state transitions. This function keeps the `state` variable private by encapsulating it within the function's closure scope.
 *
 * The return value is an object containing the following methods:
 *
 * 1. `canTransitionTo::(nextState:string)=>bool` - takes in a string that expected to correspond to a pre-defined states and checks if a transition from the current `state` value to the value of `nextState` is valid before returning true|false.
 *
 * 2. `transitionTo::(nextState:string)=>undefined` - asserts whether or not the transition from the current state to the state passed as input is allowed. if yes, `state` is updated to equal `nextState`.
 *
 * 3. `getStatus::()=>string` - returns the current value assigned to the (private) `state` variable.
 *
 * @param {string} initialState the value assigned to the state machine that the state machine will "state" the "state" declaration
 *
 * Ex. `const initialState = 'open'`
 * @param {Array} allowedTransitionsArray allowedTransitions is an array of arrays which gets turned into a map. The map maps string states to an array of potential next states.
 *
 * Ex. `const allowedTransitions = [['open', ['closed']], ['closed', []], ];`
 *
 * @param {import("@agoric/ertp").Baggage} baggage
 * @returns {{canTransitionTo, transitionTo, getStatus}}
 */
const makeStateMachine = (initialState, allowedTransitionsArray, baggage) => {
  let state = initialState;
  console.log({ allowedTransitionsArray, state });
  const allowedTransitions = new Map(allowedTransitionsArray);
  return harden({
    canTransitionTo: nextState =>
      allowedTransitions.get(state).includes(nextState),
    transitionTo: nextState => {
      console.log('TRANSITIONING STATE :::', baggage.get('currentStatus'));
      assert(allowedTransitions.get(state).includes(nextState));
      baggage.set('currentStatus', nextState);
      console.log(
        'TRANSITIONING STATE ::: AFTER',
        baggage.get('currentStatus'),
      );

      state = nextState;
    },
    getStatus: () => baggage.get('currentStatus'),
  });
};
harden(makeStateMachine);

export { makeStateMachine };

test('epoch state machine', t => {
  const fakeBaggage = store.makeLegacyMap();
  fakeBaggage.init('currentStatus', '0');
  t.is(fakeBaggage.get('currentStatus'), '0');
  const machine = makeStateMachine('0', ['0', ['1', '2']]);

  t.deepEqual(machine, []);
});
