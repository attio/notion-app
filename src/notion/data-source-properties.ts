import { complete, errored, type Result } from "@attio/fetchable";
import type { DataSourceObjectResponse } from "@notionhq/client";
import { buildRichTextItems } from "./helpers";

type DataSourcePropertyConfig = DataSourceObjectResponse["properties"][string];

/**
 * A single property value accepted when creating a Notion page, keyed by property id or name.
 *
 * Note: We derive this locally (rather than from CreatePageParameters) so this module stays free
 * of imports that only resolve server-side.
 */
export type NotionPagePropertyValues = Record<
  string,
  | { title: Array<{ type: "text"; text: { content: string } }> }
  | { rich_text: Array<{ type: "text"; text: { content: string } }> }
  | { number: number }
  | { checkbox: boolean }
  | { url: string }
  | { email: string }
  | { phone_number: string }
  | { date: { start: string } }
  | { select: { id: string } }
  | { status: { id: string } }
  | { multi_select: Array<{ id: string }> }
  | { people: Array<{ object: "user"; id: string }> }
>;

/**
 * The Notion property types our blocks can set when creating a database page.
 *
 * Computed property types (formula, rollup, created_time, etc.) can never be set via the API.
 * Other types (relation, files, place, verification) are out of scope for now.
 */
const SETTABLE_PROPERTY_TYPES = [
  "rich_text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "phone_number",
  "people",
] as const;

export type SettablePropertyType = (typeof SETTABLE_PROPERTY_TYPES)[number];

/** Human-readable labels for each settable property type. */
export const SETTABLE_PROPERTY_TYPE_LABELS: Record<
  SettablePropertyType,
  string
> = {
  rich_text: "Text",
  number: "Number",
  select: "Select",
  multi_select: "Multi-select",
  status: "Status",
  date: "Date",
  checkbox: "Checkbox",
  url: "URL",
  email: "Email",
  phone_number: "Phone",
  people: "Person",
};

function isSettablePropertyType(type: string): type is SettablePropertyType {
  return (SETTABLE_PROPERTY_TYPES as ReadonlyArray<string>).includes(type);
}

/**
 * A data source property that can be offered in the block configurator, with everything the
 * value input needs.
 */
export interface ConfigurableProperty {
  id: string;
  name: string;
  type: SettablePropertyType;
  /** The available choices for select, multi_select and status properties. */
  options: Array<{ id: string; name: string }>;
}

/**
 * Extract the properties of a data source that a workflow block can set on a new page,
 * sorted by name.
 */
export function getConfigurableProperties(
  propertyConfigs: Record<string, DataSourcePropertyConfig>,
): Array<ConfigurableProperty> {
  const configurable: Array<ConfigurableProperty> = [];

  for (const property of Object.values(propertyConfigs)) {
    if (!isSettablePropertyType(property.type)) continue;

    let options: Array<{ id: string; name: string }> = [];

    switch (property.type) {
      case "select":
        options = property.select.options.map((o) => ({
          id: o.id,
          name: o.name,
        }));
        break;
      case "multi_select":
        options = property.multi_select.options.map((o) => ({
          id: o.id,
          name: o.name,
        }));
        break;
      case "status":
        options = property.status.options.map((o) => ({
          id: o.id,
          name: o.name,
        }));
        break;
      default:
        break;
    }

    configurable.push({
      id: property.id,
      name: property.name,
      type: property.type,
      options,
    });
  }

  return configurable.sort((a, b) => a.name.localeCompare(b.name));
}

export interface DatabasePagePropertyInput {
  property_id: string;
  text_value?: string | undefined;
  number_value?: number | undefined;
  boolean_value?: boolean | undefined;
  date_value?: { value: string } | undefined;
  email_value?: { original: string } | undefined;
  phone_value?: { original: string } | undefined;
  option_value?: string | undefined;
  user_value?: string | undefined;
}

/**
 * The option ids a property's `option_value` may hold, or undefined for property types whose
 * values aren't drawn from a fixed option list.
 */
function getOptionIds(
  config: DataSourcePropertyConfig,
): Array<string> | undefined {
  switch (config.type) {
    case "select":
      return config.select.options.map((o) => o.id);
    case "status":
      return config.status.options.map((o) => o.id);
    case "multi_select":
      return config.multi_select.options.map((o) => o.id);
    default:
      return undefined;
  }
}

const MULTI_VALUED_PROPERTY_TYPES = ["multi_select", "people"] as const;

type MultiValuedPropertyType = (typeof MULTI_VALUED_PROPERTY_TYPES)[number];

function isMultiValuedPropertyType(
  type: SettablePropertyType,
): type is MultiValuedPropertyType {
  return (MULTI_VALUED_PROPERTY_TYPES as ReadonlyArray<string>).includes(type);
}

type SingleValuedPropertyType = Exclude<
  SettablePropertyType,
  MultiValuedPropertyType
>;

