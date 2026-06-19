/**
 * @module for-nest
 * @description This module serves as the main entry point for the ts-workspace library. It aggregates and exports
 * functionality from various submodules and utilities within the project.
 *
 * The module includes:
 * 1. Utility functions and types from the "./utils" directory:
 *    - These likely contain helper functions, common types, and shared functionality used throughout the project.
 *    - May include operations for data manipulation, type checking, or other general-purpose utilities.
 *
 * 2. A namespace and related types from the "./namespace" directory:
 *    - This could contain domain-specific code or a collection of related functionality.
 *    - Might include interfaces, types, or classes that represent core concepts in the library.
 *
 * 3. A VERSION constant:
 *    - Represents the current version of the module.
 *    - Useful for version checking and compatibility purposes.
 *
 * This structure provides a clean and organized export of the module's functionality, allowing consumers
 * to easily import and use specific parts of the library as needed.
 */

import { Metadata } from "@decaf-ts/decoration";
import "./decoration";

export * from "./decoration"; // on top on purpose
export * from "./decaf-model";
export * from "./factory";
export * from "./interceptors";
export * from "./overrides";
export * from "./request";
export * from "./constants";
export * from "./controllers";
export * from "./module";
export * from "./core-module";
export * from "./migrations";
export * from "./types";
export * from "./utils";
export * from "./events-module";
export * from "./webhooks";

/**
 * Represents the current version of the ts-workspace module.
 * The actual version number is replaced during the build process.
 * @constant
 * @type {string}
 */
export const VERSION = "##VERSION##";

/**
 * @description Represents the current commit hash of the module build.
 * @summary Stores the current git commit hash for the package. The build replaces
 * the placeholder with the actual commit hash at publish time.
 * @const COMMIT
 */
export const COMMIT = "##COMMIT##";

/**
 * @description Represents the full version string of the module.
 * @summary Stores the semver version and commit hash for the package.
 * The build replaces the placeholder with the actual `<version>-<commit>` value at publish time.
 * @const FULL_VERSION
 */
export const FULL_VERSION = "##FULL_VERSION##";

export const PACKAGE_NAME = "##PACKAGE##";

Metadata.allowReregistration(true);
Metadata.registerLibrary(PACKAGE_NAME, VERSION);
Metadata.allowReregistration(false);
