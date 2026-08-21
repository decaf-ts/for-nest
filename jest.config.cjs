const path = require("path");

const config = {
  verbose: true,
  rootDir: __dirname,
  transform: { "^.+\\.ts$": "ts-jest" },
  testEnvironment: "node",
  testRegex: "/tests/.*\\.(test|spec)\\.(ts|tsx)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverage: false,
  coverageDirectory: "./workdocs/reports/coverage",
  collectCoverageFrom: ["src/**/*.{js,jsx,ts,tsx}", "!src/bin/**/*"],
  reporters: ["default"],
  watchman: false,
  moduleNameMapper: {
    "^@decaf-ts/for-http/hooks$": "<rootDir>/../for-http/lib/cjs/server/hooks/index.cjs",
    "^@decaf-ts/for-http/server$": "<rootDir>/../for-http/lib/cjs/server/index.cjs",
    "^@decaf-ts/for-http$": "<rootDir>/../for-http/lib/cjs/index.cjs",
  },
};

module.exports = config;
