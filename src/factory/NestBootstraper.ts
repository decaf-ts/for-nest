import {
  INestApplication,
  Logger,
  NestInterceptor,
  PipeTransform,
} from "@nestjs/common";
import {
  AuthorizationExceptionFilter,
  ConflictExceptionFilter,
  GlobalExceptionFilter,
  HttpExceptionFilter,
  NotFoundExceptionFilter,
  ValidationExceptionFilter,
} from "./exceptions";
import { SwaggerBuilder } from "./openapi";
import { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import { CorsError } from "./errors";

/**
 * @description
 * Defines all customizable parameters for Swagger setup.
 *
 * @summary
 * This interface allows developers to customize how Swagger UI is configured
 * within the NestJS application. It includes parameters for titles, paths,
 * color schemes, and asset paths to tailor the API documentation experience.
 *
 * @param {string} title - Title displayed in Swagger UI.
 * @param {string} description - Description shown below the title.
 * @param {string} version - API version displayed in the documentation.
 * @param {string} [path] - Optional path where Swagger will be available.
 * @param {boolean} [persistAuthorization] - Whether authorization tokens persist across reloads.
 * @param {string} [assetsPath] - Path to custom assets for Swagger UI.
 * @param {string} [topbarBgColor] - Custom background color for the Swagger top bar.
 * @param {string} [topbarIconPath] - Path to a custom icon displayed in the top bar.
 * @param {string} [faviconPath] - Path to a custom favicon.
 */
export interface SwaggerSetupOptions {
  title: string;
  description: string;
  version: string;
  path?: string;
  persistAuthorization?: boolean;
  assetsPath?: string;
  topbarBgColor?: string;
  topbarIconPath?: string;
  faviconPath?: string;
}

/**
 * @description
 * A fluent, static bootstrap class for initializing and configuring a NestJS application.
 *
 * @summary
 * The `NestBootstraper` class provides a chainable API for configuring
 * a NestJS application instance. It includes built-in methods for enabling
 * CORS, Helmet security, Swagger documentation, global pipes, filters,
 * interceptors, and starting the server.
 *
 * This class promotes consistency and reduces repetitive setup code
 * across multiple NestJS projects.
 *
 * @example
 * ```ts
 * import { NestFactory } from "@nestjs/core";
 * import { AppModule } from "./app.module";
 * import { MyLogger } from "./MyLogger";
 * import { NestBootstraper } from "@decaf-ts/for-nest";
 *
 * async function bootstrap() {
 *   const app = await NestFactory.create(AppModule);
 *
 *   await NestBootstraper
 *     .initialize(app)
 *     .enableLogger(new MyLogger())
 *     .enableCors(["http://localhost:4200"])
 *     .useHelmet()
 *     .setupSwagger({
 *       title: "OpenAPI by TradeMark™",
 *       description: "TradeMark™ API documentation",
 *       version: "1.0.0",
 *       path: "api",
 *       persistAuthorization: true,
 *       topbarBgColor: "#2C3E50",
 *       topbarIconPath: "/assets/logo.svg",
 *       faviconPath: "/assets/favicon.ico"
 *     })
 *     .useGlobalFilters()
 *     .useGlobalPipes(...)
 *     .useGlobalInterceptors(...)
 *     .start(3000);
 * }
 *
 * bootstrap();
 * ```
 * @class
 */
export class NestBootstraper {
  private static app: INestApplication;
  private static _logger: Logger;

  /**
   * @description
   * Returns the current logger instance, creating a default one if not set.
   *
   * @summary
   * Ensures that a valid `Logger` instance is always available
   * for logging bootstrap-related messages.
   *
   * @return {Logger} The active logger instance.
   */
  private static get logger(): Logger {
    if (!this._logger) {
      // fallback
      this._logger = new Logger("NestBootstrap");
    }
    return this._logger;
  }

  /**
   * @description
   * Initializes the bootstrapper with a given NestJS application.
   *
   * @summary
   * Binds the provided NestJS app instance to the bootstrapper, enabling
   * chained configuration methods.
   *
   * @param {INestApplication} app - The NestJS application instance to initialize.
   * @return {typeof NestBootstraper} Returns the class for chaining configuration methods.
   */
  static initialize(app: INestApplication) {
    this.app = app;
    return this;
  }

  /**
   * @description
   * Enables or replaces the global logger for the NestJS application.
   *
   * @summary
   * If a custom logger is provided, it replaces the default logger. Otherwise,
   * a new logger named `"NestBootstrap"` is used. This logger is also registered
   * with the NestJS application.
   *
   * @param {Logger} [customLogger] - Optional custom logger instance.
   * @return {typeof NestBootstraper} Returns the class for chaining.
   */
  static enableLogger(customLogger?: Logger) {
    this._logger = customLogger || new Logger("NestBootstrap");
    this.app.useLogger(this._logger);
    return this;
  }

  /**
   * @description
   * Enables Cross-Origin Resource Sharing (CORS) for the application.
   *
   * @summary
   * Allows defining either a wildcard origin (`"*"`) or a list of allowed origins.
   * Automatically accepts local development requests and those without origin headers.
   * Throws a `CorsError` for unauthorized origins.
   *
   * @param {'*' | string[]} [origins=[]] - List of allowed origins or `"*"` to allow all.
   * @param {string[]} [allowMethods=['GET', 'POST', 'PUT', 'DELETE']] - Allowed HTTP methods.
   * @return {typeof NestBootstraper} Returns the class for chaining configuration.
   *
   */
  static enableCors(
    origins: "*" | string[] = [],
    allowMethods: string[] = ["GET", "POST", "PUT", "DELETE"]
  ) {
    const allowedOrigins =
      origins === "*" ? "*" : origins.map((o) => o.trim().toLowerCase());

    const corsOptions: CorsOptions = {
      origin: (origin, callback) => {
        // Allow request without origin...
        if (!origin) return callback(null, true);

        if (
          allowedOrigins === "*" ||
          (Array.isArray(allowedOrigins) &&
            allowedOrigins.includes(origin.toLowerCase()))
        ) {
          return callback(null, true);
        }

        callback(new CorsError(`Origin ${origin} not allowed`));
      },
      credentials: true,
      methods: allowMethods.join(","),
    };

    this.app.enableCors(corsOptions);
    return this;
  }

  /**
   * @description
   * Applies the Helmet middleware for enhanced security.
   *
   * @summary
   * Dynamically loads the `helmet` package if available and registers it
   * as middleware to improve HTTP header security. If not installed, logs a warning
   * and continues execution without throwing errors.
   *
   * @param {Record<string, any>} [options] - Optional configuration passed to Helmet.
   * @return {typeof NestBootstraper} Returns the class for chaining configuration.
   */
  static useHelmet(options?: Record<string, any>) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const helmet = require("helmet"); // Dynamic import to avoid hard dependency
      this.app.use(helmet(options));
      this.logger.log("Helmet middleware enabled successfully.");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      this.logger.warn("Helmet not installed. Skipping middleware.");
    }

    return this;
  }

  /**
   * @description
   * Configures and initializes Swagger UI for API documentation.
   *
   * @summary
   * Uses the `SwaggerBuilder` utility to configure API documentation
   * with detailed customization for title, version, paths, and colors.
   * Swagger is automatically exposed at the configured path.
   *
   * @param {SwaggerSetupOptions} options - Swagger configuration options.
   * @return {typeof NestBootstraper} Returns the class for chaining configuration.
   */
  static setupSwagger(options: SwaggerSetupOptions) {
    const swagger = new SwaggerBuilder(this.app, {
      title: options.title,
      description: options.description,
      version: options.version,
      path: options.path || "api",
      persistAuthorization: options.persistAuthorization ?? true,
      assetsPath: options.assetsPath,
      faviconFilePath: options.faviconPath,
      topbarIconFilePath: options.topbarIconPath,
      topbarBgColor: options.topbarBgColor,
    });
    swagger.setupSwagger();
    return this;
  }

  /**
   * @description
   * Registers one or more global validation pipes.
   *
   * @summary
   * Enables request payload validation and transformation globally across
   * the entire NestJS application. Multiple pipes can be chained together
   * for modular input validation.
   *
   * @param {...PipeTransform[]} pipes - Pipe instances to register globally.
   * @return {typeof NestBootstraper} Returns the class for chaining.
   */
  static useGlobalPipes(...pipes: PipeTransform[]) {
    if (pipes.length > 0) this.app.useGlobalPipes(...pipes);
    return this;
  }

  /**
   * @description
   * Registers one or more global exception filters.
   *
   * @summary
   * If no filters are provided, it automatically registers a default
   * set of standard exception filters for common error types like
   * `HttpException`, `ValidationException`, `ConflictException`, and others.
   *
   * @param {...ExceptionFilter[]} filters - Optional filters to apply globally.
   * @return {typeof NestBootstraper} Returns the class for chaining configuration.
   */
  static useGlobalFilters(...filters: any[]) {
    const defaultFilters = [
      new HttpExceptionFilter(),
      new ValidationExceptionFilter(),
      new NotFoundExceptionFilter(),
      new ConflictExceptionFilter(),
      new AuthorizationExceptionFilter(),
      new GlobalExceptionFilter(),
    ];

    this.app.useGlobalFilters(
      ...(filters.length > 0 ? filters : defaultFilters)
    );
    return this;
  }

  /**
   * @description
   * Registers global interceptors for request and response transformation.
   *
   * @summary
   * Interceptors allow advanced request/response manipulation such as
   * serialization, logging, or transformation. Multiple interceptors
   * can be added for modular configuration.
   *
   * @param {...NestInterceptor[]} interceptors - Interceptor instances to register.
   * @return {typeof NestBootstraper} Returns the class for chaining configuration.
   */
  static useGlobalInterceptors(...interceptors: NestInterceptor[]) {
    if (interceptors.length > 0)
      this.app.useGlobalInterceptors(...interceptors);
    return this;
  }

  /**
   * @description
   * Starts the NestJS application and binds it to the given port and host.
   *
   * @summary
   * Listens on the specified port and optionally a host. Once started,
   * logs the application URL for easy access. The startup process resolves
   * once the application is successfully running.
   *
   * @param {number} [port=3000] - Port number to listen on.
   * @param {string} [host] - Optional host or IP address to bind to.
   * @param {boolean} [log=true] - Whether to log the application URL upon startup.
   * @return {Promise<void>} Resolves once the application starts successfully.
   */
  static async start(
    port: number = Number(process.env.PORT) || 3000,
    host: string | undefined = undefined,
    log: boolean = true
  ) {
    this.app.listen(port, host as any).then(async () => {
      if (log) {
        const url = await this.app.getUrl();
        this.logger.log(`🚀 Application is running at: ${url}`);
      }
    });
  }
}
