package com.nexus.route.graph;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;

/**
 * A* on a {@link RoadGraph} with Haversine heuristic to the goal node (admissible for these edge weights).
 */
public final class AStar {

    private static final double STALE_F_EPSILON = 1e-3;

    private record QueueEntry(String nodeId, double fScore) implements Comparable<QueueEntry> {
        @Override
        public int compareTo(QueueEntry o) {
            int c = Double.compare(fScore, o.fScore);
            return c != 0 ? c : nodeId.compareTo(o.nodeId);
        }
    }

    private AStar() {
    }

    /**
     * Shortest path (by summed edge meters) from start to goal, or empty if unreachable / unknown nodes.
     * For start == goal, returns a singleton list.
     */
    public static List<String> shortestPath(RoadGraph graph, String startId, String goalId) {
        if (!graph.containsNode(startId) || !graph.containsNode(goalId)) {
            return List.of();
        }
        if (startId.equals(goalId)) {
            return List.of(startId);
        }

        RoadGraph.Node goal = graph.getNode(goalId);

        Map<String, Double> gScore = new HashMap<>();
        Map<String, String> cameFrom = new HashMap<>();
        PriorityQueue<QueueEntry> open = new PriorityQueue<>();

        gScore.put(startId, 0.0);
        RoadGraph.Node start = graph.getNode(startId);
        double hStart = Haversine.meters(start.lat(), start.lng(), goal.lat(), goal.lng());
        open.add(new QueueEntry(startId, hStart));

        while (!open.isEmpty()) {
            QueueEntry entry = open.poll();
            String current = entry.nodeId();
            RoadGraph.Node cn = graph.getNode(current);
            double h = Haversine.meters(cn.lat(), cn.lng(), goal.lat(), goal.lng());
            double gCurrent = gScore.get(current);
            if (entry.fScore() > gCurrent + h + STALE_F_EPSILON) {
                continue;
            }
            if (current.equals(goalId)) {
                return reconstructPath(cameFrom, current, startId);
            }

            for (RoadGraph.Neighbor nb : graph.neighbors(current)) {
                double tentativeG = gCurrent + nb.weightMeters();
                double prevG = gScore.getOrDefault(nb.nodeId(), Double.POSITIVE_INFINITY);
                if (tentativeG < prevG) {
                    cameFrom.put(nb.nodeId(), current);
                    gScore.put(nb.nodeId(), tentativeG);
                    RoadGraph.Node nn = graph.getNode(nb.nodeId());
                    double hn = Haversine.meters(nn.lat(), nn.lng(), goal.lat(), goal.lng());
                    open.add(new QueueEntry(nb.nodeId(), tentativeG + hn));
                }
            }
        }

        return List.of();
    }

    private static List<String> reconstructPath(Map<String, String> cameFrom, String current, String startId) {
        List<String> rev = new ArrayList<>();
        String c = current;
        while (true) {
            rev.add(c);
            if (c.equals(startId)) {
                break;
            }
            c = cameFrom.get(c);
            if (c == null) {
                return List.of();
            }
        }
        Collections.reverse(rev);
        return rev;
    }
}
