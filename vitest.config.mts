import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // os testes de banco dividem o mesmo Postgres: um arquivo por vez
    fileParallelism: false,
    testTimeout: 20000,
  },
});
