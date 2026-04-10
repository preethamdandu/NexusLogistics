package com.nexus.route.consumer;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.test.context.ActiveProfiles;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@EmbeddedKafka(partitions = 1, topics = {"route-updates", "route-requests"})
@ActiveProfiles("test")
class RouteUpdateConsumerIntegrationTest {

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    @MockBean
    private StringRedisTemplate stringRedisTemplate;

    @SuppressWarnings("unchecked")
    private ValueOperations<String, String> valueOps = mock(ValueOperations.class);

    @BeforeEach
    void stubRedis() {
        when(stringRedisTemplate.opsForValue()).thenReturn(valueOps);
    }

    @Test
    void consumesRouteUpdateAndSetsRedisWithTtl() {
        String json = "{\"vehicle_id\":\"veh-x\",\"status\":\"OK\"}";
        kafkaTemplate.send("route-updates", json);

        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() ->
                verify(valueOps).set(eq("route:status:veh-x"), eq(json), eq(Duration.ofSeconds(300))));
    }
}
