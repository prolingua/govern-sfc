pragma solidity ^0.5.0;

import "../common/Initializable.sol";

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * the governance contract is granted exclusive access to specific functions.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyGovernance`, which can be applied to your functions to restrict their use to
 * the governance contract.
 */
contract GovernanceRole is Initializable {

    /**
     * @dev Address of the model governing the SFC.
     */
    address private _governance;
    address private _owner;

    event GovernanceTransferred(address indexed previousGovernance, address indexed newGovernance);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the initial governance role.
     */
    function initialize(address governance, address owner) internal initializer {
        _governance = governance;
        _owner = owner;
        emit GovernanceTransferred(address(0), _governance);
        emit OwnershipTransferred(address(0), _owner);
    }

    /**
     * @dev Returns the address of the current governance contract.
     */
    function governance() public view returns (address) {
        return _governance;
    }

    /**
     * @dev Throws if called by any address other than the governance contract.
     */
    modifier onlyGovernance() {
        require((isGovernance() || isOwner()), "GovernanceRole: this function is controlled by the owner and governance contract");
        _;
    }

    /**
     * @dev Returns true if the caller is the current governance contract.
     */
    function isGovernance() public view returns (bool) {
        return msg.sender == _governance;
    }

    /**
     * @dev Transfers governance access role of the contract to a new account (`newGovernance`).
     * Can only be called by the current governance contract.
     */
    function transferGovernance(address newGovernance) public onlyGovernance {
        _transferGovernance(newGovernance);
    }

    /**
     * @dev Transfers governance access role of the contract to a new account (`newGovernance`).
     */
    function _transferGovernance(address newGovernance) internal {
        require(newGovernance != address(0), "GovernanceRole: new governance is the zero address");
        emit GovernanceTransferred(_governance, newGovernance);
        _governance = newGovernance;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }

    /**
     * @dev Returns true if the caller is the current owner.
     */
    function isOwner() public view returns (bool) {
        return msg.sender == _owner;
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public onlyOwner {
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     */
    function _transferOwnership(address newOwner) internal {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }

    uint256[50] private ______gap;
}
