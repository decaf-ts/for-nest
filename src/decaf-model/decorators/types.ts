import type {
  HttpVerbs as ServerHttpVerbs,
  ServerApiProperty,
  ServerModelRoute,
  ServerParamProps,
  ServerRouteDecOptions,
} from "@decaf-ts/for-http/server";

export type HttpVerbs = ServerHttpVerbs;
export type DecafApiProperty = ServerApiProperty;
export type DecafModelRoute = ServerModelRoute;
export type DecafParamProps = ServerParamProps;

export interface DecafRouteDecOptions {
  path: ServerRouteDecOptions["path"];
  httpMethod: ServerRouteDecOptions["httpMethod"];
  handler: ServerRouteDecOptions["handler"];
}
