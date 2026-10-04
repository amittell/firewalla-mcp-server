/**
 * Alarm write tools: archive_alarm and mute_alarm (MSP 2.11.0 or later) and
 * delete_alarm. They change alarms on the box, so they are registered only
 * with FIREWALLA_ENABLE_WRITE_TOOLS=true.
 */
import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import { type FirewallaClient } from '../../firewalla/client.js';
/**
 * Handler for archiving an alarm (MSP 2.11.0+)
 */
export declare class ArchiveAlarmHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "security";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
/**
 * Handler for muting an alarm (MSP 2.11.0+): archive it and create a lasting
 * silence exception on the box
 */
export declare class MuteAlarmHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "security";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
/**
 * Handler for deleting an alarm permanently. Measured 2026-09-26: the DELETE
 * removed an archived alarm (a GET of it then answered 404, and the account's
 * archived alarms counted one fewer); in July 2025 the same request answered
 * success without deleting.
 */
export declare class DeleteAlarmHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "security";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
//# sourceMappingURL=alarm-actions.d.ts.map