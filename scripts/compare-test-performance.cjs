#!/usr/bin/env node
/**
 * Performance Comparison Script
 * 
 * Runs both traditional and optimized test suites to demonstrate
 * the performance improvement achieved through test optimization.
 */

const { spawn } = require('child_process');
const path = require('path');

async function runTest(testFile, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔄 Running ${label}...`);
    console.log('='.repeat(50));
    
    const start = Date.now();
    const testProcess = spawn('npm', ['test', '--', testFile], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    testProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Show real-time progress for API calls and performance metrics
      if (text.includes('API calls') || text.includes('Performance') || text.includes('📊') || text.includes('⚡')) {
        process.stdout.write(text);
      }
    });

    testProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    testProcess.on('close', (code) => {
      const duration = Date.now() - start;
      
      // Extract key metrics from output
      const apiCallsMatch = output.match(/Total API calls: (\d+)/);
      const testTimeMatch = output.match(/Total test time: (\d+)ms/);
      const avgTimeMatch = output.match(/Average call time: ([\d.]+)ms/);
      const testCountMatch = output.match(/Tests:\s+(\d+) passed/);
      
      const metrics = {
        duration,
        apiCalls: apiCallsMatch ? parseInt(apiCallsMatch[1]) : 0,
        testTime: testTimeMatch ? parseInt(testTimeMatch[1]) : 0,
        avgCallTime: avgTimeMatch ? parseFloat(avgTimeMatch[1]) : 0,
        testsPassed: testCountMatch ? parseInt(testCountMatch[1]) : 0,
        success: code === 0
      };

      if (code === 0) {
        console.log(`✅ ${label} completed successfully in ${duration}ms`);
        resolve(metrics);
      } else {
        console.log(`❌ ${label} failed with exit code ${code}`);
        console.log('Error output:', errorOutput);
        reject(new Error(`${label} failed`));
      }
    });
  });
}

function compareMetrics(traditional, optimized) {
  console.log('\n📊 PERFORMANCE COMPARISON RESULTS');
  console.log('='.repeat(60));
  
  console.log('\n🏃 Test Execution Time:');
  console.log(`  Traditional:  ${traditional.duration}ms`);
  console.log(`  Optimized:    ${optimized.duration}ms`);
  const timeImprovement = ((traditional.duration - optimized.duration) / traditional.duration * 100);
  console.log(`  Improvement:  ${timeImprovement.toFixed(1)}% faster`);
  
  console.log('\n🔗 API Call Count:');
  console.log(`  Traditional:  ${traditional.apiCalls} calls`);
  console.log(`  Optimized:    ${optimized.apiCalls} calls`);
  const callReduction = traditional.apiCalls > 0 
    ? ((traditional.apiCalls - optimized.apiCalls) / traditional.apiCalls * 100)
    : 0;
  console.log(`  Reduction:    ${callReduction.toFixed(1)}% fewer calls`);
  
  if (traditional.avgCallTime > 0 && optimized.avgCallTime > 0) {
    console.log('\n⚡ Average Call Time:');
    console.log(`  Traditional:  ${traditional.avgCallTime.toFixed(2)}ms`);
    console.log(`  Optimized:    ${optimized.avgCallTime.toFixed(2)}ms`);
  }
  
  console.log('\n🧪 Test Coverage:');
  console.log(`  Traditional:  ${traditional.testsPassed} tests passed`);
  console.log(`  Optimized:    ${optimized.testsPassed} tests passed`);
  
  // Success criteria evaluation
  console.log('\n🎯 SUCCESS CRITERIA EVALUATION:');
  
  const targetApiReduction = 60; // 60% reduction target
  const targetTimeImprovement = 40; // 40% improvement target
  
  if (callReduction >= targetApiReduction) {
    console.log(`  ✅ API Call Reduction: ${callReduction.toFixed(1)}% (target: ${targetApiReduction}%)`);
  } else {
    console.log(`  ⚠️ API Call Reduction: ${callReduction.toFixed(1)}% (target: ${targetApiReduction}%)`);
  }
  
  if (timeImprovement >= targetTimeImprovement) {
    console.log(`  ✅ Time Improvement: ${timeImprovement.toFixed(1)}% (target: ${targetTimeImprovement}%)`);
  } else if (timeImprovement > 0) {
    console.log(`  ⚠️ Time Improvement: ${timeImprovement.toFixed(1)}% (target: ${targetTimeImprovement}%)`);
  } else {
    console.log(`  ❌ Time Improvement: ${timeImprovement.toFixed(1)}% (target: ${targetTimeImprovement}%)`);
  }
  
  if (traditional.testsPassed === optimized.testsPassed) {
    console.log(`  ✅ Test Coverage Maintained: ${optimized.testsPassed} tests`);
  } else {
    console.log(`  ⚠️ Test Coverage Changed: ${traditional.testsPassed} → ${optimized.testsPassed}`);
  }
  
  // Overall assessment
  const criteriasMet = [
    callReduction >= targetApiReduction,
    timeImprovement >= 0, // At least no regression
    traditional.testsPassed === optimized.testsPassed
  ].filter(Boolean).length;
  
  console.log(`\n🏆 OVERALL ASSESSMENT:`);
  if (criteriasMet === 3) {
    console.log(`  🎉 EXCELLENT: All optimization goals achieved!`);
    console.log(`  💡 The optimized approach successfully reduces API calls while maintaining test coverage.`);
  } else if (criteriasMet === 2) {
    console.log(`  ✅ GOOD: Most optimization goals achieved.`);
    console.log(`  💡 The optimized approach shows improvement with room for further optimization.`);
  } else {
    console.log(`  ⚠️ PARTIAL: Some optimization achieved, but targets not fully met.`);
    console.log(`  💡 Consider further optimizations or adjusting targets.`);
  }
  
  // Projected impact
  console.log(`\n📈 PROJECTED IMPACT:`);
  if (traditional.apiCalls > 0) {
    const dailyCallsSaved = callReduction * traditional.apiCalls / 100 * 10; // Assuming 10 test runs per day
    console.log(`  • API calls saved per day: ~${dailyCallsSaved.toFixed(0)} calls`);
    console.log(`  • Reduced rate limit pressure: ${callReduction.toFixed(1)}% less API usage`);
  }
  
  if (timeImprovement > 0) {
    console.log(`  • Faster developer feedback: ${timeImprovement.toFixed(1)}% quicker test results`);
    console.log(`  • CI/CD efficiency: Improved build pipeline performance`);
  }
}

async function main() {
  try {
    console.log('🚀 Starting Test Optimization Performance Comparison');
    console.log('This script demonstrates the performance benefits of optimized testing patterns.');
    
    // Run traditional approach first
    const traditionalMetrics = await runTest(
      'tests/firewalla/client-device-traditional.test.ts',
      'Traditional Test Suite'
    );
    
    // Run optimized approach
    const optimizedMetrics = await runTest(
      'tests/firewalla/client-device-optimized.test.ts',
      'Optimized Test Suite'
    );
    
    // Compare results
    compareMetrics(traditionalMetrics, optimizedMetrics);
    
  } catch (error) {
    console.error('❌ Performance comparison failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runTest, compareMetrics };