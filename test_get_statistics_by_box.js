#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';

class MCPTester {
    constructor() {
        this.results = {
            toolAvailability: null,
            parameterValidation: {},
            responseStructure: null,
            dataAggregation: null,
            errors: []
        };
        this.requestId = 1;
    }

    async testGetStatisticsByBox() {
        console.log('=== Testing get_statistics_by_box MCP Tool ===\n');
        
        try {
            // Step 1: Start MCP server and test tool availability
            await this.testToolAvailability();
            
            // Step 2: Test parameter validation
            await this.testParameterValidation();
            
            // Step 3: Test response structure
            await this.testResponseStructure();
            
            // Step 4: Test data aggregation
            await this.testDataAggregation();
            
            // Generate final report
            this.generateReport();
            
        } catch (error) {
            console.error('Test execution failed:', error);
            this.results.errors.push(`Test execution failed: ${error.message}`);
        }
    }

    async testToolAvailability() {
        console.log('1. Testing tool availability...');
        
        const toolsRequest = {
            jsonrpc: '2.0',
            id: this.requestId++,
            method: 'tools/list'
        };
        
        try {
            const response = await this.sendMCPRequest(toolsRequest);
            
            if (response.result && response.result.tools) {
                const tools = response.result.tools;
                const statisticsByBoxTool = tools.find(tool => tool.name === 'get_statistics_by_box');
                
                if (statisticsByBoxTool) {
                    this.results.toolAvailability = {
                        available: true,
                        tool: statisticsByBoxTool
                    };
                    console.log('✓ get_statistics_by_box tool found');
                    console.log('  Description:', statisticsByBoxTool.description);
                    console.log('  Input Schema:', JSON.stringify(statisticsByBoxTool.inputSchema, null, 2));
                } else {
                    this.results.toolAvailability = {
                        available: false,
                        allTools: tools.map(t => t.name)
                    };
                    console.log('✗ get_statistics_by_box tool not found');
                    console.log('  Available tools:', tools.map(t => t.name).join(', '));
                }
            } else {
                this.results.errors.push('Invalid tools/list response');
                console.log('✗ Invalid tools/list response');
            }
        } catch (error) {
            this.results.errors.push(`Tool availability test failed: ${error.message}`);
            console.log('✗ Tool availability test failed:', error.message);
        }
        
        console.log('');
    }

    async testParameterValidation() {
        console.log('2. Testing parameter validation...');
        
        // Test 1: No parameters (should work since no parameters are required)
        await this.testNoParameters();
        
        // Test 2: Unexpected parameters (should either ignore or handle gracefully)
        await this.testUnexpectedParameters();
        
        console.log('');
    }

    async testNoParameters() {
        console.log('  2a. Testing with no parameters...');
        
        const request = {
            jsonrpc: '2.0',
            id: this.requestId++,
            method: 'tools/call',
            params: {
                name: 'get_statistics_by_box',
                arguments: {}
            }
        };
        
        try {
            const response = await this.sendMCPRequest(request);
            
            if (response.result) {
                this.results.parameterValidation.noParameters = {
                    success: true,
                    response: response.result
                };
                console.log('  ✓ No parameters test passed');
            } else if (response.error) {
                this.results.parameterValidation.noParameters = {
                    success: false,
                    error: response.error
                };
                console.log('  ✗ No parameters test failed:', response.error.message);
            }
        } catch (error) {
            this.results.parameterValidation.noParameters = {
                success: false,
                error: error.message
            };
            console.log('  ✗ No parameters test failed:', error.message);
        }
    }

