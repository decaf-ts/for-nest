const config = {
  verbose: true,
  rootDir: __dirname,
  extensionsToTreatAsEsm: [".ts"],
  transform: { "^.+\\.ts$": ["ts-jest", { useESM: true }] },
  testEnvironment: "node",
  testTimeout: 180000,
  testRegex: "/tests/.*\\.(test|e2e)\\.ts$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverage: false,
  coverageDirectory: "./workdocs/reports/coverage",
  collectCoverageFrom: ["src/**/*.{js,jsx,ts,tsx}", "!src/bin/**/*"],
  reporters: ["default"],
  watchman: false,
};

module.exports = config;
