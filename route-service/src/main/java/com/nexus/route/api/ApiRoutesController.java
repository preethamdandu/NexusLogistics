package com.nexus.route.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexus.route.model.RouteRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = "*", maxAge = 3600)
public class ApiRoutesController {

    private static final String ROUTE_STATUS_PREFIX = "route:status:";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final StringRedisTemplate stringRedisTemplate;

    @PostMapping(value = "/calculate", consumes = MediaType.APPLICATION_JSON_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> calculate(@RequestBody RouteRequest request) {
        if (request.getVehicleId() == null || request.getVehicleId().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "invalid_request",
                    "message", "vehicleId is required"));
        }
        try {
            String payload = objectMapper.writeValueAsString(request);
            String requestId = UUID.randomUUID().toString();
            kafkaTemplate.send("route-requests", request.getVehicleId(), payload);
            return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of(
                    "requestId", requestId,
                    "status", "accepted"));
        } catch (Exception e) {
            log.error("Failed to enqueue route request", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                    "error", "enqueue_failed",
                    "message", "Could not publish route request"));
        }
    }

    @GetMapping(value = "/status/{vehicleId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> status(@PathVariable String vehicleId) {
        String key = ROUTE_STATUS_PREFIX + vehicleId;
        String json = stringRedisTemplate.opsForValue().get(key);
        if (json == null || json.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                    "error", "not_found",
                    "message", "No route status cached for this vehicle"));
        }
        try {
            return ResponseEntity.ok(objectMapper.readTree(json));
        } catch (Exception e) {
            log.warn("Corrupt route status JSON for {}: {}", vehicleId, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                    "error", "corrupt_cache",
                    "message", "Stored route status is invalid JSON"));
        }
    }
}
