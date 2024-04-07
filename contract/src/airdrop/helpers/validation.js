// @ts-check
import { Far } from '@endo/far'

const assertion = label => (arg, keyname) => assert(label, arg, keyname);

const startupAssertion = (arg, keyName) =>
    assertion(`Contract has been started without required property: ${keyName}.`)(
        arg,
    );

const makeCancelTokenMaker = name => {
    let tokenCount = 1;

    return () => Far(`cancelToken-${name}-${(tokenCount += 1)}`, {});
};

export {
    assertion,
    makeCancelTokenMaker,
    startupAssertion
}