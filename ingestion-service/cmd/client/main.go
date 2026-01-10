package main

import (
	"context"
	"log"
	"time"

	pb "github.com/nexus-logistics/ingestion-service/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}
	defer conn.Close()
	c := pb.NewTrackerServiceClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

    // Simulate a ping from "Vehicle-1"
	r, err := c.SendPing(ctx, &pb.LocationPing{
		VehicleId: "vehicle-123",
		Latitude:  37.7749,
		Longitude: -122.4194,
		Timestamp: time.Now().Unix(),
	})
	if err != nil {
		log.Fatalf("could not ping: %v", err)
	}
	log.Printf("Response: %s (Success: %v)", r.Message, r.Success)
}
