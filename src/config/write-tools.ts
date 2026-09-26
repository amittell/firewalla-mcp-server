/**
 * Opt-in switch for every tool that changes state on the box or the MSP
 * account. They are registered and listed only when
 * FIREWALLA_ENABLE_WRITE_TOOLS=true, so by default the server has no tool
 * that changes anything. A new tool that changes state goes in this list.
 */

export const WRITE_TOOL_NAMES: readonly string[] = [
  // Rules
  'create_rule',
  'delete_rule',
  'pause_rule',
  'resume_rule',
  // Target lists
  'create_target_list',
  'update_target_list',
  'delete_target_list',
  // Devices
  'rename_device',
  // Alarms
  'archive_alarm',
  'mute_alarm',
  'delete_alarm',
];

export function writeToolsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    (env.FIREWALLA_ENABLE_WRITE_TOOLS ?? '').trim().toLowerCase() === 'true'
  );
}

export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.includes(name);
}
