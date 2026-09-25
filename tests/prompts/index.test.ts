import { setupPrompts } from '../../src/prompts/index';
import { FirewallaClient } from '../../src/firewalla/client';

// Mock the FirewallaClient
jest.mock('../../src/firewalla/client');
const MockedFirewallaClient = FirewallaClient as jest.MockedClass<typeof FirewallaClient>;

// Mock Server to capture handler registration
const mockSetRequestHandler = jest.fn();
const mockServer = {
  setRequestHandler: mockSetRequestHandler,
} as any;

describe('MCP Prompts Setup', () => {
  let mockFirewalla: jest.Mocked<FirewallaClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFirewalla = new MockedFirewallaClient({} as any) as jest.Mocked<FirewallaClient>;
  });

  it('should register ListPrompts and GetPrompt handlers', () => {
    setupPrompts(mockServer, mockFirewalla);

    // list + get (clients call prompts/list at startup; see v1.3.0)
    expect(mockSetRequestHandler).toHaveBeenCalledTimes(2);
    expect(mockSetRequestHandler).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('threat_analysis lists recent active alarms, not a severity search', async () => {
    mockFirewalla.getActiveAlarms.mockResolvedValue({
      count: 1,
      results: [
        { type: 1, message: 'Suspicious activity', ts: 1789600000 },
      ],
    } as any);
    mockFirewalla.getRecentThreats.mockResolvedValue([]);
    mockFirewalla.getNetworkRules.mockResolvedValue({
      count: 0,
      results: [],
    } as any);
    setupPrompts(mockServer, mockFirewalla);
    const [listHandler, getHandler] = mockSetRequestHandler.mock.calls.map(
      call => call[1]
    );

    const result = await getHandler({
      params: {
        name: 'threat_analysis',
        arguments: { period: '24h', severity_threshold: 'high' },
      },
    });

    // /v2/alarms returns archived alarms too unless the query names a
    // status, and alarms carry no severity (the old call sent 'medium' as a
    // free-text query)
    expect(mockFirewalla.getActiveAlarms).toHaveBeenCalledWith(
      'status:1',
      undefined,
      'ts:desc',
      50
    );
    const text = result.messages[0].content.text as string;
    expect(text).toContain('**Active Alarms (the 1 most recent):**');
    expect(text).not.toMatch(/severity/i);

    const { prompts } = await listHandler();
    const threat = prompts.find((p: any) => p.name === 'threat_analysis');
    expect(threat.arguments.map((a: any) => a.name)).toEqual(['period']);
  });

  it('should be defined and exportable', () => {
    expect(setupPrompts).toBeDefined();
    expect(typeof setupPrompts).toBe('function');
  });
});