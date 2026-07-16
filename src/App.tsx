import "@esri/calcite-components/components/calcite-shell";
import "@esri/calcite-components/components/calcite-shell-panel";
import "@esri/calcite-components/components/calcite-panel";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-dropdown-item";
import "@esri/calcite-components/components/calcite-dropdown";
import "@esri/calcite-components/components/calcite-alert";
import "@esri/calcite-components/components/calcite-notice";
import "@esri/calcite-components/components/calcite-navigation";
import "@esri/calcite-components/components/calcite-navigation-logo";
import "@esri/calcite-components/components/calcite-navigation-user";
import "@esri/calcite-components/components/calcite-action-bar";
import "@esri/calcite-components/components/calcite-action";

import "@arcgis/map-components/components/arcgis-map";
import "@arcgis/map-components/components/arcgis-editor";
import "@arcgis/map-components/components/arcgis-feature-table";
import "@arcgis/map-components/components/arcgis-layer-list";
import "@arcgis/map-components/components/arcgis-popup";

import "@arcgis/charts-components/components/arcgis-chart";

import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import "./App.css";
import { useRef, useEffect, useState } from "react";
import type Layer from "@arcgis/core/layers/Layer";
import SelectionManager from "@arcgis/core/views/SelectionManager";
import { getUser, signIn } from "./auth";
import type PortalUser from "@arcgis/core/portal/PortalUser";
import type Graphic from "@arcgis/core/Graphic";
import type { SelectableLayerWithObjectIds } from "@arcgis/core/views/selection/types";
import type { ChartModel, WebChart } from "@arcgis/charts-components";
import { whenOnce } from "@arcgis/core/core/reactiveUtils.js";

