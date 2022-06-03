pragma solidity ^0.5.0;

import "../upgrade/Upgradability.sol";
import "./base/Cancelable.sol";
import "./base/DelegatecallExecutableProposal.sol";
import "../ownership/GovernanceRole.sol";

interface SFC {
    function setMaxDelegation(uint256 _maxDelegationRatio) external;
}

/**
 * @dev SoftwareUpgrade proposal
 */
contract NetworkParameterProposal is DelegatecallExecutableProposal, Cancelable {
    SFC public sfc;

    constructor(string memory __name, string memory __description, bytes32[] memory __options, 
    uint256 __minVotes, uint256 __minAgreement, uint256 __start, uint256 __minEnd, uint256 __maxEnd, address _sfc, 
        address verifier) public {
        _name = __name;
        _description = __description;
        _options = __options;
        _minVotes = __minVotes;
        _minAgreement = __minAgreement;
        _opinionScales = [0, 1, 2, 3, 4];
        _start = __start;
        _minEnd = __minEnd;
        _maxEnd = __maxEnd;
        sfc = SFC(_sfc);
        
       // verify the proposal right away to avoid deploying a wrong proposal
        if (verifier != address(0)) {
            require(verifyProposalParams(verifier), "failed verification");
        }
    }

    function execute_delegatecall(address, uint256 newValue) external {
        sfc.setMaxDelegation(newValue);
    }
}