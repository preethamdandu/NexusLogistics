package service

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	"github.com/nexus-logistics/ingestion-service/internal/kafka"
	pb "github.com/nexus-logistics/ingestion-service/pb"
	"google.golang.org/grpc/metadata"
)

var (
	pingsReceived = promauto.NewCounter(prometheus.CounterOpts{
		Name: "ingestion_pings_received_total",
		Help: "The total number of location pings received",
	})
	pingsProduced = promauto.NewCounter(prometheus.CounterOpts{
		Name: "ingestion_pings_produced_total",
		Help: "The total number of pings successfully produced to Kafka",
	})
)

type TrackerService struct {
	pb.UnimplementedTrackerServiceServer
	producer *kafka.Producer
}

func NewTrackerService(producer *kafka.Producer) *TrackerService {
	return &TrackerService{
		producer: producer,
	}
}

type PingPayload struct {
	VehicleID   string  `json:"vehicle_id"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Timestamp   int64   `json:"timestamp"`
	VehicleType string  `json:"vehicle_type,omitempty"`
}

func (s *TrackerService) SendPing(ctx context.Context, req *pb.LocationPing) (*pb.PingResponse, error) {
	// log.Printf("Received ping from vehicle: %s", req.VehicleId)
	pingsReceived.Inc()

	vt := "truck"
	if md, ok := metadata.FromIncomingContext(ctx); ok {
		if v := md.Get("x-vehicle-type"); len(v) > 0 && v[0] != "" {
			t := strings.ToLower(strings.TrimSpace(v[0]))
			if t == "bus" || t == "truck" || t == "aircraft" {
				vt = t
			}
		}
	}

	payload := PingPayload{
		VehicleID:   req.VehicleId,
		Latitude:    req.Latitude,
		Longitude:   req.Longitude,
		Timestamp:   req.Timestamp,
		VehicleType: vt,
	}

	// Use current time if timestamp is 0 or missing, though proto default is 0.
	if payload.Timestamp == 0 {
		payload.Timestamp = time.Now().Unix()
	}

	err := s.producer.Produce(req.VehicleId, payload)
	if err != nil {
		log.Printf("Failed to publish to Kafka: %v", err)
		return &pb.PingResponse{
			Success: false,
			Message: "Failed to process ping",
		}, nil
	}
	pingsProduced.Inc()

	return &pb.PingResponse{
		Success: true,
		Message: "Ping received",
	}, nil
}
