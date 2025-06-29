#!/usr/bin/env node

/**
 * @fileoverview Comprehensive MCP Tool Validation Framework
 *
 * Validates every aspect of the Firewalla MCP server tools including:
 * - Schema completeness and correctness
 * - Handler implementation existence
 * - Parameter validation logic
 * - Field syntax examples accuracy
 * - Documentation alignment
 * - Cross-reference consistency
 *
 * This framework ensures that after schema audits and corrections,
 * every tool is fully functional and ready for production use.
 *
 * @version 1.0.0
 * @author Alex Mittell
 * @since 2024-06-29
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Define types for our validation framework
interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface HandlerRegistration {
  name: string;
  category: string;
  className: string;
}

interface ValidationResult {
  tool: string;
  status: 'VALID' | 'WARNING' | 'ERROR';
  issues: string[];
  checks: {
    schemaExists: boolean;
    handlerExists: boolean;
    parametersValid: boolean;
    fieldSyntaxValid: boolean;
    documentationAligned: boolean;
    requiresLimitParam: boolean;
    limitParamCorrect: boolean;
  };
}

interface ValidationReport {
  summary: {
    totalTools: number;
    schemasFound: number;
    handlersFound: number;
    fullyValid: number;
    warnings: number;
    errors: number;
    discrepancies: string[];
  };
  toolResults: ValidationResult[];
  recommendations: string[];
}

/**
 * Main validation framework class
 */
export class MCPToolValidator {
  private readonly projectRoot: string;
  private toolSchemas: ToolSchema[] = [];
  private handlerRegistrations: HandlerRegistration[] = [];

  constructor() {
    this.projectRoot = join(dirname(fileURLToPath(import.meta.url)));
  }

  /**
   * Run complete validation framework
   */
  async validate(): Promise<ValidationReport> {
    console.log('🔍 Starting comprehensive MCP tool validation...\n');

    // Step 1: Extract tool schemas from server.ts
    console.log('📋 Step 1: Extracting tool schemas from server.ts...');
    await this.extractToolSchemas();
    console.log(`   Found ${this.toolSchemas.length} tool schemas\n`);

    // Step 2: Extract handler registrations from registry.ts
    console.log('🔧 Step 2: Extracting handler registrations from registry.ts...');
    await this.extractHandlerRegistrations();
    console.log(`   Found ${this.handlerRegistrations.length} registered handlers\n`);

    // Step 3: Cross-reference and validate each tool
    console.log('✅ Step 3: Cross-referencing and validating tools...');
    const results = await this.validateAllTools();
    console.log(`   Validated ${results.length} total tools\n`);

    // Step 4: Generate comprehensive report
    console.log('📊 Step 4: Generating validation report...');
    const report = this.generateReport(results);
    
    return report;
  }

  /**
   * Extract tool schemas from server.ts file
   */
  private async extractToolSchemas(): Promise<void> {
    const serverPath = join(this.projectRoot, 'src/server.ts');
    const content = readFileSync(serverPath, 'utf-8');

    // Find the tools array in the ListToolsRequestSchema handler
    // First, let's find the start of the handler
    const handlerStart = content.indexOf('setRequestHandler(ListToolsRequestSchema');
    if (handlerStart === -1) {
      throw new Error('Could not find ListToolsRequestSchema handler in server.ts');
    }
    
    // Find the tools array start
    const toolsStart = content.indexOf('tools: [', handlerStart);
    if (toolsStart === -1) {
      throw new Error('Could not find tools array in ListToolsRequestSchema handler');
    }
    
    // Find the tools array end - look for the closing bracket of the array
    // We need to balance brackets and braces properly
    let bracketCount = 1; // We're already inside the array
    let braceCount = 0;
    let toolsEnd = -1;
    
    for (let i = toolsStart + 'tools: ['.length; i < content.length; i++) {
      const char = content[i];
      
      if (char === '[') {
        bracketCount++;
      } else if (char === ']') {
        bracketCount--;
        if (bracketCount === 0) {
          toolsEnd = i;
          break;
        }
      } else if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
      }
    }
    
    if (toolsEnd === -1) {
      throw new Error('Could not find end of tools array');
    }
    
