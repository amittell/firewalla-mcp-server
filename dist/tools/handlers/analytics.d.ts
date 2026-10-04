/**
 * Analytics and statistics tool handlers
 */
import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import { type FirewallaClient } from '../../firewalla/client.js';
export declare class GetBoxesHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "analytics";
    constructor();
    execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetSimpleStatisticsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "analytics";
    constructor();
    execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
    private calculateBoxAvailability;
    private calculateHealthScore;
}
export declare class GetStatisticsByRegionHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "analytics";
    constructor();
    execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetStatisticsByBoxHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "analytics";
    constructor();
    execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetRecentFlowActivityHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "analytics";
    private static readonly MAX_FLOWS;
    private static readonly FLOWS_PER_PAGE;
    private static readonly MAX_PAGES;
    constructor();
    execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetFlowInsightsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "analytics";
    constructor();
    execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetFlowTrendsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "analytics";
    constructor();
    execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetAlarmTrendsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "analytics";
    constructor();
    execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetRuleTrendsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "analytics";
    constructor();
    execute(_args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
//# sourceMappingURL=analytics.d.ts.map