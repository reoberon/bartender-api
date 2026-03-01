# Bartender Server

Simple HTTP server that accepts drink orders and prepares them and writes logs about incoming requests.

## Starting the server

_No external dependencies are required._

```
npm start
```

`npm run dev` runs the same command (alias for start)

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
- `400` – invalid request data
- `429` – bartender has no free resources

### GET /status

Returns a list of served orders and customers.

- `200` OK – status returned successfully

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

### Generic error responses

The server may also return:

- `404` – endpoint not found
- `405` – method not allowed
- `500` – unhandled server error

These responses are not specific to a single endpoint and apply globally.

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
