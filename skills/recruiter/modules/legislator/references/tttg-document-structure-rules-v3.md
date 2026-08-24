# TTTG Document Structure & Rules (v3.0 PRO)

This reference is the immutable rulebook for the TTTG resume tool. Apply it exactly.

## 1. The Canvas & Paper

- Dimensions: A4 format. Width is strictly `210mm`, minimum height is `297mm`.
- Padding: `1.5cm` on all sides.
- Background: Pure white (`#ffffff`).
- Base Font: Sans-serif (inherited from Noto Sans import).

## 2. The Identity Header (Top Block)

- Logo: Fixed absolute position at `1.5cm` from the top and `1.5cm` from the left.
- Spacing: Starts `1.2cm` down from the top margin. Has `40px` space below it before the summary starts.
- Name (Line 1): Size `24pt`, Charcoal color (`#2c2e33`), centered, tight letter spacing (`-1px`).
- MPC Logic: If MPC mode is ON, this displays the candidate title in ALL CAPS instead of their name.
- Title (Line 2): Size `14pt`, bold, dark gray (`#444`), centered, with a `5px` top/bottom margin.
- MPC Logic: Hide title completely when MPC mode is ON.
- Location (Line 3): Size `10pt`, italic, muted slate color (`#64748b`), centered.

## 3. Universal Section Headings

Every section header (Summary, Skills, Experience, Education) follows this exact CSS:

- Size: `11pt`
- Text Transform: `UPPERCASE`
- Letter Spacing: `1px`
- Border: `2px solid black` on the bottom
- Padding/Margin: `3px` padding on bottom, `12px` margin below the line

## 4. Professional Summary

- Body Text: Size `11pt`, justified alignment, line height `1.5`.
- Spacing: `25px` margin below the paragraph.

## 5. Core Skills

- Layout: 2-column grid (`1fr 1fr`).
- Spacing: `8px` gap between columns/rows, `25px` margin below the entire section.
- Items: Size `11pt`, preceded by a bold bullet point (`<b>•</b>`).

## 6. Professional Experience

- Block Spacing: `22px` margin below each separate role.
- Line 1 (Role & Dates): Size `11pt`, bold. Role at far left, dates at far right.
- Line 2 (Company):
- Normal Mode: normal weight, italic, slate color (`#475569`). Show actual company.
- MPC Mode: bold, italic, dark blue (`#1e3a8a`). Show anonymous company description.
- Spacing: `4px` top/bottom margin.
- Line 3+ (Bullets): Size `11pt`, justified text, indented `18px` from the left, `6px` space between each bullet.

## 7. Education & Certifications

- Education Items: Size `11pt`, `6px` bottom margin. Credential name is bold, followed by an em-dash (`—`), then institution name.
- Certification Items: Size `11pt`, `4px` bottom margin. Preceded by a bold bullet point (`<b>•</b>`).

## 8. Functional Rules

- Gmail Subject Line: `[MPC - ]New Candidate Submission - [Name] - [Title] - [Location].`
- Print/PDF Engine: Inject custom CSS that perfectly mimics the `210mm` A4 layout into a print window to prevent margins from breaking.
