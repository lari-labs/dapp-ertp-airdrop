import { COSMOS_ACCOUNTS } from './cosmos.accounts.js';

const { ONE_HUNDRED_ACCOUNTS } = COSMOS_ACCOUNTS;
const TEN_ADDRESSES = ONE_HUNDRED_ACCOUNTS.slice(0, 10);

const generateInt = x => () => Math.floor(Math.random() * (x + 1));
const generateTierValue = generateInt(4);
const withTier = x => ({ ...x, tier: generateTierValue() });
const stringifyProp = prop => obj => ({ ...obj, [prop]: obj[prop].toString() });

const Id = x => ({
  value: x,
  map(fn) {
    return Id(fn(x));
  },
  getValue() {
    return this.value;
  },
});

const tenAddresses = TEN_ADDRESSES.map(Id);
const trace = label => value => {
  console.log(label, '::::', value);
  return value;
};
const createLeafValue = accountObject => ({
  ...accountObject,
  leaf: accountObject.pubkey.concat(accountObject.tier),
});

const stringifyTier = stringifyProp('tier');
const formatTestAccounts = array => array.map(withTier).map(stringifyTier);

export {
  formatTestAccounts,
  generateInt,
  generateTierValue,
  stringifyTier,
  withTier,
};
