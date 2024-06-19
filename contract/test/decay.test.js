
// @ts-check
// eslint-disable-next-line import/order
import { test as anyTest } from './airdropData/prepare-test-env-ava.js';
// eslint-disable-next-line import/order
import { createRequire } from 'module';
import { accounts, preparedAccounts } from './data/agoric.accounts.js';
import { Fn } from '../src/airdrop/helpers/monads.js';
import { lensProp, lensPath, view } from '../src/airdrop/helpers/lenses.js';

const test = anyTest;

const epochDataArray = [{
  epoch: 0,
  onDeck: [1000, 850, 500, 400, 300],
  tracker: [0, 0, 0, 0, 0],
  epochStore: new Map()
}, {
  epoch: 1,
  onDeck: [600, 480, 384, 307, 245],
  tracker: [0, 0, 0, 0, 0],
  epochStore:  new Map()

}, {
  epoch: 2,
  onDeck: [480, 384, 307, 200, 165],
  tracker: [0, 0, 0, 0, 0],
  epochStore: new Map()
}
];
const defaultState = {
  currentEpoch: 0,
  claimDecayRate: 0.999,
  epochDecayRate: 0.875,
  epochData: epochDataArray,
  currentEpochData: epochDataArray[0]
}

const reconstructArray = (array, index, data) => array.slice(0, index)
  .concat([data])
  .concat(array.slice(index + 1));

const ACTION_TYPES = {
  CLAIM: "user/handleClaimAirdrop",
  CHANGE_EPOCH: "system/handleEpochChange"
}
const uncurry = fn => (...args) => args.reduce((fn, arg) => fn(arg), fn)

const updateArray = array => index => newData => array.slice(0, index).concat(newData, array.slice(index + 1));
const uncurriedUpdateArray = uncurry(updateArray)
const { CLAIM, CHANGE_EPOCH } = ACTION_TYPES;

const reducer = (state = {}, { type = '', payload = {} }) => {
  switch (type) {
    case CHANGE_EPOCH: {
      console.log({ type, payload, state })
      const newState = ({
        ...state,
        epochData: uncurriedUpdateArray(state.epochData, state.currentEpoch, state.currentEpochData),
        currentEpoch: state.currentEpoch + 1,
        currentEpochData: state.epochData[state.currentEpoch + 1]
      });
      console.log({ type, payload, state })
      return newState
    }
    case CLAIM: {
      const { address, tier } = payload;
      const { currentEpochData } = state;
      const { onDeck, epochStore, tracker } = currentEpochData;
      // update currentEpochData.onDeck[tier] 
      // increment currentEpochData.tracker[tier]

      console.log({ onDeck, tier })
      const size = epochStore.size + 1;
      const nextNumber = onDeck[tier] * state.claimDecayRate ** (size - 1);
      console.log({ nextNumber })
      return ({
        ...state,
        currentEpochData: {
          tracker: reconstructArray(tracker, tier, tracker[tier] + 1),
          epochStore: epochStore.set(address, {
            amount: nextNumber
          }),
          onDeck: updateArray(onDeck)(tier)(nextNumber)
        }
      })
    }
    default: return state;
  }
}

const createStore = (reducer, initialState = defaultState) => {
  let state = initialState;
  const dispatch = action => {
    state = reducer(state, action)
  }
  return {
    dispatch,
    getState: () => state,
    getSlice: prop => view(lensProp(prop), state)
  }
}

const accts = preparedAccounts.map(x => ({ ...x, tier: x.tierInt }))

const getter = prop => obj => obj[prop];
const getAddress = getter('address')
const actionCreators = {
  handleClaim: ({ address, tier, pubkey, hash }) => ({
    type: CLAIM,
    payload: { address, tier, pubkey, hash }
  }),
  handleEpochChange: () => ({ type: CHANGE_EPOCH })
}
const head = ([x, ...xs]) => x;

const { handleClaim, handleEpochChange } = actionCreators;

test('claimReducer:: actions', t => {
  let store = createStore(reducer, defaultState);
  const claimaints = accts;
  const { getState, dispatch, getSlice } = store;

  const tail = ([x, ...xs]) => xs;
  
  const [firstClaimAccount, secondClaimAcct, thirdClaimAcct, ...rest] = claimaints;

  dispatch(handleClaim(firstClaimAccount))
  dispatch(handleClaim({...secondClaimAcct, tier: 1}))
  dispatch(handleClaim({...thirdClaimAcct, tier: 1}))
  const {epochStore: firstEpochStore} = getSlice('currentEpochData');
  const {amount: firstAmountValue} = firstEpochStore.get(firstClaimAccount.address)
  t.deepEqual(firstAmountValue, 850, 'handleClaim() given the first claimant from tier 1 should allocate the maximum number of tokens for that tier.');
  t.log('TIER 1 - Account #1::', firstAmountValue)

  const {amount: secondAmountValue} = firstEpochStore.get(secondClaimAcct.address);
  t.deepEqual(secondAmountValue < 850, true, 'handleClaim() given 2nd claimant from tier 1 should allocate the correct amount of tokens.')
  t.log('TIER 1 - Account #2::', secondAmountValue)

  const {amount: thirdAmountValue} = firstEpochStore.get(thirdClaimAcct.address);

  t.deepEqual(thirdAmountValue < secondAmountValue, true, 'handleClaim() given 2nd claimant from tier 1 should allocate the correct amount of tokens.')

  t.log('TIER 1 - Account #3::', thirdAmountValue)
  t.is(firstEpochStore.get(), epochDataArray[0])

  const accountSet1 = accts.slice(0, 2);
  const accountSet2 = accts.slice(2, 5);
  const accountSet3 = accts.slice(5);

  accountSet1.reduce((acc, val) => dispatch(handleClaim(val)), getState())
  store = dispatch(handleEpochChange())
  accountSet2.reduce((acc, val) => dispatch(handleClaim(val)), getState())

  t.is(getSlice('currentEpochData'), {})
})

