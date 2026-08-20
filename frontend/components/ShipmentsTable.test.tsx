import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShipmentsTable from "./ShipmentsTable";
import type { Shipment, ShipmentListResult, Workspace } from "@/lib/api";

const {
  useWorkspaceMock,
  fetchShipmentsMock,
  updateShipmentStatusMock,
  deleteShipmentMock,
  bulkUpdateShipmentStatusMock,
  bulkUpdateShipmentDatesMock,
  bulkDeleteShipmentsMock,
} = vi.hoisted(() => ({
  useWorkspaceMock: vi.fn(),
  fetchShipmentsMock: vi.fn(),
  updateShipmentStatusMock: vi.fn(),
  deleteShipmentMock: vi.fn(),
  bulkUpdateShipmentStatusMock: vi.fn(),
  bulkUpdateShipmentDatesMock: vi.fn(),
  bulkDeleteShipmentsMock: vi.fn(),
}));

vi.mock("@/lib/workspace-context", () => ({ useWorkspace: useWorkspaceMock }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchShipments: fetchShipmentsMock,
    updateShipmentStatus: updateShipmentStatusMock,
    deleteShipment: deleteShipmentMock,
    bulkUpdateShipmentStatus: bulkUpdateShipmentStatusMock,
    bulkUpdateShipmentDates: bulkUpdateShipmentDatesMock,
    bulkDeleteShipments: bulkDeleteShipmentsMock,
  };
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
  updateShipmentStatusMock.mockReset();
  deleteShipmentMock.mockReset();
  bulkUpdateShipmentStatusMock.mockReset();
  bulkUpdateShipmentDatesMock.mockReset();
  bulkDeleteShipmentsMock.mockReset();
  useWorkspaceMock.mockReturnValue({ currentWorkspace: WORKSPACE });
  fetchShipmentsMock.mockImplementation(async (_workspaceId: number, limit: number, offset: number) =>
    pageOf(120, offset, limit)
  );
  updateShipmentStatusMock.mockResolvedValue(undefined);
  deleteShipmentMock.mockResolvedValue(undefined);
  bulkUpdateShipmentStatusMock.mockResolvedValue({ updated: 0 });
  bulkUpdateShipmentDatesMock.mockResolvedValue({ updated: 0 });
  bulkDeleteShipmentsMock.mockResolvedValue({ deleted: 0 });
});

