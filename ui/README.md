# In-chat UI (candidate dashboard)

This directory is the compact MCP result surface. It is not the full Recruiter
Workstation. The persistent two-column case workspace lives in `workstation/`.

`candidate-dashboard.html` is the custom UI that renders inside ChatGPT when the
app runs the `show_candidates` tool. It shows one card per candidate (name, title,
location, compensation, status, skill tags) with Brand resume / Vet / Write-up
buttons. It reads the tool's `structuredContent` and treats it as untrusted input;
with no host data it shows a synthetic sample so you can preview it.

## How it connects
- The MCP server (`server/server.py`) exposes the file as a UI resource
  (`ui://tttg/candidate-dashboard`, MIME `text/html;profile=mcp-app`).
- The `show_candidates` tool returns `structuredContent: { candidates: [...] }` and
  links the UI via `_meta.ui.resourceUri` (with `openai/outputTemplate` as the
  compatibility alias). ChatGPT renders the component in an iframe and feeds it the
  data over the MCP Apps bridge.
- Button clicks post a message to the host to run the matching tool (build_pdf,
  vet, write_up).

## Hosting on ChatGPT Sites
Two options:
1. Inline (default): the server returns the HTML directly, no separate hosting.
2. Host on ChatGPT Sites: publish this `ui/` folder as a Site, then point the
   resource at the Site URL instead of inlining. Keep the data flow the same
   (structuredContent over the Apps bridge). GitHub `main` stays the source, so
   update the Site from this file rather than editing it in two places.

## Preview locally
Open `candidate-dashboard.html` in a browser. It renders with the sample data.
Real candidates appear when it runs inside ChatGPT.

## Testing in ChatGPT (your step)
Register the app, connect the MCP server, then in Developer Mode run
`show_candidates` and confirm the dashboard renders. This step happens on the
ChatGPT side and cannot be validated from the repo.
