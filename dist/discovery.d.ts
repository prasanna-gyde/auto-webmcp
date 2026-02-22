/**
 * discovery.ts — Form scanning & MutationObserver for SPA support
 */
import { ResolvedConfig } from './config.js';
export type FormLifecycleEvent = CustomEvent<{
    form: HTMLFormElement;
    toolName: string;
}>;
export declare function startDiscovery(config: ResolvedConfig): Promise<void>;
export declare function stopDiscovery(): void;
//# sourceMappingURL=discovery.d.ts.map