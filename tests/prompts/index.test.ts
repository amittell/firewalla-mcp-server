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

  it('should register GetPromptRequestSchema handler', () => {
    setupPrompts(mockServer, mockFirewalla);
    
    expect(mockSetRequestHandler).toHaveBeenCalledTimes(1);
    expect(mockSetRequestHandler).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should be defined and exportable', () => {
    expect(setupPrompts).toBeDefined();
    expect(typeof setupPrompts).toBe('function');
  });
});