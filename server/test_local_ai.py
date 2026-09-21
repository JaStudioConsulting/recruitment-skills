import asyncio
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import local_ai

HAS_SERVER_TEST_DEPS = all(importlib.util.find_spec(name) is not None for name in ("httpx", "mcp", "starlette"))
if HAS_SERVER_TEST_DEPS:
    import httpx
    import server as mcp_server


class LocalAiBoundaryTests(unittest.IsolatedAsyncioTestCase):
    def test_feature_authority_may_use_linked_docs_but_cannot_escape_repo(self):
        self.assertTrue(local_ai._safe_authority_path("../docs/templates/branded-resume-contract.md").is_file())
        with self.assertRaisesRegex(ValueError, "escapes the repository"):
            local_ai._safe_authority_path("../../MISSION-SKILLS-AS-FEATURES.md")

    def test_every_declared_result_kind_has_a_closed_schema(self):
        declared_kinds = {feature["result_kind"] for feature in local_ai._load_features().values()}
        supported_kinds = {"document", "form", "pdf", "resume", "submission", "table"}
        self.assertEqual(declared_kinds, {"document", "form", "pdf", "submission", "table"})
        for kind in supported_kinds:
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

    def test_request_guard_rejects_missing_and_wrong_tokens(self):
        for token in ("", "wrong-token"):
            rejection = local_ai.request_rejection(
                enabled=True, client_host="127.0.0.1", headers={"x-local-ai-token": token},
                expected_token="synthetic-local-token",
            )
            self.assertEqual(rejection[0], 401)

    def test_request_guard_rejects_text_plain_posts(self):
        rejection = local_ai.request_rejection(
            enabled=True, client_host="127.0.0.1",
            headers={"x-local-ai-token": "synthetic-local-token", "content-type": "text/plain"},
            expected_token="synthetic-local-token", require_json=True,
        )
        self.assertEqual(rejection[0], 415)

    def test_request_guard_rejects_every_origin(self):
        rejection = local_ai.request_rejection(
            enabled=True, client_host="127.0.0.1",
            headers={"x-local-ai-token": "synthetic-local-token", "origin": "https://attacker.example"},
            expected_token="synthetic-local-token",
        )
        self.assertEqual(rejection[0], 403)

    def test_request_guard_accepts_a_correct_server_to_server_call(self):
        rejection = local_ai.request_rejection(
            enabled=True, client_host="::1",
            headers={"x-local-ai-token": "synthetic-local-token", "content-type": "application/json; charset=utf-8"},
            expected_token="synthetic-local-token", require_json=True,
        )
        self.assertIsNone(rejection)

    def test_sourcing_table_is_closed_and_normalized(self):
        value = {
            "title": "Synthetic sourcing",
            "unknowns": [],
            "columns": ["Full Name", "Company", "Tenure", "LinkedIn Link", "Contact Info", "Eligibility", "Evidence Status"],
            "rows": [["Synthetic Person", "Synthetic Co", "", "https://example.com/profile", "", "Eligible", "Unconfirmed"]],
        }
        self.assertEqual(local_ai._validate_result("table", value, "source-candidates"), value)
        value["rows"][0][6] = "Likely"
        with self.assertRaisesRegex(ValueError, "evidence status"):
            local_ai._validate_result("table", value, "source-candidates")

    def test_applicant_screening_table_is_closed(self):
        value = {
            "title": "Synthetic screening",
            "unknowns": [],
            "columns": ["Rank", "Candidate", "Score", "Tier", "Key Differentiator", "Evidence and Gaps"],
            "rows": [["1", "Alex Example", "10/12", "Strong Interview", "Maintenance leadership", "No stated PLC experience"]],
        }
        self.assertEqual(local_ai._validate_result("table", value, "screen-applicants"), value)
        value["columns"][-1] = "Notes"
        with self.assertRaisesRegex(ValueError, "exact comparison table"):
            local_ai._validate_result("table", value, "screen-applicants")

    def test_provider_quota_failure_is_plain_language(self):
        self.assertEqual(
            local_ai._provider_failure_detail("Traceback TerminalQuotaError: You have exhausted your daily quota on this model.", "Gemini CLI"),
            "Gemini CLI quota is exhausted for the selected model. No draft was saved.",
        )

    async def test_disabled_provider_never_starts_a_process(self):
        with patch.object(local_ai.asyncio, "create_subprocess_exec", new_callable=AsyncMock) as start:
            result = await local_ai.run_feature("vet-candidate", "codex", "configured model", "run-1", {})
        self.assertEqual(result["status"], "unavailable")
        start.assert_not_awaited()

    async def test_empty_path_makes_every_provider_unavailable_without_starting_a_process(self):
        with patch.dict(os.environ, {"PATH": ""}, clear=True):
            catalog = local_ai.provider_catalog()
            self.assertEqual(len(catalog), 5)
            self.assertTrue(all(not provider["available"] for provider in catalog))
            self.assertTrue(all(provider["detail"] == "Not installed on this computer." for provider in catalog))
            with patch.object(local_ai.asyncio, "create_subprocess_exec", new_callable=AsyncMock) as start:
                for provider in catalog:
                    result = await local_ai.run_feature(
                        "vet-candidate", provider["id"], provider["models"][0],
                        f"run-{provider['id']}", {},
                    )
                    self.assertEqual(result, {"status": "unavailable", "detail": "Not installed on this computer."})
            start.assert_not_awaited()

    async def test_claude_401_preflight_returns_exact_sign_in_detail(self):
        process = AsyncMock()
        process.returncode = 1
        process.communicate.return_value = (b"", b"401 OAuth access token has been revoked")
        with patch.object(local_ai.asyncio, "create_subprocess_exec", new=AsyncMock(return_value=process)):
            detail = await local_ai._claude_preflight("claude", "sonnet", {"PATH": "/synthetic"})
        self.assertEqual(detail, local_ai.CLAUDE_SIGNIN_DETAIL)

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

    async def test_web_sourcing_uses_search_only_policy_and_settings(self):
        process = AsyncMock()
        process.returncode = 0
        process.communicate.return_value = (
            json.dumps({"response": json.dumps({
                "title": "Synthetic sourcing", "unknowns": [],
                "columns": ["Full Name", "Company", "Tenure", "LinkedIn Link", "Contact Info", "Eligibility", "Evidence Status"],
                "rows": [],
            })}).encode(), b"",
        )
        with patch.object(local_ai.asyncio, "create_subprocess_exec", new=AsyncMock(return_value=process)) as start:
            result = await local_ai.run_feature("source-candidates", "gemini", "gemini-2.5-flash-lite", "run-web", {"role": {"title": "Synthetic"}})
        self.assertEqual(result["status"], "completed")
        args = start.await_args.args
        policy = Path(args[args.index("--policy") + 1])
        self.assertEqual(policy.name, "gemini-web-search-only.toml")
        self.assertIn('toolName = "google_web_search"', policy.read_text())
        self.assertEqual(start.await_args.kwargs["env"]["GEMINI_CLI_SYSTEM_SETTINGS_PATH"], str(local_ai.REPO_ROOT / "server/gemini-web-settings.json"))


