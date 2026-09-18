declare namespace Cloudflare {
  interface Env {
    /** Durable candidate-case records. Routes return 503 when it is absent. */
    DB?: D1Database;
    /** Immutable source files. Upload and download routes return 503 when absent. */
    BUCKET?: R2Bucket;
    /** Hosted TTTG resume builder endpoint. Defaults to the recruitment-mcp Render URL. */
    RECRUITMENT_MCP_URL?: string;
    /** Access key for the resume builder. A Site secret, never committed. */
    BROKER_TOKEN?: string;
  }
}
