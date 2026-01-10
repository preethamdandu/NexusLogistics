package main

import (
	"log"
	"net"
	"net/http"
	"os"

	"github.com/nexus-logistics/ingestion-service/internal/kafka"
	"github.com/nexus-logistics/ingestion-service/internal/service"
	pb "github.com/nexus-logistics/ingestion-service/pb"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/grpc"
    "google.golang.org/grpc/reflection"
)

func main() {
	// Configuration
	kafkaBrokers := os.Getenv("KAFKA_BROKERS")
	if kafkaBrokers == "" {
		kafkaBrokers = "localhost:9092"
	}
	topic := "vehicle-locations"
	port := ":50051"

	// Initialize Kafka Producer
	log.Printf("Connecting to Kafka at %s...", kafkaBrokers)
	producer, err := kafka.NewProducer(kafkaBrokers, topic)
	if err != nil {
		log.Fatalf("Failed to initialize Kafka producer: %v", err)
	}
	defer producer.Close()

	// Initialize gRPC Server
	lis, err := net.Listen("tcp", port)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	s := grpc.NewServer()
	trackerService := service.NewTrackerService(producer)
	pb.RegisterTrackerServiceServer(s, trackerService)
    
    // valid for debugging with grpcurl
    reflection.Register(s)

	// Start Metrics Server (Prometheus)
	go func() {
		http.Handle("/metrics", promhttp.Handler())
		log.Printf("Metrics server listening on :9090")
		if err := http.ListenAndServe(":9090", nil); err != nil {
			log.Printf("Failed to start metrics server: %v", err)
		}
	}()

	log.Printf("Ingestion Service listening on %s", port)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
