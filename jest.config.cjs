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
    "^@decaf-ts/core$": "<rootDir>/../core/lib/cjs/index.cjs",
    "^@decaf-ts/core/ram$": "<rootDir>/../core/lib/cjs/ram/index.cjs",
    "^@decaf-ts/core/ram/(.*)$": "<rootDir>/../core/lib/cjs/ram/$1.cjs",
    "^@decaf-ts/core/migrations$": "<rootDir>/../core/lib/cjs/migrations/index.cjs",
    "^@decaf-ts/core/migrations/(.*)$": "<rootDir>/../core/lib/cjs/migrations/$1.cjs",
    "^@decaf-ts/core/(.*)$": "<rootDir>/../core/lib/cjs/$1.cjs",
    "^@decaf-ts/for-http$": "<rootDir>/../for-http/lib/cjs/index.cjs",
    "^@decaf-ts/for-http/server$": "<rootDir>/../for-http/lib/cjs/server/index.cjs",
    "^@decaf-ts/for-http/server/(.*)$": "<rootDir>/../for-http/lib/cjs/server/$1.cjs",
    "^@decaf-ts/for-http/hooks$": "<rootDir>/../for-http/lib/cjs/server/hooks/index.cjs",
    "^@decaf-ts/for-http/hooks/(.*)$": "<rootDir>/../for-http/lib/cjs/server/hooks/$1.cjs",
  }
};

module.exports = config;
