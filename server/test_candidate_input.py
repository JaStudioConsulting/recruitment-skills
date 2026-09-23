"""Tests for the hosted builder's input boundary. Synthetic data only.

Run: python3 server/test_candidate_input.py
"""
import os
import sys
import unittest
import importlib.util
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from candidate_input import find_contact, normalize_candidate  # noqa: E402

_BUILDER_PATH = (
    Path(__file__).resolve().parents[1]
    / "skills/recruiter/modules/brandedresume/scripts/build_resume.py"
)
_BUILDER_SPEC = importlib.util.spec_from_file_location("canonical_build_resume", _BUILDER_PATH)
assert _BUILDER_SPEC and _BUILDER_SPEC.loader
_BUILDER = importlib.util.module_from_spec(_BUILDER_SPEC)
_BUILDER_SPEC.loader.exec_module(_BUILDER)

JOB = {"title": "CNC Machinist", "company": "Example Fabrication", "location": "Hamilton, ON",
       "dates": "Jan-2020 - Present", "bullets": ["Cut scrap **22%** across two lines."]}


def norm(raw):
    return normalize_candidate(raw)


def complete_candidate(**overrides):
    candidate = {
        "name": "Sample Person",
        "headline": "CNC Machinist",
        "summary": "Manufacturing specialist with source-backed maintenance experience.",
        "skills": ["CNC Machining", "Blueprint Reading"],
        "experience": [JOB],
        "education": ["**Diploma** - Example College"],
    }
    candidate.update(overrides)
    return candidate


class ShapeNormalization(unittest.TestCase):
    def test_skills_string_splits_on_commas_not_characters(self):
        out, rep = norm(complete_candidate(skills="Welding, MIG, TIG, Blueprint Reading"))
        self.assertEqual(out["skills"], ["Welding", "MIG", "TIG", "Blueprint Reading"])
        self.assertEqual(rep["problems"], [])

    def test_bullets_paragraph_splits_on_sentences_not_characters(self):
        job = dict(JOB, bullets="Ran the press brake. Held tight tolerances.")
        out, _ = norm({"name": "Sample Person", "experience": [job]})
        self.assertEqual(out["experience"][0]["bullets"], ["Ran the press brake.", "Held tight tolerances."])

    def test_role_employer_aliases_keep_the_job(self):
        out, rep = norm(complete_candidate(experience=[
            {"role": "Lead Hand", "employer": "Example Co", "location": "Hamilton, ON",
             "start": "Jan-2020", "end": "Mar-2022", "responsibilities": ["Led a crew of **8**."]}]))
        job = out["experience"][0]
        self.assertEqual((job["title"], job["company"], job["dates"]), ("Lead Hand", "Example Co", "Jan-2020 - Mar-2022"))
        self.assertEqual(job["bullets"], ["Led a crew of **8**."])
        self.assertEqual(rep["problems"], [])

    def test_missing_end_date_reads_present(self):
        out, _ = norm({"name": "Sample Person", "experience": [{"title": "Supervisor", "company": "X", "start": "May-2022"}]})
        self.assertEqual(out["experience"][0]["dates"], "May-2022 - Present")

    def test_structured_education_becomes_bold_credential_without_year(self):
        out, rep = norm(complete_candidate(education=[
            {"degree": "Diploma, Mechanical Technology", "school": "Example College", "location": "Toronto, ON", "year": "2015"}]))
        self.assertEqual(out["education"], ["**Diploma, Mechanical Technology** - Example College, Toronto, ON"])
        self.assertEqual(rep["problems"], [])

    def test_extra_resume_sections_are_kept_not_dropped(self):
        out, rep = norm(complete_candidate(certifications=["309A Industrial Electrician"], languages="English, Punjabi"))
        headings = [s["heading"] for s in out["sections"]]
        self.assertIn("Certifications", headings)
        self.assertIn("Languages", headings)
        self.assertEqual(rep["problems"], [])

    def test_section_items_string_is_not_split_into_characters(self):
        out, _ = norm({"name": "Sample Person", "sections": [{"heading": "Languages", "items": "English"}]})
        self.assertEqual(out["sections"][0]["items"], ["English"])

    def test_top_level_aliases(self):
        out, rep = norm({
            "full_name": "Sample Person", "title": "CNC Machinist", "objective": "Short summary.",
            "core_skills": ["CNC Machining", "Blueprint Reading"], "work_history": [JOB],
            "education": ["**Diploma** - Example College"],
        })
        self.assertEqual(out["name"], "Sample Person")
        self.assertEqual(out["summary"], "Short summary.")
        self.assertEqual(len(out["experience"]), 1)
        self.assertEqual(rep["problems"], [])


