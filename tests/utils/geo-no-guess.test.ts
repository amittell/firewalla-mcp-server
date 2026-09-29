/**
 * An address the geoip-lite lookup has no data for gets no geographic data:
 * no country is made up for it. When the lookup came back empty, both
 * enrichment paths guessed one: from a table of address prefixes (46. was
 * Germany, 185. the United Kingdom, 202. China, 8.8. Google in the United
 * States) and then from the first octet (1-191 the United States, 192-223
 * the United Kingdom, anything else the United States). geoip-lite is
 * mocked to know only the address in KNOWN, so every other answer comes
 * from those fallbacks.
 */

import {
  GeographicCache,
  enrichObjectWithGeo,
  getEnhancedGeographicDataForIP,
} from '../../src/utils/geographic.js';
import { GeographicEnrichmentPipeline } from '../../src/utils/geographic-enrichment-pipeline.js';

jest.mock('geoip-lite', () => {
  // A documentation address the lookup knows, as a positive control
  const mockKnown: Record<string, unknown> = {
    '203.0.113.9': {
      country: 'SE',
      region: 'AB',
      city: 'Stockholm',
      timezone: 'Europe/Stockholm',
    },
  };
  const lookup = (ip: string) => mockKnown[ip] ?? null;
  return { __esModule: true, default: { lookup }, lookup };
});

/** Addresses the lookup does not know, and what each was guessed to be */
const UNKNOWN = [
  ['8.8.8.8', 'US from the 8.8. prefix'],
  ['192.0.2.5', 'GB from first octet 192'],
  ['198.51.100.7', 'GB from first octet 198'],
  ['203.0.113.200', 'GB from first octet 203'],
  ['240.0.0.1', 'US, the default for any other first octet'],
];

describe('getEnhancedGeographicDataForIP', () => {
  it.each(UNKNOWN)('gives %s no country (it was %s)', ip => {
    expect(getEnhancedGeographicDataForIP(ip)).toBeNull();
  });

  it('gives an address the lookup knows its country', () => {
    expect(getEnhancedGeographicDataForIP('203.0.113.9')).toMatchObject({
      country_code: 'SE',
      city: 'Stockholm',
    });
  });
});

describe('enrichObjectWithGeo', () => {
  it('sets the geo field to null for an address the lookup does not know', () => {
    expect(
      enrichObjectWithGeo({
        source_ip: '198.51.100.7',
        destination_ip: '203.0.113.9',
      })
    ).toMatchObject({
      source_ip_geo: null,
      destination_ip_geo: { country_code: 'SE' },
    });
  });
});

describe('the enrichment pipeline', () => {
  const pipeline = () =>
    new GeographicEnrichmentPipeline(new GeographicCache());

  it.each(UNKNOWN)('has no data for %s (it was %s)', async ip => {
    const result = await pipeline().enrichIP(ip);
    expect(result.data).toBeNull();
    expect(result.success).toBe(false);
  });

  it('adds no geo field for an address the lookup does not know', async () => {
    const enriched = await pipeline().enrichObject({
      source_ip: '198.51.100.7',
      destination_ip: '203.0.113.9',
    });
    expect(enriched).not.toHaveProperty('source_ip_geo');
    expect((enriched as any).destination_ip_geo).toMatchObject({
      country_code: 'SE',
    });
  });

  it('remembers an address the lookup does not know as unknown', async () => {
    const cache = new GeographicCache();
    const first = new GeographicEnrichmentPipeline(cache);
    await first.enrichIP('240.0.0.1');
    const again = await new GeographicEnrichmentPipeline(cache).enrichIP(
      '240.0.0.1'
    );
    expect([again.source, again.data, again.success]).toEqual([
      'cache',
      null,
      false,
    ]);
  });
});
