---
name: writer-book
description: |
  文化知识流水线（离线脚本）。从 Z-Library / 本地书库导入书，抽取文本、分块，
  形成作家 / 作品 / 城市文化的 RAG 知识库，供运行时 deep-answer 子 agent 检索。
type: pipeline
runtime: node
llm: false
io:
  in: "书文件（txt/md 直接；docx/pdf/epub 需解析器）"
  out: "resource-library/knowledge/<kb>.json（分块语料）"
---

# 阶段（责任链）
1. extract  书 → 纯文本（✅ txt/md 已实现；docx/pdf/epub 需解析器 — 接入点）
2. chunk    文本 → 分块（✅ 已实现，重叠滑窗）
3. embed    分块 → 向量（需嵌入 API）— 接入点
4. store    写入向量库 / 检索器（需向量库）— 接入点；当前先落地分块 JSON 语料

# 边界
- 离线运行，不进 bundle，不含密钥。
- 产物 resource-library/knowledge/ 属私有资料库（gitignore）。
- deep-answer 接 RAG 前，先用城市播客文稿兜底。

# 用法
```bash
node .../pipeline.mjs ingest --in <book.txt|.md> --kb cities --tag 洛杉矶
# 产出 resource-library/knowledge/cities.json（分块语料，追加）
```
