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
//
//             ||                  
//             \/                      If the user's balance  is constant over that period, then the above formula can be simplified to:
//
//            t1
//           =====
//           \       1
//  R * l *   >    ----
//           /     L(t)
//           =====
//           t = t0
//
//             ||                  
//             \/                      We can then decompose that sum into a difference of two sums:
//
//         /  t1           t0        \
//         | =====        =====      |
//         | \       1    \       1  |
// R * l * |  >    ---- -  >    ---- |
//         | /     L(t)   /     L(t) |
//         | =====        =====      |
//         \ t = 0        t = 0      /
//
//             ||                      This means that all we need to track in the staking contract is a
//             ||                      single accumulator tracking "seconds per liquidity" since the beginning of the pool:
//             \/                      In the contract, this accumulator is called 'rewardPerTokenStored'.
//
//            t
//             i
//           =====                   
//           \       1              
//  s (t ) =  >    ----                
//   l  i    /     L(t)                
//           =====                     
//           t = 0                   
//
//             ||                      When someone stakes tokens, the contract checkpoints their starting value of the accumulator s (t )
//             ||                      When they later unstake, the contract looks at the new value of the accumulator s (t )        l  0
//             \/                      and computes their rewards for that period.                                      l  1
//
//   R(l, s (t ), s (t )) = R * l * (s (t ) - s (t ))
//         l  1    l  0               l  1     l  0


contract StakingContract is IStakingContract, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public token;

    uint256 internal constant ONE_HUNDRED_PERCENT = 100 ether;
    uint256 public constant MAX_APR = 10 ether;
    uint256 public constant MAX_REWARD_CAP = 500_000 ether;
    uint32 public constant STAKING_PERIOD = 365 days;
    uint32 public constant COOLDOWN_PERIOD = 10 days;

    mapping(address => UserInfo) public usersInfo;

    uint256 internal lastUpdateTime;
    uint256 internal rewardPerTokenStored;
    uint256 public rewardRate;
    uint256 public maxStakingCap;

    uint256 public totalBalances;
    uint256 public totalRewards;
    uint256 public startTime;
    uint256 public apr;
    bool internal isStakingInitialized;

    /**
     * @dev Initializes the accepted token as a reward token.
     *
     * @param tokenAddress ERC-20 token address.
     */
    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Staking: token address is zero");
        token = IERC20(tokenAddress);
    }

    /**
     * @dev Initializes the staking.
     * Can only be called by the current owner.
     * Can be called only once.
     * 
     * Emits an {SetRewards} event that indicates the initialization of the staking.
     *
     * @param _start Start time
     * @param _rewardAmounts Reward amounts
     * @param _apr Annual percentage rate
     */
    function setRewards(
        uint256 _start,
        uint256 _rewardAmounts,
        uint256 _apr
    ) external override onlyOwner {
        require(!isStakingInitialized, "Staking: setRewards can only be called once");
        require(_start >= block.timestamp, "Staking: start time is less than block timestamp");
        require(_rewardAmounts > 0, "Staking: zero transaction amount");
        require(_rewardAmounts <= MAX_REWARD_CAP, "Staking: reward amounts exceeds the limit");
        require(_apr > 0, "Staking: apr is zero");
        require(_apr <= MAX_APR, "Staking: apr exceeds the limit");

        startTime = _start;
        apr = _apr;
        totalRewards = _rewardAmounts;

        maxStakingCap = totalRewards * ONE_HUNDRED_PERCENT / apr;
        rewardRate = totalRewards * 1e18 / STAKING_PERIOD;
        isStakingInitialized = true;

        token.safeTransferFrom(msg.sender, address(this), _rewardAmounts); 
        emit SetRewards(_start, _rewardAmounts, _apr);
    }

    /**
     * @dev Transfers the amount of tokens from the user account and register staking for him
     * 
     * Emits an {Stake} event that indicates the registration of staking for user.
     *
     * @param _amount Amount of tokens
     */
    function stake(uint256 _amount) external override {
        require(isStakingInitialized, "Staking: staking hasn't initialized");
        require(block.timestamp >= startTime, "Staking: staking has't started");
        require(usersInfo[msg.sender].lastTimeStaked + COOLDOWN_PERIOD < block.timestamp, "Staking: stake cooldown is not over"); 

        updateReward(msg.sender);

        require(_amount > 0, "Staking: zero transaction amount");    
        require(totalBalances + _amount <= maxStakingCap, "Staking: total staking cap limit exceeded");

        totalBalances += _amount;
        usersInfo[msg.sender].balance += _amount;  
        usersInfo[msg.sender].lastTimeStaked = block.timestamp;

        token.safeTransferFrom(msg.sender, address(this), _amount);
        emit Stake(msg.sender, _amount);
    }

    /**
     * @dev Transfers all staked tokens and rewards to the user account and update staking details for him
     * 
     * Emits an {Unstake} event that indicates the unregistration of staking for user.
     *
     */
    function unstake() external override {
        require(usersInfo[msg.sender].balance > 0, "Staking: you are not staker");

        updateReward(msg.sender);

        if (block.timestamp - STAKING_PERIOD <= usersInfo[msg.sender].lastTimeStaked) {  
            usersInfo[msg.sender].rewards = usersInfo[msg.sender].rewards * 60 / 100;   // Pay fee
        }
        
        uint256 amount = usersInfo[msg.sender].balance + usersInfo[msg.sender].rewards;

        require(amount <= totalBalances + totalRewards, "Staking: contract doesn't own enough tokens");

        totalBalances -= usersInfo[msg.sender].balance;  
        totalRewards -= usersInfo[msg.sender].rewards;   
        usersInfo[msg.sender].balance = 0;
        usersInfo[msg.sender].rewards = 0;
        usersInfo[msg.sender].lastTimeStaked = 0;

        token.safeTransfer(msg.sender, amount);
        emit Unstake(msg.sender, amount);  
    }

    /**
     * @dev Calculates a accumulator called "rewardPerTokenStored"
     * Without parameters.
     */
    function rewardPerToken() public view returns (uint256) {
        if (totalBalances == 0) {
            return 0;
        }
        return
            rewardPerTokenStored +
            (((block.timestamp - lastUpdateTime) * rewardRate) / maxStakingCap);
    }

    /**
     * @dev Calculates the reward for the user
     * @param account User address
     */
    function earned(address account) public view returns (uint256) {
        return
            ((usersInfo[account].balance *
                (rewardPerToken() - usersInfo[account].rewardPerTokenPaid)) / 1e18) +
            usersInfo[account].rewards;
    }

    /**
     * @dev Updates the "rewardPerTokenStored" variable and reward for the user
     * @param account User address
     */
    function updateReward(address account) internal {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;
        
        usersInfo[account].rewards = earned(account);
        usersInfo[account].rewardPerTokenPaid = rewardPerTokenStored;
    }

    /**
     * @dev Transfers the amount of reward tokens back to the owner.
     * Can only be called by the current owner.
     * Without parameters.
     *
     * Emits an {WithdrawTokens} event that indicates who and how much withdraw tokens from the contract.
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 totalTokens = IERC20(token).balanceOf(address(this));
        uint256 amountToWithdraw = totalTokens - totalBalances;

        require(amountToWithdraw > 0, "Vesting: transaction amount is zero");

        token.safeTransfer(msg.sender, amountToWithdraw);
        emit EmergencyWithdraw(msg.sender, amountToWithdraw);
    }
}