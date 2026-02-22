/**
 * enhancer.ts — Optional LLM-based description enrichment
 *
 * Calls a small LLM to generate richer tool descriptions than heuristics
 * alone can provide. Activated only when config.enhance is set.
 */
import { ToolMetadata } from './analyzer.js';
import { EnhancerConfig } from './config.js';
export declare function enrichMetadata(metadata: ToolMetadata, enhancer: EnhancerConfig): Promise<ToolMetadata>;
//# sourceMappingURL=enhancer.d.ts.map