pragma solidity ^0.5.0;

import "../base/Cancelable.sol";
import "../../governance/Governance.sol";
import "../../governance/Proposal.sol";
import "../base/CallExecutableProposal.sol";
import "../base/DelegatecallExecutableProposal.sol";
import "hardhat/console.sol";

contract ExecLoggingProposal is CallExecutableProposal, DelegatecallExecutableProposal, Cancelable {
    Proposal.ExecType _exec;
    address public sfc;

    event NetworkParameterUpgradeIsDone(uint256 newValue);

    constructor(string memory v1, string memory v2, bytes32[] memory v3,
        uint256 v4, uint256 v5, uint256 v6, uint256 v7, uint256 v8, address v9, address v10) 
        public {
            _name = v1;
            _description = v2;
            _options = v3;
            _minVotes = v4;
            _minAgreement = v5;
            _opinionScales = [0, 1, 2, 3, 4];
            _start = v6;
            _minEnd = v7;
            _maxEnd = v8;
            sfc = v9;
            // verify the proposal right away to avoid deploying a wrong proposal
            if (v10 != address(0)) {
                require(verifyProposalParams(v9), "failed verification");
            }
        }

    function setOpinionScales(uint256[] memory v) public {
        _opinionScales = v;
    }

    function pType() public view returns (uint256) {
        return 15;
    }

    function executable() public view returns (Proposal.ExecType) {
        return _exec;
    }

    function setExecutable(Proposal.ExecType __exec) public {
        _exec = __exec;
    }

    function cancel(uint256 myID, address govAddress) public {
        Governance gov = Governance(govAddress);
        gov.cancelProposal(myID);
    }

    uint256 public executedCounter;
    address public executedMsgSender;
    address public executedAs;
    uint256 public executedOption;

    function executeNonDelegateCall(address _executedAs, address _executedMsgSender, uint256 optionID) public {
        executedAs = _executedAs;
        executedMsgSender = _executedMsgSender;
        executedCounter += 1;
        executedOption = optionID;
    }
     
    function execute_delegatecall(address selfAddr, uint256 optionID) external {
        console.log("ExecLoggingProposal: execute_delegatecall");
        sfc.call(abi.encodeWithSignature("setMaxDelegation(uint256)", 100));
        ExecLoggingProposal self = ExecLoggingProposal(selfAddr);
        self.executeNonDelegateCall(address(this), msg.sender, optionID);
        console.log("ExecLoggingProposal: execute_delegatecall end");
    }
    
    function execute_call(uint256 optionID) external {
        executeNonDelegateCall(address(this), msg.sender, optionID);
    }
}
