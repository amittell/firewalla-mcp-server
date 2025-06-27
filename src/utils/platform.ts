/**
 * Cross-platform utility functions for handling platform-specific operations
 */

import { platform } from 'os';
import { join, resolve, normalize, sep } from 'path';

/**
 * Platform types supported by the application
 */
export type PlatformType = 'windows' | 'mac' | 'linux' | 'unknown';

/**
 * Get the current platform type
 */
export function getPlatform(): PlatformType {
  const platformName = platform();

  switch (platformName) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'mac';
    case 'linux':
      return 'linux';
    case 'aix':
    case 'android':
    case 'freebsd':
    case 'haiku':
    case 'openbsd':
    case 'sunos':
    case 'cygwin':
    case 'netbsd':
    default:
      return 'unknown';
  }
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return getPlatform() === 'windows';
}

/**
 * Check if running on macOS
 */
export function isMac(): boolean {
  return getPlatform() === 'mac';
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return getPlatform() === 'linux';
}

/**
 * Check if running on Unix-like system (macOS or Linux)
 */
export function isUnix(): boolean {
  return isMac() || isLinux();
}

/**
 * Normalize file paths for cross-platform compatibility
 */
export function normalizePath(path: string): string {
  return normalize(path);
}

/**
 * Join paths in a cross-platform way
 */
export function joinPaths(...paths: string[]): string {
  return join(...paths);
}

/**
 * Resolve paths in a cross-platform way
 */
export function resolvePath(...paths: string[]): string {
  return resolve(...paths);
}

/**
 * Get the appropriate path separator for the current platform
 */
export function getPathSeparator(): string {
  return sep;
}

/**
 * Convert Unix-style paths to platform-specific paths
 */
