/**
 * Field Mapping Utilities for Cross-Reference Searches
 * Handles field compatibility between different Firewalla data types
 */
/**
 * Interface for entities that can be used in field mapping and correlation
 */
export type MappableEntity = Record<string, unknown>;
/**
 * Type for field values that can be used in correlations
 */
export type FieldValue = string | number | boolean | null | undefined;
export type EntityType = 'flows' | 'alarms' | 'rules' | 'devices' | 'target_lists';
/**
 * Field mapping configuration for each entity type
 */
export declare const FIELD_MAPPINGS: Record<EntityType, Record<string, string[]>>;
/**
 * Retrieves the value of a specified field from an entity object of a given type, using mapped field paths when available.
 *
 * If the field has mapped paths for the entity type, attempts each path in order and returns the first non-null, non-undefined value found. Falls back to direct field access if no mapping exists.
 *
 * @param entity - The entity object to extract the field value from
 * @param field - The standardized field name to retrieve
 * @param entityType - The type of the entity, used to determine field mappings
 * @returns The value of the field if found, otherwise `undefined`
 */
/**
 * Extracts the value of a field from an entity using entity-specific field mappings
 *
 * @param entity - The entity object to extract the field value from
 * @param field - The logical field name to extract
 * @param entityType - The type of entity to determine the correct field mapping
 * @returns The extracted field value, or undefined if not found
 */
export declare function getFieldValue(entity: MappableEntity, field: string, entityType: EntityType): FieldValue;
//# sourceMappingURL=field-mapper.d.ts.map