package com.nexus.route.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nexus.route.graph.SanFranciscoRoadNetwork;
import com.nexus.route.model.RouteRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.kafka.core.KafkaTemplate;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RouteOptimizerTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    @Mock
    private ValueOperations<String, String> valueOps;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private RouteOptimizer optimizer;

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
        when(valueOps.setIfAbsent(anyString(), anyString(), any(Duration.class))).thenReturn(true);
        doReturn(CompletableFuture.completedFuture(null))
                .when(kafkaTemplate).send(anyString(), anyString(), anyString());
        optimizer = new RouteOptimizer(redisTemplate, kafkaTemplate, objectMapper,
                SanFranciscoRoadNetwork.defaultGraph());
    }

    @Test
    void optimizeRoute_whenLockAcquired_sendsRouteUpdateAndReleasesLock() throws Exception {
        RouteRequest request = new RouteRequest();
        request.setVehicleId("veh-x");
        // Near graph node mission-24th so A* returns a non-empty path to sf-hub
        request.setCurrentLat(37.7522);
        request.setCurrentLong(-122.4184);

        optimizer.optimizeRoute(request);

        verify(kafkaTemplate).send(
                eq("route-updates"),
                eq("veh-x"),
                argThat(json -> json.contains("veh-x")
                        && json.contains("OPTIMIZED")
                        && json.contains("\"path\"")
                        && json.contains("total_distance_meters")));
        verify(redisTemplate).delete(eq("lock:route:veh-x"));
    }
}
