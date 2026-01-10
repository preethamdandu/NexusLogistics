package com.nexus.route.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexus.route.model.RouteRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
@RequiredArgsConstructor
public class RouteOptimizer {

    private final StringRedisTemplate redisTemplate;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    private static final String LOCK_PREFIX = "lock:route:";

    public void optimizeRoute(RouteRequest request) {
        String lockKey = LOCK_PREFIX + request.getVehicleId();

        // 1. Distributed Lock (SETNX)
        // Try to acquire lock for 10 seconds
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(lockKey, "locked", Duration.ofSeconds(10));

        if (Boolean.TRUE.equals(acquired)) {
            try {
                log.info("Acquired lock for vehicle {}. Calculating optimal route...", request.getVehicleId());

                // 2. Simulate Heavy Calculation (Dijkstra/A*)
                Thread.sleep(2000); // Simulate 2s computation

                // 3. Generate Mock Result
                Map<String, Object> result = new HashMap<>();
                result.put("vehicle_id", request.getVehicleId());
                result.put("status", "OPTIMIZED");
                result.put("next_stop", "Distribution Center A");
                result.put("eta_seconds", 1200);

                // 4. Publish to Kafka
                String jsonResult = objectMapper.writeValueAsString(result);
                kafkaTemplate.send("route-updates", request.getVehicleId(), jsonResult);

                log.info("Route calculation complete for {}. Result published.", request.getVehicleId());

            } catch (Exception e) {
                log.error("Error calculating route", e);
            } finally {
                // 5. Release Lock
                redisTemplate.delete(lockKey);
                // log.info("Released lock for vehicle {}", request.getVehicleId());
            }
        } else {
            log.warn("Duplicate route request for vehicle {} skipped (Optimization already in progress).",
                    request.getVehicleId());
        }
    }
}
