# Loxo Automation Commands Reference

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

### Navigation Commands
- `chrome-devtools_navigate_page` - Go to URL
- `chrome-devtools_click` - Click elements
- `chrome-devtools_fill` - Enter text
- `chrome-devtools_take_snapshot` - See current page
- `chrome-devtools_take_screenshot` - Take screenshot

### Taking Breaks
- After major actions, take snapshot to verify
- Ask user to confirm before proceeding to next step

---

## Browser Location

- User's Loxo: `https://app.loxo.co/agencies/{agencyId}`
- Jobs: `https://app.loxo.co/agencies/{agencyId}/jobs`
- People: `https://app.loxo.co/agencies/{agencyId}/people`
- Source: `https://app.loxo.co/agencies/{agencyId}/source`

---

## Key Pages

| Page | URL Pattern |
|------|------------|
| Jobs | /jobs |
| People | /people |
| Companies | /companies |
| Source | /source |
| Outreach | /outreach |
| Campaigns | /outreach/campaigns |
| Settings | /settings |
| Templates | /settings/templates |

---

## Remember

- ALWAYS ask before executing
- NEVER assume field locations
- Ask user to point out key fields
- No export - only show results