class RefuseInsteadOfDropping(unittest.TestCase):
    def test_unknown_top_level_field_is_refused(self):
        _, rep = norm({"name": "Sample Person", "hobbyist_notes": "something", "experience": [JOB]})
        self.assertTrue(any("hobbyist_notes" in p for p in rep["problems"]))

    def test_unknown_job_field_is_refused(self):
        _, rep = norm({"name": "Sample Person", "experience": [dict(JOB, team_size="14")]})
        self.assertTrue(any("team_size" in p for p in rep["problems"]))

    def test_job_with_no_title_or_company_is_refused(self):
        _, rep = norm({"name": "Sample Person", "experience": [{"dates": "2020 - 2021", "bullets": ["x"]}]})
        self.assertTrue(any("no title and no company" in p for p in rep["problems"]))

    def test_plain_text_job_is_refused(self):
        _, rep = norm({"name": "Sample Person", "experience": ["Machinist at Example Co 2019 to 2021"]})
        self.assertTrue(any("plain text" in p for p in rep["problems"]))

    def test_missing_name_is_refused(self):
        _, rep = norm({"headline": "Welder"})
        self.assertIn("name is missing.", rep["problems"])

    def test_clean_candidate_has_no_problems(self):
        _, rep = norm(complete_candidate())
        self.assertEqual(rep["problems"], [])

    def test_required_branded_resume_structure_is_refused(self):
        _, rep = norm({"name": "Sample Person", "summary": "Source-backed summary."})
        joined = " ".join(rep["problems"])
        for field in ("headline", "skills", "experience", "education"):
            self.assertIn(field, joined)

    def test_odd_skill_count_is_refused(self):
        _, rep = norm({"name": "Sample Person", "skills": ["A", "B", "C"], "experience": [JOB]})
        self.assertTrue(any("Core Skills count is odd (3)" in problem for problem in rep["problems"]))

    def test_forbidden_semicolon_and_tilde_are_refused_with_field_paths(self):
        _, rep = norm({
            "name": "Sample Person",
            "summary": "Led maintenance; reduced downtime ~10%.",
            "experience": [{**JOB, "bullets": ["Maintained equipment; improved uptime ~5%."]}],
        })
        joined = " ".join(rep["problems"])
        self.assertIn("summary contains a forbidden semicolon", joined)
        self.assertIn("summary contains a forbidden tilde", joined)
        self.assertIn("experience[0].bullets[0] contains a forbidden semicolon", joined)
        self.assertIn("experience[0].bullets[0] contains a forbidden tilde", joined)

    def test_whitespace_around_slashes_is_refused_with_field_path(self):
        _, rep = norm({
            "name": "Sample Person",
            "summary": "CNC / manual machining.",
            "experience": [{**JOB, "location": "Hamilton / Burlington, ON"}],
        })
        joined = " ".join(rep["problems"])
        self.assertIn("summary contains forbidden whitespace around a slash", joined)
        self.assertIn("experience[0].location contains forbidden whitespace around a slash", joined)

    def test_compensation_is_refused_with_field_paths(self):
        _, rep = norm(complete_candidate(
            summary="Currently earns $120,000.",
            experience=[{**JOB, "bullets": ["Current salary is $120,000."]}],
        ))
        joined = " ".join(rep["problems"])
        self.assertIn("summary contains compensation information", joined)
        self.assertIn("experience[0].bullets[0] contains compensation information", joined)

    def test_dollar_only_compensation_phrases_are_refused(self):
        for phrase in ("Seeking $120,000 annually.", "Expected $60/hour.", "$150,000 OTE."):
            with self.subTest(phrase=phrase):
                _, rep = norm(complete_candidate(summary=phrase))
                self.assertTrue(any("summary contains compensation information" in problem for problem in rep["problems"]))

    def test_ordinary_expectation_language_is_not_compensation(self):
        _, rep = norm(complete_candidate(summary="Expected to lead the maintenance team."))
        self.assertEqual(rep["problems"], [])

    def test_business_earnings_are_not_candidate_compensation(self):
        _, rep = norm(complete_candidate(summary="Improved quarterly earnings through process changes."))
        self.assertEqual(rep["problems"], [])

    def test_candidate_earnings_context_is_compensation(self):
        for phrase in ("Current earnings are confidential.", "Expected earnings are $120,000.", "Target earnings are $60/hour."):
            with self.subTest(phrase=phrase):
                _, rep = norm(complete_candidate(summary=phrase))
                self.assertTrue(any("summary contains compensation information" in problem for problem in rep["problems"]))

    def test_education_dates_are_refused_not_silently_removed(self):
        _, rep = norm(complete_candidate(education=["**BSc** - Example University, 2015"]))
        self.assertTrue(any("education[0] contains a date" in problem for problem in rep["problems"]))

    def test_general_education_year_forms_are_refused(self):
        entries = (
            "2015 - **BSc** - Example University",
            "**BSc** - Example University 2015",
            "**BSc** - Example University - 2015",
            "**BSc** - Example University, 2011-2015",
            "**BSc** - Example University, Graduated: 2015",
            "**BSc** - Example University, Education:2015",
        )
        for entry in entries:
            with self.subTest(entry=entry):
                _, rep = norm(complete_candidate(education=[entry]))
                self.assertTrue(any("education[0] contains a date" in problem for problem in rep["problems"]))

    def test_certification_version_year_is_preserved(self):
        out, rep = norm(complete_candidate(education=["**ISO 9001:2015 Lead Auditor** - Example Registrar"]))
        self.assertEqual(rep["problems"], [])
        self.assertEqual(out["education"], ["**ISO 9001:2015 Lead Auditor** - Example Registrar"])

    def test_certification_version_plus_actual_date_is_refused(self):
        _, rep = norm(complete_candidate(education=["**ISO 9001:2015 Lead Auditor** - Example Registrar, 2020"]))
        self.assertTrue(any("education[0] contains a date" in problem for problem in rep["problems"]))

    def test_recruiter_approved_blank_experience_fields_are_permitted(self):
        approved = {**JOB, "company": "", "location": "", "dates": ""}
        _, rep = norm(complete_candidate(experience=[approved]))
        self.assertEqual(rep["problems"], [])

    def test_separate_same_company_roles_are_refused(self):
        experience = [
            {**JOB, "title": "Machinist", "company": "Example Fabrication"},
            {**JOB, "title": "Lead Hand", "company": "  EXAMPLE   FABRICATION  "},
        ]
        _, rep = norm(complete_candidate(experience=experience))
        self.assertTrue(any(
            "experience[1].company duplicates experience[0].company" in problem
            and "Combine same-company roles" in problem
            for problem in rep["problems"]
        ))

    def test_multiple_blank_company_roles_are_not_treated_as_duplicates(self):
        experience = [
            {**JOB, "title": "Machinist", "company": ""},
            {**JOB, "title": "Lead Hand", "company": ""},
        ]
        _, rep = norm(complete_candidate(experience=experience))
        self.assertEqual(rep["problems"], [])


