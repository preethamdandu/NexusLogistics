package kafka

import (
	"encoding/json"
	"testing"
)

// pingPayload mirrors the JSON shape produced for vehicle-locations (same tags as service.PingPayload).
type pingPayload struct {
	VehicleID string  `json:"vehicle_id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Timestamp int64   `json:"timestamp"`
}

func TestMarshalProducePayload_TableDriven(t *testing.T) {
	tests := []struct {
		name  string
		input pingPayload
		want  pingPayload
	}{
		{
			name: "standard ping",
			input: pingPayload{
				VehicleID: "vehicle-123",
				Latitude:  37.7749,
				Longitude: -122.4194,
				Timestamp: 1712707200,
			},
			want: pingPayload{
				VehicleID: "vehicle-123",
				Latitude:  37.7749,
				Longitude: -122.4194,
				Timestamp: 1712707200,
			},
		},
		{
			name: "zero coordinates still round-trip",
			input: pingPayload{
				VehicleID: "edge-veh",
				Latitude:  0,
				Longitude: 0,
				Timestamp: 1,
			},
			want: pingPayload{
				VehicleID: "edge-veh",
				Latitude:  0,
				Longitude: 0,
				Timestamp: 1,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw, err := MarshalProducePayload(tt.input)
			if err != nil {
				t.Fatalf("MarshalProducePayload: %v", err)
			}

			var got pingPayload
			if err := json.Unmarshal(raw, &got); err != nil {
				t.Fatalf("json.Unmarshal: %v", err)
			}

			if got != tt.want {
				t.Errorf("round-trip mismatch\ngot  %#v\nwant %#v", got, tt.want)
			}
		})
	}
}
