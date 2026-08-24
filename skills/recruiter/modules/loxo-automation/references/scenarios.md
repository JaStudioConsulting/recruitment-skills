# Loxo Automation - Example Scenarios

## Scenario Templates

### Example 1: Search Candidates
```
User: "Search for Python developers"
Response:
"I'll help with that. Here's what I will do:
1. Open Loxo with the browser adapter declared by the active host
2. Navigate to People section
3. Enter "Python developer" in search
4. Show you the results

Do you want me to proceed?"
```

### Example 2: View Job Applicants
```
User: "Show me candidates who applied to Job #123"
Response:
"I'll help with that. Here's what I will do:
1. Open Loxo with the browser adapter declared by the active host
2. Navigate to Jobs section
3. Open Job #123
4. Go to Applied column
5. List all candidates in that column

Do you want me to proceed?"
```

### Example 3: Create Email Template
```
User: "Create an email template for initial outreach"
Response:
"I'll help with that. Here's what I will do:
1. Open Loxo with the browser adapter declared by the active host
2. Navigate to Settings → Templates
3. Click to create new template
4. Enter template name and content

Do you want me to proceed?

What content should I include in the template?"
```

### Example 4: Create Campaign
```
User: "Start a campaign for Java developers"
Response:
"I'll help with that. Here's what I will do:
1. Open Loxo with the browser adapter declared by the active host
2. Navigate to Outreach → Campaigns
3. Click to create new campaign
4. Set up campaign details

Do you want me to proceed?

Which candidates should I include in this campaign?"
```

### Example 5: Move Candidates in Pipeline
```
User: "Move these candidates to interview stage"
Response:
I'll help with that. Here's what I will do:
1. Open the job pipeline
2. Select the candidates you want to move
3. Drag to "Interview" stage (or click stage change)

Do you want me to proceed?

Which specific candidates should I move?"
```

---

## Questions to Ask Before Executing

| Situation | Question to Ask |
|----------|----------------|
| Search terms | "What search terms should I use?" |
| Job selection | "Which job do you want me to look at?" |
| Candidates to move | "Which candidates should I move?" |
| Template content | "What should the template say?" |
| Campaign setup | "What should be the campaign criteria?" |
| Field locations | "Can you show me where [field] is?" |

---

## Response Format

### Approved Task:
```
Executing now...
[Actions progress]
[Results on screen]
```

### Needs More Info:
```
I need a bit more information:
- [Question 1]
- [Question 2]

Can you provide these details?"
```

### Field Location Unknown:
```
I want to make sure I look in the right place.

Can you show me where [field] is in Loxo?"
```

---

## Key Reminders

1. Always list what you will do first
2. Wait for "go" or "yes" before executing
3. Ask if you don't know something
4. No guessing - always ask
5. Show results on screen only
6. Use only the browser adapter declared by the active host
