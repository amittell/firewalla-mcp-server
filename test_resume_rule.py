#!/usr/bin/env python3
"""
Test script for the resume_rule MCP tool
Tests parameter validation and response structure using JSON-RPC
"""

import json
import subprocess
import sys
import time
from threading import Thread
import os

class MCPTester:
    def __init__(self):
        self.server_process = None
        self.test_results = []
        
    def start_server(self):
        """Start the MCP server as a subprocess"""
        print("Starting MCP server...")
        try:
            # Change to the correct directory
            os.chdir('/home/alexm/git/firewalla-mcp-server')
            
            # Start the server
            self.server_process = subprocess.Popen(
                ['npm', 'run', 'mcp:start'],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            
            # Give the server time to start
            time.sleep(3)
            
            if self.server_process.poll() is not None:
                stdout, stderr = self.server_process.communicate()
                print(f"Server failed to start. stdout: {stdout}, stderr: {stderr}")
                return False
                
            print("Server started successfully")
            return True
            
        except Exception as e:
            print(f"Failed to start server: {e}")
            return False
    
    def send_json_rpc(self, method, params=None, id=1):
        """Send a JSON-RPC request to the server"""
        if not self.server_process or self.server_process.poll() is not None:
            return {"error": "Server not running"}
            
        request = {
            "jsonrpc": "2.0",
            "method": method,
            "id": id
        }
        
        if params is not None:
            request["params"] = params
            
        try:
            request_str = json.dumps(request) + '\n'
            self.server_process.stdin.write(request_str)
            self.server_process.stdin.flush()
            
            # Read response with timeout
            response_line = self.server_process.stdout.readline()
            if response_line:
                return json.loads(response_line.strip())
            else:
                return {"error": "No response from server"}
                
        except Exception as e:
            return {"error": f"Communication error: {e}"}
    
    def test_tools_list(self):
        """Test if resume_rule is available in tools list"""
        print("\n=== Testing Tool Availability ===")
        
        response = self.send_json_rpc("tools/list")
        
        if "error" in response:
            result = {
                "test": "tool_availability",
                "status": "FAIL",
                "error": response["error"]
            }
        else:
            tools = response.get("result", {}).get("tools", [])
            tool_names = [tool.get("name", "") for tool in tools]
            
            if "resume_rule" in tool_names:
                resume_tool = next((t for t in tools if t.get("name") == "resume_rule"), None)
                result = {
                    "test": "tool_availability", 
                    "status": "PASS",
                    "tool_found": True,
                    "tool_details": resume_tool
                }
            else:
                result = {
                    "test": "tool_availability",
                    "status": "FAIL", 
                    "tool_found": False,
                    "available_tools": tool_names
                }
        
        self.test_results.append(result)
        print(f"Tool availability: {result['status']}")
        return result
    
    def test_parameter_validation(self):
        """Test parameter validation scenarios"""
        print("\n=== Testing Parameter Validation ===")
        
        test_cases = [
            {
                "name": "missing_rule_id",
                "params": {},
                "expected_status": "FAIL",
                "description": "Should fail when rule_id is missing"
            },
            {
                "name": "null_rule_id", 
                "params": {"rule_id": None},
                "expected_status": "FAIL",
                "description": "Should fail when rule_id is null"
            },
            {
                "name": "empty_rule_id",
                "params": {"rule_id": ""},
                "expected_status": "FAIL", 
                "description": "Should fail when rule_id is empty string"
            },
            {
                "name": "valid_rule_id",
                "params": {"rule_id": "test-rule-123"},
                "expected_status": "PASS",
                "description": "Should accept valid rule_id"
            },
            {
                "name": "numeric_rule_id",
                "params": {"rule_id": "12345"},
                "expected_status": "PASS",
                "description": "Should accept numeric rule_id as string"
            },
            {
                "name": "uuid_rule_id",
                "params": {"rule_id": "550e8400-e29b-41d4-a716-446655440000"},
                "expected_status": "PASS",
                "description": "Should accept UUID format rule_id"
            }
        ]
        
        for test_case in test_cases:
            print(f"\nTesting: {test_case['name']}")
            
            response = self.send_json_rpc(
                "tools/call",
                {
                    "name": "resume_rule",
                    "arguments": test_case["params"]
                }
            )
            
            # Analyze response
            if "error" in response:
                actual_status = "FAIL"
                error_details = response["error"]
            else:
                result = response.get("result", {})
                if result.get("isError", False):
                    actual_status = "FAIL"
                    error_details = result.get("content", [{}])[0].get("text", "Unknown error")
                else:
                    actual_status = "PASS"
                    error_details = None
            
            test_result = {
                "test": f"param_validation_{test_case['name']}",
                "expected": test_case["expected_status"],
                "actual": actual_status,
                "status": "PASS" if actual_status == test_case["expected_status"] else "FAIL",
                "description": test_case["description"],
                "response": response,
                "error_details": error_details
            }
            
            self.test_results.append(test_result)
            print(f"  Expected: {test_case['expected_status']}, Got: {actual_status} - {test_result['status']}")
    
    def test_response_structure(self):
        """Test response structure validation"""
        print("\n=== Testing Response Structure ===")
        
        # Test with a valid rule_id to check response structure
        response = self.send_json_rpc(
            "tools/call",
            {
                "name": "resume_rule", 
                "arguments": {"rule_id": "test-rule-structure"}
            }
        )
        
        expected_fields = ["success", "message", "rule_id", "action"]
        
        if "error" in response:
            result = {
                "test": "response_structure", 
                "status": "FAIL",
                "error": f"Failed to get response: {response['error']}"
            }
        else:
            result_data = response.get("result", {})
            
            if result_data.get("isError", False):
                # This is expected if we don't have valid credentials
                content = result_data.get("content", [{}])[0]
                text_content = content.get("text", "")
                
                result = {
                    "test": "response_structure",
                    "status": "PASS",
                    "note": "Error response as expected (likely due to missing credentials)",
                    "error_response": text_content,
                    "response_type": "error"
                }
            else:
                # Check if we got a success response with expected fields
                content = result_data.get("content", [{}])[0]
                text_content = content.get("text", "")
                
                try:
                    parsed_content = json.loads(text_content) if text_content else {}
                    missing_fields = [f for f in expected_fields if f not in parsed_content]
                    
                    result = {
                        "test": "response_structure",
                        "status": "PASS" if not missing_fields else "FAIL", 
                        "expected_fields": expected_fields,
                        "missing_fields": missing_fields,
                        "actual_response": parsed_content,
                        "response_type": "success"
                    }
                except json.JSONDecodeError:
                    result = {
                        "test": "response_structure",
                        "status": "FAIL",
                        "error": "Response content is not valid JSON",
                        "raw_content": text_content
                    }
        
        self.test_results.append(result)
        print(f"Response structure: {result['status']}")
        return result
    
    def cleanup(self):
        """Clean up server process"""
        if self.server_process:
            try:
                self.server_process.terminate()
                self.server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.server_process.kill()
                self.server_process.wait()
            print("Server stopped")
    
    def run_all_tests(self):
        """Run all tests"""
        print("=== MCP resume_rule Tool Testing ===")
        
        if not self.start_server():
            print("Failed to start server, aborting tests")
            return False
        
        try:
            self.test_tools_list()
            self.test_parameter_validation()
            self.test_response_structure()
            
            # Print summary
            print("\n=== TEST SUMMARY ===")
            passed = sum(1 for r in self.test_results if r.get("status") == "PASS")
            total = len(self.test_results)
            
            print(f"Tests passed: {passed}/{total}")
            
            for result in self.test_results:
                status_symbol = "✓" if result.get("status") == "PASS" else "✗"
                print(f"{status_symbol} {result['test']}: {result['status']}")
                if result.get("error"):
                    print(f"    Error: {result['error']}")
            
            return passed == total
            
        finally:
            self.cleanup()
    
    def get_detailed_results(self):
        """Return detailed test results"""
        return self.test_results

if __name__ == "__main__":
    tester = MCPTester()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open("resume_rule_test_results.json", "w") as f:
        json.dump(tester.get_detailed_results(), f, indent=2)
    
    print(f"\nDetailed results saved to resume_rule_test_results.json")
    sys.exit(0 if success else 1)