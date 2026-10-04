/**
 * Firewall rule management tool handlers
 */
import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import { type FirewallaClient } from '../../firewalla/client.js';
export declare class GetNetworkRulesHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "rule";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class PauseRuleHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "rule";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class ResumeRuleHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "rule";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetTargetListsHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "rule";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
export declare class GetNetworkRulesSummaryHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "rule";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
/**
 * Handler for retrieving a specific target list by ID
 */
export declare class GetSpecificTargetListHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "rule";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
/**
 * Handler for creating a new target list
 */
export declare class CreateTargetListHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "rule";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
/**
 * Handler for updating an existing target list
 */
export declare class UpdateTargetListHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "rule";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
/**
 * Handler for deleting a target list
 */
export declare class DeleteTargetListHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "rule";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
/**
 * Handler for creating a new firewall rule
 */
export declare class CreateRuleHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "rule";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
/**
 * Handler for permanently deleting a firewall rule (MSP 2.11.0+)
 */
export declare class DeleteRuleHandler extends BaseToolHandler {
    name: string;
    description: string;
    category: "rule";
    constructor();
    execute(args: ToolArgs, firewalla: FirewallaClient): Promise<ToolResponse>;
}
//# sourceMappingURL=rules.d.ts.map