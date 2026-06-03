#!/bin/bash
set -euo pipefail

# 클라우드(원격) 환경에서만 실행
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "=== 클라우드 세션 환경 준비 중 ==="

# Git 기본 설정
git config --global core.autocrlf false
git config --global pull.rebase false

# 기본 도구 확인
echo "Node.js: $(node --version 2>/dev/null || echo '없음')"
echo "Python:  $(python3 --version 2>/dev/null || echo '없음')"
echo "Git:     $(git --version)"

echo "=== 환경 준비 완료 ==="
