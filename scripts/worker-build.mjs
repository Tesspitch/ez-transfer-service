import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const xmlPackage = path.dirname(
  require.resolve("@aws-sdk/xml-builder/package.json"),
);

// Workers have Fetch, but no DOMParser. Keep browser transport and select the
// SDK's own DOM-free XML parser instead of its browser-only implementation.
export function buildWorker(options) {
  return build({
    ...options,
    plugins: [
      {
        name: "workers-aws-xml",
        setup(builder) {
          builder.onResolve({ filter: /^\.\/xml-parser(?:\.js)?$/ }, (args) => {
            if (
              args.importer
                .replaceAll("\\", "/")
                .includes("/@aws-sdk/xml-builder/dist-es/")
            )
              return { path: path.join(xmlPackage, "dist-es/xml-parser.js") };
          });
        },
      },
      ...(options.plugins ?? []),
    ],
  });
}
