import { StructuredLogger } from '../../src/monitoring/logger.js';

describe('StructuredLogger output', () => {
  let writes: string[];

  beforeEach(() => {
    writes = [];
    jest.spyOn(process.stderr, 'write').mockImplementation(chunk => {
      writes.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes one JSON entry per line to stderr', () => {
    const log = new StructuredLogger('info');
    log.info('first', { n: 1 });
    log.warn('second');
    log.error('third', new Error('boom'));

    expect(writes).toHaveLength(3);
    for (const line of writes) {
      // One line ending in a real newline, not a backslash followed by an n.
      // (Newlines inside values, such as a stack, are escaped by JSON.)
      expect(line).toMatch(/^\{[^\n]*\}\n$/);
    }
    const entries = writes
      .join('')
      .trimEnd()
      .split('\n')
      .map(l => JSON.parse(l));
    expect(entries.map(e => e.message)).toEqual(['first', 'second', 'third']);
    expect(entries.map(e => e.level)).toEqual(['info', 'warn', 'error']);
  });

  it('keeps newlines inside a message escaped within its line', () => {
    const log = new StructuredLogger('info');
    log.info('line one\nline two');

    expect(writes).toHaveLength(1);
    expect(writes[0]!.match(/\n/g)).toHaveLength(1);
    expect(JSON.parse(writes[0]!).message).toBe('line one\nline two');
  });
});
