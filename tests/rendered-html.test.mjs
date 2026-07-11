import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("exports a secure static SkillQuest page", async () => {
  const [html, client] = await Promise.all([
    readFile(new URL("out/index.html", root), "utf8"),
    readFile(new URL("lib/supabase.ts", root), "utf8"),
  ]);

  assert.match(html, /SkillQuest/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /lang="th"/);
  assert.doesNotMatch(client, /service[_-]?role/i);
  assert.match(client, /sb_publishable_/);
});
