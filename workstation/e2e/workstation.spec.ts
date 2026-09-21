import { expect, test, type Page } from "@playwright/test";

const JOB_TITLE = "Maintenance Manager";
const CLIENT_NAME = "Beacon Manufacturing";
const CANDIDATE_NAME = "Avery North";
const CURRENT_TITLE = "Maintenance Supervisor";

const JOB_DESCRIPTION = `Job Description
Job Title: ${JOB_TITLE}
Company: ${CLIENT_NAME}
Location: Toronto, Ontario

About the role
Lead preventive maintenance planning for a synthetic manufacturing operation.

Responsibilities
Coordinate maintenance schedules, support safety reviews, and partner with operations.

Qualifications
Manufacturing maintenance leadership and CMMS planning experience.

Requirements
Clear written communication and team leadership.`;

const RESUME = `${CANDIDATE_NAME}
${CURRENT_TITLE}
Toronto, Ontario

Professional Summary
Maintenance leader with preventive maintenance and safety experience in synthetic manufacturing.

Core Competencies
Preventive Maintenance, CMMS, Team Leadership, Safety

Professional Experience
${CURRENT_TITLE}
Atlas Components
January Two Thousand Twenty to Present
- Led preventive maintenance planning for production equipment.
- Coordinated safety reviews with operations.

Education
Mechanical Technology Diploma

Certifications
Synthetic Safety Training`;

const CALL_NOTES = `Compensation Target: One hundred twenty thousand dollars
Current Compensation: One hundred ten thousand dollars
Vacation: Three weeks
Location: Toronto, Ontario
Work Status: Canadian citizen
Interview Availability: Tuesday afternoon
Notice Period: Three weeks
Reason for Leaving: Plant closure`;

const SAVED_PROFILE = "Avery North leads preventive maintenance planning for synthetic operations.";

function contextSelect(page: Page, name: "Job folder" | "Candidate") {
  return page.locator(".context-control").filter({ hasText: name }).locator("select");
}

function recordOffOriginRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") requests.push(request.url());
  });
  return requests;
}

async function pasteCandidateSource(page: Page, text: string, expectedFilename: string) {
  await page.locator(".source-controls").getByRole("button", { name: "Paste text" }).click();
  const dialog = page.getByRole("dialog", { name: "Paste candidate source" });
  await dialog.locator("textarea").fill(text);
  await expect(dialog).toContainText(expectedFilename);
  await dialog.getByRole("button", { name: "Save candidate source" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".source-row").filter({ hasText: expectedFilename })).toBeVisible();
}

