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
    const MAX_REWARD_CAP: BigNumber = ethers.utils.parseEther("500000"); 
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

            it("should deploy with correct token address", async () => {
                expect(await stakingContract.token()).to.equal(tevaToken.address);
            });

            it("should deploy with correct constants", async () => {
                expect(await stakingContract.MAX_APR()).to.equal(MAX_APR);
                expect(await stakingContract.MAX_REWARD_CAP()).to.equal(MAX_REWARD_CAP);
                expect(await stakingContract.STAKING_PERIOD()).to.equal(STAKING_PERIOD);
                expect(await stakingContract.COOLDOWN_PERIOD()).to.equal(COOLDOWN_PERIOD);               
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

            it("should't allow to add rewards multiple times", async () => {
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

            it("shouldn't add reward if apr is zero", async () => {
                await expectRevert(
                    stakingContract.setRewards(START_TIME, REWARD_AMOUNT, 0),
                    "Staking: apr is zero"
                );
            });

            it("shouldn't add reward if apr exceeds the limit", async () => {
                await expectRevert(
                    stakingContract.setRewards(START_TIME, REWARD_AMOUNT, MAX_APR.add(1)),
                    "Staking: apr exceeds the limit"
                );
            });
        });


        describe("Staking Contract stake Method Test Cases 💵", function () {
            
            before(async function () {
                await tevaToken.mint(owner.address, REWARD_AMOUNT);
                await tevaToken.approve(stakingContract.address, REWARD_AMOUNT);             
                await stakingContract.setRewards(START_TIME, REWARD_AMOUNT, APR);
                await time.increaseTo(START_TIME);

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

                (await tevaToken.balanceOf(user1.address)).should.equal(0);
                (await tevaToken.balanceOf(stakingContract.address)).should.equal(AMOUNT.add(REWARD_AMOUNT));

                let timestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;
                let userInfo: any = await stakingContract.usersInfo(user1.address);
                
                userInfo.balance.should.equal(AMOUNT);
                userInfo.lastTimeStaked.should.equal(timestamp);
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

            it("shouldn't transfer tokens from the user account if total staking cap limit exceeded", async () => {
                let maxStakingCap: BigNumber = await stakingContract.maxStakingCap();
                await tevaToken.mint(user1.address, maxStakingCap.div(2));
                await tevaToken.connect(user1).approve(stakingContract.address, maxStakingCap.div(2));
                await tevaToken.mint(user2.address, maxStakingCap.div(2));
                await tevaToken.connect(user2).approve(stakingContract.address, maxStakingCap.div(2));

                await stakingContract.connect(user1).stake(maxStakingCap.div(2));

                await expectRevert(
                    stakingContract.connect(user2).stake(maxStakingCap.div(2).add(1)),
                    "Staking: total staking cap limit exceeded"
                );
            });

            it("should transfer tokens from the user account if staking hasn't initialized", async () => { 
                await snapshotB.restore();
                await expectRevert(
                    stakingContract.connect(user1).stake(AMOUNT),
                    "Staking: staking hasn't initialized"
                );
            });

            it("should transfer tokens from the user account if staking has't started", async () => { 
                await snapshotB.restore();
                await tevaToken.mint(owner.address, REWARD_AMOUNT);
                await tevaToken.approve(stakingContract.address, REWARD_AMOUNT); 
                await stakingContract.setRewards(START_TIME, REWARD_AMOUNT, APR);
                await expectRevert(
                    stakingContract.connect(user1).stake(AMOUNT),
                    "Staking: staking has't started"
                );
            });
        });


        describe("Staking Contract unstake Method Test Cases 💳", function () {

            before(async function () {
                await tevaToken.mint(owner.address, REWARD_AMOUNT);
                await tevaToken.approve(stakingContract.address, REWARD_AMOUNT);
                await stakingContract.setRewards(START_TIME, REWARD_AMOUNT, APR);
                await time.increaseTo(START_TIME);

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

                (await tevaToken.balanceOf(user1.address)).should.equal(AMOUNT);
                (await tevaToken.balanceOf(stakingContract.address)).should.equal(REWARD_AMOUNT);

                let userInfo: any = await stakingContract.usersInfo(user1.address);             

                userInfo.balance.should.equal(0);
                userInfo.lastTimeStaked.should.equal(0);
            });

            it("shouldn't transfer tokens to the user account if his not are staker", async () => {
                await expectRevert(
                    stakingContract.unstake(),
                    "Staking: you are not staker"
                );
            });

            it("should transfer all staked tokens and 60% rewards if staking period not over", async () => {
                await time.increase(STAKING_PERIOD / 2);

                let receipt = await stakingContract.connect(user1).unstake();
                await expect(receipt).to.emit(
                    stakingContract,
                    "Unstake"
                ).withArgs(
                    user1.address,
                    AMOUNT.add(AMOUNT.mul(APR).div(ONE_HUNDRED_PERCENT).div(2).mul(60).div(100))
                );
            });

            it("should transfer all staked tokens and all remaining rewards", async () => {
                let maxStakingCap: BigNumber = (await stakingContract.maxStakingCap()).sub(await stakingContract.totalBalances());
                let halfStakingCap = maxStakingCap.div(2);

                await tevaToken.mint(user2.address, halfStakingCap);
                await tevaToken.connect(user2).approve(stakingContract.address, halfStakingCap);
                await stakingContract.connect(user2).stake(halfStakingCap);

                await tevaToken.mint(user3.address, halfStakingCap);
                await tevaToken.connect(user3).approve(stakingContract.address, halfStakingCap);
                await stakingContract.connect(user3).stake(halfStakingCap);

                await time.increase(STAKING_PERIOD * 2);
                
                let receipt = await stakingContract.connect(user2).unstake();      
                await expect(receipt).to.emit(
                    stakingContract,
                    "Unstake"
                ).withArgs(
                    user2.address,
                    halfStakingCap.add(halfStakingCap.mul(APR).div(ONE_HUNDRED_PERCENT).mul(2))
                );
                
                let remainingRewards = (await stakingContract.totalRewards());

                let receipt2 = await stakingContract.connect(user3).unstake();      
                await expect(receipt2).to.emit(
                    stakingContract,
                    "Unstake"
                ).withArgs(
                    user3.address,
                    halfStakingCap.add(remainingRewards)
                );
            });
        });
    });
});