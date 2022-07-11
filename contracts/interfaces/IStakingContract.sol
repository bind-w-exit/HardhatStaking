// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface IStakingContract {

    event SetRewards(uint256 start, uint256 rewardAmounts, uint256 apy);
    event Stake(address indexed from, uint256 amount);
    event Unstake(address indexed to, uint256 amount);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    function setRewards(uint256 start, uint256 rewardAmounts, uint256 apy) external;

    function stake(uint256 amount) external;

    function unstake() external;
}