/**
 * OpenAI Client Helper
 * 
 * Provides OpenAI client with support for:
 * - Official OpenAI API
 * - Third-party relay/proxy services
 */

import OpenAI from "openai";

/**
 * Normalize base URL by removing trailing slashes and /embeddings suffix
 */
export function normalizeOpenAIBaseURL(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  u = u.replace(/\/embeddings$/i, "");
  return u;
}

/**
 * Resolve OpenAI-compatible API base URL:
 * - Official: leave unset, use SDK default
 * - Relay: use OPENAI_RELAY_BASE_URL (priority) or OPENAI_BASE_URL
 * 
 * Example: `https://yunwu.ai/v1` (do NOT include /embeddings suffix)
 */
export function resolveOpenAICompatBaseURL(): string | undefined {
  const relay = process.env.OPENAI_RELAY_BASE_URL?.trim();
  const legacy = process.env.OPENAI_BASE_URL?.trim();
  const raw = relay || legacy;
  if (!raw) {
    return undefined;
  }
  return normalizeOpenAIBaseURL(raw);
}

/**
 * Get OpenAI client instance
 * Uses OPENAI_API_KEY environment variable
 */
export function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Please set OPENAI_API_KEY environment variable");
  }
  const baseURL = resolveOpenAICompatBaseURL();
  return new OpenAI({
    apiKey: key,
    ...(baseURL ? { baseURL } : {}),
  });
}
