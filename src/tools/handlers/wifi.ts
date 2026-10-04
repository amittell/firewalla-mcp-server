/**
 * Wi-Fi and Access Point tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import type { FirewallaClient } from '../../firewalla/client.js';
import {
  ParameterValidator,
  ErrorType,
} from '../../validation/error-handler.js';
import { withToolTimeout } from '../../utils/timeout-manager.js';

export class GetAccessPointsHandler extends BaseToolHandler {
  name = 'get_access_points';
  description =
    'Retrieve adopted Firewalla Access Points (AP7 / FWAP7CS / FWAP7DS) with hardware details, uplink port mapping, PoE status, Ethernet link speeds, and BSSIDs across 2.4G, 5G, and 6G radios (GET /v2/boxes/{gid}/wifi/access-points). Scoped to box when provided, else FIREWALLA_BOX_ID.';
  category = 'network' as const;

  constructor() {
    super({
      enableGeoEnrichment: false,
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'wifi_access_points',
        entity_type: 'access_points',
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const boxValidation = ParameterValidator.validateOptionalString(
        args?.box,
        'box'
      );
      if (!boxValidation.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          boxValidation.errors
        );
      }

      const box = boxValidation.sanitizedValue as string | undefined;
      const startTime = Date.now();
      const aps = await withToolTimeout(
        async () => firewalla.getAccessPoints(box),
        this.name
      );

      return this.createUnifiedResponse(
        {
          total_access_points: aps.length,
          access_points: aps,
        },
        { executionTimeMs: Date.now() - startTime }
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to retrieve access points: ${errorMessage}`,
        ErrorType.API_ERROR,
        { error: String(error) }
      );
    }
  }
}

export class GetAccessPointChannelsHandler extends BaseToolHandler {
  name = 'get_access_point_channels';
  description =
    'Get active frequency channels and DFS radar states for an Access Point across 2.4G, 5G, and 6G bands (GET /v2/boxes/{gid}/wifi/access-points/{ap_id}/channels).';
  category = 'network' as const;

  constructor() {
    super({
      enableGeoEnrichment: false,
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'wifi_channels',
        entity_type: 'ap_channels',
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const apIdValidation = ParameterValidator.validateRequiredString(
        args?.ap_id,
        'ap_id'
      );
      const boxValidation = ParameterValidator.validateOptionalString(
        args?.box,
        'box'
      );

      if (!apIdValidation.isValid || !boxValidation.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          [...apIdValidation.errors, ...boxValidation.errors]
        );
      }

      const apId = apIdValidation.sanitizedValue as string;
      const box = boxValidation.sanitizedValue as string | undefined;
      const startTime = Date.now();

      const channels = await withToolTimeout(
        async () => firewalla.getAccessPointChannels(apId, box),
        this.name
      );

      return this.createUnifiedResponse(
        {
          ap_id: apId,
          channels,
        },
        { executionTimeMs: Date.now() - startTime }
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to retrieve access point channels: ${errorMessage}`,
        ErrorType.API_ERROR,
        { error: String(error) }
      );
    }
  }
}

export class GetWifiNetworksHandler extends BaseToolHandler {
  name = 'get_wifi_networks';
  description =
    'List configured Wi-Fi SSIDs, encryption standards (WPA2/WPA3), and broadcast frequency bands (GET /v2/boxes/{gid}/wifi/networks). Scoped to box when provided, else FIREWALLA_BOX_ID.';
  category = 'network' as const;

  constructor() {
    super({
      enableGeoEnrichment: false,
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'wifi_networks',
        entity_type: 'wireless_networks',
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const boxValidation = ParameterValidator.validateOptionalString(
        args?.box,
        'box'
      );
      if (!boxValidation.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          boxValidation.errors
        );
      }

      const box = boxValidation.sanitizedValue as string | undefined;
      const startTime = Date.now();
      const networks = await withToolTimeout(
        async () => firewalla.getWifiNetworks(box),
        this.name
      );

      return this.createUnifiedResponse(
        {
          total_networks: networks.length,
          networks,
        },
        { executionTimeMs: Date.now() - startTime }
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to retrieve Wi-Fi networks: ${errorMessage}`,
        ErrorType.API_ERROR,
        { error: String(error) }
      );
    }
  }
}

export class GetWifiSettingsHandler extends BaseToolHandler {
  name = 'get_wifi_settings';
  description =
    'Get Firewalla Wi-Fi Controller settings including client auto-steering and controller version (GET /v2/boxes/{gid}/wifi/settings). Scoped to box when provided, else FIREWALLA_BOX_ID.';
  category = 'network' as const;

  constructor() {
    super({
      enableGeoEnrichment: false,
      enableFieldNormalization: true,
      additionalMeta: {
        data_source: 'wifi_settings',
        entity_type: 'wireless_controller',
        standardization_version: '2.0.0',
      },
    });
  }

  async execute(
    args: ToolArgs,
    firewalla: FirewallaClient
  ): Promise<ToolResponse> {
    try {
      const boxValidation = ParameterValidator.validateOptionalString(
        args?.box,
        'box'
      );
      if (!boxValidation.isValid) {
        return this.createErrorResponse(
          'Parameter validation failed',
          ErrorType.VALIDATION_ERROR,
          undefined,
          boxValidation.errors
        );
      }

      const box = boxValidation.sanitizedValue as string | undefined;
      const startTime = Date.now();
      const settings = await withToolTimeout(
        async () => firewalla.getWifiSettings(box),
        this.name
      );

      return this.createUnifiedResponse(
        {
          settings,
        },
        { executionTimeMs: Date.now() - startTime }
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return this.createErrorResponse(
        `Failed to retrieve Wi-Fi settings: ${errorMessage}`,
        ErrorType.API_ERROR,
        { error: String(error) }
      );
    }
  }
}
