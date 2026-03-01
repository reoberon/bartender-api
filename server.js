import http from "node:http";
import process from "node:process";
import fs from "node:fs";

const PORT = 8000;
const DEFAULT_SECONDS_PER_DRINK = 5;
const DEFAULT_SECONDS_TO_DEDUP_ORDER = 30;
const ORDER_STATUS = {
  SERVING: "Serving",
  DONE: "Done",
};

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

class TooManyRequestsError extends Error {
  constructor() {
    super("Too Many Requests");
    this.name = "TooManyRequestsError";
  }
}

class MethodNotAllowedError extends Error {
  constructor() {
    super("Method Not Allowed");
    this.name = "MethodNotAllowedError";
  }
}

class NotFoundError extends Error {
  constructor() {
    super("Not Found");
    this.name = "NotFoundError";
  }
}

class Order {
  static id = 0;
  constructor(body) {
    this.id = Order.id++;
    let order;
    try {
      order = JSON.parse(body);
    } catch {
      throw new ValidationError("Invalid Request Data");
    }

    this.customerId = Number(order.customerId);
    this.drinkType = order.drinkType;

    if (!Number.isInteger(this.customerId)) {
      throw new ValidationError(`Invalid customerId`);
    }

    if (this.drinkType !== "BEER" && this.drinkType !== "DRINK") {
      throw new ValidationError(`Invalid drinkType`);
    }

    this.hash = `${this.customerId}:${this.drinkType}`;
    this.requiredResources = this.drinkType === "BEER" ? 1 : 2;
  }

  serve() {
    const entry = {
      id: this.id,
      customerId: this.customerId,
      drinkType: this.drinkType,
    };

    customers.add(this.customerId);
    ordersState.set(this.hash, { status: ORDER_STATUS.SERVING });
    bartenderResources -= this.requiredResources;

    const finishServing = function () {
      ordersState.set(this.hash, {
        status: ORDER_STATUS.DONE,
        doneAt: Date.now(),
      });
      servedOrders.push(entry);
      bartenderResources += this.requiredResources;
    }.bind(this);

    setTimeout(finishServing, secondsPerDrink * 1000);
  }
}

const secondsPerDrink = getSecondsPerDrink();
const secondsToDedup = getSecondsToDedup();
const customers = new Set();
const ordersState = new Map();
const servedOrders = [];
let bartenderResources = 2;

const logStream = fs.createWriteStream("./log.txt", { flags: "a" });
logStream.on("error", (err) => {
  console.log("could not write log to the file:", err);
});

const server = http.createServer(async (req, res) => {
  let body = "";
  let timestamp = Date.now();

  try {
    const { pathname } = new URL(
      req.url,
      `http://${req.headers.host ?? "localhost"}`,
    );

    if (pathname === "/status") {
      if (req.method === "GET") {
        return getStatus(res);
      }
      throw new MethodNotAllowedError();
    }

    if (pathname === "/order") {
      if (req.method === "POST") {
        body = await payload(req);
        return postOrder(res, body);
      }
      throw new MethodNotAllowedError();
    }

    throw new NotFoundError();
  } catch (error) {
    console.log(error);

    switch (error.name) {
      case MethodNotAllowedError.name:
        return methodNotAllowed(res);

      case NotFoundError.name:
        return notFound(res);

      case ValidationError.name:
        return badRequest(res, error.message);

      case TooManyRequestsError.name:
        return tooManyRequests(res);

      default:
        return serverError(res);
    }
  } finally {
    try {
      log(req, body, timestamp);
    } catch (e) {
      console.log("request logging failed:", e);
    }
    body = "";
  }
});

server.listen(PORT, () => {
  console.log(`Server has started at http://localhost:${PORT}`);
});

setInterval(
  () => {
    const now = Date.now();
    const dedupMs = secondsToDedup * 1000;

    for (const [hash, state] of ordersState) {
      if (state.status === ORDER_STATUS.DONE && now - state.doneAt > dedupMs) {
        ordersState.delete(hash);
      }
    }
  },
  5 * 60 * 1000,
).unref();

function serverError(res) {
  return res
    .writeHead(500, {
      "Content-Type": "text/plain",
    })
    .end("Internal Server Error");
}

function notFound(res) {
  return res
    .writeHead(404, {
      "Content-Type": "text/plain",
    })
    .end("Not Found");
}

function getStatus(res) {
  return res
    .writeHead(200, {
      "Content-Type": "application/json",
    })
    .end(
      JSON.stringify({
        servedOrders,
        customers: Array.from(customers),
      }),
    );
}

function isDuplicate(order) {
  const prevOrder = ordersState.get(order.hash);
  if (!prevOrder) return false;

  const { status, doneAt } = prevOrder;
  if (
    status === ORDER_STATUS.DONE &&
    Date.now() - doneAt > secondsToDedup * 1000
  ) {
    return false;
  }

  return true;
}

function postOrder(res, body) {
  const order = new Order(body);
  if (!isDuplicate(order)) {
    if (bartenderResources - order.requiredResources < 0) {
      throw new TooManyRequestsError();
    }

    order.serve();
  }

  return res
    .writeHead(200, {
      "Content-Type": "text/plain",
    })
    .end("OK");
}

function badRequest(res, message) {
  return res
    .writeHead(400, {
      "Content-Type": "text/plain",
    })
    .end(message ?? "Bad Request");
}

function tooManyRequests(res) {
  return res
    .writeHead(429, {
      "Content-Type": "text/plain",
    })
    .end("Too Many Requests");
}

function methodNotAllowed(res) {
  return res
    .writeHead(405, {
      "content-type": "text/plain",
    })
    .end("Method Not Allowed");
}

function log(req, body, timestamp) {
  const record = `${timestamp}\t${req.method}\t${req.url}\t${body.replaceAll("\n", "\\n")}`;
  console.log(record);
  logStream.write(record + "\n");
}

async function payload(req) {
  return new Promise((res, rej) => {
    let body = "";

    req.on("data", function (chunk) {
      body += chunk;
    });

    req.on("end", () => {
      res(body);
    });
    req.on("error", (err) => rej(err));
  });
}

function getSecondsPerDrink() {
  const cliParam = Number(process.argv[2]);
  if (Number.isFinite(cliParam)) return cliParam;

  const envParam = Number(process.env.SECONDS_PER_DRINK);
  if (Number.isFinite(envParam)) return envParam;

  return DEFAULT_SECONDS_PER_DRINK;
}

function getSecondsToDedup() {
  const envParam = Number(process.env.SECONDS_TO_DEDUP_ORDER);
  if (Number.isFinite(envParam)) return envParam;

  return DEFAULT_SECONDS_TO_DEDUP_ORDER;
}
