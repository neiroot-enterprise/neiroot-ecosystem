const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const tokens = fs.readFileSync(path.join(root, "docs/design/tokens.css"));
for (const target of ["apps/web/src/shared/styles/tokens.css", "apps/web/public/neiroot-tokens.css", "infra/keycloak/themes/neiroot/login/resources/css/neiroot-tokens.css"]) {
  fs.writeFileSync(path.join(root, target), tokens);
}
