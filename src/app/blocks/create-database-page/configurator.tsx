import { isErrored } from "@attio/fetchable";
import { Banner, useAsyncCache, Workflows } from "attio/client";
import {
  provideDataSourceOptions,
  provideUserOptions,
} from "../../../lib/options";
import {
  type ConfigurableProperty,
  getConfigurableProperties,
  SETTABLE_PROPERTY_TYPE_LABELS,
} from "../../../notion/data-source-properties";
import { formatMissingCapabilities } from "../../../notion/helpers";
import { NOTION_CAPABILITY_LABELS } from "../../../notion/types";
import getDataSource from "../../../server-functions/get-data-source.server";
import block from "./block";

/** The config path of one row in the `properties` collection. */
type PropertyRowPath = `properties.${number}`;

/** Help text for multi-valued properties, which take one value per row. */
const MULTI_VALUE_HELP =
  "To set more than one value, add this property again as another row.";

function PropertyValueInput({
  item,
  property,
}: {
  item: PropertyRowPath;
  property: ConfigurableProperty;
}) {
  const {
    CheckboxInput,
    ComboboxInput,
    DateInput,
    EmailAddressInput,
    NumberInput,
    PhoneNumberInput,
    TextInput,
    watch,
  } = Workflows.useConfigurator(block);

  const optionChoices = property.options.map((o) => ({
    value: o.id,
    label: o.name,
  }));

  // A statically configured option id can go stale: the row's property may have been swapped
  // for another option property, or the option deleted in Notion. Warn so the user re-picks
  // rather than hitting an error at run time.
  const optionConfig = watch(`${item}.option_value`);
  const staleOptionBanner =
    optionConfig?.type === "static" &&
    optionConfig.value !== "" &&
    // XXX - Render properly formatted error message when available
    !property.options.some((o) => o.id === optionConfig.value) ? (
      <Banner variant="warning">
        The configured value isn't one of this property's options. Pick an
        option from the list.
      </Banner>
    ) : null;

  switch (property.type) {
    case "rich_text":
    case "url":
      return <TextInput name={`${item}.text_value`} label={property.name} />;
    case "number":
      return (
        <NumberInput name={`${item}.number_value`} label={property.name} />
      );
    case "checkbox":
      return (
        <CheckboxInput name={`${item}.boolean_value`} label={property.name} />
      );
    case "date":
      return <DateInput name={`${item}.date_value`} label={property.name} />;
    case "email":
      return (
        <EmailAddressInput name={`${item}.email_value`} label={property.name} />
      );
    case "phone_number":
      return (
        <PhoneNumberInput name={`${item}.phone_value`} label={property.name} />
      );
    case "select":
    case "status":
      return (
        <>
          <ComboboxInput
            name={`${item}.option_value`}
            label={property.name}
            options={optionChoices}
          />
          {staleOptionBanner}
        </>
      );
    case "multi_select":
      return (
        <>
          <ComboboxInput
            name={`${item}.option_value`}
            label={property.name}
            help={MULTI_VALUE_HELP}
            options={optionChoices}
          />
          {staleOptionBanner}
        </>
      );
    case "people":
      return (
        <ComboboxInput
          name={`${item}.user_value`}
          label={property.name}
          help={MULTI_VALUE_HELP}
          searchPlaceholder="Search Notion users…"
          options={provideUserOptions}
        />
      );
    default: {
      const _exhaustive: never = property.type;
      console.error(
        "[create-database-page] unsupported property type",
        _exhaustive,
      );
      return null;
    }
  }
}

function PropertyInput({
  item,
  properties,
}: {
  item: PropertyRowPath;
  properties: Array<ConfigurableProperty>;
}) {
  const { ComboboxInput, watch } = Workflows.useConfigurator(block);

  const selectedConfig = watch(`${item}.property_id`);

  const selectedId =
    selectedConfig?.type === "static" && selectedConfig.value !== ""
      ? selectedConfig.value
      : undefined;

  const property = properties.find((p) => p.id === selectedId);

  // If we have a selected id but it's not in the list of properties, the row was configured against
  // a different database (or the property was deleted in Notion).
  // We can't clear the config programmatically, so ask the user to fix the row manually.
  const isOrphaned = selectedId !== undefined && property === undefined;

  return (
    <>
      <ComboboxInput
        name={`${item}.property_id`}
        label="Property"
        placeholder="Choose a property…"
        disableVariables
        options={properties.map((p) => ({
          value: p.id,
          label: p.name,
          description: SETTABLE_PROPERTY_TYPE_LABELS[p.type],
        }))}
      />
      {/* XXX - Render badly formatted error message in a <Banner>. Put in the input when we have the right error API. */}
      {isOrphaned && (
        <Banner variant="error">
          This property isn't part of the selected database. Remove this row or
          pick a property from the list.
        </Banner>
      )}
      {property !== undefined && (
        <PropertyValueInput item={item} property={property} />
      )}
    </>
  );
}

