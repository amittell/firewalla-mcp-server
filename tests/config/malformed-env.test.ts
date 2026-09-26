/**
 * A numeric environment variable that is not a number falls back to its
 * default, with a warning on stderr, and the server still loads. utils/env
 * writes that warning through the logger, so the logger must not import a
 * module that parses numbers when it loads: the logger read LOG_LEVEL from
 * production/config, which did, and the warning ran before `logger` existed.
 * `node dist/server.js` then failed with "ReferenceError: Cannot access
 * 'logger' before initialization" instead of starting. The server module is
 * loaded fresh here, as `node dist/server.js` loads it.
 */

const MALFORMED = {
  API_TIMEOUT: 30000,
  CACHE_TTL: 300,
  MCP_HTTP_PORT: 3000,
} as const;

type Name = keyof typeof MALFORMED;

describe('a malformed numeric environment variable', () => {
  const names = Object.keys(MALFORMED) as Name[];
  const saved = Object.fromEntries(
    [...names, 'MCP_TEST_MODE'].map(name => [name, process.env[name]])
  );

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('falls back to its default with a warning, and the server loads', () => {
    delete process.env.MCP_TEST_MODE; // test mode does not read the numbers
    for (const name of names) {
      process.env[name] = 'abc';
    }
    const stderr: string[] = [];
    jest.spyOn(process.stderr, 'write').mockImplementation(chunk => {
      stderr.push(String(chunk));
      return true;
    });

    let config: any;
    let FirewallaMCPServer: unknown;
    jest.isolateModules(() => {
      ({ FirewallaMCPServer } = require('../../src/server'));
      ({ config } = require('../../src/config/config'));
    });

    expect(typeof FirewallaMCPServer).toBe('function');
    expect(config.apiTimeout).toBe(MALFORMED.API_TIMEOUT);
    expect(config.cacheTtl).toBe(MALFORMED.CACHE_TTL);
    expect(config.transport.port).toBe(MALFORMED.MCP_HTTP_PORT);

    const warnings = stderr
      .join('')
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
      .filter(
        entry =>
          entry.level === 'warn' &&
          entry.message === 'Invalid numeric value for environment variable'
      )
      .map(entry => entry.metadata);
    for (const name of names) {
      expect(warnings).toContainEqual({
        environment_variable: name,
        invalid_value: 'abc',
        default_value: MALFORMED[name],
        action: 'using_default',
      });
    }
  });
});
