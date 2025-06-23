#!/usr/bin/env node

/**
 * Precision Diagnostics for Phase 4: Surgical Edge Case Elimination
 * Captures detailed warning information for targeted fixes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PrecisionDiagnostics {
    constructor() {
        this.warningDetails = new Map();
        this.testCategories = [
            'definition',
            'parameter_validation',
            'client_integration', 
            'response_format',
            'category_requirements',
            'edge_cases'
        ];
    }

    async runDiagnostics(targetTools = []) {
        console.log('🔬 Starting Precision Diagnostics for Phase 4');
        console.log(`🎯 Target Tools: ${targetTools.join(', ')}`);
        
        // Read the source files
        const srcPath = path.join(process.cwd(), 'src');
        const serverPath = path.join(srcPath, 'server.ts');
        const toolsPath = path.join(srcPath, 'tools', 'index.ts');
        const clientPath = path.join(srcPath, 'firewalla', 'client.ts');
        
        if (!fs.existsSync(serverPath) || !fs.existsSync(toolsPath) || !fs.existsSync(clientPath)) {
            throw new Error('Required source files not found');
        }

        const toolsContent = fs.readFileSync(toolsPath, 'utf8');
        const serverContent = fs.readFileSync(serverPath, 'utf8');
        const clientContent = fs.readFileSync(clientPath, 'utf8');

        // Parse tools from the content
        const tools = this.parseToolObjects(toolsContent);
        console.log(`🔧 Extracted ${tools.length} tool objects from tools/index.ts`);
        
        // Filter to target tools if specified
        const toolsToTest = targetTools.length > 0 
            ? tools.filter(tool => targetTools.includes(tool.name))
            : tools;

        console.log(`🔍 Running precision diagnostics on ${toolsToTest.length} tools...\n`);

        const results = [];
        for (const tool of toolsToTest) {
            console.log(`🎯 Analyzing ${tool.name}...`);
            const result = await this.analyzeToolWithDetails(tool, serverContent, clientContent);
            results.push(result);
            
            if (result.warnings.length > 0) {
                console.log(`⚠️  Found ${result.warnings.length} warnings:`);
                result.warnings.forEach((warning, index) => {
                    console.log(`   ${index + 1}. ${warning.category}: ${warning.message}`);
                    console.log(`      Context: ${warning.context}`);
                    console.log(`      Fix: ${warning.suggestedFix}`);
                });
            } else {
                console.log(`✅ No warnings found`);
            }
            console.log('');
        }

        return this.generatePrecisionReport(results);
    }

    parseToolObjects(toolsContent) {
        // Parse tools from switch statement cases in setupTools function
        const caseMatches = toolsContent.match(/case\s+'([^']+)':/g);
        
        if (!caseMatches) {
            throw new Error('Could not find tool cases in setupTools function');
        }
        
        const tools = [];
        
        // Extract tool names from switch cases
        caseMatches.forEach(caseMatch => {
            const toolName = caseMatch.match(/case\s+'([^']+)':/)[1];
            
            // Create basic tool object structure
            const tool = {
                name: toolName,
                description: `Firewalla ${toolName.replace(/_/g, ' ')} tool`,
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            };
            
            // Extract parameter information from the tool implementation
            const toolPattern = new RegExp(`case\\s+'${toolName}':[\\s\\S]*?break;`, 'g');
            const toolMatch = toolsContent.match(toolPattern);
            
            if (toolMatch && toolMatch[0]) {
                const toolImpl = toolMatch[0];
                
                // Extract parameters from args?.parameter patterns
                const paramMatches = toolImpl.match(/args\?\.\w+/g);
                if (paramMatches) {
                    paramMatches.forEach(paramMatch => {
                        const paramName = paramMatch.replace('args?.', '');
                        if (paramName && !tool.inputSchema.properties[paramName]) {
                            tool.inputSchema.properties[paramName] = {
                                type: 'string',
                                description: `${paramName} parameter`
                            };
                        }
                    });
                }
            }
            
            tools.push(tool);
        });
        
        return tools;
    }

    async analyzeToolWithDetails(tool, serverContent, clientContent) {
        const result = {
            name: tool.name,
            passed: 0,
            failed: 0,
            warnings: [],
            successRate: 0
        };

        // Run each test category with detailed warning capture
        for (const category of this.testCategories) {
            try {
                const categoryResult = await this.runTestCategory(tool, category, serverContent, clientContent);
                result.passed += categoryResult.passed;
                result.failed += categoryResult.failed;
                result.warnings.push(...categoryResult.warnings);
            } catch (error) {
                result.failed++;
                result.warnings.push({
                    category: category,
                    message: error.message,
                    context: 'Test execution failed',
                    suggestedFix: 'Review test implementation'
                });
            }
        }

        const total = result.passed + result.failed + result.warnings.length;
        result.successRate = total > 0 ? Math.round((result.passed / total) * 100) : 0;

        return result;
    }

    async runTestCategory(tool, category, serverContent, clientContent) {
        const result = { passed: 0, failed: 0, warnings: [] };

        switch (category) {
            case 'definition':
                return this.testDefinitionWithDetails(tool);
            case 'parameter_validation':
                return this.testParameterValidationWithDetails(tool);
            case 'client_integration':
                return this.testClientIntegrationWithDetails(tool, clientContent);
            case 'response_format':
                return this.testResponseFormatWithDetails(tool, clientContent);
            case 'category_requirements':
                return this.testCategoryRequirementsWithDetails(tool);
            case 'edge_cases':
                return this.testEdgeCasesWithDetails(tool, clientContent);
            default:
                result.failed++;
                return result;
        }
    }

    testDefinitionWithDetails(tool) {
        const result = { passed: 0, failed: 0, warnings: [] };

        // Test required fields
        if (!tool.name || typeof tool.name !== 'string') {
            result.warnings.push({
                category: 'definition',
                message: 'Tool missing required name field',
                context: `Tool object: ${JSON.stringify(tool, null, 2)}`,
                suggestedFix: 'Add valid name string field to tool definition'
            });
        } else {
            result.passed++;
        }

        if (!tool.description || typeof tool.description !== 'string') {
            result.warnings.push({
                category: 'definition',
                message: 'Tool missing required description field',
                context: `Tool: ${tool.name}`,
                suggestedFix: 'Add descriptive string field to tool definition'
            });
        } else {
            result.passed++;
        }

        // Test input schema
        if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
            result.warnings.push({
                category: 'definition',
                message: 'Tool missing or invalid inputSchema',
                context: `Tool: ${tool.name}, Schema: ${typeof tool.inputSchema}`,
                suggestedFix: 'Add valid JSON schema object for input validation'
            });
        } else {
            result.passed++;
        }

        return result;
    }

    testParameterValidationWithDetails(tool) {
        const result = { passed: 0, failed: 0, warnings: [] };

        if (!tool.inputSchema || !tool.inputSchema.properties) {
            result.warnings.push({
                category: 'parameter_validation',
                message: 'InputSchema missing properties definition',
                context: `Tool: ${tool.name}`,
                suggestedFix: 'Add properties object to inputSchema with parameter definitions'
            });
            return result;
        }

        const properties = tool.inputSchema.properties;
        const required = tool.inputSchema.required || [];

        // Validate each parameter has proper definition
        for (const [paramName, paramDef] of Object.entries(properties)) {
            if (!paramDef.type) {
                result.warnings.push({
                    category: 'parameter_validation',
                    message: `Parameter "${paramName}" missing type definition`,
                    context: `Tool: ${tool.name}, Parameter: ${JSON.stringify(paramDef)}`,
                    suggestedFix: `Add "type" field to ${paramName} parameter definition`
                });
            } else {
                result.passed++;
            }

            if (!paramDef.description) {
                result.warnings.push({
                    category: 'parameter_validation',
                    message: `Parameter "${paramName}" missing description`,
                    context: `Tool: ${tool.name}`,
                    suggestedFix: `Add descriptive "description" field to ${paramName} parameter`
                });
            } else {
                result.passed++;
            }
        }

        return result;
    }

    testClientIntegrationWithDetails(tool, clientContent) {
        const result = { passed: 0, failed: 0, warnings: [] };

        // Convert tool name to method name (get_active_alarms -> getActiveAlarms)
        const methodName = tool.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        
        if (!clientContent.includes(methodName)) {
            result.warnings.push({
                category: 'client_integration',
                message: `Client method "${methodName}" not found`,
                context: `Tool: ${tool.name}, Expected method: ${methodName}`,
                suggestedFix: `Implement ${methodName} method in FirewallaClient class`
            });
        } else {
            result.passed++;
        }

        // Check for async method signature
        const asyncMethodPattern = new RegExp(`async\\s+${methodName}\\s*\\(`);
        if (!asyncMethodPattern.test(clientContent)) {
            result.warnings.push({
                category: 'client_integration',
                message: `Method "${methodName}" not declared as async`,
                context: `Tool: ${tool.name}`,
                suggestedFix: `Add "async" keyword to ${methodName} method declaration`
            });
        } else {
            result.passed++;
        }

        return result;
    }

    testResponseFormatWithDetails(tool, clientContent) {
        const result = { passed: 0, failed: 0, warnings: [] };

        const methodName = tool.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        
        // Check for standardized return type
        const returnTypePattern = new RegExp(`${methodName}[^:]*:\\s*Promise<\\{\\s*count:\\s*number;\\s*results:\\s*[^;]+;\\s*next_cursor\\?:\\s*string\\s*\\}>`);
        if (!returnTypePattern.test(clientContent)) {
            result.warnings.push({
                category: 'response_format',
                message: `Method "${methodName}" missing standardized return type`,
                context: `Tool: ${tool.name}, Expected: Promise<{count: number; results: T[]; next_cursor?: string}>`,
                suggestedFix: `Update ${methodName} return type to standardized format`
            });
        } else {
            result.passed++;
        }

        // Check for decorator usage
        const decoratorPattern = new RegExp(`@(optimizeResponse|validateResponse)[^\\n]*\\n[^\\n]*${methodName}`);
        if (!decoratorPattern.test(clientContent)) {
            result.warnings.push({
                category: 'response_format',
                message: `Method "${methodName}" missing optimization decorators`,
                context: `Tool: ${tool.name}`,
                suggestedFix: `Add @optimizeResponse() and @validateResponse() decorators to ${methodName}`
            });
        } else {
            result.passed++;
        }

        return result;
    }

    testCategoryRequirementsWithDetails(tool) {
        const result = { passed: 0, failed: 0, warnings: [] };

        // Determine tool category
        const category = this.determineToolCategory(tool.name);
        
        switch (category) {
            case 'CORE':
                if (!tool.description.includes('core') && !tool.description.includes('essential')) {
                    result.warnings.push({
                        category: 'category_requirements',
                        message: 'Core tool should emphasize essential functionality',
                        context: `Tool: ${tool.name}, Category: CORE`,
                        suggestedFix: 'Update description to highlight core/essential nature'
                    });
                } else {
                    result.passed++;
                }
                break;
            case 'SEARCH':
                if (!tool.description.includes('search') && !tool.description.includes('query')) {
                    result.warnings.push({
                        category: 'category_requirements',
                        message: 'Search tool should emphasize search/query capabilities',
                        context: `Tool: ${tool.name}, Category: SEARCH`,
                        suggestedFix: 'Update description to highlight search/query functionality'
                    });
                } else {
                    result.passed++;
                }
                break;
            default:
                result.passed++;
        }

        return result;
    }

    testEdgeCasesWithDetails(tool, clientContent) {
        const result = { passed: 0, failed: 0, warnings: [] };

        const methodName = tool.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        
        // Check for error handling
        const methodMatch = clientContent.match(new RegExp(`async\\s+${methodName}[^{]*\\{([\\s\\S]*?)\\n\\s*\\}`));
        if (methodMatch) {
            const methodBody = methodMatch[1];
            
            if (!methodBody.includes('try') || !methodBody.includes('catch')) {
                result.warnings.push({
                    category: 'edge_cases',
                    message: `Method "${methodName}" missing try-catch error handling`,
                    context: `Tool: ${tool.name}`,
                    suggestedFix: `Add try-catch block to ${methodName} for proper error handling`
                });
            } else {
                result.passed++;
            }

            // Check for input validation
            if (!methodBody.includes('validate') && !methodBody.includes('sanitize')) {
                result.warnings.push({
                    category: 'edge_cases',
                    message: `Method "${methodName}" missing input validation`,
                    context: `Tool: ${tool.name}`,
                    suggestedFix: `Add input validation/sanitization to ${methodName}`
                });
            } else {
                result.passed++;
            }
        } else {
            result.warnings.push({
                category: 'edge_cases',
                message: `Method "${methodName}" implementation not found`,
                context: `Tool: ${tool.name}`,
                suggestedFix: `Implement ${methodName} method in client`
            });
        }

        return result;
    }

    determineToolCategory(toolName) {
        if (['get_active_alarms', 'get_flow_data', 'get_device_status', 'get_network_rules'].includes(toolName)) {
            return 'CORE';
        }
        if (toolName.startsWith('search_')) {
            return 'SEARCH';
        }
        if (toolName.includes('statistics') || toolName.includes('trends')) {
            return 'ANALYTICS';
        }
        if (toolName.includes('rule')) {
            return 'RULES';
        }
        return 'SPECIALIZED';
    }

    generatePrecisionReport(results) {
        console.log('\n================================================================================');
        console.log('🔬 PRECISION DIAGNOSTICS REPORT - PHASE 4');
        console.log('================================================================================\n');

        const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
        const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
        const totalTests = results.reduce((sum, r) => sum + r.passed + r.failed + r.warnings.length, 0);
        const overallSuccess = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

        console.log(`📊 Overall Summary:`);
        console.log(`✅ Passed: ${totalPassed}`);
        console.log(`⚠️  Warnings: ${totalWarnings}`);
        console.log(`📊 Total Tests: ${totalTests}`);
        console.log(`🎯 Success Rate: ${overallSuccess}%\n`);

        console.log(`🔍 Tool-by-Tool Precision Analysis:\n`);

        // Group warnings by category for analysis
        const warningsByCategory = new Map();
        const warningsByTool = new Map();

        results.forEach(result => {
            console.log(`🔧 ${result.name}:`);
            console.log(`  Success Rate: ${result.successRate}% (${result.passed}/${result.passed + result.warnings.length})`);
            console.log(`  ✅ Passed: ${result.passed}`);
            console.log(`  ⚠️  Warnings: ${result.warnings.length}`);
            
            if (result.warnings.length > 0) {
                console.log(`  📋 Warning Details:`);
                result.warnings.forEach((warning, index) => {
                    console.log(`    ${index + 1}. [${warning.category}] ${warning.message}`);
                    console.log(`       Context: ${warning.context}`);
                    console.log(`       Fix: ${warning.suggestedFix}`);
                    
                    // Track warnings by category
                    if (!warningsByCategory.has(warning.category)) {
                        warningsByCategory.set(warning.category, []);
                    }
                    warningsByCategory.get(warning.category).push({tool: result.name, ...warning});
                    
                    // Track warnings by tool
                    if (!warningsByTool.has(result.name)) {
                        warningsByTool.set(result.name, []);
                    }
                    warningsByTool.get(result.name).push(warning);
                });
            }
            console.log('');
        });

        // Generate surgical fix recommendations
        console.log('🎯 Surgical Fix Recommendations:\n');
        
        for (const [category, warnings] of warningsByCategory) {
            console.log(`📋 ${category.toUpperCase()} Category (${warnings.length} warnings):`);
            warnings.forEach(warning => {
                console.log(`  • ${warning.tool}: ${warning.suggestedFix}`);
            });
            console.log('');
        }

        // Generate phase 4 priority targets
        console.log('🚀 Phase 4 Priority Targets:\n');
        
        const priorityTargets = results
            .filter(r => r.warnings.length <= 2 && r.successRate >= 90)
            .sort((a, b) => b.successRate - a.successRate);

        console.log('🎯 I-Block Quick Wins (1-2 warnings, 95%+ success):');
        priorityTargets.filter(r => r.successRate >= 95).forEach(r => {
            console.log(`  ⚡ ${r.name} (${r.successRate}%) - ${r.warnings.length} warning(s)`);
        });

        console.log('\n⚡ J-Block Precision Targets (2-3 warnings, 90%+ success):');
        priorityTargets.filter(r => r.successRate >= 90 && r.successRate < 95).forEach(r => {
            console.log(`  🎯 ${r.name} (${r.successRate}%) - ${r.warnings.length} warning(s)`);
        });

        console.log('\n================================================================================');
        
        return {
            overallSuccess,
            totalWarnings,
            warningsByCategory: Array.from(warningsByCategory.entries()),
            warningsByTool: Array.from(warningsByTool.entries()),
            priorityTargets,
            results
        };
    }
}

// Main execution
async function main() {
    try {
        const diagnostics = new PrecisionDiagnostics();
        
        // Phase 4 I-Block targets: highest priority tools needing surgical precision
        const iBlockTargets = [
            'get_device_status',    // 96% (1 warning)
            'get_offline_devices',  // 96% (1 warning) 
            'get_boxes'            // 95% (1 warning)
        ];
        
        console.log('🔬 Phase 4: Precision Edge Case Elimination');
        console.log('🎯 Running surgical diagnostics on I-Block targets\n');
        
        const report = await diagnostics.runDiagnostics(iBlockTargets);
        
        // Save detailed results
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = `precision-diagnostics-${timestamp}.json`;
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log(`\n💾 Detailed report saved to: ${reportPath}`);
        console.log('🎯 Ready for surgical precision fixes on I-Block targets');
        
    } catch (error) {
        console.error('❌ Precision diagnostics failed:', error.message);
        process.exit(1);
    }
}

// Execute if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { PrecisionDiagnostics };