import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    include: [
      "lib/**/*.test.ts",
      "lib/**/*.test.tsx",
      "hooks/**/*.test.ts",
      "hooks/**/*.test.tsx",
      "components/**/*.test.ts",
      "components/**/*.test.tsx",
    ],
    globals: false,
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: [
      {
        find: "@react-native-async-storage/async-storage",
        replacement: path.resolve(__dirname, "./test/mocks/asyncStorage.ts"),
      },
      {
        find: /^@\/hooks\/useOnline$/,
        replacement: path.resolve(__dirname, "./test/mocks/useOnline.ts"),
      },
      {
        find: /^@\/hooks\/useColors$/,
        replacement: path.resolve(__dirname, "./test/mocks/useColors.ts"),
      },
      {
        find: "@expo/vector-icons",
        replacement: path.resolve(__dirname, "./test/mocks/vectorIcons.tsx"),
      },
      {
        find: /^react-native$/,
        replacement: path.resolve(
          __dirname,
          "./node_modules/react-native-web/dist/index.js",
        ),
      },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "./$1") },
    ],
  },
});
