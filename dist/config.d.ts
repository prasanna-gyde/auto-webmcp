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
    overrides: Record<string, FormOverride>;
    debug: boolean;
}
export declare function resolveConfig(userConfig?: AutoWebMCPConfig): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map