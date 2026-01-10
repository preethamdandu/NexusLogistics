package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"github.com/segmentio/kafka-go"
)

var (
	concurrency   = flag.Int("c", 100, "Number of concurrent producers")
	duration      = flag.Duration("d", 15*time.Second, "Duration of the test")
	kafkaBrokers  = flag.String("brokers", "localhost:9092", "Kafka brokers")
	vehicleCount  = flag.Int("vehicles", 50, "Number of unique vehicles (controls lock contention)")
)

type RouteRequest struct {
	VehicleID  string  `json:"vehicleId"`
	CurrentLat float64 `json:"currentLat"`
	CurrentLong float64 `json:"currentLong"`
}

func main() {
	flag.Parse()

	log.Printf("Starting Route Request Storm: %d workers, %d vehicles for %v", *concurrency, *vehicleCount, *duration)

	var (
		totalReqs  int64
		failedReqs int64
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

			writer := &kafka.Writer{
				Addr:     kafka.TCP(*kafkaBrokers),
				Topic:    "route-requests",
				Balancer: &kafka.RoundRobin{}, // Distribute across partitions
				Async:    true, // Fire and forget for max speed
			}
			defer writer.Close()

			for {
				select {
				case <-ctx.Done():
					return
				default:
					// Random vehicle ID from pool (to create lock contention)
					vid := fmt.Sprintf("stress-veh-%d", rand.Intn(*vehicleCount))
					
					req := RouteRequest{
						VehicleID:  vid,
						CurrentLat: 37.7749 + (rand.Float64() - 0.5),
						CurrentLong: -122.4194 + (rand.Float64() - 0.5),
					}
					
					data, _ := json.Marshal(req)

					err := writer.WriteMessages(ctx, kafka.Message{
						Value: data,
					})

					if err != nil {
						atomic.AddInt64(&failedReqs, 1)
					} else {
						atomic.AddInt64(&totalReqs, 1)
					}
				}
			}
		}(i)
	}

	wg.Wait()
	totalTime := time.Since(start)

	rps := float64(totalReqs) / totalTime.Seconds()

	fmt.Println("\n--- Route Request Storm Results ---")
	fmt.Printf("Total Requests Sent: %d\n", totalReqs)
	fmt.Printf("Failed Sends: %d\n", failedReqs)
	fmt.Printf("Duration: %v\n", totalTime)
	fmt.Printf("Producer RPS: %.2f\n", rps)
	fmt.Println("\nNow check route-service logs to see lock contention stats.")
}