describe("ShipmentsTable", () => {
  it("fetches page 0 on mount", async () => {
    render(<ShipmentsTable refreshKey={0} />);

    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());
    expect(fetchShipmentsMock).toHaveBeenCalledWith(1, 50, 0, { q: undefined, status: undefined, sortBy: "shipment_date", sortDir: "desc" });
  });

  it("does not re-fetch the stale offset when refreshKey changes while on page > 0", async () => {
    const { rerender } = render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeInTheDocument());
    expect(fetchShipmentsMock).toHaveBeenCalledWith(1, 50, 50, { q: undefined, status: undefined, sortBy: "shipment_date", sortDir: "desc" });

    fetchShipmentsMock.mockClear();

    // Simulate a new shipment being added (bumps refreshKey) while on page 2 —
    // this is exactly the scenario that used to fire one wasted fetch at the
    // stale offset (100) before resetting to page 0.
    rerender(<ShipmentsTable refreshKey={1} />);

    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeInTheDocument());
    expect(fetchShipmentsMock).toHaveBeenCalledTimes(1);
    expect(fetchShipmentsMock).toHaveBeenCalledWith(1, 50, 0, { q: undefined, status: undefined, sortBy: "shipment_date", sortDir: "desc" });
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

  it("debounces the search box and sends it as the q param, resetting to page 0", async () => {
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeInTheDocument());
    fetchShipmentsMock.mockClear();

    fireEvent.change(screen.getByPlaceholderText("Search customer, port, cargo, container…"), {
      target: { value: "acme" },
    });

    // debounced — no call yet immediately after typing
    expect(fetchShipmentsMock).not.toHaveBeenCalled();

    await waitFor(
      () =>
        expect(fetchShipmentsMock).toHaveBeenCalledWith(1, 50, 0, {
          q: "acme",
          status: undefined,
          sortBy: "shipment_date",
          sortDir: "desc",
        }),
      { timeout: 1000 }
    );
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("toggles a status chip on and off as the status filter param", async () => {
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());
    fetchShipmentsMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "booked" }));
    await waitFor(() =>
      expect(fetchShipmentsMock).toHaveBeenCalledWith(1, 50, 0, {
        q: undefined,
        status: ["booked"],
        sortBy: "shipment_date",
        sortDir: "desc",
      })
    );

    fetchShipmentsMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "booked" }));
    await waitFor(() =>
      expect(fetchShipmentsMock).toHaveBeenCalledWith(1, 50, 0, {
        q: undefined,
        status: undefined,
        sortBy: "shipment_date",
        sortDir: "desc",
      })
    );
  });

  it("sorts by a column on click and reverses direction on a second click", async () => {
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());
    fetchShipmentsMock.mockClear();

    fireEvent.click(screen.getByText("Freight cost"));
    await waitFor(() =>
      expect(fetchShipmentsMock).toHaveBeenCalledWith(1, 50, 0, {
        q: undefined,
        status: undefined,
        sortBy: "cost",
        sortDir: "asc",
      })
    );

    fetchShipmentsMock.mockClear();
    fireEvent.click(screen.getByText("Freight cost"));
    await waitFor(() =>
      expect(fetchShipmentsMock).toHaveBeenCalledWith(1, 50, 0, {
        q: undefined,
        status: undefined,
        sortBy: "cost",
        sortDir: "desc",
      })
    );
  });

  it("changes a row's status inline and refetches", async () => {
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());
    fetchShipmentsMock.mockClear();

    fireEvent.change(screen.getByLabelText("Status for shipment 1"), { target: { value: "booked" } });

    await waitFor(() => expect(updateShipmentStatusMock).toHaveBeenCalledWith(1, "booked", 1));
    await waitFor(() => expect(fetchShipmentsMock).toHaveBeenCalled());
  });

  it("deletes a row after confirmation and refetches", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());
    fetchShipmentsMock.mockClear();

    fireEvent.click(screen.getByLabelText("Delete shipment 1"));

    await waitFor(() => expect(deleteShipmentMock).toHaveBeenCalledWith(1, 1));
    await waitFor(() => expect(fetchShipmentsMock).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });

  it("does not delete when the confirmation is declined", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Delete shipment 1"));

    expect(deleteShipmentMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("tracks row selection and shows a selection count, staying visible at 0", async () => {
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());

    expect(screen.getByText("0 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Select shipment 1"));
    expect(await screen.findByText("1 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Clear selection"));
    expect(await screen.findByText("0 selected")).toBeInTheDocument();
  });

  it("selects all rows on the page via the header checkbox", async () => {
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Select all on page"));
    expect(await screen.findByText("50 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Select all on page"));
    expect(await screen.findByText("0 selected")).toBeInTheDocument();
  });

  it("hides selection, inline status editing, and delete for viewers", async () => {
    useWorkspaceMock.mockReturnValue({ currentWorkspace: { ...WORKSPACE, role: "viewer" } });
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());

    expect(screen.queryByLabelText("Select all on page")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Delete shipment 1")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });

  it("bulk-updates the status of the selected rows and clears selection on success", async () => {
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Select shipment 1"));
    fireEvent.click(screen.getByLabelText("Select shipment 2"));
    await screen.findByText("2 selected");

    fireEvent.change(screen.getByLabelText("Bulk status"), { target: { value: "booked" } });
    fireEvent.click(screen.getByText("Set status"));

    await waitFor(() => expect(bulkUpdateShipmentStatusMock).toHaveBeenCalledWith([1, 2], "booked", 1));
    await waitFor(() => expect(screen.getByText("0 selected")).toBeInTheDocument());
  });

  it("bulk-updates dates for the selected rows, and the button stays disabled with no date set", async () => {
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Select shipment 1"));
    await screen.findByText("1 selected");

    expect(screen.getByText("Set dates")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Bulk shipment date"), { target: { value: "2026-09-01" } });
    expect(screen.getByText("Set dates")).not.toBeDisabled();

    fireEvent.click(screen.getByText("Set dates"));

    await waitFor(() =>
      expect(bulkUpdateShipmentDatesMock).toHaveBeenCalledWith([1], { shipment_date: "2026-09-01", eta: undefined }, 1)
    );
    await waitFor(() => expect(screen.getByText("0 selected")).toBeInTheDocument());
  });

  it("bulk-deletes the selected rows after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Select shipment 1"));
    await screen.findByText("1 selected");

    fireEvent.click(screen.getByText("Delete selected"));

    await waitFor(() => expect(bulkDeleteShipmentsMock).toHaveBeenCalledWith([1], 1));
    await waitFor(() => expect(screen.getByText("0 selected")).toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it("does not bulk-delete when the confirmation is declined", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ShipmentsTable refreshKey={0} />);
    await waitFor(() => expect(screen.getByText("120 shipments")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Select shipment 1"));
    await screen.findByText("1 selected");
    fireEvent.click(screen.getByText("Delete selected"));

    expect(bulkDeleteShipmentsMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
