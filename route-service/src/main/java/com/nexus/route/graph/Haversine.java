package com.nexus.route.graph;

/**
 * Great-circle distance on a spherical Earth model.
 * <p>
 * We use Haversine (not driving distance) for edge weights and for the A* heuristic. At city scale
 * (~10 km) the error versus a geodesic on the WGS84 ellipsoid is negligible for routing demos, and
 * it keeps the implementation dependency-free and easy to test.
 * </p>
 */
public final class Haversine {

    private static final double EARTH_RADIUS_METERS = 6_371_000.0;

    private Haversine() {
    }

    /** Distance in meters between two WGS84 points (degrees). */
    public static double meters(double lat1, double lng1, double lat2, double lng2) {
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double dPhi = Math.toRadians(lat2 - lat1);
        double dLambda = Math.toRadians(lng2 - lng1);

        double a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2)
                + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_METERS * c;
    }
}
