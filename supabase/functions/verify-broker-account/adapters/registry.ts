import { HttpJsonBrokerAdapter } from "./http-json.ts";
import type { BrokerAdapter } from "./types.ts";

const adapters: Record<string, () => BrokerAdapter> = {
  "http-json-v1": () => new HttpJsonBrokerAdapter(),
};

export function getBrokerAdapter(key: string): BrokerAdapter {
  const factory = adapters[key];
  if (!factory) {
    throw new Error(`Unsupported broker adapter: ${key}`);
  }
  return factory();
}
