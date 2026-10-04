/**
 * Network monitoring and analysis tool handlers
 */
import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import { type FirewallaClient } from '../../firewalla/client.js';
export declare class GetFlowDataHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "network";
    constructor();
    execute(rawArgs: unknown, firewalla: FirewallaClient): Promise<ToolResponse>;
    /** The records of a page or chunk, with geographic enrichment */
    private flowRecords;
}
export declare class GetBandwidthUsageHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "network";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetOfflineDevicesHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "network";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
//# sourceMappingURL=network.d.ts.map