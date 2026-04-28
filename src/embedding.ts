/**
 * Embedding Module
 * 
 * Provides text-to-vector conversion with pluggable embedding providers.
 * Supports OpenAI and custom providers.
 */

import { getOpenAI } from "./openai.js";
import type { EmbeddingProvider, EmbeddingOptions } from "./types.js";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

function resolveDefaultEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

let currentProvider: EmbeddingProvider | null = null;
let currentProviderIsDefault = false;
let currentModel: string = resolveDefaultEmbeddingModel();

/**
 * Set a custom embedding provider
 * Use this to plug in different embedding backends (OpenAI, Azure, Cohere, etc.)
 */
export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  currentProvider = provider;
  currentProviderIsDefault = false;
}

/**
 * Get the current embedding provider
 */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  return currentProvider;
}

/**
 * Configure the default OpenAI embedding
 */
export function configureEmbedding(options: EmbeddingOptions = {}): void {
  const nextModel = options.model?.trim() || resolveDefaultEmbeddingModel();
  const modelChanged = nextModel !== currentModel;
  currentModel = nextModel;
  if (options.provider) {
    currentProvider = options.provider;
    currentProviderIsDefault = false;
  } else if (modelChanged && currentProviderIsDefault) {
    currentProvider = new OpenAIEmbeddingProvider(currentModel);
  }
}

/**
 * Get the current embedding model
 */
export function getEmbeddingModel(): string {
  return currentModel;
}

/**
 * Default OpenAI embedding provider
 */
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private model: string;

  constructor(model: string = DEFAULT_EMBEDDING_MODEL) {
    this.model = model;
  }

  async embed(text: string): Promise<number[]> {
    const openai = getOpenAI();
    const res = await openai.embeddings.create({
      model: this.model,
      input: text,
    });
    const v = res.data[0]?.embedding;
    if (!v) {
      throw new Error("OpenAI did not return embedding");
    }
    return v;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const openai = getOpenAI();
    const res = await openai.embeddings.create({
      model: this.model,
      input: texts,
    });
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    return sorted.map((d) => {
      const v = d.embedding;
      if (!v) {
        throw new Error("OpenAI did not return embedding");
      }
      return v;
    });
  }
}

/**
 * Get or create the default embedding provider
 * Uses OpenAI if no custom provider is set
 */
function getOrCreateProvider(): EmbeddingProvider {
  if (!currentProvider) {
    currentProvider = new OpenAIEmbeddingProvider(currentModel);
    currentProviderIsDefault = true;
  }
  return currentProvider;
}

/**
 * Embed a single text into a vector
 */
export async function embedText(text: string): Promise<number[]> {
  const provider = getOrCreateProvider();
  return provider.embed(text);
}

/**
 * Embed multiple texts into vectors (order preserved)
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const provider = getOrCreateProvider();
  return provider.embedBatch(texts);
}

// Re-export types
export type { EmbeddingProvider, EmbeddingOptions } from "./types.js";
