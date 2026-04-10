package com.nexus.route.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
@Slf4j
@RequiredArgsConstructor
public class RouteUpdateConsumer {

    private static final String ROUTE_STATUS_PREFIX = "route:status:";

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "route-updates", groupId = "route-updates-redis", concurrency = "1")
    public void onRouteUpdate(String message) {
        if (message == null || message.isBlank()) {
            return;
        }
        try {
            JsonNode root = objectMapper.readTree(message);
            JsonNode vid = root.get("vehicle_id");
            if (vid == null || !vid.isTextual()) {
                log.warn("route-updates message missing vehicle_id string, skip. payload snippet: {}",
                        message.length() > 120 ? message.substring(0, 120) : message);
                return;
            }
            String vehicleId = vid.asText();
            stringRedisTemplate.opsForValue().set(ROUTE_STATUS_PREFIX + vehicleId, message, Duration.ofSeconds(300));
        } catch (Exception e) {
            log.warn("route-updates malformed JSON or Redis error, skip: {} | payload snippet: {}",
                    e.getMessage(),
                    message.length() > 120 ? message.substring(0, 120) : message);
        }
    }
}
