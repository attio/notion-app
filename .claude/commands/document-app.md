Produce documentation for this app to be used by the internal Attio team.

# Instructions

1. Read the [documentation template](https://app.notion.com/p/attio/app-name-37d5abd0de3a806ea2bbe0498d80e47a) using the Notion MCP.
2. Search for an existing documentation page for this app in the [Attio Internal Apps Documentation database](https://app.notion.com/p/attio/3765abd0de3a801b8a62efba9dbb0014?v=3765abd0de3a804fa40a000c685888e9). Use the name in package.json as a starting point.
3. Using the template and any existing documentation, determine which features and functionality you need to look for.
4. For each relevant area of functionality, dispatch sub-agents to determine what features the app has.
5. Aggregate the sub-agent results into a single, clean page of documentation and ask the user to review it.
  a. Present the update to the user in the chat in markdown format.
  b. Highlight any differences from existing documentation.
  c. Confirm explicitly before proceeding.
6. When you have confirmed with the user, proceed to update the Notion page.

# Guidance

- You will not be able to verify authentication or MCP docs from this codebase — please confirm with the user how these areas of the app work if they are not already documented. Do not remove exisitng authentication docs unless you have explicitly been prompted to do so.
- You must carefully diff all current functionality against what is documented. For example, there might be a workflow block which has had very minor updates and it is your job to notice such updates.
- Sometimes, there are cases where behavior has been migrated and old/new users might see slightly different things. Call these out explicitly in the documentation. Preserve existing migration notes.

# Audience

- You are writing this documentation for internal users of Attio, primarily the Attio support team. These docs will also be fed into the content for the Attio app store.