@unittest.skipUnless(HAS_SERVER_TEST_DEPS, "local server test dependencies are not installed")
class LocalAiHttpBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.environment = patch.dict(os.environ, {"LOCAL_AI_ENABLED": "1", "LOCAL_AI_TOKEN": "synthetic-local-token"})
        self.environment.start()
        transport = httpx.ASGITransport(app=mcp_server._build_app(), client=("127.0.0.1", 43125))
        self.client = httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1:8000")

    async def asyncTearDown(self):
        await self.client.aclose()
        self.environment.stop()

    async def test_every_local_ai_endpoint_rejects_missing_and_wrong_tokens(self):
        requests = [
            ("GET", "/local-ai/providers", None),
            ("POST", "/local-ai/run", {}),
            ("POST", "/local-ai/cancel/synthetic-run", {}),
        ]
        for method, path, payload in requests:
            missing = await self.client.request(method, path, json=payload)
            wrong = await self.client.request(method, path, json=payload, headers={"x-local-ai-token": "wrong-token"})
            self.assertEqual(missing.status_code, 401, path)
            self.assertEqual(wrong.status_code, 401, path)

    async def test_post_endpoints_reject_text_plain(self):
        headers = {"x-local-ai-token": "synthetic-local-token", "content-type": "text/plain"}
        for path in ("/local-ai/run", "/local-ai/cancel/synthetic-run"):
            response = await self.client.post(path, content="{}", headers=headers)
            self.assertEqual(response.status_code, 415, path)

    async def test_every_local_ai_endpoint_rejects_an_origin_header(self):
        headers = {"x-local-ai-token": "synthetic-local-token", "origin": "https://attacker.example"}
        requests = [
            ("GET", "/local-ai/providers", None),
            ("POST", "/local-ai/run", {}),
            ("POST", "/local-ai/cancel/synthetic-run", {}),
        ]
        for method, path, payload in requests:
            response = await self.client.request(method, path, json=payload, headers=headers)
            self.assertEqual(response.status_code, 403, path)

    async def test_correct_server_to_server_calls_reach_each_endpoint(self):
        headers = {"x-local-ai-token": "synthetic-local-token"}
        providers = await self.client.get("/local-ai/providers", headers=headers)
        self.assertEqual(providers.status_code, 200)
        payload = {"feature_id": "vet-candidate", "provider": "gemini", "model": "auto", "run_id": "synthetic-run", "context": {}}
        with patch.object(mcp_server, "run_feature", new=AsyncMock(return_value={"status": "completed"})) as run:
            response = await self.client.post("/local-ai/run", json=payload, headers=headers)
        self.assertEqual(response.status_code, 200)
        run.assert_awaited_once()
        with patch.object(mcp_server, "cancel_run", new=AsyncMock(return_value=True)) as cancel:
            response = await self.client.post("/local-ai/cancel/synthetic-run", json={}, headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "cancelled")
        cancel.assert_awaited_once_with("synthetic-run")


if __name__ == "__main__":
    unittest.main()
