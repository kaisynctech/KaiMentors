import assert from "node:assert/strict";
import test from "node:test";
import {
  interpretXmFetchFailure,
  interpretXmTraderResponse,
  isXmHtmlGatewayResponse,
  resolveXmApiToken,
} from "../supabase/functions/verify-broker-account/adapters/xm-mypartners.ts";

test("XM MyPartners token is the two emailed parts concatenated", () => {
  assert.equal(
    resolveXmApiToken({
      tokenPart1: "AAAA",
      tokenPart2: "BBBB",
    }),
    "AAAABBBB",
  );
  assert.equal(resolveXmApiToken({ apiToken: "ONEPIECE" }), "ONEPIECE");
  assert.equal(resolveXmApiToken({}), "");
});

test("XM trader lookup 200 means the client sits under this affiliate", () => {
  const result = interpretXmTraderResponse(200, {
    loginID: 12345678,
    validated: true,
    archived: false,
    accountType: "Standard",
    serverName: "XMGlobal-Real",
  });
  assert.equal(result.verified, true);
  assert.equal(result.code, "AFFILIATE_MATCH");
  assert.equal(result.summary.loginID, 12345678);
});

test("XM 404 means the account is not under this IB", () => {
  const result = interpretXmTraderResponse(404, null);
  assert.equal(result.verified, false);
  assert.equal(result.requiresManualReview, undefined);
  assert.equal(result.code, "AFFILIATE_MISMATCH");
});

test("XM 401 is a credential problem and goes to mentor review", () => {
  const result = interpretXmTraderResponse(401, null);
  assert.equal(result.verified, false);
  assert.equal(result.requiresManualReview, true);
  assert.equal(result.code, "XM_UNAUTHORIZED");
});

test("XM HTML 401 is the Akamai gateway, not a JSON API rejection", () => {
  assert.equal(
    isXmHtmlGatewayResponse(401, "text/html;charset=UTF-8", null),
    true,
  );
  assert.equal(
    isXmHtmlGatewayResponse(401, "application/json", { raw: "<html>Unauthorized" }),
    true,
  );
  assert.equal(isXmHtmlGatewayResponse(401, "application/json", null), false);
});

test("XM timeout or network failure goes to mentor review instead of hanging", () => {
  const timeout = interpretXmFetchFailure(
    Object.assign(new Error("timed out"), { name: "TimeoutError" }),
  );
  assert.equal(timeout.verified, false);
  assert.equal(timeout.requiresManualReview, true);
  assert.equal(timeout.code, "XM_TIMEOUT");

  const abort = interpretXmFetchFailure(
    Object.assign(new Error("aborted"), { name: "AbortError" }),
  );
  assert.equal(abort.code, "XM_TIMEOUT");

  const network = interpretXmFetchFailure(new Error("fetch failed"));
  assert.equal(network.code, "XM_NETWORK_ERROR");
});
