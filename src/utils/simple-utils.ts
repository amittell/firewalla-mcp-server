/**
 * Simple utility functions replacing over-engineered Manager classes
 */

/**
 * Simple pagination - just limit results and track if there are more
 */
export function paginateResults<T>(
  results: T[], 
  limit: number, 
  cursor?: string
): { 
  data: T[]; 
  hasMore: boolean; 
  nextCursor?: string; 
  count: number 
} {
  // For simplicity, treat cursor as offset
  const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
  const startIndex = Math.max(0, offset);
  const endIndex = startIndex + limit;
  
  const data = results.slice(startIndex, endIndex);
  const hasMore = endIndex < results.length;
  const nextCursor = hasMore ? String(endIndex) : undefined;
  
  return {
    data,
    hasMore,
    nextCursor,
    count: data.length
  };
}

/**
 * Simple timeout wrapper for promises
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    )
  ]);
}

/**
 * Simple retry mechanism
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error = new Error('Unknown error');
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  
  throw lastError;
}

/**
 * Simple streaming helper - process items in chunks
 */
export async function processInChunks<T, R>(
  items: T[],
  processor: (chunk: T[]) => Promise<R[]>,
  chunkSize: number = 100
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await processor(chunk);
    results.push(...chunkResults);
  }
  
  return results;
}

/**
 * Simple bulk operation helper
 */
export async function executeBulkOperation<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  batchSize: number = 10
): Promise<{ successes: R[]; failures: Array<{ item: T; error: Error }> }> {
  const successes: R[] = [];
  const failures: Array<{ item: T; error: Error }> = [];
  
  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const promises = batch.map(async (item) => {
      try {
        const result = await operation(item);
        successes.push(result);
      } catch (error) {
        failures.push({ 
          item, 
          error: error instanceof Error ? error : new Error(String(error)) 
        });
      }
    });
    
    await Promise.all(promises);
  }
  
  return { successes, failures };
}

/**
 * Simple response formatting
 */
export function formatResponse<T>(
  data: T,
  meta?: Record<string, any>
): { data: T; meta?: Record<string, any> } {
  return meta ? { data, meta } : { data };
}

/**
 * Simple error formatting
 */
export function formatError(
  message: string,
  tool?: string,
  details?: string[]
): {
  error: boolean;
  message: string;
  tool?: string;
  validation_errors?: string[];
} {
  return {
    error: true,
    message,
    ...(tool && { tool }),
    ...(details && { validation_errors: details })
  };
}