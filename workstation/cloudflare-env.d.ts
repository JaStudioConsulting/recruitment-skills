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
    /** Loopback-only local AI broker. Intentionally unset on the hosted Site. */
    LOCAL_AI_URL?: string;
    /** Per-launch secret shared only by the Workstation server and local AI broker. */
    LOCAL_AI_TOKEN?: string;
    /** Owner email used only when an embedded Sites request omits the stable user ID header. */
    SITE_OWNER_EMAIL?: string;
    /** Existing stable owner ID, preserving access to the owner's stored workspace records. */
    SITE_OWNER_USER_ID?: string;
    /**
     * Standalone mode. Set to an email to run the Workstation as a plain local web
     * app with no ChatGPT hosting in front of it. Every request is then treated as
     * that user. Local use only: never set on a publicly reachable deployment.
     */
    LOCAL_STANDALONE_USER_EMAIL?: string;
  }
}
