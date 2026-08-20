# Pocket Earth PaddleOCR 服务

这是飞书比赛版的真实 OCR / 版面分析 sidecar。它直接使用 PaddleOCR 3.7 的
`PPStructureV3.predict()`，支持 PDF 与图片，逐页返回阅读顺序文本和平均识别置信度。

```bash
docker build -t pocket-earth-paddle-ocr services/paddle-ocr
docker run --rm -p 8010:8010 \
  -e OCR_API_KEY=replace-with-a-long-random-value \
  -e OCR_DEVICE=cpu \
  pocket-earth-paddle-ocr
```

主服务配置：

```dotenv
PADDLE_OCR_URL=http://127.0.0.1:8010/v1/ocr
PADDLE_OCR_API_KEY=replace-with-a-long-random-value
```

首次请求会下载并加载官方模型，因此冷启动明显慢于后续请求。生产建议持久化模型缓存、
使用单 worker，并通过 `OCR_CONCURRENCY` 控制同一进程的并行推理数。服务不记录文档正文，
上传内容只写入权限受限的临时文件，推理结束后立即删除。

无需安装 Paddle 即可验证纯契约：

```bash
cd services/paddle-ocr
python3 -m unittest -v test_contract.py
```
