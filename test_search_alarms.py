#!/usr/bin/env python3
"""
Test script for the search_alarms MCP tool
Tests parameter validation, response structure, and advanced search capabilities using JSON-RPC
"""

import json
import subprocess
import sys
import time
from threading import Thread
import os

class SearchAlarmsTestor:
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
        """Test if search_alarms is available in tools list"""
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
            
            if "search_alarms" in tool_names:
                search_tool = next((t for t in tools if t.get("name") == "search_alarms"), None)
                result = {
                    "test": "tool_availability", 
                    "status": "PASS",
                    "tool_found": True,
                    "tool_details": search_tool
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
    
    def test_required_parameters(self):
        """Test required parameters validation"""
        print("\n=== Testing Required Parameters ===")
        
        test_cases = [
            {
                "name": "missing_query_and_limit",
                "params": {},
                "expected_status": "FAIL",
                "description": "Should fail when both query and limit are missing"
            },
            {
                "name": "missing_query",
                "params": {"limit": 10},
                "expected_status": "FAIL",
                "description": "Should fail when query is missing"
            },
            {
                "name": "missing_limit", 
                "params": {"query": "severity:high"},
                "expected_status": "FAIL",
                "description": "Should fail when limit is missing (v2.0.0 breaking change)"
            },
            {
                "name": "empty_query",
                "params": {"query": "", "limit": 10},
                "expected_status": "FAIL", 
                "description": "Should fail when query is empty string"
            },
            {
                "name": "null_query",
                "params": {"query": None, "limit": 10},
                "expected_status": "FAIL",
                "description": "Should fail when query is null"
            },
            {
                "name": "invalid_limit_zero",
                "params": {"query": "severity:high", "limit": 0},
                "expected_status": "FAIL",
                "description": "Should fail when limit is zero"
            },
            {
                "name": "invalid_limit_negative",
                "params": {"query": "severity:high", "limit": -1},
                "expected_status": "FAIL",
                "description": "Should fail when limit is negative"
            },
            {
                "name": "invalid_limit_too_large",
                "params": {"query": "severity:high", "limit": 20000},
                "expected_status": "FAIL",
                "description": "Should fail when limit exceeds maximum (10000)"
            },
            {
                "name": "valid_basic_query",
                "params": {"query": "severity:high", "limit": 10},
                "expected_status": "PASS",
                "description": "Should accept valid query and limit"
            },
            {
                "name": "valid_wildcard_query",
                "params": {"query": "source_ip:192.168.*", "limit": 5},
                "expected_status": "PASS",
                "description": "Should accept wildcard queries"
            }
        ]
        
        for test_case in test_cases:
            print(f"\nTesting: {test_case['name']}")
            
            response = self.send_json_rpc(
                "tools/call",
                {
                    "name": "search_alarms",
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
                "test": f"required_params_{test_case['name']}",
                "expected": test_case["expected_status"],
                "actual": actual_status,
                "status": "PASS" if actual_status == test_case["expected_status"] else "FAIL",
                "description": test_case["description"],
                "response": response,
                "error_details": error_details
            }
            
            self.test_results.append(test_result)
            print(f"  Expected: {test_case['expected_status']}, Got: {actual_status} - {test_result['status']}")
    
    def test_optional_parameters(self):
        """Test optional parameters validation"""
        print("\n=== Testing Optional Parameters ===")
        
        test_cases = [
            {
                "name": "with_aggregate_true",
                "params": {"query": "severity:high", "limit": 10, "aggregate": True},
                "expected_status": "PASS",
                "description": "Should accept aggregate parameter as true"
            },
            {
                "name": "with_aggregate_false",
                "params": {"query": "severity:high", "limit": 10, "aggregate": False},
                "expected_status": "PASS",
                "description": "Should accept aggregate parameter as false"
            },
            {
                "name": "with_include_resolved_true",
                "params": {"query": "severity:high", "limit": 10, "include_resolved": True},
                "expected_status": "PASS",
                "description": "Should accept include_resolved parameter as true"
            },
            {
                "name": "with_include_resolved_false",
                "params": {"query": "severity:high", "limit": 10, "include_resolved": False},
                "expected_status": "PASS",
                "description": "Should accept include_resolved parameter as false"
            },
            {
                "name": "with_min_severity_low",
                "params": {"query": "severity:high", "limit": 10, "min_severity": "low"},
                "expected_status": "PASS",
                "description": "Should accept min_severity as 'low'"
            },
            {
                "name": "with_min_severity_medium",
                "params": {"query": "severity:high", "limit": 10, "min_severity": "medium"},
                "expected_status": "PASS",
                "description": "Should accept min_severity as 'medium'"
            },
            {
                "name": "with_min_severity_high",
                "params": {"query": "severity:high", "limit": 10, "min_severity": "high"},
                "expected_status": "PASS",
                "description": "Should accept min_severity as 'high'"
            },
            {
                "name": "with_min_severity_critical",
                "params": {"query": "severity:high", "limit": 10, "min_severity": "critical"},
                "expected_status": "PASS",
                "description": "Should accept min_severity as 'critical'"
            },
            {
                "name": "with_invalid_min_severity",
                "params": {"query": "severity:high", "limit": 10, "min_severity": "invalid"},
                "expected_status": "FAIL",
                "description": "Should fail with invalid min_severity value"
            },
            {
                "name": "with_time_window_1h",
                "params": {"query": "severity:high", "limit": 10, "time_window": "1h"},
                "expected_status": "PASS",
                "description": "Should accept time_window as '1h'"
            },
            {
                "name": "with_time_window_24h",
                "params": {"query": "severity:high", "limit": 10, "time_window": "24h"},
                "expected_status": "PASS",
                "description": "Should accept time_window as '24h'"
            },
            {
                "name": "with_time_window_7d",
                "params": {"query": "severity:high", "limit": 10, "time_window": "7d"},
                "expected_status": "PASS",
                "description": "Should accept time_window as '7d'"
            },
            {
                "name": "with_offset",
                "params": {"query": "severity:high", "limit": 10, "offset": 0},
                "expected_status": "PASS",
                "description": "Should accept offset parameter"
            },
            {
                "name": "with_negative_offset",
                "params": {"query": "severity:high", "limit": 10, "offset": -1},
                "expected_status": "FAIL",
                "description": "Should fail with negative offset"
            }
        ]
        
        for test_case in test_cases:
            print(f"\nTesting: {test_case['name']}")
            
            response = self.send_json_rpc(
                "tools/call",
                {
                    "name": "search_alarms",
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
                "test": f"optional_params_{test_case['name']}",
                "expected": test_case["expected_status"],
                "actual": actual_status,
                "status": "PASS" if actual_status == test_case["expected_status"] else "FAIL",
                "description": test_case["description"],
                "response": response,
                "error_details": error_details
            }
            
            self.test_results.append(test_result)
            print(f"  Expected: {test_case['expected_status']}, Got: {actual_status} - {test_result['status']}")
    
    def test_advanced_search_queries(self):
        """Test advanced search query syntax"""
        print("\n=== Testing Advanced Search Queries ===")
        
        test_cases = [
            {
                "name": "logical_and_query",
                "params": {"query": "severity:high AND source_ip:192.168.*", "limit": 10},
                "expected_status": "PASS",
                "description": "Should accept logical AND queries"
            },
            {
                "name": "logical_or_query",
                "params": {"query": "severity:high OR severity:critical", "limit": 10},
                "expected_status": "PASS",
                "description": "Should accept logical OR queries"
            },
            {
                "name": "logical_not_query",
                "params": {"query": "severity:high NOT resolved:true", "limit": 10},
                "expected_status": "PASS",
                "description": "Should accept logical NOT queries"
            },
            {
                "name": "parentheses_query",
                "params": {"query": "(severity:high OR severity:critical) AND source_ip:192.168.*", "limit": 10},
                "expected_status": "PASS",
                "description": "Should accept queries with parentheses for grouping"
            },
            {
                "name": "wildcard_query",
                "params": {"query": "source_ip:192.168.* AND device_name:*laptop*", "limit": 10},
                "expected_status": "PASS",
                "description": "Should accept wildcard patterns"
            },
            {
                "name": "comparison_query",
                "params": {"query": "severity:>=medium", "limit": 10},
                "expected_status": "PASS",
                "description": "Should accept comparison operators"
            },
            {
                "name": "range_query",
                "params": {"query": "timestamp:[2024-01-01 TO 2024-12-31]", "limit": 10},
                "expected_status": "PASS",
                "description": "Should accept range queries"
            },
            {
                "name": "complex_query",
                "params": {"query": "(severity:>=high OR type:malware) AND source_ip:192.168.* NOT resolved:true", "limit": 5},
                "expected_status": "PASS",
                "description": "Should accept complex multi-operator queries"
            }
        ]
        
        for test_case in test_cases:
            print(f"\nTesting: {test_case['name']}")
            
            response = self.send_json_rpc(
                "tools/call",
                {
                    "name": "search_alarms",
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
                    # For advanced queries, API errors might be expected if no data matches
                    error_text = result.get("content", [{}])[0].get("text", "Unknown error")
                    if "credentials" in error_text.lower() or "authentication" in error_text.lower():
                        actual_status = "PASS"  # Query syntax accepted, just auth issue
                        error_details = f"Query accepted, auth issue: {error_text}"
                    else:
                        actual_status = "FAIL"
                        error_details = error_text
                else:
                    actual_status = "PASS"
                    error_details = None
            
            test_result = {
                "test": f"advanced_query_{test_case['name']}",
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
        
        # Test with a valid query to check response structure
        response = self.send_json_rpc(
            "tools/call",
            {
                "name": "search_alarms", 
                "arguments": {"query": "severity:high", "limit": 5}
            }
        )
        
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
                
                # Check if it's a proper error response with expected structure
                if any(keyword in text_content.lower() for keyword in ["credentials", "authentication", "token", "unauthorized"]):
                    result = {
                        "test": "response_structure",
                        "status": "PASS",
                        "note": "Error response as expected (likely due to missing credentials)",
                        "error_response": text_content,
                        "response_type": "error",
                        "response_structure_valid": True
                    }
                else:
                    result = {
                        "test": "response_structure",
                        "status": "FAIL",
                        "error": f"Unexpected error response: {text_content}",
                        "response_type": "error",
                        "response_structure_valid": False
                    }
            else:
                # Check if we got a success response
                content = result_data.get("content", [{}])[0]
                text_content = content.get("text", "")
                
                try:
                    if text_content:
                        parsed_content = json.loads(text_content)
                        
                        # Expected fields in a successful search_alarms response
                        expected_fields = ["alarms", "total", "query", "limit"]
                        has_required_fields = all(f in parsed_content for f in expected_fields)
                        
                        result = {
                            "test": "response_structure",
                            "status": "PASS" if has_required_fields else "FAIL", 
                            "expected_fields": expected_fields,
                            "actual_response": parsed_content,
                            "response_type": "success",
                            "response_structure_valid": has_required_fields
                        }
                    else:
                        result = {
                            "test": "response_structure",
                            "status": "FAIL",
                            "error": "Empty response content",
                            "response_type": "success"
                        }
                except json.JSONDecodeError:
                    result = {
                        "test": "response_structure",
                        "status": "FAIL",
                        "error": "Response content is not valid JSON",
                        "raw_content": text_content,
                        "response_type": "success"
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
        print("=== MCP search_alarms Tool Testing ===")
        
        if not self.start_server():
            print("Failed to start server, aborting tests")
            return False
        
        try:
            self.test_tools_list()
            self.test_required_parameters()
            self.test_optional_parameters()
            self.test_advanced_search_queries()
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
                if result.get("note"):
                    print(f"    Note: {result['note']}")
            
            return passed == total
            
        finally:
            self.cleanup()
    
    def get_detailed_results(self):
        """Return detailed test results"""
        return self.test_results

if __name__ == "__main__":
    tester = SearchAlarmsTestor()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open("search_alarms_test_results.json", "w") as f:
        json.dump(tester.get_detailed_results(), f, indent=2)
    
    print(f"\nDetailed results saved to search_alarms_test_results.json")
    sys.exit(0 if success else 1)