const fs = require("fs");

const {
  SUPABASE_NEWS_FUNCTION_URL,
  SUPABASE_ANON_KEY,
  APPS_SCRIPT_BRIEFING_LOG_URL,
  APPS_SCRIPT_URL,
} = process.env;

const required = {
  SUPABASE_NEWS_FUNCTION_URL,
  SUPABASE_ANON_KEY,
  APPS_SCRIPT_BRIEFING_LOG_URL,
  APPS_SCRIPT_URL,
};

for (const [key, value] of Object.entries(required)) {
  if (!value) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const content = `const CONFIG = {
  SUPABASE_NEWS_FUNCTION_URL: "${SUPABASE_NEWS_FUNCTION_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}",
  APPS_SCRIPT_BRIEFING_LOG_URL: "${APPS_SCRIPT_BRIEFING_LOG_URL}",
  APPS_SCRIPT_URL: "${APPS_SCRIPT_URL}",
};
`;

fs.writeFileSync("config.js", content);
console.log("config.js generated from environment variables.");
