import "@esri/calcite-components/components/calcite-shell";
import "@esri/calcite-components/components/calcite-shell-panel";
import "@esri/calcite-components/components/calcite-panel";
import "@esri/calcite-components/components/calcite-select";
import "@esri/calcite-components/components/calcite-option";
import "@esri/calcite-components/components/calcite-alert";
import "@esri/calcite-components/components/calcite-notice";
import "@esri/calcite-components/components/calcite-navigation";
import "@esri/calcite-components/components/calcite-navigation-logo";
import "@esri/calcite-components/components/calcite-navigation-user";

import "@arcgis/map-components/components/arcgis-map";
import "@arcgis/map-components/components/arcgis-editor";
import "@arcgis/map-components/components/arcgis-feature-table";
import "@arcgis/map-components/components/arcgis-layer-list";
import "@arcgis/map-components/components/arcgis-popup";

import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import "./App.css";
import { useRef, useEffect, useState } from "react";
import type Layer from "@arcgis/core/layers/Layer";
import SelectionManager from "@arcgis/core/views/SelectionManager";
import { getUser, signIn } from "./auth";
import type PortalUser from "@arcgis/core/portal/PortalUser";

function App() {
  const mapRef = useRef<HTMLArcgisMapElement>(null);
  const editorRef = useRef<HTMLArcgisEditorElement>(null);
  const featureTableRef = useRef<HTMLArcgisFeatureTableElement>(null);
  const selectionMangerRef = useRef<SelectionManager>(null);
  const [showHistoryAlert, setShowHistoryAlert] = useState(false);
  const [showEditingNotice, setShowEditingNotice] = useState(true);
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
                console.log(u)
            } else {
                signIn(); // redirect to portal login
            }
        });
    }, []);  

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
        <calcite-navigation-user slot="user" full-name={user?.fullName} username={user?.username} thumbnail={user?.thumbnailUrl as string}></calcite-navigation-user>

        </calcite-navigation>
        <calcite-shell-panel slot="panel-start" width="m">
          <calcite-notice open={showEditingNotice} style={{ width: "100%" }}>
            <div slot="message">Select record in table to edit.</div>
          </calcite-notice>
          <arcgis-editor
            ref={editorRef}
            hideCreateFeaturesSection
            hideEditFeaturesSection
            style={{ height: "100%" }}
            hideSettingsMenu
          ></arcgis-editor>
        </calcite-shell-panel>
        <arcgis-map
          ref={mapRef}
          itemId="613f34d97669450bbe3741a2c748dac2"
          onarcgisViewReadyChange={(
            event: HTMLArcgisMapElement["arcgisViewReadyChange"],
          ) => {
            const transactionLayer = event.currentTarget.map?.layers.find(
              (layer: Layer) =>
                layer.title === "Fuel Transaction Raleigh Water Review",
            ) as FeatureLayer | undefined;
            if (!transactionLayer) return;
            transactionLayer.dateFieldsTimeZone = "utc";

            if (
              transactionLayer &&
              editorRef.current &&
              featureTableRef.current
            ) {
              editorRef.current.referenceElement = event.currentTarget;

              editorRef.current.layerInfos = [
                {
                  layer: transactionLayer as FeatureLayer,
                },
              ];
              featureTableRef.current.layer = transactionLayer as FeatureLayer;
              transactionLayer.definitionExpression =
                "compliance = 'Needs Review'";
            }

            selectionMangerRef.current = new SelectionManager({
              view: event.currentTarget.view,
              sources: [transactionLayer as FeatureLayer],
            });
            // if (editorRef.current) {
            //   editorRef.current.selectionManager = selectionMangerRef.current;
            // }
            selectionMangerRef.current.on(
              "selection-change",
              async (selectionEvent) => {
                setShowHistoryAlert(false);
                if (!mapRef.current) return;

                const history = mapRef.current.map?.layers.find(
                  (layer) =>
                    layer.title === "Vehicle Fleet Services Location History",
                ) as FeatureLayer | undefined;
                if (!history) return;

                console.log(editorRef.current?.activeWorkflow?.type);
                if (editorRef.current?.activeWorkflow?.type === "update") {
                  await editorRef.current.cancelWorkflow();
                }

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
                const result =
                  await selectionMangerRef.current?.getSelectedFeatures(
                    [transactionLayer],
                    {
                      outFields: ["OBJECTID", "transaction_date"],
                      returnGeometry: true,
                    },
                    "layer",
                  );
                if (!result || result.length === 0) return;
                setShowEditingNotice(false);
                const data = result[0].data;
                if (!data || data.features.length === 0) return;
                const selectedFeature = data.features.at(0);
                if (!selectedFeature) return;

                const transactionDate =
                  selectedFeature?.getAttribute("transaction_date");

                mapRef.current.view?.goTo({
                  target: selectedFeature,
                  zoom: 15,
                });

                await editorRef.current?.startUpdateWorkflowAtFeatureEdit(
                  selectedFeature,
                );

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
              },
            );
          }}
        >
          <arcgis-layer-list slot="top-right"></arcgis-layer-list>
          <arcgis-popup
            slot="popup"
            onarcgisPropertyChange={(
              event: HTMLArcgisPopupElement["arcgisPropertyChange"],
            ) => {
              if (event.detail.name === "selectedFeature") {
                if (!mapRef.current) return;
                const history = mapRef.current.map?.layers.find(
                  (layer) =>
                    layer.title === "Vehicle Fleet Services Location History",
                );

                if (!history) return;
                if (
                  !event.target.selectedFeature ||
                  event.target.selectedFeature?.layer?.title !==
                    "Fuel Transaction Raleigh Water Review"
                ) {
                  history.visible = false;
                  return;
                }
              }
            }}
          ></arcgis-popup>
          <div slot="bottom-left">
            <calcite-select
              label={""}
              oncalciteSelectChange={(
                event: HTMLCalciteSelectElement["calciteSelectChange"],
              ) => {
                if (!featureTableRef.current?.layer) return;
                (
                  featureTableRef.current.layer as FeatureLayer
                ).definitionExpression = `compliance = '${event.target.value}'`;
              }}
            >
              <calcite-option value="Needs Review">Needs Review</calcite-option>
              <calcite-option value="Compliant">Compliant</calcite-option>
              <calcite-option value="Non-Compliant">
                Non-Compliant
              </calcite-option>
              <calcite-option value="Undetermined">Undetermined</calcite-option>
            </calcite-select>
          </div>
        </arcgis-map>
        <calcite-shell-panel slot="panel-bottom" style={{ height: "300px" }}>
          <arcgis-feature-table
            ref={featureTableRef}
            style={{ height: "100%" }}
            syncViewSelection
            multipleSelectionDisabled
            onarcgisSelectionChange={(
              event: HTMLArcgisFeatureTableElement["arcgisSelectionChange"],
            ) => {
              if (
                !selectionMangerRef.current ||
                !featureTableRef.current?.layer
              )
                return;

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
            }}
          ></arcgis-feature-table>
        </calcite-shell-panel>
        <calcite-alert
          kind="warning"
          open={showHistoryAlert}
          label="Vehicle History Unavailable"
          autoClose
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
