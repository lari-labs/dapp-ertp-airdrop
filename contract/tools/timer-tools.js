import buildManualTimer from '@agoric/zoe/tools/manualTimer.js';
import {
  compose,
  constructObject,
} from '../src/airdrop/helpers/objectTools.js';

const add = x => y => x + y;
const addOne = add(1);
const valueOf = x => x.valueOf();
const divideBy = x => y => y / x;
const divideByOneThousand = divideBy(1000);
const toBigInt = x => BigInt(x);

const getNewDate = () => new Date();
const getMonth = date => date.getMonth();
const getYear = date => date.getFullYear();
const getDay = date => date.getDate();
const createDateObject = ({ day, month, year }) => new Date(year, month, day);

const getCurrentMonth = compose(addOne, getMonth, getNewDate);

const getCurrentYear = compose(getYear, getNewDate);
const getCurrentDay = compose(getDay, getNewDate);

const hasCurrentMonth = {
  month: getCurrentMonth(),
};

const hasCurrentYear = {
  year: getCurrentYear(),
};

const hasCurrentDay = {
  day: getCurrentDay(),
};

const currentDateMixins = [hasCurrentDay, hasCurrentMonth, hasCurrentYear];

const createTimestampFromDate = compose(
  toBigInt,
  divideByOneThousand,
  valueOf,
  createDateObject,
);

export const createRealisticTimestamp = (array = currentDateMixins) =>
  createTimestampFromDate(constructObject(array));

const noop = () => {};

const trace =
  (label, count = 0) =>
  value => {
    console.log('timer tick #', count);
    count += 1;
    console.log(label, '::::', value);
    return value;
  };

export const createTimerService = (
  log = noop,
  startTime = createRealisticTimestamp(),
  opts = { timeStep: 60n },
) => buildManualTimer(log, startTime, opts);

export const createInformativeTimerService = () =>
  createTimerService(trace('mock chain timerService'));
