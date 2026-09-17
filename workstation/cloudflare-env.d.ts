declare namespace Cloudflare {
  interface Env {
    /** Durable candidate-case records. Routes return 503 when it is absent. */
    DB?: D1Database;
    /** Immutable source files. Upload and download routes return 503 when absent. */
    BUCKET?: R2Bucket;
  }
}