function App() {
  /// ref
  const mapRef = useRef<HTMLArcgisMapElement>(null);
  const editorRef = useRef<HTMLArcgisEditorElement>(null);
  const featureTableRef = useRef<HTMLArcgisFeatureTableElement>(null);
  const selectionMangerRef = useRef<SelectionManager>(null);
  const transactionLayerRef = useRef<FeatureLayer | undefined>(undefined);
  const chartRef = useRef<HTMLArcgisChartElement>(null);

  /// state
  const [showHistoryAlert, setShowHistoryAlert] = useState(false);
  const [showEditingNotice, setShowEditingNotice] = useState(true);
  const [selectedAction, setSelectedAction] = useState<"edit" | "statistics">(
    "edit",
  );
  const [statuses, setStatuses] = useState<string[] | undefined>([]);
  const [reasons, setReasons] = useState<string[] | undefined>([]);

  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([
    "Needs Review",
  ]);

  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);

  /// effects
  useEffect(() => {
    if (featureTableRef.current && mapRef.current) {
      featureTableRef.current.referenceElement = mapRef.current;
    }
  }, []);
  const [user, setUser] = useState<PortalUser | null>(null);

  useEffect(() => {
    getUser().then((u: PortalUser | null | undefined) => {
      if (u) {
        setUser(u);
        console.log(u);
      } else {
        signIn(); // redirect to portal login
      }
    });
  }, []);

  // useEffect(() => {
  //   if (featureTableRef.current?.layer) {
  //     (featureTableRef.current.layer as FeatureLayer).definitionExpression =
  //       selectedStatuses.length > 0
  //         ? `compliance in (${selectedStatuses.map((s) => `'${s}'`).join(", ")})`
  //         : "1=1";
  //   }
  // }, [selectedStatuses]);
  useEffect(() => {
    if (featureTableRef.current?.layer) {
      (featureTableRef.current.layer as FeatureLayer).definitionExpression =
        selectedReasons.length > 0 && selectedStatuses.length > 0
          ? `compliance_reason in (${selectedReasons.map((s) => `'${s}'`).join(", ")}) AND compliance in (${selectedStatuses.map((s) => `'${s}'`).join(", ")})`
          : selectedReasons.length > 0 && selectedStatuses.length === 0
            ? `compliance_reason in (${selectedReasons.map((s) => `'${s}'`).join(", ")})`
            : selectedReasons.length === 0 && selectedStatuses.length > 0
              ? `compliance in (${selectedStatuses.map((s) => `'${s}'`).join(", ")})`
              : "compliance is null";
    }
  }, [selectedReasons, selectedStatuses]);
  /// Functions
  const handleDropdownItemSelect = (
    event: HTMLCalciteDropdownItemElement["calciteDropdownItemSelect"],
  ) => {
    const key = event.target.textContent ?? "";
    setSelectedStatuses((prev) => {
      const updated = prev.includes(key)
        ? prev.filter((s) => s !== key)
        : [...prev, key];
      return updated;
    });
  };

  const handleReasonDropdownItemSelect = (
    event: HTMLCalciteDropdownItemElement["calciteDropdownItemSelect"],
  ) => {
    const key = event.target.textContent ?? "";
    setSelectedReasons((prev) => {
      const updated = prev.includes(key)
        ? prev.filter((s) => s !== key)
        : [...prev, key];
      return updated;
    });
  };
  /// Get selected feature from selection manager
  const getSelectedFeature = async (
    selectionManager: SelectionManager,
    transactionLayer: FeatureLayer,
  ) => {
    const result = await selectionManager.getSelectedFeatures(
      [transactionLayer],
      {
        outFields: ["OBJECTID", "transaction_date"],
        returnGeometry: true,
      },
      "layer",
    );
    if (!result || result.length === 0) return;
    const data = result[0].data;
    if (!data || data.features.length === 0) return;
    const selectedFeature = data.features.at(0);
    return selectedFeature;
  };

  /// Set definition expression on history layer to show records
  /// within 15 minutes of transaction date
  const setHistoryDefinitionExpression = async (
    selectedFeature: Graphic,
    history: FeatureLayer,
  ) => {
    const transactionDate = selectedFeature.getAttribute("transaction_date");
    if (transactionDate) {
      const date = new Date(Number(transactionDate));
      const plus15 = new Date(date.getTime() + 15 * 60 * 1000); // add 15 minutes
      const minus15 = new Date(date.getTime() - 15 * 60 * 1000); // subtract 15 minutes
      history.visible = true;
      history.definitionExpression = `recorded_time >= ${minus15.getTime()} AND recorded_time <= ${plus15.getTime()}`;
      const count = await history.queryFeatureCount({
        where: history.definitionExpression,
      });
      console.log(count);
      if (count === 0) {
        setShowHistoryAlert((prev) => !prev);
      }
    }
  };

  /// Cancel active edit workflow if exists
  const cancelEditing = async (editor: HTMLArcgisEditorElement) => {
    if (editor.activeWorkflow?.type === "update") {
      await editor.cancelWorkflow();
    }
  };

  /// Configure selection manager
  /// Go to selected feature and start edit workflow when selection changes
  const configureSelectionManager = (
    selectionManager: SelectionManager,
    history: FeatureLayer,
  ) => {
    selectionManager.on("selection-change", async (selectionEvent) => {
      setShowHistoryAlert(false);
      if (!mapRef.current || !transactionLayerRef.current || !editorRef.current)
        return;

      cancelEditing(editorRef.current);

      const removed = selectionEvent.changes.at(0)?.removed;
      const added =
        selectionEvent.changes.at(0)?.added ??
        selectionEvent.changes.at(0)?.selection;

      if (removed && added?.length === 0) {
        if (removed.length > 0) {
          setShowEditingNotice(true);
          history.visible = false;
          return;
        }
      }

      if (!added) return;
      const selectedFeature = await getSelectedFeature(
        selectionManager,
        transactionLayerRef.current,
      );
      if (!selectedFeature) return;
      setShowEditingNotice(false);

      mapRef.current.view?.goTo({
        target: selectedFeature,
        zoom: 15,
      });

      await editorRef.current.startUpdateWorkflowAtFeatureEdit(selectedFeature);
      setHistoryDefinitionExpression(selectedFeature, history);
    });
  };

  const getStatuses = async (transactionLayer: FeatureLayer) => {
    const field = transactionLayer.fields.find(
      (field) => field.name === "compliance",
    );
    if (!field || !field.domain) return;
    if (field.domain.type !== "coded-value") return;
    const codedValues = field.domain.codedValues.map((cv) => cv.code);
    return codedValues as string[];
  };

  const getReasons = async (transactionLayer: FeatureLayer) => {
    const results = await transactionLayer.queryFeatures({
      where: "compliance_reason is not null",
      outFields: ["compliance_reason"],
      orderByFields: ["compliance_reason"],
      returnDistinctValues: true,
    });
    return results.features.map((feature) =>
      feature.getAttribute("compliance_reason"),
    );
  };
  /// Handle when map view is ready
  const handleViewReadyChange = async () => {
    if (!mapRef.current) return;
    transactionLayerRef.current = mapRef.current.map?.layers.find(
      (layer: Layer) => layer.title === "Fuel Transaction Raleigh Water Review",
    ) as FeatureLayer | undefined;
    const history = mapRef.current.map?.layers.find(
      (layer) => layer.title === "Vehicle Fleet Services Location History",
    ) as FeatureLayer | undefined;
    if (!history) return;
    history.listMode = "hide";
    if (!transactionLayerRef.current) return;

    transactionLayerRef.current.dateFieldsTimeZone = "utc";
    await whenOnce(() => transactionLayerRef.current?.loaded);
    setStatuses(await getStatuses(transactionLayerRef.current));
    setReasons(await getReasons(transactionLayerRef.current));
    if (
      transactionLayerRef.current &&
      editorRef.current &&
      featureTableRef.current &&
      chartRef.current
    ) {
      editorRef.current.referenceElement = mapRef.current;
      chartRef.current.view = mapRef.current?.view;
      chartRef.current.layer = transactionLayerRef.current;
      chartRef.current.model = transactionLayerRef.current.charts?.at(0) as
        | ChartModel
        | WebChart;
      editorRef.current.layerInfos = [
        {
          layer: transactionLayerRef.current as FeatureLayer,
        },
      ];
      featureTableRef.current.layer =
        transactionLayerRef.current as FeatureLayer;
      transactionLayerRef.current.definitionExpression = `compliance in (${selectedStatuses.map((s) => `'${s}'`).join(", ")})`;
    }

    selectionMangerRef.current = new SelectionManager({
      view: mapRef.current.view,
      sources: [transactionLayerRef.current as FeatureLayer],
    });
    configureSelectionManager(selectionMangerRef.current, history);
  };

  /// Handle popup changes to select transaction feature in table
  const handlePopupPropertyChange = (
    event: HTMLArcgisPopupElement["arcgisPropertyChange"],
  ) => {
    if (event.detail.name === "selectedFeature") {
      if (!mapRef.current) return;

      if (
        !event.target.selectedFeature ||
        event.target.selectedFeature?.layer?.title !==
          "Fuel Transaction Raleigh Water Review"
      ) {
        if (!selectionMangerRef.current || !transactionLayerRef.current) return;

        if (selectionMangerRef.current.selections.length === 0) {
          selectionMangerRef.current.add(
            transactionLayerRef.current as SelectableLayerWithObjectIds,
            [event.target.selectedFeature] as Graphic[],
          );
        } else {
          selectionMangerRef.current.replace(
            transactionLayerRef.current as SelectableLayerWithObjectIds,
            [event.target.selectedFeature] as Graphic[],
          );
        }
      }
    }
  };

  ///Handle selection changes in the feature table
  const handleTableSelectionChange = (
    event: HTMLArcgisFeatureTableElement["arcgisSelectionChange"],
  ) => {
    if (!selectionMangerRef.current || !featureTableRef.current?.layer) return;

    const selectedIds = event.detail.added;

    if (selectionMangerRef.current.selections.length === 0) {
      selectionMangerRef.current.add(
        featureTableRef.current.layer as FeatureLayer,
        selectedIds,
      );
    } else {
      selectionMangerRef.current.replace(
        featureTableRef.current.layer as FeatureLayer,
        selectedIds,
      );
    }
  };

  return (
    <>
      <calcite-shell>
        <calcite-navigation slot="header">
          <calcite-navigation-logo
            slot="logo"
            heading="City of Raleigh"
            description="Fuel Transaction Reviewer"
            thumbnail="https://raleighnc.gov/themes/custom/cityofraleigh/logo.svg"
          ></calcite-navigation-logo>
          <calcite-navigation-user
            slot="user"
            full-name={user?.fullName}
            username={user?.username}
            thumbnail={user?.thumbnailUrl as string}
          ></calcite-navigation-user>
        </calcite-navigation>
        <calcite-shell-panel slot="panel-start" width="m">
          <calcite-action-bar slot="action-bar">
            <calcite-action
              text="Edit"
              icon="pencil"
              active={selectedAction === "edit"}
              onClick={() => setSelectedAction("edit")}
            ></calcite-action>
            <calcite-action
              text="Statistics"
              icon="pie-chart"
              active={selectedAction === "statistics"}
              onClick={() => setSelectedAction("statistics")}
            ></calcite-action>
          </calcite-action-bar>

          <calcite-panel
            style={{
              display: selectedAction === "edit" ? "block" : "none",
              maxHeight: "calc(100vh - 65px)",
            }}
          >
            <calcite-notice open={showEditingNotice} style={{ width: "100%" }}>
              <div slot="message">Select record in table to edit.</div>
            </calcite-notice>
            <arcgis-editor
              ref={editorRef}
              hideCreateFeaturesSection
              hideEditFeaturesSection
              hideSettingsMenu
              style={{ maxHeight: "calc(100vh - 65px)" }}
              hideZoomToButton
              onarcgisReady={() => {
                const observer = new MutationObserver(() => {
                  const content = editorRef.current?.shadowRoot?.querySelector(
                    ".esri-widget--panel",
                  );
                  if (content) {
                    (content as HTMLElement).style.maxHeight =
                      "calc(100vh - 65px)";
                    observer.disconnect();
                  }
                });

                if (editorRef.current?.shadowRoot) {
                  observer.observe(editorRef.current.shadowRoot, {
                    childList: true,
                    subtree: true,
                  });
                }
              }}
            ></arcgis-editor>
          </calcite-panel>

          <calcite-panel
            style={{
              display: selectedAction === "statistics" ? "block" : "none",
              height: "100%",
            }}
          >
            <arcgis-chart ref={chartRef}></arcgis-chart>
          </calcite-panel>
        </calcite-shell-panel>
        <arcgis-map
          ref={mapRef}
          itemId="613f34d97669450bbe3741a2c748dac2"
          onarcgisViewReadyChange={handleViewReadyChange}
        >
          <arcgis-layer-list slot="top-right"></arcgis-layer-list>
          <arcgis-popup
            slot="popup"
            onarcgisPropertyChange={handlePopupPropertyChange}
          ></arcgis-popup>
          <div slot="bottom-left">
            <div style={{ display: "flex", flexDirection: "column" }}>
              <calcite-dropdown
                label={"Select compliance status"}
                selection-mode="multiple"
                placement="top-end"
                style={{ marginBottom: "1em" }}
              >
                <calcite-button
                  slot="trigger"
                  appearance="solid"
                  iconEnd="chevron-up"
                >
                  Select compliance status
                </calcite-button>
                {statuses?.map((status) => (
                  <calcite-dropdown-item
                    selected={selectedStatuses.includes(status)}
                    oncalciteDropdownItemSelect={handleDropdownItemSelect}
                    key={status}
                  >
                    {status}
                  </calcite-dropdown-item>
                ))}
              </calcite-dropdown>
              <calcite-dropdown
                label={"Select compliance reasons"}
                selection-mode="multiple"
                placement="top-end"
              >
                <calcite-button
                  slot="trigger"
                  appearance="solid"
                  iconEnd="chevron-up"
                >
                  Select compliance reasons
                </calcite-button>
                {reasons?.map((reason) => (
                  <calcite-dropdown-item
                    selected={selectedReasons.includes(reason)}
                    oncalciteDropdownItemSelect={handleReasonDropdownItemSelect}
                    key={reason}
                  >
                    {reason}
                  </calcite-dropdown-item>
                ))}
              </calcite-dropdown>
            </div>
          </div>
        </arcgis-map>
        <calcite-shell-panel slot="panel-bottom" style={{ height: "300px" }}>
          <arcgis-feature-table
            ref={featureTableRef}
            style={{ height: "100%" }}
            syncViewSelection
            multipleSelectionDisabled
            hideMenuItemsExportSelectionToCsv
            hideMenuItemsRefreshData
            onarcgisSelectionChange={handleTableSelectionChange}
            menuConfig={{
              items: [
                {
                  label: "Export",
                  icon: "download",
                  clickFunction: async () => {
                    if (!featureTableRef.current) return;
                    const oids = await (
                      featureTableRef.current.layer as FeatureLayer
                    ).queryObjectIds();
                    console.log(oids);
                    featureTableRef.current.multipleSelectionDisabled = false;
                    featureTableRef.current.removeEventListener(
                      "arcgisSelectionChange",
                      handleTableSelectionChange,
                    );

                    featureTableRef.current.highlightIds.addMany(oids);
                    await featureTableRef.current.exportSelectionToCSV(false);
                    featureTableRef.current.multipleSelectionDisabled = true;
                    featureTableRef.current.highlightIds.removeAll();
                    featureTableRef.current.addEventListener(
                      "arcgisSelectionChange",
                      handleTableSelectionChange,
                    );
                  },
                },
              ],
            }}
          ></arcgis-feature-table>
        </calcite-shell-panel>
        <calcite-alert
          kind="warning"
          open={showHistoryAlert}
          label="Vehicle History Unavailable"
          autoClose
          autoCloseDuration="fast"
          oncalciteAlertClose={() => setShowHistoryAlert(false)}
        >
          <div slot="title">Vehicle History Unavailable</div>
          <div slot="message">Vehicle history not available for this time.</div>
        </calcite-alert>
      </calcite-shell>
    </>
  );
}

export default App;
