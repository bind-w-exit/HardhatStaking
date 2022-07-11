// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol"; 
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IStakingContract.sol";


//            t1                       The billion-dollar algorithm
//           =====
//           \         l(t)            R - tokens per second or 'rewardRate'
//            >    R * ----            l(t) - individual user balance at time 't'
//           /         L(t)            L(t) - total quantity of staked tokens for that contract at time 't'
//           =====
//           t = t0                    Reward for a period from 't0' to 't1' would be the total sum of their rewards for each of these seconds

//             ||                  
//             \/                      If the user's balance  is constant over that period, then the above formula can be simplified to:

//            t1
//           =====
//           \       1
//  R * l *   >    ----
//           /     L(t)
//           =====
//           t = t0

//             ||                  
//             \/                      We can then decompose that sum into a difference of two sums:

//         /  t1           t0        \
//         | =====        =====      |
//         | \       1    \       1  |
// R * l * |  >    ---- -  >    ---- |
//         | /     L(t)   /     L(t) |
//         | =====        =====      |
//         \ t = 0        t = 0      /

//             ||                      This means that all we need to track in the staking contract is a
//             ||                      single accumulator tracking "seconds per liquidity" since the beginning of the pool:
//             \/                      In the contract, this accumulator is called 'rewardPerTokenStored'.

//            t
//             i
//           =====                   
//           \       1              
//  s (t ) =  >    ----                
//   l  i    /     L(t)                
//           =====                     
//           t = 0                   

//             ||                      When someone stakes tokens, the contract checkpoints their starting value of the accumulator s (t )
//             ||                      When they later unstake, the contract looks at the new value of the accumulator s (t )        l  0
//             \/                      and computes their rewards for that period.                                      l  1

//   R(l, s (t ), s (t )) = R * l * (s (t ) - s (t ))
//         l  1    l  0               l  1     l  0


contract StakingContract is IStakingContract, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public token;

    uint256 constant ONE_HUNDRED_PERCENT = 100 ether;
    uint256 constant MAX_APR = 10 ether;
    uint32 constant MAX_REWARD_CAP = 500_000;
    uint32 constant STAKING_PERIOD = 365 days;
    uint32 constant COOLDOWN_PERIOD = 10 days;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public rewards;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public usersStartTime;

    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    uint256 public totalBalances;
    uint256 public totalRewards;
    uint256 public startTime;
    uint256 public apr;
    bool public isStakingInitialized;


    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Staking: token address is zero");
        token = IERC20(tokenAddress);
    }

    modifier updateReward(address account) {     
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;
        
        rewards[account] = earned(account);
        userRewardPerTokenPaid[account] = rewardPerTokenStored;    
        _;
    }

    function setRewards(
        uint256 _start,
        uint256 _rewardAmounts,
        uint256 _apr
    ) external override onlyOwner {
        require(!isStakingInitialized, "Staking: setRewards can only be called once");
        require(_start >= block.timestamp, "Staking: start time is less than block timestamp");
        require(_rewardAmounts > 0, "Staking: zero transaction amount");
        require(_rewardAmounts <= MAX_REWARD_CAP, "Staking: reward amounts exceeds the limit");
        require(_apr > 0, "Staking: apy is zero");
        require(_apr <= MAX_APR, "Staking: apy exceeds the limit");

        startTime = _start;
        apr = _apr;
        totalRewards = _rewardAmounts;
        isStakingInitialized = true;

        token.safeTransferFrom(msg.sender, address(this), _rewardAmounts); 
        emit SetRewards(_start, _rewardAmounts, _apr);
    }

    function stake(uint256 _amount) external override updateReward(msg.sender) {
        require(isStakingInitialized, "Staking: staking hasn't initialized");
        require(usersStartTime[msg.sender] + COOLDOWN_PERIOD < block.timestamp, "Staking: stake cooldown is not over"); 

        uint256 amountToSend = _amount;

        if (balances[msg.sender] > 0) {
            _amount += rewards[msg.sender];
            rewards[msg.sender] = 0;
        }

        require(_amount > 0, "Staking: zero transaction amount");    
        require(_amount <= maxStakingCap(), "Staking: total staking cap limit exceeded");

        balances[msg.sender] += _amount;
        totalBalances += _amount;
        usersStartTime[msg.sender] = block.timestamp;

        token.safeTransferFrom(msg.sender, address(this), amountToSend);
        emit Stake(msg.sender, _amount);
    }

    function unstake() external override updateReward(msg.sender) {
        require(balances[msg.sender] > 0, "Staking: you are not staker");

        if (block.timestamp - STAKING_PERIOD <= usersStartTime[msg.sender]) {  
            rewards[msg.sender] = rewards[msg.sender] * 60 / 100;   // Pay fee
        }
        
        uint256 amount = balances[msg.sender] + rewards[msg.sender];

        require(amount <= totalBalances + totalRewards, "Staking: contract doesn't own enough tokens");

        totalBalances -= balances[msg.sender];
        totalRewards -= rewards[msg.sender];        
        balances[msg.sender] = 0;
        usersStartTime[msg.sender] = 0;

        token.safeTransfer(msg.sender, amount);
        emit Unstake(msg.sender, amount);  
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalBalances == 0) {
            return rewardPerTokenStored;
        }

        uint256 rewardRate = totalRewards * 1e18 / STAKING_PERIOD;
        return
            rewardPerTokenStored +
            (((block.timestamp - lastUpdateTime) * rewardRate) / maxStakingCap());
    }

    function earned(address account) public view returns (uint256) {
        return
            ((balances[account] *
                (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18) +
            rewards[account];
    }

    function maxStakingCap() public view returns (uint256) {
        return 
            totalRewards * ONE_HUNDRED_PERCENT / apr;
    }
}