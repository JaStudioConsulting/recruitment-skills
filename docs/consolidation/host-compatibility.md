# Recruiting Host Compatibility

The repository-owned front door is `skills/recruiter/SKILL.md`. Every host loads
it first, including the tracker-manager compatibility entry. Local shared-path
cutover for Codex, Claude, Hermes, and Gemini is authorized; use [CUTOVER.md](CUTOVER.md)
and the local receipt to verify actual installation. Other hosts remain pending.

| Host | Supported loading mode | Router-first rule | Cutover state |
| --- | --- | --- | --- |
| Codex | Verified shared repository | Run authority ensure, then load canonical router/module paths. | Verify local receipt and symlinks. |
| OpenCode | Repository instructions or MCP | Read `skills/recruiter/SKILL.md`, then use `recruiter_capability_get` for an internal guide. | No client repoint is active. |
| Hermes | Verified shared repository | Run authority ensure, then load canonical router/module paths. | Verify local receipt and symlinks. |
| Claude | Verified shared repository | Run authority ensure, then load canonical router/module paths. | Verify local receipt and symlinks. |
| Gemini | Verified shared repository | Resolve the canonical shared repository through `~/.agents/skills`, then load `skills/recruiter/SKILL.md` first. | Active; verify receipt, realpaths, and resolver output. |
| Generic MCP | Streamable HTTP MCP | Call `skill_get` with `recruiter`, then call `recruiter_capability_get` for an internal guide. | No client repoint is active. |

No host may register an internal module as a standalone skill. No host may write to Loxo, send Gmail, submit a candidate, or decide an approval through MCP. A host may create a Gmail draft only when the declared draft-only tool and its human-review gate are available.

For Gemini, the canonical resolver root is `~/.agents/skills` pointing to the
verified shared skills directory. Gemini loads both `~/.agents/skills` and
`~/.gemini/skills`; do not register `recruiter` in `.gemini/skills`, because the
duplicate conflicts with the canonical `.agents` registration and `.agents`
overrides it. Verify with:

```bash
gemini skills list
```

Acceptance requires one `recruiter` registration resolved through `.agents`, no
duplicate `.gemini` registration, and the displayed path/commit matching the
verified installation receipt.

The local shared cutover was authorized on 2026-09-02. Do not infer permission
to repoint another machine or cloud consumer from that local installation.
