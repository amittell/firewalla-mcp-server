#!/usr/bin/env node
/**
 * Cross-platform test utility for Phase 2 tools validation
 * Handles npm execution with Windows compatibility
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

/**
 * Cross-platform npm command execution
 * Handles Windows .cmd/.bat extension requirements
 */
function executeNpmCommand(command, args = [], options = {}) {
  // Determine the correct npm command based on platform
  const isWindows = process.platform === 'win32';
  const npmCommand = isWindows ? 'npm.cmd' : 'npm';
  
  // Combine command and args
  const fullArgs = [command, ...args];
  
  console.log(`Executing: ${npmCommand} ${fullArgs.join(' ')}`);
  
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, fullArgs, {
      stdio: 'inherit',
      shell: isWindows,
      ...options
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`npm ${command} failed with exit code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(new Error(`Failed to execute npm ${command}: ${error.message}`));
    });
  });
}

/**
 * Run Phase 2 tool validation tests
 */
async function runPhase2Tests() {
  console.log('Starting Phase 2 tools validation...');
  console.log(`Platform: ${os.platform()} ${os.arch()}`);
  console.log(`Node.js: ${process.version}`);
  
  try {
    // Install dependencies if needed
    console.log('\n1. Installing dependencies...');
    await executeNpmCommand('install');
    
    // Build the project
    console.log('\n2. Building project...');
    await executeNpmCommand('run', ['build']);
    
    // Run tests
    console.log('\n3. Running Phase 2 validation tests...');
    await executeNpmCommand('test', ['--', '--grep', 'Phase 2']);
    
    console.log('\n✅ Phase 2 tools validation completed successfully!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Phase 2 tools validation failed:');
    console.error(error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runPhase2Tests();
}

module.exports = {
  executeNpmCommand,
  runPhase2Tests
};