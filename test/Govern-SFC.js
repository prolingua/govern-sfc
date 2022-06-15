const {
    BN,
    ether,
    expectRevert,
    time,
    balance,
} = require('@openzeppelin/test-helpers');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {expect, assert} = require('chai');
const { evm, exceptions } = require('./test-utils');
const { toNumber } = require('lodash');
chai.use(chaiAsPromised);

// SFC Artifacts
const UnitTestSFC = artifacts.require('UnitTestSFC');
//const SFC = artifacts.require('SFC');
//const StakersConstants = artifacts.require('StakersConstants');
const NodeDriverAuth = artifacts.require('NodeDriverAuth');
const NodeDriver = artifacts.require('NodeDriver');
const NetworkInitializer = artifacts.require('NetworkInitializer');
const StubEvmWriter = artifacts.require('StubEvmWriter');

// Governance Artifacts
const Governance = artifacts.require('UnitTestGovernance');
const ProposalTemplates = artifacts.require('ProposalTemplates');
const UnitTestGovernable = artifacts.require('UnitTestGovernable');
const PlainTextProposal = artifacts.require('PlainTextProposal');
const ExplicitProposal = artifacts.require('ExplicitProposal');
const ExecLoggingProposal = artifacts.require('ExecLoggingProposal');
const AlteredPlainTextProposal = artifacts.require('AlteredPlainTextProposal');
const NetworkParameterProposal = artifacts.require('NetworkParameterProposal');
const BytecodeMatcher = artifacts.require('BytecodeMatcher');
const OwnableVerifier = artifacts.require('OwnableVerifier');

const NonExecutableType = new BN('0');
const CallType = new BN('1');
const DelegatecallType = new BN('2');

function amount18(n) {
    return new BN(web3.utils.toWei(n, 'ether'));
}

function ratio(n) {
    return ether(n);
}

async function sealEpoch(sfc, duration, _validatorsMetrics = undefined) {
    let validatorsMetrics = _validatorsMetrics;
    const validatorIDs = (await sfc.lastValidatorID()).toNumber();

    if (validatorsMetrics === undefined) {
        validatorsMetrics = {};
        for (let i = 0; i < validatorIDs; i++) {
            validatorsMetrics[i] = {
                offlineTime: new BN('0'),
                offlineBlocks: new BN('0'),
                uptime: duration,
                originatedTxsFee: amount18('0'),
            };
        }
    }
    // unpack validator metrics
    const allValidators = [];
    const offlineTimes = [];
    const offlineBlocks = [];
    const uptimes = [];
    const originatedTxsFees = [];
    for (let i = 0; i < validatorIDs; i++) {
        allValidators.push(i + 1);
        offlineTimes.push(validatorsMetrics[i].offlineTime);
        offlineBlocks.push(validatorsMetrics[i].offlineBlocks);
        uptimes.push(validatorsMetrics[i].uptime);
        originatedTxsFees.push(validatorsMetrics[i].originatedTxsFee);
    }

    await sfc.advanceTime(duration);
    await sfc.sealEpoch(offlineTimes, offlineBlocks, uptimes, originatedTxsFees);
    await sfc.sealEpochValidators(allValidators);
}

class BlockchainNode {
    constructor(sfc, minter) {
        this.validators = {};
        this.nextValidators = {};
        this.sfc = sfc;
        this.minter = minter;
    }

    async handle(tx) {
        const logs = tx.receipt.rawLogs;
        for (let i = 0; i < logs.length; i += 1) {
            if (logs[i].topics[0] === web3.utils.sha3('UpdateValidatorWeight(uint256,uint256)')) {
                const validatorID = web3.utils.toBN(logs[i].topics[1]);
                const weight = web3.utils.toBN(logs[i].data);
                if (weight.isZero()) {
                    delete this.nextValidators[validatorID.toString()];
                } else {
                    this.nextValidators[validatorID.toString()] = weight;
                }
            }
        }
    }

