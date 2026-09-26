/**
 * The response_format helpers: taking the argument out of a call, adding the
 * property to a read tool's schema, and rendering a response as markdown.
 * All values are invented.
 */

import {
  RESPONSE_FORMAT_PROPERTY,
  escapeCell,
  escapeMarkdown,
  renderMarkdown,
  takeResponseFormat,
  toMarkdownResponse,
  withResponseFormatProperty,
} from '../../src/utils/response-format.js';

const BOX = '00000000-0000-0000-0000-000000000000';

describe('takeResponseFormat', () => {
  it('returns arguments without the property as the same object', () => {
    const args = { limit: 5 };
    const taken = takeResponseFormat(args);
    expect(taken).toEqual({ format: 'json', args });
    expect('args' in taken && taken.args).toBe(args);
    expect(takeResponseFormat(undefined)).toEqual({
      format: 'json',
      args: undefined,
    });
  });

  it.each([
    ['json', 'json'],
    ['markdown', 'markdown'],
    [' MarkDown ', 'markdown'],
    [null, 'json'],
  ])('takes %j as %s and removes it', (value, format) => {
    const args = { limit: 5, response_format: value };
    expect(takeResponseFormat(args)).toEqual({ format, args: { limit: 5 } });
    // The caller's object is not changed
    expect(args).toHaveProperty('response_format');
  });

  it.each([['xml'], [''], [5], [true]])('refuses %j', value => {
    expect(takeResponseFormat({ response_format: value })).toEqual({
      error: `response_format must be 'json' or 'markdown', not ${JSON.stringify(value)}`,
    });
  });
});

describe('withResponseFormatProperty', () => {
  const schema = { type: 'object', properties: { limit: { type: 'number' } } };

  it('adds the property to a read-only tool without changing it', () => {
    const tool = {
      name: 'get_x',
      annotations: { readOnlyHint: true },
      inputSchema: schema,
    };
    const listed = withResponseFormatProperty(tool);
    expect(listed.inputSchema.properties).toEqual({
      limit: { type: 'number' },
      response_format: RESPONSE_FORMAT_PROPERTY,
    });
    expect(tool.inputSchema.properties).toEqual({ limit: { type: 'number' } });
  });

  it.each([[{ readOnlyHint: false }], [{}], [undefined]])(
    'leaves a tool with annotations %j as it is',
    annotations => {
      const tool = { name: 'set_x', annotations, inputSchema: schema };
      expect(withResponseFormatProperty(tool)).toBe(tool);
    }
  );
});

describe('escapeMarkdown', () => {
  it.each([
    ['192.168.1.10'],
    ['fe80::1'],
    ['2001:db8::8a2e:370:7334'],
    ['2026-09-26T10:00:00.000Z'],
    ['AA:BB:CC:DD:EE:FF'],
    [BOX],
    ['mac_vendor'],
    ['AT&T'],
    ['example.com'],
    ['Den TV (upstairs)'],
  ])('leaves %j as it is', value => {
    expect(escapeMarkdown(value)).toBe(value);
  });

  it.each([
    ['[click](https://evil.example)', '\\[click\\](https\\://evil.example)'],
    [
      '![p](https://evil.example/p.png)',
      '!\\[p\\](https\\://evil.example/p.png)',
    ],
    ['<img src=x onerror=alert(1)>', '\\<img src=x onerror=alert(1)>'],
    ['<https://evil.example>', '\\<https\\://evil.example>'],
    ['www.evil.example', 'www\\.evil.example'],
    ['user@evil.example', 'user\\@evil.example'],
    ['&lt;b&gt; &#60;', '\\&lt;b\\&gt; \\&#60;'],
    ['*bold* ~~strike~~ `code`', '\\*bold\\* \\~\\~strike\\~\\~ \\`code\\`'],
    ['_id and _it_', '\\_id and \\_it\\_'],
    ['C:\\Users', 'C:\\\\Users'],
    ['*.example.com', '\\*.example.com'],
  ])('escapes %j', (value, escaped) => {
    expect(escapeMarkdown(value)).toBe(escaped);
  });
});

describe('escapeCell', () => {
  it('escapes pipes and puts newlines on one line', () => {
    expect(escapeCell('a|b\nc\r\nd\re')).toBe('a\\|b<br>c<br>d<br>e');
  });

  it('escapes backslashes before pipes, so a backslash-pipe stays in one cell', () => {
    expect(escapeCell('a\\|b')).toBe('a\\\\\\|b');
    expect(escapeCell('C:\\Users')).toBe('C:\\\\Users');
  });
});

