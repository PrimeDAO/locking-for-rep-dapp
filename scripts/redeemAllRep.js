require("dotenv").config();
const { ethers } = require("ethers");
const { parseUnits } = require("ethers/lib/utils");

async function getRedemptions(lockingToken4Reputation) {

  const filter = lockingToken4Reputation.filters.Lock();
  const events = await lockingToken4Reputation.queryFilter(filter);

  let redeems = new Set();
  for (let event of events) {
    let beneficiary = event.args._locker;

    // Check if can close the proposal as expired and claim the bounty
    let failed = false;
    let redeemCall = await lockingToken4Reputation
      .callStatic
      .redeem(beneficiary)
      .catch(() => {
        failed = true;
      });

    await lockingToken4Reputation
      .estimateGas
      .redeem(beneficiary)
      .catch(() => {
        failed = true;
      });

    if (!failed && redeemCall?.gt(0)) {
      redeems.add(beneficiary); // eliminate dups from multiple locks
    }
  }
  return Array.from(redeems);
}

async function main() {
  const ProviderEndpoints = {
    "mainnet": `https://${process.env.RIVET_ID}.eth.rpc.rivet.cloud/`,
    "rinkeby": `https://${process.env.RIVET_ID}.rinkeby.rpc.rivet.cloud/`,
    // "kovan": `https://${process.env.RIVET_ID}.kovan.rpc.rivet.cloud/`,
    "kovan": `https://kovan.infura.io/v3/${process.env.INFURA_ID}`,
  }

  console.log(`network: ${process.env.NETWORK}`);

  const provider = ethers.getDefaultProvider(ProviderEndpoints[process.env.NETWORK]);

  const signer = new ethers.Wallet(process.env.private_key, provider);
  console.log(`account: ${signer.address}`);

  const gasPrice = parseUnits(process.env.gas_price, "gwei");
  console.log(`gasPrice: ${gasPrice.toString()}`);

  const LockingToken4ReputationAbi = require("../src/contracts/LockingToken4Reputation.json");

  const lockingToken4Reputation = new ethers.Contract(
    process.env.lockingForReputationAddress,
    LockingToken4ReputationAbi.abi,
    signer);

  const redemptions = await getRedemptions(lockingToken4Reputation)
  let redeemsCount = redemptions.length;

  if (redemptions.length === 0) {
    console.log(`no lock events found`);
    return;
  } else {
    console.log(`redeemptions:\n\r${redeemsCount}`);
    console.log(`redeemers:\n\r${redemptions}`);
  }

  const reputationLockerAbi = require("../src/contracts/RepRedeemer.json");

  const reputationLocker = new ethers.Contract(
    process.env.reputationLockerAddress,
    reputationLockerAbi.abi,
    signer);

  const redeemsBatchSize = 90;
  let redeemsCounter = 0;

  while (redeemsCount > 0) {
    let currentBatchCount = redeemsCount < redeemsBatchSize ? redeemsCount : redeemsBatchSize
    let redeemsBatch = redemptions.slice(redeemsCounter * redeemsBatchSize, redeemsCounter * redeemsBatchSize + currentBatchCount)

    let gasLimit;
    const blockLimit = (await provider.getBlock("latest")).gasLimit;
    try {

      gasLimit = await reputationLocker
        .estimateGas
        .redeemLocking4Reputation(process.env.lockingForReputationAddress, redeemsBatch);

      if (gasLimit * 1.1 < blockLimit - 100000) {
        gasLimit *= 1.1
      }
    } catch (error) {
      gasLimit = blockLimit - 100000
    }

    gasLimit = parseInt(gasLimit)
    console.log("gasLimit " + gasLimit)

    try {
      const response = await reputationLocker.redeemLocking4Reputation(process.env.lockingForReputationAddress, redeemsBatch, {
        gasLimit,
        gasPrice,
      });

      const receipt = await response.wait(2);

      console.log(
        `Transaction ${receipt.transactionHash} successfully redeemed ${redeemsBatch.length} locks`
      )
    }
    catch (ex) {
      console.error(ex);
    }

    redeemsCount -= redeemsBatchSize
    redeemsCounter++
  }
  console.log(`Batches run: ${redeemsCounter}`);
}

main()
  .then(() => { process.exit(0) })
  .catch((ex) => { console.error(ex); process.exit(-1); });
