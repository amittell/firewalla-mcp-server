/**
 * Wi-Fi and Access Point tool handlers
 */
import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
export declare class GetAccessPointsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "network";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetAccessPointChannelsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "network";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetWifiNetworksHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "network";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetWifiSettingsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "network";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
//# sourceMappingURL=wifi.d.ts.map