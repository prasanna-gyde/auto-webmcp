/**
 * log.ts: Debug logging, silent unless the config enables debug.
 */

let enabled = false;

export function setDebug(value: boolean): void {
  enabled = value;
}

export function debugLog(...args: unknown[]): void {
  if (enabled) console.log(...args);
}