class ContactStripping(unittest.TestCase):
    def test_contact_keys_are_removed(self):
        out, rep = norm(complete_candidate(email="sample@example.com", phone="555-555-0100",
                                           linkedin="https://www.linkedin.com/in/sample"))
        for key in ("email", "phone", "linkedin"):
            self.assertNotIn(key, out)
        self.assertEqual(rep["problems"], [])
        self.assertEqual(rep["stripped"], ["email", "linkedin", "phone"])

    def test_contact_inside_text_is_refused_with_the_field_named(self):
        raw = {"name": "Sample Person", "summary": "Brampton, ON (555) 555-0100 (cell) sample.person@example.com",
               "experience": [dict(JOB, bullets=["Reach me at +1 555 555 0100 or www.example.com/me anytime."])]}
        _, rep = norm(raw)
        joined = " ".join(rep["problems"])
        self.assertIn("summary contains contact details", joined)
        self.assertIn("experience[0].bullets[0] contains contact details", joined)

    def test_labelled_phone_is_detected(self):
        self.assertEqual(find_contact("Toronto, ON contact no.555-555-0100"), ["phone"])

    def test_international_phone_is_detected(self):
        for number in ("+44 20 7946 0958", "020 7946 0958", "0044 20 7946 0958", "44 20 7946 0958"):
            with self.subTest(number=number):
                self.assertEqual(find_contact(f"London contact {number}"), ["phone"])

    def test_international_phone_inside_nested_text_is_refused(self):
        raw = {"name": "Sample Person", "experience": [dict(JOB, bullets=["Contact +44 20 7946 0958."])]}
        _, rep = norm(raw)
        self.assertTrue(any("experience[0].bullets[0] contains contact details (phone)" in problem for problem in rep["problems"]))

    def test_dates_money_and_gpa_are_not_mistaken_for_contact(self):
        text = "Managed a $125M program and $120 000 000 capital budget, version 2024.10.15, 2012 - 2016, GPA 3.87/4.00, Jan-2020 - Present, 38 direct reports."
        self.assertEqual(find_contact(text), [])

    def test_postal_address_inside_text_is_refused_with_the_field_named(self):
        raw = complete_candidate(
            summary="Lives at 123 Main Street, Toronto, ON M5V 2T6.",
            experience=[{**JOB, "bullets": ["Mail was routed to 44 King Road, Hamilton, ON L8P 1A1."]}],
        )
        _, rep = norm(raw)
        joined = " ".join(rep["problems"])
        self.assertIn("summary contains contact details (address)", joined)
        self.assertIn("experience[0].bullets[0] contains contact details (address)", joined)

    def test_address_guard_does_not_match_counts_routes_or_generic_main_street_language(self):
        for text in (
            "Supported 123 Main Street retail locations across Ontario.",
            "Managed Highway 401 corridor maintenance.",
            "Processed 500 King Street orders per month.",
        ):
            with self.subTest(text=text):
                self.assertEqual(find_contact(text), [])


