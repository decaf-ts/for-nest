import { Delete, Get, Patch, Post, Put } from "@nestjs/common";
import { HttpVerbs } from "./types";

/**
 * Maps an HTTP verb to its corresponding NestJS method decorator.
 *
 * @param verb - HTTP verb to be converted (e.g. GET, POST, PUT, PATCH, DELETE).
 * @returns A NestJS method decorator matching the provided HTTP verb.
 *
 * @throws {Error} If the provided HTTP verb is not supported or not mapped
 * to a NestJS decorator.
 */
export function HttpVerbToDecorator(
  verb: HttpVerbs
): (path?: string) => MethodDecorator {
  const httpToCrud: Record<HttpVerbs, (path?: string) => MethodDecorator> = {
    GET: Get,
    POST: Post,
    PUT: Put,
    PATCH: Patch,
    DELETE: Delete,
  };

  const decorator = httpToCrud[verb];

  if (!decorator) {
    throw new Error(
      `Unsupported HTTP verb "${verb}". No NestJS decorator mapping was found.`
    );
  }

  return decorator;
}
