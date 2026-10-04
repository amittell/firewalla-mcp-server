/**
 * Opt-in switch for every tool that changes state on the box or the MSP
 * account. They are registered and listed only when
 * FIREWALLA_ENABLE_WRITE_TOOLS=true, so by default the server has no tool
 * that changes anything. A new tool that changes state goes in this list.
 */
export declare const WRITE_TOOL_NAMES: readonly string[];
export declare function writeToolsEnabled(env?: Record<string, string | undefined>): boolean;
export declare function isWriteTool(name: string): boolean;
//# sourceMappingURL=write-tools.d.ts.map