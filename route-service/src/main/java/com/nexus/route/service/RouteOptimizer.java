package com.nexus.route.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexus.route.graph.AStar;
import com.nexus.route.graph.Haversine;
import com.nexus.route.graph.RoadGraph;
import com.nexus.route.graph.SanFranciscoRoadNetwork;
import com.nexus.route.model.RouteRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class RouteOptimizer {

    private static final String LOCK_PREFIX = "lock:route:";
    /** Assumed average speed for ETA from graph distance (km/h). */
    private static final double AVERAGE_SPEED_KMH = 30.0;

    private final StringRedisTemplate redisTemplate;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final RoadGraph roadGraph;

    public void optimizeRoute(RouteRequest request) {
        String lockKey = LOCK_PREFIX + request.getVehicleId();

        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(lockKey, "locked", Duration.ofSeconds(10));

        if (Boolean.TRUE.equals(acquired)) {
            try {
                log.info("Acquired lock for vehicle {}. Calculating optimal route...", request.getVehicleId());

                String startNode = nearestNodeId(request.getCurrentLat(), request.getCurrentLong());
                String goalNode = SanFranciscoRoadNetwork.DEPOT_NODE_ID;
                List<String> nodePath = AStar.shortestPath(roadGraph, startNode, goalNode);

                if (nodePath.isEmpty()) {
                    log.warn("No path from {} to {} for vehicle {}", startNode, goalNode, request.getVehicleId());
                    return;
                }

                double totalMeters = pathLengthMeters(nodePath);
                long etaSeconds = Math.round((totalMeters / 1000.0) / AVERAGE_SPEED_KMH * 3600.0);

                Map<String, Object> result = new LinkedHashMap<>();
                result.put("vehicle_id", request.getVehicleId());
                result.put("status", "OPTIMIZED");
                result.put("path", pathCoordinates(nodePath));
                result.put("total_distance_meters", totalMeters);
                result.put("eta_seconds", etaSeconds);

                String jsonResult = objectMapper.writeValueAsString(result);
                kafkaTemplate.send("route-updates", request.getVehicleId(), jsonResult);

                log.info("Route calculation complete for {}. Result published.", request.getVehicleId());

            } catch (Exception e) {
                log.error("Error calculating route", e);
            } finally {
                redisTemplate.delete(lockKey);
            }
        } else {
            log.warn("Duplicate route request for vehicle {} skipped (Optimization already in progress).",
                    request.getVehicleId());
        }
    }

    private String nearestNodeId(double lat, double lng) {
        return roadGraph.nodeIds().stream()
                .min(Comparator.comparingDouble(id -> {
                    RoadGraph.Node n = roadGraph.getNode(id);
                    return Haversine.meters(lat, lng, n.lat(), n.lng());
                }))
                .orElseThrow(() -> new IllegalStateException("Road graph has no nodes"));
    }

    private double pathLengthMeters(List<String> nodeIds) {
        if (nodeIds.size() < 2) {
            return 0.0;
        }
        double sum = 0.0;
        for (int i = 0; i < nodeIds.size() - 1; i++) {
            String a = nodeIds.get(i);
            String b = nodeIds.get(i + 1);
            sum += edgeWeightMeters(a, b);
        }
        return sum;
    }

    private double edgeWeightMeters(String fromId, String toId) {
        for (RoadGraph.Neighbor nb : roadGraph.neighbors(fromId)) {
            if (nb.nodeId().equals(toId)) {
                return nb.weightMeters();
            }
        }
        throw new IllegalStateException("No edge between " + fromId + " and " + toId);
    }

    private List<Map<String, Object>> pathCoordinates(List<String> nodeIds) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String id : nodeIds) {
            RoadGraph.Node n = roadGraph.getNode(id);
            Map<String, Object> pt = new LinkedHashMap<>();
            pt.put("lat", n.lat());
            pt.put("lng", n.lng());
            out.add(pt);
        }
        return out;
    }
}