function buildSingleValue(
  type: SingleValuedPropertyType,
  input: DatabasePagePropertyInput,
): NotionPagePropertyValues[string] | undefined {
  switch (type) {
    case "rich_text":
      return input.text_value === undefined
        ? undefined
        : { rich_text: buildRichTextItems(input.text_value) };
    case "url":
      return input.text_value === undefined
        ? undefined
        : { url: input.text_value };
    case "number":
      return input.number_value === undefined
        ? undefined
        : { number: input.number_value };
    case "checkbox":
      return input.boolean_value === undefined
        ? undefined
        : { checkbox: input.boolean_value };
    case "date":
      return input.date_value === undefined
        ? undefined
        : { date: { start: input.date_value.value } };
    case "email":
      return input.email_value === undefined
        ? undefined
        : { email: input.email_value.original };
    case "phone_number":
      return input.phone_value === undefined
        ? undefined
        : { phone_number: input.phone_value.original };
    case "select":
      return input.option_value === undefined
        ? undefined
        : { select: { id: input.option_value } };
    case "status":
      return input.option_value === undefined
        ? undefined
        : { status: { id: input.option_value } };
    default: {
      const _exhaustive: never = type;
      console.error("[Notion] unsupported property type", _exhaustive);
      return undefined;
    }
  }
}

function buildMultiValue(
  type: MultiValuedPropertyType,
  ids: Array<string>,
): NotionPagePropertyValues[string] {
  switch (type) {
    case "multi_select":
      return { multi_select: ids.map((id) => ({ id })) };
    case "people":
      return { people: ids.map((id) => ({ object: "user" as const, id })) };
    default: {
      const _exhaustive: never = type;
      console.error(
        "[Notion] unsupported multi-valued property type",
        _exhaustive,
      );
      // Unreachable: isMultiValuedPropertyType gates every caller.
      return { multi_select: [] };
    }
  }
}

/**
 * Build the property values payload for creating a page in a data source.
 *
 * The schema is expected to be freshly fetched; inputs that no longer line up (deleted property,
 * changed type) produce an error.
 */
export function buildDatabasePageProperties({
  propertyConfigs,
  title,
  propertyInputs,
}: {
  propertyConfigs: Record<string, DataSourcePropertyConfig>;
  title: string;
  propertyInputs: Array<DatabasePagePropertyInput>;
}): Result<
  NotionPagePropertyValues,
  | { code: "TITLE_PROPERTY_NOT_FOUND" }
  | { code: "PROPERTY_NOT_FOUND"; property_id: string }
  | {
      code: "PROPERTY_TYPE_NOT_SUPPORTED";
      property_name: string;
      property_type: string;
    }
  | { code: "PROPERTY_VALUE_MISSING"; property_name: string }
  | { code: "OPTION_NOT_FOUND"; property_name: string; option_id: string }
> {
  const configs = Object.values(propertyConfigs);

  const titleProperty = configs.find((p) => p.type === "title");
  if (titleProperty === undefined) {
    return errored({ code: "TITLE_PROPERTY_NOT_FOUND" as const });
  }

  const values: NotionPagePropertyValues = {
    [titleProperty.id]: { title: buildRichTextItems(title) },
  };

  // Multi-valued properties take one value per input, so collect their ids across inputs here
  // and turn them into property values after the loop.
  const multiValueIds = new Map<
    string,
    { type: MultiValuedPropertyType; ids: Array<string> }
  >();

  // If the same single-valued property appears in multiple inputs, the last input wins.
  for (const input of propertyInputs) {
    const config = configs.find((p) => p.id === input.property_id);

    if (config === undefined) {
      return errored({
        code: "PROPERTY_NOT_FOUND" as const,
        property_id: input.property_id,
      });
    }

    if (!isSettablePropertyType(config.type)) {
      return errored({
        code: "PROPERTY_TYPE_NOT_SUPPORTED" as const,
        property_name: config.name,
        property_type: config.type,
      });
    }

    // Catch a stale option id — left behind by an input's property being swapped for another
    // option property, or by the option being deleted in Notion — before Notion rejects it
    // with an unhelpful generic error. User ids can't be validated against the schema, so
    // people inputs are left for the Notion API to check.
    const validOptionIds = getOptionIds(config);
    if (
      validOptionIds !== undefined &&
      input.option_value !== undefined &&
      !validOptionIds.includes(input.option_value)
    ) {
      return errored({
        code: "OPTION_NOT_FOUND" as const,
        property_name: config.name,
        option_id: input.option_value,
      });
    }

    if (isMultiValuedPropertyType(config.type)) {
      const id =
        config.type === "people" ? input.user_value : input.option_value;

      if (id === undefined) {
        return errored({
          code: "PROPERTY_VALUE_MISSING" as const,
          property_name: config.name,
        });
      }

      const entry = multiValueIds.get(config.id) ?? {
        type: config.type,
        ids: [],
      };
      entry.ids.push(id);
      multiValueIds.set(config.id, entry);
      continue;
    }

    const value = buildSingleValue(config.type, input);

    if (value === undefined) {
      // The slot for the property's current type is empty. Either the input was never
      // filled in, or the property changed type since the block was configured.
      return errored({
        code: "PROPERTY_VALUE_MISSING" as const,
        property_name: config.name,
      });
    }

    if (config.id in values) {
      // The same single-valued property was set by an earlier input; the last one wins.
      console.warn(
        `[Notion] single-valued property '${config.name}' set by multiple inputs; using the last value`,
      );
    }

    values[config.id] = value;
  }

  for (const [propertyId, { type, ids }] of multiValueIds.entries()) {
    values[propertyId] = buildMultiValue(type, ids);
  }

  return complete(values);
}