function DatabasePropertiesInputs({ dataSourceId }: { dataSourceId: string }) {
  const { CollectionInput } = Workflows.useConfigurator(block);

  // Key by data source so switching databases refetches the schema
  const cacheKey = `data-source-${dataSourceId}`;
  const { values } = useAsyncCache({
    [cacheKey]: [getDataSource, dataSourceId],
  });
  const dataSourceResult = values[cacheKey];

  if (isErrored(dataSourceResult)) {
    let message: string;
    switch (dataSourceResult.error.code) {
      case "NOT_FOUND":
        message =
          "Notion database not found. It may have been deleted or moved.";
        break;
      case "CONFLICT":
        message = "Conflict occurred while reading the Notion database.";
        break;
      case "UNAUTHORIZED":
        message = "Not authorized to read the Notion database.";
        break;
      case "FORBIDDEN":
        if (dataSourceResult.error.missing_capabilities.length === 1) {
          message =
            `Missing capability to read the Notion database: ${NOTION_CAPABILITY_LABELS[dataSourceResult.error.missing_capabilities[0]]}. ` +
            "Please provide your connector with the right capability in the Notion developer portal and try again.";
        } else if (dataSourceResult.error.missing_capabilities.length > 1) {
          const missingCapabilitiesStr = formatMissingCapabilities(
            dataSourceResult.error.missing_capabilities,
          );
          message =
            `Missing capabilities to read the Notion database: ${missingCapabilitiesStr}. ` +
            "Please provide your connector with the right capabilities in the Notion developer portal and try again.";
        } else {
          message =
            "Missing capabilities to read the Notion database." +
            "Please provide your connector with the right capabilities in the Notion developer portal and try again.";
        }
        break;
      case "INVALID_REQUEST":
        message = "Invalid request to Notion API.";
        break;
      case "RATE_LIMITED":
        message =
          "Rate limit error when calling the Notion API. Please try again later.";
        break;
      case "UNEXPECTED_ERROR":
      case "NOTION_API_ERROR":
        message =
          "An unexpected error occurred when reading the Notion database.";
        break;
    }

    // XXX - Render badly formatted error message in a <Banner>. Return to this when we have better error APIs.
    return <Banner variant="error">{message}</Banner>;
  }

  const properties = getConfigurableProperties(
    dataSourceResult.value.properties,
  );

  return (
    <CollectionInput
      name="properties"
      label="Properties"
      addItemLabel="Add property"
      deleteItemTooltip="Remove property"
    >
      {(item) => <PropertyInput item={item} properties={properties} />}
    </CollectionInput>
  );
}

export default Workflows.defineConfigurator(block, () => {
  const { ComboboxInput, TextInput, Outcome, watch } =
    Workflows.useConfigurator(block);

  const dataSourceConfig = watch("data_source_id");

  // The database must be picked statically (variables are disabled on the input).
  // We do this so we can load the database schema here and display the correct properties.
  if (dataSourceConfig?.type === "dynamic") {
    throw new Error("Expected data_source_id to be static");
  }

  const dataSourceId =
    dataSourceConfig && dataSourceConfig.value !== ""
      ? dataSourceConfig.value
      : undefined;

  return (
    <>
      <ComboboxInput
        name="data_source_id"
        label="Database"
        help="The Notion database to create the page in."
        placeholder="Search Notion databases…"
        searchPlaceholder="Search Notion databases…"
        disableVariables
        options={provideDataSourceOptions}
      />
      <TextInput
        name="title"
        label="Title"
        placeholder="Title for the new page"
        help="The title of the new page."
      />
      {dataSourceId !== undefined && (
        <DatabasePropertiesInputs
          key={dataSourceId}
          dataSourceId={dataSourceId}
        />
      )}
      <Outcome
        id="created"
        schema={{
          page_id: Workflows.OutcomeSchema.string(),
          page_url: Workflows.OutcomeSchema.string(),
          title: Workflows.OutcomeSchema.string(),
        }}
      />
    </>
  );
});
