import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image

IMAGE_WORKER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(IMAGE_WORKER_DIR))

from accelerated import CPU_PROVIDER, CUDA_PROVIDER, DML_PROVIDER, choose_providers, read_active_provider  # noqa: E402
from processor import process_photo  # noqa: E402


class FakeInnerSession:
    def get_providers(self):
        return [CUDA_PROVIDER, CPU_PROVIDER]


class FakeSession:
    inner_session = FakeInnerSession()


class AcceleratedWorkerTests(unittest.TestCase):
    def test_auto_prefers_cuda_with_cpu_fallback(self):
        providers, reason = choose_providers("auto", [CUDA_PROVIDER, CPU_PROVIDER])
        self.assertEqual(providers, [CUDA_PROVIDER, CPU_PROVIDER])
        self.assertIsNone(reason)

    def test_cuda_request_falls_back_when_unavailable(self):
        providers, reason = choose_providers("cuda", [CPU_PROVIDER])
        self.assertEqual(providers, [CPU_PROVIDER])
        self.assertIn("unavailable", reason)

    def test_auto_uses_directml_when_cuda_is_unavailable(self):
        providers, reason = choose_providers("auto", [DML_PROVIDER, CPU_PROVIDER])
        self.assertEqual(providers, [DML_PROVIDER, CPU_PROVIDER])
        self.assertIsNone(reason)

    def test_cpu_request_never_selects_cuda(self):
        providers, reason = choose_providers("cpu", [CUDA_PROVIDER, CPU_PROVIDER])
        self.assertEqual(providers, [CPU_PROVIDER])
        self.assertIsNone(reason)

    def test_active_provider_is_read_from_session(self):
        self.assertEqual(read_active_provider(FakeSession(), CPU_PROVIDER), CUDA_PROVIDER)

    def test_shared_pipeline_collects_timings_without_changing_character_contract(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.png"
            Image.new("RGBA", (200, 300), (40, 80, 160, 255)).save(source)
            timings = {}
            result = process_photo(
                source_path=str(source),
                name="test",
                source_hash="0" * 64,
                characters_dir=str(root / "characters"),
                save_original=False,
                background_remover=lambda image: image,
                timings=timings,
            )
            self.assertNotIn("diagnostics", result)
            self.assertEqual(result["collisionMode"], "convexHull")
            self.assertTrue((root / "characters" / result["id"] / "sprite.png").exists())
            self.assertIn("removeBackground", timings)
            self.assertIn("contour", timings)
            self.assertTrue(all(value >= 0 for value in timings.values()))


if __name__ == "__main__":
    unittest.main()
