from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load(name: str, relative: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


EVALUATE = load("evaluate_aesthetic_results", "scripts/evaluate_aesthetic_results.py")


class EvaluationContractTests(unittest.TestCase):
    def test_strict_json(self) -> None:
        parsed = EVALUATE.parse_response('{"choice":"A","reasonCode":"light"}')
        self.assertTrue(parsed["strictJson"])
        self.assertEqual(parsed["choice"], "A")

    def test_markdown_fence_is_recovered_but_not_strict(self) -> None:
        parsed = EVALUATE.parse_response('```json\n{"choice":"B","reasonCode":"light"}\n```')
        self.assertFalse(parsed["strictJson"])
        self.assertEqual(parsed["choice"], "B")

    def test_plain_choice_is_not_strict_but_recoverable(self) -> None:
        parsed = EVALUATE.parse_response("选择：A")
        self.assertFalse(parsed["strictJson"])
        self.assertEqual(parsed["choice"], "A")

    def test_extra_json_key_fails_strict_contract(self) -> None:
        parsed = EVALUATE.parse_response('{"choice":"A","reasonCode":"light","extra":1}')
        self.assertFalse(parsed["strictJson"])

    def test_free_text_reason_fails_frozen_vocabulary(self) -> None:
        parsed = EVALUATE.parse_response('{"choice":"A","reasonCode":"构图更好"}')
        self.assertTrue(parsed["jsonParseable"])
        self.assertTrue(parsed["exactFields"])
        self.assertFalse(parsed["reasonInVocabulary"])
        self.assertFalse(parsed["strictJson"])

    def test_malformed_json_is_not_parseable(self) -> None:
        parsed = EVALUATE.parse_response('{"choice":"A","reasonCode":"light"')
        self.assertFalse(parsed["jsonParseable"])
        self.assertFalse(parsed["strictJson"])


if __name__ == "__main__":
    unittest.main()
