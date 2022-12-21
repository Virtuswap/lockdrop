// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.2;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract MockVPair is ERC20 {
    constructor() ERC20('VS-Liquidity Token', 'VSLT') {}

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }
}
