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
    address private _secondaryOwner;

    event GovernanceTransferred(address indexed previousGovernance, address indexed newGovernance);
    event SecondaryOwnershipTransferred(address indexed previousSecondaryOwner, address indexed newSecondaryOwner);

    /**
     * @dev Initializes the contract setting the initial governance role.
     */
    function initialize(address governance, address secondaryOwner) internal initializer {
        _governance = governance;
        _secondaryOwner = secondaryOwner;
        emit GovernanceTransferred(address(0), _governance);
        emit SecondaryOwnershipTransferred(address(0), _secondaryOwner);
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
        require((isGovernance() || isSecondaryOwner()), "GovernanceRole: this function is controlled by the owner and governance contract");
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
     * @dev Returns the address of the current secondary owner.
     */
    function secondaryOwner() public view returns (address) {
        return _secondaryOwner;
    }

    /**
     * @dev Throws if called by any account other than the secondary owner.
     */
    modifier onlySecondaryOwner() {
        require(isSecondaryOwner(), "GovernanceRole: caller is not the secondary owner");
        _;
    }

    /**
     * @dev Returns true if the caller is the current secondary owner.
     */
    function isSecondaryOwner() public view returns (bool) {
        return msg.sender == _secondaryOwner;
    }

    /**
     * @dev Transfers secondary ownership of the contract to a new account (`newSecondaryOwner`).
     * Can only be called by the current owner.
     */
    function transferSecondaryOwnership(address newSecondaryOwner) public onlySecondaryOwner {
        _transferSecondaryOwnership(newSecondaryOwner);
    }

    /**
     * @dev Transfers secondary ownership of the contract to a new account (`newSecondaryOwner`).
     */
    function _transferSecondaryOwnership(address newSecondaryOwner) internal {
        require(newSecondaryOwner != address(0), "GovernanceRole: new secondary owner is the zero address");
        emit SecondaryOwnershipTransferred(_secondaryOwner, newSecondaryOwner);
        _secondaryOwner = newSecondaryOwner;
    }

    uint256[50] private ______gap;
}