    const toolsArrayContent = content.substring(toolsStart + 'tools: ['.length, toolsEnd);
    
    // Split tools by looking for tool boundaries - each tool starts with '{'
    // and we need to balance braces to find the end
    const tools = this.parseToolsArray(toolsArrayContent);
    
    for (const toolContent of tools) {
      const tool = this.parseToolDefinition(toolContent);
      if (tool) {
        this.toolSchemas.push(tool);
      }
    }
  }

  /**
   * Parse the tools array content into individual tool definitions
   */
  private parseToolsArray(content: string): string[] {
    const tools: string[] = [];
    let currentTool = '';
    let braceCount = 0;
    let inTool = false;
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      
      if (char === '{' && !inTool) {
        // Start of a new tool
        inTool = true;
        braceCount = 1;
        currentTool = char;
      } else if (inTool) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        }
        
        currentTool += char;
        
        if (braceCount === 0) {
          // End of current tool
          tools.push(currentTool);
          currentTool = '';
          inTool = false;
        }
      }
    }
    
    // Handle case where we're still in a tool at the end
    if (inTool && currentTool.trim()) {
      tools.push(currentTool);
    }
    
    return tools;
  }

  /**
   * Parse a single tool definition
   */
  private parseToolDefinition(toolContent: string): ToolSchema | null {
    // Extract name
    const nameMatch = toolContent.match(/name:\s*['"`]([^'"`]+)['"`]/);
    if (!nameMatch) return null;
    
    // Extract description
    const descMatch = toolContent.match(/description:\s*['"`]([^'"`]+)['"`]/s);
    if (!descMatch) return null;
    
    // Extract inputSchema
    const schemaMatch = toolContent.match(/inputSchema:\s*\{([\s\S]*)\}/);
    let inputSchema: any = { type: 'object', properties: {} };
    
    if (schemaMatch) {
      const schemaContent = schemaMatch[1];
      
      // Extract properties with proper brace balancing
      const propertiesContent = this.extractPropertiesContent(schemaContent);
      if (propertiesContent) {
        inputSchema.properties = this.parseProperties(propertiesContent);
      }
      
      // Extract required array
      const requiredMatch = schemaContent.match(/required:\s*\[([\s\S]*?)\]/);
      if (requiredMatch) {
        const requiredStr = requiredMatch[1].trim();
        if (requiredStr) {
          inputSchema.required = requiredStr
            .split(',')
            .map(s => s.trim().replace(/['"`]/g, ''))
            .filter(s => s.length > 0);
        }
      }
    }

    return {
      name: nameMatch[1],
      description: descMatch[1],
      inputSchema
    };
  }

  /**
   * Extract properties content with proper brace balancing
   */
  private extractPropertiesContent(schemaContent: string): string | null {
    const propertiesStart = schemaContent.indexOf('properties:');
    if (propertiesStart === -1) return null;
    
    // Find the opening brace after 'properties:'
    let braceStart = -1;
    for (let i = propertiesStart + 'properties:'.length; i < schemaContent.length; i++) {
      if (schemaContent[i] === '{') {
        braceStart = i;
        break;
      }
    }
    
    if (braceStart === -1) return null;
    
    // Use brace balancing to find the matching closing brace
    let braceCount = 1;
    let braceEnd = -1;
    
    for (let i = braceStart + 1; i < schemaContent.length; i++) {
      const char = schemaContent[i];
      
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          braceEnd = i;
          break;
        }
      }
    }
    
    if (braceEnd === -1) return null;
    
    // Return the content between the braces
    return schemaContent.substring(braceStart + 1, braceEnd).trim();
  }

  /**
   * Parse properties object from string (improved)
   */
  private parseProperties(propertiesStr: string): Record<string, any> {
    const properties: Record<string, any> = {};
    
    // Use brace balancing to find property definitions
    const propDefs = this.parsePropertiesArray(propertiesStr);
    
    for (const propDef of propDefs) {
      const prop = this.parsePropertyDefinition(propDef);
      if (prop) {
        properties[prop.name] = prop.definition;
      }
    }
    
    return properties;
  }

  /**
   * Parse properties array with proper brace balancing
   */
  private parsePropertiesArray(content: string): string[] {
    const properties: string[] = [];
    let currentProp = '';
    let braceCount = 0;
    let inProp = false;
    let propName = '';
    
    // Remove any leading/trailing whitespace
    content = content.trim();
    
    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      
      // Look for property name pattern: "propName: {"
      if (!inProp && char.match(/\w/)) {
        // Try to match property name
        const remaining = content.substring(i);
        const propMatch = remaining.match(/^(\w+):\s*\{/);
        if (propMatch) {
          propName = propMatch[1];
          currentProp = propMatch[0];
          i += propMatch[0].length - 1; // Move index to after the opening brace
          braceCount = 1;
          inProp = true;
          continue;
        }
      }
      
      if (inProp) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          
          if (braceCount === 0) {
            // End of current property
            currentProp += char;
            properties.push(currentProp);
            currentProp = '';
            inProp = false;
            propName = '';
          } else {
            currentProp += char;
          }
        } else {
          currentProp += char;
        }
      }
    }
    
    return properties;
  }

  /**
   * Parse a single property definition
   */
  private parsePropertyDefinition(propDef: string): { name: string; definition: any } | null {
    const nameMatch = propDef.match(/^(\w+):/);
    if (!nameMatch) return null;
    
    const propName = nameMatch[1];
    const definition: any = {};
    
    // Extract type
    const typeMatch = propDef.match(/type:\s*['"`]([^'"`]+)['"`]/);
    if (typeMatch) {
      definition.type = typeMatch[1];
    }
    
    // Extract enum
    const enumMatch = propDef.match(/enum:\s*\[([\s\S]*?)\]/);
    if (enumMatch) {
      definition.enum = enumMatch[1]
        .split(',')
        .map(s => s.trim().replace(/['"`]/g, ''))
        .filter(s => s.length > 0);
    }
    
    // Extract numeric constraints
    const minMatch = propDef.match(/minimum:\s*(\d+)/);
    if (minMatch) definition.minimum = parseInt(minMatch[1]);
    
    const maxMatch = propDef.match(/maximum:\s*(\d+)/);
    if (maxMatch) definition.maximum = parseInt(maxMatch[1]);
    
    // Extract description
    const descMatch = propDef.match(/description:\s*['"`]([^'"`]*?)['"`]/s);
    if (descMatch) definition.description = descMatch[1];
    
    return { name: propName, definition };
  }

  /**
   * Extract handler registrations from registry.ts
   */
  private async extractHandlerRegistrations(): Promise<void> {
    const registryPath = join(this.projectRoot, 'src/tools/registry.ts');
    const content = readFileSync(registryPath, 'utf-8');

    // Extract all register() calls
    const registerMatches = content.match(/this\.register\(new (\w+)\(\)\);/g);
    
    if (registerMatches) {
      for (const match of registerMatches) {
        const classMatch = match.match(/new (\w+)\(\)/);
        if (classMatch) {
          const className = classMatch[1];
          
          // Derive tool name from class name (convention-based)
          const toolName = this.classNameToToolName(className);
          
          // Determine category based on import structure
          const category = this.determineCategory(content, className);
          
          this.handlerRegistrations.push({
            name: toolName,
            category,
            className
          });
        }
      }
    }
  }

  /**
   * Convert class name to tool name (convention-based)
   */
  private classNameToToolName(className: string): string {
    // Remove 'Handler' suffix and convert to snake_case
    const baseName = className.replace(/Handler$/, '');
    
    // Convert PascalCase to snake_case
    return baseName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  /**
   * Determine category from import structure
   */
  private determineCategory(content: string, className: string): string {
    const imports = [
      { pattern: /from.*security\.js.*/, category: 'security' },
      { pattern: /from.*network\.js.*/, category: 'network' },
      { pattern: /from.*device\.js.*/, category: 'device' },
      { pattern: /from.*rules\.js.*/, category: 'rules' },
      { pattern: /from.*analytics\.js.*/, category: 'analytics' },
      { pattern: /from.*search\.js.*/, category: 'search' }
    ];

    for (const imp of imports) {
      const importMatch = content.match(new RegExp(`${className}[^}]*} from.*${imp.category}\\.js`));
      if (importMatch) {
        return imp.category;
      }
    }

    return 'unknown';
  }

  /**
   * Validate all tools by cross-referencing schemas and handlers
   */
  private async validateAllTools(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    
    // Get all unique tool names from both sources
    const schemaNames = new Set(this.toolSchemas.map(t => t.name));
    const handlerNames = new Set(this.handlerRegistrations.map(h => h.name));
    const allToolNames = new Set([...schemaNames, ...handlerNames]);

    for (const toolName of allToolNames) {
      const result = await this.validateTool(toolName);
      results.push(result);
    }

    return results;
  }

  /**
   * Validate a single tool
   */
  private async validateTool(toolName: string): Promise<ValidationResult> {
    const schema = this.toolSchemas.find(s => s.name === toolName);
    const handler = this.handlerRegistrations.find(h => h.name === toolName);
    
    const issues: string[] = [];
    const checks = {
      schemaExists: !!schema,
      handlerExists: !!handler,
      parametersValid: true,
      fieldSyntaxValid: true,
      documentationAligned: true,
      requiresLimitParam: false,
      limitParamCorrect: true
    };

    // Check schema existence
    if (!schema) {
      issues.push(`Missing schema definition in server.ts`);
      checks.schemaExists = false;
    }

    // Check handler existence  
    if (!handler) {
      issues.push(`Missing handler registration in registry.ts`);
      checks.handlerExists = false;
    }

    // Validate parameters if schema exists
    if (schema) {
      const paramValidation = this.validateParameters(schema);
      if (paramValidation.issues.length > 0) {
        issues.push(...paramValidation.issues);
        checks.parametersValid = false;
      }
      
      checks.requiresLimitParam = paramValidation.requiresLimit;
      checks.limitParamCorrect = paramValidation.limitParamValid;
    }

    // Validate field syntax examples
    if (schema) {
      const syntaxValidation = this.validateFieldSyntax(schema);
      if (syntaxValidation.length > 0) {
        issues.push(...syntaxValidation);
        checks.fieldSyntaxValid = false;
      }
    }

    // Check documentation alignment
    if (schema && handler) {
      const docValidation = this.validateDocumentation(schema, handler);
      if (docValidation.length > 0) {
        issues.push(...docValidation);
        checks.documentationAligned = false;
      }
    }

    // Determine overall status
    let status: 'VALID' | 'WARNING' | 'ERROR';
    if (!checks.schemaExists || !checks.handlerExists) {
      status = 'ERROR';
    } else if (issues.length > 0) {
      status = 'WARNING';
    } else {
      status = 'VALID';
    }

    return {
      tool: toolName,
      status,
      issues,
      checks
    };
  }

  /**
   * Validate parameters for a tool schema
   */
  private validateParameters(schema: ToolSchema): {
    issues: string[];
    requiresLimit: boolean;
    limitParamValid: boolean;
  } {
    const issues: string[] = [];
    let requiresLimit = false;
    let limitParamValid = true;

    const props = schema.inputSchema.properties;
    const required = schema.inputSchema.required || [];

    // Check if this tool should require a limit parameter
    const paginatedTools = [
      'get_active_alarms', 'get_flow_data', 'get_device_status', 'get_offline_devices',
      'get_bandwidth_usage', 'get_network_rules', 'get_most_active_rules', 'get_recent_rules',
      'search_flows', 'search_alarms', 'search_rules', 'search_devices', 
      'search_target_lists', 'search_cross_reference'
    ];

    if (paginatedTools.includes(schema.name)) {
      requiresLimit = true;
      
      // Check if limit parameter exists and is properly configured
      if (!props.limit) {
        issues.push(`Missing required 'limit' parameter for paginated tool`);
        limitParamValid = false;
      } else if (!required.includes('limit') && schema.name !== 'get_target_lists') {
        // get_target_lists is the exception
        issues.push(`'limit' parameter should be required for paginated tool`);
        limitParamValid = false;
      } else {
        // Validate limit parameter structure
        const limit = props.limit;
        if (limit.type !== 'number') {
          issues.push(`'limit' parameter should be of type 'number'`);
          limitParamValid = false;
        }
        if (!limit.minimum || limit.minimum < 1) {
          issues.push(`'limit' parameter should have minimum value of 1`);
          limitParamValid = false;
        }
        if (!limit.maximum) {
          issues.push(`'limit' parameter should have maximum value`);
          limitParamValid = false;
        }
      }
    }

    // Validate enum values
    for (const [propName, propDef] of Object.entries(props)) {
      if (propDef.enum && Array.isArray(propDef.enum)) {
        if (propDef.enum.length === 0) {
          issues.push(`Parameter '${propName}' has empty enum array`);
        }
      }

      // Check for proper type definitions
      if (!propDef.type) {
        issues.push(`Parameter '${propName}' missing type definition`);
      }
    }

    return { issues, requiresLimit, limitParamValid };
  }

  /**
   * Validate field syntax examples in descriptions
   */
  private validateFieldSyntax(schema: ToolSchema): string[] {
    const issues: string[] = [];
    
    // Check query parameter examples for search tools
    const props = schema.inputSchema.properties;
    if (props.query && props.query.description) {
      const desc = props.query.description;
      
      // Look for field syntax examples in descriptions
      const fieldPatterns = [
        /(\w+):(\w+)/g,  // field:value patterns
        /(\w+):>=(\w+)/g, // field:>=value patterns
        /(\w+):\*([^"]*?)\*/g, // wildcard patterns
      ];

      for (const pattern of fieldPatterns) {
        const matches = desc.match(pattern);
        if (matches) {
          for (const match of matches) {
            // Validate against known field patterns from API documentation
            const validation = this.validateFieldPattern(match);
            if (!validation.valid) {
              issues.push(`Invalid field syntax example: '${match}' - ${validation.reason}`);
            }
          }
        }
      }
    }

    return issues;
  }

  /**
   * Validate a field pattern against known API patterns
   */
  private validateFieldPattern(pattern: string): { valid: boolean; reason?: string } {
    // Known valid field patterns from Firewalla API
    const validFields = [
      'protocol', 'source_ip', 'destination_ip', 'device_ip', 'bytes', 'blocked',
      'severity', 'type', 'status', 'action', 'target_value', 'online',
      'mac_vendor', 'country', 'ts', 'application', 'user_agent'
    ];

    const fieldMatch = pattern.match(/^(\w+):/);
    if (!fieldMatch) {
      return { valid: false, reason: 'Invalid field syntax' };
    }

    const fieldName = fieldMatch[1];
    if (!validFields.includes(fieldName)) {
      return { valid: false, reason: `Unknown field: ${fieldName}` };
    }

    return { valid: true };
  }

  /**
   * Validate documentation alignment between schema and handler
   */
  private validateDocumentation(schema: ToolSchema, handler: HandlerRegistration): string[] {
    const issues: string[] = [];

    // Check if tool name matches expected naming convention
    const expectedToolName = this.classNameToToolName(handler.className);
    if (schema.name !== expectedToolName) {
      issues.push(`Tool name mismatch: schema='${schema.name}', expected='${expectedToolName}'`);
    }

    // Check description quality
    if (schema.description.length < 20) {
      issues.push(`Description too short: should be more descriptive`);
    }

    if (!schema.description.includes('Firewalla') && !schema.description.includes('firewall')) {
      issues.push(`Description should mention Firewalla or firewall context`);
    }

    return issues;
  }

  /**
   * Generate comprehensive validation report
   */
  private generateReport(results: ValidationResult[]): ValidationReport {
    const summary = {
      totalTools: results.length,
      schemasFound: results.filter(r => r.checks.schemaExists).length,
      handlersFound: results.filter(r => r.checks.handlerExists).length,
      fullyValid: results.filter(r => r.status === 'VALID').length,
      warnings: results.filter(r => r.status === 'WARNING').length,
      errors: results.filter(r => r.status === 'ERROR').length,
      discrepancies: []
    };

    // Identify schema/handler discrepancies
    const schemaNames = new Set(this.toolSchemas.map(t => t.name));
    const handlerNames = new Set(this.handlerRegistrations.map(h => h.name));
    
    for (const schemaName of schemaNames) {
      if (!handlerNames.has(schemaName)) {
        summary.discrepancies.push(`Schema exists but no handler: ${schemaName}`);
      }
    }
    
    for (const handlerName of handlerNames) {
      if (!schemaNames.has(handlerName)) {
        summary.discrepancies.push(`Handler exists but no schema: ${handlerName}`);
      }
    }

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (summary.discrepancies.length > 0) {
      recommendations.push(`🚨 CRITICAL: ${summary.discrepancies.length} schema/handler mismatches found - must be resolved`);
    }
    
    if (summary.errors > 0) {
      recommendations.push(`❌ ${summary.errors} tools have critical errors requiring immediate attention`);
    }
    
    if (summary.warnings > 0) {
      recommendations.push(`⚠️ ${summary.warnings} tools have warnings that should be addressed`);
    }

    const limitIssues = results.filter(r => r.checks.requiresLimitParam && !r.checks.limitParamCorrect).length;
    if (limitIssues > 0) {
      recommendations.push(`📊 ${limitIssues} tools have incorrect limit parameter configuration`);
    }

    if (summary.fullyValid === summary.totalTools) {
      recommendations.push(`✅ All tools are fully validated and ready for production`);
    }

    return {
      summary,
      toolResults: results.sort((a, b) => {
        // Sort by status (errors first, then warnings, then valid)
        if (a.status !== b.status) {
          const statusOrder = { 'ERROR': 0, 'WARNING': 1, 'VALID': 2 };
          return statusOrder[a.status] - statusOrder[b.status];
        }
        return a.tool.localeCompare(b.tool);
      }),
      recommendations
    };
  }

  /**
   * Print comprehensive validation report
   */
  printReport(report: ValidationReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 FIREWALLA MCP TOOL VALIDATION REPORT');
    console.log('='.repeat(80));

    // Summary section
    console.log('\n📊 SUMMARY:');
    console.log(`   Total Tools: ${report.summary.totalTools}`);
    console.log(`   Schemas Found: ${report.summary.schemasFound}`);
    console.log(`   Handlers Found: ${report.summary.handlersFound}`);
    console.log(`   ✅ Fully Valid: ${report.summary.fullyValid}`);
    console.log(`   ⚠️  Warnings: ${report.summary.warnings}`);
    console.log(`   ❌ Errors: ${report.summary.errors}`);

    // Discrepancies section
    if (report.summary.discrepancies.length > 0) {
      console.log('\n🚨 CRITICAL DISCREPANCIES:');
      for (const discrepancy of report.summary.discrepancies) {
        console.log(`   ${discrepancy}`);
      }
    }

    // Tool-by-tool results
    console.log('\n🔧 TOOL-BY-TOOL VALIDATION:');
    for (const result of report.toolResults) {
      const statusIcon = result.status === 'VALID' ? '✅' : 
                        result.status === 'WARNING' ? '⚠️' : '❌';
      
      console.log(`\n   ${statusIcon} ${result.tool.toUpperCase()}`);
      
      // Check details
      console.log(`      Schema: ${result.checks.schemaExists ? '✅' : '❌'}`);
      console.log(`      Handler: ${result.checks.handlerExists ? '✅' : '❌'}`);
      console.log(`      Parameters: ${result.checks.parametersValid ? '✅' : '❌'}`);
      console.log(`      Field Syntax: ${result.checks.fieldSyntaxValid ? '✅' : '❌'}`);
      console.log(`      Documentation: ${result.checks.documentationAligned ? '✅' : '❌'}`);
      
      if (result.checks.requiresLimitParam) {
        console.log(`      Limit Param: ${result.checks.limitParamCorrect ? '✅' : '❌'}`);
      }

      // Issues
      if (result.issues.length > 0) {
        console.log('      Issues:');
        for (const issue of result.issues) {
          console.log(`        • ${issue}`);
        }
      }
    }

    // Recommendations section
    console.log('\n💡 RECOMMENDATIONS:');
    for (const recommendation of report.recommendations) {
      console.log(`   ${recommendation}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log(`✅ Validation completed at ${new Date().toISOString()}`);
    console.log('='.repeat(80) + '\n');
  }
}

// Main execution
async function main() {
  try {
    const validator = new MCPToolValidator();
    const report = await validator.validate();
    validator.printReport(report);
    
    // Exit with error code if there are critical issues
    if (report.summary.errors > 0 || report.summary.discrepancies.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Validation framework error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}