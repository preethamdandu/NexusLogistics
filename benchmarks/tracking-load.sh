#!/bin/bash
# NexusLogistics - Tracking Service Load Test
# Uses 'hey' for HTTP benchmarking - install with: brew install hey

set -e

# Configuration
URL="${API_URL:-http://localhost/api/live/all}"
DURATION="${DURATION:-30s}"
CONCURRENCY="${CONCURRENCY:-100}"
RATE="${RATE:-1000}"

echo "=============================================="
echo "  NexusLogistics Load Test - Tracking API"
echo "=============================================="
echo ""
echo "Target URL: $URL"
echo "Duration: $DURATION"
echo "Concurrency: $CONCURRENCY"
echo "Rate Limit: $RATE requests/second"
echo ""

# Check if hey is installed
if ! command -v hey &> /dev/null; then
    echo "❌ 'hey' is not installed. Install with: brew install hey"
    echo "Alternative: Using curl for basic test..."
    
    echo "Running 100 sequential requests..."
    start=$(date +%s.%N)
    for i in {1..100}; do
        curl -s "$URL" > /dev/null
    done
    end=$(date +%s.%N)
    
    duration=$(echo "$end - $start" | bc)
    rps=$(echo "scale=2; 100 / $duration" | bc)
    echo ""
    echo "Results:"
    echo "  Total Time: ${duration}s"
    echo "  RPS: ${rps}"
    exit 0
fi

echo "Starting load test..."
echo ""

# Run hey benchmark
hey -z "$DURATION" \
    -c "$CONCURRENCY" \
    -q "$RATE" \
    -m GET \
    -H "Accept: application/json" \
    "$URL" | tee /tmp/tracking-benchmark.txt

echo ""
echo "=============================================="
echo "  Benchmark Complete!"
echo "=============================================="

# Extract key metrics
echo ""
echo "Summary:"
grep "Requests/sec" /tmp/tracking-benchmark.txt || true
grep "Average:" /tmp/tracking-benchmark.txt || true
grep "99%" /tmp/tracking-benchmark.txt || true
