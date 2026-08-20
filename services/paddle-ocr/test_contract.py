import unittest

from contract import extract_page, normalize_results


class ContractTest(unittest.TestCase):
    def test_prefers_reading_order_blocks_and_keeps_page_confidence(self):
        result = {
            "res": {
                "page_index": 2,
                "parsing_res_list": [
                    {"block_content": "第一段 杭州西湖"},
                    {"block_content": "第二段 灵隐寺"},
                ],
                "overall_ocr_res": {
                    "rec_texts": ["乱序文本"],
                    "rec_scores": [0.8, 1.0],
                },
            }
        }
        self.assertEqual(extract_page(result, 1), {
            "page": 3,
            "text": "第一段 杭州西湖\n第二段 灵隐寺",
            "confidence": 0.9,
        })

    def test_falls_back_to_ocr_text_and_rejects_empty_documents(self):
        result = {"res": {"overall_ocr_res": {"rec_texts": ["西湖", "", "灵隐寺"], "rec_scores": []}}}
        self.assertEqual(extract_page(result, 4)["text"], "西湖\n灵隐寺")
        with self.assertRaisesRegex(ValueError, "ocr_returned_no_text"):
            normalize_results([{"res": {"overall_ocr_res": {"rec_texts": []}}}], 10)

    def test_enforces_document_page_limit(self):
        pages = [{"res": {"overall_ocr_res": {"rec_texts": [str(index)]}}} for index in range(3)]
        with self.assertRaisesRegex(ValueError, "document_page_limit_exceeded"):
            normalize_results(pages, 2)


if __name__ == "__main__":
    unittest.main()
