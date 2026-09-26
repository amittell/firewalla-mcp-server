/**
 * The exported types that describe search_flows' geographic_filters match
 * its schema and its handler. SearchFlowsArgs, SearchParams and ToolArgs
 * still had the old shape (continents, cities, asns, hosting_providers,
 * min_risk_score, which the handler refuses) and lacked high_risk_countries,
 * exclude_known_providers and threat_analysis, so a TypeScript caller could
 * not write the request the schema documents without a cast.
 *
 * Each snippet is type-checked with the project's compiler options against
 * the source in src/, from memory: ts-jest runs with isolatedModules and
 * checks no types itself.
 */

import path from 'node:path';
import * as ts from 'typescript';

const ROOT = process.cwd();

/**
 * The type errors of each snippet, all checked in one program as files in
 * src/ (one program for all of them keeps the test to one type-check)
 */
function typeErrors(sources: Record<string, string>): Record<string, string[]> {
  const files = new Map(
    Object.entries(sources).map(([name, source]) => [
      path.join(ROOT, 'src', `__geographic_filter_types_${name}__.ts`),
      source,
    ])
  );
  const config = ts.readConfigFile(
    path.join(ROOT, 'tsconfig.json'),
    ts.sys.readFile
  );
  const { options } = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    ROOT
  );
  const compilerOptions = { ...options, noEmit: true, noUnusedLocals: false };
  const host = ts.createCompilerHost(compilerOptions);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    const source = files.get(path.resolve(fileName));
    return source !== undefined
      ? ts.createSourceFile(fileName, source, languageVersion)
      : getSourceFile(fileName, languageVersion, ...rest);
  };
  const fileExists = host.fileExists.bind(host);
  host.fileExists = fileName =>
    files.has(path.resolve(fileName)) || fileExists(fileName);
  const program = ts.createProgram([...files.keys()], compilerOptions, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  return Object.fromEntries(
    Object.keys(sources).map(name => {
      const file = path.join(
        ROOT,
        'src',
        `__geographic_filter_types_${name}__.ts`
      );
      return [
        name,
        diagnostics
          .filter(diagnostic => diagnostic.file?.fileName === file)
          .map(diagnostic =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
          ),
      ];
    })
  );
}

const IMPORTS = `
import type { SearchFlowsArgs } from './tools/handlers/search.js';
import type { SearchParams } from './search/types.js';
import type { ToolArgs } from './tools/handlers/base.js';
import type { FlowGeographicFilters } from './utils/geographic-filters.js';
`;

const VALID = `${IMPORTS}
const filters = {
  countries: ['US', 'CN'],
  regions: ['GB'],
  exclude_vpn: false,
  exclude_cloud: false,
  high_risk_countries: false,
  exclude_known_providers: false,
  threat_analysis: false,
} as const;
export const args: SearchFlowsArgs = {
  query: 'protocol:tcp',
  limit: 10,
  geographic_filters: { ...filters, countries: ['US', 'CN'], regions: ['GB'] },
};
export const params: SearchParams = {
  query: 'protocol:tcp',
  geographic_filters: {
    countries: ['US'],
    regions: ['GB'],
    exclude_vpn: false,
    exclude_cloud: false,
    high_risk_countries: false,
    exclude_known_providers: false,
    threat_analysis: false,
  },
};
export const toolArgs: ToolArgs = { geographic_filters: { countries: ['US'] } };
export const bare: FlowGeographicFilters = {};
`;

const REFUSED: Array<[string, string]> = [
  ['continents', `{ continents: ['Asia'] }`],
  ['cities', `{ cities: ['Paris'] }`],
  ['asns', `{ asns: ['AS4134'] }`],
  ['hosting_providers', `{ hosting_providers: ['amazon'] }`],
  ['min_risk_score', `{ min_risk_score: 5 }`],
  ['exclude_vpn_true', `{ exclude_vpn: true }`],
];

const refusedSource = (value: string): string => `${IMPORTS}
export const args: SearchFlowsArgs = {
  query: 'protocol:tcp',
  limit: 10,
  geographic_filters: ${value},
};
export const params: SearchParams = {
  query: 'protocol:tcp',
  geographic_filters: ${value},
};
`;

let errors: Record<string, string[]>;

beforeAll(() => {
  errors = typeErrors({
    valid: VALID,
    ...Object.fromEntries(
      REFUSED.map(([name, value]) => [name, refusedSource(value)])
    ),
  });
}, 60000);

describe('geographic_filters types', () => {
  it('take every field the schema lists, with no cast', () => {
    expect(errors.valid).toEqual([]);
  });

  it.each(REFUSED)(
    'refuse %s in SearchFlowsArgs and SearchParams, as the handler does',
    name => {
      expect(errors[name]).toHaveLength(2);
    }
  );
});
