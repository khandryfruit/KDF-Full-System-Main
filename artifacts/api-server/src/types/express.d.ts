import "http";

declare module "http" {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}

declare namespace Express {
  interface Request {
    rawBody?: Buffer;
  }
}
