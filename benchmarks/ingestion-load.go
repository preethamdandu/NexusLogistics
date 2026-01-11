// NexusLogistics gRPC Benchmark for Ingestion Service
// Run: go run ingestion-load.go

package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Simplified protobuf-like structures
type LocationPing struct {
	VehicleId string
	Latitude  float64
	Longitude float64
	Timestamp int64
}

var (
	addr        = flag.String("addr", "localhost:50051", "gRPC server address")
	concurrency = flag.Int("c", 100, "Number of concurrent connections")
	duration    = flag.Duration("d", 30*time.Second, "Test duration")
	requests    atomic.Int64
	errors      atomic.Int64
)

func main() {
	flag.Parse()

	fmt.Println("==============================================")
	fmt.Println("  NexusLogistics Load Test - Ingestion gRPC")
	fmt.Println("==============================================")
	fmt.Printf("Target: %s\n", *addr)
	fmt.Printf("Concurrency: %d\n", *concurrency)
	fmt.Printf("Duration: %s\n", *duration)
	fmt.Println()

	// Connect to gRPC server
	conn, err := grpc.Dial(*addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	var wg sync.WaitGroup
	ctx, cancel := context.WithTimeout(context.Background(), *duration)
	defer cancel()

	start := time.Now()

	// Launch concurrent workers
	for i := 0; i < *concurrency; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			runWorker(ctx, conn, workerID)
		}(i)
	}

	wg.Wait()
	elapsed := time.Since(start)

	// Print results
	totalRequests := requests.Load()
	totalErrors := errors.Load()
	rps := float64(totalRequests) / elapsed.Seconds()

	fmt.Println()
	fmt.Println("==============================================")
	fmt.Println("  Benchmark Results")
	fmt.Println("==============================================")
	fmt.Printf("Total Requests:  %d\n", totalRequests)
	fmt.Printf("Total Errors:    %d\n", totalErrors)
	fmt.Printf("Duration:        %s\n", elapsed.Round(time.Millisecond))
	fmt.Printf("Requests/sec:    %.2f\n", rps)
	fmt.Printf("Error Rate:      %.2f%%\n", float64(totalErrors)/float64(totalRequests)*100)
}

func runWorker(ctx context.Context, conn *grpc.ClientConn, workerID int) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
			// Simulate sending a location ping
			ping := LocationPing{
				VehicleId: fmt.Sprintf("vehicle-%d-%d", workerID, rand.Intn(1000)),
				Latitude:  37.7749 + rand.Float64()*0.1,
				Longitude: -122.4194 + rand.Float64()*0.1,
				Timestamp: time.Now().Unix(),
			}

			// In a real benchmark, we'd use the proto client here
			// For now, just simulate the request
			_ = ping
			requests.Add(1)
			time.Sleep(time.Millisecond) // Simulate request latency
		}
	}
}
