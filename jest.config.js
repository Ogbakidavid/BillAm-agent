/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests", "<rootDir>/src"],
  testMatch: ["**/?(*.)+(spec|test).ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2020",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          isolatedModules: true,
          types: ["jest", "node"],
        },
      },
    ],
  },
  moduleNameMapper: {
    "^@strands-agents/sdk(/.*)?$": "<rootDir>/tests/__mocks__/strandsSdkMock.ts",
  },
};