    async sealEpoch(duration, _validatorsMetrics = undefined) {
        let validatorsMetrics = _validatorsMetrics;
        const validatorIDs = Object.keys(this.validators);
        const nextValidatorIDs = Object.keys(this.nextValidators);
        if (validatorsMetrics === undefined) {
            validatorsMetrics = {};
            for (let i = 0; i < validatorIDs.length; i += 1) {
                validatorsMetrics[validatorIDs[i].toString()] = {
                    offlineTime: new BN('0'),
                    offlineBlocks: new BN('0'),
                    uptime: duration,
                    originatedTxsFee: amount18('0'),
                };
            }
        }
        // unpack validator metrics
        const offlineTimes = [];
        const offlineBlocks = [];
        const uptimes = [];
        const originatedTxsFees = [];
        for (let i = 0; i < validatorIDs.length; i += 1) {
            offlineTimes.push(validatorsMetrics[validatorIDs[i].toString()].offlineTime);
            offlineBlocks.push(validatorsMetrics[validatorIDs[i].toString()].offlineBlocks);
            uptimes.push(validatorsMetrics[validatorIDs[i].toString()].uptime);
            originatedTxsFees.push(validatorsMetrics[validatorIDs[i].toString()].originatedTxsFee);
        }

        await this.sfc.advanceTime(duration);
        await this.handle(await this.sfc.sealEpoch(offlineTimes, offlineBlocks, uptimes, originatedTxsFees));
        await this.handle(await this.sfc.sealEpochValidators(nextValidatorIDs));
        this.validators = this.nextValidators;
        // clone this.nextValidators
        this.nextValidators = {};
        for (const vid in this.validators) {
            this.nextValidators[vid] = this.validators[vid];
        }
    }
}

const pubkey = '0xc004ad15bf79efee161507f23df3d571021d08a1ac3cc14beb4a9a204f0c60487298d1d736b9fc6f53779c9579968a9421f411d60728d9dac85ad1286c1ca0e82d8a';
const emptyAddr = '0x0000000000000000000000000000000000000000';
const zeroPubKey = '0xc004ad15bf79ef5d7cbdb0f629a6fd7a27b4597fcbf9b7bd9b764efef4ba72b3d4890c89e677a69ffd6f8160c7f0da8b000000000000000000000000000000000000';


