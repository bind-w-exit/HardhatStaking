// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface IStakingContract {

    struct UserInfo {
        uint256 balance;
        uint256 rewards;
        uint256 rewardPerTokenPaid;
        uint256 firstTimeStaked;
        uint256 lastTimeStaked;
    }

    event SetRewards(uint256 start, uint256 rewardAmounts, uint256 apr);
    event Stake(address indexed from, uint256 amount);
    event Unstake(address indexed to, uint256 amount);
    event AlianTokenWithdraw(address indexed to, uint256 amount);

    function setRewards(uint256 start, uint256 rewardAmounts, uint256 apy) external;

    function stake(uint256 amount) external;

    function unstake() external;
}