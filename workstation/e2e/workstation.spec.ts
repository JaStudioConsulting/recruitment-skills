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

const AUTO_JOB_SOURCE_FILENAME = "Candidate Resume.txt";
const AUTO_JOB_SOURCE = `What you'll do
Duties
Who you are
Skills
Coordinate preventive maintenance planning.`;
const AUTO_CANDIDATE_SOURCE_FILENAME = "JD Smith Resume.txt";
const AUTO_CANDIDATE_SOURCE = `Jordan Smith
Experience
Maintenance Supervisor
Education
Mechanical Technology Diploma
Skills
CMMS and preventive maintenance`;

const SAVED_PROFILE = "Avery North leads preventive maintenance planning for synthetic operations.";
const SAVED_RESUME_SUMMARY = "Avery North leads source-grounded preventive maintenance programs.";
const RECOVERED_CANDIDATE_NAME = "Morgan Dale";
const RECOVERED_CANDIDATE_TITLE = "Maintenance Planner";
const AMBIGUOUS_CANDIDATE_SOURCE = "Career background supplied for recruiter review.";
const RECOVERY_JOB_TITLE = "Maintenance Planning Manager";
const RECOVERY_CLIENT_NAME = "Recovery Manufacturing Inc.";

function recordOffOriginRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") requests.push(request.url());
  });
  return requests;
}

async function openJobOptions(page: Page) {
  await page.getByRole("button", { name: "Job options" }).click();
}

async function openTextSource(page: Page, destination?: "job" | "candidate" | "new_candidate") {
  await page.getByRole("button", { name: "Add files or paste text" }).click();
  const dialog = page.getByRole("dialog", { name: "Add sources" });
  if (destination) await dialog.getByLabel("Source destination").selectOption(destination);
  await dialog.getByRole("button", { name: "Text input" }).click();
}

