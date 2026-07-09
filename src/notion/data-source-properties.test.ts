import { isComplete, isErrored } from "@attio/fetchable";
import type { DataSourceObjectResponse } from "@notionhq/client";
import { describe, expect, it } from "vitest";
import {
  buildDatabasePageProperties,
  getConfigurableProperties,
} from "./data-source-properties";

type DataSourceProperties = DataSourceObjectResponse["properties"];

const PROPERTIES: DataSourceProperties = {
  Name: {
    id: "title",
    name: "Name",
    description: null,
    type: "title",
    title: {},
  },
  Notes: {
    id: "notes",
    name: "Notes",
    description: null,
    type: "rich_text",
    rich_text: {},
  },
  Amount: {
    id: "amount",
    name: "Amount",
    description: null,
    type: "number",
    number: { format: "number" },
  },
  Done: {
    id: "done",
    name: "Done",
    description: null,
    type: "checkbox",
    checkbox: {},
  },
  Due: { id: "due", name: "Due", description: null, type: "date", date: {} },
  Email: {
    id: "email",
    name: "Email",
    description: null,
    type: "email",
    email: {},
  },
  Phone: {
    id: "phone",
    name: "Phone",
    description: null,
    type: "phone_number",
    phone_number: {},
  },
  Website: {
    id: "website",
    name: "Website",
    description: null,
    type: "url",
    url: {},
  },
  Stage: {
    id: "stage",
    name: "Stage",
    description: null,
    type: "select",
    select: {
      options: [{ id: "opt-1", name: "New", color: "blue", description: null }],
    },
  },
  Tags: {
    id: "tags",
    name: "Tags",
    description: null,
    type: "multi_select",
    multi_select: {
      options: [
        { id: "tag-1", name: "VIP", color: "red", description: null },
        { id: "tag-2", name: "Churn risk", color: "gray", description: null },
      ],
    },
  },
  Status: {
    id: "status",
    name: "Status",
    description: null,
    type: "status",
    status: {
      options: [
        { id: "st-1", name: "In progress", color: "yellow", description: null },
      ],
      groups: [],
    },
  },
  Owner: {
    id: "owner",
    name: "Owner",
    description: null,
    type: "people",
    people: {},
  },
  Computed: {
    id: "computed",
    name: "Computed",
    description: null,
    type: "formula",
    formula: { expression: "1" },
  },
};

