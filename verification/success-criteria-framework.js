#!/usr/bin/env node

/**
 * 100% Success Criteria Framework
 * 
 * Defines comprehensive success criteria for achieving 100% success rate
 * across all Firewalla MCP tools with proper prioritization and benchmarks.
 */

export class SuccessCriteriaFramework {
  constructor() {
    this.criticalTests = new Set([
      'definition-structure',
      'client-method-exists', 
      'standard-format',
      'error-handling',
      'parameter-types'
    ]);

    this.optimizationTests = new Set([
      'response-optimization',
      'v2-endpoint',
      'pagination-support',
      'caching-support',
      'response-sanitization'
    ]);

    this.edgeCaseTests = new Set([
      'parameter-boundaries',
      'enum-validation',
      'null-handling',
      'timeout-handling',
      'rate-limit-awareness',
      'input-sanitization',
      'type-validation',
      'pagination-efficiency'
    ]);

    this.categoryBenchmarks = {
      core: {
        target: 100,
        criticalThreshold: 95,
        description: 'Core data retrieval tools - must be rock solid'
      },
      analytics: {
        target: 95,
        criticalThreshold: 90,
        description: 'Analytics tools - high reliability with optimization focus'
      },
      rules: {
        target: 95,
        criticalThreshold: 90,
        description: 'Rule management tools - critical for security operations'
      },
      search: {
        target: 90,
        criticalThreshold: 85,
        description: 'Advanced search tools - complex but should be reliable'
      },
      specialized: {
        target: 95,
        criticalThreshold: 90,
        description: 'Specialized operations - critical for specific workflows'
      }
    };
  }

  /**
   * Calculate weighted success rate based on test criticality
   */
  calculateWeightedSuccessRate(results) {
    let totalWeight = 0;
    let weightedPassed = 0;

    for (const [toolName, toolResults] of results.entries()) {
      for (const test of toolResults.tests) {
        let weight = this.getTestWeight(test.test);
        totalWeight += weight;
        
        if (test.status === 'passed') {
          weightedPassed += weight;
        } else if (test.status === 'warnings' && !this.criticalTests.has(test.test)) {
          // Warnings on non-critical tests get partial credit
          weightedPassed += weight * 0.5;
        }
      }
    }

    return totalWeight > 0 ? Math.round((weightedPassed / totalWeight) * 100) : 0;
  }

  /**
   * Get test weight based on criticality
   */
  getTestWeight(testName) {
    if (this.criticalTests.has(testName)) {
      return 3; // Critical tests worth 3x
    } else if (this.optimizationTests.has(testName)) {
      return 2; // Optimization tests worth 2x  
    } else if (this.edgeCaseTests.has(testName)) {
      return 1; // Edge case tests worth 1x
    } else {
      return 2; // Default weight for other tests
    }
  }

  /**
   * Determine if a tool meets 100% success criteria
   */
  evaluateToolFor100Percent(toolName, toolResults, category) {
    const benchmark = this.categoryBenchmarks[category] || this.categoryBenchmarks.core;
    
    // Check critical test failures
    const criticalFailures = toolResults.tests.filter(test => 
      this.criticalTests.has(test.test) && test.status === 'failed'
    );

    if (criticalFailures.length > 0) {
      return {
        qualifies: false,
        reason: `Critical test failures: ${criticalFailures.map(t => t.test).join(', ')}`,
        category: 'critical-failure'
      };
    }

    // Check critical test warnings
    const criticalWarnings = toolResults.tests.filter(test =>
      this.criticalTests.has(test.test) && test.status === 'warnings'
    );

    if (criticalWarnings.length > 0) {
      return {
        qualifies: false,
        reason: `Critical test warnings: ${criticalWarnings.map(t => t.test).join(', ')}`,
        category: 'critical-warning'
      };
    }

    // Calculate success rate
    const totalTests = toolResults.tests.length;
    const passedTests = toolResults.tests.filter(t => t.status === 'passed').length;
    const successRate = Math.round((passedTests / totalTests) * 100);

    if (successRate >= benchmark.target) {
      return {
        qualifies: true,
        successRate: successRate,
        category: 'qualified'
      };
    } else if (successRate >= benchmark.criticalThreshold) {
      return {
        qualifies: false,
        reason: `Success rate ${successRate}% below target ${benchmark.target}%`,
        category: 'near-qualified',
        successRate: successRate
      };
    } else {
      return {
        qualifies: false,
        reason: `Success rate ${successRate}% below critical threshold ${benchmark.criticalThreshold}%`,
        category: 'needs-improvement',
        successRate: successRate
      };
    }
  }

