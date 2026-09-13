# Adding a skill or a tool

This repo keeps three things in separate, enforced places. Put a new item in the
right one. The validator (`npm run validate`) and tests fail if they are mixed up.

| You are adding | It goes in | It is |
|---|---|---|
| A **skill** (a workflow, the "how we do X") | a new `skills/recruiter/modules/<name>/GUIDE.md`, registered in `skills/capabilities.json`, and routed in `skills/recruiter/SKILL.md` | prose plus optional scripts and references |
| A **tool** (a capability the host runs) | one entry in `skills/manifests/tools.json` | a named contract only, never an implementation |
| A **connector** (an outside system) | one entry in `skills/manifests/plugins.json` | Loxo, Google Workspace, Neo4j, and so on |
| A **rule or tool convention** | `skills/_JA-RULES.md` (house rules) or `skills/_TOOL-MAP.md` (how tools behave) | policy, not a workflow |

A skill is never declared in `tools.json`, and a tool is never a `GUIDE.md`. See
[START-HERE.md](START-HERE.md) for the plain-language map of the whole layout.

## Add a skill

1. Create `skills/recruiter/modules/<name>/GUIDE.md`. State the workflow steps and,
   near the top, the **output shape** the front door will show before producing.
   Keep scripts in `scripts/`, references in `references/`, assets in `assets/`.
2. Register it in `skills/capabilities.json` as
   `{ "id": "<name>", "path": "recruiter/modules/<name>/GUIDE.md", "group": "...", "status": "active" }`.
3. Add a routing row in `skills/recruiter/SKILL.md`: the intent, the module path,
   the **Output shape (show first)**, the tool it uses, and the "done only when" gate.
   If it is a big enough output, add its full form to the Output contracts section.
4. Do not register it as a separate top-level skill. Modules are reached only
   through the `recruiter` front door. That is the single entrypoint by design.
5. Update the count wording in `SKILL.md` if you reference a total.

## Add a tool

1. Add one entry to `skills/manifests/tools.json` under `tools`.
2. Keep the safety boundaries: never remove `gmail_send`, `candidate_submit`,
   `loxo_write`, `approval_decide`, or `external_delete` from `forbidden_mcp_actions`.
   Anything that reaches the outside world stays read-only or gated on Ja's yes.
3. The repo declares the contract only. The host implements the tool.

## Add a connector

Add one entry to `skills/manifests/plugins.json` under `integrations`, with its
`allowed` and `forbidden` actions and `credentials` source. Credentials are never
stored in this repo.

## Before you push

```bash
npm run validate    # capability count, routes resolve, safety boundaries, no secrets
npm test            # contract tests
npm run check:python
npm run pack:check
```

Green across all four means it is wired correctly. Never commit real candidate or
client data, credentials, or local machine paths. All examples must be synthetic.
