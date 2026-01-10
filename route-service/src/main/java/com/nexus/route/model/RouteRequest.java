package com.nexus.route.model;

import lombok.Data;

@Data
public class RouteRequest {
    private String vehicleId;
    private double currentLat;
    private double currentLong;
}
