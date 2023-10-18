import esbuild from "esbuild";
import { sassPlugin } from "esbuild-sass-plugin";

// Generate CSS/JS Builds
esbuild
  .build({
    entryPoints: [
      "app/assets/stylesheets/application.scss",
      "app/javascript/entrypoints/*.tsx",
    ],
    outdir: "public/assets",
    bundle: true,
    plugins: [sassPlugin()],
    loader: {
      ".png": "dataurl",
      ".woff": "dataurl",
      ".woff2": "dataurl",
      ".eot": "dataurl",
      ".ttf": "dataurl",
      ".svg": "dataurl",
    },
  })
  .then(() => console.log("⚡ Build complete! ⚡"))
  .catch(() => process.exit(1));
