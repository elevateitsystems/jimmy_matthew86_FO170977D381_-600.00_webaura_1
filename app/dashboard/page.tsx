"use client";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { AppShell } from "../../components/layout";
import { ContainerTable, Metrics } from "../../components/shared";
import { ShipmentStatus } from "../../lib/data";
import { useDemoContainers } from "../../lib/container-store";

type View =
  | "All containers"
  | "After dehire"
  | "In transit"
  | "Delivered"
  | ShipmentStatus;
const statuses: ShipmentStatus[] = [
  "At origin",
  "On water",
  "At port",
  "Out to warehouse",
  "After dehire",
  "Delivered",
];

export default function Dashboard() {
  const [containers] = useDemoContainers();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("All containers");
  const counts = useMemo(
    () =>
      Object.fromEntries(
        statuses.map((status) => [
          status,
          containers.filter((c) => c.status === status).length,
        ]),
      ) as Record<ShipmentStatus, number>,
    [containers],
  );
  const rows = useMemo(
    () =>
      containers.filter((c) => {
        const viewMatch =
          view === "All containers" ||
          (view === "In transit" &&
            ["At origin", "On water", "At port", "Out to warehouse"].includes(
              c.status,
            )) ||
          c.status === view;
        return (
          viewMatch &&
          [c.container, c.mbl, c.destination, c.vessel, c.carrier]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())
        );
      }),
    [containers, query, view],
  );
  const tabs: [View, string][] = [
    ["All containers", String(containers.length)],
    ["After dehire", String(counts["After dehire"])],
    [
      "In transit",
      String(
        containers.filter(
          (c) => c.status !== "After dehire" && c.status !== "Delivered",
        ).length,
      ),
    ],
    ["Delivered", String(counts.Delivered)],
  ];
  const filter = statuses.includes(view as ShipmentStatus)
    ? view
    : view === "In transit"
      ? "In transit"
      : "All";
  const selectFilter = (value: string) =>
    setView(
      value === "All"
        ? "All containers"
        : value === "In transit"
          ? "In transit"
          : (value as View),
    );
  return (
    <AppShell>
      <div className="content">
        <div className="title-row">
          <div>
            <h1 className="page-title">CONTAINER TRACKING</h1>
            <p className="page-subtitle">Know where your cargo is, at every step.</p>
            <p className="page-description">
              Live milestones from origin port to final delivery: vessel ETAs, discharge, availability and delays, all in one place.
            </p>
          </div>
          <button className="primary-btn" type="button">
            <SlidersHorizontal size={16} /> Manage views
          </button>
        </div>
        <section className="tracking-banner" aria-label="Container tracking overview">
          <div className="eyebrow">IMPORT OPERATIONS</div>
          <h2>Every container, clearly accounted for.</h2>
          <p>Track milestones, coordinate delivery, and keep your team moving with a single source of shipment truth.</p>
        </section>
        <Metrics counts={counts} onSelect={(status) => setView(status)} />
        <div className="tabs">
          {tabs.map(([label, count]) => (
            <button
              key={label}
              className={`tab ${view === label ? "active" : ""}`}
              onClick={() => setView(label)}
            >
              {label} <span className="muted">{count}</span>
            </button>
          ))}
        </div>
        <div className="panel">
          <div className="toolbar">
            <div className="search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search container, MBL, destination, vessel"
                aria-label="Search containers"
              />
            </div>
            <select
              className="filter"
              value={filter}
              onChange={(e) => selectFilter(e.target.value)}
              aria-label="Filter containers"
            >
              <option>All</option>
              <option>In transit</option>
              {statuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </div>
          <ContainerTable rows={rows} />
        </div>
      </div>
    </AppShell>
  );
}
