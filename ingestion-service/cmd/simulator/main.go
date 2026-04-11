// Command simulator drives continuous demo pings over gRPC to the host ingestion service.
// Run from repo: cd ingestion-service && go run ./cmd/simulator
// Requires: ingestion gRPC on localhost:50051 (e.g. docker compose exposing 50051).
package main

import (
	"context"
	"flag"
	"log"
	"math"
	"os"
	"os/signal"
	"syscall"
	"time"

	pb "github.com/nexus-logistics/ingestion-service/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

const earthRadiusM = 6_371_000.0

func haversineM(lat1, lon1, lat2, lon2 float64) float64 {
	p1 := lat1 * math.Pi / 180
	p2 := lat2 * math.Pi / 180
	dP := (lat2 - lat1) * math.Pi / 180
	dL := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dP/2)*math.Sin(dP/2) + math.Cos(p1)*math.Cos(p2)*math.Sin(dL/2)*math.Sin(dL/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadiusM * c
}

type waypoint struct {
	lat, lng float64
}

type vehicle struct {
	id         string
	vType      string
	pts        []waypoint
	posM       float64
	total      float64
	speedKmh   float64 // 0 = use global -speed flag
}

// segment returns subdiv+1 points from a→b (inclusive), linear in lat/lng (coarse arc for demo).
func segment(a, b waypoint, subdiv int) []waypoint {
	if subdiv < 1 {
		subdiv = 1
	}
	out := make([]waypoint, 0, subdiv+1)
	for i := 0; i <= subdiv; i++ {
		t := float64(i) / float64(subdiv)
		out = append(out, waypoint{
			a.lat + t*(b.lat-a.lat),
			a.lng + t*(b.lng-a.lng),
		})
	}
	return out
}

// buildLoopRoute connects corners in order, then returns along the reverse corridor and closes the loop.
func buildLoopRoute(corners []waypoint, subdivPerSeg int) []waypoint {
	if len(corners) < 2 {
		return corners
	}
	var w []waypoint
	for i := 0; i < len(corners)-1; i++ {
		seg := segment(corners[i], corners[i+1], subdivPerSeg)
		if len(w) > 0 {
			seg = seg[1:]
		}
		w = append(w, seg...)
	}
	rev := make([]waypoint, len(corners))
	copy(rev, corners)
	for i, j := 0, len(rev)-1; i < j; i, j = i+1, j-1 {
		rev[i], rev[j] = rev[j], rev[i]
	}
	for i := 0; i < len(rev)-1; i++ {
		seg := segment(rev[i], rev[i+1], subdivPerSeg)
		if len(w) > 0 {
			seg = seg[1:]
		}
		w = append(w, seg...)
	}
	w = append(w, w[0])
	return w
}

func (v *vehicle) computeTotal() {
	var sum float64
	n := len(v.pts)
	for i := 0; i < n; i++ {
		j := (i + 1) % n
		sum += haversineM(v.pts[i].lat, v.pts[i].lng, v.pts[j].lat, v.pts[j].lng)
	}
	v.total = sum
}

func (v *vehicle) advance(distM float64) {
	v.posM += distM
	for v.posM >= v.total {
		v.posM -= v.total
	}
}

func (v *vehicle) latLng() (float64, float64) {
	if v.total < 1e-6 {
		return v.pts[0].lat, v.pts[0].lng
	}
	remain := v.posM
	n := len(v.pts)
	for i := 0; i < n; i++ {
		j := (i + 1) % n
		seg := haversineM(v.pts[i].lat, v.pts[i].lng, v.pts[j].lat, v.pts[j].lng)
		if remain <= seg+1e-9 {
			t := 0.0
			if seg > 1e-6 {
				t = remain / seg
			}
			lat := v.pts[i].lat + t*(v.pts[j].lat-v.pts[i].lat)
			lng := v.pts[i].lng + t*(v.pts[j].lng-v.pts[i].lng)
			return lat, lng
		}
		remain -= seg
	}
	return v.pts[0].lat, v.pts[0].lng
}

func sfLoop(extra ...waypoint) []waypoint {
	base := []waypoint{
		{37.8025, -122.4368}, // Marina
		{37.7849, -122.4084}, // Downtown / Market
		{37.7649, -122.4220}, // Mission 16th
		{37.7522, -122.4184}, // Mission 24th
		{37.7575, -122.3870}, // Potrero
		{37.7749, -122.4224}, // Hayes
	}
	out := append([]waypoint{}, base...)
	out = append(out, extra...)
	// close loop to first
	out = append(out, out[0])
	return out
}

func main() {
	addr := flag.String("addr", "localhost:50051", "gRPC address for ingestion TrackerService")
	tick := flag.Duration("tick", 1500*time.Millisecond, "interval between ping batches")
	speedKmh := flag.Float64("speed", 60, "default ground speed for truck/bus routes (km/h); aircraft use -aircraft-speed")
	aircraftSpeedKmh := flag.Float64("aircraft-speed", 800, "speed along aircraft demo routes (km/h)")
	flag.Parse()

	// US transcontinental demo corridors (airport-ish coords), multi-hop then return leg (closed loop).
	sfo := waypoint{37.6213, -122.3790}  // SFO
	den := waypoint{39.8561, -104.6737}   // DEN
	ord := waypoint{41.9742, -87.9073}    // ORD
	jfk := waypoint{40.6413, -73.7781}    // JFK
	lax := waypoint{33.9416, -118.4085}    // LAX
	slc := waypoint{40.7899, -111.9791}    // SLC
	sea := waypoint{47.4502, -122.3088}   // SEA
	msp := waypoint{44.8848, -93.2223}     // MSP
	dfw := waypoint{32.8998, -97.0403}    // DFW
	atl := waypoint{33.6407, -84.4277}    // ATL
	mia := waypoint{25.7959, -80.2870}    // MIA
	bos := waypoint{42.3656, -71.0096}    // BOS
	phx := waypoint{33.4373, -112.0080}  // PHX

	const hop = 4 // points per leg (smooth enough for map)

	vehicles := []*vehicle{
		{id: "sim-truck-01", vType: "truck", pts: sfLoop()},
		{id: "sim-truck-02", vType: "truck", pts: sfLoop(waypoint{37.7699, -122.4765})}, // Golden Gate Park detour
		{id: "sim-bus-01", vType: "bus", pts: []waypoint{
			{37.7946, -122.4014}, {37.8055, -122.3957}, {37.8060, -122.4100},
			{37.8009, -122.4179}, {37.7923, -122.4385}, {37.7850, -122.4297}, {37.7946, -122.4014},
		}},
		{id: "sim-bus-02", vType: "bus", pts: []waypoint{
			{37.7700, -122.4469}, {37.7599, -122.4671}, {37.7544, -122.4769},
			{37.7599, -122.4671}, {37.7700, -122.4469}, {37.7700, -122.4469},
		}},
		{id: "sim-truck-03", vType: "truck", pts: []waypoint{
			{34.0522, -118.2437}, {34.0625, -118.3080}, {33.9425, -118.4081},
			{34.0522, -118.2437}, {34.0522, -118.2437},
		}},
		{id: "sim-truck-04", vType: "truck", pts: []waypoint{
			{47.6062, -122.3321}, {47.6205, -122.3493}, {47.6097, -122.3337},
			{47.6062, -122.3321}, {47.6062, -122.3321},
		}},
		// Aircraft: cross-country loops, faster than surface traffic; x-vehicle-type=aircraft → Kafka vehicle_type.
		{id: "sim-aircraft-sfo-jfk", vType: "aircraft", speedKmh: *aircraftSpeedKmh, pts: buildLoopRoute([]waypoint{sfo, den, ord, jfk}, hop)},
		{id: "sim-aircraft-lax-ord", vType: "aircraft", speedKmh: *aircraftSpeedKmh, pts: buildLoopRoute([]waypoint{lax, slc, den, ord}, hop)},
		{id: "sim-aircraft-sea-mia", vType: "aircraft", speedKmh: *aircraftSpeedKmh, pts: buildLoopRoute([]waypoint{sea, msp, den, dfw, atl, mia}, hop)},
		{id: "sim-aircraft-bos-phx", vType: "aircraft", speedKmh: *aircraftSpeedKmh, pts: buildLoopRoute([]waypoint{bos, ord, den, phx}, hop)},
	}
	for _, v := range vehicles {
		v.computeTotal()
	}

	conn, err := grpc.Dial(*addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("dial: %v", err)
	}
	defer conn.Close()
	client := pb.NewTrackerServiceClient(conn)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	ticker := time.NewTicker(*tick)
	defer ticker.Stop()

	log.Printf("simulator: %d vehicles, tick=%v default_speed=%.0f km/h aircraft_speed=%.0f km/h → addr=%s",
		len(vehicles), *tick, *speedKmh, *aircraftSpeedKmh, *addr)

	for {
		select {
		case <-ctx.Done():
			log.Println("simulator: shutdown")
			return
		case <-ticker.C:
			for _, v := range vehicles {
				sp := *speedKmh
				if v.speedKmh > 0 {
					sp = v.speedKmh
				}
				mPer := (sp * 1000) / 3600
				dist := mPer * tick.Seconds()
				v.advance(dist)
				lat, lng := v.latLng()
				ts := time.Now().Unix()
				mdCtx := metadata.AppendToOutgoingContext(context.Background(), "x-vehicle-type", v.vType)
				rpcCtx, cancel := context.WithTimeout(mdCtx, 8*time.Second)
				_, err := client.SendPing(rpcCtx, &pb.LocationPing{
					VehicleId: v.id,
					Latitude:  lat,
					Longitude: lng,
					Timestamp: ts,
				})
				cancel()
				if err != nil {
					log.Printf("simulator: SendPing %s failed: %v", v.id, err)
					continue
				}
				log.Printf("ping vehicle_id=%s lat=%.6f lng=%.6f timestamp=%d type=%s", v.id, lat, lng, ts, v.vType)
			}
		}
	}
}
