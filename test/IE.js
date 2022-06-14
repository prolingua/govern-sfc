const {
  BN,
  ether,
  expectRevert,
  time,
  balance
} = require('@openzeppelin/test-helpers');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { expect, assert } = require('chai');
const { evm, exceptions } = require('./test-utils');
const { toNumber } = require('lodash');
chai.use(chaiAsPromised);

// SFC Artifacts
const UnitTestSFC = artifacts.require('UnitTestSFC');
// Governance Artifacts
const UnitTestGovernance = artifacts.require('UnitTestGovernance');
const ProposalTemplates = artifacts.require('ProposalTemplates');
const UnitTestGovernable = artifacts.require('UnitTestGovernable');
const NetworkParameterProposal = artifacts.require('NetworkParameterProposal');

const NonExecutableType = new BN('0');
const CallType = new BN('1');
const DelegatecallType = new BN('2');

function ratio(n) {
  return ether(n);
}

const emptyAddr = '0x0000000000000000000000000000000000000000';

contract(
  'NPP',
  async ([
    defaultAcc,
    otherAcc,
    firstVoterAcc,
    secondVoterAcc,
    delegatorAcc
  ]) => {
    beforeEach(async () => {
      this.unitTestGovernable = await UnitTestGovernable.new();
      this.unitTestGovernance = await UnitTestGovernance.new();
      this.proposalTemplates = await ProposalTemplates.new();
      this.sfc = await UnitTestSFC.new();
      await this.proposalTemplates.initialize();
      await this.unitTestGovernance.initialize(
        this.unitTestGovernable.address,
        this.proposalTemplates.address,
        this.sfc.address
      );
      this.proposalFee = await this.unitTestGovernance.proposalFee();
    });

    it('checking execute_call of an executable proposal contract', async () => {
      const option = web3.utils.fromAscii('option');
      const options = [];
      for (let i = 0; i < 5; i++) {
        options.push(option);
      }
      const scales = [0, 1, 2, 3, 4];

      const choices = [new BN(2), new BN(2), new BN(3), new BN(2), new BN(2)];

      await this.proposalTemplates.addTemplate(
        3,
        'NetworkParameterProposal',
        emptyAddr,
        DelegatecallType,
        ratio('0.0'),
        ratio('0.0'),
        scales,
        0,
        100000000,
        0,
        100000000
      );

      const networkParameterProposal = await NetworkParameterProposal.new(
        'logger',
        'logger-descr',
        options,
        ratio('0.5'),
        ratio('0.6'),
        0,
        120,
        1200,
        this.sfc.address,
        emptyAddr
      );

      /* const pType = await networkParameterProposal.pType();
      console.log(pType.toString()); */

      await this.unitTestGovernance.createProposal(
        networkParameterProposal.address,
        {
          value: this.proposalFee
        }
      );

      const proposalID = await this.unitTestGovernance.lastProposalID();

      evm.advanceTime(150);

      await this.unitTestGovernable.stake(defaultAcc, ether('10.0'));
      await this.unitTestGovernance.vote(defaultAcc, proposalID, choices);

      await this.unitTestGovernable.stake(otherAcc, ether('10.0'));
      await this.unitTestGovernance.vote(otherAcc, proposalID, choices, {
        from: otherAcc
      });

      const myCounter_callee_before = await networkParameterProposal.myCounter();
      const myCounter_caller_before = await this.unitTestGovernance.myCounter();
      console.log(
        'myCounter_callee_before: ',
        myCounter_callee_before.toString()
      );
      console.log(
        'myCounter_caller_before: ',
        myCounter_caller_before.toString()
      );
      await this.unitTestGovernance.handleTasks(0, 1);
      const myCounter_callee_after = await networkParameterProposal.myCounter();
      const myCounter_caller_after = await this.unitTestGovernance.myCounter();
      console.log(
        'myCounter_callee_after: ',
        myCounter_callee_after.toString()
      );
      console.log(
        'myCounter_caller_after: ',
        myCounter_caller_after.toString()
      );
    });
  }
);