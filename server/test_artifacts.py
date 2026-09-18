import tempfile
import unittest
from pathlib import Path

from artifacts import build_reference_pdf, validate_interview_payload, validate_reference_payload


class ArtifactTests(unittest.TestCase):
    def reference_payload(self):
        return {
            "candidate": {"full_name": "Alex Example", "position_applied_for": "Maintenance Manager", "company_name": "Example Manufacturing"},
            "reference": {"full_name": "Robin Reference", "job_title": "Plant Manager", "company_name": "Example Components", "professional_relationship": "Former manager for three years"},
            "completed_by": "Ja",
            "date": "2026-09-18",
            "answers": {"known_duration": "Three years", "strengths": ["Dependable", "Calm under pressure"], "rehire": "Yes"},
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
            self.assertTrue((Path(temp) / f"{result['token']}.pdf").is_file())

    def test_interview_payload_rejects_non_contract_shape(self):
        with self.assertRaisesRegex(ValueError, "exact interview-prep"):
            validate_interview_payload({"brief": {}, "source_ledger": "source", "asset_ledger": "asset"})


if __name__ == "__main__":
    unittest.main()
