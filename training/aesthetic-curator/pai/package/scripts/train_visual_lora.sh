#!/usr/bin/env bash
set -euo pipefail

: "${TRAIN_JSONL:?Set TRAIN_JSONL}"
: "${VAL_JSONL:?Set VAL_JSONL}"
: "${OUTPUT_DIR:?Set OUTPUT_DIR}"

MODEL_ID="${MODEL_ID:-Qwen/Qwen3-VL-2B-Instruct}"
MODEL_REVISION="${MODEL_REVISION:-ae9985b208c074c10cfbe3a61b5cb7268cdc9c53}"
MAX_STEPS="${MAX_STEPS:-160}"
IMAGE_TOKENS="${IMAGE_TOKENS:-512}"
mkdir -p "$OUTPUT_DIR"

PYTORCH_CUDA_ALLOC_CONF='expandable_segments:True' \
IMAGE_MAX_TOKEN_NUM="$IMAGE_TOKENS" \
NPROC_PER_NODE=1 \
swift sft \
  --model "$MODEL_ID" \
  --model_revision "$MODEL_REVISION" \
  --dataset "$TRAIN_JSONL" \
  --val_dataset "$VAL_JSONL" \
  --tuner_type lora \
  --torch_dtype bfloat16 \
  --num_train_epochs 1 \
  --max_steps "$MAX_STEPS" \
  --per_device_train_batch_size 1 \
  --per_device_eval_batch_size 1 \
  --attn_impl sdpa \
  --learning_rate 1e-5 \
  --lora_rank 8 \
  --lora_alpha 16 \
  --lora_dropout 0.05 \
  --target_modules all-linear \
  --freeze_llm true \
  --freeze_vit false \
  --freeze_aligner false \
  --gradient_checkpointing true \
  --vit_gradient_checkpointing true \
  --gradient_accumulation_steps 8 \
  --eval_strategy steps \
  --eval_steps 80 \
  --save_steps 80 \
  --save_total_limit 2 \
  --logging_steps 5 \
  --max_length 3072 \
  --output_dir "$OUTPUT_DIR" \
  --warmup_ratio 0.05 \
  --dataset_num_proc 4 \
  --dataloader_num_workers 4
