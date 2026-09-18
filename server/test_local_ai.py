import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import local_ai


class LocalAiBoundaryTests(unittest.IsolatedAsyncioTestCase):
    def test_feature_authority_may_use_linked_docs_but_cannot_escape_repo(self):
        self.assertTrue(local_ai._safe_authority_path("../docs/templates/branded-resume-contract.md").is_file())
        with self.assertRaisesRegex(ValueError, "escapes the repository"):
            local_ai._safe_authority_path("../../MISSION-SKILLS-AS-FEATURES.md")

    def test_every_declared_result_kind_has_a_closed_schema(self):
        kinds = {feature["result_kind"] for feature in local_ai._load_features().values()}
        self.assertEqual(kinds, {"document", "form", "pdf", "resume", "submission", "table"})
        for kind in kinds:
            schema = local_ai.output_schema(kind)
            self.assertFalse(schema["additionalProperties"])
            self.assertIn("title", schema["required"])
            self.assertIn("unknowns", schema["required"])

    def test_invalid_table_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "row must match"):
            local_ai._validate_result("table", {
                "title": "Synthetic screening",
                "unknowns": [],
                "columns": ["Candidate", "Evidence"],
                "rows": [["Alex Example"]],
            })

    async def test_disabled_provider_never_starts_a_process(self):
        with patch.object(local_ai.asyncio, "create_subprocess_exec", new_callable=AsyncMock) as start:
            result = await local_ai.run_feature("vet-candidate", "codex", "configured model", "run-1", {})
        self.assertEqual(result["status"], "unavailable")
        start.assert_not_awaited()

    async def test_gemini_receives_source_only_on_stdin_under_deny_all_policy(self):
        process = AsyncMock()
        process.returncode = 0
        process.communicate.return_value = (
            json.dumps({"response": json.dumps({
                "title": "Synthetic vetting",
                "unknowns": [],
                "document": "Evidence-grounded synthetic draft.",
            })}).encode(),
            b"",
        )
        with patch.object(local_ai.asyncio, "create_subprocess_exec", new=AsyncMock(return_value=process)) as start:
            result = await local_ai.run_feature(
                "vet-candidate", "gemini", "auto", "run-2",
                {"candidate": {"name": "Alex Example"}, "source": "555-0100 example.com"},
            )

        self.assertEqual(result["status"], "completed")
        args = start.await_args.args
        self.assertIn("--policy", args)
        self.assertEqual(Path(args[args.index("--policy") + 1]).read_text().count('decision = "deny"'), 1)
        self.assertEqual(start.await_args.kwargs["env"]["GEMINI_CLI_SYSTEM_SETTINGS_PATH"], str(local_ai.REPO_ROOT / "server" / "gemini-settings.json"))
        self.assertNotIn("GEMINI_API_KEY", start.await_args.kwargs["env"])
        self.assertNotIn("GOOGLE_API_KEY", start.await_args.kwargs["env"])
        self.assertFalse(any("Alex Example" in str(arg) or "555-0100" in str(arg) for arg in args))
        sent = process.communicate.await_args.args[0].decode()
        self.assertIn("Alex Example", sent)
        self.assertIn("555-0100", sent)
        run_cwd = Path(start.await_args.kwargs["cwd"])
        self.assertFalse(run_cwd.exists(), "temporary working directory must be removed after the run")


if __name__ == "__main__":
    unittest.main()
