

/**
 * @function complexFunction
 * @summary Concatenates "Hello World" with a given string
 * @description This function takes an optional string argument and concatenates it with "Hello World".
 * Despite its name, it's a simple string concatenation operation.
 *
 * @param {string} [arg1="default"] - The string to append to "Hello World". If not provided, defaults to "default".
 * @returns {string} The resulting concatenated string
 *
 * @example
 * // returns "Hello Worlddefault"
 * complexFunction();
 *
 * @example
 * // returns "Hello World!"
 * complexFunction("!");
 *
 * @memberOf module:ts-workspace.Utils
 */
export function complexFunction(arg1: string = "default",) {
  return "Hello World" + arg1;
}
