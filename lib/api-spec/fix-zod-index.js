const fs = require("fs");
const path = require("path");
const indexPath = path.resolve(__dirname, "../../lib/api-zod/src/index.ts");
fs.writeFileSync(indexPath, "export * from './generated/api';\n");
