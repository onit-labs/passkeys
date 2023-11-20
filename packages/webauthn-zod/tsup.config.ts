import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		response: "src/response.ts",
		options: "src/options.ts",
		enums: "src/enums.ts",
		extensions: "src/extensions.ts",
		helpers: "src/helpers.ts",
	},
	bundle: true,
	dts: true,
	splitting: true,
	sourcemap: true,
	target: "esnext",
	clean: true,
});
