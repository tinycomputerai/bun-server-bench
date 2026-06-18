import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

let server: RunningServer | undefined;

async function ingress(base: string, headers?: Record<string, string>) {
  return fetch(`${base}/ingress`, { method: "POST", headers });
}

describe("trace context hidden", () => {
  beforeAll(async () => {
    server = await startTaskServer();
  });
  afterAll(async () => {
    await server?.stop();
  });

  test("child spans reference immediate parent", async () => {
    if (!server) throw new Error("no server");
    const res = await ingress(server.baseUrl);
    const { trace_id } = await res.json();
    const trace = await (await fetch(`${server.baseUrl}/trace/${trace_id}`)).json();
    const byId = new Map(trace.spans.map((s: { span_id: string }) => [s.span_id, s]));
    const nested = trace.spans.find((s: { name: string }) => s.name === "downstream-a-nested");
    expect(nested).toBeTruthy();
    const parent = byId.get(nested.parent_span_id);
    expect(parent?.name).toBe("downstream-a");
  });

  test("inbound not-sampled honored", async () => {
    if (!server) throw new Error("no server");
    const traceId = "a".repeat(32);
    const parentId = "1".repeat(16);
    const res = await ingress(server.baseUrl, {
      traceparent: `00-${traceId}-${parentId}-00`,
    });
    const body = await res.json();
    expect(body.sampled).toBe(false);
    const trace = await (await fetch(`${server.baseUrl}/trace/${traceId}`)).json();
    expect(trace.spans.every((s: { sampled: boolean }) => s.sampled === false)).toBe(true);
  });

  test("malformed traceparent replaced safely", async () => {
    if (!server) throw new Error("no server");
    const res = await ingress(server.baseUrl, { traceparent: "not-valid" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trace_id).not.toBe("not-valid");
  });

  test("concurrent ingress traces stay isolated", async () => {
    if (!server) throw new Error("no server");
    const results = await Promise.all([ingress(server.baseUrl), ingress(server.baseUrl), ingress(server.baseUrl)]);
    const ids = await Promise.all(results.map((r) => r.json()));
    const unique = new Set(ids.map((b) => b.trace_id));
    expect(unique.size).toBe(3);
  });
});
