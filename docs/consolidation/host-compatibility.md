# Recruiting Host Compatibility

The repository-owned front door is `skills/recruiter/SKILL.md`. It is the only active recruiting skill entrypoint. Every host loads that router first and retrieves internal capability context only through the router.

| Host | Supported loading mode | Router-first rule | Cutover state |
| --- | --- | --- | --- |
| Codex | Repository instructions or MCP | Read `skills/recruiter/SKILL.md`, then use `recruiter_capability_get` for an internal guide. | No client repoint is active. |
| OpenCode | Repository instructions or MCP | Read `skills/recruiter/SKILL.md`, then use `recruiter_capability_get` for an internal guide. | No client repoint is active. |
| Hermes | Repository instructions or native MCP | Read `skills/recruiter/SKILL.md`, then use `recruiter_capability_get` for an internal guide. | No client repoint is active. |
| Claude | Repository instructions or MCP | Read `skills/recruiter/SKILL.md`, then use `recruiter_capability_get` for an internal guide. | No client repoint is active. |
| Gemini | Repository instructions or MCP | Read `skills/recruiter/SKILL.md`, then use `recruiter_capability_get` for an internal guide. | No client repoint is active. |
| Generic MCP | Streamable HTTP MCP | Call `skill_get` with `recruiter`, then call `recruiter_capability_get` for an internal guide. | No client repoint is active. |

No host may register an internal module as a standalone skill. No host may write to Loxo, send Gmail, submit a candidate, or decide an approval through MCP. A host may create a Gmail draft only when the declared draft-only tool and its human-review gate are available.

This matrix is compatibility documentation, not authorization to change host configuration. Repointing a client requires a separately approved cutover.
