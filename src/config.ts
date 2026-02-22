/**
 * config.ts — User configuration merging & defaults
 */

export interface EnhancerConfig {
  provider: 'gemini' | 'claude';
  apiKey: string;
  model?: string;
}

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
   * Optional AI enrichment for richer tool descriptions.
   */
  enhance?: EnhancerConfig;

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
  enhance: EnhancerConfig | null;
  overrides: Record<string, FormOverride>;
  debug: boolean;
}

export function resolveConfig(userConfig?: AutoWebMCPConfig): ResolvedConfig {
  return {
    exclude: userConfig?.exclude ?? [],
    autoSubmit: userConfig?.autoSubmit ?? false,
    enhance: userConfig?.enhance ?? null,
    overrides: userConfig?.overrides ?? {},
    debug: userConfig?.debug ?? false,
  };
}
