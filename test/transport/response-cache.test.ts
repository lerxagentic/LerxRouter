import { describe, it, expect, beforeEach } from "bun:test";
import { ResponseCache, globalResponseCache } from "../../src/transport/cache/response-cache";

describe("ResponseCache", () => {
  const sampleBody = {
    model: "openai/gpt-4o",
    messages: [{ role: "user", content: "hello" }],
    temperature: 0,
  };
  const sampleScope = {
    tenantId: "tenant-a",
    apiKeyId: "key-a",
    routeFingerprint: "route-a",
  };

  beforeEach(() => {
    globalResponseCache.clear();
  });

  it("builds a stable key regardless of property order", () => {
    const key1 = ResponseCache.buildCacheKey(sampleBody, sampleScope);
    const key2 = ResponseCache.buildCacheKey({
      temperature: 0,
      messages: [{ role: "user", content: "hello" }],
      model: "openai/gpt-4o",
    }, sampleScope);
    expect(key1).not.toBeNull();
    expect(key1).toBe(key2);
  });

  it("produces different keys when any generation parameter changes", () => {
    const key1 = ResponseCache.buildCacheKey(sampleBody, sampleScope);
    const key2 = ResponseCache.buildCacheKey({ ...sampleBody, max_tokens: 100 }, sampleScope);
    const key3 = ResponseCache.buildCacheKey({
      ...sampleBody,
      messages: [{ role: "user", content: "different" }],
    }, sampleScope);
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it("refuses streaming, tool calls, and malformed requests", () => {
    expect(ResponseCache.buildCacheKey({ ...sampleBody, stream: true }, sampleScope)).toBeNull();
    expect(ResponseCache.buildCacheKey({ ...sampleBody, tools: [{ name: "fn" }] }, sampleScope)).toBeNull();
    expect(ResponseCache.buildCacheKey({ ...sampleBody, tool_choice: "auto" }, sampleScope)).toBeNull();
    expect(ResponseCache.buildCacheKey({ ...sampleBody, functions: [] }, sampleScope)).toBeNull();
    expect(ResponseCache.buildCacheKey(null, sampleScope)).toBeNull();
    expect(ResponseCache.buildCacheKey({ model: "x" }, sampleScope)).toBeNull();
    expect(ResponseCache.buildCacheKey(sampleBody, { ...sampleScope, apiKeyId: "" })).toBeNull();
  });

  it("does not cache stochastic or unspecified-temperature requests", () => {
    expect(ResponseCache.buildCacheKey({ ...sampleBody, temperature: 0.7 }, sampleScope)).toBeNull();
    expect(ResponseCache.buildCacheKey({ ...sampleBody, temperature: undefined }, sampleScope)).toBeNull();
  });

  it("isolates cached responses by tenant, API key, route, and end-user metadata", () => {
    const base = ResponseCache.buildCacheKey({ ...sampleBody, user: "end-user-a" }, sampleScope);
    expect(base).not.toBeNull();
    expect(ResponseCache.buildCacheKey({ ...sampleBody, user: "end-user-a" }, { ...sampleScope, tenantId: "tenant-b" })).not.toBe(base);
    expect(ResponseCache.buildCacheKey({ ...sampleBody, user: "end-user-a" }, { ...sampleScope, apiKeyId: "key-b" })).not.toBe(base);
    expect(ResponseCache.buildCacheKey({ ...sampleBody, user: "end-user-a" }, { ...sampleScope, routeFingerprint: "route-b" })).not.toBe(base);
    expect(ResponseCache.buildCacheKey({ ...sampleBody, user: "end-user-b" }, sampleScope)).not.toBe(base);
  });

  it("stores, retrieves, and expires items correctly", async () => {
    const cache = new ResponseCache();
    const key = ResponseCache.buildCacheKey(sampleBody, sampleScope)!;
    const bytes = new TextEncoder().encode('{"id":"chatcmpl-1","choices":[{"message":{"content":"Hi"}}]}');

    cache.put(key, bytes, "application/json", 1);
    const hit = cache.get(key);
    expect(hit).not.toBeNull();
    expect(new TextDecoder().decode(hit!.bytes)).toContain("chatcmpl-1");
    expect(cache.getStats().hits).toBe(1);

    await Bun.sleep(1100);
    const expired = cache.get(key);
    expect(expired).toBeNull();
    expect(cache.getStats().misses).toBe(1);
  });
});
