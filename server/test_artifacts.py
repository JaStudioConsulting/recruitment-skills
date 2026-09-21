import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pypdf import PdfReader

import artifacts
from artifacts import build_interview_pdf, build_reference_pdf, validate_interview_payload, validate_reference_payload


class ArtifactTests(unittest.TestCase):
    def reference_payload(self):
        return {
            "candidate": {"full_name": "Alex Example", "position_applied_for": "Maintenance Manager", "company_name": "Example Manufacturing"},
            "reference": {"full_name": "Robin Reference", "job_title": "Plant Manager", "company_name": "Example Components", "professional_relationship": "Former manager for three years"},
            "completed_by": "Ja",
            "date": "2026-09-18",
            "answers": {"known_duration": "Three years", "strengths": ["Dependable", "Calm under pressure"], "rehire": "Yes"},
        }

    def interview_payload(self):
        logo = str(Path(__file__).resolve().parents[1] / "skills/recruiter/modules/brandedresume/assets/tttg_logo.png")
        detail = " This synthetic section is intentionally detailed enough to exercise page layout, source controls, text extraction, and release validation without representing a real employer or candidate."
        section = lambda title, body: {"title": title, "body": body + detail}
        return {
            "brief": {
                "document": {"company": "Synthetic Manufacturing Ltd.", "role": "Machine Reliability Manager", "location": "Hamilton, Ontario", "title": "Synthetic Interview Prep", "subject": "Synthetic role brief", "author": "Top Tier Talent Group", "footer": "Top Tier Talent Group"},
                "source_control": {"as_of": "2026-09-18", "publication_status": "approved_for_candidate_use", "role_status_evidence": "Synthetic recruiter confirmation", "authoritative_sources": ["Synthetic current job description", "Synthetic official company profile"]},
                "privacy": {"banned_terms": ["Sample Candidate", "Private Interviewer"]},
                "cover": {"eyebrow": "The company", "headline": "Industrial reliability with visible plant impact.", "deck": "A synthetic manufacturing brief for deterministic testing.", "image": logo, "image_caption": "Synthetic test visual.", "sections": [section("The business", "Synthetic Manufacturing produces engineered components for industrial customers."), section("Why reliability matters", "The role connects maintenance planning, technical judgment, and team leadership.")]},
                "role": {"eyebrow": "The role", "headline": "Machine Reliability Manager", "intro": "Lead the systems and decisions that keep production equipment ready.", "image": logo, "image_caption": "Synthetic role visual.", "at_a_glance": [{"label": "Setting", "value": "Plant"}, {"label": "Focus", "value": "Reliability"}, {"label": "Partners", "value": "Operations"}], "cards": [section("Mandate", "Set a clear maintenance rhythm."), section("Work", "Review risk and plan preventive work."), section("Success", "Make overdue work visible and controlled."), section("Partners", "Work with Operations and Engineering.")], "note": "Confirm final scope from the current role source."},
                "context": {"eyebrow": "The work", "headline": "A production-floor system.", "intro": "Connect planning, technical depth, and follow-through.", "image": logo, "image_caption": "Synthetic context visual.", "columns": [section("Signal to action", "Use reviewed evidence to rank asset risk."), section("Repair to learning", "Use failure learning to update plans.")], "note_title": "Questions", "note_body": "Confirm equipment, team, schedule, and planning system."},
                "decision": {"eyebrow": "The decision", "headline": "Assess the work and fit.", "intro": "Evaluate professional scope and practical realities.", "images": [{"path": logo, "caption": "Synthetic city visual."}, {"path": logo, "caption": "Synthetic regional visual."}], "sections": [section("Operating challenge", "Judge the assets, failure patterns, team, and support."), section("Practical decision", "Confirm schedule, travel, compensation, and location.")], "cta_title": "Explore the opportunity.", "cta_body": "Speak with Top Tier Talent Group about the next conversation."},
            },
            "source_ledger": """# Source ledger

## Claim 1
- Claim: The synthetic role carries maintenance-planning responsibility.
- Source: Synthetic current job description
- Publication date: unavailable
- Retrieval date: 2026-09-18
- Scope: Exact synthetic role used only for deterministic testing.
- Status: supported

## Claim 2
- Claim: The synthetic company produces engineered industrial components.
- Source: Synthetic official company profile
- Publication date: 2026-09-01
- Retrieval date: 2026-09-18
- Scope: Synthetic company-wide description used only for deterministic testing.
- Status: supported""",
            "asset_ledger": f"""# Asset ledger

## Asset 1
- Creator: Top Tier Talent Group
- Source page: repository://skills/recruiter/modules/brandedresume/assets/tttg_logo.png
- Direct asset URL or generated-file path: {logo}
- Licence: Internal approved brand asset
- Allowed use: Candidate-facing Top Tier Talent Group recruiting material
- Modifications: None beyond proportional layout scaling
- Rendered caption: Synthetic test visual""",
        }

    def test_reference_payload_is_closed(self):
        payload = self.reference_payload()
        self.assertEqual(validate_reference_payload(payload), payload)
        payload["unexpected"] = "no"
        with self.assertRaisesRegex(ValueError, "unsupported fields"):
            validate_reference_payload(payload)

    def test_reference_pdf_builds_through_repository_template(self):
        with tempfile.TemporaryDirectory() as temp:
            with patch("artifacts._run", wraps=artifacts._run) as runner:
                result = build_reference_pdf(self.reference_payload(), temp)
            self.assertTrue(any(
                str(artifacts.REFERENCE_BUILDER) in call.args[0]
                for call in runner.call_args_list
            ), "reference build must invoke the canonical repository template builder")
            self.assertTrue(result["ok"])
            self.assertTrue(result["visual_review_required"])
            self.assertGreater(result["bytes"], 1000)
            pdf = Path(temp) / f"{result['token']}.pdf"
            self.assertTrue(pdf.is_file())
            text = "\n".join(page.extract_text() or "" for page in PdfReader(str(pdf)).pages)
            self.assertIn("Professional Reference Check Form", text)
            self.assertIn("How long have you known the candidate?", text)
            self.assertIn("Three years", text)
            self.assertIn("Would you rehire the candidate?", text)

    def test_interview_pdf_builds_and_validates_through_adapter(self):
        with tempfile.TemporaryDirectory() as temp:
            result = build_interview_pdf(self.interview_payload(), temp)
            self.assertTrue(result["ok"])
            self.assertFalse(result["release_ready"])
            self.assertEqual(result["provenance_validation"], "structured_caller_evidence_only")
            self.assertGreater(result["bytes"], 1000)
            self.assertIn('"pages": 4', result["validator_output"])
            self.assertTrue((Path(temp) / f"{result['token']}.pdf").is_file())

    def test_interview_payload_rejects_non_contract_shape(self):
        with self.assertRaisesRegex(ValueError, "exact interview-prep"):
            validate_interview_payload({"brief": {}, "source_ledger": "source", "asset_ledger": "asset"})

    def test_interview_payload_rejects_unstructured_ledgers_instead_of_synthesizing_them(self):
        payload = self.interview_payload()
        payload["source_ledger"] = "a\nb\nc\nd"
        with self.assertRaisesRegex(ValueError, "Claim ledger"):
            validate_interview_payload(payload)

        payload = self.interview_payload()
        payload["asset_ledger"] = "w\nx\ny\nz"
        with self.assertRaisesRegex(ValueError, "Asset ledger"):
            validate_interview_payload(payload)

    def test_candidate_approval_requires_supported_claims_and_complete_asset_mapping(self):
        payload = self.interview_payload()
        payload["source_ledger"] = payload["source_ledger"].replace(
            "Status: supported", "Status: unverified", 1
        )
        with self.assertRaisesRegex(ValueError, "supported before candidate-facing approval"):
            validate_interview_payload(payload)

        payload = self.interview_payload()
        payload["asset_ledger"] = payload["asset_ledger"].replace(
            "Direct asset URL or generated-file path:",
            "Direct asset URL or generated-file path: /wrong/path\n- Original path:",
        )
        with self.assertRaisesRegex(ValueError, "unsupported field|missing visuals"):
            validate_interview_payload(payload)


if __name__ == "__main__":
    unittest.main()