class DirectBuilderBoundary(unittest.TestCase):
    def test_direct_builder_rejects_embedded_postal_address(self):
        candidate = complete_candidate(summary="Lives at 123 Main Street, Toronto, ON M5V 2T6.")
        offenders = _BUILDER.check_forbidden_content(candidate)
        self.assertTrue(any("summary: contains contact details (address)" in problem for problem in offenders))

    def test_direct_builder_rejects_uncombined_same_company_roles(self):
        candidate = complete_candidate(experience=[
            {**JOB, "title": "Machinist", "company": "Example Fabrication"},
            {**JOB, "title": "Lead Hand", "company": "EXAMPLE FABRICATION"},
        ])
        problems = _BUILDER.check_required_structure(candidate)
        self.assertTrue(any(
            "experience[1].company duplicates experience[0].company" in problem
            and "Combine same-company roles" in problem
            for problem in problems
        ))


class BoldMarkers(unittest.TestCase):
    def test_bold_markers_removed_where_the_builder_prints_plain_text(self):
        out, _ = norm({"name": "**Sample Person**", "headline": "**Welder**", "summary": "Managed a **$125M** program.",
                       "skills": ["**MIG**", "TIG"], "experience": [dict(JOB, title="**Lead Hand**")]})
        self.assertEqual((out["name"], out["headline"]), ("Sample Person", "Welder"))
        self.assertEqual(out["summary"], "Managed a $125M program.")
        self.assertEqual(out["skills"], ["MIG", "TIG"])
        self.assertEqual(out["experience"][0]["title"], "Lead Hand")

    def test_bold_markers_kept_where_the_builder_renders_them(self):
        out, _ = norm({"name": "Sample Person", "experience": [JOB], "education": ["**Diploma** - Example College"]})
        self.assertIn("**22%**", out["experience"][0]["bullets"][0])
        self.assertEqual(out["education"], ["**Diploma** - Example College"])


class NothingToBuild(unittest.TestCase):
    def test_name_only_is_refused(self):
        _, rep = norm({"name": "Sample Person"})
        self.assertTrue(any("nothing to build" in p for p in rep["problems"]))


if __name__ == "__main__":
    unittest.main(verbosity=1)
