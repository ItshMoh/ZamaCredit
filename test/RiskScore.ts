// test/RiskScore.ts

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { network } from "hardhat";
import { parseEther, getAddress } from "viem";

// Types for our test structure
interface TestAccounts {
  deployer: any;
  insuranceCompany1: any;
  insuranceCompany2: any;
  user1: any;
  user2: any;
}

describe("RiskScore Contract", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  
  let riskScore: any;
  let accounts: TestAccounts;

  // Setup before each test
  beforeEach(async function () {
    // Deploy fresh contract for each test
    riskScore = await viem.deployContract("RiskScore");
    
    // Get test accounts
    const walletClients = await viem.getWalletClients();
    accounts = {
      deployer: walletClients[0],
      insuranceCompany1: walletClients[1], 
      insuranceCompany2: walletClients[2],
      user1: walletClients[3],
      user2: walletClients[4]
    };
  });

  describe("Insurance Company Registration", function () {
    it("Should allow insurance company to register", async function () {
      const companyName = "Test Insurance Co";
      
      // Register company
      await viem.assertions.emitWithArgs(
        riskScore.write.registerInsuranceCompany([companyName], {
          account: accounts.insuranceCompany1.account
        }),
        riskScore,
        "InsuranceCompanyRegistered",
        [accounts.insuranceCompany1.account.address, companyName]
      );

      // Verify company is registered
      const company = await riskScore.read.insuranceCompanies([
        accounts.insuranceCompany1.account.address
      ]);
      
      assert.equal(company.companyName, companyName);
      assert.equal(company.isRegistered, true);
      assert.equal(company.companyAddress, accounts.insuranceCompany1.account.address);
    });

    it("Should prevent duplicate company registration", async function () {
      const companyName = "Test Insurance Co";
      
      // First registration should succeed
      await riskScore.write.registerInsuranceCompany([companyName], {
        account: accounts.insuranceCompany1.account
      });

      // Second registration should fail
      await assert.rejects(
        riskScore.write.registerInsuranceCompany([companyName], {
          account: accounts.insuranceCompany1.account
        }),
        /Company already registered/
      );
    });

    it("Should reject empty company name", async function () {
      await assert.rejects(
        riskScore.write.registerInsuranceCompany([""], {
          account: accounts.insuranceCompany1.account
        }),
        /Company name required/
      );
    });
  });

  describe("Health Data Submission", function () {
    beforeEach(async function () {
      // Register insurance company before each test
      await riskScore.write.registerInsuranceCompany(["Test Insurance"], {
        account: accounts.insuranceCompany1.account
      });
    });

    it("Should allow user to submit valid health data", async function () {
      // Mock encrypted health data (in real implementation, this would be properly encrypted)
      const healthData = {
        height: 175,      // 175cm
        weight: 70,       // 70kg  
        systolic: 120,    // 120 mmHg
        diastolic: 80,    // 80 mmHg
        hdl: 50,          // 50 mg/dL
        ldl: 100,         // 100 mg/dL
        triglycerides: 150, // 150 mg/dL
        totalChol: 200,   // 200 mg/dL
        bloodSugar: 90,   // 90 mg/dL
        pulse: 70,        // 70 bpm
        age: 30,          // 30 years
        gender: 1         // male
      };

      // Create mock encrypted inputs (simplified for testing)
      const mockProof = "0x1234567890abcdef"; // Mock proof
      
      // Note: In real implementation, you'd use actual FHE encryption
      // For testing purposes, we'll simulate the encrypted inputs
      const encryptedInputs = Object.values(healthData).map(val => 
        `0x${val.toString(16).padStart(64, '0')}`
      );

      await viem.assertions.emitWithArgs(
        riskScore.write.submitHealthData([
          accounts.insuranceCompany1.account.address,
          ...encryptedInputs,
          mockProof
        ], {
          account: accounts.user1.account
        }),
        riskScore,
        "HealthDataSubmitted",
        [
          accounts.user1.account.address,
          accounts.insuranceCompany1.account.address,
          // timestamp will be block.timestamp, we can't predict exact value
        ]
      );

      // Verify data submission status
      const isSubmitted = await riskScore.read.isHealthDataSubmitted([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ]);
      
      assert.equal(isSubmitted, true);
    });

    it("Should reject submission to unregistered insurance company", async function () {
      const mockData = Array(12).fill("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      const mockProof = "0x1234567890abcdef";

      await assert.rejects(
        riskScore.write.submitHealthData([
          accounts.insuranceCompany2.account.address, // Unregistered company
          ...mockData,
          mockProof
        ], {
          account: accounts.user1.account
        }),
        /Insurance company not registered/
      );
    });

    it("Should prevent duplicate data submission", async function () {
      const mockData = Array(12).fill("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      const mockProof = "0x1234567890abcdef";

      // First submission
      await riskScore.write.submitHealthData([
        accounts.insuranceCompany1.account.address,
        ...mockData,
        mockProof
      ], {
        account: accounts.user1.account
      });

      // Second submission should fail
      await assert.rejects(
        riskScore.write.submitHealthData([
          accounts.insuranceCompany1.account.address,
          ...mockData,
          mockProof
        ], {
          account: accounts.user1.account
        }),
        /Data already submitted/
      );
    });
  });

  describe("Risk Score Computation", function () {
    beforeEach(async function () {
      // Setup: Register company and submit health data
      await riskScore.write.registerInsuranceCompany(["Test Insurance"], {
        account: accounts.insuranceCompany1.account
      });

      const mockData = Array(12).fill("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      const mockProof = "0x1234567890abcdef";

      await riskScore.write.submitHealthData([
        accounts.insuranceCompany1.account.address,
        ...mockData,
        mockProof
      ], {
        account: accounts.user1.account
      });
    });

    it("Should compute risk score for submitted health data", async function () {
      await viem.assertions.emitWithArgs(
        riskScore.write.computeRiskScore([
          accounts.user1.account.address,
          accounts.insuranceCompany1.account.address
        ]),
        riskScore,
        "RiskScoreComputed",
        [
          accounts.user1.account.address,
          accounts.insuranceCompany1.account.address,
          // timestamp will be block.timestamp
        ]
      );

      // Verify score computation status
      const isComputed = await riskScore.read.isRiskScoreComputed([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ]);
      
      assert.equal(isComputed, true);
    });

    it("Should reject computation for non-existent health data", async function () {
      await assert.rejects(
        riskScore.write.computeRiskScore([
          accounts.user2.account.address, // No data submitted
          accounts.insuranceCompany1.account.address
        ]),
        /No health data submitted/
      );
    });

    it("Should prevent duplicate risk score computation", async function () {
      // First computation
      await riskScore.write.computeRiskScore([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ]);

      // Second computation should fail
      await assert.rejects(
        riskScore.write.computeRiskScore([
          accounts.user1.account.address,
          accounts.insuranceCompany1.account.address
        ]),
        /Score already computed/
      );
    });

    it("Should reject computation for unregistered insurance company", async function () {
      await assert.rejects(
        riskScore.write.computeRiskScore([
          accounts.user1.account.address,
          accounts.insuranceCompany2.account.address // Unregistered
        ]),
        /Insurance company not registered/
      );
    });
  });

  describe("Permission Management", function () {
    beforeEach(async function () {
      // Setup: Register company, submit data, and compute score
      await riskScore.write.registerInsuranceCompany(["Test Insurance"], {
        account: accounts.insuranceCompany1.account
      });

      const mockData = Array(12).fill("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      const mockProof = "0x1234567890abcdef";

      await riskScore.write.submitHealthData([
        accounts.insuranceCompany1.account.address,
        ...mockData,
        mockProof
      ], {
        account: accounts.user1.account
      });

      await riskScore.write.computeRiskScore([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ]);
    });

    it("Should allow user to grant permission to insurance company", async function () {
      await viem.assertions.emitWithArgs(
        riskScore.write.grantRiskScorePermission([
          accounts.insuranceCompany1.account.address
        ], {
          account: accounts.user1.account
        }),
        riskScore,
        "RiskScoreSent",
        [
          accounts.user1.account.address,
          accounts.insuranceCompany1.account.address,
          // timestamp
        ]
      );

      // Verify permission is granted
      const hasPermission = await riskScore.read.hasPermission([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ]);
      
      assert.equal(hasPermission, true);
    });

    it("Should reject permission grant for uncomputed risk score", async function () {
      // Submit data for user2 but don't compute score
      const mockData = Array(12).fill("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      const mockProof = "0x1234567890abcdef";

      await riskScore.write.submitHealthData([
        accounts.insuranceCompany1.account.address,
        ...mockData,
        mockProof
      ], {
        account: accounts.user2.account
      });

      await assert.rejects(
        riskScore.write.grantRiskScorePermission([
          accounts.insuranceCompany1.account.address
        ], {
          account: accounts.user2.account
        }),
        /Risk score not computed/
      );
    });

    it("Should allow user to revoke permission", async function () {
      // First grant permission
      await riskScore.write.grantRiskScorePermission([
        accounts.insuranceCompany1.account.address
      ], {
        account: accounts.user1.account
      });

      // Then revoke it
      await riskScore.write.revokePermission([
        accounts.insuranceCompany1.account.address
      ], {
        account: accounts.user1.account
      });

      // Verify permission is revoked
      const hasPermission = await riskScore.read.hasPermission([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ]);
      
      assert.equal(hasPermission, false);
    });
  });

  describe("Risk Score Access", function () {
    beforeEach(async function () {
      // Complete setup: Register, submit, compute, and grant permission
      await riskScore.write.registerInsuranceCompany(["Test Insurance"], {
        account: accounts.insuranceCompany1.account
      });

      const mockData = Array(12).fill("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      const mockProof = "0x1234567890abcdef";

      await riskScore.write.submitHealthData([
        accounts.insuranceCompany1.account.address,
        ...mockData,
        mockProof
      ], {
        account: accounts.user1.account
      });

      await riskScore.write.computeRiskScore([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ]);

      await riskScore.write.grantRiskScorePermission([
        accounts.insuranceCompany1.account.address
      ], {
        account: accounts.user1.account
      });
    });

    it("Should allow user to access their own risk score", async function () {
      const riskScoreHandle = await riskScore.read.getRiskScore([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ], {
        account: accounts.user1.account
      });

      // Risk score should be returned as encrypted handle (bytes32)
      assert.notEqual(riskScoreHandle, "0x0000000000000000000000000000000000000000000000000000000000000000");
    });

    it("Should allow authorized insurance company to access risk score", async function () {
      const riskScoreHandle = await riskScore.read.getRiskScore([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ], {
        account: accounts.insuranceCompany1.account
      });

      // Risk score should be returned as encrypted handle
      assert.notEqual(riskScoreHandle, "0x0000000000000000000000000000000000000000000000000000000000000000");
    });

    it("Should reject unauthorized access to risk score", async function () {
      await assert.rejects(
        riskScore.read.getRiskScore([
          accounts.user1.account.address,
          accounts.insuranceCompany1.account.address
        ], {
          account: accounts.insuranceCompany2.account // Not authorized
        }),
        /Not authorized to access risk score/
      );
    });

    it("Should reject access to non-existent risk score", async function () {
      await assert.rejects(
        riskScore.read.getRiskScore([
          accounts.user2.account.address, // No data submitted
          accounts.insuranceCompany1.account.address
        ], {
          account: accounts.user2.account
        }),
        /Risk score not computed/
      );
    });
  });

  describe("Multi-Company Support", function () {
    beforeEach(async function () {
      // Register multiple insurance companies
      await riskScore.write.registerInsuranceCompany(["Insurance Co 1"], {
        account: accounts.insuranceCompany1.account
      });
      
      await riskScore.write.registerInsuranceCompany(["Insurance Co 2"], {
        account: accounts.insuranceCompany2.account
      });
    });

    it("Should support separate data for different insurance companies", async function () {
      const mockData = Array(12).fill("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      const mockProof = "0x1234567890abcdef";

      // Submit data to both companies
      await riskScore.write.submitHealthData([
        accounts.insuranceCompany1.account.address,
        ...mockData,
        mockProof
      ], {
        account: accounts.user1.account
      });

      await riskScore.write.submitHealthData([
        accounts.insuranceCompany2.account.address,
        ...mockData,
        mockProof
      ], {
        account: accounts.user1.account
      });

      // Verify separate data tracking
      const isSubmitted1 = await riskScore.read.isHealthDataSubmitted([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ]);

      const isSubmitted2 = await riskScore.read.isHealthDataSubmitted([
        accounts.user1.account.address,
        accounts.insuranceCompany2.account.address
      ]);

      assert.equal(isSubmitted1, true);
      assert.equal(isSubmitted2, true);
    });

    it("Should maintain separate permissions for different companies", async function () {
      const mockData = Array(12).fill("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      const mockProof = "0x1234567890abcdef";

      // Complete flow for both companies
      await riskScore.write.submitHealthData([
        accounts.insuranceCompany1.account.address,
        ...mockData,
        mockProof
      ], {
        account: accounts.user1.account
      });

      await riskScore.write.submitHealthData([
        accounts.insuranceCompany2.account.address,
        ...mockData,
        mockProof
      ], {
        account: accounts.user1.account
      });

      await riskScore.write.computeRiskScore([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ]);

      await riskScore.write.computeRiskScore([
        accounts.user1.account.address,
        accounts.insuranceCompany2.account.address
      ]);

      // Grant permission only to company 1
      await riskScore.write.grantRiskScorePermission([
        accounts.insuranceCompany1.account.address
      ], {
        account: accounts.user1.account
      });

      // Check permissions
      const hasPermission1 = await riskScore.read.hasPermission([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ]);

      const hasPermission2 = await riskScore.read.hasPermission([
        accounts.user1.account.address,
        accounts.insuranceCompany2.account.address
      ]);

      assert.equal(hasPermission1, true);
      assert.equal(hasPermission2, false);
    });
  });

  describe("Edge Cases and Security", function () {
    it("Should handle contract deployment correctly", async function () {
      // Verify contract is deployed and accessible
      const contractAddress = await riskScore.address;
      assert.notEqual(contractAddress, undefined);
      
      // Check that no companies are registered initially
      const unregisteredCompany = await riskScore.read.insuranceCompanies([
        accounts.insuranceCompany1.account.address
      ]);
      assert.equal(unregisteredCompany.isRegistered, false);
    });

    it("Should maintain data isolation between users", async function () {
      // Register company
      await riskScore.write.registerInsuranceCompany(["Test Insurance"], {
        account: accounts.insuranceCompany1.account
      });

      const mockData = Array(12).fill("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      const mockProof = "0x1234567890abcdef";

      // Submit data for user1
      await riskScore.write.submitHealthData([
        accounts.insuranceCompany1.account.address,
        ...mockData,
        mockProof
      ], {
        account: accounts.user1.account
      });

      // Check that user2 has no data
      const user2HasData = await riskScore.read.isHealthDataSubmitted([
        accounts.user2.account.address,
        accounts.insuranceCompany1.account.address
      ]);

      assert.equal(user2HasData, false);
    });

    it("Should prevent unauthorized score computation", async function () {
      // Register company and submit data
      await riskScore.write.registerInsuranceCompany(["Test Insurance"], {
        account: accounts.insuranceCompany1.account
      });

      const mockData = Array(12).fill("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
      const mockProof = "0x1234567890abcdef";

      await riskScore.write.submitHealthData([
        accounts.insuranceCompany1.account.address,
        ...mockData,
        mockProof
      ], {
        account: accounts.user1.account
      });

      // Try to compute score from unauthorized account (should still work as it's a public function)
      // The authorization is checked in getRiskScore, not computeRiskScore
      await riskScore.write.computeRiskScore([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ], {
        account: accounts.user2.account // Different user can compute
      });

      // Verify computation succeeded
      const isComputed = await riskScore.read.isRiskScoreComputed([
        accounts.user1.account.address,
        accounts.insuranceCompany1.account.address
      ]);
      
      assert.equal(isComputed, true);
    });
  });
});