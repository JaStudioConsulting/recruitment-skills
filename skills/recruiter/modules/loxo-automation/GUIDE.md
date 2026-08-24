---
name: loxo-automation
description: Restricted Loxo browser action guide. Default output is read-only findings or an unsaved manual draft. A Loxo mutation requires separately named human authorization and a verified allowed browser tool in the current host.
allowed-tools:
  - chrome-devtools_*
  - Bash
  - Read
---

# Loxo Automation Skill

## Restricted-action gate

This is not a general permission to operate Loxo. Without both (1) Ja's separate named authorization for the exact record and action and (2) a verified allowed browser tool in the active host, stop at read-only inspection or an unsaved draft. Never treat AI confirmation, a `confirm` field, or a pending approval record as human authorization.

## When to Use This Skill

Use this skill when user wants to:
- Search for candidates in Loxo
- View candidates who applied to a job
- Create or edit email templates
- Create outreach campaigns
- Move candidates in pipeline
- View job details and requirements
- Any task requiring navigation inside Loxo

## IMPORTANT: Workflow Rules

### ALWAYS Follow This Process

1. **User gives task** - User tells you what they want to do
2. **LIST what you will do** - Write out each step in order
3. **WAIT for approval** - Do NOT proceed until user says "go" or "yes"
4. **Verify allowed tool and named authorization** - Confirm the active host exposes the approved browser tool and Ja named the exact target/action.
5. **Execute** - Open browser and perform the authorized task
6. **Show results** - Display results on screen
7. **Ask if saved** - Ask "Do you want me to save this?" (user said NO export, so mostly just show)

### Critical Rules

- **NEVER assume** where fields are located - ALWAYS ask user to confirm
- **NEVER guess** at candidate data - ask which fields to check
- **ALWAYS ask** if unsure about anything
- **NO export** - user does not want data exported, only shown on screen
- **Use a declared host browser tool** - never assume a named browser or automation surface exists.

## Base URL

Loxo login: `https://app.loxo.co`

User's agency: `https://app.loxo.co/agencies/{agencyId}`

## Tasks You Can Perform

### 1. Sourcing Candidates

| Task | How |
|------|-----|
| Loxo Source search | Navigate to Source section, enter search terms |
| AI-matched candidates | Navigate to AI matching feature |
| CSV import | Navigate to Import feature |

### 2. Candidate Management

| Task | How |
|------|-----|
| Search candidates | Use People search bar |
| View candidate profile | Click candidate name |
| View candidate experience | Ask user where experience field is, then check |
| View resume | Ask user where resume is located, then access |
| Update candidate | Click edit on candidate profile |

### 3. Job Management

| Task | How |
|------|-----|
| View all jobs | Navigate to Jobs section |
| View job applicants | Open job, go to Applied column |
| View job details | Click on job name |
| Check requirements | View job description and requirements |

### 4. Outreach

| Task | How |
|------|-----|
| Create email template | Navigate to Settings → Templates |
| Create campaign | Navigate to Outreach → Campaigns |
| View templates | Go to Templates section |

### 5. Pipeline Management

| Task | How |
|------|-----|
| View pipeline | Navigate to job pipeline view |
| Move candidate | Drag/drop or click stage change |
| Bulk update | Select multiple, change stage |

## How to Execute Tasks

### Step 1: Open Browser
```bash
# Use only a browser adapter declared by the active host.
# The agency URL must come from host configuration.
```

### Step 2: Navigate
- Use chrome-devtools_navigate_page to go to URLs
- Use chrome-devtools_click to click elements
- Use chrome-devtools_take_snapshot to see current state

### Step 3: Verify
- Take snapshots to verify you're on right page
- Ask user to confirm if fields are where you expect

### Step 4: Report
- Show results on screen using snapshot
- Describe what you found

## Conversation Templates

### When User Gives Task:
```
"You: [task description]"

"Me: I'll help with that. Here's what I will do:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Do you want me to proceed?"
```

### When Need to Ask:
```
"I need to confirm something: [question]

Can you show me where [field] is in Loxo?"
```

### When Showing Results:
```
"Here's what I found:
[description of results]

[Key information about candidates/jobs/etc]"
```

## First Task Protocol

For the VERY FIRST task with a new user:
1. Ask user to log into Loxo manually first
2. Ask which browser to use (confirmed: Atlas)
3. Navigate to the relevant section together
4. Ask user to point out key fields before proceeding

## Important Notes

- User works on external monitor
- Browser automation opens on MacBook screen
- User can continue working while you automate
- NO export - only show on screen
- Always ask, never assume
- Wait for approval before every action

## See Also

- [Loxo operating guide](../loxo/GUIDE.md) - repository-owned Loxo knowledge and safety rules
- Firecrawl - optional external public-web integration declared in `skills/manifests/plugins.json`
