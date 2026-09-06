# Loxo Automation Commands Reference

This is a provider-neutral action vocabulary for a declared host browser
adapter. It is not a runnable command list. The adapter must be identified by
the host and the exact job/candidate/action must be authorized before use.

## Common Commands List

### Candidate Management

| Command | Steps |
|---------|-------|
| Search for candidates | 1. Navigate to People section 2. Use search bar 3. Enter search terms 4. Show results |
| View candidate profile | 1. Click on candidate name 2. Display profile 3. Ask user which fields to check |
| View candidate experience | Ask user where experience field is → then navigate to that section |
| View resume | Ask user where resume is → then click to view |
| Update candidate | 1. Open candidate profile 2. Click Edit 3. Make changes 4. Save |

### Sourcing

| Command | Steps |
|---------|-------|
| Loxo Source search | 1. Navigate to Source 2. Enter search terms 3. Run search 4. Show results |
| AI-matched candidates | 1. Navigate to AI feature 2. View matches 3. Select candidates |
| Import CSV | 1. Navigate to Import 2. Upload file 3. Map fields 4. Confirm |

### Job Management

| Command | Steps |
|---------|-------|
| View all jobs | 1. Navigate to Jobs 2. Show job list |
| View job applicants | 1. Open job 2. Go to Applied column 3. List candidates |
| View job details | 1. Click job name 2. Show details and requirements |

### Outreach

| Command | Steps |
|---------|-------|
| Create email template | 1. Settings → Templates 2. New template 3. Create content |
| View templates | 1. Settings → Templates 2. Show list |
| Create campaign | 1. Outreach → Campaigns 2. New campaign 3. Configure |

### Pipeline

| Command | Steps |
|---------|-------|
| View pipeline | 1. Open job 2. Show pipeline view |
| Move candidate | 1. Select candidate 2. Drag to new stage OR click change stage |
| Bulk move | 1. Select multiple 2. Choose new stage 3. Confirm |

---

## How to Navigate

- Navigation, click, fill, snapshot, and screenshot are generic adapter
  operations. Do not substitute a provider-specific tool name here.

### Taking Breaks
- After major actions, take snapshot to verify
- Ask user to confirm before proceeding to next step

---

## Browser Location

The host supplies the current Loxo base URL and agency context. Do not invent
an agency ID or use a fixed machine/browser profile.

---

## Key Pages

| Page | URL Pattern |
|------|------------|
The host adapter resolves Jobs, People, Companies, Source, Outreach,
Campaigns, Settings, and Templates from the current session. Do not assume a
route is unchanged without a verified snapshot.

---

## Remember

- ALWAYS ask before executing
- NEVER assume field locations
- Ask user to point out key fields
- No export - only show results
