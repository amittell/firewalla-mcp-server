/**
 * Helper to extract TOOL_SCHEMAS from server.ts for testing
 * This avoids ES module issues in Jest
 */

const fs = require('fs');
const path = require('path');

function extractToolSchemas() {
  const serverPath = path.join(__dirname, '../../src/server.ts');
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  
  // Find the TOOL_SCHEMAS definition
  const schemasStart = serverContent.indexOf('const TOOL_SCHEMAS = {');
  if (schemasStart === -1) {
    throw new Error('Could not find TOOL_SCHEMAS in server.ts');
  }
  
  // Extract the schemas object
  let braceCount = 0;
  let inString = false;
  let stringChar = null;
  let i = schemasStart + 'const TOOL_SCHEMAS = '.length;
  let endIndex = -1;
  
  for (; i < serverContent.length; i++) {
    const char = serverContent[i];
    const prevChar = i > 0 ? serverContent[i - 1] : '';
    
    // Handle string literals
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
    } else if (inString && char === stringChar && prevChar !== '\\') {
      inString = false;
      stringChar = null;
    }
    
    // Count braces when not in string
    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }
  }
  
  if (endIndex === -1) {
    throw new Error('Could not find end of TOOL_SCHEMAS');
  }
  
  const schemasText = serverContent.substring(schemasStart + 'const TOOL_SCHEMAS = '.length, endIndex);
  
  // Evaluate the schemas object
  // Note: This is safe because we're only evaluating our own code
  const schemas = eval('(' + schemasText + ')');
  
  return schemas;
}

module.exports = { extractToolSchemas };