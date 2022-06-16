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
        this.proposalTemplates.address
      );
      this.sfc.initialize(
        0,
        0,
        emptyAddr,
        defaultAcc,
        this.unitTestGovernance.address
      );
      this.proposalFee = await this.unitTestGovernance.proposalFee();
    });

    it('checking execute_call of an executable proposal contract', async () => {
      //const option = web3.utils.fromAscii('hello');
      const options = [];
      for (let i = 0; i < 5; i++) {
        //options.push(option);
        options.push(web3.utils.fromAscii('hello' + i.toString()));
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

      //console.log('this.sfc.address: ', this.sfc.address);
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

      //const options2 = await networkParameterProposal.options();
      //console.log('options2: ', options2);

      /* const option0 = await networkParameterProposal.getOptionInString(0);
      console.log('option0: ', option0);

      const option1 = await networkParameterProposal.getOptionInString(1);
      console.log('option1: ', option1); */

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

      const maxDelegation_before = await this.sfc.viewMaxDelegation();

      //console.log('maxDelegation_before: ', maxDelegation_before.toString());
      /* console.log(
        'networkParameterProposal.address: ',
        networkParameterProposal.address
      );
      console.log(
        'this.unitTestGovernance.address: ',
        this.unitTestGovernance.address
      ); */
      await this.unitTestGovernance.handleTasks(0, 1);
      const maxDelegation_after = await this.sfc.viewMaxDelegation();
      // console.log('maxDelegation_after: ', maxDelegation_after.toString());
    });
  }
);
