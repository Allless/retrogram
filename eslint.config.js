import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "scripts"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettierConfig,
);
