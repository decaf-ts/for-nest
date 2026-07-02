import "reflect-metadata";
import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ImATeapotException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Logging } from "@decaf-ts/logging";
import { DecafExceptionFilter } from "../../src/factory/exceptions/DecafErrorFilter";
import { DecafRequestContext } from "../../src/request/DecafRequestContext";

function hostFor(request: any): ArgumentsHost {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe("DecafExceptionFilter", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("logs through the request-bound Context logger, not Logging.get()", async () => {
    const requestLogger = { error: jest.fn() };
    const globalLogger = { error: jest.fn() };

    jest.spyOn(Logging, "get").mockReturnValue(globalLogger as any);

    const moduleRef = {
      resolve: jest
        .fn()
        .mockResolvedValue({ logger: requestLogger } as unknown as DecafRequestContext),
    };

    const filter = new DecafExceptionFilter(moduleRef as any);
    const request = { method: "GET", url: "/product/123" };

    await filter.catch(new Error("boom"), hostFor(request));

    expect(moduleRef.resolve).toHaveBeenCalledWith(
      DecafRequestContext,
      expect.anything(),
      { strict: false }
    );
    expect(requestLogger.error).toHaveBeenCalledTimes(1);
    expect(requestLogger.error.mock.calls[0][0]).toContain("GET /product/123");
    expect(globalLogger.error).not.toHaveBeenCalled();
  });

  it("falls back to Logging.get() when no ModuleRef was supplied", async () => {
    const globalLogger = { error: jest.fn() };
    jest.spyOn(Logging, "get").mockReturnValue(globalLogger as any);

    const filter = new DecafExceptionFilter();
    const request = { method: "GET", url: "/product/123" };

    await filter.catch(new Error("boom"), hostFor(request));

    expect(globalLogger.error).toHaveBeenCalledTimes(1);
  });

  it("falls back to Logging.get() when the context was resolved but hasn't been enriched with a logger yet (e.g. a guard threw before the interceptor ran)", async () => {
    const globalLogger = { error: jest.fn() };
    jest.spyOn(Logging, "get").mockReturnValue(globalLogger as any);

    const moduleRef = {
      resolve: jest.fn().mockResolvedValue({ logger: undefined } as any),
    };

    const filter = new DecafExceptionFilter(moduleRef as any);
    const request = { method: "GET", url: "/product/123" };

    await filter.catch(new Error("boom"), hostFor(request));

    expect(globalLogger.error).toHaveBeenCalledTimes(1);
  });

  it("falls back to Logging.get() when the request-scoped context can't be resolved", async () => {
    const globalLogger = { error: jest.fn() };
    jest.spyOn(Logging, "get").mockReturnValue(globalLogger as any);

    const moduleRef = {
      resolve: jest.fn().mockRejectedValue(new Error("no provider for this contextId")),
    };

    const filter = new DecafExceptionFilter(moduleRef as any);
    const request = { method: "GET", url: "/product/123" };

    await filter.catch(new Error("boom"), hostFor(request));

    expect(globalLogger.error).toHaveBeenCalledTimes(1);
  });

  it("still sends the response and retries via Logging.get() when the resolved context logger's .error() throws", async () => {
    const requestLogger = {
      error: jest.fn(() => {
        throw new Error("logger transport is down");
      }),
    };
    const globalLogger = { error: jest.fn() };
    jest.spyOn(Logging, "get").mockReturnValue(globalLogger as any);

    const moduleRef = {
      resolve: jest
        .fn()
        .mockResolvedValue({ logger: requestLogger } as unknown as DecafRequestContext),
    };

    const filter = new DecafExceptionFilter(moduleRef as any);
    const request = { method: "GET", url: "/product/123" };
    const host = hostFor(request);

    await expect(filter.catch(new Error("boom"), host)).resolves.toBeUndefined();

    expect(requestLogger.error).toHaveBeenCalledTimes(1);
    expect(globalLogger.error).toHaveBeenCalledTimes(1);
    const response = host.switchToHttp().getResponse();
    expect(response.status).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalled();
  });

  it("never throws and still sends the response even when every logger is broken", async () => {
    const requestLogger = {
      error: jest.fn(() => {
        throw new Error("logger transport is down");
      }),
    };
    jest.spyOn(Logging, "get").mockImplementation(() => {
      throw new Error("global logger unavailable too");
    });

    const moduleRef = {
      resolve: jest
        .fn()
        .mockResolvedValue({ logger: requestLogger } as unknown as DecafRequestContext),
    };

    const filter = new DecafExceptionFilter(moduleRef as any);
    const request = { method: "GET", url: "/product/123" };
    const host = hostFor(request);

    await expect(filter.catch(new Error("boom"), host)).resolves.toBeUndefined();

    const response = host.switchToHttp().getResponse();
    expect(response.status).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalled();
  });
});

describe("DecafExceptionFilter guard/pipe exception mapping", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [new UnauthorizedException("nope"), 401],
    [new ForbiddenException("nope"), 403],
    [new BadRequestException("nope"), 400],
    [new ConflictException("nope"), 409],
    [new UnprocessableEntityException("nope"), 422],
  ])(
    "maps %p to its decaf BaseError equivalent (status %i) instead of a generic 500",
    async (exception, expectedStatus) => {
      const filter = new DecafExceptionFilter();
      const host = hostFor({ method: "GET", url: "/x" });

      await filter.catch(exception, host);

      const response = host.switchToHttp().getResponse();
      expect(response.status).toHaveBeenCalledWith(expectedStatus);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: expectedStatus })
      );
    }
  );

  it("preserves the real status of a recognized but unmapped HttpException", async () => {
    const filter = new DecafExceptionFilter();
    const host = hostFor({ method: "GET", url: "/x" });

    await filter.catch(new ImATeapotException("short and stout"), host);

    const response = host.switchToHttp().getResponse();
    expect(response.status).toHaveBeenCalledWith(418);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 418 })
    );
  });

  it("still falls back to a generic 500 for truly unknown, non-HTTP errors", async () => {
    const filter = new DecafExceptionFilter();
    const host = hostFor({ method: "GET", url: "/x" });

    await filter.catch(new TypeError("something actually broke"), host);

    const response = host.switchToHttp().getResponse();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 })
    );
  });
});