  /**
   * Generate 100% success roadmap
   */
  generateSuccessRoadmap(results) {
    const roadmap = {
      qualified100Percent: [],
      nearQualified: [],
      needsImprovement: [],
      criticalIssues: [],
      recommendations: []
    };

    for (const [toolName, toolResults] of results.entries()) {
      const category = this.determineToolCategory(toolName);
      const evaluation = this.evaluateToolFor100Percent(toolName, toolResults, category);
      
      const toolInfo = {
        name: toolName,
        category: category,
        successRate: evaluation.successRate,
        reason: evaluation.reason
      };

      switch (evaluation.category) {
        case 'qualified':
          roadmap.qualified100Percent.push(toolInfo);
          break;
        case 'near-qualified':
          roadmap.nearQualified.push(toolInfo);
          break;
        case 'needs-improvement':
          roadmap.needsImprovement.push(toolInfo);
          break;
        case 'critical-failure':
        case 'critical-warning':
          roadmap.criticalIssues.push(toolInfo);
          break;
      }
    }

    // Generate recommendations
    roadmap.recommendations = this.generateRecommendations(roadmap);

    return roadmap;
  }

  /**
   * Generate actionable recommendations
   */
  generateRecommendations(roadmap) {
    const recommendations = [];

    if (roadmap.criticalIssues.length > 0) {
      recommendations.push({
        priority: 'critical',
        action: `Fix critical issues in ${roadmap.criticalIssues.length} tools`,
        tools: roadmap.criticalIssues.map(t => t.name),
        impact: 'Blocks 100% achievement'
      });
    }

    if (roadmap.nearQualified.length > 0) {
      recommendations.push({
        priority: 'high',
        action: `Optimize ${roadmap.nearQualified.length} near-qualified tools`,
        tools: roadmap.nearQualified.map(t => t.name),
        impact: 'Quick wins for 100% achievement'
      });
    }

    if (roadmap.needsImprovement.length > 0) {
      recommendations.push({
        priority: 'medium',
        action: `Improve ${roadmap.needsImprovement.length} underperforming tools`,
        tools: roadmap.needsImprovement.map(t => t.name),
        impact: 'Long-term reliability improvements'
      });
    }

    // Category-specific recommendations
    const categoryStats = this.analyzeCategoryPerformance(roadmap);
    for (const [category, stats] of Object.entries(categoryStats)) {
      if (stats.averageSuccessRate < this.categoryBenchmarks[category]?.target) {
        recommendations.push({
          priority: 'medium',
          action: `Focus on ${category.toUpperCase()} category improvements`,
          details: `Average success rate: ${stats.averageSuccessRate}%, target: ${this.categoryBenchmarks[category].target}%`,
          impact: 'Category-wide performance improvement'
        });
      }
    }

    return recommendations;
  }

  /**
   * Determine tool category
   */
  determineToolCategory(toolName) {
    const categories = {
      core: ['get_active_alarms', 'get_flow_data', 'get_device_status', 'get_offline_devices', 'get_network_rules', 'get_boxes'],
      analytics: ['get_bandwidth_usage', 'get_simple_statistics', 'get_statistics_by_region', 'get_statistics_by_box', 'get_flow_trends', 'get_alarm_trends', 'get_rule_trends'],
      rules: ['pause_rule', 'resume_rule', 'get_network_rules_summary', 'get_most_active_rules', 'get_recent_rules'],
      search: ['search_flows', 'search_alarms', 'search_rules', 'search_devices', 'search_target_lists', 'search_cross_reference'],
      specialized: ['get_target_lists', 'get_specific_alarm', 'delete_alarm']
    };

    for (const [category, tools] of Object.entries(categories)) {
      if (tools.includes(toolName)) {
        return category;
      }
    }
    return 'unknown';
  }

