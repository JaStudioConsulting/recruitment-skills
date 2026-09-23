"""Tests for the hosted builder's input boundary. Synthetic data only.

Run: python3 server/test_candidate_input.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from candidate_input import find_contact, normalize_candidate  # noqa: E402

JOB = {"title": "CNC Machinist", "company": "Example Fabrication", "location": "Hamilton, ON",
       "dates": "Jan-2020 - Present", "bullets": ["Cut scrap **22%** across two lines."]}


def norm(raw):
    return normalize_candidate(raw)


class ShapeNormalization(unittest.TestCase):
    def test_skills_string_splits_on_commas_not_characters(self):
        out, rep = norm({"name": "Sample Person", "skills": "Welding, MIG, TIG, Blueprint Reading", "experience": [JOB]})
        self.assertEqual(out["skills"], ["Welding", "MIG", "TIG", "Blueprint Reading"])
        self.assertEqual(rep["problems"], [])

    def test_bullets_paragraph_splits_on_sentences_not_characters(self):
        job = dict(JOB, bullets="Ran the press brake. Held tight tolerances.")
        out, _ = norm({"name": "Sample Person", "experience": [job]})
        self.assertEqual(out["experience"][0]["bullets"], ["Ran the press brake.", "Held tight tolerances."])

    def test_role_employer_aliases_keep_the_job(self):
        out, rep = norm({"name": "Sample Person", "experience": [
            {"role": "Lead Hand", "employer": "Example Co", "start": "Jan-2020", "end": "Mar-2022",
             "responsibilities": ["Led a crew of **8**."]}]})
        job = out["experience"][0]
        self.assertEqual((job["title"], job["company"], job["dates"]), ("Lead Hand", "Example Co", "Jan-2020 - Mar-2022"))
        self.assertEqual(job["bullets"], ["Led a crew of **8**."])
        self.assertEqual(rep["problems"], [])

    def test_missing_end_date_reads_present(self):
        out, _ = norm({"name": "Sample Person", "experience": [{"title": "Supervisor", "company": "X", "start": "May-2022"}]})
        self.assertEqual(out["experience"][0]["dates"], "May-2022 - Present")

    def test_structured_education_becomes_bold_credential_without_year(self):
        out, rep = norm({"name": "Sample Person", "education": [
            {"degree": "Diploma, Mechanical Technology", "school": "Example College", "location": "Toronto, ON", "year": "2015"}]})
        self.assertEqual(out["education"], ["**Diploma, Mechanical Technology** - Example College, Toronto, ON"])
        self.assertEqual(rep["problems"], [])

    def test_extra_resume_sections_are_kept_not_dropped(self):
        out, rep = norm({"name": "Sample Person", "certifications": ["309A Industrial Electrician"], "languages": "English, Punjabi"})
        headings = [s["heading"] for s in out["sections"]]
        self.assertIn("Certifications", headings)
        self.assertIn("Languages", headings)
        self.assertEqual(rep["problems"], [])

    def test_section_items_string_is_not_split_into_characters(self):
        out, _ = norm({"name": "Sample Person", "sections": [{"heading": "Languages", "items": "English"}]})
        self.assertEqual(out["sections"][0]["items"], ["English"])

    def test_top_level_aliases(self):
        out, rep = norm({"full_name": "Sample Person", "objective": "Short summary.", "work_history": [JOB]})
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
        _, rep = norm({"name": "Sample Person", "headline": "Welder", "summary": "S.",
                       "skills": ["A", "B"], "experience": [JOB], "education": ["**Diploma** - Example College"]})
        self.assertEqual(rep["problems"], [])

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


class ContactStripping(unittest.TestCase):
    def test_contact_keys_are_removed(self):
        out, rep = norm({"name": "Sample Person", "email": "sample@example.com", "phone": "555-555-0100",
                         "linkedin": "https://www.linkedin.com/in/sample", "experience": [JOB]})
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

    def test_dates_money_and_gpa_are_not_mistaken_for_contact(self):
        text = "Managed a $125M program, 2012 - 2016, GPA 3.87/4.00, Jan-2020 - Present, 38 direct reports."
        self.assertEqual(find_contact(text), [])


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
