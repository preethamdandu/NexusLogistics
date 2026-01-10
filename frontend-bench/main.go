package main

import (
	"fmt"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

var (
	frontendURL = "http://localhost:3002"
	apiURL      = "http://localhost/api/tracking/vehicle-123"
	concurrency = 100
	duration    = 15 * time.Second
)

func init() {
	if url := os.Getenv("FRONTEND_URL"); url != "" {
		frontendURL = url
	}
	if url := os.Getenv("API_URL"); url != "" {
		apiURL = url
	}
}

func main() {
	fmt.Println("=== PHASE 5: FRONTEND BRUTAL STRESS TEST ===")
	fmt.Println()

	// Test 1: Frontend Static Assets
	fmt.Println("[Test 1] Frontend Static Assets (simulating browser page loads)")
	testEndpoint(frontendURL, 50, 10*time.Second)

	// Test 2: API Polling Storm
	fmt.Println()
	fmt.Println("[Test 2] API Polling Storm (simulating 100 clients polling every 2s)")
	testEndpoint(apiURL, concurrency, duration)

	fmt.Println()
	fmt.Println("=== STRESS TEST COMPLETE ===")
}

func testEndpoint(url string, workers int, dur time.Duration) {
	var (
		requests  uint64
		successes uint64
		errors    uint64
	)

	client := &http.Client{
		Transport: &http.Transport{
			MaxIdleConns:        200,
			MaxIdleConnsPerHost: 200,
		},
		Timeout: 5 * time.Second,
	}

	fmt.Printf("Target: %s\n", url)
	fmt.Printf("Workers: %d, Duration: %s\n", workers, dur)

	start := time.Now()
	var wg sync.WaitGroup
	done := make(chan struct{})

	go func() {
		time.Sleep(dur)
		close(done)
	}()

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-done:
					return
				default:
					atomic.AddUint64(&requests, 1)
					resp, err := client.Get(url)
					if err != nil {
						atomic.AddUint64(&errors, 1)
						continue
					}
					if resp.StatusCode >= 200 && resp.StatusCode < 400 {
						atomic.AddUint64(&successes, 1)
					} else {
						atomic.AddUint64(&errors, 1)
					}
					resp.Body.Close()
				}
			}
		}()
	}

	wg.Wait()
	elapsed := time.Since(start)

	fmt.Println("--- Results ---")
	fmt.Printf("Total Requests: %d\n", requests)
	fmt.Printf("RPS: %.2f\n", float64(requests)/elapsed.Seconds())
	fmt.Printf("Success: %d (%.1f%%)\n", successes, float64(successes)/float64(requests)*100)
	fmt.Printf("Errors: %d\n", errors)
}
