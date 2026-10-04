/**
 * Security monitoring tool handlers
 */
import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import { type FirewallaClient } from '../../firewalla/client.js';
export declare class GetActiveAlarmsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "security";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetSpecificAlarmHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "security";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
//# sourceMappingURL=security.d.ts.map