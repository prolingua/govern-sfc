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
        string memory option0 = self.getOptionInString(0);
        console.log("option0: ", option0);
        string memory option1 = self.getOptionInString(1);
        console.log("option1: ", option1);
        emit NetworkParameterUpgradeIsDone(newValue);
    }

    function getOptionInString(uint8 index)
        external
        view
        returns (string memory)
    {
        bytes32 option = _options[index];

        uint8 i = 0;
        while (i < 32 && option[i] != 0) {
            i++;
        }
        bytes memory bytesArray = new bytes(i);
        for (i = 0; i < 32 && option[i] != 0; i++) {
            bytesArray[i] = option[i];
        }
        string memory result = string(bytesArray);
        //console.log("result: ", result);
        return result;
    }
}
