import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// For timestamp verification
const anyValue = () => true;

describe("RiskScore Contract", function () {
  let riskScore: Contract;
  let owner: SignerWithAddress;
  let insuranceCompany1: SignerWithAddress;
  let insuranceCompany2: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  // Set a longer timeout for FHE operations
  this.timeout(60000);

  beforeEach(async function () {
    // Get signers
    const signers = await ethers.getSigners();
    owner = signers[0];
    insuranceCompany1 = signers[1];
    insuranceCompany2 = signers[2];
    user1 = signers[3];
    user2 = signers[4];
    
    // Deploy the contract
    const RiskScore = await ethers.getContractFactory("RiskScore");
    riskScore = await RiskScore.deploy();
    await riskScore.deployed();
  });

  describe("Insurance Company Registration", function () {
    it("Should allow insurance company to register", async function () {
      const companyName = "Test Insurance Co";
      
      // Register company
      await expect(riskScore.connect(insuranceCompany1).registerInsuranceCompany(companyName))
        .to.emit(riskScore, "InsuranceCompanyRegistered")
        .withArgs(insuranceCompany1.address, companyName);

      // Verify company is registered
      const company = await riskScore.insuranceCompanies(insuranceCompany1.address);
      
      expect(company.companyName).to.equal(companyName);
      expect(company.isRegistered).to.be.true;
      expect(company.companyAddress).to.equal(insuranceCompany1.address);
    });

    it("Should prevent duplicate company registration", async function () {
      const companyName = "Test Insurance Co";
      
      // First registration should succeed
      await riskScore.connect(insuranceCompany1).registerInsuranceCompany(companyName);

      // Second registration should fail
      await expect(
        riskScore.connect(insuranceCompany1).registerInsuranceCompany(companyName)
      ).to.be.revertedWith("Company already registered");
    });

    it("Should reject empty company name", async function () {
      await expect(
        riskScore.connect(insuranceCompany1).registerInsuranceCompany("")
      ).to.be.revertedWith("Company name required");
    });
  });

  describe("Health Data Submission", function () {
    beforeEach(async function () {
      // Register insurance company before each test
      await riskScore.connect(insuranceCompany1).registerInsuranceCompany("Test Insurance");
    });

    it("Should allow user to submit valid health data", async function () {
      // Create encrypted inputs for all health parameters
      const input = fhevm.createEncryptedInput(riskScore.address, user1.address);
      
      // Add each health metric with sensible values for testing
      input.add32(175);  // height in cm
      input.add32(70);   // weight in kg
      input.add32(120);  // systolic
      input.add32(80);   // diastolic
      input.add32(50);   // hdl
      input.add32(100);  // ldl
      input.add32(150);  // triglycerides
      input.add32(200);  // totalChol
      input.add32(90);   // bloodSugar
      input.add32(70);   // pulse
      input.add32(30);   // age
      input.add32(1);    // gender (male)
      
      // Encrypt all inputs
      const encryptedInputs = await input.encrypt();
      
      // Extract the encrypted data handles and proof
      const encryptedHandles = encryptedInputs.handles;
      const inputProof = encryptedInputs.proof;
      
      // Submit the data to the contract
      await expect(
        riskScore.connect(user1).submitHealthData(
          insuranceCompany1.address,
          ...encryptedHandles,
          inputProof
        )
      ).to.emit(riskScore, "HealthDataSubmitted")
        .withArgs(user1.address, insuranceCompany1.address, anyValue);
      
      // Verify that the data is recorded as submitted
      const isSubmitted = await riskScore.isHealthDataSubmitted(
        user1.address, 
        insuranceCompany1.address
      );
      expect(isSubmitted).to.be.true;
    });

    it("Should reject submission to unregistered insurance company", async function () {
      // Create encrypted inputs for all health parameters
      const input = fhevm.createEncryptedInput(riskScore.address, user1.address);
      
      // Add each health metric with arbitrary values
      for (let i = 0; i < 12; i++) {
        input.add32(100);  // Just use dummy values for testing
      }
      
      // Encrypt all inputs
      const encryptedInputs = await input.encrypt();
      
      // Submit to unregistered insurance company should fail
      await expect(
        riskScore.connect(user1).submitHealthData(
          insuranceCompany2.address, // Not registered yet
          ...encryptedInputs.handles,
          encryptedInputs.proof
        )
      ).to.be.revertedWith("Insurance company not registered");
    });

    it("Should prevent duplicate data submission", async function () {
      // Create and submit first data set
      const input = fhevm.createEncryptedInput(riskScore.address, user1.address);
      
      // Add values
      for (let i = 0; i < 12; i++) {
        input.add32(100);
      }
      
      const encryptedInputs = await input.encrypt();
      
      // First submission
      await riskScore.connect(user1).submitHealthData(
        insuranceCompany1.address,
        ...encryptedInputs.handles,
        encryptedInputs.proof
      );
      
      // Create second input for same user & company
      const input2 = fhevm.createEncryptedInput(riskScore.address, user1.address);
      for (let i = 0; i < 12; i++) {
        input2.add32(120); // Different values
      }
      
      const encryptedInputs2 = await input2.encrypt();
      
      // Second submission should fail
      await expect(
        riskScore.connect(user1).submitHealthData(
          insuranceCompany1.address,
          ...encryptedInputs2.handles,
          encryptedInputs2.proof
        )
      ).to.be.revertedWith("Data already submitted");
    });
  });

  describe("Risk Score Computation", function () {
    beforeEach(async function () {
      // Register insurance company
      await riskScore.connect(insuranceCompany1).registerInsuranceCompany("Test Insurance");
      
      // Submit health data
      const input = fhevm.createEncryptedInput(riskScore.address, user1.address);
      
      // Add health metrics for user1
      for (let i = 0; i < 12; i++) {
        input.add32(100); // Using 100 as a default value for all metrics
      }
      
      const encryptedInputs = await input.encrypt();
      
      // Submit the data
      await riskScore.connect(user1).submitHealthData(
        insuranceCompany1.address,
        ...encryptedInputs.handles,
        encryptedInputs.proof
      );
    });

    it("Should compute risk score for submitted health data", async function () {
      // Compute risk score
      await expect(
        riskScore.computeRiskScore(
          user1.address, 
          insuranceCompany1.address
        )
      ).to.emit(riskScore, "RiskScoreComputed")
        .withArgs(user1.address, insuranceCompany1.address, anyValue);
      
      // Verify score is computed
      const isComputed = await riskScore.isRiskScoreComputed(
        user1.address,
        insuranceCompany1.address
      );
      expect(isComputed).to.be.true;
    });

    it("Should reject computation for non-existent health data", async function () {
      // Try to compute for user2 who has not submitted data
      await expect(
        riskScore.computeRiskScore(
          user2.address, 
          insuranceCompany1.address
        )
      ).to.be.revertedWith("No health data submitted");
    });

    it("Should prevent duplicate risk score computation", async function () {
      // First computation
      await riskScore.computeRiskScore(
        user1.address,
        insuranceCompany1.address
      );
      
      // Second computation should fail
      await expect(
        riskScore.computeRiskScore(
          user1.address,
          insuranceCompany1.address
        )
      ).to.be.revertedWith("Score already computed");
    });
  });

  describe("Permission Management", function () {
    beforeEach(async function () {
      // Register company
      await riskScore.connect(insuranceCompany1).registerInsuranceCompany("Test Insurance");
      
      // Submit health data for user1
      const input = fhevm.createEncryptedInput(riskScore.address, user1.address);
      for (let i = 0; i < 12; i++) {
        input.add32(100);
      }
      const encryptedInputs = await input.encrypt();
      
      await riskScore.connect(user1).submitHealthData(
        insuranceCompany1.address,
        ...encryptedInputs.handles,
        encryptedInputs.proof
      );
      
      // Compute risk score
      await riskScore.computeRiskScore(
        user1.address,
        insuranceCompany1.address
      );
    });

    it("Should allow user to grant permission to insurance company", async function () {
      // Grant permission
      await expect(
        riskScore.connect(user1).grantRiskScorePermission(
          insuranceCompany1.address
        )
      ).to.emit(riskScore, "RiskScoreSent")
        .withArgs(user1.address, insuranceCompany1.address, anyValue);
      
      // Verify permission is granted
      const hasPermission = await riskScore.hasPermission(
        user1.address,
        insuranceCompany1.address
      );
      expect(hasPermission).to.be.true;
    });

    it("Should reject permission grant for uncomputed risk score", async function () {
      // Submit data for user2 but don't compute score
      const input = fhevm.createEncryptedInput(riskScore.address, user2.address);
      for (let i = 0; i < 12; i++) {
        input.add32(100);
      }
      const encryptedInputs = await input.encrypt();
      
      await riskScore.connect(user2).submitHealthData(
        insuranceCompany1.address,
        ...encryptedInputs.handles,
        encryptedInputs.proof
      );
      
      // Try to grant permission without computing score
      await expect(
        riskScore.connect(user2).grantRiskScorePermission(
          insuranceCompany1.address
        )
      ).to.be.revertedWith("Risk score not computed");
    });

    it("Should allow user to revoke permission", async function () {
      // First grant permission
      await riskScore.connect(user1).grantRiskScorePermission(
        insuranceCompany1.address
      );
      
      // Then revoke it
      await riskScore.connect(user1).revokePermission(
        insuranceCompany1.address
      );
      
      // Verify permission is revoked
      const hasPermission = await riskScore.hasPermission(
        user1.address,
        insuranceCompany1.address
      );
      expect(hasPermission).to.be.false;
    });
  });

  describe("Risk Score Access", function () {
    beforeEach(async function () {
      // Complete setup: Register, submit, compute, and grant permission
      await riskScore.connect(insuranceCompany1).registerInsuranceCompany("Test Insurance");
      
      const input = fhevm.createEncryptedInput(riskScore.address, user1.address);
      for (let i = 0; i < 12; i++) {
        input.add32(100);
      }
      const encryptedInputs = await input.encrypt();
      
      await riskScore.connect(user1).submitHealthData(
        insuranceCompany1.address,
        ...encryptedInputs.handles,
        encryptedInputs.proof
      );
      
      await riskScore.computeRiskScore(
        user1.address,
        insuranceCompany1.address
      );
      
      await riskScore.connect(user1).grantRiskScorePermission(
        insuranceCompany1.address
      );
    });

    it("Should allow user to access their own risk score", async function () {
      // User should be able to access their own score
      const riskScoreHandle = await riskScore.connect(user1).getRiskScore(
        user1.address,
        insuranceCompany1.address
      );
      
      // For encrypted values, we just check that a non-zero handle is returned
      expect(riskScoreHandle).to.not.equal(ethers.constants.HashZero);
      
      // Optionally decrypt and check the score if your test environment supports it
      if (fhevm.userDecryptEuint) {
        const decryptedScore = await fhevm.userDecryptEuint(
          32, // 32 bits for euint32
          riskScoreHandle,
          riskScore.address,
          user1
        );
        
        // The score should be a number greater than 0
        expect(decryptedScore.gt(0)).to.be.true;
      }
    });

    it("Should allow authorized insurance company to access risk score", async function () {
      // Insurance company should be able to access the score after permission
      const riskScoreHandle = await riskScore.connect(insuranceCompany1).getRiskScore(
        user1.address,
        insuranceCompany1.address
      );
      
      expect(riskScoreHandle).to.not.equal(ethers.constants.HashZero);
    });

    it("Should reject unauthorized access to risk score", async function () {
      // Insurance company 2 is not authorized
      await expect(
        riskScore.connect(insuranceCompany2).getRiskScore(
          user1.address,
          insuranceCompany1.address
        )
      ).to.be.revertedWith("Not authorized to access risk score");
    });
  });

  describe("Multi-Company Support", function () {
    beforeEach(async function () {
      // Register multiple insurance companies
      await riskScore.connect(insuranceCompany1).registerInsuranceCompany("Insurance Co 1");
      await riskScore.connect(insuranceCompany2).registerInsuranceCompany("Insurance Co 2");
    });

    it("Should support separate data for different insurance companies", async function () {
      // Submit data to company 1
      const input1 = fhevm.createEncryptedInput(riskScore.address, user1.address);
      for (let i = 0; i < 12; i++) {
        input1.add32(100);
      }
      const encryptedInputs1 = await input1.encrypt();
      
      await riskScore.connect(user1).submitHealthData(
        insuranceCompany1.address,
        ...encryptedInputs1.handles,
        encryptedInputs1.proof
      );
      
      // Submit data to company 2
      const input2 = fhevm.createEncryptedInput(riskScore.address, user1.address);
      for (let i = 0; i < 12; i++) {
        input2.add32(120); // Different values
      }
      const encryptedInputs2 = await input2.encrypt();
      
      await riskScore.connect(user1).submitHealthData(
        insuranceCompany2.address,
        ...encryptedInputs2.handles,
        encryptedInputs2.proof
      );
      
      // Verify separate data tracking
      const isSubmitted1 = await riskScore.isHealthDataSubmitted(
        user1.address,
        insuranceCompany1.address
      );
      
      const isSubmitted2 = await riskScore.isHealthDataSubmitted(
        user1.address,
        insuranceCompany2.address
      );
      
      expect(isSubmitted1).to.be.true;
      expect(isSubmitted2).to.be.true;
    });

    it("Should maintain separate permissions for different companies", async function () {
      // Submit data to both companies
      const input1 = fhevm.createEncryptedInput(riskScore.address, user1.address);
      for (let i = 0; i < 12; i++) {
        input1.add32(100);
      }
      const encryptedInputs1 = await input1.encrypt();
      
      await riskScore.connect(user1).submitHealthData(
        insuranceCompany1.address,
        ...encryptedInputs1.handles,
        encryptedInputs1.proof
      );
      
      const input2 = fhevm.createEncryptedInput(riskScore.address, user1.address);
      for (let i = 0; i < 12; i++) {
        input2.add32(120);
      }
      const encryptedInputs2 = await input2.encrypt();
      
      await riskScore.connect(user1).submitHealthData(
        insuranceCompany2.address,
        ...encryptedInputs2.handles,
        encryptedInputs2.proof
      );
      
      // Compute risk scores
      await riskScore.computeRiskScore(user1.address, insuranceCompany1.address);
      await riskScore.computeRiskScore(user1.address, insuranceCompany2.address);
      
      // Grant permission only to company 1
      await riskScore.connect(user1).grantRiskScorePermission(
        insuranceCompany1.address
      );
      
      // Check permissions
      const hasPermission1 = await riskScore.hasPermission(
        user1.address,
        insuranceCompany1.address
      );
      
      const hasPermission2 = await riskScore.hasPermission(
        user1.address,
        insuranceCompany2.address
      );
      
      expect(hasPermission1).to.be.true;
      expect(hasPermission2).to.be.false;
    });
  });
});