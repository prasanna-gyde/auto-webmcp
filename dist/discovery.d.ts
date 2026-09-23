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
/** Unregister every orphan (form-less) tool registered by discovery. */
export declare function unregisterOrphanTools(): Promise<void>;
//# sourceMappingURL=discovery.d.ts.map