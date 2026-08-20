import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShipmentsTable from "./ShipmentsTable";
import type { Shipment, ShipmentListResult, Workspace } from "@/lib/api";

const { useWorkspaceMock, fetchShipmentsMock } = vi.hoisted(() => ({
  useWorkspaceMock: vi.fn(),
  fetchShipmentsMock: vi.fn(),
}));

vi.mock("@/lib/workspace-context", () => ({ useWorkspace: useWorkspaceMock }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, fetchShipments: fetchShipmentsMock };
});

const WORKSPACE: Workspace = { id: 1, name: "My Freight Team", role: "owner" };

function makeShipment(id: number): Shipment {
  return {
    id,
    customer_name: `Customer ${id}`,
    carrier_name: null,
    freight_mode: "FCL",
    origin_port: "Shanghai, CN",
    destination_port: "Los Angeles, US",
    cargo_description: "Electronics components",
    container_no: null,
    weight_kg: 1000,
    freight_cost: 10,
    currency: "USD",
    status: "inquiry",
    shipment_date: "2026-08-01",
    eta: null,
    document_file_url: null,
    created_at: "2026-08-01T00:00:00Z",
  };
}

function pageOf(total: number, offset: number, limit: number): ShipmentListResult {
  const items = Array.from({ length: Math.min(limit, Math.max(0, total - offset)) }, (_, i) =>
    makeShipment(offset + i + 1)
  );
  return { items, total };
}

beforeEach(() => {
  useWorkspaceMock.mockReset();
  fetchShipmentsMock.mockReset();
  useWorkspaceMock.mockReturnValue({ currentWorkspace: WORKSPACE });
  fetchShipmentsMock.mockImplementation(async (_workspaceId: number, limit: number, offset: number) =>
    pageOf(120, offset, limit)
  );
});

describe("ShipmentsTable", () => {
  it("fetches page 0 on mount", async () => {
    render(<ShipmentsTable refreshKey={0} />);

    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());
    expect(fetchShipmentsMock).toHaveBeenCalledWith(1, 50, 0);
  });

  it("does not re-fetch the stale offset when refreshKey changes while on page > 0", async () => {
    const { rerender } = render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeInTheDocument());
    expect(fetchShipmentsMock).toHaveBeenCalledWith(1, 50, 50);

    fetchShipmentsMock.mockClear();

    // Simulate a new shipment being added (bumps refreshKey) while on page 2 —
    // this is exactly the scenario that used to fire one wasted fetch at the
    // stale offset (100) before resetting to page 0.
    rerender(<ShipmentsTable refreshKey={1} />);

    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeInTheDocument());
    expect(fetchShipmentsMock).toHaveBeenCalledTimes(1);
    expect(fetchShipmentsMock).toHaveBeenCalledWith(1, 50, 0);
  });

  it("keeps the previous page's data on screen (not a blank loading state) while fetching the next page", async () => {
    let resolveNextPage!: (value: ShipmentListResult) => void;
    const nextPagePromise = new Promise<ShipmentListResult>((resolve) => {
      resolveNextPage = resolve;
    });
    fetchShipmentsMock
      .mockImplementationOnce(async () => pageOf(120, 0, 50))
      .mockImplementationOnce(() => nextPagePromise);

    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Next"));

    // The page label updates immediately (it's local UI state), but the fetch
    // for page 2's rows is still pending — the table should still show page 1's
    // stale rows (dimmed) rather than the full-page "Loading shipments…" text
    // (which would unmount the table and cause a layout jump).
    await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeInTheDocument());
    expect(screen.getByText("Customer 1")).toBeInTheDocument();
    expect(screen.queryByText("Loading shipments…")).not.toBeInTheDocument();
    expect(screen.getByText("Next")).toBeDisabled();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();

    resolveNextPage(pageOf(120, 50, 50));
    await waitFor(() => expect(screen.getByText("Customer 51")).toBeInTheDocument());
    expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();
  });
});
