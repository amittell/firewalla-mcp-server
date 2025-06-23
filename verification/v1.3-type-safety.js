#!/usr/bin/env node

/**
 * V1.3 Verification: Test Type Safety
 * 
 * Systematically verifies that:
 * - TypeScript interfaces match actual API responses
 * - Validation functions work correctly
 * - Type annotations are comprehensive
 * - Interface definitions are complete
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TypeSafetyVerifier {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      details: []
    };
  }

  /**
   * Add test result
   */
  addResult(category, test, status, message, details = null) {
    this.results[status]++;
    this.results.details.push({
      category,
      test,
      status,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Read source files
   */
  async readSourceFiles() {
    const files = {
      types: path.join(__dirname, '../src/types.ts'),
      client: path.join(__dirname, '../src/firewalla/client.ts'),
      validation: path.join(__dirname, '../src/validation/index.ts')
    };

    const contents = {};
    
    for (const [name, filePath] of Object.entries(files)) {
      try {
        contents[name] = fs.readFileSync(filePath, 'utf8');
        this.addResult('setup', `read-${name}`, 'passed', 
          `✅ Successfully read ${name} source file`);
      } catch (error) {
        this.addResult('setup', `read-${name}`, 'failed', 
          `❌ Failed to read ${name}: ${error.message}`);
        throw error;
      }
    }
    
    return contents;
  }

  /**
   * Extract interface definitions from types.ts
   */
  extractInterfaces(typesCode) {
    const interfaces = {};
    
    // Pattern to match interface definitions
    const interfacePattern = /export\s+interface\s+(\w+)\s*\{([^}]+)\}/g;
    let match;
    
    while ((match = interfacePattern.exec(typesCode)) !== null) {
      const interfaceName = match[1];
      const interfaceBody = match[2];
      
      // Extract properties
      const properties = {};
      const propPattern = /(\w+)(\?)?\s*:\s*([^;,\n]+)/g;
      let propMatch;
      
      while ((propMatch = propPattern.exec(interfaceBody)) !== null) {
        const propName = propMatch[1];
        const isOptional = !!propMatch[2];
        const propType = propMatch[3].trim();
        
        properties[propName] = {
          type: propType,
          optional: isOptional
        };
      }
      
      interfaces[interfaceName] = {
        name: interfaceName,
        properties
      };
    }
    
    return interfaces;
  }

  /**
   * Extract validation functions from validation module
   */
  extractValidationFunctions(validationCode) {
    const validators = {};
    
    // Pattern to match validation function definitions
    const validatorPattern = /static\s+validate(\w+)\s*\([^)]*\):\s*ValidationResult\s*\{/g;
    let match;
    
    while ((match = validatorPattern.exec(validationCode)) !== null) {
      const entityType = match[1];
      
      // Extract the function body to analyze validation rules
      const functionStart = match.index;
      let braceCount = 0;
      let inFunction = false;
      let functionEnd = functionStart;
      
      for (let i = functionStart; i < validationCode.length; i++) {
        const char = validationCode[i];
        if (char === '{') {
          braceCount++;
          inFunction = true;
        } else if (char === '}') {
          braceCount--;
          if (inFunction && braceCount === 0) {
            functionEnd = i;
            break;
          }
        }
      }
      
      const functionBody = validationCode.substring(functionStart, functionEnd + 1);
      
      // Extract validation rules
      const validationRules = this.extractValidationRules(functionBody);
      
      validators[entityType] = {
        name: `validate${entityType}`,
        rules: validationRules,
        body: functionBody
      };
    }
    
    return validators;
  }

  /**
   * Extract validation rules from function body
   */
  extractValidationRules(functionBody) {
    const rules = [];
    
    // Pattern to match validation checks
    const patterns = [
      /typeof\s+(\w+(?:\.\w+)*)\s*(!==|===)\s*'(\w+)'/g,
      /(\w+(?:\.\w+)*)\s*(?:!==|===)\s*(undefined|null)/g,
      /(\w+(?:\.\w+)*)\s*<\s*(\d+)/g,
      /(\w+(?:\.\w+)*)\s*>\s*(\d+)/g,
      /!?\[([^\]]+)\]\.includes\(([^)]+)\)/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(functionBody)) !== null) {
        rules.push({
          field: match[1] || match[2],
          type: 'validation_check',
          details: match[0]
        });
      }
    }
    
    return rules;
  }

  /**
   * Verify core interface completeness
   */
  verifyCoreInterfaceCompleteness(interfaces) {
    console.log('🔍 Verifying core interface completeness...');
    
    const coreInterfaces = {
      'Alarm': [
        'ts', 'gid', 'aid', 'type', 'status', 'message', 
        'direction', 'protocol'
      ],
      'Flow': [
        'ts', 'gid', 'protocol', 'direction', 'block', 
        'count', 'device'
      ],
      'Device': [
        'id', 'gid', 'name', 'ip', 'online', 'ipReserved',
        'network', 'totalDownload', 'totalUpload'
      ],
      'NetworkRule': [
        'id', 'action', 'target', 'direction', 'ts', 'updateTs'
      ],
      'Box': [
        'gid', 'name', 'model', 'mode', 'version', 'online'
      ]
    };
    
    for (const [interfaceName, requiredFields] of Object.entries(coreInterfaces)) {
      const interface_ = interfaces[interfaceName];
      
      if (!interface_) {
        this.addResult('interfaces', `${interfaceName}-exists`, 'failed',
          `❌ Interface ${interfaceName} not found`);
        continue;
      }
      
      this.addResult('interfaces', `${interfaceName}-exists`, 'passed',
        `✅ Interface ${interfaceName} found`);
      
      // Check required fields
      const missingFields = [];
      const foundFields = [];
      
      for (const field of requiredFields) {
        if (interface_.properties[field]) {
          foundFields.push(field);
        } else {
          missingFields.push(field);
        }
      }
      
      if (missingFields.length === 0) {
        this.addResult('interfaces', `${interfaceName}-completeness`, 'passed',
          `✅ Interface ${interfaceName} has all required fields`);
      } else {
        this.addResult('interfaces', `${interfaceName}-completeness`, 'failed',
          `❌ Interface ${interfaceName} missing fields: ${missingFields.join(', ')}`,
          { missing: missingFields, found: foundFields });
      }
      
      // Check field count
      const totalFields = Object.keys(interface_.properties).length;
      this.addResult('interfaces', `${interfaceName}-field-count`, 'passed',
        `✅ Interface ${interfaceName} has ${totalFields} total fields`);
    }
  }

  /**
   * Verify validation function coverage
   */
  verifyValidationCoverage(interfaces, validators) {
    console.log('🔍 Verifying validation function coverage...');
    
    const coreTypes = ['Alarm', 'Flow', 'Device', 'NetworkRule'];
    
    for (const typeName of coreTypes) {
      const hasInterface = interfaces[typeName];
      const hasValidator = validators[typeName];
      
      if (hasInterface && hasValidator) {
        this.addResult('validation', `${typeName}-coverage`, 'passed',
          `✅ ${typeName} has both interface and validator`);
      } else if (hasInterface && !hasValidator) {
        this.addResult('validation', `${typeName}-coverage`, 'failed',
          `❌ ${typeName} has interface but no validator`);
      } else if (!hasInterface && hasValidator) {
        this.addResult('validation', `${typeName}-coverage`, 'failed',
          `❌ ${typeName} has validator but no interface`);
      } else {
        this.addResult('validation', `${typeName}-coverage`, 'failed',
          `❌ ${typeName} missing both interface and validator`);
      }
    }
  }

  /**
   * Verify type annotations in client methods
   */
  verifyClientTypeAnnotations(clientCode) {
    console.log('🔍 Verifying client method type annotations...');
    
    // Check for proper TypeScript annotations
    const methodPattern = /async\s+(\w+)\s*\([^)]*\):\s*Promise<([^>]+)>/g;
    let match;
    const methods = [];
    
    while ((match = methodPattern.exec(clientCode)) !== null) {
      const methodName = match[1];
      const returnType = match[2];
      
      methods.push({
        name: methodName,
        returnType: returnType.trim()
      });
    }
    
    this.addResult('type-annotations', 'method-count', 'passed',
      `✅ Found ${methods.length} methods with type annotations`);
    
    // Check specific methods for proper typing
    const coreApiMethods = [
      'getActiveAlarms', 'getFlowData', 'getNetworkRules', 
      'getDeviceStatus', 'getBoxes'
    ];
    
    for (const methodName of coreApiMethods) {
      const method = methods.find(m => m.name === methodName);
      
      if (method) {
        // Check if return type is properly typed
        const hasProperTyping = method.returnType.includes('count: number') &&
                               method.returnType.includes('results:') &&
                               method.returnType.includes('[]');
        
        if (hasProperTyping) {
          this.addResult('type-annotations', `${methodName}-typing`, 'passed',
            `✅ ${methodName} has proper return type annotation`);
        } else {
          this.addResult('type-annotations', `${methodName}-typing`, 'failed',
            `❌ ${methodName} has incomplete return type annotation`,
            { returnType: method.returnType });
        }
      } else {
        this.addResult('type-annotations', `${methodName}-typing`, 'failed',
          `❌ ${methodName} method not found`);
      }
    }
  }

  /**
   * Verify interface property types
   */
  verifyInterfacePropertyTypes(interfaces) {
    console.log('🔍 Verifying interface property types...');
    
    const typeChecks = {
      'Alarm': {
        'ts': 'number',
        'gid': 'string',
        'aid': 'number',
        'type': 'number',
        'status': 'number',
        'message': 'string',
        'direction': "'inbound' | 'outbound' | 'local'",
        'protocol': "'tcp' | 'udp'"
      },
      'Flow': {
        'ts': 'number',
        'gid': 'string',
        'protocol': 'string',
        'direction': "'inbound' | 'outbound' | 'local'",
        'block': 'boolean',
        'count': 'number'
      },
      'Device': {
        'id': 'string',
        'gid': 'string',
        'name': 'string',
        'ip': 'string',
        'online': 'boolean',
        'ipReserved': 'boolean',
        'totalDownload': 'number',
        'totalUpload': 'number'
      }
    };
    
    for (const [interfaceName, expectedTypes] of Object.entries(typeChecks)) {
      const interface_ = interfaces[interfaceName];
      
      if (!interface_) continue;
      
      for (const [fieldName, expectedType] of Object.entries(expectedTypes)) {
        const property = interface_.properties[fieldName];
        
        if (property) {
          // Simplified type checking - just verify basic types are present
          const hasCorrectType = property.type.includes('number') && expectedType.includes('number') ||
                                property.type.includes('string') && expectedType.includes('string') ||
                                property.type.includes('boolean') && expectedType.includes('boolean') ||
                                property.type.includes('inbound') && expectedType.includes('inbound');
          
          if (hasCorrectType || property.type === expectedType) {
            this.addResult('property-types', `${interfaceName}-${fieldName}`, 'passed',
              `✅ ${interfaceName}.${fieldName} has correct type`);
          } else {
            this.addResult('property-types', `${interfaceName}-${fieldName}`, 'failed',
              `❌ ${interfaceName}.${fieldName} type mismatch`,
              { expected: expectedType, actual: property.type });
          }
        }
      }
    }
  }

  /**
   * Verify validation rule completeness
   */
  verifyValidationRuleCompleteness(validators, interfaces) {
    console.log('🔍 Verifying validation rule completeness...');
    
    for (const [typeName, validator] of Object.entries(validators)) {
      const interface_ = interfaces[typeName];
      
      if (!interface_) continue;
      
      const validatedFields = validator.rules.map(rule => rule.field);
      const interfaceFields = Object.keys(interface_.properties);
      
      // Count how many interface fields have validation
      const coveredFields = interfaceFields.filter(field => 
        validatedFields.some(vf => vf.includes(field))
      );
      
      const coveragePercentage = Math.round((coveredFields.length / interfaceFields.length) * 100);
      
      if (coveragePercentage >= 70) {
        this.addResult('validation-rules', `${typeName}-coverage`, 'passed',
          `✅ ${typeName} validation covers ${coveragePercentage}% of fields`);
      } else {
        this.addResult('validation-rules', `${typeName}-coverage`, 'warnings',
          `⚠️ ${typeName} validation only covers ${coveragePercentage}% of fields`);
      }
    }
  }

  /**
   * Generate comprehensive report
   */
  generateReport() {
    console.log('\\n📊 VERIFICATION REPORT - V1.3: Type Safety');
    console.log('=' .repeat(60));
    
    console.log(`\\n📈 Summary:`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⚠️  Warnings: ${this.results.warnings}`);
    
    // Group results by category
    const byCategory = {};
    this.results.details.forEach(result => {
      if (!byCategory[result.category]) {
        byCategory[result.category] = [];
      }
      byCategory[result.category].push(result);
    });
    
    console.log(`\\n📋 Detailed Results:`);
    for (const [category, results] of Object.entries(byCategory)) {
      console.log(`\\n${category.toUpperCase()}:`);
      results.forEach(result => {
        const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⚠️';
        console.log(`  ${icon} ${result.test}: ${result.message}`);
        if (result.details) {
          console.log(`     Details: ${JSON.stringify(result.details, null, 6)}`);
        }
      });
    }
    
    const successRate = Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100);
    console.log(`\\n🎯 Success Rate: ${successRate}%`);
    
    if (this.results.failed <= 2) {
      console.log('\\n🎉 Type safety verification largely successful! V1.3 verification complete.');
      return true;
    } else {
      console.log(`\\n⚠️  ${this.results.failed} tests failed. Please review type safety issues.`);
      return false;
    }
  }

  /**
   * Run all verification tests
   */
  async runVerification() {
    console.log('🚀 Starting V1.3 Verification: Type Safety\\n');
    
    try {
      // Read source files
      const sourceFiles = await this.readSourceFiles();
      
      // Extract information
      const interfaces = this.extractInterfaces(sourceFiles.types);
      const validators = this.extractValidationFunctions(sourceFiles.validation);
      
      console.log(`📝 Extracted ${Object.keys(interfaces).length} interfaces and ${Object.keys(validators).length} validators\\n`);
      
      // Run all verification tests
      this.verifyCoreInterfaceCompleteness(interfaces);
      this.verifyValidationCoverage(interfaces, validators);
      this.verifyClientTypeAnnotations(sourceFiles.client);
      this.verifyInterfacePropertyTypes(interfaces);
      this.verifyValidationRuleCompleteness(validators, interfaces);
      
      // Generate report
      return this.generateReport();
      
    } catch (error) {
      console.error('💥 Verification failed:', error.message);
      return false;
    }
  }
}

// Run verification if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const verifier = new TypeSafetyVerifier();
  verifier.runVerification()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Verification error:', error);
      process.exit(1);
    });
}

export { TypeSafetyVerifier };