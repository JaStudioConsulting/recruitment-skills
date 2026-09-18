import assert from "node:assert/strict";
import test from "node:test";
import { getRecruiterAuthority, getSkillsRoot, readSkillText, resolveSkillPath } from "../lib/index.js";

test("resolver exposes the recruiter-only authority without node_modules assumptions", async () => {
  const authority = await getRecruiterAuthority();
  assert.equal(authority.id, "recruiter");
  assert.equal(authority.capabilities.length, 24);
  assert.match(authority.routerFile, /skills\/recruiter\/SKILL\.md$/);
  assert.equal(resolveSkillPath("recruiter/SKILL.md"), authority.routerFile);
  assert.match(await readSkillText("recruiter/SKILL.md"), /ONLY recruiting entrypoint/);
  assert.match(getSkillsRoot(), /skills$/);
});

test("resolver rejects paths outside the package", () => {
  assert.throws(() => resolveSkillPath("../package.json"), RangeError);
});
