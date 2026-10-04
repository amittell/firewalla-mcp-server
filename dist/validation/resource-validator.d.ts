/**
 * The "resource not found" answer the rule tools give (see
 * createResourceNotFoundResponse)
 */
/**
 * Resource types that can be validated
 */
export type ResourceType = 'rule' | 'alarm' | 'device' | 'target_list' | 'box' | 'flow';
/**
 * Resource existence check result
 */
export interface ResourceExistenceResult {
    exists: boolean;
    resourceId: string;
    resourceType: ResourceType;
    error?: string;
    metadata?: Record<string, unknown>;
}
/** The not-found answer of a tool whose resource does not exist */
export declare class ResourceValidator {
    /**
     * Create standardized "resource not found" error response
     */
    static createResourceNotFoundResponse(toolName: string, resourceType: ResourceType, resourceId: string, existenceCheck?: ResourceExistenceResult): {
        content: Array<{
            type: string;
            text: string;
        }>;
        isError: true;
    };
}
//# sourceMappingURL=resource-validator.d.ts.map