    async testUnexpectedParameters() {
        console.log('  2b. Testing with unexpected parameters...');
        
        const request = {
            jsonrpc: '2.0',
            id: this.requestId++,
            method: 'tools/call',
            params: {
                name: 'get_statistics_by_box',
                arguments: {
                    unexpected_param: 'test_value',
                    another_param: 123
                }
            }
        };
        
        try {
            const response = await this.sendMCPRequest(request);
            
            if (response.result) {
                this.results.parameterValidation.unexpectedParameters = {
                    success: true,
                    response: response.result
                };
                console.log('  ✓ Unexpected parameters test passed (parameters ignored)');
            } else if (response.error) {
                this.results.parameterValidation.unexpectedParameters = {
                    success: false,
                    error: response.error
                };
                console.log('  ! Unexpected parameters test returned error:', response.error.message);
            }
        } catch (error) {
            this.results.parameterValidation.unexpectedParameters = {
                success: false,
                error: error.message
            };
            console.log('  ✗ Unexpected parameters test failed:', error.message);
        }
    }

    async testResponseStructure() {
        console.log('3. Testing response structure validation...');
        
        const request = {
            jsonrpc: '2.0',
            id: this.requestId++,
            method: 'tools/call',
            params: {
                name: 'get_statistics_by_box',
                arguments: {}
            }
        };
        
        try {
            const response = await this.sendMCPRequest(request);
            
            if (response.result && response.result.content) {
                const content = response.result.content[0];
                
                if (content.type === 'text') {
                    try {
                        const data = JSON.parse(content.text);
                        this.results.responseStructure = {
                            valid: true,
                            structure: this.analyzeResponseStructure(data)
                        };
                        console.log('  ✓ Response structure is valid JSON');
                        console.log('  Structure analysis:', JSON.stringify(this.results.responseStructure.structure, null, 2));
                    } catch (parseError) {
                        this.results.responseStructure = {
                            valid: false,
                            error: 'Response is not valid JSON',
                            rawContent: content.text
                        };
                        console.log('  ✗ Response is not valid JSON');
                    }
                } else {
                    this.results.responseStructure = {
                        valid: false,
                        error: 'Response content type is not text',
                        contentType: content.type
                    };
                    console.log('  ✗ Response content type is not text:', content.type);
                }
            } else if (response.error) {
                this.results.responseStructure = {
                    valid: false,
                    error: response.error
                };
                console.log('  ✗ Response structure test failed:', response.error.message);
            }
        } catch (error) {
            this.results.responseStructure = {
                valid: false,
                error: error.message
            };
            console.log('  ✗ Response structure test failed:', error.message);
        }
        
        console.log('');
    }

    analyzeResponseStructure(data) {
        const analysis = {
            type: typeof data,
            isArray: Array.isArray(data),
            keys: [],
            boxCount: 0,
            hasActivityScores: false,
            hasBoxMetrics: false
        };
        
        if (typeof data === 'object' && data !== null) {
            analysis.keys = Object.keys(data);
            
            // Check if it's an array of boxes
            if (Array.isArray(data)) {
                analysis.boxCount = data.length;
                
                if (data.length > 0) {
                    const firstBox = data[0];
                    if (typeof firstBox === 'object') {
                        analysis.sampleBoxKeys = Object.keys(firstBox);
                        analysis.hasActivityScores = 'activity_score' in firstBox;
                        analysis.hasBoxMetrics = 'statistics' in firstBox || 'metrics' in firstBox;
                    }
                }
            } else {
                // Check if it's an object with box data
                analysis.hasActivityScores = Object.values(data).some(box => 
                    typeof box === 'object' && box !== null && 'activity_score' in box
                );
                analysis.hasBoxMetrics = Object.values(data).some(box => 
                    typeof box === 'object' && box !== null && ('statistics' in box || 'metrics' in box)
                );
                analysis.boxCount = Object.keys(data).length;
            }
        }
        
        return analysis;
    }

