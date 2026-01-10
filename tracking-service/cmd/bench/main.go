package main

import (
	"flag"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"math/rand"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

var (
	concurrency = flag.Int("c", 50, "Number of concurrent readers")
	duration    = flag.Duration("d", 10*time.Second, "Duration of the test")
	targetAddr  = flag.String("addr", "http://localhost:3000", "Base URL of Tracking Service")
)

func main() {
	flag.Parse()
    
    // Ensure we have some data first (assuming ingestion bench ran or is running)
    // We will query random vehicle IDs from 'vehicle-0' to 'vehicle-999' (matching ingestion bench)

	log.Printf("Starting Read Stress Test: %d workers for %v against %s", *concurrency, *duration, *targetAddr)

	var (
		totalReqs  int64
		failedReqs int64
		latencies  []time.Duration
		mu         sync.Mutex
		wg         sync.WaitGroup
	)

	start := time.Now()
    // Create a shared Transport to pool connections (keep-alive)
    tr := &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 100,
        IdleConnTimeout:     90 * time.Second,
    }
    client := &http.Client{Transport: tr, Timeout: 2 * time.Second}

	// Launch workers
	for i := 0; i < *concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
            end := time.Now().Add(*duration)
            
			for time.Now().Before(end) {
                // Random vehicle ID
                vid := fmt.Sprintf("bench-veh-%d", rand.Intn(1000))
                url := fmt.Sprintf("%s/tracking/%s", *targetAddr, vid)

				reqStart := time.Now()
				resp, err := client.Get(url)
				dur := time.Since(reqStart)

				if err != nil {
					atomic.AddInt64(&failedReqs, 1)
                    // log.Printf("Error: %v", err)
                    time.Sleep(10 * time.Millisecond) // Backoff slightly
                    continue
				}
                
                // Read body to reuse connection
                io.Copy(ioutil.Discard, resp.Body)
                resp.Body.Close()

				if resp.StatusCode != 200 {
                    // 404 is expected if data hasn't arrived yet, but let's count 500s as failures
                    if resp.StatusCode >= 500 {
					    atomic.AddInt64(&failedReqs, 1)
                    } else {
                        // 404/200 OK
                        atomic.AddInt64(&totalReqs, 1)
                        mu.Lock()
                        latencies = append(latencies, dur)
                        mu.Unlock()
                    }
				} else {
					atomic.AddInt64(&totalReqs, 1)
					mu.Lock()
					latencies = append(latencies, dur)
					mu.Unlock()
				}
			}
		}()
	}

	wg.Wait()
	totalTime := time.Since(start)

	// Calculate Stats
	mu.Lock()
	defer mu.Unlock()

    if len(latencies) == 0 {
        log.Println("No successful requests.")
        return
    }

	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })

	var sum time.Duration
	for _, l := range latencies {
		sum += l
	}
	avg := sum / time.Duration(len(latencies))
	p50 := latencies[len(latencies)*50/100]
	p99 := latencies[len(latencies)*99/100]
    
    rps := float64(totalReqs) / totalTime.Seconds()

	fmt.Println("\n--- Read Load Test Results ---")
	fmt.Printf("Total Requests: %d\n", totalReqs)
	fmt.Printf("Failed (5xx): %d\n", failedReqs)
	fmt.Printf("Duration: %v\n", totalTime)
	fmt.Printf("Read RPS: %.2f\n", rps)
	fmt.Printf("Avg Latency: %v\n", avg)
	fmt.Printf("P50 Latency: %v\n", p50)
	fmt.Printf("P99 Latency: %v\n", p99)
}