test("signs into the isolated Workstation with the local ChatGPT auth shim", async ({ page }) => {
  const offOriginRequests = recordOffOriginRequests(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Recruiter Workstation" })).toBeVisible();
  await expect(page.locator(".operator-name")).toHaveText("Seedy");
  expect(offOriginRequests).toEqual([]);
});

test("shows all canonical workflows and keeps the conflicted branded resume blocked", async ({ page }) => {
  const offOriginRequests = recordOffOriginRequests(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Workflows 24/ }).click();

  const dialog = page.getByRole("dialog", { name: "Recruiting workflows" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("All 24 canonical repository capabilities");

  const workflowButtons = dialog.locator("nav[aria-label='Repository workflows'] section > button");
  await expect(workflowButtons).toHaveCount(24);
  const detail = dialog.locator("article.workflow-detail");
  await expect(detail.getByRole("button", { name: "Draft candidate package" })).toBeDisabled();

  await workflowButtons.filter({ hasText: "brandedresume" }).click();
  await expect(detail.getByRole("heading", { name: "brandedresume" })).toBeVisible();
  await expect(detail).toContainText("Blocked by");
  await expect(detail).toContainText("active authorities conflict");
  await expect(detail.locator("section.workflow-execution")).toHaveCount(0);
  expect(offOriginRequests).toEqual([]);
});

test("persists a source-grounded draft and explicit human edit across reload", async ({ page }) => {
  const offOriginRequests = recordOffOriginRequests(page);

  await page.goto("/");

  const sourceFirst = page.getByRole("region", { name: "Create a Job from its source" });
  await sourceFirst.getByRole("button", { name: "Paste the whole JD" }).click();
  let pasteDialog = page.getByRole("dialog", { name: "Paste Job source" });
  await pasteDialog.locator("textarea").fill(JOB_DESCRIPTION);
  await expect(pasteDialog).toContainText("Job description");
  await expect(pasteDialog).toContainText("Complete Job identity detected");
  await expect(pasteDialog.getByLabel("Job title")).toHaveValue(JOB_TITLE);
  await expect(pasteDialog.getByLabel("Company or client")).toHaveValue(CLIENT_NAME);
  await pasteDialog.getByRole("button", { name: "Create Job and save source" }).click();
  await expect(pasteDialog).toBeHidden();

  const jobSelect = contextSelect(page, "Job folder");
  await expect(jobSelect.locator("option").filter({ hasText: `${JOB_TITLE} · ${CLIENT_NAME}` })).toHaveCount(1);
  await expect(page.locator(".job-source-chip").filter({ hasText: "Job description" })).toHaveCount(1);

  await jobSelect.selectOption("");
  await expect(sourceFirst).toBeVisible();
  await sourceFirst.getByRole("button", { name: "Paste the whole JD" }).click();
  pasteDialog = page.getByRole("dialog", { name: "Paste Job source" });
  await pasteDialog.locator("textarea").fill(JOB_DESCRIPTION);
  await pasteDialog.getByRole("button", { name: "Create Job and save source" }).click();
  await expect(pasteDialog).toBeHidden();
  await expect(jobSelect.locator("option").filter({ hasText: `${JOB_TITLE} · ${CLIENT_NAME}` })).toHaveCount(1);
  await expect(page.locator(".job-source-chip").filter({ hasText: "Job description" })).toHaveCount(2);

  await page.getByRole("button", { name: "Add candidate" }).click();
  const candidateDialog = page.getByRole("dialog", { name: "Add candidate" });
  await candidateDialog.getByLabel("Candidate name").fill(CANDIDATE_NAME);
  await candidateDialog.getByLabel("Current title").fill(CURRENT_TITLE);
  await candidateDialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(candidateDialog).toBeHidden();
  await expect(contextSelect(page, "Candidate").locator("option").filter({ hasText: CANDIDATE_NAME })).toHaveCount(1);
  await expect(page.locator(".job-breadcrumb")).toContainText(CANDIDATE_NAME);

  await pasteCandidateSource(page, RESUME, `${CANDIDATE_NAME} - Resume.txt`);
  await pasteCandidateSource(page, CALL_NOTES, "Pasted transcript.txt");
  await expect(page.getByRole("region", { name: "Candidate case actions" })).toContainText("Sources ready");

  await page.getByRole("button", { name: "Create after-call package" }).click();
  const actionMessage = page.locator("output.action-message");
  await expect(actionMessage).toContainText("Draft outputs were saved as read-only previews", { timeout: 15_000 });
  await expect(page.getByText("Read-only preview", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Candidate submission" })).toBeVisible();
  await expect(page.locator("article.output-preview")).toContainText(CANDIDATE_NAME);
  await expect(page.locator("article.output-preview")).toContainText("One hundred twenty thousand dollars");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const profileSummary = page.getByLabel("Profile Summary");
  await profileSummary.fill("Cancelled text must not persist");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(actionMessage).toContainText("Output edit cancelled");
  await expect(page.locator("article.output-preview")).not.toContainText("Cancelled text must not persist");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Profile Summary").fill(SAVED_PROFILE);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(actionMessage).toContainText("Saved edited submission revision");
  await expect(page.getByText("Read-only preview", { exact: true })).toBeVisible();
  await expect(page.locator("article.output-preview")).toContainText(SAVED_PROFILE);

  const versionSelect = page.getByLabel("Version");
  await expect(versionSelect.locator("option")).toHaveCount(3);
  await expect(versionSelect.locator("option:checked")).toHaveText("Current · v3");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Recruiter Workstation" })).toBeVisible();
  await expect(contextSelect(page, "Job folder").locator("option:checked")).toHaveText(`${JOB_TITLE} · ${CLIENT_NAME}`);
  await expect(contextSelect(page, "Candidate").locator("option:checked")).toContainText(CANDIDATE_NAME);
  await expect(page.locator(".source-row").filter({ hasText: `${CANDIDATE_NAME} - Resume.txt` })).toBeVisible();
  await page.getByRole("button", { name: "Open outputs" }).click();
  await expect(page.locator("article.output-preview")).toContainText(SAVED_PROFILE);
  await expect(page.getByLabel("Version").locator("option")).toHaveCount(3);

  await page.getByRole("button", { name: /Workflows 24/ }).click();
  const workflowDialog = page.getByRole("dialog", { name: "Recruiting workflows" });
  await expect(workflowDialog.locator("section.workflow-runs")).toContainText("draft ready");
  await expect(workflowDialog.locator("section.workflow-runs")).toContainText("4 persisted outputs");

  await workflowDialog.locator("nav[aria-label='Repository workflows'] section > button")
    .filter({ hasText: "offer-letter" })
    .click();
  const offerDetail = workflowDialog.locator("article.workflow-detail");
  await expect(offerDetail).toContainText("Interface only");
  await expect(offerDetail.getByLabel(/Candidate full name/)).toHaveValue(CANDIDATE_NAME);
  await expect(offerDetail.getByLabel(/^Job title/)).toHaveValue(JOB_TITLE);
  await expect(offerDetail.getByLabel(/Company Name/)).toHaveValue(CLIENT_NAME);
  await expect(offerDetail).toContainText("implementation is not mounted");
  await expect(offerDetail).toContainText("nothing will run or be saved");
  await expect(offerDetail.locator("section.workflow-execution")).toHaveCount(0);

  expect(offOriginRequests).toEqual([]);
});