    async testDataAggregation() {
        console.log('4. Testing data aggregation per Firewalla box...');
        
        // This test will examine the actual data returned to verify aggregation
        const request = {
            jsonrpc: '2.0',
            id: this.requestId++,
            method: 'tools/call',
            params: {
                name: 'get_statistics_by_box',
                arguments: {}
            }
        };
        
        try {
            const response = await this.sendMCPRequest(request);
            
            if (response.result && response.result.content) {
                const content = response.result.content[0];
                
                if (content.type === 'text') {
                    try {
                        const data = JSON.parse(content.text);
                        this.results.dataAggregation = this.analyzeDataAggregation(data);
                        console.log('  ✓ Data aggregation analysis completed');
                        console.log('  Analysis:', JSON.stringify(this.results.dataAggregation, null, 2));
                    } catch (parseError) {
                        this.results.dataAggregation = {
                            valid: false,
                            error: 'Could not parse JSON for aggregation analysis'
                        };
                        console.log('  ✗ Could not parse JSON for aggregation analysis');
                    }
                }
            } else if (response.error) {
                this.results.dataAggregation = {
                    valid: false,
                    error: response.error
                };
                console.log('  ✗ Data aggregation test failed:', response.error.message);
            }
        } catch (error) {
            this.results.dataAggregation = {
                valid: false,
                error: error.message
            };
            console.log('  ✗ Data aggregation test failed:', error.message);
        }
        
        console.log('');
    }

    analyzeDataAggregation(data) {
        const analysis = {
            hasMultipleBoxes: false,
            boxIdentifiers: [],
            commonFields: [],
            statisticsFields: [],
            activityScoreRange: null,
            correlationFields: []
        };
        
        if (Array.isArray(data)) {
            analysis.hasMultipleBoxes = data.length > 1;
            analysis.boxIdentifiers = data.map((box, index) => 
                box.box_id || box.id || box.gid || `box_${index}`
            );
            
            if (data.length > 0) {
                // Find common fields across all boxes
                const allFields = data.map(box => Object.keys(box));
                analysis.commonFields = allFields.reduce((common, fields) => 
                    common.filter(field => fields.includes(field))
                );
                
                // Find statistics-related fields
                analysis.statisticsFields = analysis.commonFields.filter(field => 
                    field.includes('stat') || field.includes('count') || 
                    field.includes('total') || field.includes('metric')
                );
                
                // Analyze activity scores
                const activityScores = data.map(box => box.activity_score).filter(score => 
                    typeof score === 'number'
                );
                if (activityScores.length > 0) {
                    analysis.activityScoreRange = {
                        min: Math.min(...activityScores),
                        max: Math.max(...activityScores),
                        average: activityScores.reduce((sum, score) => sum + score, 0) / activityScores.length
                    };
                }
            }
        } else if (typeof data === 'object' && data !== null) {
            const boxKeys = Object.keys(data);
            analysis.hasMultipleBoxes = boxKeys.length > 1;
            analysis.boxIdentifiers = boxKeys;
            
            if (boxKeys.length > 0) {
                // Find common fields across all box objects
                const allFields = boxKeys.map(key => Object.keys(data[key] || {}));
                analysis.commonFields = allFields.reduce((common, fields) => 
                    common.filter(field => fields.includes(field))
                );
                
                analysis.statisticsFields = analysis.commonFields.filter(field => 
                    field.includes('stat') || field.includes('count') || 
                    field.includes('total') || field.includes('metric')
                );
            }
        }
        
        return analysis;
    }

