import { nodeResolve } from "@rollup/plugin-node-resolve";

export default {
  input: "browser/index.mjs",
  output: { file: "dist/preference-panes.mjs", format: "es" },
  plugins: [nodeResolve({ browser: true })],
  onwarn(warning) {
    throw new Error(warning.message);
  },
};
