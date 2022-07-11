import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { Contract, ContractFactory, BigNumber } from "ethers";
import { ethers } from "hardhat";

const {
    constants,
    expectRevert,
    snapshot,
    time
} = require("@openzeppelin/test-helpers");

require("chai")
    .should();

describe("Staking Contract", function () {
    //contract's constants
    const ONE_HUNDRED_PERCENT: BigNumber = ethers.utils.parseEther("100");
    const MAX_APR: BigNumber = ethers.utils.parseEther("10");
    const MAX_REWARD_CAP: BigNumber = BigNumber.from(500_000); 
    const STAKING_PERIOD: number = 365 * 24 * 60 * 60;
    const COOLDOWN_PERIOD: number = 10 * 24 * 60 * 60;

    //test's constants
    const AMOUNT: BigNumber = BigNumber.from(500_000);
    const START_TIME: number = Math.floor(Date.now() / 1000) + 60;
    const REWARD_AMOUNT: BigNumber = BigNumber.from(500_000);
    const APR: BigNumber = ethers.utils.parseEther("10.00");
    
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;

    let TevaToken: ContractFactory;
    let StakingContract: ContractFactory;
    let tevaToken: Contract;
    let stakingContract: Contract;

    let snapshotA: any;
    let snapshotB: any;
    let snapshotC: any; 


    before(async function () {
        snapshotA = await snapshot();

        [owner, user1, user2, user3] = await ethers.getSigners();

        TevaToken = await ethers.getContractFactory("TevaToken");
        tevaToken = await TevaToken.deploy();
        StakingContract = await ethers.getContractFactory("StakingContract");
        stakingContract = await StakingContract.deploy(tevaToken.address);

        snapshotB = await snapshot();
    });

    after(async function () {
        await snapshotA.restore(); 
    });

    describe("Staking Contract Test Cases", function () {

        describe("Staking Contract Deploy Test Cases 🏗️", function () {

            it("shouldn't deploy contract if the token address is zero", async () => {
                await expectRevert(
                    StakingContract.deploy(constants.ZERO_ADDRESS),
                  "Staking: token address is zero"
                );
            });
    
            it("should deploy with correct owner", async () => {
              expect(await stakingContract.owner()).to.equal(owner.address);
            });

        });

        describe("Staking Contract setRewards Method Test Cases 🎁", function () {

            before(async function () {
                await tevaToken.mint(owner.address, REWARD_AMOUNT);
                await tevaToken.approve(stakingContract.address, REWARD_AMOUNT);
                await tevaToken.mint(user1.address, AMOUNT);
                await tevaToken.connect(user1).approve(stakingContract.address, AMOUNT);

                snapshotC = await snapshot();
            });

            afterEach(async function () {
                await snapshotC.restore();
            });

            after(async function () {
                await snapshotB.restore();
            });

            it("should add reward to contract for a specific period", async () => {
                let receipt = await stakingContract.setRewards(START_TIME, REWARD_AMOUNT, APR);      
                await expect(receipt).to.emit(
                    stakingContract,
                    "SetRewards"
                ).withArgs(
                    START_TIME,
                    REWARD_AMOUNT,
                    APR
                );
            });

            it("shouldn't add reward to contract from the non-current owner", async () => {
                await expectRevert(
                    stakingContract.connect(user1).setRewards(START_TIME, REWARD_AMOUNT, APR),
                    "Ownable: caller is not the owner"
                );
            });

            it("should add reward only once", async () => {
                await stakingContract.setRewards(START_TIME, REWARD_AMOUNT, APR); 
                await expectRevert(
                    stakingContract.setRewards(START_TIME, REWARD_AMOUNT, APR),
                    "Staking: setRewards can only be called once"
                );
            });

            it("shouldn't add reward if start time is less than block timestamp", async () => {
                await expectRevert(
                    stakingContract.setRewards(Math.floor(Date.now() / 1000) - 60, REWARD_AMOUNT, APR),
                    "Staking: start time is less than block timestamp"
                );
            });

            it("shouldn't add reward if zero transaction amount", async () => {
                await expectRevert(
                    stakingContract.setRewards(START_TIME, 0, APR),
                    "Staking: zero transaction amount"
                );
            });

            it("shouldn't add reward if reward amounts exceeds the limit", async () => {
                await expectRevert(
                    stakingContract.setRewards(START_TIME, MAX_REWARD_CAP.add(1), APR),
                    "Staking: reward amounts exceeds the limit"
                );
            });

            it("shouldn't add reward if apy is zero", async () => {
                await expectRevert(
                    stakingContract.setRewards(START_TIME, REWARD_AMOUNT, 0),
                    "Staking: apy is zero"
                );
            });

            it("shouldn't add reward if apy exceeds the limit", async () => {
                await expectRevert(
                    stakingContract.setRewards(START_TIME, REWARD_AMOUNT, MAX_APR.add(1)),
                    "Staking: apy exceeds the limit"
                );
            });
        });

        describe("Staking Contract stake Method Test Cases 💵", function () {
            
            before(async function () {
                await tevaToken.mint(owner.address, REWARD_AMOUNT);
                await tevaToken.approve(stakingContract.address, REWARD_AMOUNT);             
                await stakingContract.setRewards(START_TIME, REWARD_AMOUNT, APR);

                await tevaToken.mint(user1.address, AMOUNT);
                await tevaToken.connect(user1).approve(stakingContract.address, AMOUNT);

                snapshotC = await snapshot();
            });

            afterEach(async function () {
                await snapshotC.restore();
            });

            after(async function () {
                await snapshotB.restore();
            });

            it("should transfer tokens from the user account and register staking for him", async () => {  
                let receipt = await stakingContract.connect(user1).stake(AMOUNT);      
                await expect(receipt).to.emit(
                    stakingContract,
                    "Stake"
                ).withArgs(
                    user1.address,
                    AMOUNT
                );
            });

            it("shouldn't transfer tokens from the user account if stake cooldown is not over", async () => {
                await stakingContract.connect(user1).stake(AMOUNT.div(2)); 
                await expectRevert(
                    stakingContract.connect(user1).stake(AMOUNT.div(2)),
                    "Staking: stake cooldown is not over"
                );
            });

            it("shouldn't transfer tokens from the user account if zero transaction amount", async () => {
                await expectRevert(
                    stakingContract.connect(user1).stake(0),
                    "Staking: zero transaction amount"
                );
            });

            it("should register transfered tokens + reward from priveos stake", async () => {
                await tevaToken.mint(user1.address, AMOUNT.mul(2));
                await tevaToken.connect(user1).approve(stakingContract.address, AMOUNT.mul(2));
                await stakingContract.connect(user1).stake(AMOUNT);
                await time.increaseTo(START_TIME + STAKING_PERIOD);
                let amount = AMOUNT.add(AMOUNT.mul(APR).div(ONE_HUNDRED_PERCENT));
                let receipt = await stakingContract.connect(user1).stake(AMOUNT);      
                await expect(receipt).to.emit(
                    stakingContract,
                    "Stake"
                ).withArgs(
                    user1.address,
                    amount
                );
            });

            it("shouldn't transfer tokens from the user account if total staking cap limit exceeded", async () => {
                await expectRevert(
                    stakingContract.connect(user1).stake(MAX_REWARD_CAP.mul(ONE_HUNDRED_PERCENT).div(APR).add(1)),
                    "Staking: total staking cap limit exceeded"
                );
            });

            //must be last test in this test cases because snapshotB.restore() ♿♿♿
            it("should transfer tokens from the user account if staking hasn't initialized", async () => { 
                await snapshotB.restore();
                await expectRevert(
                    stakingContract.connect(user1).stake(AMOUNT),
                    "Staking: staking hasn't initialized"
                );
            });
        });

        describe("Staking Contract unstake Method Test Cases 💳", function () {

            before(async function () {
                await tevaToken.mint(owner.address, REWARD_AMOUNT);
                await tevaToken.approve(stakingContract.address, REWARD_AMOUNT);
                await stakingContract.setRewards(START_TIME, REWARD_AMOUNT, APR);

                await tevaToken.mint(user1.address, AMOUNT);
                await tevaToken.connect(user1).approve(stakingContract.address, AMOUNT);
                await stakingContract.connect(user1).stake(AMOUNT);

                snapshotC = await snapshot();
            });

            afterEach(async function () {
                await snapshotC.restore();
            });

            after(async function () {
                await snapshotB.restore();
            });

            it("should transfer tokens to the user account and unregister staking for him", async () => {
                let receipt = await stakingContract.connect(user1).unstake();      
                await expect(receipt).to.emit(
                    stakingContract,
                    "Unstake"
                ).withArgs(
                    user1.address,
                    AMOUNT
                );
            });

            it("shouldn't transfer tokens to the user account if his not are staker", async () => {
                await expectRevert(
                    stakingContract.unstake(),
                    "Staking: you are not staker"
                );
            });
        });

        
        describe("Staking Contract Complex Test Cases 💥", function () {

            it("should test complex", async () => { 
                await tevaToken.mint(owner.address, REWARD_AMOUNT);
                await tevaToken.approve(stakingContract.address, REWARD_AMOUNT);
                await stakingContract.setRewards(START_TIME, REWARD_AMOUNT, APR);

                let maxAmount: BigNumber = REWARD_AMOUNT.mul(ONE_HUNDRED_PERCENT).div(APR);
                let amount: BigNumber = maxAmount.div(4);

                await tevaToken.mint(user1.address, amount);
                await tevaToken.connect(user1).approve(stakingContract.address, amount);
                await stakingContract.connect(user1).stake(amount);

                await time.increaseTo(START_TIME + STAKING_PERIOD);
                
                let receipt = await stakingContract.connect(user1).unstake();      //must return 10% 
                await expect(receipt).to.emit(
                    stakingContract,
                    "Unstake"
                ).withArgs(
                    user1.address,
                    amount.add(amount.mul(APR).div(ONE_HUNDRED_PERCENT))
                );
               

                await tevaToken.mint(user2.address, amount);
                await tevaToken.connect(user2).approve(stakingContract.address, amount);
                await stakingContract.connect(user2).stake(amount);

                await time.increase(STAKING_PERIOD);

                let receipt2 = await stakingContract.connect(user2).unstake();      //must return 10%
                await expect(receipt2).to.emit(
                    stakingContract,
                    "Unstake"
                ).withArgs(
                    user2.address,
                    amount.add(amount.mul(APR).div(ONE_HUNDRED_PERCENT))
                );


                await tevaToken.mint(user3.address, amount);
                await tevaToken.connect(user3).approve(stakingContract.address, amount);
                await stakingContract.connect(user3).stake(amount);

                await time.increase(STAKING_PERIOD / 2);

                let receipt3 = await stakingContract.connect(user3).unstake();    //must return (10% / 2) * 60%  (fee)
                await expect(receipt3).to.emit(
                    stakingContract,
                    "Unstake"
                ).withArgs(
                    user3.address,
                    amount.add(amount.mul(APR).div(ONE_HUNDRED_PERCENT).div(2).mul(60).div(100))
                );

            });

        });

    });
});