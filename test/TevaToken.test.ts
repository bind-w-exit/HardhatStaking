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

describe("TevaToken Contract", function () {
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;
    let TevaToken: ContractFactory;
    let tevaToken: Contract;
    let snapshotA: any;
    let snapshotB: any;

    const NAME = "Teva token";
    const SYMBOL = "TEVA";
    const DECIMALS = BigNumber.from(18);
    const AMOUNT = BigNumber.from("839182361783012371982370197");
    const ZERO_AMOUNT = BigNumber.from(0);

    before(async function () {
        snapshotA = await snapshot();

        [owner, user1, user2, user3] = await ethers.getSigners();

        TevaToken = await ethers.getContractFactory("TevaToken");
        tevaToken = await TevaToken.deploy();

        snapshotB = await snapshot();
    });

    after(async function () {
        await snapshotA.restore(); 
    });

    describe("Teva Token Test Cases", function () {

        describe("Teva Token Deploy Test Cases 🏗️", function () {

            it("should deploy with correct owner", async () => {
                (await tevaToken.owner()).should.equal(owner.address);
            });

            it("should deploy with correct name", async () => {
                (await tevaToken.name()).should.equal(NAME);
            });

            it("should deploy with correct symbol", async () => {
                (await tevaToken.symbol()).should.equal(SYMBOL);
            });

            it("should deploy with correct decimals", async () => {
                (await tevaToken.decimals()).should.be.equal(DECIMALS);
            });

            it("should deploy with correct initial total supply", async () => {
                (await tevaToken.totalSupply()).should.be.equal(ZERO_AMOUNT);
            });
        });

        describe("Teva Token Test Cases 🔧", function () {

            afterEach(async function () {
                await snapshotB.restore();
            });

            //mint
            it("should mint tokens correctly", async () => {
                let receipt = await tevaToken.mint(owner.address, AMOUNT);
                await expect(receipt).to.emit(
                    tevaToken,
                    "Transfer"
                ).withArgs(
                    constants.ZERO_ADDRESS,
                    owner.address,
                    AMOUNT
                );
            });

            it("shouldn't mint tokens by not the current owner", async () => {
                await expectRevert(
                    tevaToken.connect(user1).mint(owner.address, AMOUNT),
                    "Ownable: caller is not the owner"
                );
            });

            //burn
            it("should burn tokens correctly", async () => {
                await tevaToken.mint(owner.address, AMOUNT);
                let receipt = await tevaToken.burn(AMOUNT);            
                await expect(receipt).to.emit(
                    tevaToken,
                    "Transfer"
                ).withArgs(
                    owner.address,
                    constants.ZERO_ADDRESS,        
                    AMOUNT
                );
            });

            //transfer
            it("should transfer tokens correctly", async () => {
                await tevaToken.mint(owner.address, AMOUNT);
                (await tevaToken.balanceOf(owner.address)).should.be.equal(AMOUNT);
                (await tevaToken.balanceOf(user1.address)).should.be.equal(ZERO_AMOUNT);

                let receipt = await tevaToken.connect(owner).transfer(user1.address, AMOUNT);          
                await expect(receipt).to.emit(
                    tevaToken,
                    "Transfer"
                ).withArgs(
                    owner.address,
                    user1.address,        
                    AMOUNT
                );

                (await tevaToken.balanceOf(user1.address)).should.be.equal(AMOUNT);
            });

            it("shouldn't transfer tokens to the zero address", async () => {
                await expectRevert(
                    tevaToken.transfer(constants.ZERO_ADDRESS, AMOUNT),
                    "ERC20: transfer to the zero address"
                );
            });

            it("shouldn't transfer tokens if transfer amount exceed balance", async () => {
                await expectRevert(
                    tevaToken.transfer(user2.address, AMOUNT),
                    "ERC20: transfer amount exceeds balance"
                );
            });

            //approve
            it("should approve correctly", async () => {
                let receipt = await tevaToken.approve(user1.address, AMOUNT);           
                await expect(receipt).to.emit(
                    tevaToken,
                    "Approval"
                ).withArgs(
                    owner.address,
                    user1.address,        
                    AMOUNT
                );

                (await tevaToken.allowance(owner.address, user1.address)).should.be.equal(AMOUNT);
            });

            it("shouldn't approve to the zero address", async () => {
                await expectRevert(
                    tevaToken.approve(constants.ZERO_ADDRESS, AMOUNT),
                    "ERC20: approve to the zero address"
                );
            });

            //increaseAllowance
            it("should increase allowance correctly", async () => {
                await tevaToken.approve(user1.address, AMOUNT);
                (await tevaToken.allowance(owner.address, user1.address)).should.be.equal(AMOUNT);
                let receipt = await tevaToken.increaseAllowance(user1.address, AMOUNT);
                (await tevaToken.allowance(owner.address, user1.address)).should.be.equal(AMOUNT.mul(2));
                await expect(receipt).to.emit(
                    tevaToken,
                    "Approval"
                ).withArgs(
                    owner.address,
                    user1.address,        
                    AMOUNT.mul(2)
                );
            });

            it("shouldn't increase allowance for zero address", async () => {
                await expectRevert(
                    tevaToken.increaseAllowance(constants.ZERO_ADDRESS, AMOUNT),
                    "ERC20: approve to the zero address"
                );
            });

            //decreaseAllowance
            it("should decrease allowance correctly", async () => {
                await tevaToken.approve(user1.address, AMOUNT);
                (await tevaToken.allowance(owner.address, user1.address)).should.be.equal(AMOUNT);
                let receipt = await tevaToken.decreaseAllowance(user1.address, AMOUNT);
                (await tevaToken.allowance(owner.address, user1.address)).should.be.equal(BigNumber.from(0));
                await expect(receipt).to.emit(
                    tevaToken,
                    "Approval"
                ).withArgs(
                    owner.address,
                    user1.address,        
                    BigNumber.from(0)
                );
            });

            it("shouldn't decrease allowance for zero address", async () => {
                await expectRevert(
                    tevaToken.decreaseAllowance(constants.ZERO_ADDRESS, AMOUNT),
                    "ERC20: decreased allowance below zero"
                );
            });

            it("shouldn't decrease allowance below zero", async () => {
                await expectRevert(
                    tevaToken.decreaseAllowance(user1.address, AMOUNT),
                    "ERC20: decreased allowance below zero"
                );
            });

            //transferFrom
            it("should transfer tokens from address correctly", async () => {
                await tevaToken.mint(owner.address, AMOUNT);
                await tevaToken.approve(user1.address, AMOUNT);
                (await tevaToken.balanceOf(user2.address)).should.be.equal(ZERO_AMOUNT);
                let receipt = await tevaToken.connect(user1).transferFrom(owner.address, user2.address, AMOUNT);
                (await tevaToken.balanceOf(user2.address)).should.be.equal(AMOUNT);
                await expect(receipt).to.emit(
                    tevaToken,
                    "Transfer"
                ).withArgs(
                    owner.address,
                    user2.address,        
                    AMOUNT
                );
            });

            it("shouldn't transfer tokens from address if amount exceed allowance", async () => {
                await expectRevert(
                    tevaToken.connect(user1).transferFrom(owner.address, user2.address, AMOUNT),
                    "ERC20: insufficient allowance"
                );
            });
        });
    });
});