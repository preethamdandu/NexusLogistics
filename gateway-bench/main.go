package main

import (
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
	"os"
)

var (
	targetURL   = "http://localhost/api/tracking/vehicle-123"
	concurrency = 50
	duration    = 10 * time.Second
)

func init() {
	if url := os.Getenv("TARGET_URL"); url != "" {
		targetURL = url
	}
}

func main() {
	var (
		requests  uint64
		successes uint64
		rateLimit uint64
		errors    uint64
	)

	fmt.Printf("Starting stress test against %s\n", targetURL)
	fmt.Printf("Concurrency: %d, Duration: %s\n", concurrency, duration)

	start := time.Now()
	var wg sync.WaitGroup
	done := make(chan struct{})

	// Timer to stop variable load
	go func() {
		time.Sleep(duration)
		close(done)
	}()

	client := &http.Client{
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 100,
		},
		Timeout: 2 * time.Second,
	}

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-done:
					return
				default:
					atomic.AddUint64(&requests, 1)
					resp, err := client.Get(targetURL)
					if err != nil {
						atomic.AddUint64(&errors, 1)
						continue
					}
					
					if resp.StatusCode == 200 {
						atomic.AddUint64(&successes, 1)
					} else if resp.StatusCode == 503 || resp.StatusCode == 429 { // Nginx or Service Overload
						atomic.AddUint64(&rateLimit, 1)
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

	fmt.Println("\n--- Stress Test Results ---")
	fmt.Printf("Total Requests: %d\n", requests)
	fmt.Printf("Duration: %s\n", elapsed)
	fmt.Printf("RPS: %.2f\n", float64(requests)/elapsed.Seconds())
	fmt.Printf("Success (200 OK): %d\n", successes)
	fmt.Printf("Rate Limited/Unavailable (429/503): %d\n", rateLimit)
	fmt.Printf("Errors (Other): %d\n", errors)
}
