// Upserts every plan JSON in src/data/reading-plans/ into the reading_plans /
// reading_plan_entries tables. Run with: npm run seed:plans
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-only,
// never NEXT_PUBLIC_) in .env.local.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const plansDir = join(root, "src/data/reading-plans");
const files = readdirSync(plansDir).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error(`No plan JSONs found in ${plansDir}`);
  process.exit(1);
}

for (const file of files) {
  const plan = JSON.parse(readFileSync(join(plansDir, file), "utf8"));
  const { error: planError } = await supabase.from("reading_plans").upsert(
    {
      id: plan.id,
      display_name: plan.display_name,
      description: plan.description ?? null,
    },
    { onConflict: "id" },
  );
  if (planError) {
    console.error(`${file}: failed to upsert plan: ${planError.message}`);
    process.exit(1);
  }

  const rows = plan.entries.map((e) => ({
    plan_id: plan.id,
    date: e.date,
    begin_chapter: e.begin_chapter,
    end_chapter: e.end_chapter,
    description: e.description ?? null,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase
      .from("reading_plan_entries")
      .upsert(chunk, { onConflict: "plan_id,date" });
    if (error) {
      console.error(`${file}: failed to upsert entries: ${error.message}`);
      process.exit(1);
    }
  }
  console.log(`${plan.id}: upserted ${rows.length} entries from ${file}`);
}
