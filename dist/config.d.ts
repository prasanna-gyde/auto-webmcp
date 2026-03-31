/**
 * config.ts — User configuration merging & defaults
 */
export interface FormOverride {
    name?: string;
    description?: string;
}
export interface AutoWebMCPConfig {
    /**
     * CSS selectors for forms to skip. E.g. ['#login-form', '[data-no-webmcp]']
     */
    exclude?: string[];
    /**
     * If true, agent-invoked forms are auto-submitted without human confirmation.
     * Default: false
     */
    autoSubmit?: boolean;
    /**
     * How to handle forms that already use native declarative WebMCP attributes.
     * - skip: do not imperatively register forms with toolname
     * - augment: reserved for future metadata-only enhancement (currently behaves like skip)
     * - force: always register imperatively even when toolname exists
     * Default: skip
     */
    declarativeMode?: 'skip' | 'augment' | 'force';
    /**
     * Parameter binding behavior for execute() input keys.
     */
    paramBinding?: {
        /**
         * If true, resolve semantically similar parameter keys to schema keys.
         * Default: true
         */
        enableAliasResolution?: boolean;
        /**
         * If true, only exact schema keys are accepted (disables alias resolution).
         * Default: false
         */
        strict?: boolean;
    };
    /**
     * Execution behavior controls.
     */
    execution?: {
        /**
         * Max time to wait for submit/result before returning a deterministic timeout state.
         * Default: 15000
         */
        timeoutMs?: number;
    };
    /**
     * Per-form name/description overrides keyed by CSS selector.
     */
    overrides?: Record<string, FormOverride>;
    /**
     * Log registered tools to console on init. Default: false
     */
    debug?: boolean;
}
export interface ResolvedConfig {
    exclude: string[];
    autoSubmit: boolean;
    declarativeMode: 'skip' | 'augment' | 'force';
    paramBinding: {
        enableAliasResolution: boolean;
        strict: boolean;
    };
    execution: {
        timeoutMs: number;
    };
    overrides: Record<string, FormOverride>;
    debug: boolean;
}
export declare function resolveConfig(userConfig?: AutoWebMCPConfig): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map