pragma solidity ^0.5.0;

import "./base/Cancelable.sol";
import "./base/DelegatecallExecutableProposal.sol";
import "hardhat/console.sol";

interface SFC {
    function setMaxDelegation(uint256 _maxDelegationRatio) external;
}

/**
 * @dev NetworkParameter proposal
 */
contract NetworkParameterProposal is
    DelegatecallExecutableProposal,
    Cancelable
{
    address public sfc;

    constructor(
        string memory __name,
        string memory __description,
        bytes32[] memory __options,
        uint256 __minVotes,
        uint256 __minAgreement,
        uint256 __start,
        uint256 __minEnd,
        uint256 __maxEnd,
        address _sfc,
        address verifier
    ) public {
        _name = __name;
        _description = __description;
        _options = __options;
        _minVotes = __minVotes;
        _minAgreement = __minAgreement;
        _opinionScales = [0, 1, 2, 3, 4];
        _start = __start;
        _minEnd = __minEnd;
        _maxEnd = __maxEnd;
        sfc = _sfc;
        // verify the proposal right away to avoid deploying a wrong proposal
        if (verifier != address(0)) {
            require(verifyProposalParams(verifier), "failed verification");
        }
    }

    event NetworkParameterUpgradeIsDone(uint256 newValue);

    function execute_delegatecall(address selfAddr, uint256 newValue) external {
        NetworkParameterProposal self = NetworkParameterProposal(selfAddr);
        SFC(self.sfc()).setMaxDelegation(100);
        emit NetworkParameterUpgradeIsDone(newValue);
    }

    function convertOption(bytes32 option) public view returns (uint256) {
        uint8 i = 0;
        while (i < 32 && option[i] != 0) {
            i++;
        }
        bytes memory bytesArray1 = new bytes(i);
        for (i = 0; i < 32 && option[i] != 0; i++) {
            bytesArray1[i] = option[i];
        }
        string memory stringResult = string(bytesArray1);

        bytes memory bytesArray2 = bytes(stringResult);

        uint256 result = 0;
        for (i = 0; i < bytesArray2.length; i++) {
            uint256 c = uint256(uint8(bytesArray2[i]));
            if (c >= 48 && c <= 57) {
                result = result * 10 + (c - 48);
            }
        }

        return result;
    }
}
