import importlib.util
import plistlib
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("prepare_firebase", Path(__file__).parents[1] / "prepare_production_firebase.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FirebasePreparationTests(unittest.TestCase):
    # Explicitly synthetic unit-test data in temporary directories, never an
    # app configuration or a replacement for the owner's real downloaded file.
    def fixture(self):
        return dict(BUNDLE_ID=module.BUNDLE, PROJECT_ID=module.PROJECT,
                    API_KEY="unit-test-only", GOOGLE_APP_ID="1:123:ios:abc",
                    GCM_SENDER_ID="123", CLIENT_ID="test.apps.googleusercontent.com",
                    REVERSED_CLIENT_ID="com.googleusercontent.apps.test")

    def test_missing_file_fails(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with self.assertRaises(OSError):
                module.prepare(root / "missing.plist", root)
            self.assertFalse((root / "ios").exists())

    def test_wrong_identity_or_callback_fails_before_writes(self):
        for key, value in [("BUNDLE_ID", "com.other.app"), ("PROJECT_ID", "wrong"),
                           ("REVERSED_CLIENT_ID", "wrong"), ("GCM_SENDER_ID", "456")]:
            with tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                data = self.fixture()
                data[key] = value
                source = root / "fixture.plist"
                source.write_bytes(plistlib.dumps(data))
                with self.assertRaises(ValueError):
                    module.prepare(source, root)
                self.assertFalse((root / "ios").exists())

    def test_derives_both_build_inputs_from_same_plist(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "ios/Flutter").mkdir(parents=True)
            source = root / "fixture.plist"
            source.write_bytes(plistlib.dumps(self.fixture()))
            module.prepare(source, root)
            self.assertEqual((root / "ios/Firebase/prod/GoogleService-Info.plist").read_bytes(), source.read_bytes())
            self.assertIn("com.googleusercontent.apps.test", (root / "ios/Flutter/Firebase-prod.generated.xcconfig").read_text())


if __name__ == "__main__":
    unittest.main()