async function pasteCandidateSource(page: Page, text: string, expectedFilename: string) {
  await openTextSource(page, "candidate");
  const dialog = page.getByRole("dialog", { name: "Paste candidate source" });
  await dialog.locator("textarea").fill(text);
  await expect(dialog).toContainText(expectedFilename);
  await dialog.getByRole("button", { name: "Save candidate source" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("tab", { name: "Sources" }).click();
  await expect(page.locator(".source-library-row").filter({ hasText: expectedFilename })).toBeVisible();
  await page.getByRole("tab", { name: "Work" }).click();
}

test("signs into the isolated Workstation with the local ChatGPT auth shim", async ({ page }) => {
  const offOriginRequests = recordOffOriginRequests(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Recruiter Workstation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add files or paste text" })).toBeVisible();
  await expect(page.locator(".operator-name")).toHaveCount(0);
  await expect(page.getByText("One workspace. From conversation to submission.")).toHaveCount(0);
  expect(offOriginRequests).toEqual([]);
});

test("keeps the project and source composer usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByLabel("Job folder")).toBeVisible();
  await expect(page.getByRole("button", { name: "Job options" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add files or paste text" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Work" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Sources" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole("button", { name: "Add files or paste text" }).click();
  const dialog = page.getByRole("dialog", { name: "Add sources" });
  await expect(dialog.getByRole("button", { name: "Upload" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Text input" })).toBeVisible();
  await expect(dialog.getByText(/library|Google Drive|Slack/i)).toHaveCount(0);
});

test("deletes a Job only after explicit confirmation and keeps it gone after reload", async ({ page }) => {
  await page.goto("/");
  await openJobOptions(page);
  await page.getByRole("menuitem", { name: "Add Job manually" }).click();
  const createDialog = page.getByRole("dialog", { name: "New Job folder" });
  await createDialog.getByLabel("Job title").fill("Delete Test Job");
  await createDialog.getByLabel("Client or company").fill("Delete Test Co");
  await createDialog.getByRole("button", { name: "Add" }).click();

  const jobSelect = page.getByLabel("Job folder");
  await expect(jobSelect.locator("option").filter({ hasText: "Delete Test Job · Delete Test Co" })).toHaveCount(1);

  await openJobOptions(page);
  await page.getByRole("menuitem", { name: "Delete Job" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete this Job?" });
  await expect(deleteDialog).toContainText("candidate cases, attached sources, notes, drafts and generated artifacts");
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(jobSelect.locator("option").filter({ hasText: "Delete Test Job · Delete Test Co" })).toHaveCount(1);

  await openJobOptions(page);
  await page.getByRole("menuitem", { name: "Delete Job" }).click();
  await page.getByRole("alertdialog", { name: "Delete this Job?" }).getByRole("button", { name: "Delete Job" }).click();
  await expect(jobSelect.locator("option").filter({ hasText: "Delete Test Job · Delete Test Co" })).toHaveCount(0);
  await page.reload();
  await expect(jobSelect.locator("option").filter({ hasText: "Delete Test Job · Delete Test Co" })).toHaveCount(0);
});

test("shows all canonical workflows and mounts the canonical A branded resume", async ({ page }) => {
  const offOriginRequests = recordOffOriginRequests(page);
  await page.goto("/");
  await openJobOptions(page);
  await page.getByRole("menuitem", { name: "Workflows" }).click();

  const dialog = page.getByRole("dialog", { name: "Recruiting workflows" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("All 24 canonical repository capabilities");

  const workflowButtons = dialog.locator("nav[aria-label='Repository workflows'] section > button");
  await expect(workflowButtons).toHaveCount(24);
  const detail = dialog.locator("article.workflow-detail");
  await expect(detail.getByRole("button", { name: "Draft candidate package" })).toBeDisabled();

  await workflowButtons.filter({ hasText: "brandedresume" }).click();
  await expect(detail.getByRole("heading", { name: "brandedresume" })).toBeVisible();
  await expect(detail).toContainText("What is incomplete");
  await expect(detail).toContainText("canonical A layout");
  await expect(detail.getByLabel("Presentation mode")).toBeVisible();
  await expect(detail.getByLabel("Presentation mode")).toHaveValue("");
  await expect(detail.getByRole("button", { name: "Build branded resume" })).toBeDisabled();
  await expect(detail.getByRole("region", { name: "Workflow execution" }))
    .toContainText("Select a Job folder and candidate before running this workflow.");
  expect(offOriginRequests).toEqual([]);
});

test("persists a source-grounded draft and explicit human edit across reload", async ({ page }) => {
  const offOriginRequests = recordOffOriginRequests(page);

  await page.goto("/");

  await openTextSource(page);
  let pasteDialog = page.getByRole("dialog", { name: "Paste Job source" });
  await pasteDialog.locator("textarea").fill(JOB_DESCRIPTION);
  await expect(pasteDialog).toContainText("Job description");
  await expect(pasteDialog).toContainText("Complete Job identity detected");
  await expect(pasteDialog.getByLabel("Job title")).toHaveValue(JOB_TITLE);
  await expect(pasteDialog.getByLabel("Company or client")).toHaveValue(CLIENT_NAME);
  await pasteDialog.getByRole("button", { name: "Create Job and save source" }).click();
  await expect(pasteDialog).toBeHidden();

  const jobSelect = page.getByLabel("Job folder");
  await expect(jobSelect.locator("option").filter({ hasText: `${JOB_TITLE} · ${CLIENT_NAME}` })).toHaveCount(1);
  await page.getByRole("tab", { name: "Sources" }).click();
  await expect(page.getByRole("region", { name: "Sources" }).locator(".source-library-row").filter({ hasText: "Job description" })).toHaveCount(1);

  await page.getByRole("button", { name: "Add source" }).first().click();
  let addSources = page.getByRole("dialog", { name: "Add sources" });
  await addSources.locator("input[type='file']").setInputFiles({
    name: AUTO_JOB_SOURCE_FILENAME,
    mimeType: "text/plain",
    buffer: Buffer.from(AUTO_JOB_SOURCE),
  });
  const autoJobSource = page.locator(".source-library-row").filter({ hasText: AUTO_JOB_SOURCE_FILENAME });
  await expect(autoJobSource.locator(".source-row-copy span")).toHaveText("Job description");
  await autoJobSource.getByRole("button", { name: `Edit type for ${AUTO_JOB_SOURCE_FILENAME}` }).click();
  await autoJobSource.getByLabel(`Source type for ${AUTO_JOB_SOURCE_FILENAME}`).selectOption("call_notes");
  await autoJobSource.getByRole("button", { name: `Cancel type edit for ${AUTO_JOB_SOURCE_FILENAME}` }).click();
  await expect(autoJobSource.locator(".source-row-copy span")).toHaveText("Job description");
  await autoJobSource.getByRole("button", { name: `Edit type for ${AUTO_JOB_SOURCE_FILENAME}` }).click();
  await autoJobSource.getByLabel(`Source type for ${AUTO_JOB_SOURCE_FILENAME}`).selectOption("call_notes");
  await autoJobSource.getByRole("button", { name: `Save type for ${AUTO_JOB_SOURCE_FILENAME}` }).click();
  await expect(autoJobSource.locator(".source-row-copy span")).toHaveText("Client notes");

  await page.getByRole("tab", { name: "Work" }).click();
  await jobSelect.selectOption("");
  await openTextSource(page);
  pasteDialog = page.getByRole("dialog", { name: "Paste Job source" });
  await pasteDialog.locator("textarea").fill(JOB_DESCRIPTION);
  await pasteDialog.getByRole("button", { name: "Create Job and save source" }).click();
  await expect(pasteDialog).toBeHidden();
  await expect(jobSelect.locator("option").filter({ hasText: `${JOB_TITLE} · ${CLIENT_NAME}` })).toHaveCount(1);
  await page.getByRole("tab", { name: "Sources" }).click();
  await expect(page.locator(".source-library-row").filter({ has: page.locator(".source-row-copy span", { hasText: /^Job description$/ }) })).toHaveCount(1);
  await page.getByRole("tab", { name: "Work" }).click();

  await openTextSource(page, "new_candidate");
  const candidateDialog = page.getByRole("dialog", { name: "Paste candidate source" });
  await candidateDialog.locator("textarea").fill(RESUME);
  await expect(candidateDialog.getByLabel("Candidate name")).toHaveValue(CANDIDATE_NAME);
  await expect(candidateDialog.getByLabel("Current title")).toHaveValue(CURRENT_TITLE);
  await candidateDialog.getByRole("button", { name: "Create candidate and save source" }).click();
  await expect(candidateDialog).toBeHidden();
  await expect(page.locator(".candidate-row").filter({ hasText: CANDIDATE_NAME })).toHaveClass(/active/);

  await openTextSource(page, "new_candidate");
  const repeatedCandidateDialog = page.getByRole("dialog", { name: "Paste candidate source" });
  await repeatedCandidateDialog.locator("textarea").fill(RESUME);
  await repeatedCandidateDialog.getByRole("button", { name: "Create candidate and save source" }).click();
  await expect(repeatedCandidateDialog).toBeHidden();
  await expect(page.locator(".candidate-row").filter({ hasText: CANDIDATE_NAME })).toHaveCount(1);
  await page.getByRole("tab", { name: "Sources" }).click();
  await expect(page.locator(".source-library-row").filter({ hasText: `${CANDIDATE_NAME} - Resume.txt` })).toHaveCount(1);
  await page.getByRole("tab", { name: "Work" }).click();

  const colorPicker = page.locator("#clr-picker");
  await expect(colorPicker).toHaveCount(1);
  await expect(colorPicker).toBeHidden();
  await expect.poll(async () => colorPicker.evaluate((element) => ({
    display: getComputedStyle(element).display,
    height: element.getBoundingClientRect().height,
  }))).toEqual({ display: "none", height: 0 });

  await page.getByRole("tab", { name: "Sources" }).click();
  await page.getByRole("button", { name: "Add source" }).nth(1).click();
  addSources = page.getByRole("dialog", { name: "Add sources" });
  await addSources.getByLabel("Source destination").selectOption("candidate");
  await addSources.locator("input[type='file']").setInputFiles({
    name: AUTO_CANDIDATE_SOURCE_FILENAME,
    mimeType: "text/plain",
    buffer: Buffer.from(AUTO_CANDIDATE_SOURCE),
  });
  const autoCandidateSource = page.locator(".source-library-row").filter({ hasText: AUTO_CANDIDATE_SOURCE_FILENAME });
  await expect(autoCandidateSource.locator(".source-row-copy span")).toHaveText("Resume");
  await expect(autoCandidateSource.locator(".source-status")).toHaveCount(0);
  await autoCandidateSource.getByRole("button", { name: `Edit type for ${AUTO_CANDIDATE_SOURCE_FILENAME}` }).click();
  await autoCandidateSource.getByLabel(`Source type for ${AUTO_CANDIDATE_SOURCE_FILENAME}`).selectOption("call_notes");
  await autoCandidateSource.getByRole("button", { name: `Cancel type edit for ${AUTO_CANDIDATE_SOURCE_FILENAME}` }).click();
  await expect(autoCandidateSource.locator(".source-row-copy span")).toHaveText("Resume");
  await autoCandidateSource.getByRole("button", { name: `Edit type for ${AUTO_CANDIDATE_SOURCE_FILENAME}` }).click();
  await autoCandidateSource.getByLabel(`Source type for ${AUTO_CANDIDATE_SOURCE_FILENAME}`).selectOption("call_notes");
  await autoCandidateSource.getByRole("button", { name: `Save type for ${AUTO_CANDIDATE_SOURCE_FILENAME}` }).click();
  await expect(autoCandidateSource.locator(".source-row-copy span")).toHaveText("Call notes");

  await page.getByRole("tab", { name: "Work" }).click();
  await pasteCandidateSource(page, CALL_NOTES, "Pasted call notes.txt");

  await page.getByRole("button", { name: "Create after-call package" }).click();
  await expect(page.getByRole("heading", { name: "Candidate submission" })).toBeVisible();
  await expect(page.locator("article.output-preview")).toContainText(CANDIDATE_NAME);
  await expect(page.locator("article.output-preview")).toContainText("One hundred twenty thousand dollars");

  await page.getByRole("tab", { name: "Resume", exact: true }).click();
  const resumePreview = page.getByLabel("TTTG branded resume preview");
  await expect(resumePreview.getByRole("img", { name: "Top Tier Talent Group" })).toBeVisible();
  await expect(resumePreview).toContainText("Summary");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Editable TTTG resume")).toBeVisible();
  await page.getByLabel("Summary").fill(SAVED_RESUME_SUMMARY);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(resumePreview).toContainText(SAVED_RESUME_SUMMARY);
  await page.getByRole("button", { name: "Output history" }).click();
  await expect(page.getByRole("menuitem", { name: "Current · v3" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "v2 · generated" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Email", exact: true }).click();
  const emailPreview = page.locator("article.output-preview");
  await expect(emailPreview.locator("h2")).toHaveCount(0);
  await expect(emailPreview).not.toContainText("Presentation email");
  await expect(emailPreview).toContainText("CV attached.");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const emailEditor = page.getByLabel("Edit email");
  await expect(emailEditor).toHaveValue(/CV attached\.$/);
  await emailEditor.fill("Cancelled email text must not persist");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(emailPreview).toContainText("CV attached.");
  await expect(emailPreview).not.toContainText("Cancelled email text must not persist");

  await page.getByRole("tab", { name: "Submission", exact: true }).click();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const profileSummary = page.getByLabel("Profile Summary");
  await profileSummary.fill("Cancelled text must not persist");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("article.output-preview")).not.toContainText("Cancelled text must not persist");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Profile Summary").fill(SAVED_PROFILE);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("article.output-preview")).toContainText(SAVED_PROFILE);

  await page.getByRole("button", { name: "Output history" }).click();
  await expect(page.getByRole("menuitem", { name: "Current · v3" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "v2 · generated" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Recruiter Workstation" })).toBeVisible();
  await expect(page.getByLabel("Job folder").locator("option:checked")).toHaveText(`${JOB_TITLE} · ${CLIENT_NAME}`);
  await expect(page.locator(".candidate-row.active")).toContainText(CANDIDATE_NAME);
  await page.getByRole("button", { name: "Generated" }).click();
  await expect(page.locator("article.output-preview")).toContainText(SAVED_PROFILE);
  await page.getByRole("button", { name: "Output history" }).click();
  await expect(page.getByRole("menuitem", { name: "Current · v3" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Resume", exact: true }).click();
  await expect(page.getByLabel("TTTG branded resume preview")).toContainText(SAVED_RESUME_SUMMARY);
  await page.getByRole("button", { name: "Output history" }).click();
  await expect(page.getByRole("menuitem", { name: "Current · v3" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "v2 · generated" })).toBeVisible();
  await page.keyboard.press("Escape");

  await openJobOptions(page);
  await page.getByRole("menuitem", { name: "Workflows" }).click();
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

test("changes an inferred Other source to Resume before creating a candidate", async ({ page }) => {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") consoleProblems.push(message.text());
  });
  await page.goto("/");
  await page.getByLabel("Job folder").selectOption("");
  await openTextSource(page);
  const jobDialog = page.getByRole("dialog", { name: "Paste Job source" });
  await jobDialog.getByLabel("Job source text").fill(`Job Description
Job Title: ${RECOVERY_JOB_TITLE}
Company: ${RECOVERY_CLIENT_NAME}
Responsibilities
Qualifications
Requirements`);
  await jobDialog.getByRole("button", { name: "Create Job and save source" }).click();
  await expect(jobDialog).toBeHidden();

  await openTextSource(page, "new_candidate");

  const dialog = page.getByRole("dialog", { name: "Paste candidate source" });
  await dialog.getByLabel("Candidate source text").fill(AMBIGUOUS_CANDIDATE_SOURCE);
  const sourceType = dialog.getByLabel("Candidate source type");
  await expect(sourceType).toHaveValue("other");
  await expect(dialog.getByLabel("Candidate for source")).toBeVisible();
  await expect(dialog.getByLabel("Candidate name")).toHaveCount(0);

  await sourceType.selectOption("resume");
  await expect(dialog.getByLabel("Candidate for source")).toHaveCount(0);
  await dialog.getByLabel("Candidate name").fill(RECOVERED_CANDIDATE_NAME);
  await dialog.getByLabel("Current title").fill(RECOVERED_CANDIDATE_TITLE);
  await expect(dialog.getByRole("button", { name: "Create candidate and save source" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Create candidate and save source" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.locator(".candidate-row.active")).toContainText(RECOVERED_CANDIDATE_NAME);
  expect(consoleProblems).toEqual([]);
});

test("clears private candidate notes when leaving a Job and restores them only after reopening the case", async ({ page }) => {
  await page.goto("/");
  const jobSelect = page.getByLabel("Job folder");
  await jobSelect.selectOption({ label: `${JOB_TITLE} · ${CLIENT_NAME}` });
  await page.locator(".candidate-row").filter({ hasText: CANDIDATE_NAME }).click();

  await page.getByRole("button", { name: "Type" }).click();
  const notes = page.getByLabel("Candidate typed notes");
  await notes.fill("Private note for the selected Job and candidate only.");
  await jobSelect.selectOption("");
  await expect(notes).toBeDisabled();
  await expect(notes).toHaveValue("");

  await jobSelect.selectOption({ label: `${JOB_TITLE} · ${CLIENT_NAME}` });
  await page.locator(".candidate-row").filter({ hasText: CANDIDATE_NAME }).click();
  await page.getByRole("button", { name: "Type" }).click();
  await expect(page.getByLabel("Candidate typed notes")).toHaveValue("Private note for the selected Job and candidate only.");
});

test("shows exact source-save failures in the open dialog and refuses ambiguous multi-file context creation", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Job folder").selectOption({ label: `${JOB_TITLE} · ${CLIENT_NAME}` });
  await page.locator(".candidate-row").filter({ hasText: CANDIDATE_NAME }).click();

  await page.route("**/api/cases/*/sources", async (route) => {
    await route.fulfill({
      status: 413,
      contentType: "application/json",
      body: JSON.stringify({ error: "Source file exceeds the 20 MB limit." }),
    });
  });
  await openTextSource(page, "candidate");
  let dialog = page.getByRole("dialog", { name: "Paste candidate source" });
  await dialog.locator("textarea").fill(CALL_NOTES);
  await dialog.getByRole("button", { name: "Save candidate source" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Source file exceeds the 20 MB limit.");
  await page.unroute("**/api/cases/*/sources");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByLabel("Job folder").selectOption("");
  await page.getByRole("button", { name: "Add files or paste text" }).click();
  dialog = page.getByRole("dialog", { name: "Add sources" });
  await dialog.getByRole("button", { name: "Drag sources here" }).evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["Job Title: One\nCompany: Example One"], "one.txt", { type: "text/plain" }));
    transfer.items.add(new File(["Job Title: Two\nCompany: Example Two"], "two.txt", { type: "text/plain" }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(dialog.getByRole("alert")).toContainText("Add one Job source first");
  await expect(dialog).toBeVisible();
});
