#!/bin/bash
set -euo pipefail
node "$(dirname "$0")/scan-build.js"
