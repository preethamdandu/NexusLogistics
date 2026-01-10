package com.nexus.route.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexus.route.model.RouteRequest;
import com.nexus.route.service.RouteOptimizer;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@Slf4j
@RequiredArgsConstructor
public class RouteRequestConsumer {

    private final RouteOptimizer routeOptimizer;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = "route-requests", groupId = "route-group")
    public void listen(String message) {
        try {
            // log.info("Received route request: {}", message);
            RouteRequest request = objectMapper.readValue(message, RouteRequest.class);
            routeOptimizer.optimizeRoute(request);
        } catch (Exception e) {
            log.error("Failed to parse/process route request", e);
        }
    }
}
