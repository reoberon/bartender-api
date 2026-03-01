# Bartender Server

Simple HTTP server that accepts drink orders and prepares them and whites logs about incoming requests.

## Endpoints

### POST /order

Request body:

```json
{
  "customerId": 1,
  "drinkType": "BEER"
}
```

Returns:

- `200` OK – order accepted (or treated as duplicate)
- `400` – validation error
- `404` – no data for the requested endpoint
- `405` – not allowed method for the requested endpoint
- `429` – bartender has no free resources
- `500` – unhandled error on the server

### GET /status

Returns a list of served orders and customers.

```json
{
  "servedOrders": [
    {
      "id": 1,
      "customerId": 1,
      "drinkType": "BEER"
    }
  ],
  "customers": [1]
}
```

## Handling order deduplication

Since there is no `orderId` in the request, duplicates are detected by the combination of `customerId` and `drinkType`

Rules:

1. If the same order is sent while it is being prepared, it is treated as a duplicate.
2. After the order is completed, duplicates are ignored for `SECONDS_TO_DEDUP_ORDER` seconds.
3. After that time passes, the same order is allowed again.

Default `SECONDS_TO_DEDUP_ORDER` is `30` seconds.
Set it to `0` to disable post-completion deduplication.

## Parameters

### SECONDS_PER_DRINK

Time to prepare one drink.
Default: `5` seconds.
Can be set via `.env` file or as a startup parameter.

### SECONDS_TO_DEDUP_ORDER

Time window (in seconds) after completion when duplicate orders are ignored.
Default: `30` seconds.

## Logging

All incoming requests are logged.

Each log record contains:

- timestamp
- HTTP method
- URL
- request body (if present)

Logs are written to the console and to a local file `log.txt` in the project root directory
