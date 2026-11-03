"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/Button";
import Badge, { PreviewNotice, type BadgeTone } from "@/components/ui/Badge";
import Dropdown from "@/components/ui/Dropdown";
import SegmentedControl from "@/components/ui/SegmentedControl";
import StatTile from "@/components/ui/StatTile";
import {
  INBOUND,
  INVENTORY,
  OUTBOUND,
  PACKING_LISTS,
  WAREHOUSES,
  type InboundOrder,
  type OutboundOrder,
} from "./sample-data";

type Section = "inventory" | "inbound" | "outbound" | "packing";

const INBOUND_TONE: Record<InboundOrder["status"], BadgeTone> = {
  expected: "gray",
  arrived: "blue",
  receiving: "amber",
  put_away: "indigo",
  closed: "green",
};

const OUTBOUND_TONE: Record<OutboundOrder["status"], BadgeTone> = {
  pending: "gray",
  picking: "amber",
  packed: "indigo",
  dispatched: "green",
  cancelled: "red",
};

function label(status: string): string {
  return status.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

// The table chrome every Storage section shares — header row in the same
// small-caps grey as ShipmentsTable, hover rows, horizontal scroll on narrow screens.
function DataTable({ columns, children }: { columns: { label: string; align?: "right" }[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
            {columns.map((c) => (
              <th key={c.label} className={`px-4 py-2.5 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 [&_td]:px-4 [&_td]:py-2.5 [&_tr:hover]:bg-gray-50">{children}</tbody>
      </table>
    </div>
  );
}

function Toolbar({ placeholder, actions }: { placeholder: string; actions: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
      <input
        type="search"
        placeholder={placeholder}
        className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-1.5 text-sm"
      />
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

function InventorySection() {
  return (
    <>
      <Toolbar
        placeholder="Search SKU, description, location…"
        actions={
          <>
            <Button size="sm">Export CSV</Button>
            <Button size="sm">Stock adjustment</Button>
          </>
        }
      />
      <DataTable
        columns={[
          { label: "SKU" },
          { label: "Description" },
          { label: "Owner" },
          { label: "Location" },
          { label: "On hand", align: "right" },
          { label: "Allocated", align: "right" },
          { label: "Available", align: "right" },
          { label: "CBM", align: "right" },
          { label: "Last movement" },
        ]}
      >
        {INVENTORY.map((item) => {
          const available = item.on_hand - item.allocated;
          return (
            <tr key={item.sku}>
              <td className="font-mono text-xs">{item.sku}</td>
              <td>{item.description}</td>
              <td className="text-gray-600">{item.customer}</td>
              <td className="font-mono text-xs text-gray-600">{item.location}</td>
              <td className="text-right tabular-nums">
                {item.on_hand} <span className="text-xs text-gray-400">{item.unit}</span>
              </td>
              <td className="text-right tabular-nums text-gray-500">{item.allocated}</td>
              <td className="text-right tabular-nums">
                {available === 0 ? <Badge tone="red">0</Badge> : available < 10 ? <Badge tone="amber">{available}</Badge> : available}
              </td>
              <td className="text-right tabular-nums text-gray-500">{(item.cbm * item.on_hand).toFixed(1)}</td>
              <td className="tabular-nums text-gray-500">{item.last_movement}</td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}

function InboundSection() {
  return (
    <>
      <Toolbar
        placeholder="Search ASN, container, customer…"
        actions={
          <>
            <Button size="sm">Import packing list</Button>
            <Button size="sm" variant="primary">
              New inbound
            </Button>
          </>
        }
      />
      <DataTable
        columns={[
          { label: "ASN" },
          { label: "Customer" },
          { label: "Container" },
          { label: "ETA" },
          { label: "Lines", align: "right" },
          { label: "Received", align: "right" },
          { label: "Status" },
        ]}
      >
        {INBOUND.map((o) => {
          const pct = Math.round((o.received_qty / o.expected_qty) * 100);
          return (
            <tr key={o.ref}>
              <td className="font-medium">{o.ref}</td>
              <td>{o.customer}</td>
              <td className="font-mono text-xs text-gray-600">{o.container_no ?? "— (LCL / truck)"}</td>
              <td className="tabular-nums text-gray-600">{o.eta}</td>
              <td className="text-right tabular-nums text-gray-500">{o.lines}</td>
              <td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-gray-900" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 tabular-nums text-gray-600">
                    {o.received_qty}/{o.expected_qty}
                  </span>
                </div>
              </td>
              <td>
                <Badge tone={INBOUND_TONE[o.status]}>{label(o.status)}</Badge>
              </td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}

function OutboundSection() {
  return (
    <>
      <Toolbar
        placeholder="Search order, consignee…"
        actions={
          <>
            <Button size="sm">Print pick list</Button>
            <Button size="sm" variant="primary">
              New outbound
            </Button>
          </>
        }
      />
      <DataTable
        columns={[
          { label: "Order" },
          { label: "Customer" },
          { label: "Consignee" },
          { label: "Ship by" },
          { label: "Lines", align: "right" },
          { label: "Qty", align: "right" },
          { label: "Status" },
        ]}
      >
        {OUTBOUND.map((o) => (
          <tr key={o.ref}>
            <td className="font-medium">{o.ref}</td>
            <td>{o.customer}</td>
            <td className="text-gray-600">{o.consignee}</td>
            <td className="tabular-nums text-gray-600">{o.ship_by}</td>
            <td className="text-right tabular-nums text-gray-500">{o.lines}</td>
            <td className="text-right tabular-nums">{o.qty}</td>
            <td>
              <Badge tone={OUTBOUND_TONE[o.status]}>{label(o.status)}</Badge>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

function PackingSection() {
  return (
    <>
      <Toolbar
        placeholder="Search packing list, order…"
        actions={
          <Button size="sm" variant="primary">
            Upload packing list
          </Button>
        }
      />
      <DataTable
        columns={[
          { label: "Packing list" },
          { label: "Direction" },
          { label: "Customer" },
          { label: "Linked order" },
          { label: "Cartons", align: "right" },
          { label: "Gross kg", align: "right" },
          { label: "CBM", align: "right" },
          { label: "Source" },
          { label: "Created" },
        ]}
      >
        {PACKING_LISTS.map((pl) => (
          <tr key={pl.ref}>
            <td className="font-medium">{pl.ref}</td>
            <td>
              <Badge tone={pl.direction === "inbound" ? "blue" : "purple"}>{label(pl.direction)}</Badge>
            </td>
            <td>{pl.customer}</td>
            <td className="text-gray-600">{pl.linked_order}</td>
            <td className="text-right tabular-nums">{pl.cartons.toLocaleString()}</td>
            <td className="text-right tabular-nums">{pl.gross_kg.toLocaleString()}</td>
            <td className="text-right tabular-nums">{pl.cbm.toFixed(1)}</td>
            <td className="text-gray-500">{pl.source === "upload" ? "AI-extracted" : label(pl.source)}</td>
            <td className="tabular-nums text-gray-500">{pl.created}</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

export default function StoragePage() {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0].id);
  const [section, setSection] = useState<Section>("inventory");

  const totals = useMemo(() => {
    const onHand = INVENTORY.reduce((sum, i) => sum + i.on_hand, 0);
    const cbm = INVENTORY.reduce((sum, i) => sum + i.cbm * i.on_hand, 0);
    const lowStock = INVENTORY.filter((i) => i.on_hand - i.allocated < 10).length;
    const inboundOpen = INBOUND.filter((o) => o.status !== "closed").length;
    const outboundOpen = OUTBOUND.filter((o) => o.status !== "dispatched" && o.status !== "cancelled").length;
    return { onHand, cbm, lowStock, inboundOpen, outboundOpen };
  }, []);

  if (authLoading || !user || !currentWorkspace) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Storage</h1>
          <p className="text-sm text-gray-500">Warehouse stock, inbound receipts, outbound orders and packing lists.</p>
        </div>
        <Dropdown
          value={warehouse}
          onChange={setWarehouse}
          aria-label="Warehouse"
          options={WAREHOUSES.map((w) => ({ value: w.id, label: w.name, meta: w.city }))}
        />
      </div>

      <PreviewNotice>Sample data — warehouse records aren&apos;t stored yet.</PreviewNotice>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="SKUs in stock" value={INVENTORY.length} />
        <StatTile label="Units on hand" value={totals.onHand.toLocaleString()} />
        <StatTile label="Volume used" value={`${totals.cbm.toFixed(0)} m³`} hint="of 2,400 m³ capacity" />
        <StatTile label="Open inbound" value={totals.inboundOpen} hint={`${totals.outboundOpen} open outbound`} />
        <StatTile label="Low / no stock" value={totals.lowStock} hint="available < 10" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <SegmentedControl
            value={section}
            onChange={setSection}
            aria-label="Storage section"
            options={[
              { value: "inventory", label: "Inventory" },
              { value: "inbound", label: "Inbound" },
              { value: "outbound", label: "Outbound" },
              { value: "packing", label: "Packing lists" },
            ]}
          />
        </div>
        {section === "inventory" && <InventorySection />}
        {section === "inbound" && <InboundSection />}
        {section === "outbound" && <OutboundSection />}
        {section === "packing" && <PackingSection />}
      </div>
    </main>
  );
}
