package com.nexus.route.graph;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Deterministic A* check on a tiny graph that is not the production SF network.
 */
class AStarTest {

    @Test
    void shortestPath_onChain_returnsOrderedNodeIds() {
        RoadGraph graph = RoadGraph.builder()
                .addNode("n1", 37.7700, -122.4200)
                .addNode("n2", 37.7710, -122.4200)
                .addNode("n3", 37.7720, -122.4200)
                .addNode("n4", 37.7730, -122.4200)
                .addNode("n5", 37.7740, -122.4200)
                .addUndirectedEdge("n1", "n2")
                .addUndirectedEdge("n2", "n3")
                .addUndirectedEdge("n3", "n4")
                .addUndirectedEdge("n4", "n5")
                .build();

        List<String> path = AStar.shortestPath(graph, "n1", "n5");

        assertEquals(List.of("n1", "n2", "n3", "n4", "n5"), path);
    }
}
