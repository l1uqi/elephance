/**
 * Embedding Module Tests
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { setEmbeddingProvider, getEmbeddingProvider, configureEmbedding, getEmbeddingModel, embedText, embedTexts } from "../packages/core/src/embedding.js";

// Mock embedding provider for testing
class MockEmbeddingProvider {
  private vectors: Map<string, number[]> = new Map();
  private callCount = 0;

  register(text: string, vector: number[]) {
    this.vectors.set(text, vector);
  }

  async embed(text: string): Promise<number[]> {
    this.callCount++;
    return this.vectors.get(text) || [0.1, 0.2, 0.3];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    this.callCount++;
    return texts.map(t => this.vectors.get(t) || [0.1, 0.2, 0.3]);
  }

  getCallCount() {
    return this.callCount;
  }
}

describe("Embedding Module", () => {
  let mockProvider: MockEmbeddingProvider;

  beforeEach(() => {
    mockProvider = new MockEmbeddingProvider();
    mockProvider.register("hello", [0.1, 0.2, 0.3]);
    mockProvider.register("world", [0.4, 0.5, 0.6]);
  });

  describe("setEmbeddingProvider", () => {
    it("should set custom provider", () => {
      setEmbeddingProvider(mockProvider);
      const provider = getEmbeddingProvider();
      expect(provider).toBe(mockProvider);
    });
  });

  describe("configureEmbedding", () => {
    it("should set embedding model", () => {
      configureEmbedding({ model: "text-embedding-ada-002" });
      const model = getEmbeddingModel();
      expect(model).toBe("text-embedding-ada-002");
    });

    it("should use default model when not provided", () => {
      configureEmbedding({});
      const model = getEmbeddingModel();
      expect(model).toBe("text-embedding-3-small");
    });

    it("should set provider when provided", () => {
      configureEmbedding({ provider: mockProvider });
      const provider = getEmbeddingProvider();
      expect(provider).toBe(mockProvider);
    });
  });

  describe("getEmbeddingModel", () => {
    it("should return current model", () => {
      configureEmbedding({ model: "custom-model" });
      const model = getEmbeddingModel();
      expect(model).toBe("custom-model");
    });
  });
});
