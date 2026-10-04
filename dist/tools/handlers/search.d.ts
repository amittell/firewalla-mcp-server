/**
 * Advanced search tool handlers
 */
import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import { type FlowGeographicFilters } from '../../utils/geographic-filters.js';
export interface BaseSearchArgs extends ToolArgs {
    query: string;
    limit: number;
    offset?: number;
    cursor?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    group_by?: string;
    aggregate?: boolean;
    force_refresh?: boolean;
}
export interface SearchFlowsArgs extends BaseSearchArgs {
    time_range?: {
        start?: string;
        end?: string;
    };
    geographic_filters?: FlowGeographicFilters;
}
export interface SearchAlarmsArgs extends BaseSearchArgs {
    time_range?: {
        start?: string;
        end?: string;
    };
    /** Countries of the remote end, sent as remote.region: */
    geographic_filters?: FlowGeographicFilters;
}
export interface SearchRulesArgs extends BaseSearchArgs {
}
export interface SearchDevicesArgs extends BaseSearchArgs {
    time_range?: {
        start?: string;
        end?: string;
    };
    box?: string;
}
export interface SearchTargetListsArgs extends BaseSearchArgs {
    owner?: string;
}
export declare class SearchFlowsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "search";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class SearchAlarmsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "search";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class SearchRulesHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "search";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class SearchDevicesHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "search";
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class SearchTargetListsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "search";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
//# sourceMappingURL=search.d.ts.map