// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const TevaToken = await ethers.getContractFactory("TevaToken");
  const VestingContract = await ethers.getContractFactory("StakingContract");
  const tevaToken = await TevaToken.deploy();
  const vestingContract = await VestingContract.deploy(tevaToken.address);

  await vestingContract.deployed();

  console.log("TEVA Token deployed to:", tevaToken.address);
  console.log("Staking Contract deployed to:", vestingContract.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
