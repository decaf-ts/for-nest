import { DefaultAdapterFlags } from "@decaf-ts/core";
import { Logging, Logger } from "@decaf-ts/logging";

import { DecafRequestContext } from "./DecafRequestContext";
import { type DecafServerFlags } from "../constants";

const REQUEST_CONTEXTUALIZED_KEY = "__decafRequestContextContextualized";

export function contextualizeRequestContext(
  requestContext: DecafRequestContext,
  req: any
): boolean {
  if (requestContext.getOrUndefined(REQUEST_CONTEXTUALIZED_KEY as any)) {
    return false;
  }

  const headers = req.headers;
  const flags: DecafServerFlags = {
    headers: headers,
    overrides: {},
  } as any;

  const ip = extractIp(req);
  const currentLog = requestContext.getOrUndefined("logger" as any) as
    | Logger
    | undefined;
  const logger = ip
    ? (currentLog ?? Logging.get()).for({ ip })
    : currentLog ?? Logging.get();

  requestContext.accumulate(
    Object.assign(
      {},
      DefaultAdapterFlags,
      {
        logger,
        timestamp: new Date(),
        operation: `${req.method} ${req.url}`,
      },
      flags,
      { [REQUEST_CONTEXTUALIZED_KEY]: true }
    )
  );

  return true;
}

function extractIp(req: any): string | undefined {
  const headers = req.headers;
  function parseIpHeader(value?: string | string[]): string | undefined {
    if (!value) return undefined;
    const candidate = Array.isArray(value) ? value[0] : value;
    return candidate
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean)[0];
  }
  return (
    parseIpHeader(headers?.["x-forwarded-for"]) ??
    parseIpHeader(headers?.["x-real-ip"]) ??
    parseIpHeader(headers?.["X-Forwarded-For"]) ??
    parseIpHeader(headers?.["X-Real-IP"]) ??
    req.ip
  );
}
