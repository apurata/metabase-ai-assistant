/** @type {import('jest').Config} */
export default {
  testPathIgnorePatterns: [
    '/node_modules/',
    // Apurata node:test suites (run via `npm run test:apurata`)
    'src/mcp/dashboard-layout\\.test\\.js$',
    'src/mcp/field-coercion\\.test\\.js$',
  ],
};
