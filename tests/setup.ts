import dotenv from 'dotenv';

// Load test-specific environment variables
dotenv.config({ path: '.env.test' });

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Cleanup any global test resources
});

global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
};