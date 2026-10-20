// Real storage helper + SDK wrapper; only SDK classes and S3 transport are fake.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const commandNames = ["S3Client", "HeadBucketCommand", "CreateBucketCommand", "GetBucketCorsCommand", "PutBucketCorsCommand"];
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("https://esm.sh/@aws-sdk/client-s3@")) {
      return { url: "offline:storage-cors-sdk", shortCircuit: true };
    }
    if (/^https?:/.test(specifier)) throw new Error("Network forbidden in CORS fixtures");
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "offline:storage-cors-sdk") {
      return { format: "module", shortCircuit: true, source: commandNames.map(name =>
        `export class ${name} { constructor(input) { this.input = input; } }`
      ).join("\n") };
    }
    return nextLoad(url, context);
  },
});
// The full runner disables network imports globally. Our hook supplies the SDK locally.
globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = false;
const { ensureS3SdkLoaded } = await import("../js/storage/s3-client.js");
await ensureS3SdkLoaded();
const { ensureBucketCors } = await import("../js/storage/s3-multipart.js");
hooks.deregister();
globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = true;

const first = "https://first.example.invalid";
const second = "https://second.example.invalid";
const third = "https://third.example.invalid";
const custom = { ID: "read-only", AllowedOrigins: [first], AllowedMethods: ["GET"], AllowedHeaders: ["Range"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 75 };
const defaults = origins => ({ AllowedHeaders: ["*"], AllowedMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"], AllowedOrigins: origins, ExposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"], MaxAgeSeconds: 3600 });
function transport(rules, readError) {
  return {
    policy: rules === null ? null : { CORSRules: structuredClone(rules) }, puts: 0, calls: [],
    async send(command) {
      const name = command.constructor.name;
      this.calls.push(name);
      assert.equal(command.input.Bucket, "offline-bucket");
      if (name === "HeadBucketCommand") return {};
      if (name === "GetBucketCorsCommand") {
        if (readError) throw readError;
        if (this.policy === null) throw Object.assign(new Error("No policy"), { name: "NoSuchCORSConfiguration" });
        return structuredClone(this.policy);
      }
      if (name === "PutBucketCorsCommand") {
        this.puts++;
        this.policy = structuredClone(command.input.CORSConfiguration);
        return {};
      }
      throw new Error(`Unexpected command ${name}`);
    },
  };
}
const ensure = (s3, origins) => ensureBucketCors({ s3, bucket: "offline-bucket", origins });

test("adding a second origin preserves the complete existing custom policy", async () => {
  const s3 = transport([custom]);
  await ensure(s3, [second]);
  assert.deepEqual(s3.policy, { CORSRules: [custom, defaults([second])] });
  assert.equal(s3.puts, 1);
});

test("wildcard and multiple custom rules keep their fields and order", async () => {
  const wildcard = { ...custom, ID: "wildcard", AllowedOrigins: ["*"], AllowedHeaders: ["X-Custom"], AllowedMethods: ["HEAD"], ExtraField: "preserve" };
  const s3 = transport([wildcard, custom]);
  await ensure(s3, [second]);
  assert.deepEqual(s3.policy, { CORSRules: [wildcard, custom, defaults([second])] });
});

test("duplicate origins and repeated calls are idempotent without another PUT", async () => {
  const s3 = transport([custom]);
  await ensure(s3, [second, second, null, ""]);
  const once = structuredClone(s3.policy);
  assert.deepEqual(once, { CORSRules: [custom, defaults([second])] });
  await ensure(s3, [second, second]);
  assert.deepEqual(s3.policy, once);
  assert.equal(s3.puts, 1);
});

test("equivalent default rules cover origins across rules regardless of array order", async () => {
  const existing = [defaults([first]), { ...defaults([second]), AllowedMethods: [...defaults([]).AllowedMethods].reverse() }];
  const s3 = transport(existing);
  await ensure(s3, [first, second]);
  assert.deepEqual(s3.policy, { CORSRules: existing });
  assert.equal(s3.puts, 0);
});

test("similar rules with different non-origin permissions do not cover a new request", async () => {
  for (const override of [
    { AllowedMethods: ["GET"] },
    { AllowedHeaders: ["Range"] },
    { ExposeHeaders: ["ETag"] },
    { MaxAgeSeconds: 75 },
    { ExtraField: "preserve" },
  ]) {
    const existing = { ...defaults([second]), ...override };
    const s3 = transport([existing]);
    await ensure(s3, [second]);
    assert.deepEqual(s3.policy, { CORSRules: [existing, defaults([second])] });
    assert.equal(s3.puts, 1);
  }
});

test("only uncovered origins receive a separate rule", async () => {
  const existing = [defaults([first]), custom];
  const s3 = transport(existing);
  await ensure(s3, [first, second, third]);
  assert.deepEqual(s3.policy, { CORSRules: [...existing, defaults([second, third])] });
});

test("an explicit absent policy creates defaults and then skips repeated writes", async () => {
  const s3 = transport(null);
  await ensure(s3, [first]);
  assert.deepEqual(s3.policy, { CORSRules: [defaults([first])] });
  await ensure(s3, [first]);
  assert.equal(s3.puts, 1);
});

test("all other policy read failures reject unchanged without PUT", async () => {
  for (const error of [Object.assign(new Error("Denied"), { name: "AccessDenied" }), Object.assign(new Error("Not found"), { name: "NoSuchBucket", $metadata: { httpStatusCode: 404 } }), new Error("Transport failed")]) {
    const s3 = transport([custom], error);
    await assert.rejects(ensure(s3, [second]), actual => actual === error);
    assert.deepEqual(s3.policy, { CORSRules: [custom] });
    assert.equal(s3.puts, 0);
  }
});

test("empty or missing origins perform no IO and preserve policy", async () => {
  for (const origins of [[], undefined, [null, "", false]]) {
    const s3 = transport([custom]);
    await ensure(s3, origins);
    assert.deepEqual(s3.calls, []);
    assert.deepEqual(s3.policy, { CORSRules: [custom] });
  }
});
