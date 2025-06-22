import dotenv from 'dotenv';
import { FirewallaConfig } from '../types';

dotenv.config();

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export function getConfig(): FirewallaConfig {
  return {
    mspToken: getRequiredEnvVar('FIREWALLA_MSP_TOKEN'),
    mspId: getRequiredEnvVar('FIREWALLA_MSP_ID'),
    boxId: getRequiredEnvVar('FIREWALLA_BOX_ID'),
    apiTimeout: parseInt(getOptionalEnvVar('API_TIMEOUT', '30000'), 10),
    rateLimit: parseInt(getOptionalEnvVar('API_RATE_LIMIT', '100'), 10),
    cacheTtl: parseInt(getOptionalEnvVar('CACHE_TTL', '300'), 10),
  };
}

export const config = getConfig();