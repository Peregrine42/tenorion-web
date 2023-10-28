import esbuild from "esbuild";
import { sassPlugin } from "esbuild-sass-plugin";
import postcss from "postcss";
import copyAssets from "postcss-copy-assets";
import purgecss from "@fullhuman/postcss-purgecss";

esbuild
  .build({
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    inject: ["shims/tone_js_shim.js"],
    entryPoints: [
      "app/assets/stylesheets/application.scss",
      "app/javascript/entrypoints/*.tsx",
    ],
    outdir: "public/assets",
    format: "iife",
    bundle: true,
    sourcemap: "linked",
    plugins: [
      sassPlugin({
        async transform(source, resolveDir, filePath) {
          const { css } = await postcss([
            purgecss({
              content: ["app/javascript/**/*.tsx", "app/assets/stylesheets/*.scss", "app/views/**/*.html.erb"],
              fontFace: true,
              safelist: [
                "fa-play", "fa-pause","fa-solid",
              ]
            }),
          ])
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
