#!/usr/bin/env python3
"""Build the final authoritative Pocket Earth Photos Tab plan DOCX."""

from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "scripts/build-aesthetic-curator-plan-docx.py"

spec = importlib.util.spec_from_file_location("photos_plan_docx_base", BASE)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load DOCX builder: {BASE}")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

builder.MARKDOWN = ROOT / "docs/strategy/Pocket-Earth-Photos-Tab-最终执行计划与验收准则-2026-08-11.md"
builder.OUTPUT = ROOT / "docs/strategy/Pocket-Earth-Photos-Tab-最终执行计划与验收准则-2026-08-11.docx"
builder.DOCUMENT_HEADER = "POCKET EARTH  /  PHOTOS TAB · FINAL PLAN"
builder.DOCUMENT_KICKER = "POCKET EARTH · FINAL PRODUCT / MODEL / DEVICE DECISION"
builder.DOCUMENT_SUBTITLE = "最终执行计划与验收准则 · 相册轻路由 / 旅程精选 / Visual LoRA / 本机偏好 / MNN"
builder.CORE_TITLE = "Pocket Earth Photos Tab 最终执行计划与验收准则"
builder.CORE_SUBJECT = "相册轻路由、旅程精选、Qwen3-VL Visual LoRA、个人偏好、MNN/SME2 与重返现场"
builder.CORE_KEYWORDS = "Pocket Earth, Photos Tab, Qwen3-VL, Visual LoRA, MNN, SME2, 旅程精选, 个人偏好, 重返现场"
builder.CORE_COMMENTS = "Photos 专项 Final 1.0；合并两份候选方案并以当前真实代码与 Android MNN 主链为准。"

builder.build()
