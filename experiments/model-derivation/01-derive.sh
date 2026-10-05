#!/bin/bash
# Stage 1: acquire parent artifact, derive quantized children.
# Parent: Qwen2.5-0.5B-Instruct f16 GGUF (the "best open weights" stand-in,
# small enough to iterate on). Children: Q4_K_M twice (determinism check, P1)
# and Q2_K once (the past-the-cliff comparison, P3/P4).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data chain

PARENT=data/qwen2.5-0.5b-instruct-fp16.gguf
URL="https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-fp16.gguf"

if [ ! -f "$PARENT" ]; then
  echo "downloading parent (~1 GB)..."
  curl -L --fail --progress-bar -o "$PARENT" "$URL"
fi

QUANT="$(which llama-quantize)"
# brew's llama-cli prints "version: NNNN (hash)" in --version output
VERSION="$(llama-cli --version 2>&1 | grep -i version | head -1 | tr -d '\n')"
THREADS=4

echo "quantizing Q4_K_M run 1..."
"$QUANT" "$PARENT" data/child-q4km-run1.gguf Q4_K_M $THREADS > data/quantize-q4-run1.log 2>&1
echo "quantizing Q4_K_M run 2 (identical recipe — determinism check)..."
"$QUANT" "$PARENT" data/child-q4km-run2.gguf Q4_K_M $THREADS > data/quantize-q4-run2.log 2>&1
echo "quantizing Q2_K..."
"$QUANT" "$PARENT" data/child-q2k.gguf Q2_K $THREADS > data/quantize-q2k.log 2>&1

cat > chain/recipe.json <<EOF
{
  "tool": "llama-quantize",
  "toolPath": "$QUANT",
  "toolVersion": "$VERSION",
  "toolchain": "homebrew",
  "threads": $THREADS,
  "derivations": [
    { "target": "Q4_K_M", "args": ["Q4_K_M", "$THREADS"], "output": "data/child-q4km-run1.gguf" },
    { "target": "Q2_K",   "args": ["Q2_K", "$THREADS"],   "output": "data/child-q2k.gguf" }
  ],
  "parent": {
    "file": "$PARENT",
    "source": {
      "type": "huggingface",
      "repo": "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
      "file": "qwen2.5-0.5b-instruct-fp16.gguf",
      "url": "$URL"
    }
  }
}
EOF

echo "--- sha256 (P1: run1 and run2 must match) ---"
shasum -a 256 "$PARENT" data/child-q4km-run1.gguf data/child-q4km-run2.gguf data/child-q2k.gguf | tee data/shasums.txt
