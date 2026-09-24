/**
 * Opt-in switch for the tools that change state on the box: create_rule,
 * delete_rule and rename_device. They are registered and listed only when
 * FIREWALLA_ENABLE_WRITE_TOOLS=true.
 */

export const WRITE_TOOL_NAMES: readonly string[] = [
  'create_rule',
  'delete_rule',
  'rename_device',
];

export function writeToolsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (env.FIREWALLA_ENABLE_WRITE_TOOLS ?? '').trim().toLowerCase() === 'true';
}

export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.includes(name);
}