    async sendMCPRequest(request) {
        return new Promise((resolve, reject) => {
            const serverPath = './dist/server.js';
            const mcpServer = spawn('node', [serverPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env }
            });
            
            let responseData = '';
            let errorData = '';
            
            mcpServer.stdout.on('data', (data) => {
                responseData += data.toString();
            });
            
            mcpServer.stderr.on('data', (data) => {
                errorData += data.toString();
            });
            
            mcpServer.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`MCP server exited with code ${code}. Error: ${errorData}`));
                    return;
                }
                
                try {
                    // Parse JSON-RPC response
                    const lines = responseData.trim().split('\n');
                    const lastLine = lines[lines.length - 1];
                    const response = JSON.parse(lastLine);
                    resolve(response);
                } catch (error) {
                    reject(new Error(`Failed to parse MCP response: ${error.message}. Raw data: ${responseData}`));
                }
            });
            
            mcpServer.on('error', (error) => {
                reject(new Error(`Failed to start MCP server: ${error.message}`));
            });
            
            // Send request
            mcpServer.stdin.write(JSON.stringify(request) + '\n');
            mcpServer.stdin.end();
        });
    }

    generateReport() {
        console.log('=== TEST RESULTS SUMMARY ===\n');
        
        console.log('1. Tool Availability:');
        if (this.results.toolAvailability) {
            if (this.results.toolAvailability.available) {
                console.log('   ✓ get_statistics_by_box tool is available');
                console.log('   Description:', this.results.toolAvailability.tool.description);
            } else {
                console.log('   ✗ get_statistics_by_box tool is NOT available');
                console.log('   Available tools:', this.results.toolAvailability.allTools.join(', '));
            }
        } else {
            console.log('   ? Tool availability test did not complete');
        }
        
        console.log('\n2. Parameter Validation:');
        if (this.results.parameterValidation.noParameters) {
            console.log('   No parameters:', this.results.parameterValidation.noParameters.success ? '✓ PASS' : '✗ FAIL');
            if (!this.results.parameterValidation.noParameters.success) {
                console.log('     Error:', this.results.parameterValidation.noParameters.error);
            }
        }
        
        if (this.results.parameterValidation.unexpectedParameters) {
            console.log('   Unexpected parameters:', this.results.parameterValidation.unexpectedParameters.success ? '✓ PASS' : '✗ FAIL');
            if (!this.results.parameterValidation.unexpectedParameters.success) {
                console.log('     Error:', this.results.parameterValidation.unexpectedParameters.error);
            }
        }
        
        console.log('\n3. Response Structure:');
        if (this.results.responseStructure) {
            console.log('   Structure validation:', this.results.responseStructure.valid ? '✓ PASS' : '✗ FAIL');
            if (this.results.responseStructure.valid) {
                console.log('   Box count:', this.results.responseStructure.structure.boxCount);
                console.log('   Has activity scores:', this.results.responseStructure.structure.hasActivityScores);
                console.log('   Has box metrics:', this.results.responseStructure.structure.hasBoxMetrics);
            } else {
                console.log('     Error:', this.results.responseStructure.error);
            }
        }
        
        console.log('\n4. Data Aggregation:');
        if (this.results.dataAggregation && this.results.dataAggregation.hasMultipleBoxes !== undefined) {
            console.log('   Multiple boxes:', this.results.dataAggregation.hasMultipleBoxes ? '✓ YES' : '! NO');
            console.log('   Box identifiers:', this.results.dataAggregation.boxIdentifiers.join(', '));
            console.log('   Common fields:', this.results.dataAggregation.commonFields.join(', '));
            console.log('   Statistics fields:', this.results.dataAggregation.statisticsFields.join(', '));
            
            if (this.results.dataAggregation.activityScoreRange) {
                console.log('   Activity score range:', 
                    `${this.results.dataAggregation.activityScoreRange.min} - ${this.results.dataAggregation.activityScoreRange.max}`);
            }
        }
        
        if (this.results.errors.length > 0) {
            console.log('\n5. Errors Encountered:');
            this.results.errors.forEach((error, index) => {
                console.log(`   ${index + 1}. ${error}`);
            });
        }
        
        // Save detailed results to file
        const resultsFile = 'get_statistics_by_box_test_results.json';
        fs.writeFileSync(resultsFile, JSON.stringify(this.results, null, 2));
        console.log(`\nDetailed results saved to: ${resultsFile}`);
    }
}

// Run the test
const tester = new MCPTester();
tester.testGetStatisticsByBox().catch(console.error);