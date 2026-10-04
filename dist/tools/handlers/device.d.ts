/**
 * Device monitoring tool handlers
 */
import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import { type FirewallaClient } from '../../firewalla/client.js';
export declare class GetDeviceStatusHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "device";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
/**
 * Handler for renaming a device
 */
export declare class RenameDeviceHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "device";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
//# sourceMappingURL=device.d.ts.map