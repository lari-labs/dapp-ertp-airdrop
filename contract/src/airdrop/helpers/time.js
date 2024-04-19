import { Far } from '@endo/marshal';

const ONE_THOUSAND = 1_000;
const SIXTY = 60;

const multiply = x => y => x * y;
const secondsToMilliseconds = seconds => seconds * ONE_THOUSAND;
const toBigInt = x => BigInt(x);
const oneMinute = secondsToMilliseconds(60);
const oneHour = multiply(oneMinute)(60);
const oneDay = multiply(oneHour)(24);
const oneWeek = multiply(oneDay)(7);

const TIME_RANGES_IN_MS = {
  ONE_DAY: oneDay * 1000,
  ONE_WEEK: oneWeek * 1000,
};

export const TimeIntervals = {
  SECONDS: {
    ONE_DAY: BigInt(oneDay),
    ONE_HOUR: oneHour,
  },
  MILLISECONDS: TIME_RANGES_IN_MS,
};

const makeCancelTokenMaker = name => {
  let tokenCount = 1;

  return () => Far(`cancelToken-${name}-${(tokenCount += 1)}`, {});
};

const makeWaker = (name, func) => {
  return Far(name, {
    wake: timestamp => func(timestamp),
  });
};
export {
  makeCancelTokenMaker,
  makeWaker,
  oneMinute,
  oneDay,
  oneWeek,
  ONE_THOUSAND,
  SIXTY,
  secondsToMilliseconds,
  TIME_RANGES_IN_MS,
};
