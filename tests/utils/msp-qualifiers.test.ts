/**
 * Legacy field names rewritten into MSP qualifiers before a query is sent
 * (issue #42 follow-up): the live API rejects blocked:, bytes: (flows) and
 * source_ip: (alarms).
 */

import { translateToMspQualifiers } from '../../src/utils/msp-qualifiers.js';

describe('translateToMspQualifiers', () => {
  it.each([
    ['blocked:true', 'status:blocked'],
    ['blocked:1', 'status:blocked'],
    ['blocked=true', 'status:blocked'],
    ['block:true', 'status:blocked'],
    ['blocked:false', '-status:blocked'],
    ['blocked:0', '-status:blocked'],
    ['-blocked:true', '-status:blocked'],
    ['-blocked:false', 'status:blocked'],
    ['(blocked:true OR region:CN)', '(status:blocked OR region:CN)'],
    ['protocol:tcp AND blocked:false', 'protocol:tcp AND -status:blocked'],
    ['bytes:>1MB', 'total:>1MB'],
    ['-bytes:<10KB AND bytes:>1KB', '-total:<10KB AND total:>1KB'],
    ['blocked:true AND bytes:>=1000000', 'status:blocked AND total:>=1000000'],
  ])('flows: %s -> %s', (query, expected) => {
    expect(translateToMspQualifiers(query, 'flows')).toBe(expected);
  });

  it.each([
    ['source_ip:192.168.*', 'device.ip:192.168.*'],
    ['type:1 AND source_ip:10.0.0.*', 'type:1 AND device.ip:10.0.0.*'],
  ])('alarms: %s -> %s', (query, expected) => {
    expect(translateToMspQualifiers(query, 'alarms')).toBe(expected);
  });

  it.each([
    ['flows', 'status:blocked AND total:>1MB'],
    ['flows', 'device.name:"blocked:true bytes:1"'],
    ['flows', 'unblocked:true'],
    ['flows', 'blocked:maybe'],
    ['flows', 'source_ip:192.168.*'],
    ['alarms', 'blocked:true'],
    ['alarms', 'device.source_ip:1'],
    ['rules', 'source_ip:192.168.*'],
  ])('%s: leaves %s unchanged', (entityType, query) => {
    expect(translateToMspQualifiers(query, entityType)).toBe(query);
  });
});
