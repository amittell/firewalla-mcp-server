#!/usr/bin/env node

const { spawn } = require('child_process');

class MCPTester {
    constructor() {
        this.requestId = 1;
        this.results = [];
    }

    async testGetStatisticsByRegion() {
        console.log('🚀 Starting get_statistics_by_region MCP Tool Test\n');
        
        // Start MCP server
        const server = spawn('node', ['dist/server.js'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let responseBuffer = '';
        let testResults = {
            toolAvailability: false,
            noParametersTest: null,
            unexpectedParametersTest: null,
            responseStructure: null,
            dataAggregation: null,
            errors: []
        };

        server.stdout.on('data', (data) => {
            responseBuffer += data.toString();
            this.processResponses(responseBuffer, testResults);
        });

        server.stderr.on('data', (data) => {
            console.error('Server error:', data.toString());
            testResults.errors.push(data.toString());
        });

        // Test 1: Initialize MCP connection
        await this.sendRequest(server, {
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {
                    tools: {}
                },
                clientInfo: {
                    name: "test-client",
                    version: "1.0.0"
                }
            }
        });

        await this.sleep(500);

        // Test 2: List tools to verify get_statistics_by_region is available
        await this.sendRequest(server, {
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "tools/list"
        });

        await this.sleep(500);

        // Test 3: Call get_statistics_by_region with no parameters (should work)
        await this.sendRequest(server, {
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "tools/call",
            params: {
                name: "get_statistics_by_region",
                arguments: {}
            }
        });

        await this.sleep(1000);

        // Test 4: Call get_statistics_by_region with unexpected parameters
        await this.sendRequest(server, {
            jsonrpc: "2.0",
            id: this.requestId++,
            method: "tools/call",
            params: {
                name: "get_statistics_by_region",
                arguments: {
                    unexpected_param: "test_value",
                    another_param: 123
                }
            }
        });

        await this.sleep(1000);

        // Close server
        server.kill();

        return testResults;
    }

    async sendRequest(server, request) {
        const requestStr = JSON.stringify(request) + '\n';
        console.log('📤 Sending request:', JSON.stringify(request, null, 2));
        server.stdin.write(requestStr);
    }

    processResponses(buffer, testResults) {
        const lines = buffer.split('\n');
        
        for (const line of lines) {
            if (line.trim() === '') continue;
            
            try {
                const response = JSON.parse(line);
                console.log('📥 Received response:', JSON.stringify(response, null, 2));
                
                // Analyze response based on request type
                if (response.result && response.result.tools) {
                    // tools/list response
                    const hasRegionTool = response.result.tools.some(tool => 
                        tool.name === 'get_statistics_by_region'
                    );
                    testResults.toolAvailability = hasRegionTool;
                    
                    if (hasRegionTool) {
                        const tool = response.result.tools.find(t => t.name === 'get_statistics_by_region');
                        console.log('✅ Tool found:', tool.description);
                        console.log('📋 Parameters:', JSON.stringify(tool.inputSchema?.properties || {}, null, 2));
                    }
                } else if (response.result && response.result.content) {
                    // tools/call response
                    this.analyzeToolResponse(response, testResults);
                } else if (response.error) {
                    console.log('❌ Error response:', response.error);
                    testResults.errors.push(response.error);
                }
            } catch (e) {
                // Ignore non-JSON lines (like server startup messages)
                if (line.includes('{') && line.includes('}')) {
                    console.log('⚠️  Failed to parse response:', line);
                }
            }
        }
    }

    analyzeToolResponse(response, testResults) {
        const content = response.result.content;
        
        if (Array.isArray(content) && content.length > 0) {
            const textContent = content.find(c => c.type === 'text');
            if (textContent) {
                try {
                    const data = JSON.parse(textContent.text);
                    
                    // Test response structure
                    testResults.responseStructure = {
                        hasData: !!data,
                        isObject: typeof data === 'object',
                        hasRegionalData: this.hasRegionalStructure(data),
                        structure: this.analyzeStructure(data)
                    };
                    
                    // Test data aggregation
                    testResults.dataAggregation = this.analyzeAggregation(data);
                    
                    console.log('✅ Parsed response data successfully');
                    console.log('📊 Data structure:', testResults.responseStructure);
                    
                } catch (e) {
                    console.log('❌ Failed to parse response data:', e.message);
                    testResults.errors.push(`Response parsing error: ${e.message}`);
                }
            }
        }
    }

    hasRegionalStructure(data) {
        if (!data || typeof data !== 'object') return false;
        
        // Check for common regional indicators
        const regionalIndicators = [
            'regions', 'countries', 'geoData', 'regionalStats',
            'CN', 'US', 'GB', 'DE', 'FR' // Common country codes
        ];
        
        const dataStr = JSON.stringify(data).toLowerCase();
        return regionalIndicators.some(indicator => 
            dataStr.includes(indicator.toLowerCase())
        );
    }

    analyzeStructure(data) {
        if (!data) return null;
        
        const structure = {
            type: Array.isArray(data) ? 'array' : typeof data,
            keys: typeof data === 'object' ? Object.keys(data) : [],
            hasNestedObjects: false,
            hasArrays: false
        };
        
        if (typeof data === 'object') {
            for (const key in data) {
                if (typeof data[key] === 'object' && data[key] !== null) {
                    structure.hasNestedObjects = true;
                }
                if (Array.isArray(data[key])) {
                    structure.hasArrays = true;
                }
            }
        }
        
        return structure;
    }

    analyzeAggregation(data) {
        if (!data || typeof data !== 'object') return null;
        
        return {
            hasAggregatedData: this.containsAggregatedFields(data),
            hasGeographicalGrouping: this.hasGeographicalGrouping(data),
            dataPoints: this.countDataPoints(data)
        };
    }

    containsAggregatedFields(data) {
        const aggregationTerms = ['total', 'count', 'sum', 'avg', 'bytes', 'flows'];
        const dataStr = JSON.stringify(data).toLowerCase();
        return aggregationTerms.some(term => dataStr.includes(term));
    }

    hasGeographicalGrouping(data) {
        const geoTerms = ['country', 'region', 'location', 'geo'];
        const dataStr = JSON.stringify(data).toLowerCase();
        return geoTerms.some(term => dataStr.includes(term));
    }

    countDataPoints(data) {
        if (Array.isArray(data)) return data.length;
        if (typeof data === 'object' && data !== null) {
            return Object.keys(data).length;
        }
        return 0;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    printSummary(results) {
        console.log('\n' + '='.repeat(60));
        console.log('📋 GET_STATISTICS_BY_REGION TEST SUMMARY');
        console.log('='.repeat(60));
        
        console.log('\n🔍 1. Tool Availability:');
        console.log(`   ${results.toolAvailability ? '✅' : '❌'} get_statistics_by_region found in tools list`);
        
        console.log('\n📊 2. Response Structure:');
        if (results.responseStructure) {
            console.log(`   ✅ Response received and parsed`);
            console.log(`   📈 Data type: ${results.responseStructure.structure?.type}`);
            console.log(`   🔑 Keys: ${results.responseStructure.structure?.keys?.join(', ')}`);
            console.log(`   🌍 Has regional structure: ${results.responseStructure.hasRegionalData ? '✅' : '❌'}`);
        } else {
            console.log(`   ❌ No valid response structure received`);
        }
        
        console.log('\n📈 3. Data Aggregation:');
        if (results.dataAggregation) {
            console.log(`   ${results.dataAggregation.hasAggregatedData ? '✅' : '❌'} Contains aggregated data`);
            console.log(`   ${results.dataAggregation.hasGeographicalGrouping ? '✅' : '❌'} Has geographical grouping`);
            console.log(`   📊 Data points: ${results.dataAggregation.dataPoints}`);
        } else {
            console.log(`   ❌ No aggregation analysis available`);
        }
        
        console.log('\n🐛 4. Errors:');
        if (results.errors.length === 0) {
            console.log('   ✅ No errors detected');
        } else {
            results.errors.forEach((error, index) => {
                console.log(`   ❌ Error ${index + 1}: ${error}`);
            });
        }
        
        console.log('\n' + '='.repeat(60));
    }
}

async function main() {
    const tester = new MCPTester();
    try {
        const results = await tester.testGetStatisticsByRegion();
        tester.printSummary(results);
    } catch (error) {
        console.error('Test failed:', error);
    }
}

if (require.main === module) {
    main();
}