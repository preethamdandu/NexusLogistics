/**
 * SECURITY: Input Validation Middleware
 * 
 * Provides schema-based validation for all API inputs using Zod.
 * Follows OWASP best practices:
 * - Type checking
 * - Length limits
 * - Reject unexpected fields
 * - Sanitization
 */

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// ============================================
// SECURITY: Validation Schemas
// ============================================

/**
 * Vehicle ID Schema
 * - Must be alphanumeric with hyphens and underscores
 * - Min 1, Max 100 characters
 * - Prevents injection attacks
 */
export const VehicleIdSchema = z
    .string()
    .min(1, 'Vehicle ID is required')
    .max(100, 'Vehicle ID exceeds maximum length')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Vehicle ID contains invalid characters');

/**
 * Coordinate Schema
 * - Validates latitude (-90 to 90) and longitude (-180 to 180)
 */
export const LatitudeSchema = z.number().min(-90).max(90);
export const LongitudeSchema = z.number().min(-180).max(180);

/**
 * Location Ping Schema (for ingestion)
 * - Strict mode rejects unexpected fields
 */
export const LocationPingSchema = z.object({
    vehicle_id: VehicleIdSchema,
    latitude: LatitudeSchema,
    longitude: LongitudeSchema,
    timestamp: z.number().int().positive().optional(),
}).strict(); // SECURITY: Reject unexpected fields

/**
 * Route Request Schema
 */
export const RouteRequestSchema = z.object({
    vehicle_id: VehicleIdSchema,
    origin: z.object({
        lat: LatitudeSchema,
        lng: LongitudeSchema,
    }),
    destination: z.object({
        lat: LatitudeSchema,
        lng: LongitudeSchema,
    }),
    constraints: z.object({
        avoid_highways: z.boolean().optional(),
        max_duration_minutes: z.number().int().min(1).max(1440).optional(),
    }).optional(),
}).strict();

/**
 * Query Parameters Schema (for GET requests)
 */
export const PaginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});

// ============================================
// SECURITY: Validation Middleware
// ============================================

/**
 * Validates request params (URL parameters)
 */
export const validateParams = (schema: z.ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = schema.safeParse(req.params);
            if (!result.success) {
                return res.status(400).json({
                    error: 'validation_error',
                    message: 'Invalid request parameters',
                    details: result.error.issues.map((e: z.ZodIssue) => ({
                        field: e.path.join('.'),
                        message: e.message,
                    })),
                });
            }
            // Type assertion for validated params
            Object.assign(req.params, result.data);
            next();
        } catch (error) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to parse request parameters',
            });
        }
    };
};

/**
 * Validates request body (POST/PUT data)
 */
export const validateBody = (schema: z.ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = schema.safeParse(req.body);
            if (!result.success) {
                return res.status(400).json({
                    error: 'validation_error',
                    message: 'Invalid request body',
                    details: result.error.issues.map((e: z.ZodIssue) => ({
                        field: e.path.join('.'),
                        message: e.message,
                    })),
                });
            }
            req.body = result.data;
            next();
        } catch (error) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to parse request body',
            });
        }
    };
};

/**
 * Validates query parameters (GET queries)
 */
export const validateQuery = (schema: z.ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = schema.safeParse(req.query);
            if (!result.success) {
                return res.status(400).json({
                    error: 'validation_error',
                    message: 'Invalid query parameters',
                    details: result.error.issues.map((e: z.ZodIssue) => ({
                        field: e.path.join('.'),
                        message: e.message,
                    })),
                });
            }
            Object.assign(req.query, result.data);
            next();
        } catch (error) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Failed to parse query parameters',
            });
        }
    };
};


/**
 * SECURITY: Sanitize string inputs
 * Removes potentially dangerous characters
 */
export const sanitizeString = (input: string): string => {
    return input
        .replace(/[<>'"]/g, '') // Remove HTML/SQL injection chars
        .trim()
        .slice(0, 1000); // Enforce max length
};

/**
 * Param schema for vehicle ID in URL
 */
export const VehicleIdParamSchema = z.object({
    vehicleId: VehicleIdSchema,
});