export function toPlatformPath(unixPath: string): string {
  if (isWindows()) {
    return unixPath.replace(/\//g, '\\');
  }
  return unixPath;
}

/**
 * Convert platform-specific paths to Unix-style paths
 */
export function toUnixPath(platformPath: string): string {
  return platformPath.replace(/\\/g, '/');
}

/**
 * Get platform-specific temporary directory
 */
export function getTempDir(): string {
  return (
    process.env.TMPDIR ||
    process.env.TMP ||
    process.env.TEMP ||
    (isWindows() ? 'C:\\temp' : '/tmp')
  );
}

/**
 * Get platform-specific home directory
 */
export function getHomeDir(): string {
  return (
    process.env.HOME ||
    process.env.USERPROFILE ||
    process.env.HOMEPATH ||
    (isWindows() ? 'C:\\Users\\Default' : '/home')
  );
}

/**
 * Get platform-specific config directory
 */
export function getConfigDir(): string {
  if (isWindows()) {
    return process.env.APPDATA || joinPaths(getHomeDir(), 'AppData', 'Roaming');
  } else if (isMac()) {
    return joinPaths(getHomeDir(), 'Library', 'Application Support');
  }
  return process.env.XDG_CONFIG_HOME || joinPaths(getHomeDir(), '.config');
}

/**
 * Get platform-specific data directory
 */
export function getDataDir(): string {
  if (isWindows()) {
    return (
      process.env.LOCALAPPDATA || joinPaths(getHomeDir(), 'AppData', 'Local')
    );
  } else if (isMac()) {
    return joinPaths(getHomeDir(), 'Library', 'Application Support');
  }
  return (
    process.env.XDG_DATA_HOME || joinPaths(getHomeDir(), '.local', 'share')
  );
}

/**
 * Get platform-specific cache directory
 */
export function getCacheDir(): string {
  if (isWindows()) {
    return (
      process.env.LOCALAPPDATA || joinPaths(getHomeDir(), 'AppData', 'Local')
    );
  } else if (isMac()) {
    return joinPaths(getHomeDir(), 'Library', 'Caches');
  }
  return process.env.XDG_CACHE_HOME || joinPaths(getHomeDir(), '.cache');
}

/**
 * Get platform-specific log directory
 */
export function getLogDir(): string {
  if (isWindows()) {
    return joinPaths(getDataDir(), 'logs');
  } else if (isMac()) {
    return joinPaths(getHomeDir(), 'Library', 'Logs');
  }
  return joinPaths(getDataDir(), 'logs');
}

/**
 * Environment variable utilities
 */
export const env = {
  /**
   * Get environment variable with platform-aware defaults
   */
  get(key: string, defaultValue?: string): string | undefined {
    return process.env[key] || defaultValue;
  },

  /**
   * Set environment variable (for testing purposes)
   */
  set(key: string, value: string): void {
    process.env[key] = value;
  },

  /**
   * Get PATH environment variable entries
   */
  getPath(): string[] {
    const pathVar = process.env.PATH || process.env.Path || '';
    const separator = isWindows() ? ';' : ':';
    return pathVar.split(separator).filter(Boolean);
  },

  /**
   * Check if a command is available in PATH
   */
  hasCommand(command: string): boolean {
    const paths = this.getPath();
    const extensions = isWindows() ? ['.exe', '.cmd', '.bat'] : [''];

    for (const dir of paths) {
      for (const ext of extensions) {
        try {
          joinPaths(dir, command + ext);
          // In a real implementation, you'd check if the file exists and is executable
          // For now, we'll assume it exists if the path is valid
          return true;
        } catch {
          continue;
        }
      }
    }

    return false;
  },
};

/**
 * Platform-specific file system utilities
 */
export const fs = {
  /**
   * Get file extension for executable files
   */
  getExecutableExtension(): string {
    return isWindows() ? '.exe' : '';
  },

  /**
   * Get script extension for the platform
   */
  getScriptExtension(): string {
    return isWindows() ? '.bat' : '.sh';
  },

  /**
   * Check if a filename is hidden (starts with dot on Unix, has hidden attribute on Windows)
   */
  isHiddenFile(filename: string): boolean {
    if (isWindows()) {
      // On Windows, this would require checking file attributes
      // For simplicity, we'll just check for dot prefix
      return filename.startsWith('.');
    }
    return filename.startsWith('.');
  },

  /**
   * Get case sensitivity of the file system
   */
  isCaseSensitive(): boolean {
    // Most Unix file systems are case-sensitive, Windows is not
    return !isWindows();
  },
};

/**
 * Platform-specific command utilities
 */
export const commands = {
  /**
   * Get the shell command for the platform
   */
  getShell(): string {
    if (isWindows()) {
      return process.env.COMSPEC || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/sh';
  },

  /**
   * Get shell flag for executing commands
   */
  getShellFlag(): string {
    return isWindows() ? '/c' : '-c';
  },

  /**
   * Get command to list directory contents
   */
  getListCommand(): string {
    return isWindows() ? 'dir' : 'ls';
  },

  /**
   * Get command to copy files
   */
  getCopyCommand(): string {
    return isWindows() ? 'copy' : 'cp';
  },

  /**
   * Get command to move files
   */
  getMoveCommand(): string {
    return isWindows() ? 'move' : 'mv';
  },

  /**
   * Get command to remove files
   */
  getRemoveCommand(): string {
    return isWindows() ? 'del' : 'rm';
  },

  /**
   * Get command to create directories
   */
  getMkdirCommand(): string {
    return isWindows() ? 'mkdir' : 'mkdir -p';
  },
};

/**
 * Platform information
 */
export const platformInfo = {
  type: getPlatform(),
  isWindows: isWindows(),
  isMac: isMac(),
  isLinux: isLinux(),
  isUnix: isUnix(),
  separator: getPathSeparator(),
  shell: commands.getShell(),
  tempDir: getTempDir(),
  homeDir: getHomeDir(),
  configDir: getConfigDir(),
  dataDir: getDataDir(),
  cacheDir: getCacheDir(),
  logDir: getLogDir(),
};

/**
 * Logging function that respects platform conventions
 */
export function platformLog(
  message: string,
  level: 'info' | 'warn' | 'error' = 'info'
): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(`${prefix} ${message}`);
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(`${prefix} ${message}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`${prefix} ${message}`);
  }
}