  /**
   * Analyze category performance
   */
  analyzeCategoryPerformance(roadmap) {
    const categoryStats = {};
    const allTools = [
      ...roadmap.qualified100Percent,
      ...roadmap.nearQualified,
      ...roadmap.needsImprovement,
      ...roadmap.criticalIssues
    ];

    const qualifiedSet = new Set(roadmap.qualified100Percent);
    const categories = ['core', 'analytics', 'rules', 'search', 'specialized'];
    
    for (const category of categories) {
      const categoryTools = allTools.filter(tool => tool.category === category);
      const successRates = categoryTools.map(tool => tool.successRate || 0);
      
      categoryStats[category] = {
        toolCount: categoryTools.length,
        averageSuccessRate: successRates.length > 0 
          ? Math.round(successRates.reduce((sum, rate) => sum + rate, 0) / successRates.length)
          : 0,
        qualified: categoryTools.filter(tool => qualifiedSet.has(tool)).length
      };
    }

    return categoryStats;
  }

  /**
   * Generate 100% achievement plan
   */
  generateAchievementPlan(results) {
    const roadmap = this.generateSuccessRoadmap(results);
    const weightedSuccessRate = this.calculateWeightedSuccessRate(results);
    
    return {
      currentStatus: {
        weightedSuccessRate: weightedSuccessRate,
        qualified100Percent: roadmap.qualified100Percent.length,
        totalTools: Object.keys(results).length,
        qualificationRate: Math.round((roadmap.qualified100Percent.length / Object.keys(results).length) * 100)
      },
      roadmap: roadmap,
      phases: this.createImplementationPhases(roadmap),
      timeline: this.estimateTimeline(roadmap)
    };
  }

  /**
   * Create implementation phases for 100% achievement
   */
  createImplementationPhases(roadmap) {
    return {
      phase1: {
        name: 'Critical Issue Resolution',
        tools: roadmap.criticalIssues,
        priority: 'critical',
        estimatedEffort: 'high',
        description: 'Address all critical failures and warnings that block 100% achievement'
      },
      phase2: {
        name: 'Near-Qualified Optimization',
        tools: roadmap.nearQualified,
        priority: 'high', 
        estimatedEffort: 'medium',
        description: 'Optimize tools that are close to 100% qualification'
      },
      phase3: {
        name: 'Performance Enhancement',
        tools: roadmap.needsImprovement,
        priority: 'medium',
        estimatedEffort: 'high',
        description: 'Improve underperforming tools for long-term reliability'
      }
    };
  }

  /**
   * Estimate timeline for 100% achievement
   */
  estimateTimeline(roadmap) {
    const criticalCount = roadmap.criticalIssues.length;
    const nearQualifiedCount = roadmap.nearQualified.length;
    const needsImprovementCount = roadmap.needsImprovement.length;

    return {
      phase1Duration: `${Math.max(1, Math.ceil(criticalCount / 5))} days`,
      phase2Duration: `${Math.max(1, Math.ceil(nearQualifiedCount / 3))} days`, 
      phase3Duration: `${Math.max(2, Math.ceil(needsImprovementCount / 2))} days`,
      totalEstimate: `${Math.max(4, Math.ceil((criticalCount / 5) + (nearQualifiedCount / 3) + (needsImprovementCount / 2)))} days`,
      confidence: this.calculateConfidence(roadmap)
    };
  }

  /**
   * Calculate confidence in timeline estimate
   */
  calculateConfidence(roadmap) {
    const totalTools = roadmap.qualified100Percent.length + roadmap.nearQualified.length + 
                      roadmap.needsImprovement.length + roadmap.criticalIssues.length;
    
    const qualifiedRatio = roadmap.qualified100Percent.length / totalTools;
    
    if (qualifiedRatio >= 0.8) return 'high';
    if (qualifiedRatio >= 0.6) return 'medium';
    return 'low';
  }
}