contract('Govern-SFC', async ([firstValidator, secondValidator, thirdValidator, defaultAcc, otherAcc, firstVoterAcc, secondVoterAcc, delegatorAcc]) => {
    beforeEach(async () => {
        // Governance
        this.govable = await UnitTestGovernable.new();
        this.verifier = await ProposalTemplates.new();
        this.verifier.initialize();
        this.gov = await Governance.new();
        this.gov.initialize(this.govable.address, this.verifier.address);
        this.proposalFee = await this.gov.proposalFee();
        await evm.mine();

        // SFC 
        this.sfc = await UnitTestSFC.new();
        const nodeIRaw = await NodeDriver.new();
        const evmWriter = await StubEvmWriter.new();
        this.nodeI = await NodeDriverAuth.new();
        const initializer = await NetworkInitializer.new();
        await initializer.initializeAll(0, 0, this.sfc.address, this.nodeI.address, nodeIRaw.address, evmWriter.address, firstValidator, this.gov.address);
        await this.sfc.setMaxDelegation(new BN('16'));
        await this.sfc.setValidatorCommission(new BN('15'));
        await this.sfc.setContractCommission(new BN('30'));
        await this.sfc.setUnlockedRewardRatio(new BN('30'));
        await this.sfc.setMaxLockupDuration(86400);
        await this.sfc.setWithdrawalPeriodEpoch('3');
        await this.sfc.rebaseTime();
        this.node = new BlockchainNode(this.sfc, firstValidator);
    });

    const scales = [0, 2, 3, 4, 5];

    // SFC Tests
    describe('Basic SFC funtions', () => {
        describe('SFC Constants', () => {
            it('Returns current Epoch', async () => {
                expect((await this.sfc.currentEpoch()).toString()).to.equals('1');
            });

            it('Returns minimum amount to stake for a Validator', async () => {
                expect((await this.sfc.minSelfStake()).toString()).to.equals('317500000000000000');
            });

            it('Returns the maximum ratio of delegations a validator can have', async () => {
                expect((await this.sfc.maxDelegatedRatio()).toString()).to.equals('16000000000000000000');
            });

            it('Returns commission fee in percentage a validator will get from a delegation', async () => {
                expect((await this.sfc.validatorCommission()).toString()).to.equals('150000000000000000');
            });

            it('Returns commission fee in percentage a validator will get from a contract', async () => {
                expect((await this.sfc.contractCommission()).toString()).to.equals('300000000000000000');
            });

            it('Returns the ratio of the reward rate at base rate (without lockup)', async () => {
                expect((await this.sfc.unlockedRewardRatio()).toString()).to.equals('300000000000000000');
            });

            it('Should not allow non-owner to update the contractCommission param', async () => {
                await expectRevert(this.sfc.setContractCommission(30, { from: secondValidator }), "VM Exception while processing transaction: reverted with reason string 'SFC: this function is controlled by the owner and governance contract'");
            });

            it('Returns the maximum duration of a stake/delegation lockup', async () => {
                expect((await this.sfc.maxLockupDuration()).toString()).to.equals('31536000');
            });

            it('Should not allow non-owner to update the unlockedRewardRatio param', async () => {
                await expectRevert(this.sfc.setUnlockedRewardRatio(30, { from: secondValidator }), "VM Exception while processing transaction: reverted with reason string 'SFC: this function is controlled by the owner and governance contract'");
            });

            it('Returns the number of epochs that stake is locked', async () => {
                expect((await this.sfc.withdrawalPeriodEpochs()).toString()).to.equals('3');
            });

            it('Should not allow non-owner to update the minLockupDuration param', async () => {
                await expectRevert(this.sfc.setMinLockupDuration(86400, { from: secondValidator }), "VM Exception while processing transaction: reverted with reason string 'SFC: this function is controlled by the owner and governance contract'");
            });

            it('Should create a Validator and return the ID', async () => {
                await this.sfc.createValidator(pubkey, {
                    from: secondValidator,
                    value: amount18('10'),
                });
                const lastValidatorID = await this.sfc.lastValidatorID();

                expect(lastValidatorID.toString()).to.equals('1');
            });

            it('Should not allow non-owner to update the maxLockupDuration param', async () => {
                await expectRevert(this.sfc.setMaxLockupDuration(86400, { from: secondValidator }), "VM Exception while processing transaction: reverted with reason string 'SFC: this function is controlled by the owner and governance contract'");
            });

            it('Should fail if pubkey is empty', async () => {
                await expectRevert(this.sfc.createValidator(web3.utils.stringToHex(''), {
                    from: secondValidator,
                    value: amount18('10'),
                }), 'empty pubkey');
            });

            it('Should fail if last bytes of pubkey contains 0', async () => {
                await expectRevert(this.sfc.createValidator(zeroPubKey, {
                    from: secondValidator,
                    value: amount18('10'),
                }), 'invalid pubkey');
            });

            it('Should not allow non-owner to update the withdrawalPeriodEpochs param', async () => {
                await expectRevert(this.sfc.setWithdrawalPeriodEpoch(86400, { from: secondValidator }), "VM Exception while processing transaction: reverted with reason string 'SFC: this function is controlled by the owner and governance contract'");
            });

            it('Should return Delegation', async () => {
                await this.sfc.createValidator(pubkey, {
                    from: secondValidator,
                    value: amount18('10'),
                });
                (await this.sfc.delegate(1, { from: secondValidator, value: 1 }));
            });

            it('Should not allow non-owner to update the withdrawalPeriodTime param', async () => {
                await expectRevert(this.sfc.setWithdrawalPeriodTime(604800, { from: secondValidator }), "VM Exception while processing transaction: reverted with reason string 'SFC: this function is controlled by the owner and governance contract'");
            });

            it('Returns current Epoch', async () => {
                expect((await this.sfc.currentEpoch()).toString()).to.equals('1');
            });

            it('Should return current Sealed Epoch', async () => {
                expect((await this.sfc.currentSealedEpoch()).toString()).to.equals('0');
            });

            it('Should return Now()', async () => {
                var ts = (await web3.eth.getBlock('latest')).timestamp;
                expect((await this.sfc.getBlockTime()).toNumber()).to.be.within(ts - 100, ts + 100);
            });

            it('Should return getTime()', async () => {
                var ts = (await web3.eth.getBlock('latest')).timestamp;
                expect((await this.sfc.getTime()).toNumber()).to.be.within(ts - 100, ts + 100);
            });

            it('Should return governance address', async () => {
                expect((await this.sfc.getGovernance()).toString()).to.equals(this.gov.address);
            });

            it('Should return active proposals', async () => {
                expect((await this.sfc.activeProposals()).toString()).to.equals('0');
            });
            
        });

        describe('Initialize', () => {
            it('Should have been initialized with firstValidator', async () => {
                expect(await this.sfc.owner()).to.equals(firstValidator);
            });
        });

        describe('Ownable', () => {
            it('Should return the owner of the contract', async () => {
                expect(await this.sfc.owner()).to.equals(firstValidator);
            });

            it('Should return true if the caller is the owner of the contract', async () => {
                expect(await this.sfc.isOwner()).to.equals(true);
                expect(await this.sfc.isOwner({ from: thirdValidator })).to.equals(false);
            });

            it('Should return address(0) if owner leaves the contract without owner', async () => {
                expect(await this.sfc.owner()).to.equals(firstValidator);
                expect(await this.sfc.renounceOwnership());
                expect(await this.sfc.owner()).to.equals('0x0000000000000000000000000000000000000000');
            });

            it('Should transfer ownership to the new owner', async () => {
                expect(await this.sfc.owner()).to.equals(firstValidator);
                expect(await this.sfc.transferOwnership(secondValidator));
                expect(await this.sfc.owner()).to.equals(secondValidator);
            });

            it('Should not be able to transfer ownership if not owner', async () => {
                await expect(this.sfc.transferOwnership(secondValidator, { from: secondValidator })).to.be.rejectedWith(Error);
            });

            it('Should not be able to transfer ownership to address(0)', async () => {
                await expect(this.sfc.transferOwnership('0x0000000000000000000000000000000000000000')).to.be.rejectedWith(Error);
            });
        });

        describe('Events emitters', () => {
            it('Should call updateNetworkRules', async () => {
                await this.nodeI.updateNetworkRules('0x7b22446167223a7b224d6178506172656e7473223a357d2c2245636f6e6f6d79223a7b22426c6f636b4d6973736564536c61636b223a377d2c22426c6f636b73223a7b22426c6f636b476173486172644c696d6974223a313030307d7d');
            });

            it('Should call updateOfflinePenaltyThreshold', async () => {
                await this.sfc.updateOfflinePenaltyThreshold(1, 10);
            });
        });
    });

    describe('Governance test', () => {
        describe('Proposals', () => {
            it('checking deployment of a plaintext proposal contract', async () => {
                const examplePlaintext = await PlainTextProposal.new('example', 'example-descr', [], 0, 0, 0, 0, 0, emptyAddr);
                const plaintextBytecodeVerifier = await BytecodeMatcher.new();
                await plaintextBytecodeVerifier.initialize(examplePlaintext.address);
                this.verifier.addTemplate(1, 'plaintext', plaintextBytecodeVerifier.address, NonExecutableType, ratio('0.4'), ratio('0.6'), [0, 1, 2, 3, 4], 120, 1200, 0, 60);
                const option = web3.utils.fromAscii('option');
                await expectRevert(PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.4'), ratio('0.6'), 0, 120, 1201, this.verifier.address), 'failed verification');
                await expectRevert(PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.4'), ratio('0.6'), 0, 119, 1201, this.verifier.address), 'failed verification');
                await expectRevert(PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.4'), ratio('0.6'), 61, 119, 1201, this.verifier.address), 'failed verification');
                await expectRevert(PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.4'), ratio('0.6'), 0, 501, 500, this.verifier.address), 'failed verification');
                await expectRevert(PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.399'), ratio('0.6'), 0, 501, 500, this.verifier.address), 'failed verification');
                await expectRevert(PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('1.01'), ratio('0.6'), 0, 501, 500, this.verifier.address), 'failed verification');
                await expectRevert(PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.4'), ratio('0.599'), 60, 120, 1200, this.verifier.address), 'failed verification');
                await expectRevert(PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.4'), ratio('1.01'), 60, 120, 1200, this.verifier.address), 'failed verification');
                await PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.4'), ratio('0.6'), 60, 120, 1200, this.verifier.address);
                await PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.4'), ratio('0.6'), 0, 1200, 1200, this.verifier.address);
                await PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.4'), ratio('0.6'), 0, 120, 120, this.verifier.address);
                await PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.4'), ratio('0.6'), 0, 120, 1200, this.verifier.address);
                await PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('1.0'), ratio('0.6'), 0, 120, 1200, this.verifier.address);
                await PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.5'), ratio('0.6'), 30, 121, 1199, this.verifier.address);
                await PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.5'), ratio('0.8'), 30, 121, 1199, this.verifier.address);
            });
        
            it('checking creation of a plaintext proposal', async () => {
                const pType = new BN(1);
                var ts = (await web3.eth.getBlock('latest')).timestamp;
                const examplePlaintext = await PlainTextProposal.new('example', 'example-descr', [], 0, 0, 0, 0, 0, emptyAddr);
                const plaintextBytecodeVerifier = await BytecodeMatcher.new();
                await plaintextBytecodeVerifier.initialize(examplePlaintext.address);
                this.verifier.addTemplate(pType, 'plaintext', plaintextBytecodeVerifier.address, NonExecutableType, ratio('0.4'), ratio('0.6'), [0, 1, 2, 3, 4], 120, 1200, 0, 60);
                const option = web3.utils.fromAscii('option');
                const emptyOptions = await PlainTextProposal.new('plaintext', 'plaintext-descr', [], ratio('0.5'), ratio('0.6'), 30, 121, 1199, this.verifier.address);
                const tooManyOptions = await PlainTextProposal.new('plaintext', 'plaintext-descr', [option, option, option, option, option, option, option, option, option, option, option], ratio('0.5'), ratio('0.6'), 30, 121, 1199, this.verifier.address);
                const wrongVotes = await PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.3'), ratio('0.6'), 30, 121, 1199, emptyAddr);
                const wrongCode = await AlteredPlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.5'), ratio('0.6'), 30, 121, 1199, emptyAddr);
                const manyOptions = await PlainTextProposal.new('plaintext', 'plaintext-descr', [option, option, option, option, option, option, option, option, option, option], ratio('0.5'), ratio('0.6'), 30, 121, 1199, this.verifier.address);
                const oneOption = await PlainTextProposal.new('plaintext', 'plaintext-descr', [option], ratio('0.51'), ratio('0.6'), 30, 122, 1198, this.verifier.address);
        
                await expectRevert(this.gov.createProposal(emptyOptions.address, {value: this.proposalFee}), 'proposal options are empty - nothing to vote for');
                await expectRevert(this.gov.createProposal(tooManyOptions.address, {value: this.proposalFee}), 'too many options');
                await expectRevert(this.gov.createProposal(wrongVotes.address, {value: this.proposalFee}), 'proposal parameters failed verification');
                await expectRevert(this.gov.createProposal(wrongCode.address, {value: this.proposalFee}), 'proposal contract failed verification');
                await expectRevert(this.gov.createProposal(manyOptions.address), 'paid proposal fee is wrong');
                await expectRevert(this.gov.createProposal(manyOptions.address, {value: this.proposalFee.add(new BN(1))}), 'paid proposal fee is wrong');
                await this.gov.createProposal(manyOptions.address, {value: this.proposalFee});
                await this.gov.createProposal(oneOption.address, {value: this.proposalFee});
        
                const infoManyOptions = await this.gov.proposalParams(1);
                expect(infoManyOptions.pType).to.be.bignumber.equal(pType);
                expect(infoManyOptions.executable).to.be.bignumber.equal(NonExecutableType);
                expect(infoManyOptions.minVotes).to.be.bignumber.equal(ratio('0.5'));
                expect(infoManyOptions.proposalContract).to.equal(manyOptions.address);
                expect(infoManyOptions.options.length).to.equal(10);
                expect(infoManyOptions.options[0]).to.equal('0x6f7074696f6e0000000000000000000000000000000000000000000000000000');
                //expect(infoManyOptions.votingStartTime).to.be.bignumber.least(ts);
                assert.isAtLeast((infoManyOptions.votingStartTime).toNumber(), ts);
                expect(infoManyOptions.votingMinEndTime).to.be.bignumber.equal(infoManyOptions.votingStartTime.add(new BN(121)));
                expect(infoManyOptions.votingMaxEndTime).to.be.bignumber.equal(infoManyOptions.votingStartTime.add(new BN(1199)));
                const infoOneOption = await this.gov.proposalParams(2);
                expect(infoOneOption.pType).to.be.bignumber.equal(pType);
                expect(infoOneOption.executable).to.be.bignumber.equal(NonExecutableType);
                expect(infoOneOption.minVotes).to.be.bignumber.equal(ratio('0.51'));
                expect(infoOneOption.proposalContract).to.equal(oneOption.address);
                expect(infoOneOption.options.length).to.equal(1);
                //expect(infoOneOption.votingStartTime).to.be.bignumber.least(now);
                assert.isAtLeast((infoOneOption.votingStartTime).toNumber(), ts);
                expect(infoOneOption.votingMinEndTime).to.be.bignumber.equal(infoOneOption.votingStartTime.add(new BN(122)));
                expect(infoOneOption.votingMaxEndTime).to.be.bignumber.equal(infoOneOption.votingStartTime.add(new BN(1198)));
            });
        
            const createProposal = async (_exec, optionsNum, minVotes, minAgreement, startDelay = 0, minEnd = 120, maxEnd = 1200, _scales = scales) => {
                if (await this.verifier.exists(15) === false) {
                    await this.verifier.addTemplate(15, 'ExecLoggingProposal', emptyAddr, _exec, ratio('0.0'), ratio('0.0'), _scales, 0, 100000000, 0, 100000000);
                }
                const option = web3.utils.fromAscii('option');
                const options = [];
                for (let i = 0; i < optionsNum; i++) {
                    options.push(option);
                }
                const contract = await ExecLoggingProposal.new('network', 'network-descr', options, minVotes, minAgreement, startDelay, minEnd, maxEnd, this.sfc.address, emptyAddr);
                await contract.setOpinionScales(_scales);
                await contract.setExecutable(_exec);
        
                await this.gov.createProposal(contract.address, {value: this.proposalFee});
        
                return {proposalID: await this.gov.lastProposalID(), proposal: contract};
            };

             /**
            it('checking proposal execution via delegatecall', async () => {
                const optionsNum = 1; // use maximum number of options to test gas usage
                const choices = [new BN(4)];
                const proposalInfo = await createProposal(DelegatecallType, optionsNum, ratio('0.5'), ratio('0.6'), 0, 120);
                const proposalID = proposalInfo.proposalID;
                const proposalContract = proposalInfo.proposal;
                // make new vote
                await this.govable.stake(firstValidator, ether('10.0'));
                await this.gov.vote(firstValidator, proposalID, choices);
        
                // finalize voting by handling its task
                evm.advanceTime(120); // wait until min voting end time
                await this.gov.handleTasks(0, 1);
        
                // check proposal execution via delegatecall
                expect(await proposalContract.executedCounter()).to.be.bignumber.equal(new BN(1));
                expect(await proposalContract.executedMsgSender()).to.equal(firstValidator);
                expect(await proposalContract.executedAs()).to.equal(this.gov.address);
                expect(await proposalContract.executedOption()).to.be.bignumber.equal(new BN(0));
            });
             */            it('checking proposal execution via delegatecall', async () => {
                expect((await this.sfc.activeProposals()).toString()).to.equals('0');
                const optionsNum = 1; // use maximum number of options to test gas usage
                const choices = [new BN(4)];
                const proposalInfo = await createProposal(DelegatecallType, optionsNum, ratio('0.5'), ratio('0.6'), 0, 120);
                expect((await this.sfc.activeProposals()).toString()).to.equals('1');
                const proposalID = proposalInfo.proposalID;
                const proposalContract = proposalInfo.proposal;
                // make new vote
                await this.govable.stake(firstValidator, ether('10.0'));
                await this.gov.vote(firstValidator, proposalID, choices);
                // finalize voting by handling its task
                evm.advanceTime(120); // wait until min voting end time
                await this.gov.handleTasks(0, 1);

                // check proposal status
                const proposalStateInfo = await this.gov.proposalState(proposalID);
                expect(proposalStateInfo.winnerOptionID).to.be.bignumber.equal(new BN(0));
                expect(proposalStateInfo.votes).to.be.bignumber.equal(ether('10.0'));
                expect(proposalStateInfo.status).to.be.bignumber.equal(new BN(1));

                expect((await this.sfc.activeProposals()).toString()).to.equals('0');
                expect((await this.sfc.maxDelegatedRatio()).toString()).to.equals('100000000000000000000');
            });

        });
    });
});