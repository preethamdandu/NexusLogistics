package com.nexus.route.config;

import com.nexus.route.graph.RoadGraph;
import com.nexus.route.graph.SanFranciscoRoadNetwork;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RouteGraphConfiguration {

    @Bean
    public RoadGraph roadGraph() {
        return SanFranciscoRoadNetwork.defaultGraph();
    }
}
