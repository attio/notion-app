Draft an Attio app store listing for this app.

# Instructions

1. **Start from the internal documentation.** Using the Notion MCP, find this app's page in the [Attio Internal Apps Documentation database](https://app.notion.com/p/attio/3765abd0de3a801b8a62efba9dbb0014?v=3765abd0de3a804fa40a000c685888e9) (search by the name in `package.json`). This is the source of truth for what the app does.
   - **If there is no documentation page for this app yet, stop and tell the user to run `/document-app` first**, then re-run this command. Do not try to reconstruct the listing from code alone — the internal docs capture authentication, setup and behaviour that aren't all visible in the codebase.
2. Read the app listing guidelines at https://docs.attio.com/share/app-listings (use WebFetch, or the `attio-docs` MCP server). Note every required field and any length limits, tone, and formatting rules.
3. Look at an existing public listing for shape and tone as a reference: https://attio.com/apps/slack
4. Search the codebase to fill any gaps and verify the docs are current. If the code and the internal docs disagree, flag it to the user rather than guessing.
5. Draft each field the guidelines require (typically a tagline, short description, longer description, feature list, required permissions/scopes, supported entry points). Map every claim back to the internal docs or real code — do NOT invent features.
6. Write user-facing copy that follows the guideline's tone and the app's own error-message standards: clean, no jargon, no raw identifiers, benefit-led.
7. Present the full draft listing to the user in the chat as markdown, field by field, formatted so they can copy each field straight into the developer portal. Flag anything you were unsure about and ask the user to confirm or adjust.

# Guidance

- Prefer concrete capabilities ("Create Notion pages from any record") over vague ones ("Powerful integration").
- The user will copy the output into the Attio developer portal themselves — don't try to save or publish it anywhere.
