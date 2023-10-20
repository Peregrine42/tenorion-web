import esbuild from "esbuild";
import { sassPlugin } from "esbuild-sass-plugin";
import postcss from 'postcss';
import copyAssets from 'postcss-copy-assets';

// Generate CSS/JS Builds
esbuild
  .build({
    inject: ["shim.js"],
    entryPoints: [
      "app/assets/stylesheets/application.scss",
      "app/javascript/entrypoints/*.tsx",
    ],
    outdir: "public/assets",
    bundle: true,
    plugins: [
      sassPlugin({
        async transform(source, resolveDir, filePath) {
          const { css } = await postcss()
            .use(copyAssets({ base: `public` }))
            .process(source, {
              from: filePath,
              to: `assets/assets/stylesheets/application.css`,
            });
          return css;
        },
      }),
    ],
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
