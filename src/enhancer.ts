/**
 * enhancer.ts — Optional LLM-based description enrichment
 *
 * Calls a small LLM to generate richer tool descriptions than heuristics
 * alone can provide. Activated only when config.enhance is set.
 */

import { ToolMetadata } from './analyzer.js';
import { EnhancerConfig } from './config.js';

export async function enrichMetadata(
  metadata: ToolMetadata,
  enhancer: EnhancerConfig,
): Promise<ToolMetadata> {
  try {
    const enriched = await callLLM(metadata, enhancer);
    return { ...metadata, description: enriched };
  } catch (err) {
    // Enhancement is optional — fall back to heuristic description
    console.warn('[auto-webmcp] Enrichment failed, using heuristic description:', err);
    return metadata;
  }
}

async function callLLM(metadata: ToolMetadata, config: EnhancerConfig): Promise<string> {
  const prompt = buildPrompt(metadata);

  if (config.provider === 'claude') {
    return callClaude(prompt, config);
  } else {
    return callGemini(prompt, config);
  }
}

function buildPrompt(metadata: ToolMetadata): string {
  const fields = Object.entries(metadata.inputSchema.properties)
    .map(([name, prop]) => `- ${prop.title ?? name} (${prop.type}): ${prop.description ?? ''}`)
    .join('\n');

  return `You are helping describe a web form as an AI tool. Given this form information:

Name: ${metadata.name}
Current description: ${metadata.description}
Fields:
${fields}

Write a concise (1-2 sentence) description of what this tool does and when an AI agent should use it. Be specific and actionable. Respond with only the description, no preamble.`;
}

async function callClaude(prompt: string, config: EnhancerConfig): Promise<string> {
  const model = config.model ?? 'claude-haiku-4-5-20251001';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
  };

  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

async function callGemini(prompt: string, config: EnhancerConfig): Promise<string> {
  const model = config.model ?? 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 150, temperature: 0.2 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json() as {
    candidates: Array<{
      content: { parts: Array<{ text: string }> };
    }>;
  };

  return data.candidates[0]?.content.parts.map((p) => p.text).join('').trim() ?? '';
}
