/**
 * Wi-Fi and Access Point tool handlers
 */

import { BaseToolHandler, type ToolArgs, type ToolResponse } from './base.js';
import {
  BoxSelectionError,
  type FirewallaClient,
} from '../../firewalla/client.js';
import {
  ParameterValidator,
  ErrorType,
  createErrorResponse,
} from '../../validation/error-handler.js';
import { withToolTimeout } from '../../utils/timeout-manager.js';

/** Which box a Wi-Fi tool reads, as each tool's description says it */
const BOX_SELECTION =
  "Uses box, else FIREWALLA_BOX_ID or FIREWALLA_DEFAULT_BOX_ID, else the account's only box; refuses on a multi-box account with none of those.";

/**
 * A Wi-Fi tool's answer when its read fails: with no box named on a
 * multi-box account, a validation error that lists the boxes; otherwise an
 * API error.
 */
function readFailure(tool: string, what: string, error: unknown): ToolResponse {
  if (error instanceof BoxSelectionError) {
    return createErrorResponse(
      tool,
      `No box to read ${what} from`,
      ErrorType.VALIDATION_ERROR,
      undefined,
      [error.message]
    );
  }
  const errorMessage =
    error instanceof Error ? error.message : 'Unknown error occurred';
  return createErrorResponse(
    tool,
    `Failed to retrieve ${what}: ${errorMessage}`,
    ErrorType.API_ERROR,
    { error: String(error) }
  );
}

export class GetAccessPointsHandler extends BaseToolHandler {
  name = 'get_access_points';
  description = `Retrieve adopted Firewalla Access Points (AP7 / FWAP7CS / FWAP7DS) with hardware details, uplink port mapping, PoE status, Ethernet link speeds, and BSSIDs across 2.4G, 5G, and 6G radios (GET /v2/boxes/{gid}/wifi/access-points). ${BOX_SELECTION}`;
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
      // box goes into the request path: checked as given, not trimmed
      const boxValidation = ParameterValidator.validatePathSegment(
        args?.box,
        'box',
        { required: false }
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
      return readFailure(this.name, 'access points', error);
    }
  }
}

export class GetAccessPointChannelsHandler extends BaseToolHandler {
  name = 'get_access_point_channels';
  description = `Get active frequency channels and DFS radar states for an Access Point across 2.4G, 5G, and 6G bands (GET /v2/boxes/{gid}/wifi/access-points/{ap_id}/channels). ${BOX_SELECTION}`;
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
      // ap_id and box go into the request path: checked as given, not trimmed
      const apIdValidation = ParameterValidator.validatePathSegment(
        args?.ap_id,
        'ap_id'
      );
      const boxValidation = ParameterValidator.validatePathSegment(
        args?.box,
        'box',
        { required: false }
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
      return readFailure(this.name, 'access point channels', error);
    }
  }
}

export class GetWifiNetworksHandler extends BaseToolHandler {
  name = 'get_wifi_networks';
  description = `List configured Wi-Fi SSIDs, encryption standards (WPA2/WPA3), and broadcast frequency bands (GET /v2/boxes/{gid}/wifi/networks). ${BOX_SELECTION}`;
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
      // box goes into the request path: checked as given, not trimmed
      const boxValidation = ParameterValidator.validatePathSegment(
        args?.box,
        'box',
        { required: false }
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
      return readFailure(this.name, 'Wi-Fi networks', error);
    }
  }
}

export class GetWifiSettingsHandler extends BaseToolHandler {
  name = 'get_wifi_settings';
  description = `Get Firewalla Wi-Fi Controller settings including client auto-steering and controller version (GET /v2/boxes/{gid}/wifi/settings). ${BOX_SELECTION}`;
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
      // box goes into the request path: checked as given, not trimmed
      const boxValidation = ParameterValidator.validatePathSegment(
        args?.box,
        'box',
        { required: false }
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
      return readFailure(this.name, 'Wi-Fi settings', error);
    }
  }
}
