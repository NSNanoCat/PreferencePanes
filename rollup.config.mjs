import { nodeResolve } from "@rollup/plugin-node-resolve";

export default [
  { input: "browser/index.mjs", output: { file: "dist/preference-panes.mjs", format: "es" } },
  { input: "proxy/request.mjs", output: { file: "dist/preference-panes.request.js", format: "iife" } },
].map((config) => ({
  ...config,
  plugins: [nodeResolve({ browser: true })],
  onwarn(warning) {
    throw new Error(warning.message);
  },
}));
