package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	pb "github.com/nexus-logistics/ingestion-service/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var (
	concurrency = flag.Int("c", 10, "Number of concurrent simulated vehicles")
	duration    = flag.Duration("d", 10*time.Second, "Duration of the test")
	targetAddr  = flag.String("addr", "localhost:50051", "Address of the Ingestion Service")
)

func main() {
	flag.Parse()

	log.Printf("Starting Load Test: %d workers for %v against %s", *concurrency, *duration, *targetAddr)

	var (
		totalReqs  int64
		failedReqs int64
		latencies  []time.Duration
		mu         sync.Mutex // Protects latencies slice
		wg         sync.WaitGroup
	)

	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), *duration)
	defer cancel()

	// Launch workers
	for i := 0; i < *concurrency; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			
			// Each worker creates its own connection to simulate realistic load
			// In production, you might reuse connections, but for stress testing inputs, independent connections are often better
			// to test the server's connection handling. However, creating a connection per request is bad.
			// creating a connection per worker is reasonable.
			conn, err := grpc.Dial(*targetAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
			if err != nil {
				log.Printf("Worker %d failed to connect: %v", id, err)
				return
			}
			defer conn.Close()
			client := pb.NewTrackerServiceClient(conn)

			for {
				select {
				case <-ctx.Done():
					return
				default:
					// Generate random vehicle data
					vid := fmt.Sprintf("bench-veh-%d", rand.Intn(1000))
					reqStart := time.Now()
					
					_, err := client.SendPing(context.Background(), &pb.LocationPing{
						VehicleId: vid,
						Latitude:  37.7749 + (rand.Float64() - 0.5),
						Longitude: -122.4194 + (rand.Float64() - 0.5),
						Timestamp: time.Now().Unix(),
					})
					
					dur := time.Since(reqStart)

					if err != nil {
						atomic.AddInt64(&failedReqs, 1)
					} else {
						atomic.AddInt64(&totalReqs, 1)
						mu.Lock()
						latencies = append(latencies, dur)
						mu.Unlock()
					}
					
					// Optional: small sleep to prevent simple tight loop connection exhaustion if local
					// time.Sleep(1 * time.Millisecond) 
				}
			}
		}(i)
	}

	wg.Wait()
	totalTime := time.Since(start)

	// Calculate Stats
	mu.Lock()
	defer mu.Unlock()

    if len(latencies) == 0 {
        log.Println("No successful requests made.")
        return
    }

	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })

	avg := time.Duration(0)
    var sum time.Duration
	for _, l := range latencies {
		sum += l
	}
    if totalReqs > 0 {
	    avg = sum / time.Duration(totalReqs)
    }

	p50 := latencies[len(latencies)*50/100]
	p99 := latencies[len(latencies)*99/100]
    
    rps := float64(totalReqs) / totalTime.Seconds()

	fmt.Println("\n--- Load Test Results ---")
	fmt.Printf("Total Requests: %d\n", totalReqs)
	fmt.Printf("Failed Requests: %d\n", failedReqs)
	fmt.Printf("Duration: %v\n", totalTime)
	fmt.Printf("RPS: %.2f\n", rps)
	fmt.Printf("Avg Latency: %v\n", avg)
	fmt.Printf("P50 Latency: %v\n", p50)
	fmt.Printf("P99 Latency: %v\n", p99)
}
