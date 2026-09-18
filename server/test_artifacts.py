import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader

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
            "source_ledger": "# Source ledger\n\n- Synthetic current job description.\n- Synthetic official company profile.",
            "asset_ledger": "# Asset ledger\n\n- Packaged synthetic test visual.\n- Used only for deterministic validation.",
        }

    def test_reference_payload_is_closed(self):
        payload = self.reference_payload()
        self.assertEqual(validate_reference_payload(payload), payload)
        payload["unexpected"] = "no"
        with self.assertRaisesRegex(ValueError, "unsupported fields"):
            validate_reference_payload(payload)

    def test_reference_pdf_builds_through_repository_template(self):
        with tempfile.TemporaryDirectory() as temp:
            result = build_reference_pdf(self.reference_payload(), temp)
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
            self.assertGreater(result["bytes"], 1000)
            self.assertIn('"pages": 4', result["validator_output"])
            self.assertTrue((Path(temp) / f"{result['token']}.pdf").is_file())

    def test_interview_payload_rejects_non_contract_shape(self):
        with self.assertRaisesRegex(ValueError, "exact interview-prep"):
            validate_interview_payload({"brief": {}, "source_ledger": "source", "asset_ledger": "asset"})


if __name__ == "__main__":
    unittest.main()
