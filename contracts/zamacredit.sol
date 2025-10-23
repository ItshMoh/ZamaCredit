// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "@fhevm/solidity/lib/FHE.sol";
import "fhevm/config/ZamaFHEVMConfig.sol";


/**
 * @title RiskScore
 * @notice Privacy-preserving health risk score calculation using FHE
 * @dev Uses Zama's FHEVM for encrypted health data computation
 */
contract RiskScore is SepoliaZamaFHEVMConfig {
    
    // Encrypted health data structure
    struct HealthData {
        euint32 height;          // Height in cm (100-250)
        euint32 weight;          // Weight in kg (30-300)
        euint32 systolic;        // Systolic BP (70-250)
        euint32 diastolic;       // Diastolic BP (40-150)
        euint32 hdlCholesterol;  // HDL in mg/dL (20-100)
        euint32 ldlCholesterol;  // LDL in mg/dL (50-300)
        euint32 triglycerides;   // Triglycerides in mg/dL (50-500)
        euint32 totalCholesterol; // Total cholesterol in mg/dL (100-400)
        euint32 bloodSugar;      // HbA1c * 10 or fasting glucose (40-200)
        euint32 pulseRate;       // Pulse rate (40-150)
        euint32 age;             // Age in years (18-100)
        euint32 gender;           // 0 = female, 1 = male
        euint32 riskScore;       // Calculated risk score
        bool dataSubmitted;      // Track if data is submitted
        bool scoreComputed;      // Track if score is computed
    }
    
    // Insurance company data
    struct InsuranceCompany {
        address companyAddress;
        string companyName;
        bool isRegistered;
    }
    
    // Mappings
    mapping(address => mapping(address => HealthData)) public userHealthData; // user => company => data
    mapping(address => InsuranceCompany) public insuranceCompanies;
    mapping(address => mapping(address => bool)) public userPermissions; // user => company => permission
    
    // Events
    event HealthDataSubmitted(
        address indexed user,
        address indexed insuranceCompany,
        uint256 timestamp
    );
    
    event RiskScoreComputed(
        address indexed user,
        address indexed insuranceCompany,
        uint256 timestamp
    );
    
    event RiskScoreSent(
        address indexed user,
        address indexed insuranceCompany,
        uint256 timestamp
    );
    
    event InsuranceCompanyRegistered(
        address indexed companyAddress,
        string companyName
    );
    
    // Modifiers
    modifier onlyRegisteredCompany() {
        require(insuranceCompanies[msg.sender].isRegistered, "Company not registered");
        _;
    }
    
    modifier validHealthData(
        uint32 height,
        uint32 weight,
        uint32 systolic,
        uint32 diastolic,
        uint32 hdl,
        uint32 ldl,
        uint32 triglycerides,
        uint32 totalChol,
        uint32 bloodSugar,
        uint32 pulse,
        uint32 age,
        uint8 gender
    ) {
        // Validate health data ranges
        require(height >= 100 && height <= 250, "Invalid height range");
        require(weight >= 30 && weight <= 300, "Invalid weight range");
        require(systolic >= 70 && systolic <= 250, "Invalid systolic BP range");
        require(diastolic >= 40 && diastolic <= 150, "Invalid diastolic BP range");
        require(hdl >= 20 && hdl <= 100, "Invalid HDL range");
        require(ldl >= 50 && ldl <= 300, "Invalid LDL range");
        require(triglycerides >= 50 && triglycerides <= 500, "Invalid triglycerides range");
        require(totalChol >= 100 && totalChol <= 400, "Invalid total cholesterol range");
        require(bloodSugar >= 40 && bloodSugar <= 200, "Invalid blood sugar range");
        require(pulse >= 40 && pulse <= 150, "Invalid pulse rate range");
        require(age >= 18 && age <= 100, "Invalid age range");
        require(gender <= 1, "Invalid gender value");
        _;
    }
    
    // Register insurance company
    function registerInsuranceCompany(string memory companyName) external {
        require(!insuranceCompanies[msg.sender].isRegistered, "Company already registered");
        require(bytes(companyName).length > 0, "Company name required");
        
        insuranceCompanies[msg.sender] = InsuranceCompany({
            companyAddress: msg.sender,
            companyName: companyName,
            isRegistered: true
        });
        
        emit InsuranceCompanyRegistered(msg.sender, companyName);
    }
    
    /**
     * @notice Submit encrypted health data for risk assessment
     * @param insuranceCompany Address of the insurance company requesting the data
     * @param encryptedHeight Encrypted height value
     * @param encryptedWeight Encrypted weight value
     * @param encryptedSystolic Encrypted systolic BP
     * @param encryptedDiastolic Encrypted diastolic BP
     * @param encryptedHDL Encrypted HDL cholesterol
     * @param encryptedLDL Encrypted LDL cholesterol
     * @param encryptedTriglycerides Encrypted triglycerides
     * @param encryptedTotalChol Encrypted total cholesterol
     * @param encryptedBloodSugar Encrypted blood sugar/HbA1c
     * @param encryptedPulse Encrypted pulse rate
     * @param encryptedAge Encrypted age
     * @param encryptedGender Encrypted gender
     * @param inputProof ZK proof for encrypted inputs
     */
    function submitHealthData(
        address insuranceCompany,
        externalEuint32 encryptedHeight,
        externalEuint32 encryptedWeight,
        externalEuint32 encryptedSystolic,
        externalEuint32 encryptedDiastolic,
        externalEuint32 encryptedHDL,
        externalEuint32 encryptedLDL,
        externalEuint32 encryptedTriglycerides,
        externalEuint32 encryptedTotalChol,
        externalEuint32 encryptedBloodSugar,
        externalEuint32 encryptedPulse,
        externalEuint32 encryptedAge,
        externalEuint32 encryptedGender,
        bytes calldata inputProof
    ) external {
        require(insuranceCompanies[insuranceCompany].isRegistered, "Insurance company not registered");
        require(!userHealthData[msg.sender][insuranceCompany].dataSubmitted, "Data already submitted");
        
        // Convert encrypted inputs to euint types with verification
        euint32 height = FHE.fromExternal(encryptedHeight, inputProof);
        euint32 weight = FHE.fromExternal(encryptedWeight, inputProof);
        euint32 systolic = FHE.fromExternal(encryptedSystolic, inputProof);
        euint32 diastolic = FHE.fromExternal(encryptedDiastolic, inputProof);
        euint32 hdl = FHE.fromExternal(encryptedHDL, inputProof);
        euint32 ldl = FHE.fromExternal(encryptedLDL, inputProof);
        euint32 triglycerides = FHE.fromExternal(encryptedTriglycerides, inputProof);
        euint32 totalChol = FHE.fromExternal(encryptedTotalChol, inputProof);
        euint32 bloodSugar = FHE.fromExternal(encryptedBloodSugar, inputProof);
        euint32 pulse = FHE.fromExternal(encryptedPulse, inputProof);
        euint32 age = FHE.fromExternal(encryptedAge, inputProof);
        euint32 gender = FHE.fromExternal(encryptedGender, inputProof); 
       
       // initialize risk score
        euint32 initialRiskScore = FHE.asEuint32(0);

        // Store encrypted health data
        userHealthData[msg.sender][insuranceCompany] = HealthData({
            height: height,
            weight: weight,
            systolic: systolic,
            diastolic: diastolic,
            hdlCholesterol: hdl,
            ldlCholesterol: ldl,
            triglycerides: triglycerides,
            totalCholesterol: totalChol,
            bloodSugar: bloodSugar,
            pulseRate: pulse,
            age: age,
            gender: gender,
            riskScore: initialRiskScore,
            dataSubmitted: true,
            scoreComputed: false
        });
        
        // Grant permissions for the contract to operate on the data
        FHE.allowThis(height);
        FHE.allowThis(weight);
        FHE.allowThis(systolic);
        FHE.allowThis(diastolic);
        FHE.allowThis(hdl);
        FHE.allowThis(ldl);
        FHE.allowThis(triglycerides);
        FHE.allowThis(totalChol);
        FHE.allowThis(bloodSugar);
        FHE.allowThis(pulse);
        FHE.allowThis(age);
        FHE.allowThis(gender);
        
        emit HealthDataSubmitted(msg.sender, insuranceCompany, block.timestamp);
    }
    
    /**
     * @notice Compute risk score on encrypted health data
     * @param user Address of the user whose data to compute
     * @param insuranceCompany Address of the insurance company
     */ 
    function computeRiskScore(address user, address insuranceCompany) external {
    require(insuranceCompanies[insuranceCompany].isRegistered, "Insurance company not registered");
    require(userHealthData[user][insuranceCompany].dataSubmitted, "No health data submitted");
    require(!userHealthData[user][insuranceCompany].scoreComputed, "Score already computed");
    
    HealthData storage data = userHealthData[user][insuranceCompany];
    
    // Initialize risk score with 0
    euint32 riskScore = FHE.asEuint32(0);
    
    // Age factor (strongest factor): age * 2
    euint32 ageScore = FHE.mul(data.age, 2);
    riskScore = FHE.add(riskScore, ageScore);
    
    // Gender factor: male = +10, female = +0
    euint32 genderScore = FHE.mul(data.gender, 10);
    riskScore = FHE.add(riskScore, genderScore);
    
    // Weight-based risk - USE SCALAR COMPARISONS
    ebool heavyWeight = FHE.gt(data.weight, 90); // Scalar comparison with plaintext 90
    ebool moderateWeight = FHE.gt(data.weight, 75); // Scalar comparison with plaintext 75
    euint32 weightScore = FHE.select(heavyWeight, FHE.asEuint32(20), 
                         FHE.select(moderateWeight, FHE.asEuint32(10), FHE.asEuint32(0)));
    riskScore = FHE.add(riskScore, weightScore);
    
    // Height-based adjustment - USE SCALAR COMPARISON
    ebool shortHeight = FHE.lt(data.height, 160); // Scalar comparison
    euint32 heightScore = FHE.select(shortHeight, FHE.asEuint32(5), FHE.asEuint32(0));
    riskScore = FHE.add(riskScore, heightScore);
    
    // Blood pressure factor - USE SCALAR COMPARISONS
    ebool highSystolic = FHE.gt(data.systolic, 140);
    ebool highDiastolic = FHE.gt(data.diastolic, 90);
    ebool highBP = FHE.or(highSystolic, highDiastolic);
    euint32 bpScore = FHE.select(highBP, FHE.asEuint32(15), FHE.asEuint32(0));
    riskScore = FHE.add(riskScore, bpScore);
    
    // Cholesterol factor - USE SCALAR COMPARISONS
    ebool highLDL = FHE.gt(data.ldlCholesterol, 160);
    ebool lowHDL = FHE.lt(data.hdlCholesterol, 40);
    euint32 cholScore = FHE.add(
        FHE.select(highLDL, FHE.asEuint32(10), FHE.asEuint32(0)),
        FHE.select(lowHDL, FHE.asEuint32(10), FHE.asEuint32(0))
    );
    riskScore = FHE.add(riskScore, cholScore);
    
    // Triglycerides factor - USE SCALAR COMPARISON
    ebool highTriglycerides = FHE.gt(data.triglycerides, 200);
    euint32 trigScore = FHE.select(highTriglycerides, FHE.asEuint32(8), FHE.asEuint32(0));
    riskScore = FHE.add(riskScore, trigScore);
    
    // Total cholesterol factor - USE SCALAR COMPARISON
    ebool highTotalChol = FHE.gt(data.totalCholesterol, 240);
    euint32 totalCholScore = FHE.select(highTotalChol, FHE.asEuint32(12), FHE.asEuint32(0));
    riskScore = FHE.add(riskScore, totalCholScore);
    
    // Blood sugar factor - USE SCALAR COMPARISONS
    ebool diabetes = FHE.gt(data.bloodSugar, 126);
    ebool prediabetes = FHE.gt(data.bloodSugar, 100);
    euint32 sugarScore = FHE.select(diabetes, FHE.asEuint32(25),
                        FHE.select(prediabetes, FHE.asEuint32(10), FHE.asEuint32(0)));
    riskScore = FHE.add(riskScore, sugarScore);
    
    // Pulse rate factor - USE SCALAR COMPARISONS
    ebool highPulse = FHE.gt(data.pulseRate, 100);
    ebool lowPulse = FHE.lt(data.pulseRate, 50);
    euint32 pulseScore = FHE.add(
        FHE.select(highPulse, FHE.asEuint32(5), FHE.asEuint32(0)),
        FHE.select(lowPulse, FHE.asEuint32(3), FHE.asEuint32(0))
    );
    riskScore = FHE.add(riskScore, pulseScore);
    
    // Store the computed risk score
    data.riskScore = riskScore;
    data.scoreComputed = true;
    
    // Allow contract to access the risk score
    FHE.allowThis(riskScore);
    
    emit RiskScoreComputed(user, insuranceCompany, block.timestamp);
}
    
    /**
     * @notice Grant permission to insurance company to access risk score
     * @param insuranceCompany Address of the insurance company
     */
    function grantRiskScorePermission(address insuranceCompany) external {
        require(insuranceCompanies[insuranceCompany].isRegistered, "Insurance company not registered");
        require(userHealthData[msg.sender][insuranceCompany].scoreComputed, "Risk score not computed");
        
        // Grant permission to insurance company to decrypt the risk score
        FHE.allow(userHealthData[msg.sender][insuranceCompany].riskScore, insuranceCompany);
        
        // Record permission granted
        userPermissions[msg.sender][insuranceCompany] = true;
        
        emit RiskScoreSent(msg.sender, insuranceCompany, block.timestamp);
    }
    
    /**
     * @notice Get encrypted risk score (only accessible by authorized parties)
     * @param user Address of the user
     * @param insuranceCompany Address of the insurance company
     */
    function getRiskScore(address user, address insuranceCompany) external view returns (euint32) {
        require(userHealthData[user][insuranceCompany].scoreComputed, "Risk score not computed");
        require(
            msg.sender == user || 
            (msg.sender == insuranceCompany && userPermissions[user][insuranceCompany]),
            "Not authorized to access risk score"
        );
        
        return userHealthData[user][insuranceCompany].riskScore;
    }
    
    /**
     * @notice Check if health data has been submitted
     */
    function isHealthDataSubmitted(address user, address insuranceCompany) external view returns (bool) {
        return userHealthData[user][insuranceCompany].dataSubmitted;
    }
    
    /**
     * @notice Check if risk score has been computed
     */
    function isRiskScoreComputed(address user, address insuranceCompany) external view returns (bool) {
        return userHealthData[user][insuranceCompany].scoreComputed;
    }
    
    /**
     * @notice Check if permission has been granted to insurance company
     */
    function hasPermission(address user, address insuranceCompany) external view returns (bool) {
        return userPermissions[user][insuranceCompany];
    }
    
    /**
     * @notice Revoke permission from insurance company
     */
    function revokePermission(address insuranceCompany) external {
        userPermissions[msg.sender][insuranceCompany] = false;
    }
}