import { Inject, Injectable, Scope } from "@nestjs/common";
import { DecafRequestContext } from "./DecafRequestContext";
import { type DecafRequestHandler } from "../types";
import { DECAF_HANDLERS } from "../constants";

/**
 * @description
 * Executes all registered {@link DecafRequestHandler} instances for the current request,
 * providing them with a shared {@link DecafRequestContext}.
 *
 * @summary
 * The {@link DecafHandlerExecutor} class is responsible for orchestrating and executing
 * a sequence of request handlers. Each handler receives the same request-scoped context,
 * allowing coordinated processing such as authentication, metadata extraction, auditing,
 * and custom pipeline behavior. Handlers are injected via the {@link DECAF_HANDLERS} token,
 * ensuring extensibility and loose coupling.
 *
 * @class DecafHandlerExecutor
 *
 * @example
 * ```ts
 * // Example handler:
 * class AuthHandler implements DecafRequestHandler {
 *   async handle(context: DecafRequestContext, req: Request) {
 *     const token = req.headers["authorization"];
 *     const result = MyService.doSomething(token);
 *     context.set("my-key", result);
 *   }
 * }
 *
 * // Executor usage in a request:
 * await executor.exec(request);
 * // All handlers will run in sequence
 * ```
 *
 * @mermaid
 * sequenceDiagram
 *     participant Client
 *     participant Executor
 *     participant HandlerA
 *     participant HandlerB
 *
 *     Client->>Executor: exec(req)
 *     Executor->>HandlerA: handle(context, req)
 *     HandlerA-->>Executor: completed
 *     Executor->>HandlerB: handle(context, req)
 *     HandlerB-->>Executor: completed
 *     Executor-->>Client: processing finished
 */
@Injectable({ scope: Scope.REQUEST })
export class DecafHandlerExecutor {
  constructor(
    @Inject(DECAF_HANDLERS) private readonly handlers: DecafRequestHandler[],
    private readonly context: DecafRequestContext
  ) {}

  async exec(req: Request, res: Response) {
    for (const handler of this.handlers) {
      await handler.handle(this.context.ctx, req, res);
    }
  }
}