describe(getConfigurableProperties, () => {
  it("excludes the title property and unsupported types", () => {
    const properties = getConfigurableProperties(PROPERTIES);

    expect(properties.map((p) => p.id)).not.toContain("title");
    expect(properties.map((p) => p.id)).not.toContain("computed");
  });

  it("sorts properties by name", () => {
    const names = getConfigurableProperties(PROPERTIES).map((p) => p.name);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("extracts choice options for select-style properties", () => {
    const properties = getConfigurableProperties(PROPERTIES);

    expect(properties.find((p) => p.id === "stage")?.options).toEqual([
      { id: "opt-1", name: "New" },
    ]);
    expect(properties.find((p) => p.id === "tags")?.options).toEqual([
      { id: "tag-1", name: "VIP" },
      { id: "tag-2", name: "Churn risk" },
    ]);
    expect(properties.find((p) => p.id === "status")?.options).toEqual([
      { id: "st-1", name: "In progress" },
    ]);
  });
});

describe(buildDatabasePageProperties, () => {
  it("always sets the title property, keyed by its id", () => {
    const result = buildDatabasePageProperties({
      propertyConfigs: PROPERTIES,
      title: "My page",
      propertyInputs: [],
    });

    expect(isComplete(result)).toBe(true);
    if (isComplete(result)) {
      expect(result.value).toEqual({
        title: { title: [{ type: "text", text: { content: "My page" } }] },
      });
    }
  });

  it("maps each value slot to its Notion property value shape", () => {
    const result = buildDatabasePageProperties({
      propertyConfigs: PROPERTIES,
      title: "Row",
      propertyInputs: [
        { property_id: "notes", text_value: "Some notes" },
        { property_id: "website", text_value: "https://attio.com" },
        { property_id: "amount", number_value: 42 },
        { property_id: "done", boolean_value: true },
        { property_id: "due", date_value: { value: "2026-06-09" } },
        { property_id: "email", email_value: { original: "Team@Example.com" } },
        { property_id: "phone", phone_value: { original: "+1 555 0100" } },
        { property_id: "stage", option_value: "opt-1" },
        { property_id: "status", option_value: "st-1" },
        { property_id: "tags", option_value: "tag-1" },
        { property_id: "owner", user_value: "user-1" },
      ],
    });

    expect(isComplete(result)).toBe(true);
    if (isComplete(result)) {
      expect(result.value).toEqual({
        title: { title: [{ type: "text", text: { content: "Row" } }] },
        notes: {
          rich_text: [{ type: "text", text: { content: "Some notes" } }],
        },
        website: { url: "https://attio.com" },
        amount: { number: 42 },
        done: { checkbox: true },
        due: { date: { start: "2026-06-09" } },
        email: { email: "Team@Example.com" },
        phone: { phone_number: "+1 555 0100" },
        stage: { select: { id: "opt-1" } },
        status: { status: { id: "st-1" } },
        tags: { multi_select: [{ id: "tag-1" }] },
        owner: { people: [{ object: "user", id: "user-1" }] },
      });
    }
  });

  it("errors when the data source has no title property", () => {
    const result = buildDatabasePageProperties({
      propertyConfigs: {
        Notes: {
          id: "notes",
          name: "Notes",
          description: null,
          type: "rich_text",
          rich_text: {},
        },
      },
      title: "Row",
      propertyInputs: [],
    });

    expect(isErrored(result)).toBe(true);
    if (isErrored(result)) {
      expect(result.error.code).toBe("TITLE_PROPERTY_NOT_FOUND");
    }
  });

  it("errors when a configured property no longer exists", () => {
    const result = buildDatabasePageProperties({
      propertyConfigs: PROPERTIES,
      title: "Row",
      propertyInputs: [{ property_id: "deleted-prop", text_value: "x" }],
    });

    expect(isErrored(result)).toBe(true);
    if (isErrored(result)) {
      expect(result.error).toEqual({
        code: "PROPERTY_NOT_FOUND",
        property_id: "deleted-prop",
      });
    }
  });

  it("errors when a configured property changed to an unsupported type", () => {
    const result = buildDatabasePageProperties({
      propertyConfigs: PROPERTIES,
      title: "Row",
      propertyInputs: [{ property_id: "computed", text_value: "x" }],
    });

    expect(isErrored(result)).toBe(true);
    if (isErrored(result)) {
      expect(result.error).toEqual({
        code: "PROPERTY_TYPE_NOT_SUPPORTED",
        property_name: "Computed",
        property_type: "formula",
      });
    }
  });

  it("errors when the slot for the property's current type is empty", () => {
    // The row was configured while "stage" was a select; only option_value is set. If the
    // property were changed to e.g. rich_text, the text_value slot would be empty.
    const result = buildDatabasePageProperties({
      propertyConfigs: PROPERTIES,
      title: "Row",
      propertyInputs: [{ property_id: "notes", option_value: "opt-1" }],
    });

    expect(isErrored(result)).toBe(true);
    if (isErrored(result)) {
      expect(result.error).toEqual({
        code: "PROPERTY_VALUE_MISSING",
        property_name: "Notes",
      });
    }
  });

  it("errors when a multi-valued property row has no value", () => {
    const result = buildDatabasePageProperties({
      propertyConfigs: PROPERTIES,
      title: "Row",
      propertyInputs: [{ property_id: "tags" }],
    });

    expect(isErrored(result)).toBe(true);
    if (isErrored(result)) {
      expect(result.error).toEqual({
        code: "PROPERTY_VALUE_MISSING",
        property_name: "Tags",
      });
    }
  });

  it("errors when an option id isn't one of the property's options", () => {
    // E.g. the row's property was swapped from one select to another, or the option was
    // deleted in Notion after the block was configured.
    const result = buildDatabasePageProperties({
      propertyConfigs: PROPERTIES,
      title: "Row",
      propertyInputs: [{ property_id: "stage", option_value: "tag-1" }],
    });

    expect(isErrored(result)).toBe(true);
    if (isErrored(result)) {
      expect(result.error).toEqual({
        code: "OPTION_NOT_FOUND",
        property_name: "Stage",
        option_id: "tag-1",
      });
    }
  });

  it("errors when a multi-select row holds an unknown option id", () => {
    const result = buildDatabasePageProperties({
      propertyConfigs: PROPERTIES,
      title: "Row",
      propertyInputs: [{ property_id: "tags", option_value: "opt-1" }],
    });

    expect(isErrored(result)).toBe(true);
    if (isErrored(result)) {
      expect(result.error).toEqual({
        code: "OPTION_NOT_FOUND",
        property_name: "Tags",
        option_id: "opt-1",
      });
    }
  });

  it("ignores a stale option_value on a people row, which reads user_value", () => {
    // The row's property was swapped from an option property to a people property: the old
    // option_value sticks around in config, but only the empty user_value slot matters.
    const result = buildDatabasePageProperties({
      propertyConfigs: PROPERTIES,
      title: "Row",
      propertyInputs: [{ property_id: "owner", option_value: "opt-1" }],
    });

    expect(isErrored(result)).toBe(true);
    if (isErrored(result)) {
      expect(result.error).toEqual({
        code: "PROPERTY_VALUE_MISSING",
        property_name: "Owner",
      });
    }
  });

  it("accumulates repeated inputs of a multi-valued property", () => {
    const result = buildDatabasePageProperties({
      propertyConfigs: PROPERTIES,
      title: "Row",
      propertyInputs: [
        { property_id: "tags", option_value: "tag-1" },
        { property_id: "tags", option_value: "tag-2" },
      ],
    });

    expect(isComplete(result)).toBe(true);
    if (isComplete(result)) {
      expect(result.value.tags).toEqual({
        multi_select: [{ id: "tag-1" }, { id: "tag-2" }],
      });
    }
  });

  it("lets the last row win when the same single-valued property is configured twice", () => {
    const result = buildDatabasePageProperties({
      propertyConfigs: PROPERTIES,
      title: "Row",
      propertyInputs: [
        { property_id: "amount", number_value: 1 },
        { property_id: "amount", number_value: 2 },
      ],
    });

    expect(isComplete(result)).toBe(true);
    if (isComplete(result)) {
      expect(result.value.amount).toEqual({ number: 2 });
    }
  });
});
