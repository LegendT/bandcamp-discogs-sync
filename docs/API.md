# BC→DC Sync API Documentation

## Overview

BC→DC Sync provides REST API endpoints for matching Bandcamp purchases with Discogs releases. All endpoints include production-ready error handling, rate limiting, and security features.

## Base URL

```
Development: http://localhost:3000/api
Production: https://your-domain.com/api
```

## Authentication

MVP Phase: No authentication required
Future: Bearer token authentication will be added

## Rate Limiting

- **Global limit**: 30 requests per minute per IP address
- **Discogs API**: 2 requests per second (handled automatically)
- **429 Too Many Requests** returned when limit exceeded

## Common Headers

### Request Headers
```http
Content-Type: application/json
X-Request-ID: <optional-request-id>
```

### Response Headers
```http
X-Request-ID: <request-id>
X-Response-Time: <duration-ms>
Cache-Control: <cache-policy>
```

### Security Headers (all responses)
```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

## Endpoints

### POST /api/match

Match a single Bandcamp purchase with Discogs releases.

#### Request Body

```json
{
  "purchase": {
    "artist": "Radiohead",
    "itemTitle": "OK Computer",
    "itemUrl": "https://radiohead.bandcamp.com/album/ok-computer",
    "purchaseDate": "2024-01-15",
    "format": "Vinyl",
    "rawFormat": "2xLP 12\" Vinyl"
  },
  "options": {
    "includeAlternatives": true,
    "maxAlternatives": 3,
    "thresholds": {
      "autoMatch": 95,
      "review": 70,
      "noMatch": 70
    }
  },
  "metadata": {
    "clientId": "web-app",
    "version": "1.0.0"
  }
}
```

#### Field Validation

- `artist`: Required, 1-300 characters
- `itemTitle`: Required, 1-500 characters  
- `itemUrl`: Required, 1-2000 characters, valid URL
- `purchaseDate`: Required, ISO date string
- `format`: Required, 1-100 characters
- `rawFormat`: Required, 1-100 characters
- `options`: Optional, see schema below
- `metadata`: Optional, for tracking

#### Response (Success)

```json
{
  "success": true,
  "data": {
    "status": "matched",
    "bestMatch": {
      "confidence": 98.5,
      "release": {
        "id": 123456,
        "artist": "Radiohead",
        "title": "OK Computer",
        "format": "LP",
        "year": 1997,
        "imageUrl": "https://img.discogs.com/...",
        "discogsUrl": "https://www.discogs.com/release/123456"
      },
      "matchType": "normalized",
      "breakdown": {
        "artistScore": 100,
        "titleScore": 95,
        "formatBonus": 10
      }
    },
    "alternatives": [
      {
        "confidence": 85.2,
        "release": { ... }
      }
    ],
    "searchQuery": {
      "artist": "radiohead",
      "title": "ok computer",
      "format": "Vinyl"
    }
  },
  "metadata": {
    "requestId": "req_abc123",
    "duration": 145,
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

#### Response (Error)

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "requestId": "req_abc123",
    "timestamp": "2025-01-15T10:30:00Z",
    "fieldErrors": [
      {
        "field": "purchase.artist",
        "message": "Required field missing"
      }
    ]
  }
}
```

#### Status Codes

- `200 OK` - Match successful
- `400 Bad Request` - Invalid input data
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Unexpected error
- `503 Service Unavailable` - Circuit breaker open or Discogs down
- `504 Gateway Timeout` - Match operation timed out

### POST /api/upload

Upload and process a Bandcamp CSV file.

#### Request Body

```json
{
  "csvContent": "artist,item_title,item_url,purchase_date,format\nRadiohead,OK Computer,...",
  "options": {
    "validateOnly": false,
    "skipDuplicates": true
  }
}
```

#### Field Validation

- `csvContent`: Required, max 10MB, valid CSV format
- CSV injection protection applied (formulas prefixed with ')
- Headers must include required columns

#### Response (Success)

```json
{
  "success": true,
  "data": {
    "totalRows": 25,
    "validRows": 23,
    "invalidRows": 2,
    "duplicates": 3,
    "purchases": [
      {
        "artist": "Radiohead",
        "itemTitle": "OK Computer",
        "format": "Vinyl",
        "purchaseDate": "2024-01-15T00:00:00Z"
      }
    ],
    "errors": [
      {
        "row": 5,
        "field": "purchase_date",
        "message": "Invalid date format"
      }
    ]
  },
  "metadata": {
    "requestId": "req_xyz789",
    "duration": 523,
    "timestamp": "2025-01-15T10:31:00Z"
  }
}
```

### GET /api/match

Health check endpoint for monitoring.

#### Response

```json
{
  "status": "healthy",
  "metrics": {
    "totalRequests": 1250,
    "successfulRequests": 1180,
    "failedRequests": 70,
    "averageLatency": 142.5,
    "successRate": 94.4,
    "uptimeMs": 3600000
  },
  "circuitBreaker": {
    "state": "closed",
    "failures": 0,
    "lastFailure": null,
    "nextRetry": null
  },
  "timestamp": "2025-01-15T10:32:00Z",
  "uptime": 3600000
}
```

#### Health Status Values

- `healthy` - Everything working normally (200)
- `degraded` - Circuit breaker open but recovering (503)
- `warming` - No requests processed yet (200)
- `unhealthy` - High failure rate (503)

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "requestId": "req_abc123",
    "timestamp": "2025-01-15T10:30:00Z",
    "errorType": "validation|timeout|circuit_open|rate_limit",
    "fieldErrors": [...],  // For validation errors
    "fallback": {...}      // For circuit breaker errors
  }
}
```

### Error Types

- `validation` - Input data failed validation
- `timeout` - Operation exceeded time limit
- `circuit_open` - Too many failures, circuit breaker activated
- `rate_limit` - Request rate limit exceeded
- `invalid_data` - Data structure or format issues

## Best Practices

1. **Always include error handling** for 4xx and 5xx responses
2. **Respect rate limits** - implement exponential backoff
3. **Use request IDs** for debugging and support
4. **Monitor health endpoint** for service status
5. **Cache successful matches** to reduce API calls

## Example Usage

### JavaScript/TypeScript

```typescript
async function matchAlbum(purchase) {
  try {
    const response = await fetch('/api/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        purchase: {
          artist: purchase.artist,
          itemTitle: purchase.title,
          itemUrl: purchase.url,
          purchaseDate: purchase.date,
          format: purchase.format,
          rawFormat: purchase.rawFormat
        }
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('Match failed:', result.error);
      return null;
    }
    
    return result.data;
  } catch (error) {
    console.error('Request failed:', error);
    return null;
  }
}
```

### cURL

```bash
# Match a single album
curl -X POST http://localhost:3000/api/match \
  -H "Content-Type: application/json" \
  -d '{
    "purchase": {
      "artist": "Radiohead",
      "itemTitle": "OK Computer",
      "itemUrl": "https://radiohead.bandcamp.com/album/ok-computer",
      "purchaseDate": "2024-01-15",
      "format": "Vinyl",
      "rawFormat": "2xLP 12\" Vinyl"
    }
  }'

# Check health status
curl http://localhost:3000/api/match
```

## Future Enhancements

- **Authentication**: Bearer token support
- **Batch matching**: Process multiple albums in one request
- **Webhooks**: Notify when matches complete
- **WebSocket**: Real-time progress updates
- **GraphQL**: Alternative query interface