describe('renderMarkdown', () => {
  const item = (i: number, extra: Record<string, unknown>) => ({
    name: ['alpha', 'beta', 'gamma'][i],
    gid: BOX,
    device: { name: `d${i + 1}`, ip: `192.168.1.${i + 1}` },
    blocked: null,
    ...extra,
    c1: i + 1,
    c2: (i + 1) * 10,
    c3: (i + 1) * 100,
    c4: (i + 1) * 1000,
  });

  const response = {
    success: true,
    data: {
      total: 3,
      note: 'Pipes | stay\nin bullets',
      window: {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-02T00:00:00.000Z',
      },
      tags: ['a', 'b'],
      empty_list: [],
      items: [
        item(0, {
          ports: [22, 80, 443, 8080],
          hits: [{ n: 1 }],
          message: 'x'.repeat(130),
        }),
        item(1, { ports: [22], hits: [], message: 'short' }),
        item(2, { ports: [], hits: [{ n: 2 }, { n: 3 }], message: 'short' }),
      ],
    },
    meta: { request_id: 'req_1_abc', timestamp: '2026-09-26T00:00:00.000Z' },
  };

  it('renders fields as bullets and records as a table, deterministically', () => {
    const expected = [
      '## demo_tool (empty_list: 0, items: 3)',
      '',
      '- **total:** 3',
      '- **note:** Pipes | stay<br>in bullets',
      '- **window:**',
      '  - **from:** 2026-09-01T00:00:00.000Z',
      '  - **to:** 2026-09-02T00:00:00.000Z',
      '- **tags:** a, b',
      '- **empty_list:** none',
      '- **items:** 3 records, under items below',
      '',
      '### items (3 records)',
      '',
      `Same in every record: gid = ${BOX}.`,
      '',
      '| name | device.name | device.ip | message | ports | hits | c1 | c2 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      `| alpha | d1 | 192.168.1.1 | ${'x'.repeat(119)}… | 22, 80, 443 (+1 more) | 1 record | 1 | 10 |`,
      '| beta | d2 | 192.168.1.2 | short | 22 |  | 2 | 20 |',
      '| gamma | d3 | 192.168.1.3 | short |  | 2 records | 3 | 30 |',
      '',
      'Fields not in the table: c3, c4.',
      '',
      'Empty in every record: blocked.',
      '',
      '_This view leaves out the meta block (request_id req_1_abc); the fields named under their table; the rest of each table cell over 120 characters (cut with …); list items in a table cell past the first 3, and nested records (given as a count). Call again with `response_format: json` for the full JSON response._',
    ].join('\n');
    expect(renderMarkdown('demo_tool', response)).toBe(expected);
    expect(renderMarkdown('demo_tool', response)).toBe(
      renderMarkdown('demo_tool', JSON.parse(JSON.stringify(response)))
    );
  });

  it('caps table rows and bullet lists at maxRows and says so', () => {
    const text = renderMarkdown(
      'demo_tool',
      {
        rows: Array.from({ length: 5 }, (_, i) => ({ id: i, v: i * 2 })),
        hosts: Array.from({ length: 12 }, (_, i) => `host-${i}.example.org`),
      },
      { maxRows: 2 }
    );
    expect(text).toBe(
      [
        '## demo_tool (rows: 5)',
        '',
        '- **rows:** 5 records, under rows below',
        '- **hosts:** 12 items',
        '  - host-0.example.org',
        '  - host-1.example.org',
        '  - … and 10 more',
        '',
        '### rows (5 records, first 2 shown)',
        '',
        '| id | v |',
        '| --- | --- |',
        '| 0 | 0 |',
        '| 1 | 2 |',
        '',
        '_This view leaves out records past the first 2 in rows; items past the first 2 in hosts. Call again with `response_format: json` for the full JSON response._',
      ].join('\n')
    );
  });

  it('caps a short list at maxRows too', () => {
    const text = renderMarkdown(
      'demo_tool',
      { hosts: ['a.example', 'b.example', 'c.example', 'd.example'] },
      { maxRows: 2 }
    );
    expect(text).toBe(
      [
        '## demo_tool',
        '',
        '- **hosts:** 4 items',
        '  - a.example',
        '  - b.example',
        '  - … and 2 more',
        '',
        '_This view leaves out items past the first 2 in hosts. Call again with `response_format: json` for the full JSON response._',
      ].join('\n')
    );
  });

  it('keeps an empty object or list field of every record', () => {
    const text = renderMarkdown('demo_tool', {
      rows: [
        { id: 1, metadata: {}, tags: [] },
        { id: 2, metadata: {}, tags: [] },
      ],
    });
    expect(text.split('\n')).toContain(
      'Empty in every record: metadata, tags.'
    );
  });

  it('shows an empty object as blank cells of the fields other records have', () => {
    const text = renderMarkdown('demo_tool', {
      rows: [
        { id: 1, metadata: {} },
        { id: 2, metadata: { a: 1 } },
      ],
    });
    expect(text).toContain(
      ['| id | metadata.a |', '| --- | --- |', '| 1 |  |', '| 2 | 1 |'].join(
        '\n'
      )
    );
    expect(text).not.toContain('Empty in every record');
  });

  it('escapes field names, values, list items and cells', () => {
    const text = renderMarkdown('t', {
      '<b>k</b>': '[a](https://evil.example)',
      names: [
        '# h',
        '1. x',
        '- y',
        '> q',
        '<img src=x>',
        'n5',
        'n6',
        'n7',
        'n8',
        'n9',
        'n10',
      ],
      rows: [
        { name: '![p](https://evil.example/p.png)', n: 1 },
        { name: 'Den | TV\nupstairs', n: 2 },
      ],
    });
    expect(text).toBe(
      [
        '## t (rows: 2)',
        '',
        '- **\\<b>k\\</b>:** \\[a\\](https\\://evil.example)',
        '- **names:** 11 items',
        '  - \\# h',
        '  - 1\\. x',
        '  - \\- y',
        '  - \\> q',
        '  - \\<img src=x>',
        '  - n5',
        '  - n6',
        '  - n7',
        '  - n8',
        '  - n9',
        '  - n10',
        '- **rows:** 2 records, under rows below',
        '',
        '### rows (2 records)',
        '',
        '| name | n |',
        '| --- | --- |',
        '| !\\[p\\](https\\://evil.example/p.png) | 1 |',
        '| Den \\| TV<br>upstairs | 2 |',
        '',
        '_This view has every field of the response. Call again with `response_format: json` for the full JSON response._',
      ].join('\n')
    );
  });

  it('escapes a scalar response that would start a heading', () => {
    expect(renderMarkdown('t', '# not a heading').split('\n')[2]).toBe(
      '\\# not a heading'
    );
  });

  it('counts empty lists at any depth in the heading', () => {
    const text = renderMarkdown('t', {
      summary: { top_protocols: [], total: 0 },
      flows: [],
    });
    expect(text.split('\n')[0]).toBe(
      '## t (summary.top_protocols: 0, flows: 0)'
    );
    expect(text).toContain('  - **top_protocols:** none');
  });

  it('lists the fields of a single record, with its lists as sections', () => {
    const text = renderMarkdown('demo_tool', {
      alarm: {
        results: [
          {
            aid: 7,
            device: { name: 'nas', ip: '192.168.1.9' },
            notes: '',
            peers: [
              { ip: '192.168.1.20', bytes: 5 },
              { ip: '192.168.1.21', bytes: 6 },
            ],
          },
        ],
      },
    });
    expect(text).toBe(
      [
        '## demo_tool (alarm.results: 1, alarm.results.peers: 2)',
        '',
        '- **alarm:**',
        '  - **results:** 1 record, under alarm.results below',
        '',
        '### alarm.results (1 record)',
        '',
        '- **aid:** 7',
        '- **device:**',
        '  - **name:** nas',
        '  - **ip:** 192.168.1.9',
        '- **notes:** ""',
        '- **peers:** 2 records, under alarm.results.peers below',
        '',
        '### alarm.results.peers (2 records)',
        '',
        '| ip | bytes |',
        '| --- | --- |',
        '| 192.168.1.20 | 5 |',
        '| 192.168.1.21 | 6 |',
        '',
        '_This view has every field of the response. Call again with `response_format: json` for the full JSON response._',
      ].join('\n')
    );
  });

  it('renders a top-level list and a scalar', () => {
    expect(renderMarkdown('t', [])).toBe(
      [
        '## t (records: 0)',
        '',
        '- **records:** none',
        '',
        '_This view has every field of the response. Call again with `response_format: json` for the full JSON response._',
      ].join('\n')
    );
    expect(renderMarkdown('t', 'plain')).toBe(
      [
        '## t',
        '',
        'plain',
        '',
        '_This view has every field of the response. Call again with `response_format: json` for the full JSON response._',
      ].join('\n')
    );
  });
});

describe('toMarkdownResponse', () => {
  const text = (value: unknown) => ({
    content: [{ type: 'text', text: JSON.stringify(value) }],
  });

  it('renders a success response', () => {
    const response = { ...text({ success: true, data: { n: 1 }, meta: {} }) };
    const rendered = toMarkdownResponse('t', response);
    expect(rendered.content[0].text).toMatch(/^## t\n\n- \*\*n:\*\* 1\n/);
  });

  it.each([
    ['an error response', { ...text({ error: true }), isError: true }],
    ['a body with error: true', text({ error: true, message: 'x' })],
    ['a body with success: false', text({ success: false, error: 'x' })],
    ['text that is not JSON', { content: [{ type: 'text', text: 'hello' }] }],
    [
      'two content blocks',
      { content: [...text({}).content, { type: 'text', text: '{}' }] },
    ],
    ['a non-text block', { content: [{ type: 'image' }] }],
  ])('returns %s as it is', (_label, response) => {
    expect(toMarkdownResponse('t', response)).toBe(response);
  });
});
