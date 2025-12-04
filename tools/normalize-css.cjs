const fs = require("fs");
const path = require("path");
const postcss = require("postcss");
const safeParser = require("postcss-safe-parser");
const discardComments = require("postcss-discard-comments");

async function main() {
    const [, , inFile, outFile] = process.argv;

    if (!inFile || !outFile) {
        console.error("Usage: node normalize-css.cjs input.css output.css");
        process.exit(1);
    }

    const absIn = path.resolve(inFile);
    const absOut = path.resolve(outFile);

    if (!fs.existsSync(absIn)) {
        console.error("Input CSS not found:", absIn);
        process.exit(1);
    }

    const css = fs.readFileSync(absIn, "utf8");

    try {
        const result = await postcss([
            // Drop all comments. This removes the malformed nested stuff completely.
            discardComments({ removeAll: true }),
        ]).process(css, {
            from: absIn,
            to: absOut,
            parser: safeParser,
        });

        fs.writeFileSync(absOut, result.css, "utf8");
        console.log("Normalized CSS written to:", absOut);
    } catch (err) {
        console.error("Error during CSS normalization:");
        console.error(err.toString());
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err.toString());
    process.exit(1);
});
