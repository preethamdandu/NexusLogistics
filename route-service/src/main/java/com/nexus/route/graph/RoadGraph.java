package com.nexus.route.graph;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Undirected road graph: nodes have WGS84 coordinates; each edge weight is the Haversine distance
 * between its endpoints (meters).
 */
public final class RoadGraph {

    public record Node(String id, double lat, double lng) {
        public Node {
            Objects.requireNonNull(id, "id");
        }
    }

    public record Neighbor(String nodeId, double weightMeters) {
    }

    private final Map<String, Node> nodes;
    private final Map<String, List<Neighbor>> adjacency;

    private RoadGraph(Map<String, Node> nodes, Map<String, List<Neighbor>> adjacency) {
        this.nodes = Map.copyOf(nodes);
        Map<String, List<Neighbor>> copy = new HashMap<>();
        for (Map.Entry<String, List<Neighbor>> e : adjacency.entrySet()) {
            copy.put(e.getKey(), List.copyOf(e.getValue()));
        }
        this.adjacency = Collections.unmodifiableMap(copy);
    }

    public Node getNode(String id) {
        Node n = nodes.get(id);
        if (n == null) {
            throw new IllegalArgumentException("Unknown node: " + id);
        }
        return n;
    }

    public Set<String> nodeIds() {
        return nodes.keySet();
    }

    public List<Neighbor> neighbors(String nodeId) {
        return adjacency.getOrDefault(nodeId, List.of());
    }

    public boolean containsNode(String id) {
        return nodes.containsKey(id);
    }

    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private final Map<String, Node> nodes = new LinkedHashMap<>();
        private final List<String[]> edgePairs = new ArrayList<>();

        public Builder addNode(String id, double lat, double lng) {
            nodes.put(id, new Node(id, lat, lng));
            return this;
        }

        /** Undirected edge; weight is Haversine distance between the two node coordinates. */
        public Builder addUndirectedEdge(String a, String b) {
            edgePairs.add(new String[]{a, b});
            return this;
        }

        public RoadGraph build() {
            Map<String, List<Neighbor>> adj = new HashMap<>();
            for (String id : nodes.keySet()) {
                adj.put(id, new ArrayList<>());
            }
            for (String[] pair : edgePairs) {
                Node na = nodes.get(pair[0]);
                Node nb = nodes.get(pair[1]);
                if (na == null || nb == null) {
                    throw new IllegalStateException("Edge references unknown node: " + pair[0] + " — " + pair[1]);
                }
                double w = Haversine.meters(na.lat(), na.lng(), nb.lat(), nb.lng());
                adj.get(na.id()).add(new Neighbor(nb.id(), w));
                adj.get(nb.id()).add(new Neighbor(na.id(), w));
            }
            for (List<Neighbor> list : adj.values()) {
                list.sort((x, y) -> x.nodeId().compareTo(y.nodeId()));
            }
            return new RoadGraph(nodes, adj);
        }
    }
}
