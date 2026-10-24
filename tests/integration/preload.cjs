const { existsSync } = require("node:fs");
const { config } = require("dotenv");

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  config({ path: ".env.local" });
}
