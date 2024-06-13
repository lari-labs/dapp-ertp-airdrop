import { createRequire } from 'module';
import { E, Far } from '@endo/far';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { TimeMath } from '@agoric/time';
import { bootAndInstallBundles } from '../tools/boot-tools.js';
import { makeBundleCacheContext } from '../tools/bundle-tools.js';
import { TEST_TREE_DATA } from './data/agoric.accounts.js';
import { TimeIntervals } from '../src/airdrop/helpers/time.js';

const ONE_THOUSAND = 1000n;
const nodeRequire = createRequire(import.meta.url);
const { memeMint, memeIssuer, memes, moola, zoe } = setup();

// const contractName = 'launchIt';
const airdropName = 'airdropCampaign';
const bundleRoots = {
  // [contractName]: nodeRequire.resolve('../src/launchIt.js'),
  [airdropName]: nodeRequire.resolve('../src/airdrop.contract.js'),
  // contractStarter: nodeRequire.resolve('../src/contractStarter.js'),
};
const TOTAL_SUPPLY = memes(10_000_000n);
const makeBonusMintAmount = amo


const createToknSupplyRanges =
  (amountMaker = moola) =>
  (floorSupply, maxCirculatingSupply) => ({
    initialSupply: amountMaker(floorSupply),
    bonusSupply: AmountMath.subtract(
      amountMaker(maxCirculatingSupply),
      amountMaker(floorSupply),
    ),
  });

const makeMemesSupply = createToknSupplyRanges(memes);
const testEnv = {
  purseConfig: {
    issuer: memeIssuer,
    primarySupply: 
  }

}
const makeTestContext = async t => {
  const bootKit = await bootAndInstallBundles(t, bundleRoots);
  console.log({ bootKit });
  const { powers, bundles } = bootKit;

  const timer = await powers.consume.chainTimerService;

  const timerBrand = await E(timer).getTimerBrand();

  const relTimeMaker = makeRelTimeMaker(timerBrand);

  const TOTAL_SUPPLY = memes(10_000_000n);

  const MemePurse = PurseHolder(memeIssuer.makeEmptyPurse());

  // t.deepEqual(
  //   await MemePurse.map(x => x.deposit(memeMint.mintPayment(memes(10_000n)))),
  //   MemePurse.inspect(),
  // );

  mintMemesToPurse(memes(500_000n))(MemePurse);
  t.deepEqual(MemePurse.checkBalance(), memes(500_000n));

  const AIRDROP_PAYMENT = memeMint.mintPayment(TOTAL_SUPPLY);
  const AIRDROP_PURSE = memeIssuer.makeEmptyPurse();
  AIRDROP_PURSE.deposit(AIRDROP_PAYMENT);

  const startTime = relTimeMaker(TimeIntervals.SECONDS.ONE_DAY * 7n);
  t.deepEqual(TimeMath.relValue(startTime), 86400000n * 7n);
  const isFrozen = x => Object.isFrozen(x);

  t.deepEqual(
    isFrozen(AIRDROP_PURSE),
    true,
    'Purse being passed into contract via privateArgs must be frozen.',
  );
  t.deepEqual(
    isFrozen(timer),
    true,
    'Timer being passed into contract via privateArgs must be frozen.',
  );

  const invitationIssuer = await E(zoe).getInvitationIssuer();
  const invitationBrand = await E(invitationIssuer).getBrand();

  const { airdropCampaign } = bundles;

  const airdropInstallation = await E(zoe).install(airdropCampaign);

  const defaultCustomTerms = {
    hash: TEST_TREE_DATA.rootHash,
    basePayoutQuantity: memes(ONE_THOUSAND),
    startTime: relTimeMaker(TimeIntervals.SECONDS.ONE_DAY * 7n),
    endTime: relTimeMaker(ONE_THOUSAND * ONE_THOUSAND),
  };
  const defaultPrivateArgs = {
    purce: AIRDROP_PURSE,
    timer,
  };

  const makeStartOpts = ({
    customTerms = defaultCustomTerms,
    privateArgs = defaultPrivateArgs,
  }) => ({ ...harden(customTerms), ...harden(privateArgs) });

  const testTreeRemotable = makeTreeRemotable(
    TEST_TREE_DATA.tree,
    TEST_TREE_DATA.rootHash,
  );
  const instance = await E(zoe).startInstance(
    airdropInstallation,
    harden({ Token: memeIssuer }),
    harden({
      TreeRemotable: testTreeRemotable,
      hash: TEST_TREE_DATA.rootHash,
      basePayoutQuantity: memes(ONE_THOUSAND),
      startTime: relTimeMaker(TimeIntervals.SECONDS.ONE_DAY * 7n),
      endTime: relTimeMaker(ONE_THOUSAND * ONE_THOUSAND),
    }),
    harden({
      purse: AIRDROP_PURSE,
      bonusPurse: MemePurse.purse,
      timer,
    }),
    'c1-ownable-Airdrop',
  );

  t.context = {
    ...t.context,
    invitationIssuer,
    invitationBrand,
    memeIssuer,
    zoe,
    timer,
    primaryPurse: AIRDROP_PURSE,
    testTreeRemotable,
    makeStartOpts,
    airdropInstallation,
    instance,
    publicFacet: instance.publicFacet,
  };
};
