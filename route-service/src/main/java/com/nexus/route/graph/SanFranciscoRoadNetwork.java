package com.nexus.route.graph;

/**
 * Hardcoded San Francisco intersection-style nodes and undirected links for demo routing.
 * Depot: {@link #DEPOT_NODE_ID} (downtown / Market corridor).
 */
public final class SanFranciscoRoadNetwork {

    public static final String DEPOT_NODE_ID = "sf-hub";

    private SanFranciscoRoadNetwork() {
    }

    /** 19 nodes, connected; weights are Haversine meters on each edge. */
    public static RoadGraph defaultGraph() {
        return RoadGraph.builder()
                .addNode(DEPOT_NODE_ID, 37.7849, -122.4084)
                .addNode("fin-district", 37.7946, -122.4014)
                .addNode("embarcadero-n", 37.8055, -122.3957)
                .addNode("north-beach", 37.8060, -122.4100)
                .addNode("russian-hill", 37.8009, -122.4179)
                .addNode("marina", 37.8025, -122.4368)
                .addNode("pacific-heights", 37.7923, -122.4385)
                .addNode("japantown", 37.7850, -122.4297)
                .addNode("hayes", 37.7749, -122.4224)
                .addNode("haight", 37.7700, -122.4469)
                .addNode("inner-sunset", 37.7599, -122.4671)
                .addNode("golden-gate-pk", 37.7699, -122.4765)
                .addNode("richmond", 37.7800, -122.4720)
                .addNode("sunset", 37.7544, -122.4769)
                .addNode("mission-16th", 37.7649, -122.4220)
                .addNode("mission-24th", 37.7522, -122.4184)
                .addNode("potrero", 37.7575, -122.3870)
                .addNode("dogpatch", 37.7542, -122.3890)
                .addNode("bayview", 37.7300, -122.3840)
                .addUndirectedEdge(DEPOT_NODE_ID, "fin-district")
                .addUndirectedEdge(DEPOT_NODE_ID, "hayes")
                .addUndirectedEdge(DEPOT_NODE_ID, "mission-16th")
                .addUndirectedEdge(DEPOT_NODE_ID, "potrero")
                .addUndirectedEdge("fin-district", "embarcadero-n")
                .addUndirectedEdge("fin-district", "north-beach")
                .addUndirectedEdge("embarcadero-n", "north-beach")
                .addUndirectedEdge("embarcadero-n", "marina")
                .addUndirectedEdge("north-beach", "russian-hill")
                .addUndirectedEdge("russian-hill", "marina")
                .addUndirectedEdge("russian-hill", "pacific-heights")
                .addUndirectedEdge("marina", "pacific-heights")
                .addUndirectedEdge("pacific-heights", "japantown")
                .addUndirectedEdge("pacific-heights", "hayes")
                .addUndirectedEdge("japantown", "hayes")
                .addUndirectedEdge("japantown", "haight")
                .addUndirectedEdge("hayes", "haight")
                .addUndirectedEdge("hayes", "mission-16th")
                .addUndirectedEdge("haight", "golden-gate-pk")
                .addUndirectedEdge("haight", "inner-sunset")
                .addUndirectedEdge("haight", "mission-16th")
                .addUndirectedEdge("inner-sunset", "sunset")
                .addUndirectedEdge("inner-sunset", "golden-gate-pk")
                .addUndirectedEdge("golden-gate-pk", "richmond")
                .addUndirectedEdge("richmond", "marina")
                .addUndirectedEdge("mission-16th", "mission-24th")
                .addUndirectedEdge("mission-24th", "bayview")
                .addUndirectedEdge("potrero", "dogpatch")
                .addUndirectedEdge("dogpatch", "bayview")
                .addUndirectedEdge("potrero", "mission-16th")
                .build();
    }
}
