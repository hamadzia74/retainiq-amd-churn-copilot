#!/usr/bin/env bash
# Serve the RetainIQ LLM on an AMD Instinct GPU (AMD Developer Cloud, ROCm) with vLLM.
#
# Run this ON the AMD Developer Cloud droplet (MI300X). Then, from your laptop:
#     ssh -N -L 8000:localhost:8000 root@<droplet-ip>
# and keep LLM_BASE_URL=http://localhost:8000/v1 in .env - nothing is exposed publicly.
#
# MODEL can be swapped, e.g. MODEL=meta-llama/Llama-3.3-70B-Instruct fits on one MI300X (192 GB)
# (use --tool-call-parser llama3_json for Llama models).
set -euo pipefail

MODEL="${MODEL:-Qwen/Qwen2.5-7B-Instruct}"
PARSER="${PARSER:-hermes}"

docker run -d --name retainiq-llm \
  --network=host --ipc=host --shm-size 16G \
  --device=/dev/kfd --device=/dev/dri --group-add video \
  --cap-add=SYS_PTRACE --security-opt seccomp=unconfined \
  -v "$HOME/.cache/huggingface:/root/.cache/huggingface" \
  -e HF_TOKEN="${HF_TOKEN:-}" \
  rocm/vllm:latest \
  vllm serve "$MODEL" \
    --host 127.0.0.1 --port 8000 \
    --enable-auto-tool-choice --tool-call-parser "$PARSER" \
    --max-num-seqs 128

echo "Starting... follow with: docker logs -f retainiq-llm"
echo "Check GPU use with:      rocm-smi"
