import os
import tempfile
import time
import unittest
from unittest.mock import patch

from server.server import _FILE_NAMES, _discard_expired_file


class DownloadExpiryTests(unittest.TestCase):
    def test_keeps_a_fresh_generated_pdf(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "fresh.pdf")
            with open(path, "wb") as handle:
                handle.write(b"%PDF-1.4")

            self.assertFalse(_discard_expired_file(path, "fresh"))
            self.assertTrue(os.path.exists(path))

    def test_removes_an_expired_generated_pdf(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "expired.pdf")
            with open(path, "wb") as handle:
                handle.write(b"%PDF-1.4")
            _FILE_NAMES["expired"] = "Candidate.pdf"

            with patch("server.server.FILE_TTL_SECONDS", 60):
                old = time.time() - 61
                os.utime(path, (old, old))
                self.assertTrue(_discard_expired_file(path, "expired"))

            self.assertFalse(os.path.exists(path))
            self.assertNotIn("expired", _FILE_NAMES)


if __name__ == "__main__":
    unittest.main()
