import { setupResources } from '../../src/resources/index';
import { FirewallaClient } from '../../src/firewalla/client';

// Mock the FirewallaClient
jest.mock('../../src/firewalla/client');
const MockedFirewallaClient = FirewallaClient as jest.MockedClass<typeof FirewallaClient>;

// Mock Server to capture handler registration
const mockSetRequestHandler = jest.fn();
const mockServer = {
  setRequestHandler: mockSetRequestHandler,
} as any;

describe('MCP Resources Setup', () => {
  let mockFirewalla: jest.Mocked<FirewallaClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFirewalla = new MockedFirewallaClient({} as any) as jest.Mocked<FirewallaClient>;
  });

  it('should register ReadResourceRequestSchema handler', () => {
    setupResources(mockServer, mockFirewalla);
    
    expect(mockSetRequestHandler).toHaveBeenCalledTimes(1);
    expect(mockSetRequestHandler).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('should be defined and exportable', () => {
    expect(setupResources).toBeDefined();
    expect(typeof setupResources).toBe('function');
  });
});