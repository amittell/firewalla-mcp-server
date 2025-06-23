#!/usr/bin/env node

/**
 * Warning Extractor for I-Block Tools
 * Identifies specific warnings for surgical fixes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WarningExtractor {
    constructor() {
        this.iBlockTargets = [
            'get_device_status',    // 96% (1 warning)
            'get_offline_devices',  // 96% (1 warning) 
            'get_boxes'            // 95% (1 warning)
        ];
    }

    async extractWarnings() {
        console.log('🔍 Extracting specific warnings for I-Block targets');
        console.log(`🎯 Target Tools: ${this.iBlockTargets.join(', ')}\n`);
        
        // Read the source files
        const srcPath = path.join(process.cwd(), 'src');
        const serverPath = path.join(srcPath, 'server.ts');
        const toolsPath = path.join(srcPath, 'tools', 'index.ts');
        const clientPath = path.join(srcPath, 'firewalla', 'client.ts');
        
        const toolsContent = fs.readFileSync(toolsPath, 'utf8');
        const serverContent = fs.readFileSync(serverPath, 'utf8');
        const clientContent = fs.readFileSync(clientPath, 'utf8');

        // Parse tools 
        const tools = this.parseToolObjects(toolsContent);
        
        const warningDetails = new Map();

        for (const toolName of this.iBlockTargets) {
            console.log(`🔍 Analyzing ${toolName}...`);
            
            const tool = tools.find(t => t.name === toolName);
            if (!tool) {
                console.log(`❌ Tool ${toolName} not found`);
                continue;
            }

            const warnings = await this.analyzeToolWarnings(tool, serverContent, clientContent);
            warningDetails.set(toolName, warnings);
            
            console.log(`⚠️  Found ${warnings.length} warning(s):`);
            warnings.forEach((warning, index) => {
                console.log(`   ${index + 1}. [${warning.category}] ${warning.message}`);
                console.log(`      Context: ${warning.context}`);
                console.log(`      Fix: ${warning.fix}\n`);
            });
        }

        return warningDetails;
    }

    async analyzeToolWarnings(tool, serverContent, clientContent) {
        const warnings = [];
        
        // Run all test categories and capture only warnings
        const categories = [
            'definition',
            'parameter_validation', 
            'client_integration',
            'response_format',
            'category_requirements',
            'edge_cases'
        ];

        for (const category of categories) {
            try {
                const categoryWarnings = await this.runCategoryTest(tool, category, serverContent, clientContent);
                warnings.push(...categoryWarnings);
            } catch (error) {
                warnings.push({
                    category: category,
                    message: error.message,
                    context: 'Test execution failed',
                    fix: 'Review test implementation'
                });
            }
        }

        return warnings;
    }

    async runCategoryTest(tool, category, serverContent, clientContent) {
        const warnings = [];

        switch (category) {
            case 'definition':
                return this.testDefinition(tool);
            case 'parameter_validation':
                return this.testParameterValidation(tool);
            case 'client_integration':
                return this.testClientIntegration(tool, clientContent);
            case 'response_format':
                return this.testResponseFormat(tool, clientContent);
            case 'category_requirements':
                return this.testCategoryRequirements(tool);
            case 'edge_cases':
                return this.testEdgeCases(tool, clientContent);
            default:
                return warnings;
        }
    }

    testDefinition(tool) {
        const warnings = [];
        
        // Only capture actual issues that would cause failures
        if (!tool.name || typeof tool.name !== 'string') {
            warnings.push({
                category: 'definition',
                message: 'Tool missing required name field',
                context: `Tool object: ${JSON.stringify(tool, null, 2)}`,
                fix: 'Add valid name string field to tool definition'
            });
        }

        if (!tool.description || typeof tool.description !== 'string') {
            warnings.push({
                category: 'definition',
                message: 'Tool missing required description field',
                context: `Tool: ${tool.name}`,
                fix: 'Add descriptive string field to tool definition'
            });
        }

        return warnings;
    }

    testParameterValidation(tool) {
        const warnings = [];
        
        // Check for missing or invalid inputSchema
        if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
            warnings.push({
                category: 'parameter_validation',
                message: 'Tool missing or invalid inputSchema',
                context: `Tool: ${tool.name}, Schema: ${typeof tool.inputSchema}`,
                fix: 'Add valid JSON schema object for input validation'
            });
        }

        return warnings;
    }

    testClientIntegration(tool, clientContent) {
        const warnings = [];
        
        // Convert tool name to method name
        const methodName = tool.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        
        // Check if method exists in client
        if (!clientContent.includes(`async ${methodName}(`)) {
            warnings.push({
                category: 'client_integration',
                message: `Client method "${methodName}" not found`,
                context: `Tool: ${tool.name}, Expected method: async ${methodName}(`,
                fix: `Implement async ${methodName} method in FirewallaClient class`
            });
        }

        return warnings;
    }

    testResponseFormat(tool, clientContent) {
        const warnings = [];
        
        const methodName = tool.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        
        // Check for proper return type annotation
        const returnTypePattern = new RegExp(`async\\s+${methodName}[^:]*:\\s*Promise<\\{\\s*count:\\s*number;\\s*results:[^;]+;\\s*next_cursor\\?:\\s*string\\s*\\}>`);
        if (!returnTypePattern.test(clientContent)) {
            warnings.push({
                category: 'response_format',
                message: `Method "${methodName}" missing standardized return type`,
                context: `Tool: ${tool.name}, Expected: Promise<{count: number; results: T[]; next_cursor?: string}>`,
                fix: `Update ${methodName} return type to standardized format`
            });
        }

        return warnings;
    }

    testCategoryRequirements(tool) {
        const warnings = [];
        
        // Check category-specific requirements based on tool classification
        const category = this.determineToolCategory(tool.name);
        
        if (category === 'CORE') {
            // CORE tools should have proper descriptions
            if (!tool.description.toLowerCase().includes('core') && 
                !tool.description.toLowerCase().includes('essential') &&
                !tool.description.toLowerCase().includes('status') &&
                !tool.description.toLowerCase().includes('device')) {
                warnings.push({
                    category: 'category_requirements',
                    message: 'Core tool should emphasize essential functionality',
                    context: `Tool: ${tool.name}, Category: CORE, Description: ${tool.description}`,
                    fix: 'Update description to highlight core/essential device/network functionality'
                });
            }
        }

        return warnings;
    }

    testEdgeCases(tool, clientContent) {
        const warnings = [];
        
        const methodName = tool.name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        
        // Find the method implementation
        const methodPattern = new RegExp(`async\\s+${methodName}[^{]*\\{([\\s\\S]*?)\\n\\s*\\}`, 'g');
        const methodMatch = clientContent.match(methodPattern);
        
        if (methodMatch && methodMatch[0]) {
            const methodBody = methodMatch[0];
            
            // Check for comprehensive error handling
            if (!methodBody.includes('try') || !methodBody.includes('catch')) {
                warnings.push({
                    category: 'edge_cases',
                    message: `Method "${methodName}" missing try-catch error handling`,
                    context: `Tool: ${tool.name}`,
                    fix: `Add comprehensive try-catch block to ${methodName} method`
                });
            }
            
            // Check for input validation - only warn if method accepts parameters
            const hasParameters = methodBody.includes('args') || methodPattern.toString().includes('\\(.*[a-zA-Z]');
            if (hasParameters && !methodBody.includes('validate') && !methodBody.includes('sanitize')) {
                warnings.push({
                    category: 'edge_cases', 
                    message: `Method "${methodName}" missing input validation`,
                    context: `Tool: ${tool.name}`,
                    fix: `Add input validation/sanitization to ${methodName} method parameters`
                });
            }
        }

        return warnings;
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
            
            tools.push(tool);
        });
        
        return tools;
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
}

// Main execution
async function main() {
    try {
        const extractor = new WarningExtractor();
        const warningDetails = await extractor.extractWarnings();
        
        console.log('\n🎯 SURGICAL FIX SUMMARY FOR I-BLOCK TARGETS');
        console.log('=' .repeat(60));
        
        for (const [toolName, warnings] of warningDetails) {
            console.log(`\n🔧 ${toolName}:`);
            if (warnings.length === 0) {
                console.log('  ✅ No warnings found - tool may already be at 100%');
            } else {
                warnings.forEach((warning, index) => {
                    console.log(`  ${index + 1}. ${warning.fix}`);
                });
            }
        }
        
        console.log('\n🚀 Ready for surgical precision fixes!');
        
    } catch (error) {
        console.error('❌ Warning extraction failed:', error.message);
        process.exit(1);
    }
}

// Execute if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { WarningExtractor };