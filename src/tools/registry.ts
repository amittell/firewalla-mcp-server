/**
 * Tool Registry - Centralized management of MCP tools
 * 
 * This registry pattern replaces the massive switch statement with a cleaner,
 * more maintainable architecture where each tool is a separate handler.
 */

import { ToolHandler } from './handlers/base.js';
import { GetActiveAlarmsHandler, GetSpecificAlarmHandler, DeleteAlarmHandler } from './handlers/security.js';
import { GetFlowDataHandler, GetBandwidthUsageHandler, GetOfflineDevicesHandler } from './handlers/network.js';
import { GetDeviceStatusHandler } from './handlers/device.js';
import { 
  GetNetworkRulesHandler, 
  PauseRuleHandler, 
  ResumeRuleHandler, 
  GetTargetListsHandler,
  GetNetworkRulesSummaryHandler,
  GetMostActiveRulesHandler,
  GetRecentRulesHandler
} from './handlers/rules.js';
import { 
  GetBoxesHandler,
  GetSimpleStatisticsHandler,
  GetStatisticsByRegionHandler,
  GetStatisticsByBoxHandler,
  GetFlowTrendsHandler,
  GetAlarmTrendsHandler,
  GetRuleTrendsHandler
} from './handlers/analytics.js';
import { 
  SearchFlowsHandler,
  SearchAlarmsHandler,
  SearchRulesHandler,
  SearchDevicesHandler,
  SearchTargetListsHandler,
  SearchCrossReferenceHandler
} from './handlers/search.js';

export class ToolRegistry {
  private handlers = new Map<string, ToolHandler>();

  constructor() {
    this.registerHandlers();
  }

  /**
   * Register all tool handlers
   */
  private registerHandlers(): void {
    // Security tools (3 handlers)
    this.register(new GetActiveAlarmsHandler());
    this.register(new GetSpecificAlarmHandler());
    this.register(new DeleteAlarmHandler());
    
    // Network tools (3 handlers)
    this.register(new GetFlowDataHandler());
    this.register(new GetBandwidthUsageHandler());
    this.register(new GetOfflineDevicesHandler());
    
    // Device tools (1 handler)
    this.register(new GetDeviceStatusHandler());
    
    // Rule tools (6 handlers)
    this.register(new GetNetworkRulesHandler());
    this.register(new PauseRuleHandler());
    this.register(new ResumeRuleHandler());
    this.register(new GetTargetListsHandler());
    this.register(new GetNetworkRulesSummaryHandler());
    this.register(new GetMostActiveRulesHandler());
    this.register(new GetRecentRulesHandler());
    
    // Analytics tools (6 handlers)
    this.register(new GetBoxesHandler());
    this.register(new GetSimpleStatisticsHandler());
    this.register(new GetStatisticsByRegionHandler());
    this.register(new GetStatisticsByBoxHandler());
    this.register(new GetFlowTrendsHandler());
    this.register(new GetAlarmTrendsHandler());
    this.register(new GetRuleTrendsHandler());
    
    // Search tools (6 handlers)
    this.register(new SearchFlowsHandler());
    this.register(new SearchAlarmsHandler());
    this.register(new SearchRulesHandler());
    this.register(new SearchDevicesHandler());
    this.register(new SearchTargetListsHandler());
    this.register(new SearchCrossReferenceHandler());
  }

  /**
   * Register a tool handler
   */
  register(handler: ToolHandler): void {
    this.handlers.set(handler.name, handler);
  }

  /**
   * Get a tool handler by name
   */
  getHandler(toolName: string): ToolHandler | undefined {
    return this.handlers.get(toolName);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: string): ToolHandler[] {
    return Array.from(this.handlers.values()).filter(handler => handler.category === category);
  }

  /**
   * Check if a tool is registered
   */
  isRegistered(toolName: string): boolean {
    return this.handlers.has(toolName);
  }
}