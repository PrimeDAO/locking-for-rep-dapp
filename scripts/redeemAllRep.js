require("dotenv").config();
const { ethers } = require("ethers");

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
  return redeems;
}

async function main() {
  const ProviderEndpoints = {
    "mainnet": `https://${process.env.RIVET_ID}.eth.rpc.rivet.cloud/`,
    "rinkeby": `https://${process.env.RIVET_ID}.rinkeby.rpc.rivet.cloud/`,
    // "kovan": `https://${process.env.RIVET_ID}.kovan.rpc.rivet.cloud/`,
    "kovan": `https://kovan.infura.io/v3/${process.env.INFURA_ID}`,
  }

  console.log(`network: ${process.env.network}`);

  const provider = ethers.getDefaultProvider(ProviderEndpoints[process.env.network]);

  const signer = new ethers.Wallet(process.env.private_key, provider);
  console.log(`account: ${signer.address}`);

  const LockingToken4ReputationAbi = require("../src/contracts/LockingToken4Reputation.json");

  const lockingToken4Reputation = new ethers.Contract(
    process.env.lockingForReputationAddress,
    LockingToken4ReputationAbi.abi,
    signer);

  const redemptions = await getRedemptions(lockingToken4Reputation)

  if (redemptions.size === 0) {
    console.log(`no lock events found`);
    return;
  } else {
    console.log(`redeemers:\n\r${Array.from(redemptions)}`);
  }
  /*
  const redeemsBatchSize = 90
  let redeemsCount = redeems.length
  let redeemsCounter = 0
  while (redeemsCount > 0) {
    let currentBatchCount = redeemsCount < redeemsBatchSize ? redeemsCount : redeemsBatchSize
    let redeemsBatch = redeems.slice(redeemsCounter * redeemsBatchSize, redeemsCounter * redeemsBatchSize + currentBatchCount)
  
    tx = await lockingToken4Reputation.redeem(lockingForReputationAddress)
  
    let gas
    const blockLimit = (await provider.eth.getBlock('latest')).gasLimit
    try {
      gas = await tx.estimateGas()
      if (gas * 1.1 < blockLimit - 100000) {
        gas *= 1.1
      }
    } catch (error) {
      gas = blockLimit - 100000
    }
    gas = parseInt(gas)
    console.log("GAS " + gas)
    await tx.send({
      from: provider.eth.defaultAccount,
      gas,
      gasPrice: process.env.gas_price,
    }).on("confirmation", function (_, receipt) {
      console.log(
        `Transaction ${receipt.transactionHash} successfully redeemed ${redeemsBatch.length} CLT4Reputation locks.`
      )
    })
      .on("error", console.error);
  
    redeemsCount -= redeemsBatchSize
    redeemsCounter++
    console.log(`Redeems Counter: ${redeemsCounter}`);
  }
  */
}

main()
  .then(() => { process.exit(0) })
  .catch((ex) => { console.error(ex); process.exit(-1); });
