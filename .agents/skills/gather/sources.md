# Sources

How to reach each source in `SKILL.md`. Search them in this order. When none are connected, name Are.na, Cosmos, Pinterest, Mobbin and Pond, then wait.

## What the user gave

| Input | Reach it with |
| --- | --- |
| Open browser tabs | List the tabs and read each page |
| Screenshots in the thread | Read the images |
| Design files | The Figma MCP `get_screenshot` on the linked node |
| Live sites | Open the page. For exact values, hand over to `match` |

## Pond

The user's own library of saves from Instagram, X, Pinterest, Are.na, Cosmos and the web. The Pond choice downloads from https://pond.raphaelsalaja.com and connects under Settings, Model Context Protocol. Connecting an account needs the Pond browser extension, from Browser Extension in the library menu. Pond runs as a local MCP server over stdio:

```json
{
  "mcpServers": {
    "pond": {
      "command": "/Applications/Pond.app/Contents/MacOS/Pond",
      "args": ["--mcp"]
    }
  }
}
```

Copy the exact command from Pond, under Settings, Model Context Protocol. The Search Saves switch under Access must be on.

| Tool | Use |
| --- | --- |
| `search_library` | Search by meaning, such as `{ "query": "website design" }` |
| `search_library` with `source` | Only one platform, such as `arena`, `cosmos`, `pinterest` or `savee` |
| `search_library` with `visual: { "kind": "saveId", "id" }` | Saves that look like one the user likes |
| `query_library` | Filter by keywords, source, folder, tag or `savedSince` |
| `list_folders` | Find the user's own groupings before searching |
| `read_save` | Caption, text in images, note, link and metadata |
| `grep_library` | Exact words in `query` inside captions, notes and image text |
| `open_save`, `apply_filter` | Show a result in the Pond window |

Keep queries to two or three words and run several. A long descriptive query can return nothing while its short parts match.

A save's files sit in `<Library>.pond/items/<id>.info/`, so a board can show the original image. The Local API also saves URLs with `POST /enqueue`, and `created: false` means the URL is already saved. Its token stays in Pond's settings and is never pasted into chat.

## Boards

| Source | Reach it with |
| --- | --- |
| Are.na | The user's channels in the logged-in browser, or the v3 API |
| Cosmos | The user's clusters in the logged-in browser |
| Pinterest | The user's boards in the logged-in browser or with computer use |

Read the user's existing channel and board names before creating one. When the browser is signed out, ask the user to sign in, then read their boards.

## Pattern libraries

| Tool | Use |
| --- | --- |
| Mobbin `search_screens` | Single screens. Set `platform` to `web` for desktop and web work |
| Mobbin `search_flows` | Multi-step flows, such as onboarding or checkout |
| Mobbin `search_sections` | Sections of marketing sites |
| Mobbin `exclude_screen_ids` | Leave out screens already shown when the user asks for more |
| Mobbin `list_collections`, `get_collection_contents` | The user's own saved collections, searched first |
